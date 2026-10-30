import { z } from 'zod';

// The bits of the intervals.icu API we use, authenticated with the member's
// personal API key or an OAuth access token.
// https://forum.intervals.icu/t/api-access-to-intervals-icu/609
// https://forum.intervals.icu/t/intervals-icu-oauth-support/2759

/** How openRun signs in for a member: their API key, or an OAuth token. */
export type IntervalsAuth = { method: 'api_key' | 'oauth'; secret: string };

export class IntervalsError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }

  /** The key or token was refused: revoked, regenerated or mistyped. */
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

const USER_AGENT = 'openRun (self-hosted running log)';

function authorization({ method, secret }: IntervalsAuth) {
  return method === 'oauth'
    ? `Bearer ${secret}`
    : `Basic ${Buffer.from(`API_KEY:${secret}`).toString('base64')}`;
}

async function call(
  baseUrl: string,
  auth: IntervalsAuth,
  path: string,
  init: RequestInit = {},
) {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/v1${path}`, {
      ...init,
      headers: {
        authorization: authorization(auth),
        'user-agent': USER_AGENT,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new IntervalsError("Couldn't reach intervals.icu", 0);
  }
  if (res.ok) return res;
  if (res.status === 401 || res.status === 403) {
    throw new IntervalsError(
      auth.method === 'oauth'
        ? 'intervals.icu no longer lets openRun read your runs'
        : "intervals.icu didn't accept the API key",
      res.status,
    );
  }
  if (res.status === 429) {
    throw new IntervalsError('intervals.icu asked us to slow down', 429);
  }
  throw new IntervalsError(`intervals.icu answered ${res.status}`, res.status);
}

/** The athlete the key belongs to. */
export async function getAthlete(baseUrl: string, auth: IntervalsAuth) {
  const res = await call(baseUrl, auth, '/athlete/0');
  return athleteSchema.parse(await res.json());
}

/**
 * Only the fields we read; the full list is about 20 times bigger, and we
 * list everything since the start date on every sync.
 */
const ACTIVITY_FIELDS = Object.keys(activitySchema.shape).join(',');

/** Activities that started between two days, inclusive. */
export async function listActivities(
  baseUrl: string,
  auth: IntervalsAuth,
  oldest: string,
  newest: string,
): Promise<IntervalsActivity[]> {
  const res = await call(
    baseUrl,
    auth,
    `/athlete/0/activities?oldest=${oldest}&newest=${newest}&fields=${ACTIVITY_FIELDS}`,
  );
  return z.array(activitySchema).parse(await res.json());
}

/**
 * The activity's file: the original from the watch when it's FIT or GPX,
 * otherwise (e.g. TCX) the FIT that intervals.icu builds from it.
 */
export async function downloadActivity(
  baseUrl: string,
  auth: IntervalsAuth,
  activity: IntervalsActivity,
): Promise<Uint8Array> {
  const original = ['fit', 'gpx'].includes(activity.file_type ?? '');
  const res = await call(
    baseUrl,
    auth,
    `/activity/${encodeURIComponent(activity.id)}/${original ? 'file' : 'fit-file'}`,
  );
  return new Uint8Array(await res.arrayBuffer());
}

export type IntervalsOAuthApp = { clientId: string; clientSecret: string };

/** Reading activities is all openRun needs. */
const OAUTH_SCOPE = 'ACTIVITY:READ';

/** Where to send the member to let openRun read their activities. */
export function authorizeUrl(
  baseUrl: string,
  app: IntervalsOAuthApp,
  params: { redirectUri: string; state: string; codeChallenge: string },
) {
  const url = new URL(`${baseUrl}/oauth/authorize`);
  url.search = new URLSearchParams({
    client_id: app.clientId,
    redirect_uri: params.redirectUri,
    scope: OAUTH_SCOPE,
    state: params.state,
    code_challenge: params.codeChallenge,
    code_challenge_method: 'S256',
  }).toString();
  return url.toString();
}

const tokenSchema = z.object({
  access_token: z.string().min(1),
  athlete: athleteSchema,
});

/**
 * Swaps the code from the redirect for an access token. The code only lasts
 * two minutes. Tokens don't expire; there's no refresh token.
 */
export async function exchangeCode(
  baseUrl: string,
  app: IntervalsOAuthApp,
  code: string,
  codeVerifier: string,
) {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/oauth/token`, {
      method: 'POST',
      headers: { 'user-agent': USER_AGENT },
      body: new URLSearchParams({
        client_id: app.clientId,
        client_secret: app.clientSecret,
        code,
        code_verifier: codeVerifier,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new IntervalsError("Couldn't reach intervals.icu", 0);
  }
  if (!res.ok) {
    throw new IntervalsError(
      `intervals.icu refused the sign-in (${res.status})`,
      res.status,
    );
  }
  const body = tokenSchema.parse(await res.json());
  return { accessToken: body.access_token, athlete: body.athlete };
}

/** Revokes an OAuth token, so intervals.icu stops listing openRun. */
export async function disconnectApp(baseUrl: string, accessToken: string) {
  await call(
    baseUrl,
    { method: 'oauth', secret: accessToken },
    '/disconnect-app',
    { method: 'DELETE' },
  );
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
