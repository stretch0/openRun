import { z } from 'zod';

export const integrationStatusSchema = z.enum(['ok', 'error', 'needs_key']);

export const integrationSyncSchema = z.object({
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  imported: z.number(),
  duplicates: z.number(),
  failed: z.number(),
  /** Activities the provider won't hand over, e.g. ones from Strava. */
  unavailable: z.number(),
  /** Runs removed because the provider now lists them as another sport. */
  removed: z.number(),
  /** More runs are waiting; the next sync carries on. */
  more: z.boolean(),
  error: z.string().nullable(),
});
export type IntegrationSync = z.infer<typeof integrationSyncSchema>;

export const intervalsConnectionSchema = z.object({
  accountId: z.string(),
  accountName: z.string().nullable(),
  /** Runs from this day on are imported. */
  syncFrom: z.iso.date(),
  status: integrationStatusSchema,
  lastError: z.string().nullable(),
  lastSyncAt: z.iso.datetime().nullable(),
  syncing: z.boolean(),
  importedCount: z.number(),
  /** Newest first. */
  syncs: z.array(integrationSyncSchema),
});
export type IntervalsConnection = z.infer<typeof intervalsConnectionSchema>;

export const integrationsSchema = z.object({
  intervals: z.object({
    /** False when the server has intervals.icu sync turned off. */
    available: z.boolean(),
    connection: intervalsConnectionSchema.nullable(),
  }),
});
export type Integrations = z.infer<typeof integrationsSchema>;

export const connectIntervalsSchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(8, 'Paste the API key from intervals.icu')
    .max(200),
  syncFrom: z.iso.date(),
});
export type ConnectIntervals = z.infer<typeof connectIntervalsSchema>;

export const updateIntervalsSchema = z.object({ syncFrom: z.iso.date() });
