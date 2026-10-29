import {
  insideCircle,
  offsetPoint,
  randomiseZone,
  trimStream,
} from './privacy.js';
import { type Stream, haversine } from './stream.js';

const home = { lat: 51.5, lng: -0.1, radiusM: 500 };

describe('privacy zones', () => {
  it('offsets points by distance and bearing', () => {
    const north = offsetPoint(51.5, -0.1, 1000, 0);
    expect(haversine(51.5, -0.1, north.lat, north.lng)).toBeCloseTo(1000, 3);
    expect(north.lng).toBeCloseTo(-0.1, 9);
  });

  it('randomises the edge but always covers the drawn circle', () => {
    let seed = 1;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 200; i++) {
      const zone = randomiseZone(home, random);
      const shift = haversine(home.lat, home.lng, zone.lat, zone.lng);
      expect(shift).toBeLessThanOrEqual(home.radiusM * 0.3 + 1e-6);
      // Every point of the drawn circle is inside the randomised one.
      expect(zone.radiusM).toBeGreaterThanOrEqual(home.radiusM + shift - 1e-6);
      expect(zone.radiusM).toBeLessThanOrEqual(home.radiusM * 1.5 + 1e-6);
    }
    // Different zones get different edges.
    const a = randomiseZone(home, random);
    const b = randomiseZone(home, random);
    expect(a.lat).not.toBe(b.lat);
  });

  it('removes positions inside zones and keeps everything else', () => {
    const points = [0, 300, 600, 900].map((d) => offsetPoint(51.5, -0.1, d, 0));
    const stream: Stream = {
      t: [0, 100, 200, 300],
      d: [0, 300, 600, 900],
      lat: [...points.map((p) => p.lat)],
      lng: [...points.map((p) => p.lng)],
      alt: [10, 11, 12, 13],
      hr: [140, 141, 142, 143],
      cad: [null, null, null, null],
    };
    const trimmed = trimStream(stream, [home]);
    expect(trimmed.lat.map((v) => v === null)).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect(trimmed.lng[2]).toBe(stream.lng[2]);
    expect(trimmed.d).toEqual(stream.d);
    expect(trimmed.hr).toEqual(stream.hr);
    expect(trimStream(stream, [])).toBe(stream);
    expect(insideCircle(points[3].lat, points[3].lng, home)).toBe(false);
  });
});

describe('randomiseZone bounds', () => {
  it('always covers the drawn circle and never reaches past 1.8 × its radius', () => {
    const drawn = { lat: 51.5, lng: -0.1, radiusM: 300 };
    for (const r of [0, 0.25, 0.5, 0.999]) {
      const zone = randomiseZone(drawn, () => r);
      const shift = haversine(drawn.lat, drawn.lng, zone.lat, zone.lng);
      expect(zone.radiusM).toBeGreaterThanOrEqual(drawn.radiusM + shift - 1e-6);
      expect(shift + zone.radiusM).toBeLessThanOrEqual(1.8 * drawn.radiusM);
    }
  });
});
