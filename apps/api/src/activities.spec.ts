import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fitRun, gpxRun } from '@openrun/activity-files/testing';
import {
  type ActivityList,
  activitySchema,
  activityStreamSchema,
  type ImportResult,
  type PersonalBest,
} from '@openrun/schemas';
import { type App, get, origin, setup, signUp } from './test-utils.js';

async function upload(app: App, cookie: string, files: File[]) {
  const form = new FormData();
  for (const f of files) form.append('files', f);
  const res = await app.request('/api/activities/import', {
    method: 'POST',
    headers: { cookie, origin },
    body: form,
  });
  return { res, results: (await res.json()) as ImportResult[] };
}

function sendJson(
  app: App,
  cookie: string,
  method: string,
  path: string,
  body: unknown,
) {
  return app.request(path, {
    method,
    headers: { 'content-type': 'application/json', cookie, origin },
    body: JSON.stringify(body),
  });
}

const fitFile = (name = 'run.fit', opts?: Parameters<typeof fitRun>[0]) =>
  new File([fitRun(opts)], name);

describe('activities', () => {
  it('imports several files, keeping the originals', async () => {
    const { app, config } = setup();
    const { cookie } = await signUp(app, 'runner@example.com');

    const { res, results } = await upload(app, cookie, [
      fitFile(),
      new File(['not an activity'], 'notes.txt'),
    ]);
    expect(res.status).toBe(200);
    expect(results).toMatchObject([
      { fileName: 'run.fit', status: 'imported', error: null },
      { fileName: 'notes.txt', status: 'failed', activityId: null },
    ]);
    const id = results[0].activityId;

    const activity = activitySchema.parse(
      await (await get(app, `/api/activities/${id}`, cookie)).json(),
    );
    expect(activity).toMatchObject({
      name: 'Morning Run',
      source: 'file',
      distanceM: 2100,
      durationS: 600,
      hasStream: true,
      hasFile: true,
    });
    expect(activity.splits.map((s) => s.distanceM)).toEqual([1000, 1000, 100]);
    expect(activity.laps).toHaveLength(1);
    // 2.1 km is long enough for 1k and 1 mile efforts.
    expect(activity.bestEfforts).toEqual([
      { distanceM: 1000, durationS: expect.closeTo(285.7, 1), rank: 1 },
      { distanceM: 1609, durationS: expect.closeTo(459.7, 1), rank: 1 },
    ]);

    const file = await get(app, `/api/activities/${id}/file`, cookie);
    expect(file.headers.get('content-disposition')).toContain('.fit"');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(fitRun());

    const stream = activityStreamSchema.parse(
      await (
        await get(app, `/api/activities/${id}/stream?points=50`, cookie)
      ).json(),
    );
    expect(stream.t).toHaveLength(50);

    // Deleting removes the original file too.
    const dir = join(config.dataDir, 'files');
    expect(existsSync(dir)).toBe(true);
    const del = await app.request(`/api/activities/${id}`, {
      method: 'DELETE',
      headers: { cookie, origin },
    });
    expect(del.status).toBe(204);
    expect((await get(app, `/api/activities/${id}`, cookie)).status).toBe(404);
  });

  it('skips files and runs that are already imported', async () => {
    const { app } = setup();
    const { cookie } = await signUp(app, 'runner@example.com');
    const first = await upload(app, cookie, [fitFile()]);
    const again = await upload(app, cookie, [
      fitFile('copy.fit'),
      // The same run exported as GPX.
      new File([gpxRun()], 'run.gpx'),
    ]);
    expect(again.results).toMatchObject([
      { status: 'duplicate', activityId: first.results[0].activityId },
      { status: 'duplicate', activityId: first.results[0].activityId },
    ]);
  });

  it('keeps activities private to their owner', async () => {
    const { app } = setup();
    const owner = await signUp(app, 'owner@example.com');
    const other = await signUp(app, 'other@example.com');
    const { results } = await upload(app, owner.cookie, [fitFile()]);
    const id = results[0].activityId;

    expect((await get(app, `/api/activities/${id}`, other.cookie)).status).toBe(
      404,
    );
    expect(
      (await get(app, `/api/activities/${id}/file`, other.cookie)).status,
    ).toBe(404);
    const list = (await (
      await get(app, '/api/activities', other.cookie)
    ).json()) as ActivityList;
    expect(list.items).toEqual([]);
    expect((await get(app, '/api/activities')).status).toBe(401);
  });

  it('adds activities by hand and tracks personal bests', async () => {
    const { app } = setup();
    const { cookie } = await signUp(app, 'runner@example.com');
    const add = (startedAt: string, durationS: number) =>
      sendJson(app, cookie, 'POST', '/api/activities', {
        name: 'Parkrun',
        startedAt,
        distanceM: 5000,
        durationS,
      });

    const slow = await add('2026-09-06T09:00:00+01:00', 1500);
    expect(slow.status).toBe(201);
    const fast = activitySchema.parse(
      await (await add('2026-09-13T09:00:00+01:00', 1380)).json(),
    );
    expect(fast.bestEfforts).toEqual([
      { distanceM: 5000, durationS: 1380, rank: 1 },
    ]);
    const slowActivity = activitySchema.parse(await slow.json());
    const reloaded = activitySchema.parse(
      await (
        await get(app, `/api/activities/${slowActivity.id}`, cookie)
      ).json(),
    );
    expect(reloaded.bestEfforts[0].rank).toBe(2);

    const pbs = (await (
      await get(app, '/api/personal-bests', cookie)
    ).json()) as PersonalBest[];
    expect(pbs).toEqual([
      {
        distanceM: 5000,
        durationS: 1380,
        activityId: fast.id,
        activityName: 'Parkrun',
        achievedAt: '2026-09-13T08:00:00.000Z',
      },
    ]);

    // A walk doesn't count towards running PBs.
    const edited = activitySchema.parse(
      await (
        await sendJson(app, cookie, 'PATCH', `/api/activities/${fast.id}`, {
          sport: 'walk',
          notes: 'Walked with the dog',
        })
      ).json(),
    );
    expect(edited).toMatchObject({
      sport: 'walk',
      notes: 'Walked with the dog',
    });
    expect(edited.bestEfforts).toEqual([]);
    const after = (await (
      await get(app, '/api/personal-bests', cookie)
    ).json()) as PersonalBest[];
    expect(after[0].durationS).toBe(1500);

    const invalid = await sendJson(app, cookie, 'POST', '/api/activities', {
      name: '',
      startedAt: 'yesterday',
      distanceM: -1,
      durationS: 0,
    });
    expect(invalid.status).toBe(400);
  });

  it('pages through the list newest first', async () => {
    const { app } = setup();
    const { cookie } = await signUp(app, 'runner@example.com');
    for (let day = 1; day <= 5; day++) {
      await sendJson(app, cookie, 'POST', '/api/activities', {
        name: `Run ${day}`,
        startedAt: `2026-09-0${day}T07:00:00Z`,
        distanceM: 5000,
        durationS: 1500,
      });
    }
    const page = async (query: string) =>
      (await (
        await get(app, `/api/activities?limit=2${query}`, cookie)
      ).json()) as ActivityList;

    const p1 = await page('');
    expect(p1.items.map((a) => a.name)).toEqual(['Run 5', 'Run 4']);
    const p2 = await page(`&before=${p1.nextCursor}`);
    expect(p2.items.map((a) => a.name)).toEqual(['Run 3', 'Run 2']);
    const p3 = await page(`&before=${p2.nextCursor}`);
    expect(p3.items.map((a) => a.name)).toEqual(['Run 1']);
    expect(p3.nextCursor).toBeNull();
  });
});
