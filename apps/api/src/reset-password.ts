/**
 * Resets a user's password from the server. There is deliberately no way to
 * do this from inside the app (see docs/PRIVACY.md): only someone who can run
 * commands where openRun is installed, and so could already read its
 * database, can reset a password.
 *
 *   docker compose exec openrun node reset-password.js you@example.com
 *
 * Prints a one-off temporary password and signs the user out everywhere.
 */
import { randomBytes } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { and, eq } from 'drizzle-orm';
import { createDb, schema } from '@openrun/db';
import { loadConfig } from './config.js';

export async function resetPassword(
  db: ReturnType<typeof createDb>,
  email: string,
): Promise<string | null> {
  const user = db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, email.trim().toLowerCase()))
    .get();
  if (!user) return null;

  const temporary = randomBytes(12).toString('base64url');
  const hash = await hashPassword(temporary);
  db.transaction((tx) => {
    const credential = and(
      eq(schema.account.userId, user.id),
      eq(schema.account.providerId, 'credential'),
    );
    const existing = tx.select().from(schema.account).where(credential).get();
    if (existing) {
      tx.update(schema.account).set({ password: hash }).where(credential).run();
    } else {
      // Passkey-only accounts get a password so they can sign in again.
      tx.insert(schema.account)
        .values({
          userId: user.id,
          accountId: user.id,
          providerId: 'credential',
          password: hash,
        })
        .run();
    }
    tx.delete(schema.session).where(eq(schema.session.userId, user.id)).run();
  });
  return temporary;
}

async function main() {
  const email = process.argv[2];
  if (!email || email.startsWith('-')) {
    console.error('Usage: node reset-password.js <email>');
    process.exit(2);
  }
  const config = loadConfig();
  const db = createDb(config.databasePath);
  const temporary = await resetPassword(db, email);
  db.$client.close();
  if (!temporary) {
    console.error(`No account with the email ${email}.`);
    process.exit(1);
  }
  console.log(`Password reset for ${email}. They've been signed out everywhere.

Temporary password: ${temporary}

Send it to them privately. They should sign in and change it in Settings.`);
}

// Only run when called as a script, not when imported by tests.
if (process.argv[1]?.endsWith('reset-password.js')) {
  await main();
}
