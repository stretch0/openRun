/**
 * Time-series samples for an activity, stored column-wise. Every array has
 * the same length; a null means the device did not record that value.
 */
export type Stream = {
  /** Seconds since the activity started (elapsed, including pauses). */
  t: number[];
  /** Cumulative distance in metres. */
  d: (number | null)[];
  lat: (number | null)[];
  lng: (number | null)[];
  /** Altitude in metres. */
  alt: (number | null)[];
  /** Heart rate in beats per minute. */
  hr: (number | null)[];
  /** Cadence in steps per minute. */
  cad: (number | null)[];
};

export type StreamKey = keyof Stream;

const EARTH_RADIUS_M = 6_371_008.8;

/** Great-circle distance between two points, in metres. */
export function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Cumulative distance from positions, for files that don't record distance. */
export function distanceFromPositions(
  lat: (number | null)[],
  lng: (number | null)[],
): number[] {
  const out: number[] = [];
  let total = 0;
  let prev: [number, number] | null = null;
  for (let i = 0; i < lat.length; i++) {
    const la = lat[i];
    const lo = lng[i];
    if (la != null && lo != null) {
      if (prev) total += haversine(prev[0], prev[1], la, lo);
      prev = [la, lo];
    }
    out.push(total);
  }
  return out;
}

/** A gap longer than this between samples, without moving, is a pause. */
const PAUSE_GAP_S = 10;
/** Slower than this (m/s) counts as standing still. */
const STOPPED_SPEED = 0.5;

/**
 * Cumulative moving time at each sample, in seconds. Intervals where the
 * runner was standing still are not counted. Without distance data, only
 * long gaps (auto-pause) are left out.
 */
export function movingTimes(stream: Pick<Stream, 't' | 'd'>): number[] {
  const out: number[] = [];
  let moving = 0;
  for (let i = 0; i < stream.t.length; i++) {
    if (i > 0) {
      const dt = stream.t[i] - stream.t[i - 1];
      const d0 = stream.d[i - 1];
      const d1 = stream.d[i];
      const isMoving =
        d0 != null && d1 != null
          ? (d1 - d0) / dt >= STOPPED_SPEED
          : dt <= PAUSE_GAP_S;
      if (dt > 0 && isMoving) moving += dt;
    }
    out.push(moving);
  }
  return out;
}

/** Ignore altitude changes smaller than this, to filter GPS and barometer noise. */
const ELEVATION_THRESHOLD_M = 3;

/**
 * Total ascent in metres. A climb counts once it rises at least the
 * threshold above the last low point, and runs to its highest point.
 */
export function elevationGain(alt: (number | null)[]): number | null {
  let gain = 0;
  let low: number | null = null;
  let high = 0;
  let climbing = false;
  for (const a of alt) {
    if (a == null) continue;
    if (low === null) {
      low = high = a;
    } else if (climbing) {
      if (a > high) {
        high = a;
      } else if (high - a >= ELEVATION_THRESHOLD_M) {
        gain += high - low;
        low = high = a;
        climbing = false;
      }
    } else if (a < low) {
      low = a;
    } else if (a - low >= ELEVATION_THRESHOLD_M) {
      high = a;
      climbing = true;
    }
  }
  if (low === null) return null;
  return climbing ? gain + high - low : gain;
}

/**
 * Reduces a stream to at most `maxPoints` samples, for maps and charts.
 * Keeps the first and last samples.
 */
export function downsample(stream: Stream, maxPoints: number): Stream {
  const n = stream.t.length;
  if (n <= maxPoints) return stream;
  const step = (n - 1) / (maxPoints - 1);
  const idx = Array.from({ length: maxPoints }, (_, i) => Math.round(i * step));
  const pick = <T>(arr: T[]) => idx.map((i) => arr[i]);
  return {
    t: pick(stream.t),
    d: pick(stream.d),
    lat: pick(stream.lat),
    lng: pick(stream.lng),
    alt: pick(stream.alt),
    hr: pick(stream.hr),
    cad: pick(stream.cad),
  };
}

/** Mean of the non-null values, or null if there are none. */
export function mean(values: (number | null)[]): number | null {
  let sum = 0;
  let count = 0;
  for (const v of values) {
    if (v == null) continue;
    sum += v;
    count++;
  }
  return count ? sum / count : null;
}

/** Largest non-null value, or null if there are none. */
export function max(values: (number | null)[]): number | null {
  let out: number | null = null;
  for (const v of values) if (v != null && (out === null || v > out)) out = v;
  return out;
}

/**
 * Speed in m/s at each sample, averaged over a window of `windowS` seconds
 * centred on it, so GPS jitter doesn't make pace charts spiky. Null where
 * the runner was stopped or there's no distance.
 */
export function smoothedSpeed(
  stream: Pick<Stream, 't' | 'd'>,
  windowS = 30,
): (number | null)[] {
  const { t, d } = stream;
  const out: (number | null)[] = [];
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < t.length; i++) {
    while (t[lo] < t[i] - windowS / 2) lo++;
    while (hi + 1 < t.length && t[hi + 1] <= t[i] + windowS / 2) hi++;
    const d0 = d[lo];
    const d1 = d[hi];
    const dt = t[hi] - t[lo];
    if (d0 == null || d1 == null || dt <= 0) {
      out.push(null);
      continue;
    }
    const speed = (d1 - d0) / dt;
    out.push(speed >= STOPPED_SPEED ? speed : null);
  }
  return out;
}
