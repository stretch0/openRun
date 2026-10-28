// Fails when libs/db's schema has changed without a migration being generated.
// Copies the committed migrations to a temp dir, runs `drizzle-kit generate`
// against the copy and requires it to report that there is nothing to do.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';

// drizzle-kit only handles relative output paths, so the temp dir lives here.
const out = mkdtempSync('.migrations-check-');
try {
  cpSync('migrations', out, { recursive: true });
  const result = spawnSync('npx', ['drizzle-kit', 'generate'], {
    env: { ...process.env, MIGRATIONS_OUT: out },
    encoding: 'utf8',
  });
  const output = `${result.stdout}${result.stderr}`;
  if (result.status !== 0 || !output.includes('No schema changes')) {
    console.error(output);
    console.error(
      'The schema in libs/db has changed but no migration was generated.\n' +
        'Run: npx nx run db-migrations:generate --name=<description>',
    );
    process.exitCode = 1;
  } else {
    console.log('Migrations are in sync with the schema.');
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}
