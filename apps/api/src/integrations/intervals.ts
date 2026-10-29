import { z } from 'zod';

// The bits of the intervals.icu API we use, authenticated with the member's
// personal API key. https://forum.intervals.icu/t/api-access-to-intervals-icu/609

export class IntervalsError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }

  /** The key was refused: revoked, regenerated or mistyped. */
  get badKey() {
    return this.status === 401 || this.status === 403;
  }
}

const athleteSchema = z.object({
  id: z.coerce.string(),
  name: z.string().nullish(),
});

const activitySchema = z.looseObject({
  id: z.coerce.string(),
  start_date: z.string().nullish(),
  start_date_local: z.string().nullish(),
  type: z.string().nullish(),
  name: z.string().nullish(),
  source: z.string().nullish(),
  file_type: z.string().nullish(),
  device_name: z.string().nullish(),
});
export type IntervalsActivity = z.infer<typeof activitySchema>;

const TIMEOUT_MS = 30_000;

async function call(baseUrl: string, apiKey: string, path: string) {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/v1${path}`, {
      headers: {
        authorization: `Basic ${Buffer.from(`API_KEY:${apiKey}`).toString('base64')}`,
        'user-agent': 'openRun (self-hosted running log)',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new IntervalsError("Couldn't reach intervals.icu", 0);
  }
  if (res.ok) return res;
  if (res.status === 401 || res.status === 403) {
    throw new IntervalsError(
      "intervals.icu didn't accept the API key",
      res.status,
    );
  }
  if (res.status === 429) {
    throw new IntervalsError('intervals.icu asked us to slow down', 429);
  }
  throw new IntervalsError(`intervals.icu answered ${res.status}`, res.status);
}

/** The athlete the key belongs to. */
export async function getAthlete(baseUrl: string, apiKey: string) {
  const res = await call(baseUrl, apiKey, '/athlete/0');
  return athleteSchema.parse(await res.json());
}

/** Activities that started between two days, inclusive. */
export async function listActivities(
  baseUrl: string,
  apiKey: string,
  oldest: string,
  newest: string,
): Promise<IntervalsActivity[]> {
  const res = await call(
    baseUrl,
    apiKey,
    `/athlete/0/activities?oldest=${oldest}&newest=${newest}`,
  );
  return z.array(activitySchema).parse(await res.json());
}

/**
 * The activity's file: the original from the watch when it's FIT or GPX,
 * otherwise (e.g. TCX) the FIT that intervals.icu builds from it.
 */
export async function downloadActivity(
  baseUrl: string,
  apiKey: string,
  activity: IntervalsActivity,
): Promise<Uint8Array> {
  const original = ['fit', 'gpx'].includes(activity.file_type ?? '');
  const res = await call(
    baseUrl,
    apiKey,
    `/activity/${encodeURIComponent(activity.id)}/${original ? 'file' : 'fit-file'}`,
  );
  return new Uint8Array(await res.arrayBuffer());
}

/** Running activity types; everything else is left on intervals.icu. */
export const RUN_TYPES = new Set(['Run', 'TrailRun', 'VirtualRun']);

/**
 * When it started. `start_date` is UTC; `start_date_local` has no zone, so is
 * only good to within a day.
 */
export function startOf(a: IntervalsActivity): Date | null {
  const raw = a.start_date ?? a.start_date_local;
  if (!raw) return null;
  const withZone = /[zZ]|[+-]\d\d:?\d\d$/.test(raw) ? raw : `${raw}Z`;
  const date = new Date(withZone);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The device, as Garmin's brand guidelines want it credited
 * ("Garmin Forerunner 265").
 */
export function deviceOf(a: IntervalsActivity): string | null {
  const name = a.device_name?.trim() || null;
  const garmin = a.source === 'GARMIN_CONNECT';
  if (!garmin) return name;
  if (!name) return 'Garmin';
  return /^garmin\b/i.test(name) ? name : `Garmin ${name}`;
}
