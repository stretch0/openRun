import { z } from 'zod';

/** Who besides the owner may see a run. `public` comes after v0.1. */
export const visibilitySchema = z.enum(['private', 'clubs']);
export type Visibility = z.infer<typeof visibilitySchema>;

export const privacySettingsSchema = z.object({
  defaultVisibility: visibilitySchema,
  /** Whether shared runs include the privacy-zoned map, or just numbers. */
  shareMap: z.boolean(),
});
export type PrivacySettings = z.infer<typeof privacySettingsSchema>;

export const updatePrivacySettingsSchema = privacySettingsSchema.partial();
export type UpdatePrivacySettings = z.infer<typeof updatePrivacySettingsSchema>;

/** A privacy zone as its owner drew it. The randomised edge is never sent. */
export const privacyZoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  radiusM: z.number(),
});
export type PrivacyZone = z.infer<typeof privacyZoneSchema>;

export const createPrivacyZoneSchema = z.object({
  name: z.string().trim().min(1).max(100),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusM: z.number().min(200).max(1000).default(500),
});
export type CreatePrivacyZone = z.infer<typeof createPrivacyZoneSchema>;

/** Sets the visibility of every run the user has. */
export const bulkVisibilitySchema = z.object({ visibility: visibilitySchema });
export type BulkVisibility = z.infer<typeof bulkVisibilitySchema>;
