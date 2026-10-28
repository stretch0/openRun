import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Db, createDb, runMigrations } from '@openrun/db';
import { createApp } from './app.js';
import { createAuth } from './auth.js';
import { type Config, loadConfig } from './config.js';

const migrationsDir = fileURLToPath(
  new URL('../../../libs/db-migrations/migrations', import.meta.url),
);

/** An app on an in-memory database, with files in a fresh temporary DATA_DIR. */
export function setup(env: Record<string, string> = {}): {
  app: ReturnType<typeof createApp>;
  db: Db;
  config: Config;
} {
  const config = loadConfig({
    DATABASE_URL: ':memory:',
    DATA_DIR: mkdtempSync(join(tmpdir(), 'openrun-test-')),
    MIGRATIONS_DIR: migrationsDir,
    LOG_REQUESTS: 'false',
    ...env,
  });
  const db = createDb(config.databasePath);
  runMigrations(db, config.migrationsDir);
  const app = createApp({ db, auth: createAuth(db, config), config });
  return { app, db, config };
}

export type App = ReturnType<typeof setup>['app'];

export const origin = 'http://localhost:3000';

export async function signUp(app: App, email: string, extra: object = {}) {
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

export function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

export function get(app: App, path: string, cookie = '') {
  return app.request(path, { headers: { cookie } });
}
