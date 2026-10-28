import { z } from 'zod';

export const createInviteSchema = z.object({
  email: z.email().optional(),
  /** Days until the invite expires. */
  expiresInDays: z.number().int().min(1).max(90).default(14),
});
export type CreateInvite = z.infer<typeof createInviteSchema>;

export const inviteSchema = z.object({
  id: z.string(),
  code: z.string(),
  email: z.string().nullable(),
  usedAt: z.iso.datetime().nullable(),
  expiresAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type Invite = z.infer<typeof inviteSchema>;
