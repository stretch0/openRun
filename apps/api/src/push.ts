import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import webpush from 'web-push';
import { type Db, schema } from '@openrun/db';
import type { Config } from './config.js';

/** What a notification shows. `url` opens when it's tapped. */
export type Notification = {
  title: string;
  body: string;
  url: string;
  /** Replaces an earlier notification with the same tag. */
  tag?: string;
};

export type PushTarget = { endpoint: string; p256dh: string; auth: string };

/** 'gone' means the browser unsubscribed, so the subscription can go. */
export type PushSender = {
  publicKey: string;
  send: (target: PushTarget, payload: string) => Promise<'ok' | 'gone'>;
};

/** VAPID keys from the environment, or made once and kept in DATA_DIR. */
export function vapidKeys(config: Config): webpush.VapidKeys {
  if (config.vapidKeys) return config.vapidKeys;
  const file = join(config.dataDir, 'vapid.json');
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const keys = webpush.generateVAPIDKeys();
  writeFileSync(file, JSON.stringify(keys), { mode: 0o600 });
  return keys;
}

/** Push services want a way to reach whoever runs the server. */
function vapidSubject(config: Config) {
  if (config.contact?.includes('@')) {
    return `mailto:${config.contact.replace(/^mailto:/, '')}`;
  }
  return config.origin.startsWith('https:')
    ? config.origin
    : 'mailto:openrun@localhost';
}

export function webPushSender(config: Config): PushSender {
  const keys = vapidKeys(config);
  const details = {
    subject: vapidSubject(config),
    publicKey: keys.publicKey,
    privateKey: keys.privateKey,
  };
  return {
    publicKey: keys.publicKey,
    async send(target, payload) {
      try {
        await webpush.sendNotification(
          {
            endpoint: target.endpoint,
            keys: { p256dh: target.p256dh, auth: target.auth },
          },
          payload,
          { vapidDetails: details, TTL: 6 * 3600, urgency: 'normal' },
        );
        return 'ok';
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) return 'gone';
        throw e;
      }
    },
  };
}

/**
 * Sends notifications to every device a user subscribed. With a `key`,
 * each user gets it at most once, ever (e.g. one reminder per run).
 */
export class Notifier {
  constructor(
    private db: Db,
    private sender: PushSender | null,
  ) {}

  get publicKey() {
    return this.sender?.publicKey ?? null;
  }

  async notify(
    userIds: string[],
    notification: Notification,
    key?: string,
  ): Promise<void> {
    const users = key ? userIds.filter((id) => this.claim(id, key)) : userIds;
    if (!users.length || !this.sender) return;
    const targets = this.db
      .select()
      .from(schema.pushSubscription)
      .where(inArray(schema.pushSubscription.userId, users))
      .all();
    const payload = JSON.stringify(notification);
    await Promise.all(
      targets.map(async (t) => {
        try {
          if ((await this.sender?.send(t, payload)) === 'gone') {
            this.db
              .delete(schema.pushSubscription)
              .where(eq(schema.pushSubscription.id, t.id))
              .run();
          }
        } catch (e) {
          console.error(`Push to ${new URL(t.endpoint).host} failed:`, e);
        }
      }),
    );
  }

  /** Records that `key` was sent to the user; false if it already was. */
  private claim(userId: string, key: string) {
    return (
      this.db
        .insert(schema.notificationSent)
        .values({ userId, key })
        .onConflictDoNothing()
        .returning()
        .all().length > 0
    );
  }
}
