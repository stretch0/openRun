import { FitBaseType, FitEncoder } from 'fit-file-parser/encoder';

/** Test fixtures: small synthetic FIT and GPX runs. Not exported from the lib. */

const START = new Date('2026-10-01T07:00:00Z');
const SEMICIRCLES = 2 ** 31 / 180;

type RunOptions = {
  seconds?: number;
  /** Metres per second. */
  speed?: number;
  sport?: number;
  subSport?: number;
  withSession?: boolean;
  start?: Date;
};

/** A FIT run sampled every second, heading north from London. */
export function fitRun({
  seconds = 600,
  speed = 3.5,
  sport = 1,
  subSport = 0,
  withSession = true,
  start = START,
}: RunOptions = {}): Uint8Array<ArrayBuffer> {
  const enc = new FitEncoder();
  const ts = (offsetS: number) =>
    FitEncoder.toFitTimestamp(new Date(start.getTime() + offsetS * 1000));
  const u32 = (number: number, value: number) => ({
    number,
    size: 4,
    baseType: FitBaseType.Uint32,
    value: Math.round(value),
  });
  const u16 = (number: number, value: number) => ({
    number,
    size: 2,
    baseType: FitBaseType.Uint16,
    value: Math.round(value),
  });
  const u8 = (number: number, value: number) => ({
    number,
    size: 1,
    baseType: FitBaseType.Uint8,
    value,
  });
  const s32 = (number: number, value: number) => ({
    number,
    size: 4,
    baseType: FitBaseType.Sint32,
    value: Math.round(value),
  });
  const en = (number: number, value: number) => ({
    number,
    size: 1,
    baseType: FitBaseType.Enum,
    value,
  });

  // file_id: type = activity
  enc.writeMessage(0, [en(0, 4), u16(1, 1), u32(4, ts(0))]);
  for (let i = 0; i <= seconds; i++) {
    const distance = i * speed;
    enc.writeMessage(20, [
      u32(253, ts(i)),
      s32(0, (51.5 + distance / 111_195) * SEMICIRCLES),
      s32(1, -0.1 * SEMICIRCLES),
      // enhanced_altitude: scale 5, offset 500. Climbs 10 m over the run.
      u32(78, (20 + (10 * i) / seconds + 500) * 5),
      u8(3, 140 + (i % 20)),
      u8(4, 85),
      u32(5, distance * 100),
    ]);
  }
  const total = seconds * speed;
  const timing = [
    u32(253, ts(seconds)),
    u32(2, ts(0)),
    u32(7, seconds * 1000),
    u32(8, seconds * 1000),
    u32(9, total * 100),
  ];
  // lap: avg_heart_rate (15), total_ascent (21)
  enc.writeMessage(19, [...timing, u8(15, 150), u16(21, 10)]);
  if (withSession) {
    // session: sport (5), sub_sport (6), avg/max HR (16/17), avg_cadence (18), total_ascent (22)
    enc.writeMessage(18, [
      ...timing,
      en(5, sport),
      en(6, subSport),
      u8(16, 150),
      u8(17, 159),
      u8(18, 85),
      u16(22, 10),
    ]);
  }
  // Copied so it is backed by a plain ArrayBuffer, which File and Blob need.
  return new Uint8Array(enc.close());
}

/** A GPX run with Garmin TrackPointExtension heart rate and cadence. */
export function gpxRun({ seconds = 600, speed = 3.5 } = {}): string {
  const points = Array.from({ length: seconds / 5 + 1 }, (_, k) => {
    const i = k * 5;
    const lat = 51.5 + (i * speed) / 111_195;
    const time = new Date(START.getTime() + i * 1000).toISOString();
    return `<trkpt lat="${lat.toFixed(7)}" lon="-0.1"><ele>${(20 + (10 * i) / seconds).toFixed(1)}</ele><time>${time}</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>150</gpxtpx:hr><gpxtpx:cad>85</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions></trkpt>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="test" version="1.1" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <metadata><time>${START.toISOString()}</time></metadata>
  <trk><name>Morning Run</name><type>running</type><trkseg>
${points}
  </trkseg></trk>
</gpx>`;
}
