import { z } from 'zod';
import { editSchema } from './patch.js';
import { visibilitySchema } from './privacy.js';

export const sportSchema = z.enum([
  'run',
  'trail_run',
  'treadmill',
  'track',
  'walk',
  'other',
]);
export type Sport = z.infer<typeof sportSchema>;

export const activitySourceSchema = z.enum([
  'manual',
  'file',
  'garmin',
  'strava',
]);

export const activitySummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  sport: sportSchema,
  source: activitySourceSchema,
  visibility: visibilitySchema,
  startedAt: z.iso.datetime(),
  distanceM: z.number(),
  durationS: z.number(),
  elevationGainM: z.number().nullable(),
  avgHeartRate: z.number().nullable(),
});
export type ActivitySummary = z.infer<typeof activitySummarySchema>;

export const activityListSchema = z.object({
  items: z.array(activitySummarySchema),
  /** Pass as `before` to get the next page; null on the last page. */
  nextCursor: z.string().nullable(),
});
export type ActivityList = z.infer<typeof activityListSchema>;

export const lapSchema = z.object({
  index: z.number(),
  distanceM: z.number(),
  durationS: z.number(),
  avgHeartRate: z.number().nullable(),
  elevationGainM: z.number().nullable(),
});

export const splitSchema = z.object({
  index: z.number(),
  distanceM: z.number(),
  durationS: z.number(),
  avgHeartRate: z.number().nullable(),
  elevationChangeM: z.number().nullable(),
});
export type Split = z.infer<typeof splitSchema>;

export const bestEffortSchema = z.object({
  distanceM: z.number(),
  durationS: z.number(),
  /** 1 is a personal best; 2 is the second fastest ever, and so on. */
  rank: z.number(),
});
export type BestEffort = z.infer<typeof bestEffortSchema>;

export const activitySchema = activitySummarySchema.extend({
  elapsedS: z.number().nullable(),
  maxHeartRate: z.number().nullable(),
  avgCadence: z.number().nullable(),
  rpe: z.number().nullable(),
  notes: z.string().nullable(),
  shoeId: z.string().nullable(),
  hasStream: z.boolean(),
  hasFile: z.boolean(),
  laps: z.array(lapSchema),
  /** Splits per km or mile, following the user's units. */
  splits: z.array(splitSchema),
  bestEfforts: z.array(bestEffortSchema),
});
export type Activity = z.infer<typeof activitySchema>;

const nullableNumbers = z.array(z.number().nullable());

/** Samples for the map and charts, downsampled by the API. */
export const activityStreamSchema = z.object({
  t: z.array(z.number()),
  d: nullableNumbers,
  lat: nullableNumbers,
  lng: nullableNumbers,
  alt: nullableNumbers,
  hr: nullableNumbers,
  cad: nullableNumbers,
});
export type ActivityStream = z.infer<typeof activityStreamSchema>;

export const createActivitySchema = z.object({
  name: z.string().trim().min(1).max(200),
  sport: sportSchema.default('run'),
  startedAt: z.iso.datetime({ offset: true }),
  distanceM: z.number().positive().max(1_000_000),
  durationS: z
    .number()
    .int()
    .positive()
    .max(14 * 24 * 3600),
  elevationGainM: z.number().min(0).max(100_000).nullish(),
  avgHeartRate: z.number().int().min(20).max(250).nullish(),
  rpe: z.number().int().min(1).max(10).nullish(),
  notes: z.string().max(10_000).nullish(),
  shoeId: z.string().nullish(),
  /** Defaults to the user's privacy settings. */
  visibility: visibilitySchema.optional(),
});
export type CreateActivity = z.infer<typeof createActivitySchema>;

export const updateActivitySchema = editSchema(
  createActivitySchema.pick({
    name: true,
    sport: true,
    rpe: true,
    notes: true,
    shoeId: true,
    visibility: true,
  }),
);
export type UpdateActivity = z.infer<typeof updateActivitySchema>;

export const importResultSchema = z.object({
  fileName: z.string(),
  status: z.enum(['imported', 'duplicate', 'failed']),
  activityId: z.string().nullable(),
  error: z.string().nullable(),
});
export type ImportResult = z.infer<typeof importResultSchema>;

export const personalBestSchema = z.object({
  distanceM: z.number(),
  durationS: z.number(),
  activityId: z.string(),
  activityName: z.string(),
  achievedAt: z.iso.datetime(),
});
export type PersonalBest = z.infer<typeof personalBestSchema>;
