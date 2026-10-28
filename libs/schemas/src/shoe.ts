import { z } from 'zod';

export const shoeSchema = z.object({
  id: z.string(),
  name: z.string(),
  brand: z.string().nullable(),
  /** Distance on the shoe before it was added to openRun. */
  startingDistanceM: z.number(),
  /** Starting distance plus every run logged in the shoe. */
  distanceM: z.number(),
  runCount: z.number(),
  retired: z.boolean(),
});
export type Shoe = z.infer<typeof shoeSchema>;

export const createShoeSchema = z.object({
  name: z.string().trim().min(1).max(100),
  brand: z.string().trim().max(100).nullish(),
  startingDistanceM: z.number().min(0).max(10_000_000).default(0),
});
export type CreateShoe = z.infer<typeof createShoeSchema>;

export const updateShoeSchema = createShoeSchema
  .extend({ retired: z.boolean() })
  .partial();
export type UpdateShoe = z.infer<typeof updateShoeSchema>;
