import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { zValidator } from '@hono/zod-validator';
import { and, asc, desc, eq, lt, or } from 'drizzle-orm';
import { type Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { ActivityFileError, parseActivityFile } from '@openrun/activity-files';
import { schema } from '@openrun/db';
import { defaultActivityName, downsample } from '@openrun/domain';
import {
  type Activity,
  type ActivityList,
  type ActivitySummary,
  createActivitySchema,
  bulkVisibilitySchema,
  type ImportResult,
  type PersonalBest,
  updateActivitySchema,
} from '@openrun/schemas';
import {
  activitySplits,
  fileHash,
  findSameRun,
  insertParsedActivity,
  loadStream,
  originalFilePath,
  rankedEfforts,
  removeDataFile,
  safePath,
  saveBestEfforts,
  writeDataFile,
} from '../activity-store.js';
import { type AuthedEnv, requireUser } from '../context.js';
import {
  shareTargets,
  shareWithClub,
  withdrawShares,
} from '../clubs/shares.js';
import { getPrivacySettings, sharedStream } from '../privacy.js';

type ActivityRow = typeof schema.activity.$inferSelect;

function shareTargetsFor(c: Ctx, row: ActivityRow) {
  const db = c.get('db');
  const hasRoute = loadStream(db, row.id)?.lat.some((v) => v !== null) ?? false;
  return shareTargets(
    db,
    row.userId,
    row.id,
    hasRoute && getPrivacySettings(db, row.userId).shareMap,
  );
}

/** The route as clubs may see it: privacy zones cut out, about 300 points. */
function sharedTrack(c: Ctx, row: ActivityRow) {
  const db = c.get('db');
  const stream = loadStream(db, row.id);
  if (!stream || !getPrivacySettings(db, row.userId).shareMap) return null;
  const shared = downsample(sharedStream(db, row.userId, stream), 300);
  const track = shared.lat.map((lat, i) => {
    const lng = shared.lng[i];
    return lat !== null && lng !== null
      ? ([lat, lng] as [number, number])
      : null;
  });
  return track.some((p) => p !== null) ? track : null;
}

const MAX_FILES = 50;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

function toSummary(a: ActivityRow): ActivitySummary {
  return {
    id: a.id,
    name: a.name,
    sport: a.sport,
    source: a.source,
    visibility: a.visibility,
    startedAt: a.startedAt.toISOString(),
    distanceM: a.distanceM,
    durationS: a.durationS,
    elevationGainM: a.elevationGainM,
    avgHeartRate: a.avgHeartRate,
  };
}

/** Cursor for keyset pagination: the last item's start time and id. */
const cursorSchema = z
  .string()
  .transform((s, ctx) => {
    const [ms, id] = s.split('_');
    const time = Number(ms);
    if (!id || !Number.isFinite(time)) {
      ctx.addIssue({ code: 'custom', message: 'Invalid cursor' });
      return z.NEVER;
    }
    return { startedAt: new Date(time), id };
  })
  .optional();

const listQuerySchema = z.object({
  before: cursorSchema,
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const activityRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .get('/', zValidator('query', listQuerySchema), (c) => {
    const { before, limit } = c.req.valid('query');
    const a = schema.activity;
    const rows = c
      .get('db')
      .select()
      .from(a)
      .where(
        and(
          eq(a.userId, c.get('user').id),
          before
            ? or(
                lt(a.startedAt, before.startedAt),
                and(eq(a.startedAt, before.startedAt), lt(a.id, before.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(a.startedAt), desc(a.id))
      .limit(limit + 1)
      .all();
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    const body: ActivityList = {
      items: items.map(toSummary),
      nextCursor:
        rows.length > limit && last
          ? `${last.startedAt.getTime()}_${last.id}`
          : null,
    };
    return c.json(body);
  })
  .post(
    '/import',
    bodyLimit({
      maxSize: MAX_UPLOAD_BYTES,
      onError: (c) => c.json({ error: 'Upload too large' }, 413),
    }),
    async (c) => {
      const body = await c.req.parseBody({ all: true });
      const files = [body['files'] ?? []]
        .flat()
        .filter((f): f is File => f instanceof File);
      if (!files.length) return c.json({ error: 'No files uploaded' }, 400);
      if (files.length > MAX_FILES) {
        return c.json(
          { error: `Upload at most ${MAX_FILES} files at once` },
          400,
        );
      }
      const results: ImportResult[] = [];
      for (const file of files) {
        results.push(await importFile(c, file));
      }
      return c.json(results);
    },
  )
  .post('/', zValidator('json', createActivitySchema), (c) => {
    const input = c.req.valid('json');
    if (input.shoeId && !ownsShoe(c, input.shoeId)) {
      return c.json({ error: 'Unknown shoe' }, 400);
    }
    const db = c.get('db');
    const row = db.transaction((tx) => {
      const [row] = tx
        .insert(schema.activity)
        .values({
          ...input,
          userId: c.get('user').id,
          source: 'manual',
          visibility:
            input.visibility ??
            getPrivacySettings(db, c.get('user').id).defaultVisibility,
          startedAt: new Date(input.startedAt),
          elapsedS: input.durationS,
        })
        .returning()
        .all();
      saveBestEfforts(tx, row, null);
      return row;
    });
    return c.json(toActivity(c, row), 201);
  })
  .get('/:id', (c) => {
    const row = findOwn(c, c.req.param('id'));
    if (!row) return c.json({ error: 'Not found' }, 404);
    return c.json(toActivity(c, row));
  })
  .get(
    '/:id/stream',
    zValidator(
      'query',
      z.object({
        points: z.coerce.number().int().min(10).max(5000).default(1000),
        /** `shared` previews what others see: privacy zones applied. */
        view: z.enum(['owner', 'shared']).default('owner'),
      }),
    ),
    (c) => {
      const row = findOwn(c, c.req.param('id'));
      if (!row) return c.json({ error: 'Not found' }, 404);
      const stream = loadStream(c.get('db'), row.id);
      if (!stream) return c.json({ error: 'No stream' }, 404);
      const { points, view } = c.req.valid('query');
      const visible =
        view === 'shared'
          ? sharedStream(c.get('db'), row.userId, stream)
          : stream;
      return c.json(downsample(visible, points));
    },
  )
  .get('/:id/file', (c) => {
    const row = findOwn(c, c.req.param('id'));
    if (!row?.originalFile) return c.json({ error: 'Not found' }, 404);
    const path = safePath(c.get('config').dataDir, row.originalFile);
    if (!existsSync(path)) return c.json({ error: 'Not found' }, 404);
    const stored = basename(row.originalFile);
    const ext = stored.slice(stored.indexOf('.'));
    const fileName =
      `${row.startedAt.toISOString().slice(0, 10)} ${row.name}${ext}`.replace(
        /[^\w .-]/g,
        '',
      );
    return c.body(readFileSync(path), 200, {
      'content-type': 'application/octet-stream',
      'content-disposition': `attachment; filename="${fileName}"`,
    });
  })
  .patch('/visibility', zValidator('json', bulkVisibilitySchema), (c) => {
    const { visibility } = c.req.valid('json');
    const userId = c.get('user').id;
    const changed = c
      .get('db')
      .update(schema.activity)
      .set({ visibility })
      .where(eq(schema.activity.userId, userId))
      .returning({ id: schema.activity.id })
      .all();
    // Private means private: take back everything shared with clubs.
    if (visibility === 'private') withdrawShares(c.get('db'), userId);
    return c.json({ updated: changed.length });
  })
  .get('/:id/clubs', (c) => {
    const row = findOwn(c, c.req.param('id'));
    if (!row) return c.json({ error: 'Not found' }, 404);
    return c.json(shareTargetsFor(c, row));
  })
  .put('/:id/clubs/:clubId', (c) => {
    const row = findOwn(c, c.req.param('id'));
    if (!row) return c.json({ error: 'Not found' }, 404);
    const db = c.get('db');
    const result = shareWithClub(
      db,
      c.req.param('clubId'),
      row.userId,
      {
        sourceId: row.id,
        name: row.name,
        startedAt: row.startedAt,
        distanceM: row.distanceM,
        durationS: row.durationS,
      },
      () => sharedTrack(c, row),
    );
    if ('error' in result) return c.json(result, 400);
    if (row.visibility === 'private') {
      db.update(schema.activity)
        .set({ visibility: 'clubs' })
        .where(eq(schema.activity.id, row.id))
        .run();
    }
    return c.json(shareTargetsFor(c, row));
  })
  .delete('/:id/clubs/:clubId', (c) => {
    const row = findOwn(c, c.req.param('id'));
    if (!row) return c.json({ error: 'Not found' }, 404);
    withdrawShares(c.get('db'), row.userId, {
      sourceIds: [row.id],
      clubId: c.req.param('clubId'),
    });
    return c.json(shareTargetsFor(c, row));
  })
  .patch('/:id', zValidator('json', updateActivitySchema), (c) => {
    const existing = findOwn(c, c.req.param('id'));
    if (!existing) return c.json({ error: 'Not found' }, 404);
    const { shoeId } = c.req.valid('json');
    if (shoeId && !ownsShoe(c, shoeId)) {
      return c.json({ error: 'Unknown shoe' }, 400);
    }
    const db = c.get('db');
    const row = db.transaction((tx) => {
      const [row] = tx
        .update(schema.activity)
        .set(c.req.valid('json'))
        .where(eq(schema.activity.id, existing.id))
        .returning()
        .all();
      if (row.visibility === 'private' && existing.visibility !== 'private') {
        withdrawShares(db, row.userId, { sourceIds: [row.id] });
      }
      if (row.sport !== existing.sport) {
        saveBestEfforts(tx, row, loadStream(tx, row.id));
      }
      return row;
    });
    return c.json(toActivity(c, row));
  })
  .delete('/:id', (c) => {
    const row = findOwn(c, c.req.param('id'));
    if (!row) return c.json({ error: 'Not found' }, 404);
    c.get('db')
      .delete(schema.activity)
      .where(eq(schema.activity.id, row.id))
      .run();
    if (row.originalFile) {
      removeDataFile(c.get('config').dataDir, row.originalFile);
    }
    return c.body(null, 204);
  });

export const personalBestRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .get('/', (c) => {
    const pb = schema.personalBest;
    const rows = c
      .get('db')
      .select({
        distanceM: pb.distanceM,
        durationS: pb.durationS,
        activityId: pb.activityId,
        activityName: schema.activity.name,
        achievedAt: pb.achievedAt,
      })
      .from(pb)
      .innerJoin(schema.activity, eq(schema.activity.id, pb.activityId))
      .where(eq(pb.userId, c.get('user').id))
      .orderBy(asc(pb.distanceM), asc(pb.durationS), asc(pb.achievedAt))
      .all();
    // Rows are sorted fastest first within each distance; keep the first.
    const best = new Map<number, PersonalBest>();
    for (const r of rows) {
      if (best.has(r.distanceM)) continue;
      best.set(r.distanceM, { ...r, achievedAt: r.achievedAt.toISOString() });
    }
    return c.json([...best.values()]);
  });

type Ctx = Context<AuthedEnv>;

function ownsShoe(c: Ctx, shoeId: string) {
  return Boolean(
    c
      .get('db')
      .select({ id: schema.shoe.id })
      .from(schema.shoe)
      .where(
        and(
          eq(schema.shoe.id, shoeId),
          eq(schema.shoe.userId, c.get('user').id),
        ),
      )
      .get(),
  );
}

function findOwn(c: Ctx, id: string) {
  return c
    .get('db')
    .select()
    .from(schema.activity)
    .where(
      and(
        eq(schema.activity.id, id),
        eq(schema.activity.userId, c.get('user').id),
      ),
    )
    .get();
}

function toActivity(c: Ctx, row: ActivityRow): Activity {
  const db = c.get('db');
  const stream = loadStream(db, row.id);
  const laps = db
    .select()
    .from(schema.lap)
    .where(eq(schema.lap.activityId, row.id))
    .orderBy(asc(schema.lap.index))
    .all();
  return {
    ...toSummary(row),
    elapsedS: row.elapsedS,
    maxHeartRate: row.maxHeartRate,
    avgCadence: row.avgCadence,
    rpe: row.rpe,
    notes: row.notes,
    shoeId: row.shoeId,
    hasStream: stream !== null,
    hasFile: row.originalFile !== null,
    laps: laps.map((l) => ({
      index: l.index,
      distanceM: l.distanceM,
      durationS: l.durationS,
      avgHeartRate: l.avgHeartRate,
      elevationGainM: l.elevationGainM,
    })),
    splits: activitySplits(stream, c.get('user').units),
    bestEfforts: rankedEfforts(db, row),
  };
}

async function importFile(c: Ctx, file: File): Promise<ImportResult> {
  const result = (
    status: ImportResult['status'],
    activityId: string | null = null,
    error: string | null = null,
  ): ImportResult => ({ fileName: file.name, status, activityId, error });

  if (file.size > MAX_FILE_BYTES) {
    return result('failed', null, 'File is larger than 25 MB');
  }
  const data = new Uint8Array(await file.arrayBuffer());
  const db = c.get('db');
  const user = c.get('user');
  const hash = fileHash(data);

  const sameFile = db
    .select({ id: schema.activity.id })
    .from(schema.activity)
    .where(
      and(
        eq(schema.activity.userId, user.id),
        eq(schema.activity.source, 'file'),
        eq(schema.activity.externalId, hash),
      ),
    )
    .get();
  if (sameFile) return result('duplicate', sameFile.id);

  let parsed;
  try {
    parsed = await parseActivityFile(data);
  } catch (e) {
    if (e instanceof ActivityFileError)
      return result('failed', null, e.message);
    console.error(`Failed to import ${file.name}`, e);
    return result('failed', null, 'Could not read this file');
  }

  const sameRun = findSameRun(db, user.id, parsed.startedAt, parsed.distanceM);
  if (sameRun) return result('duplicate', sameRun.id);

  const id = crypto.randomUUID();
  const gz = data[0] === 0x1f && data[1] === 0x8b ? '.gz' : '';
  const originalFile = originalFilePath(user.id, id, `.${parsed.format}${gz}`);
  const dataDir = c.get('config').dataDir;
  writeDataFile(dataDir, originalFile, data);
  try {
    insertParsedActivity(db, {
      id,
      userId: user.id,
      parsed,
      name:
        parsed.name ??
        defaultActivityName(parsed.startedAt, user.timezone, parsed.sport),
      hash,
      originalFile,
      visibility: getPrivacySettings(db, user.id).defaultVisibility,
    });
  } catch (e) {
    removeDataFile(dataDir, originalFile);
    throw e;
  }
  return result('imported', id);
}
