import { gzipSync } from 'node:zlib';
import { ActivityFileError, parseActivityFile } from './index.js';
import { fitRun, gpxRun } from './test-files.js';

const utf8 = (s: string) => new TextEncoder().encode(s);

describe('parseActivityFile', () => {
  it('reads a FIT run', async () => {
    const a = await parseActivityFile(fitRun({ subSport: 3 }));
    expect(a).toMatchObject({
      format: 'fit',
      sport: 'trail_run',
      startedAt: new Date('2026-10-01T07:00:00Z'),
      distanceM: 2100,
      durationS: 600,
      elapsedS: 600,
      elevationGainM: 10,
      avgHeartRate: 150,
      maxHeartRate: 159,
      avgCadence: 170,
      laps: [
        {
          distanceM: 2100,
          durationS: 600,
          avgHeartRate: 150,
          elevationGainM: 10,
        },
      ],
    });
    const s = a.stream;
    if (!s) throw new Error('Expected a stream');
    expect(s.t).toHaveLength(601);
    expect(s.d[600]).toBeCloseTo(2100);
    expect(s.lat[0]).toBeCloseTo(51.5, 5);
    expect(s.lng[0]).toBeCloseTo(-0.1, 5);
    expect(s.alt[0]).toBeCloseTo(20);
    expect(s.cad[0]).toBe(170);
  });

  it('falls back to the records when a FIT file has no session', async () => {
    const a = await parseActivityFile(fitRun({ withSession: false }));
    expect(a).toMatchObject({ sport: 'run', durationS: 600 });
    expect(a.distanceM).toBeCloseTo(2100);
    expect(a.elevationGainM).toBeCloseTo(10, 0);
  });

  it('reads a GPX run with extensions', async () => {
    const a = await parseActivityFile(utf8(gpxRun()));
    expect(a).toMatchObject({
      format: 'gpx',
      name: 'Morning Run',
      sport: 'run',
      startedAt: new Date('2026-10-01T07:00:00Z'),
      durationS: 600,
      elapsedS: 600,
      avgHeartRate: 150,
      avgCadence: 170,
    });
    expect(a.distanceM).toBeCloseTo(2100, -1);
    expect(a.elevationGainM).toBeCloseTo(10, 0);
  });

  it('reads gzipped files', async () => {
    const a = await parseActivityFile(new Uint8Array(gzipSync(fitRun())));
    expect(a.format).toBe('fit');
  });

  it('rejects other files', async () => {
    await expect(parseActivityFile(utf8('hello'))).rejects.toThrow(
      ActivityFileError,
    );
    await expect(parseActivityFile(utf8('<html></html>'))).rejects.toThrow(
      'Not a GPX file',
    );
    await expect(
      parseActivityFile(utf8('<gpx><trk><trkseg></trkseg></trk></gpx>')),
    ).rejects.toThrow('no timed track points');
  });
});
