import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Db, createDb, runMigrations } from '@openrun/db';
import { fitRun } from '@openrun/activity-files/testing';
import type { ImportResult } from '@openrun/schemas';
import { createApp } from './app.js';
import { createAuth } from './auth.js';
import { type Config, loadConfig } from './config.js';
import { type Notification, Notifier, type PushSender } from './push.js';

const migrationsDir = fileURLToPath(
  new URL('../../../libs/db-migrations/migrations', import.meta.url),
);

/** A notification as a push service would have received it. */
export type SentPush = Notification & { endpoint: string };

/**
 * An app on an in-memory database, with files in a fresh temporary DATA_DIR.
 * Push notifications are recorded in `sent`; endpoints containing "gone"
 * behave like an unsubscribed browser.
 */
export function setup(env: Record<string, string> = {}): {
  app: ReturnType<typeof createApp>;
  db: Db;
  config: Config;
  notifier: Notifier;
  sent: SentPush[];
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
  const sent: SentPush[] = [];
  const sender: PushSender = {
    publicKey: 'test-public-key',
    async send(target, payload) {
      if (target.endpoint.includes('gone')) return 'gone';
      sent.push({ endpoint: target.endpoint, ...JSON.parse(payload) });
      return 'ok';
    },
  };
  const notifier = new Notifier(db, sender);
  const app = createApp({ db, auth: createAuth(db, config), config, notifier });
  return { app, db, config, notifier, sent };
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

/** A JSON request from the web app's origin. */
export function send(
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

/** Imports a synthetic FIT run (51.5, -0.1 heading north) and returns its id. */
export async function importFit(
  app: App,
  cookie: string,
  options?: Parameters<typeof fitRun>[0],
) {
  const form = new FormData();
  form.append('files', new File([fitRun(options)], 'run.fit'));
  const res = await app.request('/api/activities/import', {
    method: 'POST',
    headers: { cookie, origin },
    body: form,
  });
  return ((await res.json()) as ImportResult[])[0].activityId as string;
}
