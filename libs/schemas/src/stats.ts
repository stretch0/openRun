import { z } from 'zod';

export const totalSchema = z.object({
  /** First day of the period (YYYY-MM-DD) in the user's time zone. */
  start: z.string(),
  distanceM: z.number(),
  durationS: z.number(),
  count: z.number(),
});
export type Total = z.infer<typeof totalSchema>;

export const predictionsSchema = z.object({
  vdot: z.number(),
  /** The effort the prediction is based on: the best in the last 120 days. */
  basedOn: z.object({
    distanceM: z.number(),
    durationS: z.number(),
    activityId: z.string(),
    activityName: z.string(),
    achievedAt: z.iso.datetime(),
  }),
  races: z.array(z.object({ distanceM: z.number(), durationS: z.number() })),
});
export type Predictions = z.infer<typeof predictionsSchema>;

/** Running only: walks and other sports are left out of every total. */
export const statsSchema = z.object({
  thisWeek: totalSchema,
  thisMonth: totalSchema,
  thisYear: totalSchema,
  allTime: totalSchema,
  /** The last 12 weeks, oldest first. */
  weeks: z.array(totalSchema),
  /** The last 12 months, oldest first. */
  months: z.array(totalSchema),
  /** Every day of the last 53 weeks, oldest first, for the heatmap. */
  days: z.array(totalSchema),
  predictions: predictionsSchema.nullable(),
});
export type Stats = z.infer<typeof statsSchema>;
