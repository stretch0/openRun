import { asc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { schema } from '@openrun/db';
import { toCsv } from '@openrun/domain';
import { type AuthedEnv, requireUser } from '../context.js';
import { listShoes } from './shoes.js';

function fileName(ext: string) {
  return `openrun-export-${new Date().toISOString().slice(0, 10)}.${ext}`;
}

/** Everything a user has logged, to take elsewhere. Samples aren't included; original files can be downloaded per run. */
export const exportRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .get('/activities.json', (c) => {
    const db = c.get('db');
    const user = c.get('user');
    const activities = db
      .select()
      .from(schema.activity)
      .where(eq(schema.activity.userId, user.id))
      .orderBy(asc(schema.activity.startedAt))
      .all();
    const ids = activities.map((a) => a.id);
    const laps = ids.length
      ? db
          .select()
          .from(schema.lap)
          .where(inArray(schema.lap.activityId, ids))
          .orderBy(asc(schema.lap.index))
          .all()
      : [];
    const efforts = ids.length
      ? db
          .select()
          .from(schema.personalBest)
          .where(inArray(schema.personalBest.activityId, ids))
          .all()
      : [];

    const body = {
      format: 'openrun-export',
      version: 1,
      exportedAt: new Date().toISOString(),
      user: {
        name: user.name,
        email: user.email,
        units: user.units,
        timezone: user.timezone,
      },
      shoes: listShoes(db, user.id),
      activities: activities.map((a) => ({
        id: a.id,
        name: a.name,
        sport: a.sport,
        source: a.source,
        startedAt: a.startedAt.toISOString(),
        distanceM: a.distanceM,
        durationS: a.durationS,
        elapsedS: a.elapsedS,
        elevationGainM: a.elevationGainM,
        avgHeartRate: a.avgHeartRate,
        maxHeartRate: a.maxHeartRate,
        avgCadence: a.avgCadence,
        rpe: a.rpe,
        notes: a.notes,
        shoeId: a.shoeId,
        hasOriginalFile: a.originalFile !== null,
        laps: laps
          .filter((l) => l.activityId === a.id)
          .map(
            ({
              index,
              distanceM,
              durationS,
              avgHeartRate,
              elevationGainM,
            }) => ({
              index,
              distanceM,
              durationS,
              avgHeartRate,
              elevationGainM,
            }),
          ),
        bestEfforts: efforts
          .filter((e) => e.activityId === a.id)
          .map(({ distanceM, durationS }) => ({ distanceM, durationS })),
      })),
    };
    return c.body(JSON.stringify(body, null, 2), 200, {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${fileName('json')}"`,
    });
  })
  .get('/activities.csv', (c) => {
    const db = c.get('db');
    const user = c.get('user');
    const shoeNames = new Map(
      listShoes(db, user.id).map((s) => [s.id, s.name]),
    );
    const rows = db
      .select()
      .from(schema.activity)
      .where(eq(schema.activity.userId, user.id))
      .orderBy(asc(schema.activity.startedAt))
      .all()
      .map((a) => [
        a.startedAt.toISOString(),
        a.name,
        a.sport,
        Math.round(a.distanceM),
        a.durationS,
        a.elapsedS,
        a.elevationGainM === null ? null : Math.round(a.elevationGainM),
        a.avgHeartRate,
        a.maxHeartRate,
        a.avgCadence,
        a.rpe,
        a.shoeId ? (shoeNames.get(a.shoeId) ?? null) : null,
        a.notes,
        a.source,
        a.id,
      ]);
    const csv = toCsv(
      [
        'started_at',
        'name',
        'sport',
        'distance_m',
        'moving_time_s',
        'elapsed_time_s',
        'elevation_gain_m',
        'avg_heart_rate',
        'max_heart_rate',
        'avg_cadence_spm',
        'rpe',
        'shoe',
        'notes',
        'source',
        'id',
      ],
      rows,
    );
    // A BOM so Excel reads the file as UTF-8.
    return c.body(`\uFEFF${csv}\r\n`, 200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${fileName('csv')}"`,
    });
  });
