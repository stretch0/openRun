import 'maplibre-gl/dist/maplibre-gl.css';
import {
  type GeoJSONSource,
  LngLatBounds,
  MapLibreMap,
  NavigationControl,
  type StyleSpecification,
  setWorkerUrl,
} from 'maplibre-gl';
// MapLibre looks for its worker next to its own module, which doesn't exist
// once bundled; point it at the file Vite emits instead.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { useEffect, useMemo, useRef } from 'react';
import type { ActivityStream } from '@openrun/schemas';

setWorkerUrl(workerUrl);

const BRAND = '#ea580c';

/** OpenStreetMap raster tiles; no API key needed. */
const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

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

  const coords = useMemo(
    () =>
      stream.lat.flatMap((lat, i) => {
        const lng = stream.lng[i];
        return lat != null && lng != null
          ? [[lng, lat] as [number, number]]
          : [];
      }),
    [stream],
  );

  useEffect(() => {
    if (!container.current || coords.length < 2) return;
    const bounds = coords.reduce(
      (b, c) => b.extend(c),
      new LngLatBounds(coords[0], coords[0]),
    );
    const m = new MapLibreMap({
      container: container.current,
      style: STYLE,
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
          geometry: { type: 'LineString', coordinates: coords },
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
  }, [coords]);

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
