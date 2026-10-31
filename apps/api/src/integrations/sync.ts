import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  ne,
  notInArray,
} from 'drizzle-orm';
import { ActivityFileError, parseActivityFile } from '@openrun/activity-files';
import { type Db, schema } from '@openrun/db';
import { defaultActivityName } from '@openrun/domain';
import type { IntervalsConnection } from '@openrun/schemas';
import {
  fileHash,
  findSameRun,
  insertParsedActivity,
  originalFilePath,
  removeDataFile,
  writeDataFile,
} from '../activity-store.js';
import { withdrawShares } from '../clubs/shares.js';
import type { Config } from '../config.js';
import { getPrivacySettings } from '../privacy.js';
import { decryptSecret } from '../secrets.js';
import {
  type IntervalsActivity,
  IntervalsError,
  RUN_TYPES,
  deviceOf,
  downloadActivity,
  listActivities,
  startOf,
} from './intervals.js';

type Integration = typeof schema.integration.$inferSelect;

const DAY_MS = 86_400_000;
/** Files fetched per sync; a long backfill carries on over several syncs. */
export const BATCH = 25;
/** Sync log entries kept per connection. */
const KEEP_SYNCS = 20;

/** Connections being synced right now, so two syncs never overlap. */
const running = new Set<string>();

export function isSyncing(integrationId: string) {
  return running.has(integrationId);
}

const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Fetches runs from intervals.icu that haven't been seen before, oldest first,
 * up to BATCH files, and imports them like uploads. Runs that intervals.icu
 * now lists as another sport are removed. Returns false if a sync
 * of this connection was already running.
 *
 * Everything since the start date is listed every time: runs can reach
 * intervals.icu long after they happened (a watch that synced late, or
 * Garmin sending history in chunks over hours), and the list can't be
 * filtered by when an activity arrived.
 */
export async function syncIntegration(
  db: Db,
  config: Config,
  integration: Integration,
  now = new Date(),
): Promise<boolean> {
  if (!config.intervalsUrl || running.has(integration.id)) return false;
  running.add(integration.id);
  const [log] = db
    .insert(schema.integrationSync)
    .values({ integrationId: integration.id, startedAt: now })
    .returning()
    .all();
  const counts = {
    imported: 0,
    duplicates: 0,
    failed: 0,
    unavailable: 0,
    removed: 0,
  };
  let more = false;
  let error: string | null = null;
  let status: Integration['status'] = 'ok';
  try {
    const apiKey = decryptSecret(config.authSecret, integration.credentials);
    if (!apiKey) {
      throw new IntervalsError(
        "The saved API key can't be read any more; paste it again",
        401,
      );
    }
    const listed = await listActivities(
      config.intervalsUrl,
      apiKey,
      day(new Date(integration.syncFrom.getTime() - DAY_MS)),
      day(new Date(now.getTime() + DAY_MS)),
    );

    counts.removed = removeNonRuns(db, config, integration, listed);

    const seen = seenIds(
      db,
      integration.id,
      listed.map((a) => a.id),
    );
    const waiting: { activity: IntervalsActivity; startedAt: Date }[] = [];
    for (const activity of listed) {
      if (seen.has(activity.id)) continue;
      const startedAt = startOf(activity);
      if (activity.source === 'STRAVA') {
        // intervals.icu doesn't pass on Strava's data (Strava's terms).
        db.insert(schema.integrationItem)
          .values({
            integrationId: integration.id,
            externalId: activity.id,
            startedAt: startedAt ?? now,
            status: 'unavailable',
          })
          .run();
        counts.unavailable++;
        continue;
      }
      if (!startedAt || startedAt < integration.syncFrom) continue;
      if (!RUN_TYPES.has(activity.type ?? '') || !activity.file_type) continue;
      waiting.push({ activity, startedAt });
    }
    waiting.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());

    let done = 0;
    for (const item of waiting.slice(0, BATCH)) {
      const outcome = await importOne(
        db,
        config,
        integration,
        { baseUrl: config.intervalsUrl, apiKey },
        item,
      );
      counts[outcome]++;
      done++;
    }
    more = waiting.length > done;
  } catch (e) {
    if (!(e instanceof IntervalsError)) {
      console.error(
        `Syncing intervals.icu for ${integration.userId} failed`,
        e,
      );
    }
    error = e instanceof IntervalsError ? e.message : 'Sync failed';
    status = e instanceof IntervalsError && e.badKey ? 'needs_key' : 'error';
    more = false;
  } finally {
    running.delete(integration.id);
  }

  const finishedAt = new Date();
  db.update(schema.integrationSync)
    .set({ ...counts, more, error, finishedAt })
    .where(eq(schema.integrationSync.id, log.id))
    .run();
  db.update(schema.integration)
    .set({ status, lastError: error, lastSyncAt: finishedAt })
    .where(eq(schema.integration.id, integration.id))
    .run();
  pruneLog(db, integration.id);
  return true;
}

/** Ids that were already looked at, of those just listed. */
function seenIds(db: Db, integrationId: string, ids: string[]) {
  const seen = new Set<string>();
  // SQLite allows a limited number of variables per statement.
  for (let i = 0; i < ids.length; i += 500) {
    for (const row of db
      .select({ externalId: schema.integrationItem.externalId })
      .from(schema.integrationItem)
      .where(
        and(
          eq(schema.integrationItem.integrationId, integrationId),
          inArray(schema.integrationItem.externalId, ids.slice(i, i + 500)),
        ),
      )
      .all()) {
      seen.add(row.externalId);
    }
  }
  return seen;
}

/**
 * Removes runs imported earlier that intervals.icu now lists as another
 * sport, such as a ride the watch recorded as a run. Other sports are never
 * imported, so these go as if they'd never been runs, club shares included.
 * Forgetting the item means that if it turns back into a run, the next sync
 * imports it again. Runs deleted by hand stay deleted.
 */
function removeNonRuns(
  db: Db,
  config: Config,
  integration: Integration,
  listed: IntervalsActivity[],
) {
  const notRuns = listed
    .filter((a) => a.type && !RUN_TYPES.has(a.type))
    .map((a) => a.id);
  let removed = 0;
  // SQLite allows a limited number of variables per statement.
  for (let i = 0; i < notRuns.length; i += 500) {
    const items = db
      .select({
        id: schema.integrationItem.id,
        activityId: schema.integrationItem.activityId,
      })
      .from(schema.integrationItem)
      .where(
        and(
          eq(schema.integrationItem.integrationId, integration.id),
          eq(schema.integrationItem.status, 'imported'),
          isNotNull(schema.integrationItem.activityId),
          inArray(schema.integrationItem.externalId, notRuns.slice(i, i + 500)),
        ),
      )
      .all();
    for (const item of items) {
      const run = db
        .select()
        .from(schema.activity)
        .where(
          and(
            eq(schema.activity.id, item.activityId ?? ''),
            eq(schema.activity.userId, integration.userId),
            eq(schema.activity.source, 'intervals'),
          ),
        )
        .get();
      if (!run) continue;
      db.transaction((tx) => {
        withdrawShares(db, run.userId, { sourceIds: [run.id] });
        tx.delete(schema.activity).where(eq(schema.activity.id, run.id)).run();
        tx.delete(schema.integrationItem)
          .where(eq(schema.integrationItem.id, item.id))
          .run();
      });
      if (run.originalFile) removeDataFile(config.dataDir, run.originalFile);
      removed++;
    }
  }
  return removed;
}

async function importOne(
  db: Db,
  config: Config,
  integration: Integration,
  { baseUrl, apiKey }: { baseUrl: string; apiKey: string },
  { activity, startedAt }: { activity: IntervalsActivity; startedAt: Date },
): Promise<'imported' | 'duplicates' | 'failed'> {
  const remember = (
    status: 'imported' | 'duplicate' | 'failed',
    activityId: string | null,
    error: string | null = null,
  ) =>
    db
      .insert(schema.integrationItem)
      .values({
        integrationId: integration.id,
        externalId: activity.id,
        startedAt,
        status,
        activityId,
        error,
      })
      .run();

  // Network trouble and rate limits end the sync; the run is tried next time.
  const data = await downloadActivity(baseUrl, apiKey, activity);
  let parsed;
  try {
    parsed = await parseActivityFile(data);
  } catch (e) {
    const message =
      e instanceof ActivityFileError ? e.message : 'Could not read this file';
    remember('failed', null, message);
    return 'failed';
  }

  const userId = integration.userId;
  const same = findSameRun(db, userId, parsed.startedAt, parsed.distanceM);
  if (same) {
    remember('duplicate', same.id);
    return 'duplicates';
  }

  const id = crypto.randomUUID();
  const gz = data[0] === 0x1f && data[1] === 0x8b ? '.gz' : '';
  const originalFile = originalFilePath(userId, id, `.${parsed.format}${gz}`);
  writeDataFile(config.dataDir, originalFile, data);
  try {
    const user = db
      .select({ timezone: schema.user.timezone })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .get();
    insertParsedActivity(db, {
      id,
      userId,
      parsed,
      name:
        activity.name?.trim() ||
        parsed.name ||
        defaultActivityName(
          parsed.startedAt,
          user?.timezone ?? 'UTC',
          parsed.sport,
        ),
      hash: fileHash(data),
      originalFile,
      visibility: getPrivacySettings(db, userId).defaultVisibility,
      source: 'intervals',
      externalId: activity.id,
      device: deviceOf(activity),
    });
  } catch (e) {
    removeDataFile(config.dataDir, originalFile);
    throw e;
  }
  remember('imported', id);
  return 'imported';
}

function pruneLog(db: Db, integrationId: string) {
  const keep = db
    .select({ id: schema.integrationSync.id })
    .from(schema.integrationSync)
    .where(eq(schema.integrationSync.integrationId, integrationId))
    .orderBy(desc(schema.integrationSync.startedAt))
    .limit(KEEP_SYNCS)
    .all()
    .map((s) => s.id);
  db.delete(schema.integrationSync)
    .where(
      and(
        eq(schema.integrationSync.integrationId, integrationId),
        notInArray(schema.integrationSync.id, keep),
      ),
    )
    .run();
}

/**
 * Syncs every connection that can be synced, one at a time so intervals.icu
 * sees a gentle trickle.
 */
export async function syncAll(db: Db, config: Config, now = new Date()) {
  if (!config.intervalsUrl) return;
  const due = db
    .select()
    .from(schema.integration)
    .where(ne(schema.integration.status, 'needs_key'))
    .all();
  for (const integration of due) {
    await syncIntegration(db, config, integration, now);
  }
}

/** A member's connection, as the Integrations page shows it. */
export function describeConnection(
  db: Db,
  integration: Integration,
): IntervalsConnection {
  const [{ imported }] = db
    .select({ imported: count() })
    .from(schema.integrationItem)
    .where(
      and(
        eq(schema.integrationItem.integrationId, integration.id),
        eq(schema.integrationItem.status, 'imported'),
      ),
    )
    .all();
  const syncs = db
    .select()
    .from(schema.integrationSync)
    .where(eq(schema.integrationSync.integrationId, integration.id))
    .orderBy(desc(schema.integrationSync.startedAt))
    .limit(10)
    .all();
  return {
    accountId: integration.accountId,
    accountName: integration.accountName,
    syncFrom: day(integration.syncFrom),
    status: integration.status,
    lastError: integration.lastError,
    lastSyncAt: integration.lastSyncAt?.toISOString() ?? null,
    syncing: isSyncing(integration.id),
    importedCount: imported,
    syncs: syncs.map((s) => ({
      startedAt: s.startedAt.toISOString(),
      finishedAt: s.finishedAt?.toISOString() ?? null,
      imported: s.imported,
      duplicates: s.duplicates,
      failed: s.failed,
      unavailable: s.unavailable,
      removed: s.removed,
      more: s.more,
      error: s.error,
    })),
  };
}
