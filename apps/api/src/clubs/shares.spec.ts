import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { schema } from '@openrun/db';
import { localDate } from '@openrun/domain';
import {
  activitySchema,
  clubHighlightsSchema,
  clubRunDetailSchema,
  clubSchema,
  shareTargetSchema,
} from '@openrun/schemas';
import {
  type App,
  get,
  importFit,
  send,
  setup,
  signUp,
} from '../test-utils.js';

async function body<T>(
  res: Response | Promise<Response>,
  s: { parse: (v: unknown) => T },
) {
  const r = await res;
  expect(r.status).toBeLessThan(300);
  return s.parse(await r.json());
}

const targets = z.array(shareTargetSchema);

/** Olly's club with Ann in it, a club run when Ann's run started, and her run. */
async function sharing() {
  const t = setup();
  const olly = (await signUp(t.app, 'olly@example.com')).cookie;
  const ann = (await signUp(t.app, 'ann@example.com')).cookie;
  const club = await body(
    await send(t.app, olly, 'POST', '/api/clubs', {
      name: 'Parkside Runners',
      timezone: 'Europe/London',
    }),
    clubSchema,
  );
  await send(t.app, ann, 'POST', '/api/clubs/join', { code: club.joinCode });
  const run = await body(
    await send(t.app, olly, 'POST', `/api/clubs/${club.id}/runs`, {
      title: 'Thursday early',
      // Five minutes after the synthetic FIT run starts (51.5, -0.1).
      startsAt: '2026-10-01T07:05:00Z',
    }),
    clubRunDetailSchema,
  );
  const activityId = await importFit(t.app, ann);
  const level = (shareLevel: string) =>
    send(t.app, ann, 'PATCH', `/api/clubs/${club.id}/me`, { shareLevel });
  const share = () =>
    send(t.app, ann, 'PUT', `/api/activities/${activityId}/clubs/${club.id}`);
  const runDetail = () =>
    body(
      get(t.app, `/api/clubs/${club.id}/runs/${run.id}`, olly),
      clubRunDetailSchema,
    );
  return { ...t, olly, ann, club, run, activityId, level, share, runDetail };
}

describe('sharing runs with a club', () => {
  it('needs more than attendance only, and shares numbers without a map', async () => {
    const t = await sharing();
    const blocked = await t.share();
    expect(blocked.status).toBe(400);
    expect(await blocked.json()).toEqual({
      error:
        'You share attendance only with this club. Change that on the club page to share runs.',
    });

    await t.level('summaries');
    const after = await body(await t.share(), targets);
    expect(after).toEqual([
      {
        clubId: t.club.id,
        clubName: 'Parkside Runners',
        clubLogoUrl: null,
        shareLevel: 'summaries',
        shared: true,
        withMap: false,
      },
    ]);
    const detail = await t.runDetail();
    expect(detail.shares).toMatchObject([
      { memberName: 'ann', title: expect.any(String), track: null },
    ]);
    expect(detail.shares[0].distanceM).toBeGreaterThan(2000);
    // Sharing makes the run visible to clubs.
    const activity = await body(
      get(t.app, `/api/activities/${t.activityId}`, t.ann),
      activitySchema,
    );
    expect(activity.visibility).toBe('clubs');
  });

  it('includes the route only with maps allowed, with privacy zones cut out', async () => {
    const t = await sharing();
    await t.level('full');
    // Maps are off in privacy settings by default.
    expect((await body(await t.share(), targets))[0].withMap).toBe(false);
    expect((await t.runDetail()).shares[0].track).toBeNull();

    await send(t.app, t.ann, 'PATCH', '/api/privacy/settings', {
      shareMap: true,
    });
    await send(t.app, t.ann, 'POST', '/api/privacy/zones', {
      name: 'Home',
      lat: 51.5,
      lng: -0.1,
      radiusM: 300,
    });
    expect((await body(await t.share(), targets))[0].withMap).toBe(true);
    const track = (await t.runDetail()).shares[0].track;
    expect(track?.length).toBeGreaterThan(100);
    // The start is inside the zone; the end isn't.
    expect(track?.[0]).toBeNull();
    expect(track?.at(-1)).not.toBeNull();
  });

  it('is a copy that can be taken back, and goes when the run is made private', async () => {
    const t = await sharing();
    await t.level('summaries');
    await t.share();
    const path = `/api/activities/${t.activityId}`;

    // Renaming the run doesn't change the club's copy.
    await send(t.app, t.ann, 'PATCH', path, { name: 'Renamed' });
    expect((await t.runDetail()).shares[0].title).not.toBe('Renamed');

    await send(t.app, t.ann, 'DELETE', `${path}/clubs/${t.club.id}`);
    expect((await t.runDetail()).shares).toEqual([]);

    await t.share();
    await send(t.app, t.ann, 'PATCH', path, { visibility: 'private' });
    expect((await t.runDetail()).shares).toEqual([]);

    await t.share();
    await send(t.app, t.ann, 'PATCH', '/api/activities/visibility', {
      visibility: 'private',
    });
    expect((await t.runDetail()).shares).toEqual([]);

    // Deleting the original keeps the club's copy; leaving the club doesn't.
    await t.share();
    await send(t.app, t.ann, 'DELETE', path);
    expect((await t.runDetail()).shares).toHaveLength(1);
    await send(t.app, t.ann, 'DELETE', `/api/clubs/${t.club.id}/members/me`);
    expect((await t.runDetail()).shares).toEqual([]);
  });

  it('only lets me share my own runs', async () => {
    const t = await sharing();
    const res = await send(
      t.app,
      t.olly,
      'PUT',
      `/api/activities/${t.activityId}/clubs/${t.club.id}`,
    );
    expect(res.status).toBe(404);
  });
});

describe('club highlights', () => {
  async function pastRun(
    t: { app: App; olly: string },
    clubId: string,
    daysAgo: number,
  ) {
    return body(
      await send(t.app, t.olly, 'POST', `/api/clubs/${clubId}/runs`, {
        title: 'Social',
        startsAt: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
      }),
      clubRunDetailSchema,
    );
  }

  it('counts everyone in totals but only names people who opted in', async () => {
    const t = await sharing();
    const recent = await pastRun(t, t.club.id, 1);
    for (const who of [t.ann, t.olly]) {
      await send(
        t.app,
        who,
        'PUT',
        `/api/clubs/${t.club.id}/runs/${recent.id}/rsvp`,
        {
          status: 'going',
        },
      );
    }
    t.db
      .update(schema.clubRun)
      .set({
        weather: {
          code: 63,
          temperatureC: 9,
          precipitationChance: 90,
          windKmh: 10,
        },
      })
      .where(eq(schema.clubRun.id, recent.id))
      .run();
    const path = `/api/clubs/${t.club.id}/highlights`;

    const before = await body(get(t.app, path, t.ann), clubHighlightsSchema);
    expect(before.moments).toEqual([]);

    await send(t.app, t.ann, 'PATCH', `/api/clubs/${t.club.id}/me`, {
      highlights: true,
    });
    const after = await body(get(t.app, path, t.ann), clubHighlightsSchema);
    expect(after.moments.map((m) => `${m.name}: ${m.text}`).sort()).toEqual([
      'ann: First run with the club',
      'ann: Ran in the rain',
    ]);
    // Yesterday may have been last month.
    const month = (d: Date) => localDate(d, 'Europe/London').slice(0, 7);
    const sameMonth = month(new Date(recent.startsAt)) === month(new Date());
    expect(after.thisMonth.turnout).toBe(sameMonth ? 2 : 0);

    // Outsiders see nothing.
    const zed = (await signUp(t.app, 'zed@example.com')).cookie;
    expect((await get(t.app, path, zed)).status).toBe(404);
  });
});
