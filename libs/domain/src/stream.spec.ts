import {
  distanceFromPositions,
  downsample,
  elevationGain,
  haversine,
  movingTimes,
  smoothedSpeed,
} from './stream.js';

describe('stream', () => {
  it('measures distance between coordinates', () => {
    // One degree of latitude is about 111.2 km.
    expect(haversine(51, 0, 52, 0)).toBeCloseTo(111_195, -1);
    expect(distanceFromPositions([51, null, 51.001], [0, null, 0])).toEqual([
      0,
      0,
      expect.closeTo(111.2, 1),
    ]);
  });

  it('leaves out stopped time and pauses', () => {
    const t = [0, 1, 2, 3, 4, 64];
    const d = [0, 3, 6, 6, 6, 9];
    // Standing still from 2 to 4 s; 60 s gap is a pause with little movement.
    expect(movingTimes({ t, d })).toEqual([0, 1, 2, 2, 2, 2]);
    // Without distance, only long gaps are left out.
    expect(movingTimes({ t, d: t.map(() => null) })).toEqual([
      0, 1, 2, 3, 4, 4,
    ]);
  });

  it('ignores small altitude noise', () => {
    expect(elevationGain([10, 11, 10, 11, 10])).toBe(0);
    expect(elevationGain([10, 15, 12, 20, null, 18])).toBe(13);
    expect(elevationGain([null, null])).toBeNull();
  });

  it('downsamples, keeping the first and last samples', () => {
    const n = 1001;
    const t = Array.from({ length: n }, (_, i) => i);
    const nulls = t.map(() => null);
    const s = downsample(
      { t, d: t, lat: nulls, lng: nulls, alt: nulls, hr: nulls, cad: nulls },
      11,
    );
    expect(s.t).toEqual([0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]);
    expect(s.hr).toHaveLength(11);
  });

  it('smooths speed over a window and blanks out stops', () => {
    const t = [0, 10, 20, 30, 40, 50, 60];
    const d = [0, 40, 80, 120, 120, 120, 120];
    const speed = smoothedSpeed({ t, d }, 20);
    expect(speed.slice(0, 3)).toEqual([4, 4, 4]);
    expect(speed[3]).toBe(2);
    expect(speed.slice(4)).toEqual([null, null, null]);
  });
});
