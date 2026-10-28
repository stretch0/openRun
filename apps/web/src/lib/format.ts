import { PB_DISTANCES, type Units, distanceIn } from '@openrun/domain';
import type { Sport } from '@openrun/schemas';

export const SPORT_LABELS: Record<Sport, string> = {
  run: 'Run',
  trail_run: 'Trail run',
  treadmill: 'Treadmill',
  track: 'Track',
  walk: 'Walk',
  other: 'Other',
};

export function pbLabel(distanceM: number) {
  return (
    PB_DISTANCES.find((p) => p.distanceM === distanceM)?.label ??
    `${distanceM} m`
  );
}

export function formatDate(iso: string, timeZone?: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone,
  });
}

export function formatDateTime(iso: string, timeZone?: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  });
}

export function ordinal(n: number) {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? 'th'
      : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th');
  return `${n}${suffix}`;
}

/** Distance for totals: "313 km" from 100 up, "43.9 km" below. */
export function formatTotalDistance(metres: number, units: Units) {
  const v = distanceIn(metres, units);
  const unit = units === 'metric' ? 'km' : 'mi';
  return `${v >= 100 || v === 0 ? Math.round(v) : v.toFixed(1)} ${unit}`;
}

/** Duration for totals: "3h 28m", or "45m" under an hour. */
export function formatTotalTime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}
