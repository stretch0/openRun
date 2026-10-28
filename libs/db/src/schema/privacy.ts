import {
  integer,
  real,
  sqliteTable,
  text,
  index,
} from 'drizzle-orm/sqlite-core';
import { user } from './auth.js';
import { id, timestamps } from './columns.js';

export const visibilities = ['private', 'clubs'] as const;

/** Each user's sharing defaults. A missing row means the defaults below. */
export const privacySettings = sqliteTable('privacy_settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  /** Visibility given to newly imported or added runs. */
  defaultVisibility: text('default_visibility', { enum: visibilities })
    .notNull()
    .default('private'),
  /** Whether shared runs include the (privacy-zoned) map, or just numbers. */
  shareMap: integer('share_map', { mode: 'boolean' }).notNull().default(false),
  ...timestamps,
});

/**
 * A place whose surroundings are hidden from shared tracks. `lat`, `lng` and
 * `radius_m` are what the user drew; the `trim_*` columns are the randomised
 * circle actually applied (see randomiseZone in libs/domain).
 */
export const privacyZone = sqliteTable(
  'privacy_zone',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    lat: real('lat').notNull(),
    lng: real('lng').notNull(),
    radiusM: real('radius_m').notNull(),
    trimLat: real('trim_lat').notNull(),
    trimLng: real('trim_lng').notNull(),
    trimRadiusM: real('trim_radius_m').notNull(),
    ...timestamps,
  },
  (t) => [index('privacy_zone_user_id_idx').on(t.userId)],
);
