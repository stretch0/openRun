import { eq } from 'drizzle-orm';
import { schema } from '@openrun/db';
import {
  clubRunDetailSchema,
  clubSchema,
  locationSchema,
  menuItemSchema,
  notificationSettingsSchema,
  seriesSchema,
} from '@openrun/schemas';
import { type App, get, send, setup, signUp } from '../test-utils.js';
import { sendCoffeeNudges, sendRunReminders } from './notices.js';
import { refreshWeather } from './weather.js';

// Fixed dates in the future: London is on GMT, so local time = UTC.
const SAT_8AM = '2027-01-09T08:00:00Z';
const WED_6_30PM = '2027-01-13T18:30:00Z';

async function body<T>(res: Response, schema: { parse: (v: unknown) => T }) {
  expect(res.status).toBeLessThan(300);
  return schema.parse(await res.json());
}

async function member(app: App, email: string, code?: string) {
  const { cookie } = await signUp(app, email);
  const name = email.split('@')[0];
  await send(app, cookie, 'POST', '/api/notifications/subscriptions', {
    endpoint: `https://push.example.com/${name}`,
    keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
  });
  if (code) await send(app, cookie, 'POST', '/api/clubs/join', { code });
  return cookie;
}

/** An organiser (Olly) and members Ann, Bea and Cal, all subscribed. */
async function club(extra: object = {}) {
  const t = setup();
  const olly = await member(t.app, 'olly@example.com');
  const c = await body(
    await send(t.app, olly, 'POST', '/api/clubs', {
      name: 'Parkside Runners',
      timezone: 'Europe/London',
      ...extra,
    }),
    clubSchema,
  );
  const ann = await member(t.app, 'ann@example.com', c.joinCode ?? '');
  const bea = await member(t.app, 'bea@example.com', c.joinCode ?? '');
  const cal = await member(t.app, 'cal@example.com', c.joinCode ?? '');
  const addRun = async (startsAt: string, more: object = {}) =>
    body(
      await send(t.app, olly, 'POST', `/api/clubs/${c.id}/runs`, {
        title: 'Social',
        startsAt,
        ...more,
      }),
      clubRunDetailSchema,
    );
  const rsvp = (cookie: string, runId: string, status: string) =>
    send(t.app, cookie, 'PUT', `/api/clubs/${c.id}/runs/${runId}/rsvp`, {
      status,
    });
  return { ...t, club: c, olly, ann, bea, cal, addRun, rsvp };
}

const to = (sent: { endpoint: string }[]) =>
  sent.map((s) => s.endpoint.split('/').at(-1)).sort();

describe('notification settings', () => {
  it('stores devices and settings, and drops devices that unsubscribed', async () => {
    const { app, sent, db } = setup();
    const cookie = await member(app, 'ann@example.com');
    expect(
      await (await get(app, '/api/notifications/key', cookie)).json(),
    ).toEqual({ publicKey: 'test-public-key' });

    const defaults = await body(
      await get(app, '/api/notifications/settings', cookie),
      notificationSettingsSchema,
    );
    expect(defaults).toEqual({
      runReminder: 'auto',
      coffeeNudge: true,
      runChanges: true,
      joinRequests: true,
    });
    const changed = await body(
      await send(app, cookie, 'PATCH', '/api/notifications/settings', {
        runReminder: 'evening',
      }),
      notificationSettingsSchema,
    );
    expect(changed).toEqual({ ...defaults, runReminder: 'evening' });

    await send(app, cookie, 'POST', '/api/notifications/subscriptions', {
      endpoint: 'https://push.example.com/gone',
      keys: { p256dh: 'k', auth: 'a' },
    });
    await send(app, cookie, 'POST', '/api/notifications/test');
    expect(to(sent)).toEqual(['ann']);
    expect(sent[0].title).toBe('Notifications are on');
    expect(db.select().from(schema.pushSubscription).all()).toHaveLength(1);
  });
});

describe('run reminders', () => {
  it('reminds people going: the evening before a morning run', async () => {
    const t = await club();
    const run = await t.addRun(SAT_8AM);
    for (const who of [t.ann, t.bea, t.cal]) await t.rsvp(who, run.id, 'going');
    // Bea doesn't want reminders; Cal muted the club.
    await send(t.app, t.bea, 'PATCH', '/api/notifications/settings', {
      runReminder: 'off',
    });
    await send(t.app, t.cal, 'PATCH', `/api/clubs/${t.club.id}/me`, {
      muted: true,
    });
    t.db
      .update(schema.clubRun)
      .set({
        weather: {
          code: 61,
          temperatureC: 6.4,
          precipitationChance: 70,
          windKmh: 20,
        },
      })
      .where(eq(schema.clubRun.id, run.id))
      .run();

    sendRunReminders(t.db, t.notifier, new Date('2027-01-08T18:59:00Z'));
    expect(t.sent).toEqual([]);
    sendRunReminders(t.db, t.notifier, new Date('2027-01-08T19:00:30Z'));
    expect(t.sent).toEqual([
      {
        endpoint: 'https://push.example.com/ann',
        title: 'Social · Parkside Runners',
        body: 'Tomorrow at 08:00. Rain, 6°C, 70% chance of rain.',
        url: `/clubs/${t.club.id}/runs/${run.id}`,
        tag: `run:${run.id}`,
      },
    ]);
    // Only once.
    sendRunReminders(t.db, t.notifier, new Date('2027-01-08T19:10:00Z'));
    expect(t.sent).toHaveLength(1);
  });

  it('reminds two hours before later runs, or as chosen', async () => {
    const t = await club();
    const run = await t.addRun(WED_6_30PM);
    await t.rsvp(t.ann, run.id, 'going');
    await t.rsvp(t.bea, run.id, 'going');
    await send(t.app, t.bea, 'PATCH', '/api/notifications/settings', {
      runReminder: '1h',
    });
    sendRunReminders(t.db, t.notifier, new Date('2027-01-13T16:30:00Z'));
    expect(to(t.sent)).toEqual(['ann']);
    expect(t.sent[0].body).toBe('Today at 18:30.');
    sendRunReminders(t.db, t.notifier, new Date('2027-01-13T17:30:00Z'));
    expect(to(t.sent)).toEqual(['ann', 'bea']);
  });

  it('nudges people going who haven’t ordered coffee', async () => {
    const t = await club();
    const item = await body(
      await send(t.app, t.olly, 'POST', `/api/clubs/${t.club.id}/menu`, {
        name: 'Flat white',
      }),
      menuItemSchema,
    );
    const run = await t.addRun(SAT_8AM, { orderCutoffMin: 30 });
    for (const who of [t.ann, t.bea, t.cal]) await t.rsvp(who, run.id, 'going');
    await send(
      t.app,
      t.bea,
      'PUT',
      `/api/clubs/${t.club.id}/runs/${run.id}/order`,
      { menuItemId: item.id },
    );
    await send(t.app, t.cal, 'PATCH', '/api/notifications/settings', {
      coffeeNudge: false,
    });
    // Orders close at 07:30; the nudge goes 30 minutes before.
    sendCoffeeNudges(t.db, t.notifier, new Date('2027-01-09T06:55:00Z'));
    expect(t.sent).toEqual([]);
    sendCoffeeNudges(t.db, t.notifier, new Date('2027-01-09T07:05:00Z'));
    expect(t.sent).toMatchObject([
      {
        endpoint: 'https://push.example.com/ann',
        title: 'Coffee orders close at 07:30',
        body: 'Order for after Social with Parkside Runners.',
      },
    ]);
    sendCoffeeNudges(t.db, t.notifier, new Date('2027-01-09T07:15:00Z'));
    expect(t.sent).toHaveLength(1);
  });
});

describe('run changes', () => {
  it('tells people going or maybe when a run is cancelled or moved', async () => {
    const t = await club();
    const run = await t.addRun(SAT_8AM);
    await t.rsvp(t.ann, run.id, 'going');
    await t.rsvp(t.bea, run.id, 'maybe');
    await t.rsvp(t.cal, run.id, 'not_going');
    await t.rsvp(t.olly, run.id, 'going');
    const runPath = `/api/clubs/${t.club.id}/runs/${run.id}`;

    await send(t.app, t.olly, 'PATCH', runPath, {
      startsAt: '2027-01-09T08:30:00Z',
    });
    // Not the organiser who moved it, nor Cal who isn't coming.
    expect(to(t.sent)).toEqual(['ann', 'bea']);
    expect(t.sent[0]).toMatchObject({
      title: 'Social has moved',
      body: 'Parkside Runners: now Sat 9 Jan, 08:30 (was Sat 9 Jan, 08:00).',
    });

    t.sent.length = 0;
    await send(t.app, t.ann, 'PATCH', '/api/notifications/settings', {
      runChanges: false,
    });
    await send(t.app, t.olly, 'PATCH', runPath, {
      status: 'cancelled',
      cancelledReason: 'Park closed for an event.',
    });
    expect(to(t.sent)).toEqual(['bea']);
    expect(t.sent[0]).toMatchObject({
      title: 'Cancelled: Social',
      body: 'Parkside Runners, Sat 9 Jan, 08:30. Park closed for an event.',
    });
  });

  it('tells people when a schedule change takes their run off', async () => {
    const t = await club();
    const series = await body(
      await send(t.app, t.olly, 'POST', `/api/clubs/${t.club.id}/series`, {
        title: 'Saturday social',
        days: ['SA'],
        startsOn: new Date().toISOString().slice(0, 10),
        startTime: '08:00',
      }),
      seriesSchema,
    );
    const runs = await body(
      await get(t.app, `/api/clubs/${t.club.id}/runs`, t.ann),
      clubRunDetailSchema.pick({ id: true }).array(),
    );
    await t.rsvp(t.ann, runs[0].id, 'going');
    await send(
      t.app,
      t.olly,
      'PATCH',
      `/api/clubs/${t.club.id}/series/${series.id}`,
      { startTime: '07:30' },
    );
    expect(to(t.sent)).toEqual(['ann']);
    expect(t.sent[0].title).toMatch(/^Saturday social on Sat .* 08:00 is off$/);
    expect(t.sent[0].body).toBe(
      'Parkside Runners changed the schedule. Check the club and RSVP again.',
    );
  });

  it('tells organisers when someone asks to join', async () => {
    const t = await club({ requireApproval: true });
    // With approval on, Ann, Bea and Cal are waiting; Olly heard about each.
    expect(to(t.sent)).toEqual(['olly', 'olly', 'olly']);
    expect(t.sent[0]).toMatchObject({
      title: 'ann asked to join Parkside Runners',
      url: `/clubs/${t.club.id}/manage`,
    });
  });
});

describe('weather', () => {
  it('fetches a forecast per meeting point for runs in the next fortnight', async () => {
    const t = await club();
    const place = await body(
      await send(t.app, t.olly, 'POST', `/api/clubs/${t.club.id}/locations`, {
        name: 'Bandstand',
        lat: 51.5287,
        lng: -0.1556,
      }),
      locationSchema,
    );
    const run = await t.addRun(SAT_8AM, { locationId: place.id });
    const later = await t.addRun('2027-03-06T08:00:00Z', {
      locationId: place.id,
    });
    const urls: string[] = [];
    const fetcher = (async (url: URL) => {
      urls.push(url.toString());
      return Response.json({
        hourly: {
          time: ['2027-01-09T08:00'],
          weather_code: [3],
          temperature_2m: [7.2],
          precipitation_probability: [10],
          wind_speed_10m: [14],
        },
      });
    }) as typeof fetch;

    const now = new Date('2027-01-05T12:00:00Z');
    expect(
      await refreshWeather(t.db, 'https://weather.test/v1', now, fetcher),
    ).toBe(1);
    expect(urls).toHaveLength(1);
    const query = new URL(urls[0]).searchParams;
    expect([query.get('latitude'), query.get('longitude')]).toEqual([
      '51.53',
      '-0.16',
    ]);
    const detail = await body(
      await get(t.app, `/api/clubs/${t.club.id}/runs/${run.id}`, t.ann),
      clubRunDetailSchema,
    );
    expect(detail.weather).toEqual({
      code: 3,
      temperatureC: 7.2,
      precipitationChance: 10,
      windKmh: 14,
    });
    const far = await body(
      await get(t.app, `/api/clubs/${t.club.id}/runs/${later.id}`, t.ann),
      clubRunDetailSchema,
    );
    expect(far.weather).toBeNull();
    // Fresh forecasts aren't fetched again.
    expect(
      await refreshWeather(t.db, 'https://weather.test/v1', now, fetcher),
    ).toBe(0);
  });
});
