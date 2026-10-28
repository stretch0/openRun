import type { Stream } from '@openrun/domain';

export const fileSports = [
  'run',
  'trail_run',
  'treadmill',
  'track',
  'walk',
  'other',
] as const;
export type FileSport = (typeof fileSports)[number];

export type ParsedLap = {
  distanceM: number;
  durationS: number;
  avgHeartRate: number | null;
  elevationGainM: number | null;
};

/** One activity read from a FIT or GPX file, in a device-neutral shape. */
export type ParsedActivity = {
  format: 'fit' | 'gpx';
  /** Name from the file, if it had one. */
  name: string | null;
  sport: FileSport;
  startedAt: Date;
  distanceM: number;
  /** Moving (timer) time in seconds. */
  durationS: number;
  elapsedS: number;
  elevationGainM: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  /** Steps per minute. */
  avgCadence: number | null;
  laps: ParsedLap[];
  /** Null when the file has no samples, e.g. a summary-only FIT file. */
  stream: Stream | null;
};

export class ActivityFileError extends Error {}
