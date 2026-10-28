import { Suspense, lazy, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ZONE_RADIUS } from '@openrun/domain';
import {
  type PrivacySettings as Settings,
  type UpdatePrivacySettings,
  type Visibility,
  visibilitySchema,
} from '@openrun/schemas';
import { useActivityList, useActivityStream } from '../lib/activities';
import {
  VISIBILITY_LABELS,
  useCreatePrivacyZone,
  useDeletePrivacyZone,
  usePrivacySettings,
  usePrivacyZones,
  useSetAllVisibility,
  useUpdatePrivacySettings,
} from '../lib/privacy';
import { FormError } from './auth-card';

const ZoneMap = lazy(() => import('./zone-map'));

export function PrivacySettings() {
  const { data: saved } = usePrivacySettings();
  const update = useUpdatePrivacySettings();
  // The form keeps its own state so it responds instantly, whatever order
  // the saves finish in.
  const [edited, setEdited] = useState<Settings | null>(null);
  const settings = edited ?? saved;
  const change = (patch: UpdatePrivacySettings) => {
    if (!settings) return;
    setEdited({ ...settings, ...patch });
    update.mutate(patch);
  };
  const setAll = useSetAllVisibility();

  const changeAll = (visibility: Visibility) => {
    const what =
      visibility === 'private'
        ? 'Make every run you have visible only to you?'
        : 'Share every run you have with your clubs?';
    if (window.confirm(what)) setAll.mutate(visibility);
  };

  if (!settings) return null;

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="font-semibold">Privacy</h2>
        <p className="mt-1 text-sm text-stone-500">
          Your runs are yours. Nobody else on this instance can see them unless
          you share them.{' '}
          <Link to="/privacy" className="text-brand-600">
            Who can see what
          </Link>
        </p>
      </div>

      <div>
        <label className="label" htmlFor="defaultVisibility">
          Who can see new runs
        </label>
        <select
          className="input"
          id="defaultVisibility"
          value={settings.defaultVisibility}
          onChange={(e) =>
            change({ defaultVisibility: e.target.value as Visibility })
          }
        >
          {visibilitySchema.options.map((v) => (
            <option key={v} value={v}>
              {VISIBILITY_LABELS[v]}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-stone-500">
          Clubs arrive in a later update; until then, shared runs aren't shown
          to anyone.
        </p>
      </div>

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-brand-600"
          checked={settings.shareMap}
          onChange={(e) => change({ shareMap: e.target.checked })}
        />
        <span>
          <span className="block font-medium">
            Include the map when sharing
          </span>
          <span className="block text-sm text-stone-500">
            Off: others see distance, time and pace only. On: they also see the
            route, with your privacy zones cut out.
          </span>
        </span>
      </label>
      <FormError message={update.error?.message} />

      <PrivacyZones />

      <div className="space-y-2">
        <p className="text-sm font-medium">Change all my runs</p>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-secondary"
            onClick={() => changeAll('private')}
            disabled={setAll.isPending}
          >
            Make all private
          </button>
          <button
            className="btn-secondary"
            onClick={() => changeAll('clubs')}
            disabled={setAll.isPending}
          >
            Share all with my clubs
          </button>
        </div>
        {setAll.data && (
          <p className="text-sm text-stone-500">
            Updated {setAll.data.updated} runs.
          </p>
        )}
      </div>
    </section>
  );
}

function PrivacyZones() {
  const { data: zones } = usePrivacyZones();
  const create = useCreatePrivacyZone();
  const remove = useDeletePrivacyZone();
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Privacy zones</p>
      <p className="text-sm text-stone-500">
        Hide the part of any shared route near places like home or work. The
        edge of each zone is shifted a little at random, so it can't be worked
        out from your routes.
      </p>
      {zones?.length ? (
        <ul className="divide-y divide-stone-200 text-sm dark:divide-stone-800">
          {zones.map((z) => (
            <li key={z.id} className="flex items-center gap-3 py-2">
              <span className="flex-1">
                {z.name} <span className="text-stone-500">· {z.radiusM} m</span>
              </span>
              <button
                className="text-red-600"
                onClick={() => remove.mutate(z.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {adding ? (
        <AddZone
          existing={zones ?? []}
          pending={create.isPending}
          error={create.error?.message}
          onCancel={() => setAdding(false)}
          onSave={(zone) =>
            create.mutate(zone, { onSuccess: () => setAdding(false) })
          }
        />
      ) : (
        <button
          className="btn-secondary w-full"
          onClick={() => setAdding(true)}
        >
          Add a privacy zone
        </button>
      )}
    </div>
  );
}

type Point = { lat: number; lng: number };

function AddZone({
  existing,
  pending,
  error,
  onCancel,
  onSave,
}: {
  existing: { lat: number; lng: number; radiusM: number }[];
  pending: boolean;
  error?: string;
  onCancel: () => void;
  onSave: (zone: Point & { name: string; radiusM: number }) => void;
}) {
  const [name, setName] = useState(existing.length ? 'Work' : 'Home');
  const [radiusM, setRadiusM] = useState<number>(ZONE_RADIUS.default);
  const [point, setPoint] = useState<Point | null>(null);
  const [located, setLocated] = useState<Point | null>(null);
  const [locating, setLocating] = useState(false);

  // Start the map where the user's latest run began.
  const latest = useActivityList().data?.pages[0]?.items[0];
  const stream = useActivityStream(latest?.id ?? '', Boolean(latest));
  const start = useMemo(() => {
    const s = stream.data;
    const i = s?.lat.findIndex((v) => v != null) ?? -1;
    const lat = i >= 0 ? s?.lat[i] : null;
    const lng = i >= 0 ? s?.lng[i] : null;
    return lat != null && lng != null ? { lat, lng } : null;
  }, [stream.data]);
  const centre = located ?? start ?? existing[0] ?? null;

  const locateMe = () => {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLocated(p);
        setPoint(p);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  return (
    <div className="space-y-3 rounded-xl border border-stone-200 p-3 dark:border-stone-800">
      <Suspense
        fallback={
          <div className="h-64 rounded-xl bg-stone-100 dark:bg-stone-800" />
        }
      >
        <ZoneMap
          centre={centre}
          zones={existing}
          draft={point ? { ...point, radiusM } : null}
          onPick={setPoint}
        />
      </Suspense>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-stone-500">
          {point ? 'Tap the map to move it.' : 'Tap the map to place the zone.'}
        </span>
        {'geolocation' in navigator && (
          <button
            type="button"
            className="font-medium text-brand-600"
            onClick={locateMe}
            disabled={locating}
          >
            {locating ? 'Finding you…' : 'Use my location'}
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="zoneName">
            Name
          </label>
          <input
            className="input"
            id="zoneName"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="zoneRadius">
            Size: {radiusM} m
          </label>
          <input
            id="zoneRadius"
            type="range"
            className="mt-3 w-full accent-brand-600"
            min={ZONE_RADIUS.min}
            max={ZONE_RADIUS.max}
            step={50}
            value={radiusM}
            onChange={(e) => setRadiusM(Number(e.target.value))}
          />
        </div>
      </div>
      <FormError message={error} />
      <div className="flex gap-2">
        <button
          className="btn-primary"
          disabled={!point || !name.trim() || pending}
          onClick={() =>
            point && onSave({ ...point, name: name.trim(), radiusM })
          }
        >
          Save zone
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
