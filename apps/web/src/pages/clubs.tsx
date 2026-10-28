import { type FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ClubSummary } from '@openrun/schemas';
import { FormError } from '../components/auth-card';
import {
  useClubPreview,
  useClubs,
  useCreateClub,
  useJoinClub,
} from '../lib/clubs';
import { formatRunTime } from '../lib/format';
import { useMe } from '../lib/queries';

export function ClubsPage() {
  const { data: clubs } = useClubs();
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Clubs</h1>
        {!creating && (
          <button className="btn-secondary" onClick={() => setCreating(true)}>
            Start a club
          </button>
        )}
      </div>

      {creating && <CreateClub onCancel={() => setCreating(false)} />}

      {clubs?.length ? (
        <section className="space-y-2" aria-label="Your clubs">
          {clubs.map((club) => (
            <ClubCard key={club.id} club={club} />
          ))}
        </section>
      ) : clubs && !creating ? (
        <section className="card text-center">
          <p className="font-medium">You're not in a club yet</p>
          <p className="mt-1 text-sm text-stone-500">
            Ask an organiser for their club's invite link or code, or start your
            own.
          </p>
        </section>
      ) : null}

      <JoinWithCode />
    </>
  );
}

const ROLE_LABELS = { owner: 'Owner', organiser: 'Organiser', member: '' };

function ClubCard({ club }: { club: ClubSummary }) {
  const pending = club.status === 'pending';
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate font-medium">{club.name}</p>
        <span className="shrink-0 text-xs text-stone-500">
          {pending ? 'Waiting for approval' : ROLE_LABELS[club.role]}
        </span>
      </div>
      <p className="mt-1 text-sm text-stone-500">
        {club.nextRun
          ? `Next: ${club.nextRun.title}, ${formatRunTime(club.nextRun.startsAt, club.timezone)}`
          : pending
            ? 'An organiser needs to let you in.'
            : 'No runs scheduled'}
      </p>
    </>
  );
  return pending ? (
    <div className="card opacity-70">{body}</div>
  ) : (
    <Link
      to={`/clubs/${club.id}`}
      className="card block transition hover:border-brand-500"
    >
      {body}
    </Link>
  );
}

function CreateClub({ onCancel }: { onCancel: () => void }) {
  const { data: me } = useMe();
  const create = useCreateClub();
  const navigate = useNavigate();
  const zones = Intl.supportedValuesOf?.('timeZone') ?? [];

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    create.mutate(
      {
        name: String(form.get('clubName')),
        description: String(form.get('description') ?? '') || null,
        timezone: String(form.get('clubTimezone')),
        requireApproval: form.get('requireApproval') === 'on',
      },
      { onSuccess: (club) => navigate(`/clubs/${club.id}/manage`) },
    );
  };

  return (
    <form onSubmit={onSubmit} className="card space-y-3">
      <h2 className="font-semibold">Start a club</h2>
      <div>
        <label className="label" htmlFor="clubName">
          Name
        </label>
        <input className="input" id="clubName" name="clubName" required />
      </div>
      <div>
        <label className="label" htmlFor="description">
          Description
        </label>
        <textarea
          className="input"
          id="description"
          name="description"
          rows={2}
          placeholder="Who you are, where you run, how fast"
        />
      </div>
      <div>
        <label className="label" htmlFor="clubTimezone">
          Time zone for runs
        </label>
        <select
          className="input"
          id="clubTimezone"
          name="clubTimezone"
          defaultValue={me?.timezone}
        >
          {(me && !zones.includes(me.timezone)
            ? [me.timezone, ...zones]
            : zones
          ).map((tz) => (
            <option key={tz}>{tz}</option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="requireApproval"
          className="size-4 accent-brand-600"
        />
        Approve new members before they can join
      </label>
      <FormError message={create.error?.message} />
      <div className="flex gap-2">
        <button className="btn-primary" disabled={create.isPending}>
          Create club
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function JoinWithCode() {
  const join = useJoinClub();
  const navigate = useNavigate();
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get('code'));
    join.mutate(code, {
      onSuccess: (club) => {
        if (club.status === 'active') navigate(`/clubs/${club.id}`);
      },
    });
  };
  return (
    <form onSubmit={onSubmit} className="card space-y-2">
      <label className="font-semibold" htmlFor="code">
        Join with a code
      </label>
      <div className="flex gap-2">
        <input
          className="input font-mono uppercase"
          id="code"
          name="code"
          placeholder="e.g. K7MPQ2RX"
          autoCapitalize="characters"
          required
        />
        <button className="btn-primary shrink-0" disabled={join.isPending}>
          Join
        </button>
      </div>
      <FormError message={join.error?.message} />
      {join.data?.status === 'pending' && (
        <p className="text-sm text-stone-500">
          Asked to join {join.data.name}. An organiser will let you in.
        </p>
      )}
    </form>
  );
}

/** Where invite links land: shows the club, then joins it. */
export function JoinClubPage() {
  const { code = '' } = useParams();
  const preview = useClubPreview(code);
  const join = useJoinClub();
  const navigate = useNavigate();
  const club = preview.data;

  if (preview.error) {
    return (
      <section className="card text-center">
        <p className="font-medium">{preview.error.message}</p>
        <p className="mt-1 text-sm text-stone-500">
          Ask the organiser for a new link.
        </p>
      </section>
    );
  }
  if (!club) return null;
  const status = join.data?.status ?? club.status;

  return (
    <section className="card space-y-3 text-center">
      <p className="text-sm text-stone-500">You've been invited to</p>
      <h1 className="text-2xl font-semibold">{club.name}</h1>
      {club.description && <p className="text-stone-600">{club.description}</p>}
      <p className="text-sm text-stone-500">
        {club.memberCount} {club.memberCount === 1 ? 'member' : 'members'}
      </p>
      <p className="rounded-lg bg-stone-100 px-3 py-2 text-left text-sm text-stone-600 dark:bg-stone-800 dark:text-stone-300">
        Joining shares your name and your RSVPs with the club. Your runs stay
        private unless you choose to share them.{' '}
        <Link to="/privacy" className="text-brand-600">
          Who can see what
        </Link>
      </p>
      {status === 'active' ? (
        <button
          className="btn-primary w-full"
          onClick={() => navigate(`/clubs/${club.id}`)}
        >
          Go to the club
        </button>
      ) : status === 'pending' ? (
        <p className="font-medium">
          Asked to join. An organiser will let you in.
        </p>
      ) : (
        <button
          className="btn-primary w-full"
          disabled={join.isPending}
          onClick={() =>
            join.mutate(code, {
              onSuccess: (c) => {
                if (c.status === 'active') navigate(`/clubs/${c.id}`);
              },
            })
          }
        >
          {club.requireApproval ? 'Ask to join' : `Join ${club.name}`}
        </button>
      )}
      <FormError message={join.error?.message} />
    </section>
  );
}
