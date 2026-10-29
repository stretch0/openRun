import { fitRun } from '@openrun/activity-files/testing';
import {
  type ActivityList,
  type ImportResult,
  activitySchema,
  activityStreamSchema,
  privacySettingsSchema,
  privacyZoneSchema,
} from '@openrun/schemas';
import { resetPassword } from './reset-password.js';
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

async function importFit(app: App, cookie: string) {
  const form = new FormData();
  form.append('files', new File([fitRun()], 'run.fit'));
  const res = await app.request('/api/activities/import', {
    method: 'POST',
    headers: { cookie, origin },
    body: form,
  });
  return ((await res.json()) as ImportResult[])[0].activityId as string;
}

describe('privacy', () => {
  it('keeps runs private by default and follows the default setting', async () => {
    const { app } = setup();
    const { cookie } = await signUp(app, 'runner@example.com');

    const settings = privacySettingsSchema.parse(
      await (await get(app, '/api/privacy/settings', cookie)).json(),
    );
    expect(settings).toEqual({ defaultVisibility: 'private', shareMap: false });

    const first = await importFit(app, cookie);
    const run = activitySchema.parse(
      await (await get(app, `/api/activities/${first}`, cookie)).json(),
    );
    expect(run.visibility).toBe('private');

    await send(app, cookie, 'PATCH', '/api/privacy/settings', {
      defaultVisibility: 'clubs',
    });
    const manual = activitySchema.parse(
      await (
        await send(app, cookie, 'POST', '/api/activities', {
          name: 'Parkrun',
          startedAt: '2026-10-24T08:00:00Z',
          distanceM: 5000,
          durationS: 1500,
        })
      ).json(),
    );
    expect(manual.visibility).toBe('clubs');

    // Change one, then all.
    const one = activitySchema.parse(
      await (
        await send(app, cookie, 'PATCH', `/api/activities/${manual.id}`, {
          visibility: 'private',
        })
      ).json(),
    );
    expect(one.visibility).toBe('private');
    const bulk = await send(
      app,
      cookie,
      'PATCH',
      '/api/activities/visibility',
      {
        visibility: 'clubs',
      },
    );
    expect(await bulk.json()).toEqual({ updated: 2 });
    const list = (await (
      await get(app, '/api/activities', cookie)
    ).json()) as ActivityList;
    expect(list.items.map((a) => a.visibility)).toEqual(['clubs', 'clubs']);
  });

  it('hides the map in shared views unless maps are shared, and trims zones', async () => {
    const { app } = setup();
    const { cookie } = await signUp(app, 'runner@example.com');
    const id = await importFit(app, cookie);
    const stream = async (view: string) =>
      activityStreamSchema.parse(
        await (
          await get(app, `/api/activities/${id}/stream?view=${view}`, cookie)
        ).json(),
      );

    const own = await stream('owner');
    expect(own.lat.every((v) => v !== null)).toBe(true);

    // Maps aren't shared by default.
    expect((await stream('shared')).lat.every((v) => v === null)).toBe(true);

    await send(app, cookie, 'PATCH', '/api/privacy/settings', {
      shareMap: true,
    });
    expect((await stream('shared')).lat.every((v) => v !== null)).toBe(true);

    // The test run starts at 51.5, -0.1 and heads north for 2.1 km.
    const zone = privacyZoneSchema.parse(
      await (
        await send(app, cookie, 'POST', '/api/privacy/zones', {
          name: 'Home',
          lat: 51.5,
          lng: -0.1,
          radiusM: 300,
        })
      ).json(),
    );
    expect(zone).toMatchObject({ name: 'Home', lat: 51.5, radiusM: 300 });
    const shared = await stream('shared');
    // The start is hidden: at least the drawn 300 m is cut. The randomised
    // circle may shift its centre up to 90 m and grow to 450 m, so its far
    // edge is at most 540 m from the drawn centre (plus one sample).
    const hiddenUntil = shared.lat.findIndex((v) => v !== null);
    expect(shared.d[hiddenUntil]).toBeGreaterThan(300);
    expect(shared.d[hiddenUntil]).toBeLessThan(560);
    expect(shared.lat.at(-1)).not.toBeNull();
    // The owner still sees everything.
    expect((await stream('owner')).lat[0]).not.toBeNull();

    // Another user can't see or delete the zone.
    const other = await signUp(app, 'other@example.com');
    expect(
      await (await get(app, '/api/privacy/zones', other.cookie)).json(),
    ).toEqual([]);
    expect(
      (await send(app, other.cookie, 'DELETE', `/api/privacy/zones/${zone.id}`))
        .status,
    ).toBe(404);
    expect(
      (await get(app, `/api/activities/${id}/stream?view=shared`, other.cookie))
        .status,
    ).toBe(404);
  });

  it('rejects zones outside the allowed size', async () => {
    const { app } = setup();
    const { cookie } = await signUp(app, 'runner@example.com');
    const res = await send(app, cookie, 'POST', '/api/privacy/zones', {
      name: 'Too big',
      lat: 51.5,
      lng: -0.1,
      radiusM: 5000,
    });
    expect(res.status).toBe(400);
  });
});

describe('reset-password command', () => {
  it('sets a temporary password and signs the user out', async () => {
    const { app, db } = setup();
    const { cookie } = await signUp(app, 'runner@example.com');
    expect((await get(app, '/api/me', cookie)).status).toBe(200);

    expect(await resetPassword(db, 'nobody@example.com')).toBeNull();
    const temporary = await resetPassword(db, ' Runner@Example.com ');
    expect(temporary).toMatch(/^[\w-]{16}$/);

    // The old session is gone and the old password no longer works.
    expect((await get(app, '/api/me', cookie)).status).toBe(401);
    const signIn = (password: string) =>
      app.request('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin },
        body: JSON.stringify({ email: 'runner@example.com', password }),
      });
    expect((await signIn('correct horse battery')).status).toBe(401);
    expect((await signIn(temporary as string)).status).toBe(200);
  });
});
