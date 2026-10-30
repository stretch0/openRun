import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDistance, formatDuration, formatPace } from '@openrun/domain';
import type { ActivitySummary, Me } from '@openrun/schemas';
import { useActivityList, usePersonalBests } from '../lib/activities';
import { SPORT_LABELS, formatDate, pbLabel } from '../lib/format';
import { authClient } from '../lib/auth-client';
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

      <PasskeyPrompt />

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
          {a.visibility === 'clubs' && (
            <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-normal text-brand-700 dark:bg-brand-500/15 dark:text-brand-500">
              Shared
            </span>
          )}
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
      {a.device && <p className="mt-1 text-xs text-stone-500">{a.device}</p>}
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

const PASSKEY_PROMPT_KEY = 'openrun:passkey-prompt-dismissed';

/**
 * There's no password reset by email, so nudge people towards a passkey
 * they're unlikely to lose. Dismissed per device.
 */
function PasskeyPrompt() {
  const { data: passkeys, isPending } = authClient.useListPasskeys();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(PASSKEY_PROMPT_KEY) === '1';
    } catch {
      return false;
    }
  });
  if (isPending || dismissed || (passkeys?.length ?? 0) > 0) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(PASSKEY_PROMPT_KEY, '1');
    } catch {
      // Private browsing: it just shows again next time.
    }
    setDismissed(true);
  };
  return (
    <section className="card flex items-start gap-3 text-sm">
      <span aria-hidden className="text-lg">
        🔑
      </span>
      <div className="flex-1">
        <p className="font-medium">Add a passkey</p>
        <p className="text-stone-500">
          Sign in with Face ID, Touch ID or your phone instead of a password,
          and you won't get locked out if you forget it.
        </p>
        <div className="mt-2 flex gap-3">
          <Link to="/settings" className="font-medium text-brand-600">
            Add one in Settings
          </Link>
          <button className="text-stone-500" onClick={dismiss}>
            Not now
          </button>
        </div>
      </div>
    </section>
  );
}
