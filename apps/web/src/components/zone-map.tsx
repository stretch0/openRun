import { useEffect, useRef, useState } from 'react';
import type { Circle } from '@openrun/domain';
import {
  BRAND,
  type GeoJSONSource,
  MapLibreMap,
  NavigationControl,
  OSM_STYLE,
  circlesGeoJSON,
} from './maplibre';

/**
 * A map for placing a privacy zone: tap to set the centre. Existing zones
 * are drawn in grey and the new one in orange. Loaded lazily.
 */
export default function ZoneMap({
  centre,
  zones,
  draft,
  onPick,
  label = 'Map: tap to place the centre of the zone',
}: {
  /** Accessible name; describes what tapping places. */
  label?: string;
  /** Where to start: the user's latest run, an existing zone, or their location. */
  centre: { lat: number; lng: number } | null;
  zones: Circle[];
  draft: Circle | null;
  onPick: (point: { lat: number; lng: number }) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [loaded, setLoaded] = useState(false);
  const pick = useRef(onPick);
  pick.current = onPick;

  useEffect(() => {
    if (!container.current) return;
    const m = new MapLibreMap({
      container: container.current,
      style: OSM_STYLE,
      center: centre ? [centre.lng, centre.lat] : [0, 30],
      zoom: centre ? 13 : 1,
      attributionControl: { compact: true },
    });
    m.addControl(new NavigationControl({ showCompass: false }));
    m.on('load', () => {
      for (const id of ['zones', 'draft']) {
        m.addSource(id, { type: 'geojson', data: circlesGeoJSON([]) });
        m.addLayer({
          id: `${id}-fill`,
          type: 'fill',
          source: id,
          paint: {
            'fill-color': id === 'draft' ? BRAND : '#78716c',
            'fill-opacity': 0.2,
          },
        });
        m.addLayer({
          id: `${id}-line`,
          type: 'line',
          source: id,
          paint: {
            'line-color': id === 'draft' ? BRAND : '#78716c',
            'line-width': 2,
          },
        });
      }
      setLoaded(true);
    });
    m.on('click', (e) =>
      pick.current({ lat: e.lngLat.lat, lng: e.lngLat.lng }),
    );
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
    // The map is created once; later centre changes pan it instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !loaded) return;
    (m.getSource('zones') as GeoJSONSource | undefined)?.setData(
      circlesGeoJSON(zones),
    );
    (m.getSource('draft') as GeoJSONSource | undefined)?.setData(
      circlesGeoJSON(draft ? [draft] : []),
    );
  }, [zones, draft, loaded]);

  useEffect(() => {
    if (centre)
      map.current?.flyTo({ center: [centre.lng, centre.lat], zoom: 13 });
  }, [centre]);

  return (
    <div
      ref={container}
      className="h-64 overflow-hidden rounded-xl border border-stone-200 dark:border-stone-800"
      role="application"
      aria-label={label}
    />
  );
}
