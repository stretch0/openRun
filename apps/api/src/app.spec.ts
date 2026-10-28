import { fileURLToPath } from 'node:url';
import { createDb, runMigrations } from '@openrun/db';
import { createApp } from './app.js';
import { createAuth } from './auth.js';
import { loadConfig } from './config.js';

const migrationsDir = fileURLToPath(
  new URL('../../../libs/db-migrations/migrations', import.meta.url),
);

function setup(env: Record<string, string> = {}) {
  const config = loadConfig({
    DATABASE_URL: ':memory:',
    MIGRATIONS_DIR: migrationsDir,
    LOG_REQUESTS: 'false',
    ...env,
  });
  const db = createDb(config.databasePath);
  runMigrations(db, config.migrationsDir);
  const app = createApp({ db, auth: createAuth(db, config), config });
  return { app, db };
}

type App = ReturnType<typeof setup>['app'];

const origin = 'http://localhost:3000';

async function signUp(app: App, email: string, extra: object = {}) {
  const res = await app.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({
      name: email.split('@')[0],
      email,
      password: 'correct horse battery',
      ...extra,
    }),
  });
  const cookie = res.headers.get('set-cookie')?.split(';')[0] ?? '';
  return { res, cookie };
}

function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

function get(app: App, path: string, cookie = '') {
  return app.request(path, { headers: { cookie } });
}

describe('api', () => {
  it('reports health', async () => {
    const { app } = setup();
    const res = await get(app, '/api/health');
    expect(await json(res)).toEqual({ ok: true });
  });

  it('makes the first user an admin and later users members', async () => {
    const { app } = setup();
    expect((await json(await get(app, '/api/instance'))).needsSetup).toBe(true);

    const first = await signUp(app, 'first@example.com');
    expect(first.res.status).toBe(200);
    const me = await json(await get(app, '/api/me', first.cookie));
    expect(me).toMatchObject({ email: 'first@example.com', role: 'admin' });

    const second = await signUp(app, 'second@example.com');
    const me2 = await json(await get(app, '/api/me', second.cookie));
    expect(me2.role).toBe('member');

    expect((await get(app, '/api/admin/invites', second.cookie)).status).toBe(
      403,
    );
  });

  it('rejects unauthenticated requests', async () => {
    const { app } = setup();
    expect((await get(app, '/api/me')).status).toBe(401);
  });

  it('requires a valid invite when INVITE_ONLY is set', async () => {
    const { app } = setup({ INVITE_ONLY: 'true' });
    const admin = await signUp(app, 'admin@example.com');

    const rejected = await signUp(app, 'nobody@example.com');
    expect(rejected.res.status).toBe(403);

    const invite = await json(
      await app.request('/api/admin/invites', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: admin.cookie },
        body: JSON.stringify({}),
      }),
    );

    const accepted = await signUp(app, 'friend@example.com', {
      inviteCode: invite.code,
    });
    expect(accepted.res.status).toBe(200);

    // An invite can only be used once.
    const reused = await signUp(app, 'other@example.com', {
      inviteCode: invite.code,
    });
    expect(reused.res.status).toBe(403);
  });

  it('updates profile settings', async () => {
    const { app } = setup();
    const { cookie } = await signUp(app, 'runner@example.com');
    const res = await app.request('/api/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ units: 'imperial' }),
    });
    expect((await json(res)).units).toBe('imperial');
  });
});
