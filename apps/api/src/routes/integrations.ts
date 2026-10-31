import { createHash, randomBytes } from 'node:crypto';
import { zValidator } from '@hono/zod-validator';
import { and, eq } from 'drizzle-orm';
import { type Context, Hono } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import { z } from 'zod';
import { schema } from '@openrun/db';
import {
  type Integrations,
  type IntervalsOAuthResult,
  connectIntervalsSchema,
  startIntervalsOAuthSchema,
  updateIntervalsSchema,
} from '@openrun/schemas';
import { type AuthedEnv, requireUser } from '../context.js';
import {
  type IntervalsAuth,
  IntervalsError,
  authorizeUrl,
  disconnectApp,
  exchangeCode,
  getAthlete,
} from '../integrations/intervals.js';
import {
  describeConnection,
  isSyncing,
  syncIntegration,
} from '../integrations/sync.js';
import { decryptSecret, encryptSecret } from '../secrets.js';

type Ctx = Context<AuthedEnv>;

function findIntervals(c: Ctx) {
  return c
    .get('db')
    .select()
    .from(schema.integration)
    .where(
      and(
        eq(schema.integration.userId, c.get('user').id),
        eq(schema.integration.provider, 'intervals'),
      ),
    )
    .get();
}

function overview(c: Ctx): Integrations {
  const row = findIntervals(c);
  return {
    intervals: {
      available: c.get('config').intervalsUrl !== null,
      oauth: c.get('config').intervalsOAuth !== null,
      connection: row ? describeConnection(c.get('db'), row) : null,
    },
  };
}

const startOfDay = (day: string) => new Date(`${day}T00:00:00Z`);

/**
 * Saves the member's connection, replacing any earlier one. A different
 * intervals.icu account starts afresh. Returns false if that account is
 * already connected to someone else here.
 */
function saveConnection(
  c: Ctx,
  athlete: { id: string; name?: string | null },
  auth: IntervalsAuth,
  syncFrom: Date | null,
) {
  const db = c.get('db');
  const userId = c.get('user').id;
  const taken = db
    .select({ userId: schema.integration.userId })
    .from(schema.integration)
    .where(
      and(
        eq(schema.integration.provider, 'intervals'),
        eq(schema.integration.accountId, athlete.id),
      ),
    )
    .get();
  if (taken && taken.userId !== userId) return false;

  const existing = findIntervals(c);
  const values = {
    accountId: athlete.id,
    accountName: athlete.name ?? null,
    credentials: encryptSecret(c.get('config').authSecret, auth.secret),
    authMethod: auth.method,
    syncFrom:
      syncFrom ??
      existing?.syncFrom ??
      new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)),
    status: 'ok' as const,
    lastError: null,
  };
  if (existing && existing.accountId === athlete.id) {
    db.update(schema.integration)
      .set(values)
      .where(eq(schema.integration.id, existing.id))
      .run();
  } else {
    db.transaction((tx) => {
      if (existing) {
        tx.delete(schema.integration)
          .where(eq(schema.integration.id, existing.id))
          .run();
      }
      tx.insert(schema.integration)
        .values({ ...values, userId, provider: 'intervals' })
        .run();
    });
  }
  return true;
}

const TAKEN =
  'That intervals.icu account is already connected to someone else on this server.';

/** Remembers an OAuth sign-in in progress between leaving and coming back. */
const OAUTH_COOKIE = 'openrun_intervals_oauth';
const OAUTH_PATH = '/api/integrations/intervals/oauth';
const oauthStateSchema = z.object({
  state: z.string(),
  verifier: z.string(),
  userId: z.string(),
  syncFrom: z.iso.date().nullable(),
});

const base64url = (b: Buffer) => b.toString('base64url');
const redirectUri = (c: Ctx) =>
  `${c.get('config').origin}${OAUTH_PATH}/callback`;
const backToSettings = (c: Ctx, result: IntervalsOAuthResult) =>
  c.redirect(`/settings?intervals=${result}`);

export const integrationRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .get('/', (c) => c.json(overview(c)))

  /** Connects (or replaces the key of) the member's intervals.icu account. */
  .put('/intervals', zValidator('json', connectIntervalsSchema), async (c) => {
    const config = c.get('config');
    if (!config.intervalsUrl) {
      return c.json({ error: 'intervals.icu sync is turned off here' }, 400);
    }
    const { apiKey, syncFrom } = c.req.valid('json');
    let athlete;
    try {
      athlete = await getAthlete(config.intervalsUrl, {
        method: 'api_key',
        secret: apiKey,
      });
    } catch (e) {
      if (e instanceof IntervalsError) {
        return c.json(
          {
            error: e.badKey
              ? "intervals.icu didn't accept that API key. Copy it again from Settings → Developer Settings on intervals.icu."
              : `${e.message}. Try again in a minute.`,
          },
          400,
        );
      }
      throw e;
    }

    if (
      !saveConnection(
        c,
        athlete,
        { method: 'api_key', secret: apiKey },
        startOfDay(syncFrom),
      )
    ) {
      return c.json({ error: TAKEN }, 409);
    }
    return c.json(overview(c));
  })

  /**
   * Sends the member to intervals.icu to let openRun read their runs. The web
   * app navigates here rather than fetching it.
   */
  .get(
    '/intervals/oauth/start',
    zValidator('query', startIntervalsOAuthSchema),
    async (c) => {
      const config = c.get('config');
      if (!config.intervalsUrl || !config.intervalsOAuth) {
        return c.json(
          { error: 'intervals.icu sign-in is turned off here' },
          404,
        );
      }
      const state = base64url(randomBytes(16));
      const verifier = base64url(randomBytes(32));
      await setSignedCookie(
        c,
        OAUTH_COOKIE,
        JSON.stringify({
          state,
          verifier,
          userId: c.get('user').id,
          syncFrom: c.req.valid('query').syncFrom ?? null,
        }),
        config.authSecret,
        {
          path: OAUTH_PATH,
          httpOnly: true,
          // Sent when intervals.icu redirects back, a top-level navigation.
          sameSite: 'Lax',
          secure: config.origin.startsWith('https:'),
          maxAge: 600,
        },
      );
      return c.redirect(
        authorizeUrl(config.intervalsUrl, config.intervalsOAuth, {
          redirectUri: redirectUri(c),
          state,
          codeChallenge: base64url(
            createHash('sha256').update(verifier).digest(),
          ),
        }),
      );
    },
  )

  /** intervals.icu sends the member back here, then on to Settings. */
  .get('/intervals/oauth/callback', async (c) => {
    const config = c.get('config');
    if (!config.intervalsUrl || !config.intervalsOAuth) {
      return backToSettings(c, 'failed');
    }
    const cookie = await getSignedCookie(c, config.authSecret, OAUTH_COOKIE);
    deleteCookie(c, OAUTH_COOKIE, { path: OAUTH_PATH });
    let pending;
    try {
      pending = oauthStateSchema.parse(JSON.parse(cookie || 'null'));
    } catch {
      return backToSettings(c, 'expired');
    }
    const { code, state, error } = c.req.query();
    if (pending.state !== state || pending.userId !== c.get('user').id) {
      return backToSettings(c, 'expired');
    }
    if (error || !code) return backToSettings(c, 'denied');

    let token;
    try {
      token = await exchangeCode(
        config.intervalsUrl,
        config.intervalsOAuth,
        code,
        pending.verifier,
      );
    } catch (e) {
      if (!(e instanceof IntervalsError)) {
        console.error('intervals.icu sign-in failed', e);
      }
      return backToSettings(c, 'failed');
    }
    const saved = saveConnection(
      c,
      token.athlete,
      { method: 'oauth', secret: token.accessToken },
      pending.syncFrom ? startOfDay(pending.syncFrom) : null,
    );
    if (!saved) {
      // Let go of the token, so intervals.icu doesn't list openRun for it.
      await disconnectApp(config.intervalsUrl, token.accessToken).catch(
        () => undefined,
      );
      return backToSettings(c, 'taken');
    }
    const row = findIntervals(c);
    // The first sync carries on after the redirect; Settings shows progress.
    if (row) void syncIntegration(c.get('db'), config, row);
    return backToSettings(c, 'connected');
  })

  /** Changes how far back to import; going further back fetches the gap. */
  .patch('/intervals', zValidator('json', updateIntervalsSchema), (c) => {
    const row = findIntervals(c);
    if (!row) return c.json({ error: 'Not connected' }, 404);
    c.get('db')
      .update(schema.integration)
      .set({ syncFrom: startOfDay(c.req.valid('json').syncFrom) })
      .where(eq(schema.integration.id, row.id))
      .run();
    return c.json(overview(c));
  })

  .post('/intervals/sync', async (c) => {
    const row = findIntervals(c);
    if (!row) return c.json({ error: 'Not connected' }, 404);
    if (isSyncing(row.id)) {
      return c.json({ error: 'Already syncing; give it a moment' }, 409);
    }
    await syncIntegration(c.get('db'), c.get('config'), row);
    return c.json(overview(c));
  })

  /**
   * Disconnects. Runs already imported stay in the log. An OAuth token is
   * revoked too, if intervals.icu can be reached.
   */
  .delete('/intervals', async (c) => {
    const row = findIntervals(c);
    const config = c.get('config');
    if (row?.authMethod === 'oauth' && config.intervalsUrl) {
      const token = decryptSecret(config.authSecret, row.credentials);
      if (token) {
        await disconnectApp(config.intervalsUrl, token).catch(() => undefined);
      }
    }
    if (row) {
      c.get('db')
        .delete(schema.integration)
        .where(eq(schema.integration.id, row.id))
        .run();
    }
    return c.json(overview(c));
  });
