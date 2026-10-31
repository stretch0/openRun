import { existsSync } from 'node:fs';
import { join } from 'node:path';
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
 * file starting at `start_date`. Records every request.
 */
function fakeIntervals(activities: FakeActivity[], athleteId = 'i42') {
  const requests: URL[] = [];
  const state = { status: 200 };
  const fetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(input);
    requests.push(url);
    const auth = new Headers(init?.headers).get('authorization');
    const expected = `Basic ${Buffer.from(`API_KEY:${KEY}`).toString('base64')}`;
    if (auth !== expected) return new Response('Unauthorized', { status: 401 });
    if (state.status !== 200) return new Response('', { status: state.status });
    const path = url.pathname;
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

  it('removes runs that intervals.icu now lists as another sport', async () => {
    const activities: FakeActivity[] = [
      { id: 'i1', start_date: daysAgo(3), type: 'Run', name: 'Not a run' },
      { id: 'i2', start_date: daysAgo(2), type: 'Run', name: 'Deleted' },
      { id: 'i3', start_date: daysAgo(1), type: 'Run', name: 'Real run' },
    ];
    const t = await connected(activities);
    await importFit(t.app, t.cookie, { start: new Date(daysAgo(6)) });
    await t.sync();
    const byName = async () =>
      Object.fromEntries((await t.runs()).map((r) => [r.name, r]));
    const before = await byName();
    expect(Object.keys(before)).toHaveLength(4);

    // Shared with a club before anyone noticed it was a ride.
    const club = (await (
      await send(t.app, t.cookie, 'POST', '/api/clubs', {
        name: 'Parkside',
        timezone: 'Europe/London',
      })
    ).json()) as { id: string };
    await send(t.app, t.cookie, 'PATCH', `/api/clubs/${club.id}/me`, {
      shareLevel: 'summaries',
    });
    const ride = before['Not a run'];
    await send(
      t.app,
      t.cookie,
      'PUT',
      `/api/activities/${ride.id}/clubs/${club.id}`,
    );
    expect(t.db.select().from(schema.clubShare).all()).toHaveLength(1);
    const [{ originalFile }] = t.db
      .select({ originalFile: schema.activity.originalFile })
      .from(schema.activity)
      .where(eq(schema.activity.id, ride.id))
      .all();
    expect(
      originalFile && existsSync(join(t.config.dataDir, originalFile)),
    ).toBe(true);

    // A run deleted by hand stays deleted, whatever it becomes.
    await send(
      t.app,
      t.cookie,
      'DELETE',
      `/api/activities/${before.Deleted.id}`,
    );
    activities[0].type = 'Ride';
    activities[1].type = 'Ride';
    const connection = await t.sync();
    expect(connection.syncs[0]).toMatchObject({ imported: 0, removed: 1 });
    // The upload and the real run are left alone.
    expect(await t.runs()).toHaveLength(2);
    expect(await byName()).toHaveProperty('Real run');
    expect(await byName()).not.toHaveProperty('Not a run');
    expect(t.db.select().from(schema.clubShare).all()).toEqual([]);
    expect(
      t.db
        .select()
        .from(schema.personalBest)
        .where(eq(schema.personalBest.activityId, ride.id))
        .all(),
    ).toEqual([]);
    expect(existsSync(join(t.config.dataDir, originalFile ?? ''))).toBe(false);

    // Nothing more to remove next time.
    expect((await t.sync()).syncs[0]).toMatchObject({ removed: 0 });

    // Turned back into a run: imported again. The one deleted by hand isn't.
    activities[0].type = 'Run';
    activities[1].type = 'Run';
    expect((await t.sync()).syncs[0]).toMatchObject({ imported: 1 });
    expect(await byName()).toHaveProperty('Not a run');
    expect(await byName()).not.toHaveProperty('Deleted');
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
