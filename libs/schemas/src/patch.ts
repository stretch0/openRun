import { z } from 'zod';

type WithoutDefaults<S extends z.ZodRawShape> = {
  [K in keyof S]: S[K] extends z.ZodDefault<infer Inner> ? Inner : S[K];
};

/**
 * The schema for editing: every field optional and no defaults. Zod's own
 * `.partial()` keeps defaults, so an edit that leaves a field out would
 * quietly reset it.
 */
export function editSchema<S extends z.ZodRawShape>(schema: z.ZodObject<S>) {
  const shape = Object.fromEntries(
    Object.entries(schema.shape).map(([key, field]) => [
      key,
      field instanceof z.ZodDefault ? field.unwrap() : field,
    ]),
  ) as WithoutDefaults<S>;
  return z.object(shape).partial();
}
