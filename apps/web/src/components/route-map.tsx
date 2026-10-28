import { useEffect, useMemo, useRef } from 'react';
import type { ActivityStream } from '@openrun/schemas';
import {
  BRAND,
  type GeoJSONSource,
  LngLatBounds,
  MapLibreMap,
  NavigationControl,
  OSM_STYLE,
} from './maplibre';

/**
 * The route on an OSM map, with a dot at the sample `hover` (shared with the
 * charts). Loaded lazily: MapLibre is large.
 */
export default function RouteMap({
  stream,
  hover,
}: {
  stream: ActivityStream;
  hover: number | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);

  // Separate lines wherever positions are missing (GPS gaps, or privacy
  // zones in a shared view), so the map never joins across a hidden part.
  const segments = useMemo(() => {
    const out: [number, number][][] = [];
    let current: [number, number][] = [];
    stream.lat.forEach((lat, i) => {
      const lng = stream.lng[i];
      if (lat != null && lng != null) {
        current.push([lng, lat]);
      } else if (current.length) {
        out.push(current);
        current = [];
      }
    });
    if (current.length) out.push(current);
    return out;
  }, [stream]);
  const coords = useMemo(() => segments.flat(), [segments]);

  useEffect(() => {
    if (!container.current || coords.length < 2) return;
    const bounds = coords.reduce(
      (b, c) => b.extend(c),
      new LngLatBounds(coords[0], coords[0]),
    );
    const m = new MapLibreMap({
      container: container.current,
      style: OSM_STYLE,
      bounds,
      fitBoundsOptions: { padding: 32 },
      attributionControl: { compact: true },
      cooperativeGestures: true,
    });
    m.addControl(new NavigationControl({ showCompass: false }));
    m.on('load', () => {
      m.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'MultiLineString', coordinates: segments },
        },
      });
      m.addLayer({
        id: 'route-casing',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 6 },
      });
      m.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': BRAND, 'line-width': 3 },
      });
      m.addSource('hover', { type: 'geojson', data: emptyPoint() });
      m.addLayer({
        id: 'hover',
        type: 'circle',
        source: 'hover',
        paint: {
          'circle-radius': 6,
          'circle-color': BRAND,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, [coords, segments]);

  useEffect(() => {
    const source = map.current?.getSource('hover') as GeoJSONSource | undefined;
    if (!source) return;
    const lat = hover !== null ? stream.lat[hover] : null;
    const lng = hover !== null ? stream.lng[hover] : null;
    source.setData(
      lat != null && lng != null
        ? {
            type: 'Feature',
            properties: {},
            geometry: { type: 'Point', coordinates: [lng, lat] },
          }
        : emptyPoint(),
    );
  }, [hover, stream]);

  if (coords.length < 2) return null;
  return (
    <div
      ref={container}
      className="h-72 overflow-hidden rounded-2xl border border-stone-200 dark:border-stone-800"
      role="img"
      aria-label="Map of the route"
    />
  );
}

function emptyPoint(): Parameters<GeoJSONSource['setData']>[0] {
  return { type: 'FeatureCollection', features: [] };
}
