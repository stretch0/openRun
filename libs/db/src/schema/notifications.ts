import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { user } from './auth.js';
import { id, timestamp, timestamps } from './columns.js';

/** Same values as REMINDER_PREFS in libs/domain/reminders. */
export const reminderPrefs = ['auto', '1h', '2h', 'evening', 'off'] as const;

/** A browser or phone that asked for Web Push notifications. */
export const pushSubscription = sqliteTable('push_subscription', {
  id: id(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  ...timestamps,
});

/** What someone wants to be told about. A missing row means the defaults. */
export const notificationSettings = sqliteTable('notification_settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  runReminder: text('run_reminder', { enum: reminderPrefs })
    .notNull()
    .default('auto'),
  coffeeNudge: integer('coffee_nudge', { mode: 'boolean' })
    .notNull()
    .default(true),
  runChanges: integer('run_changes', { mode: 'boolean' })
    .notNull()
    .default(true),
  joinRequests: integer('join_requests', { mode: 'boolean' })
    .notNull()
    .default(true),
  ...timestamps,
});

/** Notifications already sent, so the scheduler never sends one twice. */
export const notificationSent = sqliteTable(
  'notification_sent',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** e.g. "reminder:<run id>". */
    key: text('key').notNull(),
    sentAt: timestamp('sent_at')
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex('notification_sent_user_key_idx').on(t.userId, t.key)],
);
