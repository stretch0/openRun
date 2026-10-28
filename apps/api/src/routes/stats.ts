import { and, count, eq, gte, inArray, sum } from 'drizzle-orm';
import { Hono } from 'hono';
import { schema } from '@openrun/db';
import {
  PREDICTION_DISTANCES,
  type Total,
  addDays,
  dailyTotals,
  localDate,
  monthlyTotals,
  predictTime,
  vdot,
  weekStart,
  weeklyTotals,
} from '@openrun/domain';
import type { Predictions, Stats } from '@openrun/schemas';
import { RUNNING } from '../activity-store.js';
import { type AuthedEnv, requireUser } from '../context.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Efforts older than this don't count towards race predictions. */
const PREDICTION_WINDOW_DAYS = 120;
/** VDOT is meant for races from about 1500 m; shorter efforts overstate fitness. */
const MIN_PREDICTION_DISTANCE_M = 1609;

export const statsRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .get('/', (c) => {
    const db = c.get('db');
    const user = c.get('user');
    const tz = user.timezone;
    const now = new Date();
    const a = schema.activity;
    const running = and(eq(a.userId, user.id), inArray(a.sport, RUNNING));

    // 400 days covers the heatmap's 53 weeks and the whole calendar year.
    const recent = db
      .select({
        startedAt: a.startedAt,
        distanceM: a.distanceM,
        durationS: a.durationS,
      })
      .from(a)
      .where(
        and(running, gte(a.startedAt, new Date(now.getTime() - 400 * DAY_MS))),
      )
      .all();

    const months = monthlyTotals(recent, tz, now, 12);
    const today = localDate(now, tz);
    const year = today.slice(0, 4);
    const heatmapStart = addDays(weekStart(today), -52 * 7);
    const heatmapDays =
      (Date.parse(today) - Date.parse(heatmapStart)) / DAY_MS + 1;

    const all = db
      .select({
        distanceM: sum(a.distanceM).mapWith(Number),
        durationS: sum(a.durationS).mapWith(Number),
        count: count(),
      })
      .from(a)
      .where(running)
      .get();

    const body: Stats = {
      thisWeek: weeklyTotals(recent, tz, now, 1)[0],
      thisMonth: months[months.length - 1],
      thisYear: months
        .filter((m) => m.start.startsWith(year))
        .reduce<Total>(
          (t, m) => ({
            start: t.start,
            distanceM: t.distanceM + m.distanceM,
            durationS: t.durationS + m.durationS,
            count: t.count + m.count,
          }),
          { start: `${year}-01-01`, distanceM: 0, durationS: 0, count: 0 },
        ),
      allTime: {
        start: '',
        distanceM: all?.distanceM ?? 0,
        durationS: all?.durationS ?? 0,
        count: all?.count ?? 0,
      },
      weeks: weeklyTotals(recent, tz, now, 12),
      months,
      days: dailyTotals(recent, tz, now, heatmapDays),
      predictions: predictions(c.get('db'), user.id, now),
    };
    return c.json(body);
  });

/** Race predictions from the best recent effort, by VDOT. */
function predictions(
  db: AuthedEnv['Variables']['db'],
  userId: string,
  now: Date,
): Predictions | null {
  const pb = schema.personalBest;
  const efforts = db
    .select({
      distanceM: pb.distanceM,
      durationS: pb.durationS,
      activityId: pb.activityId,
      activityName: schema.activity.name,
      achievedAt: pb.achievedAt,
    })
    .from(pb)
    .innerJoin(schema.activity, eq(schema.activity.id, pb.activityId))
    .where(
      and(
        eq(pb.userId, userId),
        gte(pb.distanceM, MIN_PREDICTION_DISTANCE_M),
        gte(
          pb.achievedAt,
          new Date(now.getTime() - PREDICTION_WINDOW_DAYS * DAY_MS),
        ),
      ),
    )
    .all();
  let best: { effort: (typeof efforts)[number]; vdot: number } | null = null;
  for (const effort of efforts) {
    const v = vdot(effort.distanceM, effort.durationS);
    if (!best || v > best.vdot) best = { effort, vdot: v };
  }
  if (!best) return null;
  const { effort, vdot: fitness } = best;
  return {
    vdot: Math.round(fitness * 10) / 10,
    basedOn: { ...effort, achievedAt: effort.achievedAt.toISOString() },
    races: PREDICTION_DISTANCES.map((distanceM) => ({
      distanceM,
      durationS: predictTime(fitness, distanceM),
    })),
  };
}
