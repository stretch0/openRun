import { integer, text } from 'drizzle-orm/sqlite-core';

export const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

export const timestamp = (name: string) =>
  integer(name, { mode: 'timestamp_ms' });

export const timestamps = {
  createdAt: timestamp('created_at')
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at')
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
};
