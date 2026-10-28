import { z } from 'zod';

export const unitsSchema = z.enum(['metric', 'imperial']);
export type Units = z.infer<typeof unitsSchema>;

export const roleSchema = z.enum(['admin', 'member']);
export type Role = z.infer<typeof roleSchema>;

export const meSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  role: roleSchema,
  units: unitsSchema,
  timezone: z.string(),
});
export type Me = z.infer<typeof meSchema>;

export const updateMeSchema = meSchema
  .pick({ name: true, units: true, timezone: true })
  .partial();
export type UpdateMe = z.infer<typeof updateMeSchema>;

/** Instance settings the web app needs before anyone signs in. */
export const instanceInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  inviteOnly: z.boolean(),
  passwordLogin: z.boolean(),
  /** How to reach whoever runs this instance, shown before sign-up. */
  contact: z.string().nullable(),
  /** True until the first account has been created. */
  needsSetup: z.boolean(),
});
export type InstanceInfo = z.infer<typeof instanceInfoSchema>;
