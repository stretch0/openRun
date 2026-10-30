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
import { type Circle, offsetPoint } from '@openrun/domain';

setWorkerUrl(workerUrl);

export { type GeoJSONSource, LngLatBounds, MapLibreMap, NavigationControl };

export const BRAND = '#0d9488';

/** OpenStreetMap raster tiles; no API key needed. */
export const OSM_STYLE: StyleSpecification = {
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

export type GeoJSONData = Parameters<GeoJSONSource['setData']>[0];

/** Circles as GeoJSON polygons, for drawing privacy zones. */
export function circlesGeoJSON(circles: Circle[]): GeoJSONData {
  return {
    type: 'FeatureCollection',
    features: circles.map((c) => ({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          Array.from({ length: 65 }, (_, i) => {
            const p = offsetPoint(
              c.lat,
              c.lng,
              c.radiusM,
              (i / 64) * 2 * Math.PI,
            );
            return [p.lng, p.lat];
          }),
        ],
      },
    })),
  };
}
