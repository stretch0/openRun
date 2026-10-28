export type Units = 'metric' | 'imperial';

export const METRES_PER_MILE = 1609.344;

/** Distance in km or miles. */
export function distanceIn(metres: number, units: Units): number {
  return units === 'metric' ? metres / 1000 : metres / METRES_PER_MILE;
}

/** Seconds per km or per mile. Returns null for a zero distance. */
export function paceSeconds(
  metres: number,
  seconds: number,
  units: Units,
): number | null {
  const distance = distanceIn(metres, units);
  return distance > 0 ? seconds / distance : null;
}

/** Formats seconds as h:mm:ss, or m:ss under an hour. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Formats a pace like "5:30 /km" or "8:51 /mi". */
export function formatPace(
  metres: number,
  seconds: number,
  units: Units,
): string {
  const pace = paceSeconds(metres, seconds, units);
  if (pace === null) return '–';
  return `${formatDuration(pace)} /${units === 'metric' ? 'km' : 'mi'}`;
}

export function formatDistance(metres: number, units: Units): string {
  return `${distanceIn(metres, units).toFixed(2)} ${units === 'metric' ? 'km' : 'mi'}`;
}
