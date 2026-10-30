import { eq } from 'drizzle-orm';
import { type Db, schema } from '@openrun/db';
import { zonedTime } from '@openrun/domain';
import type { createApp } from '../app.js';
import { ensureUpcomingRuns } from '../clubs/runs.js';
import { canal, outer, primrose } from './routes.js';
import { type RunPlan, gpxRun, laps, random } from './tracks.js';

type App = ReturnType<typeof createApp>;
type Point = [number, number];

/** The account visitors sign in to. Shown on the sign-in page in demo mode. */
export const DEMO_LOGIN = {
  email: 'sam@example.com',
  password: 'try-the-openrun-demo',
};

const TIME_ZONE = 'Europe/London';
const DAY_MS = 86_400_000;
const WEEKS = 26;

/** The other club members. Those with a pace also log and share runs. */
const MEMBERS = [
  { name: 'Priya Shah', email: 'priya@example.com', pace: 300, turnout: 0.9 },
  { name: 'Tom Okafor', email: 'tom@example.com', pace: 285, turnout: 0.7 },
  { name: 'Mei Lin', email: 'mei@example.com', pace: 330, turnout: 0.8 },
  { name: 'Jo Hughes', email: 'jo@example.com', pace: null, turnout: 0.6 },
  { name: 'Alex Byrne', email: 'alex@example.com', pace: null, turnout: 0.5 },
  { name: 'Dan Mills', email: 'dan@example.com', pace: null, turnout: 0.4 },
] as const;

const PASSWORD = 'demo member password, never shown';

/**
 * Fills an empty database with a runner (the demo login), 26 weeks of runs,
 * shoes, a privacy zone and a run club with members, past and upcoming runs,
 * RSVPs and coffee orders. Goes through the API, so everything is stored
 * exactly as it would be for real users.
 */
export async function seedDemo(
  app: App,
  db: Db,
  origin: string,
  now = new Date(),
) {
  const rand = random(Math.floor(now.getTime() / DAY_MS));

  async function call<T = Record<string, unknown>>(
    cookie: string,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await app.request(path, {
      method,
      headers: {
        cookie,
        origin,
        ...(body instanceof FormData || body === undefined
          ? {}
          : { 'content-type': 'application/json' }),
      },
      body:
        body instanceof FormData || body === undefined
          ? (body as FormData | undefined)
          : JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(
        `Demo seed: ${method} ${path} answered ${res.status}: ${await res.text()}`,
      );
    }
    return res.json() as Promise<T>;
  }

  async function signUp(name: string, email: string, password: string) {
    const res = await app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ name, email, password }),
    });
    if (!res.ok) throw new Error(`Demo seed: sign-up answered ${res.status}`);
    const cookie = res.headers.get('set-cookie')?.split(';')[0] ?? '';
    const { user } = (await res.json()) as { user: { id: string } };
    await call(cookie, 'PATCH', '/api/me', { timezone: TIME_ZONE });
    await call(cookie, 'PATCH', '/api/privacy/settings', {
      defaultVisibility: 'clubs',
      shareMap: true,
    });
    return { id: user.id, cookie };
  }

  async function importRun(cookie: string, plan: RunPlan) {
    const form = new FormData();
    form.append('files', new File([gpxRun(plan)], 'run.gpx'));
    const [result] = await call<{ activityId: string | null }[]>(
      cookie,
      'POST',
      '/api/activities/import',
      form,
    );
    if (!result.activityId)
      throw new Error('Demo seed: a run failed to import');
    return result.activityId;
  }

  // ---- Sam, the demo login ----
  const sam = await signUp('Sam Rivera', DEMO_LOGIN.email, DEMO_LOGIN.password);
  await call(sam.cookie, 'POST', '/api/privacy/zones', {
    name: 'Home',
    lat: 51.5405,
    lng: -0.15,
    radiusM: 300,
  });
  const addShoe = async (
    name: string,
    brand: string,
    startingDistanceM: number,
  ) =>
    (
      await call<{ id: string }>(sam.cookie, 'POST', '/api/shoes', {
        name,
        brand,
        startingDistanceM,
      })
    ).id;
  const daily = await addShoe('Pegasus 41', 'Nike', 412_000);
  const fast = await addShoe('Endorphin Speed 4', 'Saucony', 96_000);

  // ---- The club ----
  const members = [];
  for (const m of MEMBERS) {
    members.push({ ...m, ...(await signUp(m.name, m.email, PASSWORD)) });
  }
  const [priya] = members;
  const club = await call<{ id: string }>(priya.cookie, 'POST', '/api/clubs', {
    name: "Regent's Park Runners",
    description:
      'Friendly runs round the park and along the canal. All paces welcome; nobody gets left behind. Coffee at The Hub afterwards.',
    timezone: TIME_ZONE,
  });
  const clubPath = `/api/clubs/${club.id}`;
  const hub = await call<{ id: string }>(
    priya.cookie,
    'POST',
    `${clubPath}/locations`,
    {
      name: 'The Hub café',
      lat: 51.5301,
      lng: -0.1589,
      notes: 'Meet by the bike racks.',
    },
  );
  const lock = await call<{ id: string }>(
    priya.cookie,
    'POST',
    `${clubPath}/locations`,
    {
      name: 'Camden Lock bridge',
      lat: 51.5413,
      lng: -0.146,
      notes: null,
    },
  );
  const menu: Record<string, string> = {};
  for (const item of [
    {
      name: 'Flat white',
      options: [{ name: 'Milk', choices: ['Whole', 'Oat', 'Soy'] }],
    },
    {
      name: 'Latte',
      options: [
        { name: 'Milk', choices: ['Whole', 'Oat', 'Soy'] },
        { name: 'Size', choices: ['Regular', 'Large'] },
      ],
    },
    {
      name: 'Americano',
      options: [{ name: 'Milk', choices: ['None', 'Splash'] }],
    },
    {
      name: 'Tea',
      options: [{ name: 'Milk', choices: ['None', 'Dairy', 'Oat'] }],
    },
    { name: 'Hot chocolate', options: [] },
  ]) {
    const created = await call<{ id: string; name: string }>(
      priya.cookie,
      'POST',
      `${clubPath}/menu`,
      item,
    );
    menu[item.name] = created.id;
  }

  // The Monday 26 weeks ago, so each week's runs fall on the right days.
  const back = new Date(now.getTime() - WEEKS * 7 * DAY_MS);
  const firstDay = new Date(
    Date.UTC(back.getUTCFullYear(), back.getUTCMonth(), back.getUTCDate()) -
      ((back.getUTCDay() + 6) % 7) * DAY_MS,
  );
  const startsOn = firstDay.toISOString().slice(0, 10);
  await call(priya.cookie, 'POST', `${clubPath}/series`, {
    title: 'Canal tempo',
    days: ['TU'],
    startsOn,
    startTime: '18:30',
    locationId: lock.id,
    notes:
      'Out along the towpath to Angel and back, with a few faster stretches.',
  });
  await call(priya.cookie, 'POST', `${clubPath}/series`, {
    title: 'Saturday long run',
    days: ['SA'],
    startsOn,
    startTime: '08:00',
    locationId: hub.id,
    notes: 'Two laps of the park, or one if you fancy. Coffee after.',
    orderCutoffMin: 30,
  });

  const { joinCode } = await call<{ joinCode: string }>(
    priya.cookie,
    'GET',
    clubPath,
  );
  const usuals: [string, Record<string, string>][] = [
    ['Flat white', { Milk: 'Oat' }],
    ['Americano', { Milk: 'Splash' }],
    ['Latte', { Milk: 'Whole', Size: 'Large' }],
    ['Tea', { Milk: 'Dairy' }],
    ['Flat white', { Milk: 'Whole' }],
    ['Hot chocolate', {}],
    ['Flat white', { Milk: 'Soy' }],
  ];
  // Sam gets quicker over the 26 weeks.
  const everyone = [{ ...sam, pace: 320, turnout: 0.92 }, ...members];
  for (const [i, person] of everyone.entries()) {
    if (person.id !== priya.id) {
      await call(person.cookie, 'POST', '/api/clubs/join', { code: joinCode });
    }
    await call(person.cookie, 'PATCH', `${clubPath}/me`, {
      shareLevel: 'full',
    });
    const [item, choices] = usuals[i];
    await call(person.cookie, 'PUT', `${clubPath}/usual`, {
      menuItemId: menu[item],
      choices,
      autoAdd: true,
    });
  }
  await call(priya.cookie, 'PATCH', `${clubPath}/members/${sam.id}`, {
    role: 'organiser',
  });

  // Club runs from 26 weeks ago to 8 weeks ahead, the way the nightly job
  // would have made them.
  for (let at = firstDay.getTime(); at <= now.getTime(); at += 7 * DAY_MS) {
    ensureUpcomingRuns(db, club.id, new Date(at));
  }
  ensureUpcomingRuns(db, club.id, now);
  const runs = db
    .select()
    .from(schema.clubRun)
    .where(eq(schema.clubRun.clubId, club.id))
    .orderBy(schema.clubRun.startsAt)
    .all();
  const past = runs.filter((r) => r.startsAt < now);
  const next = runs.filter((r) => r.startsAt >= now).slice(0, 2);

  // ---- Past club runs: who came, and the runs they shared ----
  const progress = (at: Date) =>
    (at.getTime() - firstDay.getTime()) / (WEEKS * 7 * DAY_MS);
  for (const run of past) {
    const saturday = run.title === 'Saturday long run';
    const route: Point[] = saturday
      ? progress(run.startsAt) > 0.6
        ? [...laps(outer, 2), ...primrose.slice(1)]
        : laps(outer, 2)
      : canal;
    const name = saturday ? 'Saturday long run' : 'Canal tempo';
    for (const person of everyone) {
      if (rand() > person.turnout) continue;
      await call(person.cookie, 'PUT', `${clubPath}/runs/${run.id}/rsvp`, {
        status: 'going',
      });
      const isSam = person.id === sam.id;
      if (!person.pace) continue;
      const basePace = isSam
        ? person.pace - 20 * progress(run.startsAt)
        : person.pace;
      const id = await importRun(person.cookie, {
        route: saturday && !isSam && rand() < 0.4 ? outer : route,
        start: new Date(run.startsAt.getTime() + 2 * 60_000),
        paceSPerKm: saturday ? basePace + 15 : basePace - 25,
        effort: saturday ? 'steady' : 'hard',
        name,
        seed: Math.floor(rand() * 1e9),
      });
      if (isSam) {
        await call(sam.cookie, 'PATCH', `/api/activities/${id}`, {
          shoeId: saturday ? daily : fast,
          rpe: saturday ? 5 : 7,
        });
      }
      await call(
        person.cookie,
        'PUT',
        `/api/activities/${id}/clubs/${club.id}`,
      );
    }
  }

  // ---- Sam's own runs between club runs ----
  for (let week = 0; week < WEEKS; week++) {
    const monday = new Date(firstDay.getTime() + week * 7 * DAY_MS);
    for (const { offset, time, route, name, effort, pace } of [
      {
        offset: 3,
        time: '06:45',
        route: laps(primrose, 2),
        name: 'Easy Primrose Hill',
        effort: 'easy',
        pace: 350,
      },
      {
        offset: 6,
        time: '09:30',
        route: outer,
        name: 'Sunday recovery',
        effort: 'easy',
        pace: 365,
      },
    ] as const) {
      const day = new Date(monday.getTime() + offset * DAY_MS);
      const start = zonedTime(day.toISOString().slice(0, 10), time, TIME_ZONE);
      if (start >= now || rand() < 0.15) continue;
      const id = await importRun(sam.cookie, {
        route,
        start,
        paceSPerKm: pace - 15 * progress(start),
        effort,
        name,
        seed: Math.floor(rand() * 1e9),
      });
      await call(sam.cookie, 'PATCH', `/api/activities/${id}`, {
        shoeId: daily,
        rpe: 3,
      });
    }
  }

  // ---- The next two club runs: who's coming, and their coffee ----
  for (const run of next) {
    for (const person of everyone) {
      const isSam = person.id === sam.id;
      if (!isSam && rand() < 0.25) continue;
      await call(person.cookie, 'PUT', `${clubPath}/runs/${run.id}/rsvp`, {
        status: isSam || rand() < 0.8 ? 'going' : 'maybe',
      });
    }
  }

  // Sign the seed's sessions out; visitors sign in themselves.
  db.delete(schema.session).run();
}
