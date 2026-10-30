import { passkey } from '@better-auth/passkey';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { and, count, eq, gt, isNull, or } from 'drizzle-orm';
import { type Db, schema } from '@openrun/db';
import type { Config } from './config.js';

export type Auth = ReturnType<typeof createAuth>;

export function createAuth(
  db: Db,
  config: Config,
  /** Off for the demo seed, which signs up several people at once. */
  { rateLimit = true } = {},
) {
  return betterAuth({
    appName: config.instanceName,
    baseURL: config.origin,
    basePath: '/api/auth',
    secret: config.authSecret,
    trustedOrigins: config.trustedOrigins,
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        passkey: schema.passkey,
      },
    }),
    emailAndPassword: { enabled: config.passwordLogin },
    ...(rateLimit ? {} : { rateLimit: { enabled: false } }),
    // The app sets X-Forwarded-For itself unless TRUST_PROXY is on (see app.ts).
    advanced: { ipAddress: { ipAddressHeaders: ['x-forwarded-for'] } },
    plugins: [
      passkey({
        rpID: config.rpId,
        rpName: config.instanceName,
        origin: config.trustedOrigins,
      }),
    ],
    user: {
      additionalFields: {
        role: { type: 'string', input: false, defaultValue: 'member' },
        units: { type: 'string', defaultValue: 'metric' },
        timezone: { type: 'string', defaultValue: 'UTC' },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user, ctx) => {
            const [{ users }] = db
              .select({ users: count() })
              .from(schema.user)
              .all();
            if (users === 0) {
              return {
                data: {
                  ...user,
                  role: config.firstUserAdmin ? 'admin' : 'member',
                },
              };
            }
            if (config.inviteOnly) {
              findUsableInvite(db, inviteCodeFrom(ctx?.body), user.email);
            }
            return { data: { ...user, role: 'member' } };
          },
          after: async (user, ctx) => {
            const code = inviteCodeFrom(ctx?.body);
            if (!code) return;
            db.update(schema.invite)
              .set({ usedBy: user.id, usedAt: new Date() })
              .where(
                and(eq(schema.invite.code, code), isNull(schema.invite.usedAt)),
              )
              .run();
          },
        },
      },
    },
  });
}

function inviteCodeFrom(body: unknown): string | undefined {
  if (body && typeof body === 'object' && 'inviteCode' in body) {
    const code = (body as { inviteCode: unknown }).inviteCode;
    return typeof code === 'string' && code ? code : undefined;
  }
  return undefined;
}

function findUsableInvite(db: Db, code: string | undefined, email: string) {
  const invite = code
    ? db
        .select()
        .from(schema.invite)
        .where(
          and(
            eq(schema.invite.code, code),
            isNull(schema.invite.usedAt),
            or(
              isNull(schema.invite.expiresAt),
              gt(schema.invite.expiresAt, new Date()),
            ),
          ),
        )
        .get()
    : undefined;
  if (!invite || (invite.email && invite.email !== email.toLowerCase())) {
    throw new APIError('FORBIDDEN', {
      message: 'A valid invite code is needed to join this instance.',
    });
  }
  return invite;
}
