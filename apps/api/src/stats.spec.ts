import {
  type Activity,
  type Shoe,
  type Stats,
  activitySchema,
  shoeSchema,
  statsSchema,
} from '@openrun/schemas';
import { type App, get, origin, setup, signUp } from './test-utils.js';

function send(
  app: App,
  cookie: string,
  method: string,
  path: string,
  body?: unknown,
) {
  return app.request(path, {
    method,
    headers: { 'content-type': 'application/json', cookie, origin },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

async function addRun(
  app: App,
  cookie: string,
  daysAgo: number,
  distanceM: number,
  durationS: number,
  extra: object = {},
): Promise<Activity> {
  const res = await send(app, cookie, 'POST', '/api/activities', {
    name: 'Run',
    startedAt: new Date(Date.now() - daysAgo * DAY_MS).toISOString(),
    distanceM,
    durationS,
    ...extra,
  });
  return activitySchema.parse(await res.json());
}

describe('shoes', () => {
  it('tracks mileage and stays private', async () => {
    const { app } = setup();
    const { cookie } = await signUp(app, 'runner@example.com');
    const other = await signUp(app, 'other@example.com');

    const created = await send(app, cookie, 'POST', '/api/shoes', {
      name: 'Pegasus',
      brand: 'Nike',
      startingDistanceM: 50_000,
    });
    expect(created.status).toBe(201);
    const shoe = shoeSchema.parse(await created.json());

    const run = await addRun(app, cookie, 1, 10_000, 3000, { shoeId: shoe.id });
    expect(run.shoeId).toBe(shoe.id);
    await addRun(app, cookie, 2, 5000, 1500);
    const shoes = (await (
      await get(app, '/api/shoes', cookie)
    ).json()) as Shoe[];
    expect(shoes).toEqual([{ ...shoe, distanceM: 60_000, runCount: 1 }]);

    // Someone else's shoe can't be used or edited.
    const theirs = await addRun(app, other.cookie, 1, 5000, 1500);
    const steal = await send(
      app,
      other.cookie,
      'PATCH',
      `/api/activities/${theirs.id}`,
      {
        shoeId: shoe.id,
      },
    );
    expect(steal.status).toBe(400);
    expect(
      (
        await send(app, other.cookie, 'PATCH', `/api/shoes/${shoe.id}`, {
          name: 'Mine',
        })
      ).status,
    ).toBe(404);

    const retired = shoeSchema.parse(
      await (
        await send(app, cookie, 'PATCH', `/api/shoes/${shoe.id}`, {
          retired: true,
        })
      ).json(),
    );
    expect(retired.retired).toBe(true);

    // Deleting a shoe keeps its runs.
    expect(
      (await send(app, cookie, 'DELETE', `/api/shoes/${shoe.id}`)).status,
    ).toBe(204);
    const after = activitySchema.parse(
      await (await get(app, `/api/activities/${run.id}`, cookie)).json(),
    );
    expect(after.shoeId).toBeNull();
  });
});

describe('stats', () => {
  it('totals running and predicts race times', async () => {
    const { app } = setup();
    const { cookie } = await signUp(app, 'runner@example.com');

    const empty = statsSchema.parse(
      await (await get(app, '/api/stats', cookie)).json(),
    );
    expect(empty.predictions).toBeNull();
    expect(empty.weeks).toHaveLength(12);
    expect(empty.months).toHaveLength(12);
    // 52 full weeks plus the current partial one.
    expect(empty.days.length).toBeGreaterThanOrEqual(365);
    expect(empty.days.length).toBeLessThanOrEqual(371);

    await addRun(app, cookie, 0, 5000, 20 * 60);
    await addRun(app, cookie, 0, 8000, 2400, { sport: 'walk' });
    await addRun(app, cookie, 200, 10000, 3000);

    const stats = (await (
      await get(app, '/api/stats', cookie)
    ).json()) as Stats;
    expect(stats.thisWeek).toMatchObject({ distanceM: 5000, count: 1 });
    expect(stats.allTime).toMatchObject({ distanceM: 15000, count: 2 });
    expect(stats.days.at(-1)).toMatchObject({ distanceM: 5000 });
    expect(stats.predictions?.vdot).toBeCloseTo(49.8, 0);
    expect(stats.predictions?.basedOn.distanceM).toBe(5000);
    expect(stats.predictions?.races.map((r) => r.distanceM)).toEqual([
      5000, 10000, 21097, 42195,
    ]);
  });
});

describe('export', () => {
  it('exports activities as JSON and CSV', async () => {
    const { app } = setup();
    const { cookie } = await signUp(app, 'runner@example.com');
    await addRun(app, cookie, 1, 5000, 1500, {
      name: '=cmd, "quoted"',
      notes: 'Easy',
    });

    const json = await get(app, '/api/export/activities.json', cookie);
    expect(json.headers.get('content-disposition')).toMatch(
      /attachment; filename="openrun-export-.*\.json"/,
    );
    const body = await json.json();
    expect(body).toMatchObject({
      format: 'openrun-export',
      user: { email: 'runner@example.com' },
      activities: [
        {
          name: '=cmd, "quoted"',
          distanceM: 5000,
          bestEfforts: [{ distanceM: 5000, durationS: 1500 }],
        },
      ],
    });

    const csv = await (
      await get(app, '/api/export/activities.csv', cookie)
    ).text();
    const lines = csv
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\r\n');
    expect(lines[0]).toMatch(/^started_at,name,sport,distance_m/);
    expect(lines[1]).toContain(`"'=cmd, ""quoted""",run,5000,1500`);

    expect((await get(app, '/api/export/activities.csv')).status).toBe(401);
  });
});
