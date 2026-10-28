import { type Stream, mean, movingTimes } from './stream.js';

/** Distances we track personal bests for, in metres. */
export const PB_DISTANCES = [
  { distanceM: 1000, label: '1k' },
  { distanceM: 1609, label: '1 mile' },
  { distanceM: 5000, label: '5k' },
  { distanceM: 10000, label: '10k' },
  { distanceM: 21097, label: 'Half marathon' },
  { distanceM: 42195, label: 'Marathon' },
] as const;

export type Effort = { distanceM: number; durationS: number };

/** Distance and moving time at each sample, with missing distances filled forward. */
function track(stream: Pick<Stream, 't' | 'd'>) {
  const time = movingTimes(stream);
  const dist: number[] = [];
  let last = 0;
  for (const d of stream.d) {
    last = d ?? last;
    dist.push(last);
  }
  return { time, dist };
}

/** Moving time at distance `target`, interpolated between samples i and i + 1. */
function timeAt(
  dist: number[],
  time: number[],
  i: number,
  target: number,
): number {
  const span = dist[i + 1] - dist[i];
  if (span <= 0) return time[i];
  return time[i] + ((target - dist[i]) / span) * (time[i + 1] - time[i]);
}

/**
 * The fastest time over each of `distances` within the activity, using a
 * sliding window over the stream. Distances longer than the activity are
 * left out.
 */
export function bestEfforts(
  stream: Pick<Stream, 't' | 'd'>,
  distances: readonly number[] = PB_DISTANCES.map((p) => p.distanceM),
): Effort[] {
  const { time, dist } = track(stream);
  const total = dist.at(-1) ?? 0;
  const out: Effort[] = [];
  for (const distanceM of distances) {
    if (distanceM > total) continue;
    let best = Infinity;
    let i = 0;
    for (let j = 1; j < dist.length; j++) {
      const target = dist[j] - distanceM;
      if (target < 0) continue;
      while (i + 1 < j && dist[i + 1] <= target) i++;
      const duration = time[j] - timeAt(dist, time, i, target);
      if (duration > 0 && duration < best) best = duration;
    }
    if (Number.isFinite(best)) out.push({ distanceM, durationS: best });
  }
  return out;
}

/**
 * Best efforts for an activity entered by hand, which has no stream. It
 * counts towards a distance when it is that distance or up to 2% longer, with
 * the time scaled down to the exact distance.
 */
export function manualEfforts(
  distanceM: number,
  durationS: number,
  distances: readonly number[] = PB_DISTANCES.map((p) => p.distanceM),
): Effort[] {
  return distances
    .filter((d) => distanceM >= d && distanceM <= d * 1.02)
    .map((d) => ({ distanceM: d, durationS: (durationS * d) / distanceM }));
}

export type Split = {
  /** 1-based split number. */
  index: number;
  /** Length of this split; the last one may be shorter. */
  distanceM: number;
  durationS: number;
  avgHeartRate: number | null;
  /** Altitude change from the start to the end of the split. */
  elevationChangeM: number | null;
};

/** Splits every `splitM` metres (1000 for km, 1609.344 for miles). */
export function splits(stream: Stream, splitM: number): Split[] {
  const { time, dist } = track(stream);
  const total = dist.at(-1) ?? 0;
  const out: Split[] = [];
  let startTime = 0;
  let startIdx = 0;
  let boundary = splitM;
  let i = 0;
  const finish = (endTime: number, endIdx: number, distanceM: number) => {
    const startAlt = firstValue(stream.alt, startIdx, endIdx);
    const endAlt = lastValue(stream.alt, startIdx, endIdx);
    out.push({
      index: out.length + 1,
      distanceM,
      durationS: endTime - startTime,
      avgHeartRate: roundOrNull(mean(stream.hr.slice(startIdx, endIdx + 1))),
      elevationChangeM:
        startAlt != null && endAlt != null ? endAlt - startAlt : null,
    });
    startTime = endTime;
    startIdx = endIdx;
  };
  while (boundary <= total) {
    while (i + 1 < dist.length && dist[i + 1] < boundary) i++;
    if (i + 1 >= dist.length) break;
    finish(timeAt(dist, time, i, boundary), i + 1, splitM);
    boundary += splitM;
  }
  const remaining = total - (boundary - splitM);
  // Drop a final sliver under 50 m; it's mostly GPS noise after stopping.
  if (remaining >= 50) finish(time.at(-1) ?? 0, dist.length - 1, remaining);
  return out;
}

function firstValue(arr: (number | null)[], from: number, to: number) {
  for (let i = from; i <= to; i++) if (arr[i] != null) return arr[i];
  return null;
}

function lastValue(arr: (number | null)[], from: number, to: number) {
  for (let i = to; i >= from; i--) if (arr[i] != null) return arr[i];
  return null;
}

function roundOrNull(v: number | null) {
  return v === null ? null : Math.round(v);
}
