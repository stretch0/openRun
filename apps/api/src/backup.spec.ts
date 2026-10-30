import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { createDb } from '@openrun/db';
import { backupDatabase, backupName } from './backup.js';

describe('backup', () => {
  it('copies a live database, including changes still in the WAL', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'openrun-backup-'));
    const source = join(dir, 'openrun.db');
    const live = createDb(source).$client;
    live.exec('create table t (n integer)');
    live.prepare('insert into t values (?)').run(42);

    const destination = join(dir, 'backups', 'copy.db');
    await backupDatabase(source, destination);
    const copy = new Database(destination, { readonly: true });
    expect(copy.prepare('select n from t').all()).toEqual([{ n: 42 }]);
    copy.close();

    // Never overwrites an existing backup.
    await expect(backupDatabase(source, destination)).rejects.toThrow(
      /already exists/,
    );
    live.close();
  });

  it('names backups by time', () => {
    expect(backupName(new Date('2026-10-30T09:15:42Z'))).toBe(
      'openrun-2026-10-30T0915.db',
    );
  });
});
