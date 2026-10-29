import { z } from 'zod';

export const placeSearchSchema = z.object({
  q: z.string().trim().min(2).max(200),
  /** Prefer results near here, e.g. the club's other meeting points. */
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});
export type PlaceSearch = z.infer<typeof placeSearchSchema>;

export const placeSchema = z.object({
  /** Short name, e.g. "Victoria Park". */
  name: z.string(),
  /** The full address, to tell results apart. */
  address: z.string(),
  lat: z.number(),
  lng: z.number(),
});
export type Place = z.infer<typeof placeSchema>;
