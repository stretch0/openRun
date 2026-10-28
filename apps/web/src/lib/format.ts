import { PB_DISTANCES } from '@openrun/domain';
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
