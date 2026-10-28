/**
 * Jack Daniels' VDOT (from Daniels and Gilbert's oxygen-cost and drop-dead
 * formulas): a single fitness number from a race result, used to predict
 * times at other distances. Valid for efforts from about 1500 m to the
 * marathon.
 */

/** Oxygen cost (ml/kg/min) of running at `v` metres per minute. */
function oxygenCost(v: number) {
  return -4.6 + 0.182258 * v + 0.000104 * v * v;
}

/** Fraction of VO2max that can be sustained for `minutes`. */
function sustainable(minutes: number) {
  return (
    0.8 +
    0.1894393 * Math.exp(-0.012778 * minutes) +
    0.2989558 * Math.exp(-0.1932605 * minutes)
  );
}

export function vdot(distanceM: number, durationS: number): number {
  const minutes = durationS / 60;
  return oxygenCost(distanceM / minutes) / sustainable(minutes);
}

/** Predicted time in seconds to run `distanceM` at the given VDOT. */
export function predictTime(vdotValue: number, distanceM: number): number {
  // vdot() falls as time rises, so bisect between very fast and very slow.
  let lo = 60;
  let hi = 24 * 3600;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (vdot(distanceM, mid) > vdotValue) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Race distances shown in predictions, in metres. */
export const PREDICTION_DISTANCES = [5000, 10000, 21097, 42195] as const;
