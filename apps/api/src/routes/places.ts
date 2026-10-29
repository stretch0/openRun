import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { type Place, placeSearchSchema } from '@openrun/schemas';
import { type AuthedEnv, requireUser } from '../context.js';
import { version } from '../version.js';

/**
 * Place search for meeting points, proxied so members' devices never talk to
 * the geocoder: it sees this server and the search text, nothing else.
 * Nominatim's public server allows one request a second and no
 * search-as-you-type, so requests are queued and results cached.
 */

const MIN_INTERVAL_MS = 1000;
const CACHE_SIZE = 200;
const cache = new Map<string, Place[]>();
let queue: Promise<unknown> = Promise.resolve();
let last = 0;

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = last + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    return fn();
  });
  queue = run.catch(() => undefined);
  return run;
}

type NominatimResult = {
  name?: string;
  display_name: string;
  lat: string;
  lon: string;
};

export const placeRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .get('/', zValidator('query', placeSearchSchema), async (c) => {
    const config = c.get('config');
    if (!config.placeSearchUrl) {
      return c.json({ error: 'Place search is turned off' }, 404);
    }
    const { q, lat, lng } = c.req.valid('query');
    const url = new URL(config.placeSearchUrl);
    url.searchParams.set('q', q);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '5');
    if (lat !== undefined && lng !== undefined) {
      // A box about 50 km across: a preference, not a limit.
      url.searchParams.set(
        'viewbox',
        [lng - 0.3, lat + 0.3, lng + 0.3, lat - 0.3]
          .map((n) => n.toFixed(4))
          .join(','),
      );
    }
    const language = c.req.header('accept-language');
    if (language) url.searchParams.set('accept-language', language);

    const key = url.toString();
    const hit = cache.get(key);
    if (hit) return c.json(hit);

    try {
      const results = await throttled(async () => {
        const res = await fetch(url, {
          headers: { 'user-agent': `openRun/${version} (${config.origin})` },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw new Error(`Place search returned ${res.status}`);
        return (await res.json()) as NominatimResult[];
      });
      const places: Place[] = results.map((r) => ({
        name: r.name || r.display_name.split(',')[0],
        address: r.display_name,
        lat: Number(r.lat),
        lng: Number(r.lon),
      }));
      if (cache.size >= CACHE_SIZE) {
        cache.delete(cache.keys().next().value as string);
      }
      cache.set(key, places);
      return c.json(places);
    } catch {
      return c.json({ error: "Place search isn't available right now" }, 502);
    }
  });
