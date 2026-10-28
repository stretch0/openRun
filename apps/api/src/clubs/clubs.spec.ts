import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  type ClubRun,
  type ClubSummary,
  clubPreviewSchema,
  clubRunDetailSchema,
  clubSchema,
  locationSchema,
  seriesSchema,
} from '@openrun/schemas';
import { type App, get, origin, setup, signUp } from '../test-utils.js';

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

async function createClub(app: App, cookie: string, extra: object = {}) {
  const res = await send(app, cookie, 'POST', '/api/clubs', {
    name: 'Parkside Runners',
    timezone: 'Europe/London',
    ...extra,
  });
  expect(res.status).toBe(201);
  return clubSchema.parse(await res.json());
}

async function runs(app: App, cookie: string, clubId: string) {
  return (await (
    await get(app, `/api/clubs/${clubId}/runs`, cookie)
  ).json()) as ClubRun[];
}

const today = () => new Date().toISOString().slice(0, 10);

describe('clubs', () => {
  it('lets people join by code, with optional approval', async () => {
    const { app } = setup();
    const owner = await signUp(app, 'owner@example.com');
    const ann = await signUp(app, 'ann@example.com');
    const bob = await signUp(app, 'bob@example.com');

    const club = await createClub(app, owner.cookie);
    expect(club).toMatchObject({
      role: 'owner',
      status: 'active',
      shareLevel: 'attendance',
      memberCount: 1,
    });
    const code = club.joinCode as string;
    expect(code).toMatch(/^[A-Z2-9]{8}$/);

    // Codes are case-insensitive, and a preview shows before joining.
    const preview = clubPreviewSchema.parse(
      await (
        await get(app, `/api/clubs/preview/${code.toLowerCase()}`, ann.cookie)
      ).json(),
    );
    expect(preview).toMatchObject({ name: 'Parkside Runners', status: null });
    const joined = await send(app, ann.cookie, 'POST', '/api/clubs/join', {
      code,
    });
    expect(((await joined.json()) as ClubSummary).status).toBe('active');

    // Members see each other's names, not emails, and not the join code.
    const asAnn = clubSchema.parse(
      await (await get(app, `/api/clubs/${club.id}`, ann.cookie)).json(),
    );
    expect(asAnn.joinCode).toBeNull();
    expect(asAnn.members.map((m) => m.name).sort()).toEqual(['ann', 'owner']);
    expect(JSON.stringify(asAnn)).not.toContain('@example.com');

    // With approval on, Bob waits until an organiser lets him in.
    await send(app, owner.cookie, 'PATCH', `/api/clubs/${club.id}`, {
      requireApproval: true,
    });
    const pending = await send(app, bob.cookie, 'POST', '/api/clubs/join', {
      code,
    });
    expect(((await pending.json()) as ClubSummary).status).toBe('pending');
    expect((await get(app, `/api/clubs/${club.id}`, bob.cookie)).status).toBe(
      403,
    );
    // Ann (a member) can't approve; the owner can.
    const ownerView = clubSchema.parse(
      await (await get(app, `/api/clubs/${club.id}`, owner.cookie)).json(),
    );
    const bobId = ownerView.members.find((m) => m.status === 'pending')?.userId;
    const approve = (cookie: string) =>
      send(app, cookie, 'PATCH', `/api/clubs/${club.id}/members/${bobId}`, {
        status: 'active',
      });
    expect((await approve(ann.cookie)).status).toBe(403);
    expect((await approve(owner.cookie)).status).toBe(200);
    expect((await get(app, `/api/clubs/${club.id}`, bob.cookie)).status).toBe(
      200,
    );

    // A new code stops the old link working.
    await send(app, owner.cookie, 'POST', `/api/clubs/${club.id}/join-code`);
    expect(
      (await get(app, `/api/clubs/preview/${code}`, bob.cookie)).status,
    ).toBe(404);

    // Members choose what they share with the club.
    const shared = await send(
      app,
      ann.cookie,
      'PATCH',
      `/api/clubs/${club.id}/me`,
      {
        shareLevel: 'summaries',
      },
    );
    expect(((await shared.json()) as ClubSummary).shareLevel).toBe('summaries');

    // The owner can't leave; members can.
    expect(
      (
        await send(
          app,
          owner.cookie,
          'DELETE',
          `/api/clubs/${club.id}/members/me`,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await send(
          app,
          ann.cookie,
          'DELETE',
          `/api/clubs/${club.id}/members/me`,
        )
      ).status,
    ).toBe(204);
    expect((await get(app, `/api/clubs/${club.id}`, ann.cookie)).status).toBe(
      404,
    );
  });

  it('schedules repeating runs and takes RSVPs', async () => {
    const { app } = setup();
    const owner = await signUp(app, 'owner@example.com');
    const ann = await signUp(app, 'ann@example.com');
    const outsider = await signUp(app, 'outsider@example.com');
    const club = await createClub(app, owner.cookie);
    await send(app, ann.cookie, 'POST', '/api/clubs/join', {
      code: club.joinCode,
    });

    // Members can't schedule runs.
    const series = {
      title: 'Saturday social',
      days: ['SA'],
      startsOn: today(),
      startTime: '08:00',
      paceGroups: [{ name: '5:00/km' }, { name: '6:00/km' }],
    };
    expect(
      (
        await send(
          app,
          ann.cookie,
          'POST',
          `/api/clubs/${club.id}/series`,
          series,
        )
      ).status,
    ).toBe(403);

    const location = locationSchema.parse(
      await (
        await send(
          app,
          owner.cookie,
          'POST',
          `/api/clubs/${club.id}/locations`,
          {
            name: 'Bandstand',
            lat: 51.5,
            lng: -0.1,
          },
        )
      ).json(),
    );
    const created = seriesSchema.parse(
      await (
        await send(app, owner.cookie, 'POST', `/api/clubs/${club.id}/series`, {
          ...series,
          locationId: location.id,
        })
      ).json(),
    );
    expect(created.summary).toBe('Every Saturday');

    const upcoming = await runs(app, ann.cookie, club.id);
    // Eight weeks ahead: 8 or 9 Saturdays depending on today.
    expect(upcoming.length).toBeGreaterThanOrEqual(8);
    expect(upcoming.length).toBeLessThanOrEqual(9);
    expect(upcoming[0]).toMatchObject({
      title: 'Saturday social',
      location: { name: 'Bandstand' },
      going: 0,
      myRsvp: null,
    });
    // Asking again doesn't create duplicates.
    expect(await runs(app, ann.cookie, club.id)).toHaveLength(upcoming.length);

    // Outsiders can't see or RSVP.
    const first = upcoming[0];
    expect(
      (
        await get(
          app,
          `/api/clubs/${club.id}/runs/${first.id}`,
          outsider.cookie,
        )
      ).status,
    ).toBe(404);

    const rsvp = clubRunDetailSchema.parse(
      await (
        await send(
          app,
          ann.cookie,
          'PUT',
          `/api/clubs/${club.id}/runs/${first.id}/rsvp`,
          {
            status: 'going',
            paceGroup: '6:00/km',
            guests: 1,
          },
        )
      ).json(),
    );
    expect(rsvp).toMatchObject({
      going: 2,
      myRsvp: { status: 'going', paceGroup: '6:00/km', guests: 1 },
      attendees: [{ name: 'ann', status: 'going', guests: 1 }],
    });

    // Changing the schedule keeps RSVPs on runs that still happen.
    await send(
      app,
      owner.cookie,
      'PATCH',
      `/api/clubs/${club.id}/series/${created.id}`,
      { days: ['SA', 'WE'], title: 'Club run' },
    );
    const after = await runs(app, ann.cookie, club.id);
    expect(after.length).toBeGreaterThan(upcoming.length);
    expect(after.every((r) => r.title === 'Club run')).toBe(true);
    expect(after.find((r) => r.id === first.id)?.myRsvp?.status).toBe('going');

    // Someone who leaves is taken off the run.
    const bea = await signUp(app, 'bea@example.com');
    await send(app, bea.cookie, 'POST', '/api/clubs/join', {
      code: club.joinCode,
    });
    await send(
      app,
      bea.cookie,
      'PUT',
      `/api/clubs/${club.id}/runs/${first.id}/rsvp`,
      {
        status: 'maybe',
      },
    );
    await send(app, bea.cookie, 'DELETE', `/api/clubs/${club.id}/members/me`);
    const afterLeaving = clubRunDetailSchema.parse(
      await (
        await get(app, `/api/clubs/${club.id}/runs/${first.id}`, ann.cookie)
      ).json(),
    );
    expect(afterLeaving.attendees.map((a) => a.name)).toEqual(['ann']);

    // A cancelled run takes no more RSVPs.
    await send(
      app,
      owner.cookie,
      'PATCH',
      `/api/clubs/${club.id}/runs/${first.id}`,
      {
        status: 'cancelled',
        cancelledReason: 'Storm warning',
      },
    );
    const cancelled = await send(
      app,
      ann.cookie,
      'PUT',
      `/api/clubs/${club.id}/runs/${first.id}/rsvp`,
      { status: 'maybe' },
    );
    expect(cancelled.status).toBe(400);

    // Ending a series removes its future runs.
    await send(
      app,
      owner.cookie,
      'PATCH',
      `/api/clubs/${club.id}/series/${created.id}`,
      {
        ended: true,
      },
    );
    expect(await runs(app, ann.cookie, club.id)).toEqual([]);
  });

  it('rejects unknown time zones and other clubs’ locations', async () => {
    const { app } = setup();
    const owner = await signUp(app, 'owner@example.com');
    const bad = await send(app, owner.cookie, 'POST', '/api/clubs', {
      name: 'Nowhere',
      timezone: 'Mars/Olympus',
    });
    expect(bad.status).toBe(400);

    const a = await createClub(app, owner.cookie);
    const b = await createClub(app, owner.cookie, { name: 'Other club' });
    const location = locationSchema.parse(
      await (
        await send(app, owner.cookie, 'POST', `/api/clubs/${a.id}/locations`, {
          name: 'Park',
          lat: 51.5,
          lng: -0.1,
        })
      ).json(),
    );
    const res = await send(
      app,
      owner.cookie,
      'POST',
      `/api/clubs/${b.id}/runs`,
      {
        title: 'One-off',
        startsAt: new Date(Date.now() + 86_400_000).toISOString(),
        locationId: location.id,
      },
    );
    expect(res.status).toBe(400);
  });
});

describe('club module boundaries', () => {
  it('never reads members’ run logs (docs/PRIVACY.md, phase 2)', () => {
    const dir = import.meta.dirname;
    for (const file of readdirSync(dir).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'),
    )) {
      const source = readFileSync(join(dir, file), 'utf8');
      for (const table of [
        'schema.activity',
        'schema.activityStream',
        'schema.lap',
        'schema.personalBest',
        'schema.shoe',
        'schema.privacyZone',
      ]) {
        expect(source, `${file} uses ${table}`).not.toContain(table);
      }
    }
  });
});
