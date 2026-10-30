import { rmSync } from 'node:fs';
import type { Db } from '@openrun/db';
import { createApp } from '../app.js';
import { createAuth } from '../auth.js';
import type { Config } from '../config.js';
import { safePath } from '../data-files.js';
import { seedDemo } from './seed.js';

/**
 * Empties the database and data files, then seeds the demo again. Only
 * for DEMO_MODE: everything anyone did on the demo is lost.
 */
export async function resetDemo(db: Db, config: Config, now = new Date()) {
  const sqlite = db.$client;
  const tables = sqlite
    .prepare(
      "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name != '__drizzle_migrations'",
    )
    .all() as { name: string }[];
  sqlite.pragma('foreign_keys = OFF');
  try {
    sqlite.transaction(() => {
      for (const { name } of tables)
        sqlite.prepare(`delete from "${name}"`).run();
    })();
  } finally {
    sqlite.pragma('foreign_keys = ON');
  }
  for (const dir of ['files', 'clubs']) {
    rmSync(safePath(config.dataDir, dir), { recursive: true, force: true });
  }

  // Seeding goes through the API, without demo mode's limits on visitors.
  const seeding = { ...config, demo: false, logRequests: false };
  const app = createApp({
    db,
    auth: createAuth(db, seeding, { rateLimit: false }),
    config: seeding,
  });
  await seedDemo(app, db, config.origin, now);
}
