import { randomInt } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { type Db, schema } from '@openrun/db';
import type { ClubRole } from '@openrun/schemas';

export type Membership = typeof schema.clubMember.$inferSelect;

export function getMembership(
  db: Db,
  clubId: string,
  userId: string,
): Membership | undefined {
  return db
    .select()
    .from(schema.clubMember)
    .where(
      and(
        eq(schema.clubMember.clubId, clubId),
        eq(schema.clubMember.userId, userId),
      ),
    )
    .get();
}

export function isActive(m: Membership | undefined): m is Membership {
  return m?.status === 'active';
}

/** Organisers and the owner run the club day to day. */
export function canManage(m: Membership | undefined): m is Membership {
  return isActive(m) && (m.role === 'owner' || m.role === 'organiser');
}

/** Whether `actor` may remove or change the role of someone with `target`'s role. */
export function outranks(actor: ClubRole, target: ClubRole) {
  const rank: Record<ClubRole, number> = { owner: 2, organiser: 1, member: 0 };
  return rank[actor] > rank[target];
}

// No 0/O or 1/I/L, so codes are easy to read out at the start of a run.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newJoinCode() {
  return Array.from(
    { length: 8 },
    () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
  ).join('');
}
