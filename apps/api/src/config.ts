import { resolve } from 'node:path';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().default(3000),
  /** Public URL the app is served from. Used for auth cookies and passkeys. */
  ORIGIN: z.url().default('http://localhost:3000'),
  /** Extra origins allowed to call the API, comma separated. */
  TRUSTED_ORIGINS: z.string().default(''),
  /** WebAuthn relying party id. Defaults to the ORIGIN hostname. */
  RP_ID: z.string().optional(),
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  DATA_DIR: z.string().default('./data'),
  DATABASE_URL: z.string().optional(),
  MIGRATIONS_DIR: z.string().default('libs/db-migrations/migrations'),
  /** Built web app to serve. Leave unset in development (Vite serves it). */
  WEB_DIR: z.string().optional(),
  INSTANCE_NAME: z.string().default('openRun'),
  /** How members can reach whoever runs this instance, e.g. an email address. */
  INSTANCE_CONTACT: z.string().optional(),
  FIRST_USER_ADMIN: bool.default(true),
  INVITE_ONLY: bool.default(false),
  PASSWORD_LOGIN: bool.default(true),
  LOG_REQUESTS: bool.optional(),
  /** Set when running behind a reverse proxy that sets X-Forwarded-For. */
  TRUST_PROXY: bool.default(false),
});

export type Config = ReturnType<typeof loadConfig>;

const DEV_SECRET = 'openrun-development-secret-do-not-use-in-production';

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const e = envSchema.parse(env);
  const production = e.NODE_ENV === 'production';
  if (production && !e.BETTER_AUTH_SECRET) {
    throw new Error(
      'BETTER_AUTH_SECRET must be set (at least 32 characters). Generate one with: openssl rand -base64 32',
    );
  }
  const dataDir = resolve(e.DATA_DIR);
  return {
    production,
    port: e.PORT,
    origin: e.ORIGIN,
    trustedOrigins: [
      e.ORIGIN,
      // The Vite dev server, which proxies /api to this server.
      ...(production ? [] : ['http://localhost:4200']),
      ...e.TRUSTED_ORIGINS.split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ],
    rpId: e.RP_ID ?? new URL(e.ORIGIN).hostname,
    authSecret: e.BETTER_AUTH_SECRET ?? DEV_SECRET,
    dataDir,
    databasePath: e.DATABASE_URL ?? resolve(dataDir, 'openrun.db'),
    migrationsDir: resolve(e.MIGRATIONS_DIR),
    webDir: e.WEB_DIR ? resolve(e.WEB_DIR) : undefined,
    instanceName: e.INSTANCE_NAME,
    contact: e.INSTANCE_CONTACT?.trim() || null,
    firstUserAdmin: e.FIRST_USER_ADMIN,
    inviteOnly: e.INVITE_ONLY,
    passwordLogin: e.PASSWORD_LOGIN,
    logRequests: e.LOG_REQUESTS ?? !production,
    trustProxy: e.TRUST_PROXY,
  };
}
