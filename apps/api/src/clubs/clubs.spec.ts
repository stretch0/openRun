import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  type ClubRun,
  type ClubSummary,
  clubLogoSchema,
  clubPreviewSchema,
  clubRunDetailSchema,
  clubSchema,
  locationSchema,
  seriesSchema,
} from '@openrun/schemas';
import { type App, get, origin, send, setup, signUp } from '../test-utils.js';

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

  it('lets the owner hand the club to another member', async () => {
    const { app } = setup();
    const owner = await signUp(app, 'owner@example.com');
    const ann = await signUp(app, 'ann@example.com');
    const bob = await signUp(app, 'bob@example.com');
    const outsider = await signUp(app, 'out@example.com');
    const club = await createClub(app, owner.cookie);
    for (const who of [ann, bob]) {
      await send(app, who.cookie, 'POST', '/api/clubs/join', {
        code: club.joinCode,
      });
    }
    const idOf = async (email: string) => {
      const view = clubSchema.parse(
        await (await get(app, `/api/clubs/${club.id}`, owner.cookie)).json(),
      );
      return view.members.find((m) => m.name === email.split('@')[0])?.userId;
    };
    const annId = await idOf('ann@example.com');
    const transfer = (cookie: string, userId: unknown) =>
      send(app, cookie, 'POST', `/api/clubs/${club.id}/transfer`, { userId });

    // Only the owner can hand it over, and only to an active member.
    expect((await transfer(bob.cookie, annId)).status).toBe(403);
    expect((await transfer(owner.cookie, 'nobody')).status).toBe(400);
    expect((await transfer(outsider.cookie, annId)).status).toBe(404);

    const res = await transfer(owner.cookie, annId);
    expect(res.status).toBe(200);
    expect(clubSchema.parse(await res.json()).role).toBe('organiser');
    const asAnn = clubSchema.parse(
      await (await get(app, `/api/clubs/${club.id}`, ann.cookie)).json(),
    );
    expect(asAnn.role).toBe('owner');
    expect(
      asAnn.members.filter((m) => m.role === 'owner').map((m) => m.userId),
    ).toEqual([annId]);

    // The old owner can now leave; the new one can't hand it back twice.
    expect(
      (
        await send(
          app,
          owner.cookie,
          'DELETE',
          `/api/clubs/${club.id}/members/me`,
        )
      ).status,
    ).toBe(204);
    expect((await transfer(owner.cookie, annId)).status).toBe(404);
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
          { status: 'going' },
        )
      ).json(),
    );
    expect(rsvp).toMatchObject({
      going: 1,
      myRsvp: { status: 'going' },
      attendees: [{ name: 'ann', status: 'going' }],
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

  it('keeps settings an edit didn’t mention', async () => {
    const { app } = setup();
    const { cookie } = await signUp(app, 'owner@example.com');
    const club = await createClub(app, cookie, { requireApproval: true });
    const renamed = clubSchema.parse(
      await (
        await send(app, cookie, 'PATCH', `/api/clubs/${club.id}`, {
          name: 'Renamed',
        })
      ).json(),
    );
    expect(renamed.requireApproval).toBe(true);

    const series = seriesSchema.parse(
      await (
        await send(app, cookie, 'POST', `/api/clubs/${club.id}/series`, {
          title: 'Fortnightly',
          days: ['SA'],
          interval: 2,
          startsOn: today(),
          startTime: '08:00',
          orderCutoffMin: 30,
        })
      ).json(),
    );
    const edited = seriesSchema.parse(
      await (
        await send(
          app,
          cookie,
          'PATCH',
          `/api/clubs/${club.id}/series/${series.id}`,
          { title: 'Every other Saturday' },
        )
      ).json(),
    );
    expect(edited).toMatchObject({ interval: 2, orderCutoffMin: 30 });
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

function image(format: 'png' | 'jpeg' | 'webp' | 'gif', width = 400) {
  return sharp({
    create: { width, height: 200, channels: 3, background: '#3366cc' },
  })
    .toFormat(format)
    .toBuffer();
}

function uploadLogo(
  app: App,
  cookie: string,
  clubId: string,
  bytes: Uint8Array,
  name = 'logo.png',
  fields: Record<string, string> = {},
) {
  const form = new FormData();
  form.append('logo', new File([bytes], name));
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return app.request(`/api/clubs/${clubId}/logo`, {
    method: 'PUT',
    headers: { cookie, origin },
    body: form,
  });
}

describe('club logos', () => {
  it('lets organisers upload, replace and remove a square logo', async () => {
    const { app, config } = setup();
    const owner = await signUp(app, 'owner@example.com');
    const ann = await signUp(app, 'ann@example.com');
    const club = await createClub(app, owner.cookie);
    expect(club.logoUrl).toBeNull();
    await send(app, ann.cookie, 'POST', '/api/clubs/join', {
      code: club.joinCode,
    });

    // A plain member can't; once Ann is an organiser she can.
    expect(
      (await uploadLogo(app, ann.cookie, club.id, await image('png'))).status,
    ).toBe(403);
    const annId = clubSchema
      .parse(
        await (await get(app, `/api/clubs/${club.id}`, owner.cookie)).json(),
      )
      .members.find((m) => m.name === 'ann')?.userId;
    const promote = await send(
      app,
      owner.cookie,
      'PATCH',
      `/api/clubs/${club.id}/members/${annId}`,
      { role: 'organiser' },
    );
    expect(promote.status).toBe(200);
    const res = await uploadLogo(app, ann.cookie, club.id, await image('png'));
    expect(res.status).toBe(200);
    const { logoUrl } = clubLogoSchema.parse(await res.json());
    expect(logoUrl).toMatch(
      new RegExp(`^/api/clubs/${club.id}/logo\\?v=\\d+$`),
    );

    // Stored under DATA_DIR as a 256 px WebP square, whatever was uploaded.
    const stored = join(config.dataDir, 'clubs', club.id, 'logo.webp');
    expect(existsSync(stored)).toBe(true);
    const served = await get(app, logoUrl as string, owner.cookie);
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('image/webp');
    const meta = await sharp(
      Buffer.from(await served.arrayBuffer()),
    ).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 256, height: 256 });

    // Everywhere the club appears gets the URL.
    const list = (await (
      await get(app, '/api/clubs', owner.cookie)
    ).json()) as ClubSummary[];
    expect(list[0].logoUrl).toBe(logoUrl);

    // Replacing changes the URL, so caches never show the old one.
    const replaced = clubLogoSchema.parse(
      await (
        await uploadLogo(
          app,
          owner.cookie,
          club.id,
          await image('jpeg'),
          'x.jpg',
        )
      ).json(),
    );
    expect(replaced.logoUrl).not.toBe(logoUrl);

    const removed = await send(
      app,
      ann.cookie,
      'DELETE',
      `/api/clubs/${club.id}/logo`,
    );
    expect(clubLogoSchema.parse(await removed.json()).logoUrl).toBeNull();
    expect(existsSync(stored)).toBe(false);
    expect((await get(app, logoUrl as string, owner.cookie)).status).toBe(404);
  });

  it('checks the bytes, not the name, and caps the size', async () => {
    const { app } = setup();
    const owner = await signUp(app, 'owner@example.com');
    const club = await createClub(app, owner.cookie);
    const upload = (bytes: Uint8Array, name?: string) =>
      uploadLogo(app, owner.cookie, club.id, bytes, name);

    expect((await upload(await image('webp'), 'logo.webp')).status).toBe(200);
    // A JPEG called .png is fine; text called .png and a GIF are not.
    expect((await upload(await image('jpeg'), 'logo.png')).status).toBe(200);
    expect(
      (await upload(new TextEncoder().encode('<svg></svg>'), 'logo.png'))
        .status,
    ).toBe(415);
    expect((await upload(await image('gif'), 'logo.gif')).status).toBe(415);
    // Looks like a PNG, isn't one.
    const fake = new Uint8Array(64);
    fake.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect((await upload(fake)).status).toBe(400);
    const huge = new Uint8Array(2 * 1024 * 1024 + 1);
    huge.set(await image('png'));
    expect((await upload(huge)).status).toBe(413);
  });

  it('keeps the chosen area, or fits the whole image', async () => {
    const { app, config } = setup();
    const owner = await signUp(app, 'ann@example.com');
    const club = await createClub(app, owner.cookie);
    // A wordmark-shaped image: red on the left half, blue on the right.
    const wide = await sharp({
      create: { width: 400, height: 200, channels: 3, background: '#ff0000' },
    })
      .composite([
        {
          input: {
            create: {
              width: 200,
              height: 200,
              channels: 3,
              background: '#0000ff',
            },
          },
          left: 200,
          top: 0,
        },
      ])
      .png()
      .toBuffer();
    const stored = join(config.dataDir, 'clubs', club.id, 'logo.webp');
    /** The colour at a point, as fractions across and down the square. */
    const pixel = async (x: number, y: number) => {
      const { data, info } = await sharp(readFileSync(stored))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const at =
        (Math.floor(y * (info.height - 1)) * info.width +
          Math.floor(x * (info.width - 1))) *
        4;
      return [...data.subarray(at, at + 4)];
    };
    const red = (p: number[]) => p[0] > 200 && p[2] < 50 && p[3] > 200;
    const blue = (p: number[]) => p[2] > 200 && p[0] < 50 && p[3] > 200;

    // Nothing chosen: the middle square, half red, half blue.
    await uploadLogo(app, owner.cookie, club.id, wide);
    expect(red(await pixel(0.1, 0.5))).toBe(true);
    expect(blue(await pixel(0.9, 0.5))).toBe(true);

    // The right-hand square only.
    const right = await uploadLogo(app, owner.cookie, club.id, wide, 'l.png', {
      fit: 'fill',
      x: '0.5',
      y: '0',
      width: '0.5',
      height: '1',
    });
    expect(right.status).toBe(200);
    expect(blue(await pixel(0.1, 0.5))).toBe(true);
    expect(blue(await pixel(0.9, 0.5))).toBe(true);

    // The whole image, padded above and below with transparency.
    await uploadLogo(app, owner.cookie, club.id, wide, 'l.png', {
      fit: 'whole',
    });
    expect(red(await pixel(0.1, 0.5))).toBe(true);
    expect(blue(await pixel(0.9, 0.5))).toBe(true);
    expect((await pixel(0.5, 0.05))[3]).toBe(0);
    expect((await pixel(0.5, 0.95))[3]).toBe(0);

    // An area outside the image is refused, and the logo is left as it was.
    const bad = await uploadLogo(app, owner.cookie, club.id, wide, 'l.png', {
      fit: 'fill',
      x: '1.5',
      y: '0',
      width: '0',
      height: '1',
    });
    expect(bad.status).toBe(400);
    expect((await pixel(0.5, 0.05))[3]).toBe(0);
  });

  it('shows the logo to members and invitees only', async () => {
    const { app, config } = setup();
    const owner = await signUp(app, 'owner@example.com');
    const bob = await signUp(app, 'bob@example.com');
    const eve = await signUp(app, 'eve@example.com');
    const club = await createClub(app, owner.cookie, { requireApproval: true });
    const { logoUrl } = clubLogoSchema.parse(
      await (
        await uploadLogo(app, owner.cookie, club.id, await image('png'))
      ).json(),
    );

    // Not a member: nothing, not even that there's a logo.
    expect((await get(app, logoUrl as string, eve.cookie)).status).toBe(404);
    expect((await get(app, logoUrl as string)).status).toBe(401);

    // The invite page shows it to anyone with the link.
    const preview = clubPreviewSchema.parse(
      await (
        await get(app, `/api/clubs/preview/${club.joinCode}`, eve.cookie)
      ).json(),
    );
    expect(preview.logoUrl).toMatch(/^\/api\/clubs\/preview\//);
    expect((await get(app, preview.logoUrl as string, eve.cookie)).status).toBe(
      200,
    );

    // Someone waiting for approval sees it in their club list.
    await send(app, bob.cookie, 'POST', '/api/clubs/join', {
      code: club.joinCode,
    });
    expect((await get(app, logoUrl as string, bob.cookie)).status).toBe(200);

    // A new join code stops the old invite link showing it.
    await send(app, owner.cookie, 'POST', `/api/clubs/${club.id}/join-code`);
    expect((await get(app, preview.logoUrl as string, eve.cookie)).status).toBe(
      404,
    );

    // Deleting the club deletes the file.
    await send(app, owner.cookie, 'DELETE', `/api/clubs/${club.id}`);
    expect(existsSync(join(config.dataDir, 'clubs', club.id))).toBe(false);
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
