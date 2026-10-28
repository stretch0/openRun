import { type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  type Attendee,
  type ClubRunDetail,
  type RsvpStatus,
  rsvpStatusSchema,
} from '@openrun/schemas';
import { FormError } from '../components/auth-card';
import { RSVP_LABELS } from '../components/club-run-card';
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

      {!cancelled && <RsvpForm run={r} />}
      <Attendees run={r} />
      {r.canManage && <OrganiserActions run={r} />}
    </>
  );
}

function RsvpForm({ run }: { run: ClubRunDetail }) {
  const rsvp = useClubMutation(clubApi(run.clubId).rsvp);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    rsvp.mutate({
      runId: run.id,
      status: form.get('status') as RsvpStatus,
      paceGroup: String(form.get('paceGroup') ?? '') || null,
      guests: Number(form.get('guests') ?? 0),
      note: String(form.get('note') ?? '') || null,
    });
  };
  const mine = run.myRsvp;
  return (
    <form
      onSubmit={onSubmit}
      className="card space-y-3"
      key={JSON.stringify(mine)}
    >
      <h2 className="font-semibold">Are you coming?</h2>
      <fieldset className="flex gap-1.5">
        <legend className="sr-only">Your answer</legend>
        {rsvpStatusSchema.options.map((status) => (
          <label
            key={status}
            className="flex-1 cursor-pointer rounded-lg border border-stone-300 px-2 py-2 text-center text-sm font-medium has-[:checked]:border-brand-600 has-[:checked]:bg-brand-600 has-[:checked]:text-white dark:border-stone-700"
          >
            <input
              type="radio"
              name="status"
              value={status}
              defaultChecked={(mine?.status ?? 'going') === status}
              className="sr-only"
            />
            {RSVP_LABELS[status]}
          </label>
        ))}
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        {run.paceGroups.length > 0 && (
          <div>
            <label className="label" htmlFor="paceGroup">
              Pace group
            </label>
            <select
              className="input"
              id="paceGroup"
              name="paceGroup"
              defaultValue={mine?.paceGroup ?? ''}
            >
              <option value="">Not sure</option>
              {run.paceGroups.map((g) => (
                <option key={g.name} value={g.name}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor="guests">
            Bringing guests
          </label>
          <input
            className="input"
            id="guests"
            name="guests"
            type="number"
            min="0"
            max="10"
            defaultValue={mine?.guests ?? 0}
          />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="note">
          Note for the organisers
        </label>
        <input
          className="input"
          id="note"
          name="note"
          maxLength={200}
          defaultValue={mine?.note ?? ''}
          placeholder="e.g. running late, meet you at the gate"
        />
      </div>
      <FormError message={rsvp.error?.message} />
      <button className="btn-primary" disabled={rsvp.isPending}>
        {mine ? 'Update' : 'Save'}
      </button>
    </form>
  );
}

function Attendees({ run }: { run: ClubRunDetail }) {
  const going = run.attendees.filter((a) => a.status === 'going');
  const maybe = run.attendees.filter((a) => a.status === 'maybe');
  // Group by pace group, in the order the organisers listed them.
  const groups = [
    ...run.paceGroups.map((g) => g.name),
    ...new Set(going.map((a) => a.paceGroup ?? '')),
  ].filter((g, i, all) => all.indexOf(g) === i);
  const inGroup = (g: string) => going.filter((a) => (a.paceGroup ?? '') === g);

  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">
        {run.going} going{run.maybe ? ` · ${run.maybe} maybe` : ''}
      </h2>
      {going.length === 0 && (
        <p className="text-sm text-stone-500">Nobody yet. Be the first!</p>
      )}
      {groups.map((g) =>
        inGroup(g).length ? (
          <div key={g || 'none'}>
            <p className="text-xs font-medium text-stone-500">
              {g || 'No pace group'}
            </p>
            <People people={inGroup(g)} />
          </div>
        ) : null,
      )}
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
          title={p.note ?? undefined}
        >
          {p.name}
          {p.guests > 0 && <span className="text-stone-500"> +{p.guests}</span>}
          {p.note && <span className="text-stone-500"> · {p.note}</span>}
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
