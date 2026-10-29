import { serve } from '@hono/node-server';
import { createDb, runMigrations } from '@openrun/db';
import { createApp } from './app.js';
import { createAuth } from './auth.js';
import { loadConfig } from './config.js';
import { Notifier, webPushSender } from './push.js';
import { startScheduler } from './scheduler.js';
import { version } from './version.js';

const config = loadConfig();
const db = createDb(config.databasePath);
runMigrations(db, config.migrationsDir);

const auth = createAuth(db, config);
const notifier = new Notifier(db, webPushSender(config));
const app = createApp({ db, auth, config, notifier });
const scheduler = startScheduler({ db, notifier, config });

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(
    `openRun ${version} listening on http://localhost:${info.port} (origin ${config.origin})`,
  );
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    scheduler.stop();
    server.close();
    db.$client.close();
    process.exit(0);
  });
}
