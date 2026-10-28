import { serve } from '@hono/node-server';
import { createDb, runMigrations } from '@openrun/db';
import { createApp } from './app.js';
import { createAuth } from './auth.js';
import { loadConfig } from './config.js';
import { version } from './version.js';

const config = loadConfig();
const db = createDb(config.databasePath);
runMigrations(db, config.migrationsDir);

const auth = createAuth(db, config);
const app = createApp({ db, auth, config });

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(
    `openRun ${version} listening on http://localhost:${info.port} (origin ${config.origin})`,
  );
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close();
    db.$client.close();
    process.exit(0);
  });
}
