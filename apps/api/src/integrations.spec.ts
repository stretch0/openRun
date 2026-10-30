import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fitRun } from '@openrun/activity-files/testing';
import { schema } from '@openrun/db';
import {
  activityListSchema,
  activitySchema,
  integrationsSchema,
} from '@openrun/schemas';
import { BATCH, syncAll } from './integrations/sync.js';
import { get, importFit, send, setup, signUp } from './test-utils.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const KEY = 'good-api-key-123';
const TOKEN = 'good-oauth-token-456';
const DAY = 86_400_000;

type FakeActivity = {
  id: string;
  start_date: string;
  type?: string;
  name?: string;
  source?: string;
  file_type?: string | null;
  device_name?: string;
};

/**
 * A pretend intervals.icu: one athlete, whose activities each have a FIT
 * file starting at `start_date`. Takes the API key or, after an OAuth
 * sign-in, the access token. Records every request.
 */
function fakeIntervals(activities: FakeActivity[], athleteId = 'i42') {
  const requests: URL[] = [];
  const state = {
    status: 200,
    /** The PKCE challenge the code was issued for. */
    codeChallenge: '',
    tokenRequests: [] as URLSearchParams[],
    revoked: [] as string[],
  };
  const fetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(input);
    requests.push(url);
    const path = url.pathname;
    if (path === '/api/oauth/token') {
      const form = new URLSearchParams(String(init?.body));
      state.tokenRequests.push(form);
      const challenge = createHash('sha256')
        .update(form.get('code_verifier') ?? '')
        .digest('base64url');
      if (
        form.get('client_id') !== 'openrun-test' ||
        form.get('client_secret') !== 'shh' ||
        form.get('code') !== 'good-code' ||
        challenge !== state.codeChallenge
      ) {
        return new Response('Bad request', { status: 400 });
      }
      return Response.json({
        token_type: 'Bearer',
        access_token: TOKEN,
        scope: 'ACTIVITY:READ',
        athlete: { id: athleteId, name: 'Ann Runner' },
      });
    }
    const auth = new Headers(init?.headers).get('authorization');
    const key = `Basic ${Buffer.from(`API_KEY:${KEY}`).toString('base64')}`;
    if (auth !== key && auth !== `Bearer ${TOKEN}`) {
      return new Response('Unauthorized', { status: 401 });
    }
    if (state.status !== 200) return new Response('', { status: state.status });
    if (path === '/api/v1/disconnect-app' && init?.method === 'DELETE') {
      state.revoked.push(auth);
      return new Response(null, { status: 200 });
    }
    if (path === '/api/v1/athlete/0') {
      return Response.json({ id: athleteId, name: 'Ann Runner' });
    }
    if (path === '/api/v1/athlete/0/activities') {
      const oldest = url.searchParams.get('oldest') ?? '';
      const newest = url.searchParams.get('newest') ?? '';
      return Response.json(
        activities
          .filter((a) => {
            const d = a.start_date.slice(0, 10);
            return d >= oldest && d <= newest;
          })
          .map((a) =>
            a.source === 'STRAVA'
              ? {
                  id: a.id,
                  start_date_local: a.start_date.slice(0, 19),
                  source: 'STRAVA',
                  _note: 'STRAVA activities are not available via the API',
                }
              : { file_type: 'fit', ...a },
          ),
      );
    }
    const match = path.match(/^\/api\/v1\/activity\/([^/]+)\/(file|fit-file)$/);
    const activity = activities.find((a) => a.id === match?.[1]);
    if (activity) {
      return new Response(
        gzipSync(fitRun({ start: new Date(activity.start_date) })),
      );
    }
    return new Response('Not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fetch);
  return { requests, state };
}

const daysAgo = (n: number, hour = 7) => {
  const d = new Date(Date.now() - n * DAY);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString().replace('.000', '');
};

const dayOf = (iso: string) => iso.slice(0, 10);

async function connected(activities: FakeActivity[], syncFrom = 30) {
  const t = setup();
  const { cookie } = await signUp(t.app, 'ann@example.com');
  const fake = fakeIntervals(activities);
  const res = await send(t.app, cookie, 'PUT', '/api/integrations/intervals', {
    apiKey: KEY,
    syncFrom: dayOf(daysAgo(syncFrom)),
  });
  expect(res.status).toBe(200);
  const sync = async () => {
    const r = await send(
      t.app,
      cookie,
      'POST',
      '/api/integrations/intervals/sync',
    );
    expect(r.status).toBe(200);
    const { connection } = integrationsSchema.parse(await r.json()).intervals;
    if (!connection) throw new Error('Not connected');
    return connection;
  };
  const runs = async () =>
    activityListSchema.parse(
      await (await get(t.app, '/api/activities?limit=100', cookie)).json(),
    ).items;
  return { ...t, cookie, fake, sync, runs };
}

describe('intervals.icu sync', () => {
  it('checks the key before saving it, and keeps it encrypted', async () => {
    const t = setup();
    const { cookie } = await signUp(t.app, 'ann@example.com');
    fakeIntervals([]);
    const path = '/api/integrations/intervals';

    const bad = await send(t.app, cookie, 'PUT', path, {
      apiKey: 'wrong-key-000',
      syncFrom: '2026-01-01',
    });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toMatch(
      /didn't accept that API key/,
    );

    const ok = await send(t.app, cookie, 'PUT', path, {
      apiKey: KEY,
      syncFrom: '2026-01-01',
    });
    const body = integrationsSchema.parse(await ok.json());
    expect(body.intervals).toMatchObject({
      available: true,
      connection: {
        accountId: 'i42',
        accountName: 'Ann Runner',
        syncFrom: '2026-01-01',
        status: 'ok',
        importedCount: 0,
      },
    });
    expect(JSON.stringify(body)).not.toContain(KEY);
    const row = t.db.select().from(schema.integration).get();
    expect(row?.credentials).not.toContain(KEY);
  });

  it('imports runs as originals, skipping other sports, Strava and duplicates', async () => {
    const t = await connected([
      {
        id: 'i1',
        start_date: daysAgo(3),
        type: 'Run',
        name: 'Canal loop',
        source: 'GARMIN_CONNECT',
        device_name: 'Forerunner 265',
      },
      { id: 'i2', start_date: daysAgo(2), type: 'Ride', name: 'Commute' },
      { id: 'i3', start_date: daysAgo(1), type: 'Run', source: 'STRAVA' },
      // Too old for the chosen start date.
      { id: 'i4', start_date: daysAgo(60), type: 'Run' },
      // A run already uploaded by hand.
      { id: 'i5', start_date: daysAgo(5), type: 'Run' },
      { id: 'i6', start_date: daysAgo(1, 18), type: 'TrailRun' },
    ]);
    await importFit(t.app, t.cookie, { start: new Date(daysAgo(5)) });

    const connection = await t.sync();
    expect(connection.syncs[0]).toMatchObject({
      imported: 2,
      duplicates: 1,
      failed: 0,
      unavailable: 1,
      more: false,
      error: null,
    });
    expect(connection.importedCount).toBe(2);

    const runs = await t.runs();
    expect(runs.map((r) => [r.name, r.source, r.device])).toEqual([
      [expect.any(String), 'intervals', null],
      ['Canal loop', 'intervals', 'Garmin Forerunner 265'],
      [expect.any(String), 'file', null],
    ]);
    const canal = runs.find((r) => r.name === 'Canal loop');
    expect(canal).toBeDefined();
    const detail = activitySchema.parse(
      await (await get(t.app, `/api/activities/${canal?.id}`, t.cookie)).json(),
    );
    expect(detail).toMatchObject({ hasFile: true, hasStream: true });
    expect(detail.bestEfforts.length).toBeGreaterThan(0);
    // Asked for originals, not intervals.icu's rebuilt files.
    expect(
      t.fake.requests.filter((u) => u.pathname.endsWith('/file')),
    ).toHaveLength(3);

    // Nothing is fetched twice, and a deleted run stays deleted.
    await send(t.app, t.cookie, 'DELETE', `/api/activities/${canal?.id}`);
    const before = t.fake.requests.length;
    const again = await t.sync();
    expect(again.syncs[0]).toMatchObject({ imported: 0, unavailable: 0 });
    expect(t.fake.requests.length - before).toBe(1);
    expect(await t.runs()).toHaveLength(2);
  });

  it('backfills in batches, oldest first', async () => {
    const many = Array.from({ length: BATCH + 5 }, (_, i) => ({
      id: `i${i}`,
      start_date: daysAgo(BATCH + 5 - i),
      type: 'Run',
    }));
    const t = await connected(many, 60);
    const first = await t.sync();
    expect(first.syncs[0]).toMatchObject({ imported: BATCH, more: true });
    const second = await t.sync();
    expect(second.syncs[0]).toMatchObject({ imported: 5, more: false });
    expect(second.importedCount).toBe(BATCH + 5);
    expect(second.syncs).toHaveLength(2);
  });

  it('picks up older runs that reach intervals.icu late', async () => {
    const activities: FakeActivity[] = [
      { id: 'i1', start_date: daysAgo(1), type: 'Run' },
    ];
    const t = await connected(activities, 90);
    await syncAll(t.db, t.config);
    expect(await t.runs()).toHaveLength(1);

    // Garmin sends watch history in chunks after the first sync.
    activities.push({ id: 'i2', start_date: daysAgo(40), type: 'Run' });
    await syncAll(t.db, t.config);
    expect(await t.runs()).toHaveLength(2);

    activities.push({ id: 'i3', start_date: daysAgo(80), type: 'Run' });
    await t.sync();
    expect(await t.runs()).toHaveLength(3);
  });

  it('stops syncing when the key is revoked, until a new key is pasted', async () => {
    const t = await connected([
      { id: 'i1', start_date: daysAgo(1), type: 'Run' },
    ]);
    t.fake.state.status = 401;
    const failed = await t.sync();
    expect(failed).toMatchObject({
      status: 'needs_key',
      lastError: "intervals.icu didn't accept the API key",
    });

    // The scheduler leaves it alone.
    const before = t.fake.requests.length;
    await syncAll(t.db, t.config);
    expect(t.fake.requests.length).toBe(before);

    t.fake.state.status = 200;
    await send(t.app, t.cookie, 'PUT', '/api/integrations/intervals', {
      apiKey: KEY,
      syncFrom: dayOf(daysAgo(30)),
    });
    await syncAll(t.db, t.config);
    expect(await t.runs()).toHaveLength(1);
  });

  it('records a server hiccup and tries again next time', async () => {
    const t = await connected([
      { id: 'i1', start_date: daysAgo(1), type: 'Run' },
    ]);
    t.fake.state.status = 503;
    expect(await t.sync()).toMatchObject({
      status: 'error',
      lastError: 'intervals.icu answered 503',
    });
    t.fake.state.status = 200;
    expect(await t.sync()).toMatchObject({ status: 'ok', importedCount: 1 });
  });

  it('keeps imported runs after disconnecting, and one account per person', async () => {
    const t = await connected([
      { id: 'i1', start_date: daysAgo(1), type: 'Run' },
    ]);
    await t.sync();

    const { cookie: bob } = await signUp(t.app, 'bob@example.com');
    const taken = await send(t.app, bob, 'PUT', '/api/integrations/intervals', {
      apiKey: KEY,
      syncFrom: '2026-01-01',
    });
    expect(taken.status).toBe(409);

    const res = await send(
      t.app,
      t.cookie,
      'DELETE',
      '/api/integrations/intervals',
    );
    expect(
      integrationsSchema.parse(await res.json()).intervals.connection,
    ).toBeNull();
    expect(await t.runs()).toHaveLength(1);
    expect(t.db.select().from(schema.integrationItem).all()).toEqual([]);
  });

  it('can be turned off by the server', async () => {
    const t = setup({ INTERVALS_URL: '' });
    const { cookie } = await signUp(t.app, 'ann@example.com');
    const res = await get(t.app, '/api/integrations', cookie);
    expect(integrationsSchema.parse(await res.json()).intervals).toEqual({
      available: false,
      oauth: false,
      connection: null,
    });
    const put = await send(
      t.app,
      cookie,
      'PUT',
      '/api/integrations/intervals',
      {
        apiKey: KEY,
        syncFrom: '2026-01-01',
      },
    );
    expect(put.status).toBe(400);
  });

  it('credits the watch on runs shared with a club', async () => {
    const t = await connected([
      {
        id: 'i1',
        start_date: daysAgo(1),
        type: 'Run',
        source: 'GARMIN_CONNECT',
        device_name: 'Garmin Forerunner 965',
      },
    ]);
    await t.sync();
    const [run] = await t.runs();
    const club = (await (
      await send(t.app, t.cookie, 'POST', '/api/clubs', {
        name: 'Parkside',
        timezone: 'Europe/London',
      })
    ).json()) as { id: string };
    await send(t.app, t.cookie, 'PATCH', `/api/clubs/${club.id}/me`, {
      shareLevel: 'summaries',
    });
    await send(
      t.app,
      t.cookie,
      'PUT',
      `/api/activities/${run.id}/clubs/${club.id}`,
    );
    const share = t.db
      .select()
      .from(schema.clubShare)
      .where(eq(schema.clubShare.clubId, club.id))
      .get();
    expect(share?.device).toBe('Garmin Forerunner 965');
  });
});

describe('intervals.icu sign-in (OAuth)', () => {
  const OAUTH_ENV = {
    INTERVALS_CLIENT_ID: 'openrun-test',
    INTERVALS_CLIENT_SECRET: 'shh',
  };

  /**
   * Starts the sign-in like the browser would and returns where intervals.icu
   * would send the member back, plus the cookie that remembers it.
   */
  async function startSignIn(
    t: ReturnType<typeof setup>,
    cookie: string,
    fake: ReturnType<typeof fakeIntervals>,
    query = '?syncFrom=2026-03-01',
  ) {
    const res = await get(
      t.app,
      `/api/integrations/intervals/oauth/start${query}`,
      cookie,
    );
    expect(res.status).toBe(302);
    const to = new URL(res.headers.get('location') ?? '');
    fake.state.codeChallenge = to.searchParams.get('code_challenge') ?? '';
    const pending =
      res.headers.get('set-cookie')?.split(';')[0] ?? 'missing-cookie';
    return { to, state: to.searchParams.get('state') ?? '', pending };
  }

  async function comeBack(
    t: ReturnType<typeof setup>,
    cookie: string,
    pending: string,
    query: string,
  ) {
    const res = await get(
      t.app,
      `/api/integrations/intervals/oauth/callback?${query}`,
      `${cookie}; ${pending}`,
    );
    expect(res.status).toBe(302);
    return res.headers.get('location');
  }

  it('is offered only when the server has an OAuth app', async () => {
    const plain = setup();
    const { cookie } = await signUp(plain.app, 'ann@example.com');
    const res = await get(plain.app, '/api/integrations', cookie);
    expect(integrationsSchema.parse(await res.json()).intervals.oauth).toBe(
      false,
    );
    const start = await get(
      plain.app,
      '/api/integrations/intervals/oauth/start',
      cookie,
    );
    expect(start.status).toBe(404);

    const t = setup(OAUTH_ENV);
    const { cookie: c2 } = await signUp(t.app, 'ann@example.com');
    const res2 = await get(t.app, '/api/integrations', c2);
    expect(integrationsSchema.parse(await res2.json()).intervals.oauth).toBe(
      true,
    );
  });

  it('connects with a token and syncs with it', async () => {
    const t = setup(OAUTH_ENV);
    const { cookie } = await signUp(t.app, 'ann@example.com');
    const fake = fakeIntervals([
      { id: 'i1', start_date: daysAgo(1), type: 'Run' },
    ]);
    const { to, state, pending } = await startSignIn(t, cookie, fake);
    expect(`${to.origin}${to.pathname}`).toBe(
      'https://intervals.icu/oauth/authorize',
    );
    expect(Object.fromEntries(to.searchParams)).toMatchObject({
      client_id: 'openrun-test',
      redirect_uri:
        'http://localhost:3000/api/integrations/intervals/oauth/callback',
      scope: 'ACTIVITY:READ',
      code_challenge_method: 'S256',
    });
    expect(pending).toMatch(/^openrun_intervals_oauth=/);

    const back = await comeBack(
      t,
      cookie,
      pending,
      `code=good-code&state=${state}`,
    );
    expect(back).toBe('/settings?intervals=connected');

    // The first sync runs in the background after the redirect.
    await vi.waitFor(async () => {
      const res = await get(t.app, '/api/integrations', cookie);
      const { connection } = integrationsSchema.parse(
        await res.json(),
      ).intervals;
      expect(connection).toMatchObject({
        accountId: 'i42',
        authMethod: 'oauth',
        syncFrom: '2026-03-01',
        syncing: false,
        importedCount: 1,
      });
    });
    const row = t.db.select().from(schema.integration).get();
    expect(row?.credentials).not.toContain(TOKEN);

    // Disconnecting revokes the token.
    await send(t.app, cookie, 'DELETE', '/api/integrations/intervals');
    expect(fake.state.revoked).toEqual([`Bearer ${TOKEN}`]);
  });

  it('sends the member back with a reason when it goes wrong', async () => {
    const t = setup(OAUTH_ENV);
    const { cookie } = await signUp(t.app, 'ann@example.com');
    const fake = fakeIntervals([]);

    // They said no on intervals.icu.
    let s = await startSignIn(t, cookie, fake);
    expect(
      await comeBack(
        t,
        cookie,
        s.pending,
        `error=access_denied&state=${s.state}`,
      ),
    ).toBe('/settings?intervals=denied');

    // A forged or stale state, or no cookie at all.
    s = await startSignIn(t, cookie, fake);
    expect(
      await comeBack(t, cookie, s.pending, 'code=good-code&state=someone-else'),
    ).toBe('/settings?intervals=expired');
    expect(
      await comeBack(t, cookie, '', `code=good-code&state=${s.state}`),
    ).toBe('/settings?intervals=expired');

    // Someone else's sign-in can't be finished in this member's browser.
    s = await startSignIn(t, cookie, fake);
    const { cookie: bob } = await signUp(t.app, 'bob@example.com');
    expect(
      await comeBack(t, bob, s.pending, `code=good-code&state=${s.state}`),
    ).toBe('/settings?intervals=expired');

    // intervals.icu won't swap the code.
    s = await startSignIn(t, cookie, fake);
    expect(
      await comeBack(t, cookie, s.pending, `code=bad-code&state=${s.state}`),
    ).toBe('/settings?intervals=failed');

    expect(t.db.select().from(schema.integration).all()).toEqual([]);
  });

  it('keeps one account per person, and lets go of the spare token', async () => {
    const t = setup(OAUTH_ENV);
    const { cookie: ann } = await signUp(t.app, 'ann@example.com');
    const fake = fakeIntervals([]);
    await send(t.app, ann, 'PUT', '/api/integrations/intervals', {
      apiKey: KEY,
      syncFrom: '2026-01-01',
    });

    const { cookie: bob } = await signUp(t.app, 'bob@example.com');
    const s = await startSignIn(t, bob, fake);
    expect(
      await comeBack(t, bob, s.pending, `code=good-code&state=${s.state}`),
    ).toBe('/settings?intervals=taken');
    expect(fake.state.revoked).toEqual([`Bearer ${TOKEN}`]);
  });

  it('switches a key connection to OAuth, keeping its start date and runs', async () => {
    const t = setup(OAUTH_ENV);
    const { cookie } = await signUp(t.app, 'ann@example.com');
    const fake = fakeIntervals([
      { id: 'i1', start_date: daysAgo(1), type: 'Run' },
    ]);
    await send(t.app, cookie, 'PUT', '/api/integrations/intervals', {
      apiKey: KEY,
      syncFrom: '2026-01-01',
    });
    await send(t.app, cookie, 'POST', '/api/integrations/intervals/sync');

    // Reconnecting from Settings sends no start date.
    const s = await startSignIn(t, cookie, fake, '');
    await comeBack(t, cookie, s.pending, `code=good-code&state=${s.state}`);
    await vi.waitFor(async () => {
      const res = await get(t.app, '/api/integrations', cookie);
      expect(
        integrationsSchema.parse(await res.json()).intervals.connection,
      ).toMatchObject({
        authMethod: 'oauth',
        syncFrom: '2026-01-01',
        importedCount: 1,
        syncing: false,
      });
    });
  });
});
