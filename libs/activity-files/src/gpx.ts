import { XMLParser } from 'fast-xml-parser';
import {
  type Stream,
  distanceFromPositions,
  elevationGain,
  max,
  mean,
  movingTimes,
} from '@openrun/domain';
import {
  ActivityFileError,
  type FileSport,
  type ParsedActivity,
} from './types.js';

type Node = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  // Drop namespace prefixes (gpxtpx:hr, ns3:cad) so extensions from different
  // apps look the same.
  removeNSPrefix: true,
  isArray: (name) => ['trk', 'trkseg', 'trkpt'].includes(name),
  parseTagValue: true,
  processEntities: false,
});

export function parseGpx(data: Uint8Array): ParsedActivity {
  let doc: Node;
  try {
    doc = parser.parse(new TextDecoder().decode(data)) as Node;
  } catch (e) {
    throw new ActivityFileError(`Not a readable GPX file: ${String(e)}`);
  }
  const gpx = doc['gpx'] as Node | undefined;
  if (!gpx) throw new ActivityFileError('Not a GPX file');

  const tracks = (gpx['trk'] as Node[] | undefined) ?? [];
  const points = tracks.flatMap((trk) =>
    ((trk['trkseg'] as Node[] | undefined) ?? []).flatMap(
      (seg) => (seg['trkpt'] as Node[] | undefined) ?? [],
    ),
  );
  const timed = points
    .map((p) => ({ p, time: Date.parse(String(p['time'] ?? '')) }))
    .filter(({ time }) => !Number.isNaN(time))
    .sort((a, b) => a.time - b.time);
  if (timed.length < 2) {
    throw new ActivityFileError('The GPX file has no timed track points');
  }

  const t0 = timed[0].time;
  const lat = timed.map(({ p }) => num(p['@lat']));
  const lng = timed.map(({ p }) => num(p['@lon']));
  const stream: Stream = {
    t: timed.map(({ time }) => (time - t0) / 1000),
    d: distanceFromPositions(lat, lng),
    lat,
    lng,
    alt: timed.map(({ p }) => num(p['ele'])),
    hr: timed.map(({ p }) => num(extension(p, 'hr'))),
    cad: timed.map(({ p }) => {
      const cad = num(extension(p, 'cad'));
      // GPX cadence, like FIT, counts one foot.
      return cad === null ? null : cad * 2;
    }),
  };

  const track = tracks[0] ?? {};
  return {
    format: 'gpx',
    name: text(track['name']) ?? text((gpx['metadata'] as Node)?.['name']),
    sport: sportFrom(text(track['type'])),
    startedAt: new Date(t0),
    distanceM: stream.d.at(-1) ?? 0,
    durationS: Math.round(movingTimes(stream).at(-1) ?? 0),
    elapsedS: Math.round(stream.t.at(-1) ?? 0),
    elevationGainM: elevationGain(stream.alt),
    avgHeartRate: round(mean(stream.hr)),
    maxHeartRate: round(max(stream.hr)),
    avgCadence: round(mean(stream.cad)),
    laps: [],
    stream,
  };
}

/** Reads a value from <extensions>, wherever the app nested it. */
function extension(point: Node, key: string): unknown {
  const ext = point['extensions'];
  if (!ext || typeof ext !== 'object') return undefined;
  const stack: unknown[] = [ext];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    const value = (node as Node)[key];
    if (value !== undefined) return value;
    stack.push(...Object.values(node as Node));
  }
  return undefined;
}

function sportFrom(type: string | null): FileSport {
  const t = type?.toLowerCase() ?? '';
  // Strava writes numeric types (9 is running); other apps write words.
  if (t === '' || t === '9' || t === 'running' || t === 'run') return 'run';
  if (t.includes('trail')) return 'trail_run';
  if (t.includes('treadmill')) return 'treadmill';
  if (t.includes('walk') || t.includes('hik') || t === '10') return 'walk';
  if (t.includes('run')) return 'run';
  return 'other';
}

function num(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function text(v: unknown): string | null {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (typeof v === 'number') return String(v);
  return null;
}

function round(v: number | null) {
  return v === null ? null : Math.round(v);
}
