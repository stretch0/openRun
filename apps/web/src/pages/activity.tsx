import { type FormEvent, Suspense, lazy, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  type Units,
  formatDistance,
  formatDuration,
  formatPace,
} from '@openrun/domain';
import {
  type Activity,
  type Me,
  type Sport,
  sportSchema,
  type Visibility,
  visibilitySchema,
} from '@openrun/schemas';
import { FormError } from '../components/auth-card';
import { ShoeSelect } from '../components/shoe-settings';
import { StreamCharts } from '../components/stream-charts';
import {
  useActivity,
  useActivityStream,
  useDeleteActivity,
  useUpdateActivity,
  useShareRun,
  useShareTargets,
} from '../lib/activities';
import { ApiError } from '../lib/api';
import { SPORT_LABELS, formatDateTime, ordinal, pbLabel } from '../lib/format';
import { useMe } from '../lib/queries';
import { VISIBILITY_LABELS } from '../lib/privacy';
import { useShoes } from '../lib/stats';

const RouteMap = lazy(() => import('../components/route-map'));

export function ActivityPage() {
  const { id = '' } = useParams();
  const { data: me } = useMe();
  const activity = useActivity(id);
  const [view, setView] = useState<'owner' | 'shared'>('owner');
  const stream = useActivityStream(id, activity.data?.hasStream ?? false, view);
  const [hover, setHover] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);

  if (activity.error instanceof ApiError && activity.error.status === 404) {
    return (
      <section className="card text-center">
        <p className="font-medium">Run not found</p>
        <Link to="/" className="btn-secondary mt-3">
          Back to runs
        </Link>
      </section>
    );
  }
  const a = activity.data;
  if (!a || !me) return null;

  return (
    <>
      <div>
        <Link to="/" className="text-sm text-brand-600">
          ← Runs
        </Link>
        {editing ? (
          <EditActivity activity={a} onDone={() => setEditing(false)} />
        ) : (
          <div className="mt-1 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold">{a.name}</h1>
              <p className="text-sm text-stone-500">
                {formatDateTime(a.startedAt, me.timezone)} ·{' '}
                {SPORT_LABELS[a.sport]}
                {a.device && <> · {a.device}</>}
              </p>
              <VisibilityPicker activity={a} />
            </div>
            <button
              className="btn-secondary shrink-0"
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
          </div>
        )}
      </div>

      <Stats activity={a} units={me.units} />

      {a.notes && !editing && (
        <section className="card whitespace-pre-wrap text-sm">
          {a.notes}
        </section>
      )}

      <BestEfforts activity={a} />

      {a.hasStream && <ViewToggle view={view} onChange={setView} />}
      {view === 'shared' && stream.data?.lat.every((v) => v == null) && (
        <section className="card text-sm text-stone-500">
          Clubs see no map for this run. Turn on{' '}
          <Link to="/settings" className="text-brand-600">
            Include the map when sharing
          </Link>{' '}
          in Settings → Privacy to show the route with your privacy zones cut
          out.
        </section>
      )}
      {stream.data && (
        <>
          <Suspense
            fallback={
              <div className="h-72 rounded-2xl bg-stone-100 dark:bg-stone-900" />
            }
          >
            <RouteMap stream={stream.data} hover={hover} />
          </Suspense>
          <StreamCharts
            stream={stream.data}
            units={me.units}
            hover={hover}
            onHover={setHover}
          />
        </>
      )}

      <ShareWithClubs activity={a} />

      <Splits activity={a} me={me} />
      <Laps activity={a} units={me.units} />
      <Actions activity={a} />
    </>
  );
}

function Stats({ activity: a, units }: { activity: Activity; units: Units }) {
  const { data: shoes } = useShoes();
  const shoe = shoes?.find((s) => s.id === a.shoeId);
  const stats: [string, string | null][] = [
    ['Distance', formatDistance(a.distanceM, units)],
    ['Moving time', formatDuration(a.durationS)],
    ['Pace', formatPace(a.distanceM, a.durationS, units)],
    [
      'Elapsed time',
      a.elapsedS && a.elapsedS !== a.durationS
        ? formatDuration(a.elapsedS)
        : null,
    ],
    [
      'Elevation gain',
      a.elevationGainM != null ? `${Math.round(a.elevationGainM)} m` : null,
    ],
    ['Avg heart rate', a.avgHeartRate ? `${a.avgHeartRate} bpm` : null],
    ['Max heart rate', a.maxHeartRate ? `${a.maxHeartRate} bpm` : null],
    ['Cadence', a.avgCadence ? `${a.avgCadence} spm` : null],
    ['Effort', a.rpe ? `${a.rpe}/10` : null],
    ['Shoes', shoe?.name ?? null],
  ];
  return (
    <section className="card">
      <dl className="grid grid-cols-3 gap-x-4 gap-y-3">
        {stats
          .filter((s): s is [string, string] => s[1] !== null)
          .map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-stone-500">{label}</dt>
              <dd className="text-lg font-semibold">{value}</dd>
            </div>
          ))}
      </dl>
    </section>
  );
}

function BestEfforts({ activity }: { activity: Activity }) {
  if (!activity.bestEfforts.length) return null;
  return (
    <section className="card">
      <h2 className="font-semibold">Best efforts</h2>
      <ul className="mt-2 divide-y divide-stone-200 text-sm dark:divide-stone-800">
        {activity.bestEfforts.map((e) => (
          <li key={e.distanceM} className="flex items-center gap-3 py-2">
            <span className="flex-1">{pbLabel(e.distanceM)}</span>
            {e.rank === 1 ? (
              <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">
                PB
              </span>
            ) : e.rank <= 3 ? (
              <span className="text-xs text-stone-500">
                {ordinal(e.rank)} fastest
              </span>
            ) : null}
            <span className="w-20 text-right font-semibold tabular-nums">
              {formatDuration(e.durationS)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Splits({ activity, me }: { activity: Activity; me: Me }) {
  if (activity.splits.length < 2) return null;
  const unit = me.units === 'metric' ? 'km' : 'mi';
  const splitM = me.units === 'metric' ? 1000 : 1609.344;
  return (
    <section className="card overflow-x-auto">
      <h2 className="font-semibold">Splits</h2>
      <table className="mt-2 w-full text-right text-sm tabular-nums">
        <thead className="text-xs text-stone-500">
          <tr>
            <th className="py-1 text-left font-normal">{unit}</th>
            <th className="py-1 font-normal">Pace</th>
            <th className="py-1 font-normal">Elev</th>
            <th className="py-1 font-normal">HR</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
          {activity.splits.map((s) => (
            <tr key={s.index}>
              <td className="py-1.5 text-left">
                {s.index}
                {s.distanceM < splitM - 1 && (
                  <span className="text-stone-500">
                    {' '}
                    ({formatDistance(s.distanceM, me.units)})
                  </span>
                )}
              </td>
              <td className="py-1.5 font-medium">
                {formatPace(s.distanceM, s.durationS, me.units)}
              </td>
              <td className="py-1.5">
                {s.elevationChangeM != null
                  ? `${s.elevationChangeM > 0 ? '+' : ''}${Math.round(s.elevationChangeM)} m`
                  : '–'}
              </td>
              <td className="py-1.5">{s.avgHeartRate ?? '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Laps({ activity, units }: { activity: Activity; units: Units }) {
  if (activity.laps.length < 2) return null;
  return (
    <section className="card overflow-x-auto">
      <h2 className="font-semibold">Laps</h2>
      <table className="mt-2 w-full text-right text-sm tabular-nums">
        <thead className="text-xs text-stone-500">
          <tr>
            <th className="py-1 text-left font-normal">Lap</th>
            <th className="py-1 font-normal">Distance</th>
            <th className="py-1 font-normal">Time</th>
            <th className="py-1 font-normal">Pace</th>
            <th className="py-1 font-normal">HR</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
          {activity.laps.map((l) => (
            <tr key={l.index}>
              <td className="py-1.5 text-left">{l.index + 1}</td>
              <td className="py-1.5">{formatDistance(l.distanceM, units)}</td>
              <td className="py-1.5">{formatDuration(l.durationS)}</td>
              <td className="py-1.5 font-medium">
                {formatPace(l.distanceM, l.durationS, units)}
              </td>
              <td className="py-1.5">{l.avgHeartRate ?? '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function EditActivity({
  activity,
  onDone,
}: {
  activity: Activity;
  onDone: () => void;
}) {
  const update = useUpdateActivity(activity.id);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const rpe = String(form.get('rpe') ?? '');
    update.mutate(
      {
        name: String(form.get('name')),
        sport: form.get('sport') as Sport,
        rpe: rpe ? Number(rpe) : null,
        notes: String(form.get('notes') ?? '') || null,
        // Only when the shoe picker was shown, so a slow load can't clear it.
        ...(form.has('shoeId')
          ? { shoeId: String(form.get('shoeId')) || null }
          : {}),
      },
      { onSuccess: onDone },
    );
  };
  return (
    <form onSubmit={onSubmit} className="card mt-2 space-y-3">
      <div>
        <label className="label" htmlFor="name">
          Name
        </label>
        <input
          className="input"
          id="name"
          name="name"
          defaultValue={activity.name}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="sport">
            Type
          </label>
          <select
            className="input"
            id="sport"
            name="sport"
            defaultValue={activity.sport}
          >
            {sportSchema.options.map((s) => (
              <option key={s} value={s}>
                {SPORT_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="rpe">
            Effort (1–10)
          </label>
          <input
            className="input"
            id="rpe"
            name="rpe"
            type="number"
            min="1"
            max="10"
            defaultValue={activity.rpe ?? ''}
          />
        </div>
      </div>
      <ShoeSelect value={activity.shoeId} />
      <div>
        <label className="label" htmlFor="notes">
          Notes
        </label>
        <textarea
          className="input"
          id="notes"
          name="notes"
          rows={3}
          defaultValue={activity.notes ?? ''}
        />
      </div>
      <FormError message={update.error?.message} />
      <div className="flex gap-2">
        <button className="btn-primary" disabled={update.isPending}>
          Save
        </button>
        <button type="button" className="btn-secondary" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function Actions({ activity }: { activity: Activity }) {
  const remove = useDeleteActivity();
  const navigate = useNavigate();
  const onDelete = () => {
    if (!window.confirm(`Delete “${activity.name}”? This can't be undone.`)) {
      return;
    }
    remove.mutate(activity.id, {
      onSuccess: () => navigate('/', { replace: true }),
    });
  };
  return (
    <section className="flex flex-wrap gap-2">
      {activity.hasFile && (
        <a
          className="btn-secondary"
          href={`/api/activities/${activity.id}/file`}
          download
        >
          Download original file
        </a>
      )}
      <button
        className="btn-secondary text-red-600"
        onClick={onDelete}
        disabled={remove.isPending}
      >
        Delete
      </button>
      <FormError message={remove.error?.message} />
    </section>
  );
}

function VisibilityPicker({ activity }: { activity: Activity }) {
  const update = useUpdateActivity(activity.id);
  return (
    <label className="mt-1 inline-flex items-center gap-1.5 text-sm text-stone-500">
      <span aria-hidden>{activity.visibility === 'private' ? '🔒' : '👥'}</span>
      <span className="sr-only">Who can see this run</span>
      <select
        className="rounded-md bg-transparent py-0.5 font-medium text-stone-700 outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:text-stone-300"
        value={activity.visibility}
        disabled={update.isPending}
        onChange={(e) => {
          const visibility = e.target.value as Visibility;
          if (
            visibility === 'private' &&
            !window.confirm(
              'Make this run private? It will be taken back from any clubs it’s shared with.',
            )
          ) {
            return;
          }
          update.mutate({ visibility });
        }}
      >
        {visibilitySchema.options.map((v) => (
          <option key={v} value={v}>
            {VISIBILITY_LABELS[v]}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Send a copy of this run to clubs, as the sharing level for each allows. */
function ShareWithClubs({ activity }: { activity: Activity }) {
  const { data: targets } = useShareTargets(activity.id);
  const share = useShareRun(activity.id);
  if (!targets?.length) return null;
  return (
    <section className="card space-y-2" aria-label="Share with clubs">
      <h2 className="font-semibold">Share with clubs</h2>
      <p className="text-sm text-stone-500">
        Clubs get a copy: changing or deleting this run later doesn't change it,
        and you can take it back.
      </p>
      <ul className="divide-y divide-stone-200 text-sm dark:divide-stone-800">
        {targets.map((t) => (
          <li key={t.clubId} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t.clubName}</p>
              <p className="text-stone-500">
                {t.shareLevel === 'attendance' ? (
                  <>
                    You share attendance only.{' '}
                    <Link to={`/clubs/${t.clubId}`} className="text-brand-600">
                      Change
                    </Link>
                  </>
                ) : t.withMap ? (
                  'Distance, time, pace and the route (privacy zones cut out)'
                ) : (
                  'Distance, time and pace'
                )}
              </p>
            </div>
            {t.shareLevel !== 'attendance' && (
              <button
                className={t.shared ? 'btn-secondary' : 'btn-primary'}
                disabled={share.isPending}
                onClick={() =>
                  share.mutate({ clubId: t.clubId, share: !t.shared })
                }
              >
                {t.shared ? 'Take back' : 'Share'}
              </button>
            )}
          </li>
        ))}
      </ul>
      <FormError message={share.error?.message} />
    </section>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: 'owner' | 'shared';
  onChange: (view: 'owner' | 'shared') => void;
}) {
  return (
    <div
      className="flex w-fit rounded-lg bg-stone-100 p-0.5 text-sm dark:bg-stone-800"
      role="group"
      aria-label="Map view"
    >
      {(['owner', 'shared'] as const).map((v) => (
        <button
          key={v}
          className={`rounded-md px-3 py-1 ${
            view === v
              ? 'bg-white font-medium shadow-sm dark:bg-stone-700'
              : 'text-stone-500'
          }`}
          aria-pressed={view === v}
          onClick={() => onChange(v)}
        >
          {v === 'owner' ? 'Your view' : 'What clubs see'}
        </button>
      ))}
    </div>
  );
}
