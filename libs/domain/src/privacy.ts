import { type Stream, haversine } from './stream.js';

export type Circle = { lat: number; lng: number; radiusM: number };

export const ZONE_RADIUS = { min: 200, default: 500, max: 1000 } as const;

const EARTH_RADIUS_M = 6_371_008.8;

/** The point `distanceM` away from (lat, lng) on `bearing` radians from north. */
export function offsetPoint(
  lat: number,
  lng: number,
  distanceM: number,
  bearing: number,
): { lat: number; lng: number } {
  const rad = Math.PI / 180;
  const d = distanceM / EARTH_RADIUS_M;
  const lat1 = lat * rad;
  const lng1 = lng * rad;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) +
      Math.cos(lat1) * Math.sin(d) * Math.cos(bearing),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { lat: lat2 / rad, lng: lng2 / rad };
}

/**
 * The circle actually used to trim shared tracks. Its centre is shifted up
 * to 30% of the radius in a random direction, and it's grown so it still
 * covers the whole circle the user drew, plus up to another 20%. Overlaying
 * many trimmed tracks then reveals this circle, not the user's real centre.
 * Call once when a zone is created and store the result.
 */
export function randomiseZone(
  zone: Circle,
  random: () => number = Math.random,
): Circle {
  const shift = zone.radiusM * 0.3 * random();
  const centre = offsetPoint(zone.lat, zone.lng, shift, random() * 2 * Math.PI);
  return {
    ...centre,
    radiusM: zone.radiusM + shift + zone.radiusM * 0.2 * random(),
  };
}

export function insideCircle(lat: number, lng: number, c: Circle): boolean {
  return haversine(lat, lng, c.lat, c.lng) <= c.radiusM;
}

/**
 * The stream as others may see it: positions inside any zone are removed.
 * Times, distances and heart rate stay, so charts and splits still work.
 */
export function trimStream(stream: Stream, zones: Circle[]): Stream {
  if (!zones.length) return stream;
  const hidden = stream.lat.map((lat, i) => {
    const lng = stream.lng[i];
    return (
      lat != null && lng != null && zones.some((z) => insideCircle(lat, lng, z))
    );
  });
  return {
    ...stream,
    lat: stream.lat.map((v, i) => (hidden[i] ? null : v)),
    lng: stream.lng.map((v, i) => (hidden[i] ? null : v)),
  };
}
