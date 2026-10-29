import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { type Db, schema } from '@openrun/db';
import type { ClubShare, ShareTarget } from '@openrun/schemas';

// Runs members share with a club. The member's side (routes/activities.ts)
// builds a snapshot and hands it over; this module never reads run logs.

export type Track = ([number, number] | null)[];

export type ShareSnapshot = {
  /** The member's activity id, so the share can be withdrawn. */
  sourceId: string;
  name: string;
  startedAt: Date;
  distanceM: number;
  durationS: number;
};

/** A share counts towards a club run that started within this of it. */
const MATCH_MS = 90 * 60_000;

/** Clubs I'm an active member of, and whether this run is shared with each. */
export function shareTargets(
  db: Db,
  userId: string,
  sourceId: string,
  mapsAllowed: boolean,
): ShareTarget[] {
  const shared = new Set(
    db
      .select({ clubId: schema.clubShare.clubId })
      .from(schema.clubShare)
      .where(
        and(
          eq(schema.clubShare.userId, userId),
          eq(schema.clubShare.sourceId, sourceId),
        ),
      )
      .all()
      .map((s) => s.clubId),
  );
  return db
    .select({
      clubId: schema.club.id,
      clubName: schema.club.name,
      shareLevel: schema.clubMember.shareLevel,
    })
    .from(schema.clubMember)
    .innerJoin(schema.club, eq(schema.club.id, schema.clubMember.clubId))
    .where(
      and(
        eq(schema.clubMember.userId, userId),
        eq(schema.clubMember.status, 'active'),
      ),
    )
    .orderBy(asc(schema.club.name))
    .all()
    .map((t) => ({
      ...t,
      shared: shared.has(t.clubId),
      withMap: mapsAllowed && t.shareLevel === 'full',
    }));
}

/**
 * Shares a run with a club, replacing any earlier copy. The track is only
 * asked for when the member's level for the club includes maps.
 */
export function shareWithClub(
  db: Db,
  clubId: string,
  userId: string,
  snapshot: ShareSnapshot,
  track: () => Track | null,
): { error: string } | { ok: true } {
  const member = db
    .select()
    .from(schema.clubMember)
    .where(
      and(
        eq(schema.clubMember.clubId, clubId),
        eq(schema.clubMember.userId, userId),
        eq(schema.clubMember.status, 'active'),
      ),
    )
    .get();
  if (!member) return { error: 'Not a member of that club' };
  if (member.shareLevel === 'attendance') {
    return {
      error:
        'You share attendance only with this club. Change that on the club page to share runs.',
    };
  }
  const start = snapshot.startedAt.getTime();
  const run = db
    .select({ id: schema.clubRun.id })
    .from(schema.clubRun)
    .where(
      and(
        eq(schema.clubRun.clubId, clubId),
        eq(schema.clubRun.status, 'scheduled'),
        gte(schema.clubRun.startsAt, new Date(start - MATCH_MS)),
        lte(schema.clubRun.startsAt, new Date(start + MATCH_MS)),
      ),
    )
    .orderBy(asc(schema.clubRun.startsAt))
    .get();
  const values = {
    ...snapshot,
    clubRunId: run?.id ?? null,
    track: member.shareLevel === 'full' ? track() : null,
  };
  db.insert(schema.clubShare)
    .values({ ...values, clubId, userId })
    .onConflictDoUpdate({
      target: [schema.clubShare.clubId, schema.clubShare.sourceId],
      set: values,
    })
    .run();
  return { ok: true };
}

/**
 * Withdraws shares of the given runs (all of the member's runs if none are
 * given), from one club or all of them.
 */
export function withdrawShares(
  db: Db,
  userId: string,
  { sourceIds, clubId }: { sourceIds?: string[]; clubId?: string } = {},
) {
  db.delete(schema.clubShare)
    .where(
      and(
        eq(schema.clubShare.userId, userId),
        sourceIds ? inArray(schema.clubShare.sourceId, sourceIds) : undefined,
        clubId ? eq(schema.clubShare.clubId, clubId) : undefined,
      ),
    )
    .run();
}

type ShareFilter = { runId: string } | { clubId: string; limit: number };

/** Shares on one club run, or a club's most recent shares. */
export function listShares(db: Db, filter: ShareFilter): ClubShare[] {
  return db
    .select({
      id: schema.clubShare.id,
      userId: schema.clubShare.userId,
      memberName: schema.user.name,
      title: schema.clubShare.name,
      startedAt: schema.clubShare.startedAt,
      distanceM: schema.clubShare.distanceM,
      durationS: schema.clubShare.durationS,
      track: schema.clubShare.track,
    })
    .from(schema.clubShare)
    .innerJoin(schema.user, eq(schema.user.id, schema.clubShare.userId))
    .where(
      'runId' in filter
        ? eq(schema.clubShare.clubRunId, filter.runId)
        : eq(schema.clubShare.clubId, filter.clubId),
    )
    .orderBy(
      'runId' in filter
        ? asc(schema.user.name)
        : desc(schema.clubShare.startedAt),
    )
    .limit('runId' in filter ? 100 : filter.limit)
    .all()
    .map((s) => ({
      ...s,
      startedAt: s.startedAt.toISOString(),
      // Lists don't need routes; the run page asks for them.
      track: 'runId' in filter ? (s.track ?? null) : null,
    }));
}
