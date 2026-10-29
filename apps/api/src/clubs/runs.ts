import { and, eq, gt, isNull } from 'drizzle-orm';
import { type Db, schema } from '@openrun/db';
import { occurrences, parseRule } from '@openrun/domain';

/** How far ahead a series' runs exist, so people can RSVP to them. */
export const HORIZON_DAYS = 56;
const DAY_MS = 86_400_000;

type Series = typeof schema.clubRunSeries.$inferSelect;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Creates any missing runs for the club's active series up to the horizon.
 * Safe to call often: existing runs (unique by series and start) are kept.
 */
export function ensureUpcomingRuns(
  db: Db | Tx,
  clubId: string,
  now = new Date(),
) {
  const club = db
    .select({ timezone: schema.club.timezone })
    .from(schema.club)
    .where(eq(schema.club.id, clubId))
    .get();
  if (!club) return;
  const series = db
    .select()
    .from(schema.clubRunSeries)
    .where(
      and(
        eq(schema.clubRunSeries.clubId, clubId),
        isNull(schema.clubRunSeries.endedAt),
      ),
    )
    .all();
  for (const s of series) {
    const times = seriesTimes(s, club.timezone, now);
    if (!times.length) continue;
    db.insert(schema.clubRun)
      .values(
        times.map((startsAt) => ({
          clubId,
          seriesId: s.id,
          title: s.title,
          startsAt,
          locationId: s.locationId,
          notes: s.notes,
          orderCutoffMin: s.orderCutoffMin,
        })),
      )
      .onConflictDoNothing()
      .run();
  }
}

function seriesTimes(s: Series, timeZone: string, now: Date) {
  const rule = parseRule(s.rrule);
  if (!rule) return [];
  return occurrences(
    { rule, anchor: s.startsOn, time: s.startTime, timeZone },
    now,
    new Date(now.getTime() + HORIZON_DAYS * DAY_MS),
  );
}

/**
 * After a series changes, brings its future runs in line: details are
 * copied over, runs no longer on the schedule are removed (with their
 * RSVPs), and new times are created. Runs at unchanged times keep their
 * RSVPs. Past runs are never touched.
 */
export function syncFutureRuns(tx: Tx, series: Series, now = new Date()) {
  const future = and(
    eq(schema.clubRun.seriesId, series.id),
    gt(schema.clubRun.startsAt, now),
  );
  if (series.endedAt) {
    tx.delete(schema.clubRun).where(future).run();
    return;
  }
  const club = tx
    .select({ timezone: schema.club.timezone })
    .from(schema.club)
    .where(eq(schema.club.id, series.clubId))
    .get();
  if (!club) return;
  const wanted = new Set(
    seriesTimes(series, club.timezone, now).map((t) => t.getTime()),
  );
  for (const run of tx.select().from(schema.clubRun).where(future).all()) {
    if (!wanted.has(run.startsAt.getTime())) {
      tx.delete(schema.clubRun).where(eq(schema.clubRun.id, run.id)).run();
    }
  }
  tx.update(schema.clubRun)
    .set({
      title: series.title,
      locationId: series.locationId,
      notes: series.notes,
      orderCutoffMin: series.orderCutoffMin,
    })
    .where(future)
    .run();
  ensureUpcomingRuns(tx, series.clubId, now);
}
