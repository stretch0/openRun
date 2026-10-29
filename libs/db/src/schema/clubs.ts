import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { user } from './auth.js';
import { id, timestamp, timestamps } from './columns.js';

// Run clubs. Nothing here references a member's run log (activity and
// friends): clubs only know what members do in the club or choose to share.
// See docs/PRIVACY.md, phase 2.

export const clubRoles = ['owner', 'organiser', 'member'] as const;
export const memberStatuses = ['active', 'pending'] as const;
/** What a member shares with this club. Only attendance until they choose more. */
export const shareLevels = ['attendance', 'summaries', 'full'] as const;
export const rsvpStatuses = ['going', 'maybe', 'not_going'] as const;
export const clubRunStatuses = ['scheduled', 'cancelled'] as const;

/** Same shapes as MenuOption and OrderChoice in libs/domain/coffee. */
type MenuOption = { name: string; choices: string[] };
type OrderChoice = { option: string; choice: string };
/** Same shape as RunWeather in libs/domain/weather. */
type RunWeather = {
  code: number;
  temperatureC: number;
  precipitationChance: number;
  windKmh: number;
};

export const club = sqliteTable('club', {
  id: id(),
  name: text('name').notNull(),
  description: text('description'),
  /** Runs are scheduled in this time zone, so 8am stays 8am across clock changes. */
  timezone: text('timezone').notNull(),
  /** Shared in invite links; organisers can change it to stop old links working. */
  joinCode: text('join_code').notNull().unique(),
  /** New members wait for an organiser to approve them. */
  requireApproval: integer('require_approval', { mode: 'boolean' })
    .notNull()
    .default(false),
  createdBy: text('created_by').references(() => user.id, {
    onDelete: 'set null',
  }),
  ...timestamps,
});

export const clubMember = sqliteTable(
  'club_member',
  {
    id: id(),
    clubId: text('club_id')
      .notNull()
      .references(() => club.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role', { enum: clubRoles }).notNull().default('member'),
    status: text('status', { enum: memberStatuses })
      .notNull()
      .default('active'),
    shareLevel: text('share_level', { enum: shareLevels })
      .notNull()
      .default('attendance'),
    /** No notifications from this club. */
    muted: integer('muted', { mode: 'boolean' }).notNull().default(false),
    /** Appear by name in the club's highlights. Off until they opt in. */
    highlights: integer('highlights', { mode: 'boolean' })
      .notNull()
      .default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('club_member_club_user_idx').on(t.clubId, t.userId),
    index('club_member_user_idx').on(t.userId),
  ],
);

export const clubLocation = sqliteTable(
  'club_location',
  {
    id: id(),
    clubId: text('club_id')
      .notNull()
      .references(() => club.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    lat: real('lat').notNull(),
    lng: real('lng').notNull(),
    /** Where exactly to meet, e.g. "by the bandstand". */
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [index('club_location_club_idx').on(t.clubId)],
);

/** A repeating run. Its dated runs are created ahead of time in club_run. */
export const clubRunSeries = sqliteTable(
  'club_run_series',
  {
    id: id(),
    clubId: text('club_id')
      .notNull()
      .references(() => club.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    /** Weekly RRULE subset, e.g. FREQ=WEEKLY;BYDAY=SA. See libs/domain/schedule. */
    rrule: text('rrule').notNull(),
    /** First day the series runs (YYYY-MM-DD); interval weeks count from here. */
    startsOn: text('starts_on').notNull(),
    /** Local start time, HH:MM in the club's time zone. */
    startTime: text('start_time').notNull(),
    locationId: text('location_id').references(() => clubLocation.id, {
      onDelete: 'set null',
    }),
    notes: text('notes'),
    /** Coffee orders lock this many minutes before each run starts. */
    orderCutoffMin: integer('order_cutoff_min').notNull().default(0),
    /** Stopped series keep their past runs but create no new ones. */
    endedAt: timestamp('ended_at'),
    ...timestamps,
  },
  (t) => [index('club_run_series_club_idx').on(t.clubId)],
);

/** A dated club run, from a series or one-off, so each can be edited or cancelled. */
export const clubRun = sqliteTable(
  'club_run',
  {
    id: id(),
    clubId: text('club_id')
      .notNull()
      .references(() => club.id, { onDelete: 'cascade' }),
    seriesId: text('series_id').references(() => clubRunSeries.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    startsAt: timestamp('starts_at').notNull(),
    locationId: text('location_id').references(() => clubLocation.id, {
      onDelete: 'set null',
    }),
    notes: text('notes'),
    orderCutoffMin: integer('order_cutoff_min').notNull().default(0),
    status: text('status', { enum: clubRunStatuses })
      .notNull()
      .default('scheduled'),
    cancelledReason: text('cancelled_reason'),
    /** The forecast for the start, from Open-Meteo. Null if none yet. */
    weather: text('weather', { mode: 'json' }).$type<RunWeather>(),
    weatherUpdatedAt: timestamp('weather_updated_at'),
    ...timestamps,
  },
  (t) => [
    index('club_run_club_starts_idx').on(t.clubId, t.startsAt),
    // Makes creating a series' runs ahead of time safe to repeat.
    uniqueIndex('club_run_series_starts_idx').on(t.seriesId, t.startsAt),
  ],
);

export const rsvp = sqliteTable(
  'rsvp',
  {
    id: id(),
    clubRunId: text('club_run_id')
      .notNull()
      .references(() => clubRun.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: text('status', { enum: rsvpStatuses }).notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex('rsvp_run_user_idx').on(t.clubRunId, t.userId)],
);

/** Something on the club's café menu. Hidden rather than deleted, so past orders still read. */
export const menuItem = sqliteTable(
  'menu_item',
  {
    id: id(),
    clubId: text('club_id')
      .notNull()
      .references(() => club.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    options: text('options', { mode: 'json' })
      .$type<MenuOption[]>()
      .notNull()
      .default([]),
    hidden: integer('hidden', { mode: 'boolean' }).notNull().default(false),
    ...timestamps,
  },
  (t) => [index('menu_item_club_idx').on(t.clubId)],
);

/**
 * A member's coffee for a run they're going to. The item's name and choices
 * are copied, so later menu changes don't rewrite orders.
 */
export const coffeeOrder = sqliteTable(
  'coffee_order',
  {
    id: id(),
    clubRunId: text('club_run_id')
      .notNull()
      .references(() => clubRun.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    menuItemId: text('menu_item_id').references(() => menuItem.id, {
      onDelete: 'set null',
    }),
    item: text('item').notNull(),
    choices: text('choices', { mode: 'json' })
      .$type<OrderChoice[]>()
      .notNull()
      .default([]),
    ...timestamps,
  },
  (t) => [uniqueIndex('coffee_order_run_user_idx').on(t.clubRunId, t.userId)],
);

/** A member's usual order at a club, optionally added whenever they say they're going. */
export const coffeeUsual = sqliteTable(
  'coffee_usual',
  {
    id: id(),
    clubId: text('club_id')
      .notNull()
      .references(() => club.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    menuItemId: text('menu_item_id')
      .notNull()
      .references(() => menuItem.id, { onDelete: 'cascade' }),
    choices: text('choices', { mode: 'json' })
      .$type<OrderChoice[]>()
      .notNull()
      .default([]),
    autoAdd: integer('auto_add', { mode: 'boolean' }).notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex('coffee_usual_club_user_idx').on(t.clubId, t.userId)],
);

/**
 * A run a member chose to share with a club: a copy, so editing or deleting
 * the original doesn't change it. `sourceId` is the member's activity id,
 * kept so they can withdraw the share; there's deliberately no foreign key
 * into their run log.
 */
export const clubShare = sqliteTable(
  'club_share',
  {
    id: id(),
    clubId: text('club_id')
      .notNull()
      .references(() => club.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    sourceId: text('source_id').notNull(),
    /** The club run it was part of, if it started near one. */
    clubRunId: text('club_run_id').references(() => clubRun.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    startedAt: timestamp('started_at').notNull(),
    distanceM: real('distance_m').notNull(),
    durationS: real('duration_s').notNull(),
    /** [lat, lng] pairs with privacy zones cut out (null), or no map at all. */
    track: text('track', { mode: 'json' }).$type<([number, number] | null)[]>(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('club_share_club_source_idx').on(t.clubId, t.sourceId),
    index('club_share_run_idx').on(t.clubRunId),
  ],
);
