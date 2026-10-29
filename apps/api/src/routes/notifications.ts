import { zValidator } from '@hono/zod-validator';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { type Db, schema } from '@openrun/db';
import {
  type NotificationSettings,
  pushSubscriptionInputSchema,
  removePushSubscriptionSchema,
  updateNotificationSettingsSchema,
} from '@openrun/schemas';
import { type AuthedEnv, requireUser } from '../context.js';

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  runReminder: 'auto',
  coffeeNudge: true,
  runChanges: true,
  joinRequests: true,
};

export function getNotificationSettings(
  db: Db,
  userId: string,
): NotificationSettings {
  const row = db
    .select()
    .from(schema.notificationSettings)
    .where(eq(schema.notificationSettings.userId, userId))
    .get();
  return row
    ? {
        runReminder: row.runReminder,
        coffeeNudge: row.coffeeNudge,
        runChanges: row.runChanges,
        joinRequests: row.joinRequests,
      }
    : DEFAULT_NOTIFICATION_SETTINGS;
}

export const notificationRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .get('/key', (c) => c.json({ publicKey: c.get('notifier').publicKey }))
  .post(
    '/subscriptions',
    zValidator('json', pushSubscriptionInputSchema),
    (c) => {
      const { endpoint, keys } = c.req.valid('json');
      const values = {
        userId: c.get('user').id,
        p256dh: keys.p256dh,
        auth: keys.auth,
      };
      // A device belongs to whoever subscribed it last.
      c.get('db')
        .insert(schema.pushSubscription)
        .values({ ...values, endpoint })
        .onConflictDoUpdate({
          target: schema.pushSubscription.endpoint,
          set: values,
        })
        .run();
      return c.body(null, 204);
    },
  )
  .delete(
    '/subscriptions',
    zValidator('json', removePushSubscriptionSchema),
    (c) => {
      c.get('db')
        .delete(schema.pushSubscription)
        .where(
          and(
            eq(schema.pushSubscription.endpoint, c.req.valid('json').endpoint),
            eq(schema.pushSubscription.userId, c.get('user').id),
          ),
        )
        .run();
      return c.body(null, 204);
    },
  )
  .get('/settings', (c) =>
    c.json(getNotificationSettings(c.get('db'), c.get('user').id)),
  )
  .patch(
    '/settings',
    zValidator('json', updateNotificationSettingsSchema),
    (c) => {
      const userId = c.get('user').id;
      const next = {
        ...getNotificationSettings(c.get('db'), userId),
        ...c.req.valid('json'),
      };
      c.get('db')
        .insert(schema.notificationSettings)
        .values({ ...next, userId })
        .onConflictDoUpdate({
          target: schema.notificationSettings.userId,
          set: next,
        })
        .run();
      return c.json(next);
    },
  )
  /** Sends a test notification to all of my devices. */
  .post('/test', async (c) => {
    await c.get('notifier').notify([c.get('user').id], {
      title: 'Notifications are on',
      body: `You'll hear from ${c.get('config').instanceName} about your club runs here.`,
      url: '/settings',
      tag: 'test',
    });
    return c.body(null, 204);
  });
