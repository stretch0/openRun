import { z } from 'zod';
import { editSchema } from './patch.js';

/** When to remind you about runs you're going to. See libs/domain/reminders. */
export const reminderPrefSchema = z.enum([
  'auto',
  '1h',
  '2h',
  'evening',
  'off',
]);
export type ReminderPrefInput = z.infer<typeof reminderPrefSchema>;

export const notificationSettingsSchema = z.object({
  runReminder: reminderPrefSchema,
  /** A nudge before coffee orders close, if you're going and haven't ordered. */
  coffeeNudge: z.boolean(),
  /** A run you're going to (or might) is cancelled, moved or taken off. */
  runChanges: z.boolean(),
  /** Someone asks to join a club you organise. */
  joinRequests: z.boolean(),
});
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

export const updateNotificationSettingsSchema = editSchema(
  notificationSettingsSchema,
);
export type UpdateNotificationSettings = z.infer<
  typeof updateNotificationSettingsSchema
>;

export const pushKeySchema = z.object({
  /** VAPID public key; null when this server can't send notifications. */
  publicKey: z.string().nullable(),
});

/** The browser's PushSubscription, as from subscription.toJSON(). */
export const pushSubscriptionInputSchema = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInputSchema>;

export const removePushSubscriptionSchema = z.object({
  endpoint: z.string(),
});
