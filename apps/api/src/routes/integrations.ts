import { zValidator } from '@hono/zod-validator';
import { and, eq } from 'drizzle-orm';
import { type Context, Hono } from 'hono';
import { schema } from '@openrun/db';
import {
  type Integrations,
  connectIntervalsSchema,
  updateIntervalsSchema,
} from '@openrun/schemas';
import { type AuthedEnv, requireUser } from '../context.js';
import { IntervalsError, getAthlete } from '../integrations/intervals.js';
import {
  describeConnection,
  isSyncing,
  syncIntegration,
} from '../integrations/sync.js';
import { encryptSecret } from '../secrets.js';

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
      connection: row ? describeConnection(c.get('db'), row) : null,
    },
  };
}

const startOfDay = (day: string) => new Date(`${day}T00:00:00Z`);

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
      athlete = await getAthlete(config.intervalsUrl, apiKey);
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
    if (taken && taken.userId !== userId) {
      return c.json(
        {
          error:
            'That intervals.icu account is already connected to someone else on this server.',
        },
        409,
      );
    }

    const existing = findIntervals(c);
    const values = {
      accountId: athlete.id,
      accountName: athlete.name ?? null,
      credentials: encryptSecret(config.authSecret, apiKey),
      syncFrom: startOfDay(syncFrom),
      status: 'ok' as const,
      lastError: null,
    };
    if (existing && existing.accountId === athlete.id) {
      const earlier = values.syncFrom < existing.syncFrom;
      db.update(schema.integration)
        .set({ ...values, ...(earlier ? { scannedAt: null } : {}) })
        .where(eq(schema.integration.id, existing.id))
        .run();
    } else {
      // A different account starts afresh.
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
    return c.json(overview(c));
  })

  /** Changes how far back to import; going further back fetches the gap. */
  .patch('/intervals', zValidator('json', updateIntervalsSchema), (c) => {
    const row = findIntervals(c);
    if (!row) return c.json({ error: 'Not connected' }, 404);
    const syncFrom = startOfDay(c.req.valid('json').syncFrom);
    c.get('db')
      .update(schema.integration)
      .set({
        syncFrom,
        ...(syncFrom < row.syncFrom ? { scannedAt: null } : {}),
      })
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
    // Asked for by the member, so look at everything, not just recent days.
    await syncIntegration(c.get('db'), c.get('config'), row, new Date(), {
      full: true,
    });
    return c.json(overview(c));
  })

  /** Disconnects. Runs already imported stay in the log. */
  .delete('/intervals', (c) => {
    const row = findIntervals(c);
    if (row) {
      c.get('db')
        .delete(schema.integration)
        .where(eq(schema.integration.id, row.id))
        .run();
    }
    return c.json(overview(c));
  });
