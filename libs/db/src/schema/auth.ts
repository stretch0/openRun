import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { id, timestamp, timestamps } from './columns.js';

// Tables used by Better Auth (user, session, account, verification, passkey).
// Column property names must match Better Auth's field names.

export const user = sqliteTable('user', {
  id: id(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' })
    .notNull()
    .default(false),
  image: text('image'),
  role: text('role', { enum: ['admin', 'member'] })
    .notNull()
    .default('member'),
  units: text('units', { enum: ['metric', 'imperial'] })
    .notNull()
    .default('metric'),
  timezone: text('timezone').notNull().default('UTC'),
  ...timestamps,
});

export const session = sqliteTable(
  'session',
  {
    id: id(),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (t) => [index('session_user_id_idx').on(t.userId)],
);

export const account = sqliteTable(
  'account',
  {
    id: id(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    ...timestamps,
  },
  (t) => [index('account_user_id_idx').on(t.userId)],
);

export const verification = sqliteTable(
  'verification',
  {
    id: id(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    ...timestamps,
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);

export const passkey = sqliteTable(
  'passkey',
  {
    id: id(),
    name: text('name'),
    publicKey: text('public_key').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    credentialID: text('credential_id').notNull(),
    counter: integer('counter').notNull(),
    deviceType: text('device_type').notNull(),
    backedUp: integer('backed_up', { mode: 'boolean' }).notNull(),
    transports: text('transports'),
    aaguid: text('aaguid'),
    createdAt: timestamp('created_at'),
  },
  (t) => [
    index('passkey_user_id_idx').on(t.userId),
    index('passkey_credential_id_idx').on(t.credentialID),
  ],
);

// openRun-specific identity tables.

export const invite = sqliteTable('invite', {
  id: id(),
  code: text('code').notNull().unique(),
  email: text('email'),
  createdBy: text('created_by').references(() => user.id, {
    onDelete: 'set null',
  }),
  usedBy: text('used_by').references(() => user.id, { onDelete: 'set null' }),
  usedAt: timestamp('used_at'),
  expiresAt: timestamp('expires_at'),
  ...timestamps,
});

/** Personal access tokens, used by MCP clients. Only the hash is stored. */
export const apiToken = sqliteTable(
  'api_token',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    scope: text('scope', { enum: ['read', 'write'] })
      .notNull()
      .default('read'),
    lastUsedAt: timestamp('last_used_at'),
    expiresAt: timestamp('expires_at'),
    ...timestamps,
  },
  (t) => [index('api_token_user_id_idx').on(t.userId)],
);
