import { Suspense, lazy, useMemo, useState } from 'react';
import { formatDistance, formatDuration, formatPace } from '@openrun/domain';
import type { ActivityStream, ClubShare } from '@openrun/schemas';
import { useMe } from '../lib/queries';

const RouteMap = lazy(() => import('./route-map'));

/** A shared track as the stream RouteMap draws: positions only. */
function trackStream(track: NonNullable<ClubShare['track']>): ActivityStream {
  const none = track.map(() => null);
  return {
    t: track.map((_, i) => i),
    d: none,
    lat: track.map((p) => p?.[0] ?? null),
    lng: track.map((p) => p?.[1] ?? null),
    alt: none,
    hr: none,
    cad: none,
  };
}

function SharedRoute({ track }: { track: NonNullable<ClubShare['track']> }) {
  // A new stream object would rebuild the map, so make it once per track.
  const stream = useMemo(() => trackStream(track), [track]);
  return <RouteMap stream={stream} hover={null} />;
}

/** Runs members chose to share with the club. Numbers, never a ranking. */
export function SharedRuns({
  shares,
  title = 'Shared runs',
}: {
  shares: ClubShare[];
  title?: string;
}) {
  const { data: me } = useMe();
  const [open, setOpen] = useState<string | null>(null);
  const units = me?.units ?? 'metric';
  if (!shares.length) return null;
  return (
    <section className="card space-y-2" aria-label={title}>
      <h2 className="font-semibold">{title}</h2>
      <ul className="divide-y divide-stone-200 text-sm dark:divide-stone-800">
        {shares.map((s) => (
          <li key={s.id} className="space-y-2 py-2">
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0">
                <span className="font-medium">{s.memberName}</span>
                <span className="text-stone-500"> · {s.title}</span>
              </p>
              {s.track && (
                <button
                  className="shrink-0 font-medium text-brand-600"
                  onClick={() => setOpen(open === s.id ? null : s.id)}
                >
                  {open === s.id ? 'Hide route' : 'Route'}
                </button>
              )}
            </div>
            <p className="tabular-nums text-stone-600 dark:text-stone-300">
              {formatDistance(s.distanceM, units)} ·{' '}
              {formatDuration(s.durationS)} ·{' '}
              {formatPace(s.distanceM, s.durationS, units)}
              {s.device && (
                <span className="text-xs text-stone-500"> · {s.device}</span>
              )}
            </p>
            {open === s.id && s.track && (
              <Suspense
                fallback={
                  <div className="h-72 rounded-2xl bg-stone-100 dark:bg-stone-900" />
                }
              >
                <SharedRoute track={s.track} />
              </Suspense>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
