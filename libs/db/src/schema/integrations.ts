import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { user } from './auth.js';
import { activity } from './runs.js';
import { id, timestamp, timestamps } from './columns.js';

export const integrationProviders = ['intervals'] as const;
export const integrationStatuses = ['ok', 'error', 'needs_key'] as const;
export const integrationItemStatuses = [
  'imported',
  'duplicate',
  'failed',
  /** The provider won't hand it over, e.g. intervals.icu with Strava's runs. */
  'unavailable',
] as const;

/** A member's connection to a service that runs are synced from. */
export const integration = sqliteTable(
  'integration',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    provider: text('provider', { enum: integrationProviders }).notNull(),
    /** The account's id at the provider, e.g. intervals.icu's "i12345". */
    accountId: text('account_id').notNull(),
    accountName: text('account_name'),
    /** Encrypted with a key derived from BETTER_AUTH_SECRET. */
    credentials: text('credentials').notNull(),
    /** Runs that started before this aren't imported. */
    syncFrom: timestamp('sync_from').notNull(),
    /**
     * When everything since sync_from was last listed. Recent days are listed
     * every sync; the whole range once a day, to catch history that reaches
     * the provider late (e.g. a watch's older runs after first connecting).
     */
    scannedAt: timestamp('scanned_at'),
    status: text('status', { enum: integrationStatuses })
      .notNull()
      .default('ok'),
    lastError: text('last_error'),
    lastSyncAt: timestamp('last_sync_at'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('integration_user_provider_idx').on(t.userId, t.provider),
    uniqueIndex('integration_account_idx').on(t.provider, t.accountId),
  ],
);

/**
 * Each item seen at the provider, so it's fetched once. Kept after the run is
 * deleted, so a run someone deleted doesn't come back on the next sync.
 */
export const integrationItem = sqliteTable(
  'integration_item',
  {
    id: id(),
    integrationId: text('integration_id')
      .notNull()
      .references(() => integration.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    startedAt: timestamp('started_at').notNull(),
    status: text('status', { enum: integrationItemStatuses }).notNull(),
    activityId: text('activity_id').references(() => activity.id, {
      onDelete: 'set null',
    }),
    error: text('error'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('integration_item_external_idx').on(
      t.integrationId,
      t.externalId,
    ),
  ],
);

/** One sync attempt, for the sync log. Only the latest few are kept. */
export const integrationSync = sqliteTable(
  'integration_sync',
  {
    id: id(),
    integrationId: text('integration_id')
      .notNull()
      .references(() => integration.id, { onDelete: 'cascade' }),
    startedAt: timestamp('started_at').notNull(),
    finishedAt: timestamp('finished_at'),
    imported: integer('imported').notNull().default(0),
    duplicates: integer('duplicates').notNull().default(0),
    failed: integer('failed').notNull().default(0),
    /** Activities the provider won't hand over, e.g. ones that came from Strava. */
    unavailable: integer('unavailable').notNull().default(0),
    /** More runs are waiting; the next sync carries on. */
    more: integer('more', { mode: 'boolean' }).notNull().default(false),
    error: text('error'),
  },
  (t) => [index('integration_sync_idx').on(t.integrationId, t.startedAt)],
);
