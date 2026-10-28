import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { and, asc, eq, gte, lt, lte } from 'drizzle-orm';
import type { ParsedActivity } from '@openrun/activity-files';
import { type Db, schema } from '@openrun/db';
import {
  type Stream,
  bestEfforts,
  manualEfforts,
  splits as splitStream,
} from '@openrun/domain';
import type { Sport } from '@openrun/schemas';

type ActivityRow = typeof schema.activity.$inferSelect;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Sports that count towards running totals and personal bests. */
export const RUNNING: readonly Sport[] = [
  'run',
  'trail_run',
  'treadmill',
  'track',
];

// Streams are stored gzipped; rounding keeps them small without losing
// anything a map or chart can show.
const PRECISION: Record<keyof Stream, number> = {
  t: 1,
  d: 1,
  lat: 6,
  lng: 6,
  alt: 1,
  hr: 0,
  cad: 0,
};

export function encodeStream(stream: Stream): Buffer {
  const rounded = Object.fromEntries(
    Object.entries(stream).map(([key, values]) => {
      const f = 10 ** PRECISION[key as keyof Stream];
      return [
        key,
        (values as (number | null)[]).map((v) =>
          v == null ? null : Math.round(v * f) / f,
        ),
      ];
    }),
  );
  return gzipSync(JSON.stringify(rounded));
}

export function decodeStream(data: Buffer): Stream {
  return JSON.parse(gunzipSync(data).toString('utf8')) as Stream;
}

export function loadStream(db: Db | Tx, activityId: string): Stream | null {
  const row = db
    .select({ data: schema.activityStream.data })
    .from(schema.activityStream)
    .where(eq(schema.activityStream.activityId, activityId))
    .get();
  return row ? decodeStream(row.data) : null;
}

/** Content hash, used to spot a file that has already been imported. */
export function fileHash(data: Uint8Array) {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * An existing activity that is probably the same run: it started within a
 * minute and is within 5% of the distance. Catches the same run imported as
 * both FIT and GPX, or synced and uploaded.
 */
export function findSameRun(
  db: Db,
  userId: string,
  startedAt: Date,
  distanceM: number,
) {
  const minute = 60_000;
  const candidates = db
    .select({ id: schema.activity.id, distanceM: schema.activity.distanceM })
    .from(schema.activity)
    .where(
      and(
        eq(schema.activity.userId, userId),
        gte(schema.activity.startedAt, new Date(startedAt.getTime() - minute)),
        lte(schema.activity.startedAt, new Date(startedAt.getTime() + minute)),
      ),
    )
    .all();
  return candidates.find(
    (c) => Math.abs(c.distanceM - distanceM) <= Math.max(distanceM, 1) * 0.05,
  );
}

/** Where an activity's original file lives, relative to DATA_DIR. */
export function originalFilePath(
  userId: string,
  activityId: string,
  ext: string,
) {
  return join('files', userId, `${activityId}${ext}`);
}

export function writeDataFile(dataDir: string, path: string, data: Uint8Array) {
  const full = safePath(dataDir, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, data);
}

export function removeDataFile(dataDir: string, path: string) {
  rmSync(safePath(dataDir, path), { force: true });
}

/** Resolves `path` inside `dataDir`, refusing anything that escapes it. */
export function safePath(dataDir: string, path: string) {
  const root = resolve(dataDir);
  const full = resolve(root, path);
  if (!full.startsWith(root + sep)) throw new Error(`Bad data path: ${path}`);
  return full;
}

/** Inserts a parsed file as an activity, with its laps, stream and efforts. */
export function insertParsedActivity(
  db: Db,
  {
    id,
    userId,
    parsed,
    name,
    hash,
    originalFile,
  }: {
    id: string;
    userId: string;
    parsed: ParsedActivity;
    name: string;
    hash: string;
    originalFile: string;
  },
) {
  db.transaction((tx) => {
    const [row] = tx
      .insert(schema.activity)
      .values({
        id,
        userId,
        source: 'file',
        externalId: hash,
        sport: parsed.sport,
        name,
        startedAt: parsed.startedAt,
        distanceM: parsed.distanceM,
        durationS: parsed.durationS,
        elapsedS: parsed.elapsedS,
        elevationGainM: parsed.elevationGainM,
        avgHeartRate: parsed.avgHeartRate,
        maxHeartRate: parsed.maxHeartRate,
        avgCadence: parsed.avgCadence,
        originalFile,
      })
      .returning()
      .all();
    if (parsed.laps.length) {
      tx.insert(schema.lap)
        .values(
          parsed.laps.map((lap, index) => ({ ...lap, index, activityId: id })),
        )
        .run();
    }
    if (parsed.stream) {
      tx.insert(schema.activityStream)
        .values({ activityId: id, data: encodeStream(parsed.stream) })
        .run();
    }
    saveBestEfforts(tx, row, parsed.stream);
  });
}

/** Replaces an activity's best efforts, e.g. after import or a sport change. */
export function saveBestEfforts(
  db: Db | Tx,
  activity: ActivityRow,
  stream: Stream | null,
) {
  db.delete(schema.personalBest)
    .where(eq(schema.personalBest.activityId, activity.id))
    .run();
  if (!RUNNING.includes(activity.sport)) return;
  const efforts = stream?.d.some((d) => d != null)
    ? bestEfforts(stream)
    : manualEfforts(activity.distanceM, activity.durationS);
  if (!efforts.length) return;
  db.insert(schema.personalBest)
    .values(
      efforts.map((e) => ({
        userId: activity.userId,
        activityId: activity.id,
        distanceM: e.distanceM,
        durationS: e.durationS,
        achievedAt: activity.startedAt,
      })),
    )
    .run();
}

/** An activity's best efforts, each ranked against all of the user's efforts. */
export function rankedEfforts(db: Db, activity: ActivityRow) {
  const efforts = db
    .select()
    .from(schema.personalBest)
    .where(eq(schema.personalBest.activityId, activity.id))
    .orderBy(asc(schema.personalBest.distanceM))
    .all();
  return efforts.map((e) => {
    const faster = db
      .select({ id: schema.personalBest.id })
      .from(schema.personalBest)
      .where(
        and(
          eq(schema.personalBest.userId, activity.userId),
          eq(schema.personalBest.distanceM, e.distanceM),
          lt(schema.personalBest.durationS, e.durationS),
        ),
      )
      .all().length;
    return { distanceM: e.distanceM, durationS: e.durationS, rank: faster + 1 };
  });
}

export function activitySplits(stream: Stream | null, units: string) {
  if (!stream || !stream.d.some((d) => d != null)) return [];
  return splitStream(stream, units === 'imperial' ? 1609.344 : 1000);
}
