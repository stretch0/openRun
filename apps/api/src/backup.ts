/**
 * Copies the database while openRun keeps running. Copying openrun.db by hand
 * while the server is up can miss changes still in the write-ahead log
 * (openrun.db-wal); this uses SQLite's online backup instead.
 *
 *   docker compose exec openrun node backup.js
 *
 * Writes DATA_DIR/backups/openrun-<time>.db, or the path given.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { loadConfig } from './config.js';
import { dropRoot } from './drop-root.js';

export async function backupDatabase(source: string, destination: string) {
  if (existsSync(destination)) {
    throw new Error(`${destination} already exists`);
  }
  mkdirSync(dirname(destination), { recursive: true });
  const db = new Database(source, { readonly: true, fileMustExist: true });
  try {
    await db.backup(destination);
  } finally {
    db.close();
  }
}

/** openrun-2026-10-30T0915.db, in UTC. */
export function backupName(now = new Date()) {
  const stamp = now.toISOString().slice(0, 16).replace(':', '');
  return `openrun-${stamp}.db`;
}

async function main() {
  dropRoot();
  const config = loadConfig();
  const destination =
    process.argv[2] ?? join(config.dataDir, 'backups', backupName());
  try {
    await backupDatabase(config.databasePath, destination);
  } catch (e) {
    console.error(`Backup failed: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
  console.log(`Database backed up to ${destination}`);
}

// Only run when called as a script, not when imported by tests.
if (process.argv[1]?.endsWith('backup.js')) {
  await main();
}
