import {
  blob,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { user } from './auth.js';
import { id, timestamp, timestamps } from './columns.js';

export const activitySources = ['manual', 'file', 'garmin', 'strava'] as const;
export const sportTypes = [
  'run',
  'trail_run',
  'treadmill',
  'track',
  'walk',
  'other',
] as const;

export const shoe = sqliteTable(
  'shoe',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    brand: text('brand'),
    /** Distance already on the shoe before it was added, in metres. */
    startingDistanceM: real('starting_distance_m').notNull().default(0),
    retiredAt: timestamp('retired_at'),
    ...timestamps,
  },
  (t) => [index('shoe_user_id_idx').on(t.userId)],
);

export const activity = sqliteTable(
  'activity',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    source: text('source', { enum: activitySources }).notNull(),
    /** Id in the source system, used to de-duplicate syncs. */
    externalId: text('external_id'),
    sport: text('sport', { enum: sportTypes }).notNull().default('run'),
    name: text('name').notNull(),
    startedAt: timestamp('started_at').notNull(),
    distanceM: real('distance_m').notNull(),
    /** Moving time in seconds. */
    durationS: integer('duration_s').notNull(),
    elapsedS: integer('elapsed_s'),
    elevationGainM: real('elevation_gain_m'),
    avgHeartRate: integer('avg_heart_rate'),
    maxHeartRate: integer('max_heart_rate'),
    avgCadence: integer('avg_cadence'),
    rpe: integer('rpe'),
    notes: text('notes'),
    shoeId: text('shoe_id').references(() => shoe.id, {
      onDelete: 'set null',
    }),
    /** Path of the original FIT/GPX file inside DATA_DIR, if any. */
    originalFile: text('original_file'),
    ...timestamps,
  },
  (t) => [
    index('activity_user_started_idx').on(t.userId, t.startedAt),
    uniqueIndex('activity_source_external_idx').on(
      t.userId,
      t.source,
      t.externalId,
    ),
  ],
);

/** Time-series data for an activity, stored as a compressed JSON blob. */
export const activityStream = sqliteTable('activity_stream', {
  activityId: text('activity_id')
    .primaryKey()
    .references(() => activity.id, { onDelete: 'cascade' }),
  data: blob('data', { mode: 'buffer' }).notNull(),
});

export const lap = sqliteTable(
  'lap',
  {
    id: id(),
    activityId: text('activity_id')
      .notNull()
      .references(() => activity.id, { onDelete: 'cascade' }),
    index: integer('index').notNull(),
    distanceM: real('distance_m').notNull(),
    durationS: integer('duration_s').notNull(),
    avgHeartRate: integer('avg_heart_rate'),
    elevationGainM: real('elevation_gain_m'),
  },
  (t) => [index('lap_activity_id_idx').on(t.activityId)],
);

/**
 * The fastest effort over each standard distance within an activity, one row
 * per activity and distance. A user's personal best is their fastest row, so
 * deleting an activity needs no recalculation.
 */
export const personalBest = sqliteTable(
  'personal_best',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    activityId: text('activity_id')
      .notNull()
      .references(() => activity.id, { onDelete: 'cascade' }),
    /** Standard distance in metres, e.g. 5000. */
    distanceM: integer('distance_m').notNull(),
    durationS: real('duration_s').notNull(),
    achievedAt: timestamp('achieved_at').notNull(),
  },
  (t) => [
    index('personal_best_user_distance_idx').on(t.userId, t.distanceM),
    uniqueIndex('personal_best_activity_distance_idx').on(
      t.activityId,
      t.distanceM,
    ),
  ],
);
