import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: '../db/src/schema/index.ts',
  out: process.env.MIGRATIONS_OUT ?? './migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '../../data/openrun.db',
  },
  strict: true,
  verbose: true,
});
