import { Link } from 'react-router-dom';
import { formatDistance, formatDuration, formatPace } from '@openrun/domain';
import type { ActivitySummary, Me } from '@openrun/schemas';
import { useActivityList, usePersonalBests } from '../lib/activities';
import { SPORT_LABELS, formatDate, pbLabel } from '../lib/format';
import { useMe } from '../lib/queries';

export function HomePage() {
  const { data: me } = useMe();
  const list = useActivityList();
  const activities = list.data?.pages.flatMap((p) => p.items) ?? [];

  if (!me) return null;

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">
          Hi {me.name.split(' ')[0]} 👋
        </h1>
        <Link to="/activities/new" className="btn-primary">
          Add run
        </Link>
      </div>

      <PersonalBests me={me} />

      {list.isPending ? null : activities.length === 0 ? (
        <section className="card text-center">
          <p className="font-medium">No runs yet</p>
          <p className="mt-1 text-sm text-stone-500">
            Import FIT or GPX files from your watch, or add a run by hand.
          </p>
          <Link to="/activities/new" className="btn-secondary mt-3">
            Add your first run
          </Link>
        </section>
      ) : (
        <section className="space-y-2" aria-label="Runs">
          {activities.map((a) => (
            <ActivityRow key={a.id} activity={a} me={me} />
          ))}
          {list.hasNextPage && (
            <button
              className="btn-secondary w-full"
              onClick={() => list.fetchNextPage()}
              disabled={list.isFetchingNextPage}
            >
              {list.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </button>
          )}
        </section>
      )}
    </>
  );
}

function ActivityRow({
  activity: a,
  me,
}: {
  activity: ActivitySummary;
  me: Me;
}) {
  return (
    <Link
      to={`/activities/${a.id}`}
      className="card block transition hover:border-brand-500"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate font-medium">
          {a.name}
          {a.sport !== 'run' && (
            <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-normal text-stone-600 dark:bg-stone-800 dark:text-stone-300">
              {SPORT_LABELS[a.sport]}
            </span>
          )}
        </p>
        <p className="shrink-0 text-sm text-stone-500">
          {formatDate(a.startedAt, me.timezone)}
        </p>
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
        <Stat label="Distance" value={formatDistance(a.distanceM, me.units)} />
        <Stat label="Time" value={formatDuration(a.durationS)} />
        <Stat
          label="Pace"
          value={formatPace(a.distanceM, a.durationS, me.units)}
        />
      </dl>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-stone-500">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function PersonalBests({ me }: { me: Me }) {
  const { data: pbs } = usePersonalBests();
  if (!pbs?.length) return null;
  return (
    <section className="card">
      <h2 className="font-semibold">Personal bests</h2>
      <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        {pbs.map((pb) => (
          <li key={pb.distanceM}>
            <Link to={`/activities/${pb.activityId}`} className="block">
              <span className="text-xs text-stone-500">
                {pbLabel(pb.distanceM)}
              </span>
              <span className="block font-semibold tabular-nums">
                {formatDuration(pb.durationS)}
              </span>
              <span className="block text-xs text-stone-500">
                {formatDate(pb.achievedAt, me.timezone)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
