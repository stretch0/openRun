// Synthetic GPX runs for the demo: real routes, made-up runners.

type Point = [lat: number, lng: number];

const EARTH_M = 6_371_000;

export function distanceM([lat1, lng1]: Point, [lat2, lng2]: Point) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.sqrt(a));
}

/** A small seeded random number generator (mulberry32), so seeds repeat. */
export function random(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4_294_967_296;
  };
}

// Primrose Hill is the only real climb nearby.
const HILL: Point = [51.5395, -0.1607];
function elevation(p: Point) {
  const d = distanceM(p, HILL);
  // Gentle rises elsewhere, from where the point is.
  const roll = 3 * Math.sin(p[0] * 1200) + 2 * Math.cos(p[1] * 900);
  return 32 + roll + 31 * Math.exp(-((d / 220) ** 2));
}

export type RunPlan = {
  /** Routes run one after another; each should start where the last ended. */
  route: Point[];
  start: Date;
  /** Average pace in seconds per kilometre. */
  paceSPerKm: number;
  /** Roughly how hard: resting heart rate is 52, max about 188. */
  effort: 'easy' | 'steady' | 'hard';
  name: string;
  seed: number;
};

const HEART_RATE = { easy: 138, steady: 152, hard: 166 };

/** A GPX file sampled every second, as watches do, with heart rate and cadence. */
export function gpxRun(plan: RunPlan): string {
  const rand = random(plan.seed);
  const speed = 1000 / plan.paceSPerKm;
  const legs = plan.route.slice(1).map((p, i) => ({
    from: plan.route[i],
    to: p,
    m: distanceM(plan.route[i], p),
  }));
  const total = legs.reduce((sum, l) => sum + l.m, 0);

  const points: string[] = [];
  let leg = 0;
  let intoLeg = 0;
  let done = 0;
  let t = 0;
  let drift = 0;
  // Pace wanders slowly by a few percent either way.
  let feel = 1;
  while (done < total) {
    const { from, to, m } = legs[leg];
    const f = m === 0 ? 0 : intoLeg / m;
    const p: Point = [
      from[0] + (to[0] - from[0]) * f,
      from[1] + (to[1] - from[1]) * f,
    ];
    // Heart rate climbs over the first few minutes, then drifts up slowly.
    const warmUp = Math.min(1, t / 300);
    drift = Math.min(8, drift + 0.004);
    const hr = Math.round(
      95 + (HEART_RATE[plan.effort] - 95) * warmUp + drift + rand() * 2 - 1,
    );
    const cad = Math.round(84 + (plan.effort === 'hard' ? 4 : 0) + rand() * 3);
    const time = new Date(plan.start.getTime() + t * 1000).toISOString();
    points.push(
      `<trkpt lat="${p[0].toFixed(6)}" lon="${p[1].toFixed(6)}"><ele>${elevation(p).toFixed(1)}</ele><time>${time}</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${hr}</gpxtpx:hr><gpxtpx:cad>${cad}</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions></trkpt>`,
    );

    // The hill slows everyone down.
    feel = Math.min(1.05, Math.max(0.95, feel + (rand() - 0.5) * 0.004));
    const climb = elevation(p) > 45 ? 0.85 : 1;
    let step = speed * climb * feel;
    t += 1;
    done += step;
    while (step > 0 && leg < legs.length) {
      const left = legs[leg].m - intoLeg;
      if (step < left) {
        intoLeg += step;
        step = 0;
      } else {
        step -= left;
        leg += 1;
        intoLeg = 0;
      }
    }
    if (leg >= legs.length) break;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="openRun demo" version="1.1" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <metadata><time>${plan.start.toISOString()}</time></metadata>
  <trk><name>${plan.name}</name><type>running</type><trkseg>
${points.join('\n')}
  </trkseg></trk>
</gpx>`;
}

/** Routes joined end to end, `laps` times over. */
export function laps(route: Point[], times: number): Point[] {
  return Array.from({ length: times }, (_, i) =>
    i === 0 ? route : route.slice(1),
  ).flat();
}

export function routeLengthM(route: Point[]) {
  let m = 0;
  for (let i = 1; i < route.length; i++) m += distanceM(route[i - 1], route[i]);
  return m;
}
