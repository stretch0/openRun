import { and, eq, gt, isNotNull, lte } from 'drizzle-orm';
import { type Db, schema } from '@openrun/db';
import { type HourlyForecast, forecastAt } from '@openrun/domain';

/** Open-Meteo forecasts about 16 days ahead. */
const FORECAST_DAYS = 14;
/** How old a run's forecast can get before it's fetched again. */
const STALE_MS = 3 * 3_600_000;
const DAY_MS = 86_400_000;

/**
 * Fetches forecasts for upcoming runs with a meeting point, one request per
 * place. Only the meeting point's position is sent, never anything about
 * members. Returns how many runs were updated.
 */
export async function refreshWeather(
  db: Db,
  url: string,
  now = new Date(),
  fetcher: typeof fetch = fetch,
): Promise<number> {
  const runs = db
    .select({
      id: schema.clubRun.id,
      startsAt: schema.clubRun.startsAt,
      updatedAt: schema.clubRun.weatherUpdatedAt,
      lat: schema.clubLocation.lat,
      lng: schema.clubLocation.lng,
    })
    .from(schema.clubRun)
    .innerJoin(
      schema.clubLocation,
      eq(schema.clubLocation.id, schema.clubRun.locationId),
    )
    .where(
      and(
        eq(schema.clubRun.status, 'scheduled'),
        isNotNull(schema.clubRun.locationId),
        gt(schema.clubRun.startsAt, now),
        lte(
          schema.clubRun.startsAt,
          new Date(now.getTime() + FORECAST_DAYS * DAY_MS),
        ),
      ),
    )
    .all()
    .filter(
      (r) => !r.updatedAt || now.getTime() - r.updatedAt.getTime() > STALE_MS,
    );

  // About a kilometre apart counts as the same place.
  const places = new Map<string, typeof runs>();
  for (const run of runs) {
    const key = `${run.lat.toFixed(2)},${run.lng.toFixed(2)}`;
    places.set(key, [...(places.get(key) ?? []), run]);
  }

  let updated = 0;
  for (const [key, placeRuns] of places) {
    const [lat, lng] = key.split(',');
    const query = new URL(url);
    query.search = new URLSearchParams({
      latitude: lat,
      longitude: lng,
      hourly:
        'weather_code,temperature_2m,precipitation_probability,wind_speed_10m',
      timezone: 'GMT',
      forecast_days: '16',
    }).toString();
    let hourly: HourlyForecast;
    try {
      const res = await fetcher(query, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`status ${res.status}`);
      hourly = ((await res.json()) as { hourly: HourlyForecast }).hourly;
    } catch (e) {
      console.error(`Weather for ${key} failed:`, e);
      continue;
    }
    for (const run of placeRuns) {
      db.update(schema.clubRun)
        .set({
          weather: forecastAt(hourly, run.startsAt),
          weatherUpdatedAt: now,
        })
        .where(eq(schema.clubRun.id, run.id))
        .run();
      updated++;
    }
  }
  return updated;
}
