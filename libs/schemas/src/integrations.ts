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
  /** More runs are waiting; the next sync carries on. */
  more: z.boolean(),
  error: z.string().nullable(),
});
export type IntegrationSync = z.infer<typeof integrationSyncSchema>;

export const intervalsConnectionSchema = z.object({
  accountId: z.string(),
  accountName: z.string().nullable(),
  /** Connected by pasting an API key, or by signing in to intervals.icu. */
  authMethod: z.enum(['api_key', 'oauth']),
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
    /**
     * True when the server has an intervals.icu OAuth app, so members can
     * connect with a button. Pasting an API key always works too.
     */
    oauth: z.boolean(),
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

/** Starts connecting through intervals.icu's sign-in page. */
export const startIntervalsOAuthSchema = z.object({
  syncFrom: z.iso.date().optional(),
});

/** How the OAuth sign-in ended, as the settings page is told in `?intervals=`. */
export const intervalsOAuthResults = [
  'connected',
  'denied',
  'expired',
  'taken',
  'failed',
] as const;
export type IntervalsOAuthResult = (typeof intervalsOAuthResults)[number];
