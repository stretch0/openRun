import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema/index.js';

export type Db = ReturnType<typeof createDb>;

/** Opens (creating if needed) the SQLite database at `path`. Use ':memory:' in tests. */
export function createDb(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  return drizzle(sqlite, { schema });
}

/**
 * Applies any pending migrations from `migrationsFolder` and returns how many
 * it applied. Idempotent: applied migrations are tracked in
 * `__drizzle_migrations`.
 */
export function runMigrations(db: Db, migrationsFolder: string): number {
  const applied = () => {
    const table = db.$client
      .prepare(
        "select 1 from sqlite_master where type = 'table' and name = '__drizzle_migrations'",
      )
      .get();
    if (!table) return 0;
    const row = db.$client
      .prepare('select count(*) as n from __drizzle_migrations')
      .get() as { n: number };
    return row.n;
  };
  const before = applied();
  migrate(db, { migrationsFolder });
  return applied() - before;
}
