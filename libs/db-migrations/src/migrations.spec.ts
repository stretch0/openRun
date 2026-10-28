import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { createDb, runMigrations, schema } from '@openrun/db';
const { activity, user } = schema;

const migrationsFolder = fileURLToPath(
  new URL('../migrations', import.meta.url),
);

describe('db', () => {
  it('applies migrations and enforces foreign keys', () => {
    const db = createDb(':memory:');
    runMigrations(db, migrationsFolder);
    // Running again is a no-op.
    runMigrations(db, migrationsFolder);

    const [u] = db
      .insert(user)
      .values({ name: 'Ada', email: 'ada@example.com' })
      .returning()
      .all();
    expect(u.role).toBe('member');

    db.insert(activity)
      .values({
        userId: u.id,
        source: 'manual',
        name: 'Morning run',
        startedAt: new Date(),
        distanceM: 5000,
        durationS: 1500,
      })
      .run();

    db.delete(user).where(eq(user.id, u.id)).run();
    expect(db.select().from(activity).all()).toHaveLength(0);
  });
});
