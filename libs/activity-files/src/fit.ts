import FitParser, { type ParsedFit } from 'fit-file-parser';
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

type FitSession = NonNullable<ParsedFit['sessions']>[number];
type TimedRecord = NonNullable<ParsedFit['records']>[number] & {
  timestamp: Date;
};

export async function parseFit(data: Uint8Array): Promise<ParsedActivity> {
  let fit: ParsedFit;
  try {
    fit = await new FitParser({ mode: 'list', force: true }).parseAsync(
      // The parser wants an ArrayBuffer of exactly this file.
      data.buffer.slice(
        data.byteOffset,
        data.byteOffset + data.byteLength,
      ) as ArrayBuffer,
    );
  } catch (e) {
    throw new ActivityFileError(`Not a readable FIT file: ${String(e)}`);
  }

  const records = (fit.records ?? []).filter(
    (r): r is TimedRecord => r.timestamp instanceof Date,
  );
  const session = fit.sessions?.[0];
  if (!session && records.length === 0) {
    throw new ActivityFileError('The FIT file has no activity data');
  }

  const stream = records.length ? toStream(records) : null;
  const start =
    session?.start_time ?? records[0]?.timestamp ?? new Date(Number.NaN);
  if (Number.isNaN(start.getTime())) {
    throw new ActivityFileError('The FIT file has no start time');
  }

  const lastT = stream?.t.at(-1) ?? 0;
  const distanceM = session?.total_distance ?? lastNumber(stream?.d ?? []) ?? 0;
  const elapsedS = Math.round(session?.total_elapsed_time ?? lastT);
  const durationS = Math.round(
    session?.total_timer_time ??
      (stream ? (movingTimes(stream).at(-1) ?? 0) : elapsedS),
  );

  return {
    format: 'fit',
    name: null,
    sport: sportFrom(session),
    startedAt: start,
    distanceM,
    durationS,
    elapsedS,
    elevationGainM:
      session?.total_ascent ?? (stream ? elevationGain(stream.alt) : null),
    avgHeartRate: round(session?.avg_heart_rate ?? mean(stream?.hr ?? [])),
    maxHeartRate: round(session?.max_heart_rate ?? max(stream?.hr ?? [])),
    avgCadence: round(
      session?.avg_cadence != null
        ? spm(session.avg_cadence, session.avg_fractional_cadence)
        : mean(stream?.cad ?? []),
    ),
    laps: (fit.laps ?? []).map((lap) => ({
      distanceM: lap.total_distance ?? 0,
      durationS: Math.round(
        lap.total_timer_time ?? lap.total_elapsed_time ?? 0,
      ),
      avgHeartRate: round(lap.avg_heart_rate),
      elevationGainM: lap.total_ascent ?? null,
    })),
    stream,
  };
}

function toStream(records: TimedRecord[]): Stream {
  const t0 = records[0].timestamp.getTime();
  const stream: Stream = {
    t: records.map((r) => (r.timestamp.getTime() - t0) / 1000),
    d: records.map((r) => r.distance ?? null),
    lat: records.map((r) => r.position_lat ?? null),
    lng: records.map((r) => r.position_long ?? null),
    alt: records.map((r) => r.enhanced_altitude ?? r.altitude ?? null),
    hr: records.map((r) => r.heart_rate ?? null),
    cad: records.map((r) =>
      r.cadence != null ? spm(r.cadence, r.fractional_cadence) : null,
    ),
  };
  // Some devices record positions but not distance.
  if (stream.d.every((d) => d == null) && stream.lat.some((l) => l != null)) {
    stream.d = distanceFromPositions(stream.lat, stream.lng);
  }
  return stream;
}

/** FIT running cadence counts one foot; steps per minute counts both. */
function spm(cadence: number, fractional?: number) {
  return (cadence + (fractional ?? 0)) * 2;
}

function sportFrom(session: FitSession | undefined): FileSport {
  const sport = session?.sport;
  const sub = session?.sub_sport;
  if (sport === 'running') {
    if (sub === 'trail') return 'trail_run';
    if (sub === 'treadmill' || sub === 'indoor_running') return 'treadmill';
    if (sub === 'track') return 'track';
    return 'run';
  }
  if (sport === 'walking' || sport === 'hiking') return 'walk';
  // Files without a session are almost always runs from older devices.
  return sport === undefined ? 'run' : 'other';
}

function lastNumber(values: (number | null)[]) {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (v != null) return v;
  }
  return null;
}

function round(v: number | null | undefined) {
  return v == null ? null : Math.round(v);
}
