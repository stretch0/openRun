import { bestEfforts, manualEfforts, splits } from './efforts.js';
import type { Stream } from './stream.js';

/** A stream sampled every second at the given speeds (m/s), one per second. */
function streamFromSpeeds(speeds: number[], extra: Partial<Stream> = {}) {
  const t = [0];
  const d: number[] = [0];
  for (const s of speeds) {
    t.push(t.length);
    d.push(d[d.length - 1] + s);
  }
  const empty = t.map(() => null);
  return {
    t,
    d,
    lat: empty,
    lng: empty,
    alt: empty,
    hr: empty,
    cad: empty,
    ...extra,
  } satisfies Stream;
}

describe('bestEfforts', () => {
  it('finds the fastest window, not the average', () => {
    // 2 km at 4 m/s, then 1 km at 5 m/s, then 2 km at 4 m/s.
    const speeds = [
      ...Array(500).fill(4),
      ...Array(200).fill(5),
      ...Array(500).fill(4),
    ];
    const efforts = bestEfforts(streamFromSpeeds(speeds), [1000, 5000]);
    expect(efforts).toEqual([
      { distanceM: 1000, durationS: 200 },
      { distanceM: 5000, durationS: 1200 },
    ]);
  });

  it('interpolates between samples', () => {
    // 3 m/s: 1000 m takes 333.3 s.
    const efforts = bestEfforts(streamFromSpeeds(Array(400).fill(3)), [1000]);
    expect(efforts[0].durationS).toBeCloseTo(1000 / 3, 6);
  });

  it('skips distances longer than the activity', () => {
    expect(bestEfforts(streamFromSpeeds(Array(100).fill(3)), [1000])).toEqual(
      [],
    );
  });

  it('does not count a pause against the effort', () => {
    const s = streamFromSpeeds(Array(500).fill(4));
    // A 10 minute auto-pause half way through. The 4 m covered across the
    // gap are left out of moving time, so the effort is 249 s, not 250 s.
    s.t = s.t.map((t) => (t > 250 ? t + 600 : t));
    expect(bestEfforts(s, [1000])[0].durationS).toBeCloseTo(249);
  });
});

describe('manualEfforts', () => {
  it('counts an activity at or just over a standard distance', () => {
    expect(manualEfforts(5050, 1212)).toEqual([
      { distanceM: 5000, durationS: 1200 },
    ]);
    expect(manualEfforts(5200, 1200)).toEqual([]);
    expect(manualEfforts(4990, 1200)).toEqual([]);
  });
});

describe('splits', () => {
  it('splits by distance with a final partial split', () => {
    const hr = Array(751).fill(150);
    const alt = Array.from({ length: 751 }, (_, i) => i / 10);
    const s = streamFromSpeeds(Array(750).fill(4), { hr, alt });
    const result = splits(s, 1000);
    expect(result.map((r) => [r.distanceM, r.durationS])).toEqual([
      [1000, 250],
      [1000, 250],
      [1000, 250],
    ]);
    expect(result[0]).toMatchObject({
      avgHeartRate: 150,
      elevationChangeM: 25,
    });

    const partial = splits(streamFromSpeeds(Array(300).fill(4)), 1000);
    expect(partial.map((r) => [r.distanceM, r.durationS])).toEqual([
      [1000, 250],
      [200, 50],
    ]);
  });
});
