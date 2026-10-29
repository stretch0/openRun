import { Link, useParams } from 'react-router-dom';
import type { Attendee, ClubRunDetail } from '@openrun/schemas';
import { FormError } from '../components/auth-card';
import { RsvpButtons } from '../components/club-run-card';
import { clubApi, useClubMutation, useClubRun } from '../lib/clubs';
import { ApiError } from '../lib/api';
import { formatRunTime, mapLink } from '../lib/format';

export function ClubRunPage() {
  const { id = '', runId = '' } = useParams();
  const run = useClubRun(id, runId);

  if (run.error instanceof ApiError) {
    return (
      <section className="card text-center">
        <p className="font-medium">Run not found</p>
        <Link to={`/clubs/${id}`} className="btn-secondary mt-3">
          Back to the club
        </Link>
      </section>
    );
  }
  const r = run.data;
  if (!r) return null;
  const cancelled = r.status === 'cancelled';

  return (
    <>
      <div>
        <Link to={`/clubs/${r.clubId}`} className="text-sm text-brand-600">
          ← {r.clubName}
        </Link>
        <h1
          className={`mt-1 text-2xl font-semibold ${cancelled ? 'line-through' : ''}`}
        >
          {r.title}
        </h1>
        <p className="text-stone-600 dark:text-stone-300">
          {formatRunTime(r.startsAt, r.timezone)}
        </p>
      </div>

      {cancelled && (
        <section className="card border-red-200 text-red-700 dark:border-red-900 dark:text-red-300">
          <p className="font-medium">This run is cancelled</p>
          {r.cancelledReason && <p className="text-sm">{r.cancelledReason}</p>}
        </section>
      )}

      {(r.location || r.notes) && (
        <section className="card space-y-1 text-sm">
          {r.location && (
            <p>
              <span className="font-medium">{r.location.name}</span>
              {r.location.notes && (
                <span className="text-stone-500"> · {r.location.notes}</span>
              )}{' '}
              <a
                className="text-brand-600"
                href={mapLink(r.location.lat, r.location.lng)}
                target="_blank"
                rel="noreferrer"
              >
                Open in maps
              </a>
            </p>
          )}
          {r.notes && <p className="whitespace-pre-wrap">{r.notes}</p>}
        </section>
      )}

      {!cancelled && <Rsvp run={r} />}
      <Attendees run={r} />
      {r.canManage && <OrganiserActions run={r} />}
    </>
  );
}

function Rsvp({ run }: { run: ClubRunDetail }) {
  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">Are you coming?</h2>
      <RsvpButtons run={run} />
    </section>
  );
}

function Attendees({ run }: { run: ClubRunDetail }) {
  const going = run.attendees.filter((a) => a.status === 'going');
  const maybe = run.attendees.filter((a) => a.status === 'maybe');
  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">
        {run.going} going{run.maybe ? ` · ${run.maybe} maybe` : ''}
      </h2>
      {going.length === 0 && (
        <p className="text-sm text-stone-500">Nobody yet. Be the first!</p>
      )}
      {going.length > 0 && <People people={going} />}
      {maybe.length > 0 && (
        <div>
          <p className="text-xs font-medium text-stone-500">Maybe</p>
          <People people={maybe} />
        </div>
      )}
    </section>
  );
}

function People({ people }: { people: Attendee[] }) {
  return (
    <ul className="mt-1 flex flex-wrap gap-1.5 text-sm">
      {people.map((p) => (
        <li
          key={p.userId}
          className="rounded-full bg-stone-100 px-2.5 py-1 dark:bg-stone-800"
        >
          {p.name}
        </li>
      ))}
    </ul>
  );
}

function OrganiserActions({ run }: { run: ClubRunDetail }) {
  const update = useClubMutation(clubApi(run.clubId).updateRun);
  const cancelled = run.status === 'cancelled';
  const toggle = () => {
    if (cancelled) {
      update.mutate({ id: run.id, status: 'scheduled' });
      return;
    }
    const reason = window.prompt('Cancel this run? Add a reason (optional):');
    if (reason === null) return;
    update.mutate({
      id: run.id,
      status: 'cancelled',
      cancelledReason: reason.trim() || null,
    });
  };
  return (
    <section className="space-y-2">
      <button
        className={`btn-secondary ${cancelled ? '' : 'text-red-600'}`}
        onClick={toggle}
        disabled={update.isPending}
      >
        {cancelled ? 'Reinstate run' : 'Cancel run'}
      </button>
      <FormError message={update.error?.message} />
    </section>
  );
}
