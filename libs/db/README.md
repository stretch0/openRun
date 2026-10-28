# db

Drizzle ORM schema (`src/schema`) and the database client for openRun (SQLite via better-sqlite3).

Migrations are generated from this schema into `libs/db-migrations`. After changing the schema, run:

```bash
npx nx run db-migrations:generate --name=<description>
```
