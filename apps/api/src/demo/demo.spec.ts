import { describe, expect, it } from 'vitest';
import { schema } from '@openrun/db';
import { get, json, origin, send, setup, signUp } from '../test-utils.js';
import { resetDemo } from './reset.js';
import { DEMO_LOGIN } from './seed.js';

const NOW = new Date('2026-10-30T12:00:00Z');

async function signInAsSam(app: ReturnType<typeof setup>['app']) {
  const res = await app.request('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify(DEMO_LOGIN),
  });
  expect(res.status).toBe(200);
  return res.headers.get('set-cookie')?.split(';')[0] ?? '';
}

describe('demo mode', () => {
  it('seeds a runner with a club, and resets to the same', async () => {
    const { app, db, config } = setup({ DEMO_MODE: 'true' });
    await resetDemo(db, config, NOW);
    expect(db.select().from(schema.session).all()).toEqual([]);

    const cookie = await signInAsSam(app);
    const list = async () =>
      (await json(await get(app, '/api/activities?limit=100', cookie)))
        .items as unknown[];
    const runs = (await list()).length;
    expect(runs).toBeGreaterThan(40);
    const clubs = (await (await get(app, '/api/clubs', cookie)).json()) as {
      id: string;
      memberCount: number;
      role: string;
      nextRun: unknown;
    }[];
    expect(clubs).toEqual([
      expect.objectContaining({ memberCount: 7, role: 'organiser' }),
    ]);
    expect(clubs[0].nextRun).not.toBeNull();

    // Visitors' changes go at the next reset.
    await send(app, cookie, 'PATCH', '/api/me', { name: 'Someone else' });
    await resetDemo(db, config, NOW);
    const again = await signInAsSam(app);
    expect(await json(await get(app, '/api/me', again))).toMatchObject({
      name: 'Sam Rivera',
    });
    expect(
      (
        (await json(await get(app, '/api/activities?limit=100', again)))
          .items as unknown[]
      ).length,
    ).toBe(runs);
  }, 60_000);

  it('shares the login but keeps visitors away from accounts and uploads', async () => {
    const { app, db, config } = setup({ DEMO_MODE: 'true' });
    await resetDemo(db, config, NOW);
    expect(await json(await get(app, '/api/instance'))).toMatchObject({
      demo: DEMO_LOGIN,
    });

    const { res } = await signUp(app, 'visitor@example.com');
    expect(res.status).toBe(403);
    const cookie = await signInAsSam(app);
    for (const [method, path, body] of [
      [
        'POST',
        '/api/auth/change-password',
        {
          currentPassword: DEMO_LOGIN.password,
          newPassword: 'mine now, all mine',
        },
      ],
      ['POST', '/api/auth/delete-user', {}],
      ['POST', '/api/activities/import', undefined],
      ['PUT', '/api/integrations/intervals', { apiKey: 'x' }],
      ['POST', '/api/admin/invites', {}],
      ['POST', '/api/notifications/subscriptions', {}],
    ] as const) {
      expect((await send(app, cookie, method, path, body)).status, path).toBe(
        403,
      );
    }
    // Everything else works as normal.
    expect((await get(app, '/api/stats', cookie)).status).toBe(200);
    expect(
      (await send(app, cookie, 'PATCH', '/api/me', { units: 'imperial' }))
        .status,
    ).toBe(200);
  }, 60_000);

  it('is off by default', async () => {
    const { app } = setup();
    expect(await json(await get(app, '/api/instance'))).toMatchObject({
      demo: null,
    });
    expect((await signUp(app, 'ann@example.com')).res.status).toBe(200);
  });
});
