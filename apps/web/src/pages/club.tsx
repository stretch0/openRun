import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  type Club,
  type ClubRun,
  type ShareLevel,
  shareLevelSchema,
} from '@openrun/schemas';
import { FormError } from '../components/auth-card';
import { ClubHighlights } from '../components/club-highlights';
import { ClubRunCard } from '../components/club-run-card';
import { ClubLogo } from '../components/club-logo';
import { CoffeePicker, describeOrder } from '../components/coffee';
import { clubApi, useClub, useClubMutation, useClubRuns } from '../lib/clubs';
import { ApiError } from '../lib/api';

export const SHARE_LEVEL_LABELS: Record<ShareLevel, string> = {
  attendance: 'Attendance only',
  summaries: 'Run summaries',
  full: 'Summaries and maps',
};

const SHARE_LEVEL_HELP: Record<ShareLevel, string> = {
  attendance:
    'The club sees your RSVPs and when you turn up. Nothing from your run log.',
  summaries:
    'Plus distance, time and pace of runs you choose to share with it.',
  full: 'Plus the route of runs you share, with your privacy zones cut out.',
};

export function ClubPage() {
  const { id = '' } = useParams();
  const club = useClub(id);
  const runs = useClubRuns(id);

  if (club.error instanceof ApiError) {
    return (
      <section className="card text-center">
        <p className="font-medium">
          {club.error.status === 403 ? club.error.message : 'Club not found'}
        </p>
        <Link to="/clubs" className="btn-secondary mt-3">
          Back to clubs
        </Link>
      </section>
    );
  }
  const c = club.data;
  if (!c) return null;
  const manage = c.role !== 'member';

  return (
    <>
      <div>
        <div className="flex min-h-9 items-center justify-between gap-3">
          <Link to="/clubs" className="text-sm text-brand-600">
            ← Clubs
          </Link>
          {manage && (
            <Link
              to={`/clubs/${c.id}/manage`}
              className="btn-secondary px-3 py-1.5 text-sm"
            >
              Manage
            </Link>
          )}
        </div>
        <div className="mt-2 flex items-center gap-3">
          <ClubLogo club={c} size="lg" />
          <div className="min-w-0">
            <h1 className="text-2xl leading-tight font-semibold">{c.name}</h1>
            <p className="mt-0.5 text-sm text-stone-500">
              {c.memberCount} {c.memberCount === 1 ? 'member' : 'members'}
            </p>
          </div>
        </div>
        {c.description && (
          <p className="mt-2 whitespace-pre-wrap text-stone-600 dark:text-stone-300">
            {c.description}
          </p>
        )}
      </div>

      {manage && <InviteCard club={c} />}

      <section className="space-y-2" aria-label="Upcoming runs">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Upcoming runs
        </h2>
        {runs.data?.length ? (
          <UpcomingRuns runs={runs.data} timeZone={c.timezone} />
        ) : runs.data ? (
          <p className="card text-sm text-stone-500">
            Nothing scheduled yet.
            {manage && ' Add a repeating run in Manage.'}
          </p>
        ) : null}
      </section>

      <ClubHighlights club={c} />
      {c.menu.some((i) => !i.hidden) && <UsualCard club={c} />}
      <ShareLevelCard club={c} />
      <MuteCard club={c} />
      <Members club={c} />
      <LeaveClub club={c} />
    </>
  );
}

/** Runs in the coming week (at least the next one); later ones on request. */
function UpcomingRuns({
  runs,
  timeZone,
}: {
  runs: ClubRun[];
  timeZone: string;
}) {
  const [all, setAll] = useState(false);
  const [weekAhead] = useState(() => Date.now() + 7 * 86_400_000);
  const soon = Math.max(
    1,
    runs.filter((r) => Date.parse(r.startsAt) < weekAhead).length,
  );
  const shown = all ? runs : runs.slice(0, soon);
  return (
    <>
      {shown.map((run) => (
        <ClubRunCard key={run.id} run={run} timeZone={timeZone} />
      ))}
      {runs.length > shown.length && (
        <button className="btn-secondary w-full" onClick={() => setAll(true)}>
          Show later runs ({runs.length - shown.length})
        </button>
      )}
    </>
  );
}

function InviteCard({ club }: { club: Club }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/clubs/join/${club.joinCode}`;
  const copy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
  };
  return (
    <section className="card space-y-2">
      <h2 className="font-semibold">Invite people</h2>
      <p className="text-sm text-stone-500">
        Share the link, or read out the code at the start of a run.
        {club.requireApproval && ' You approve new members in Manage.'}
      </p>
      <div className="flex items-center gap-3">
        <span className="font-mono text-lg tracking-widest">
          {club.joinCode}
        </span>
        <button className="ml-auto font-medium text-brand-600" onClick={copy}>
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
    </section>
  );
}

/** A saved order, optionally added whenever you say you're going. */
function UsualCard({ club }: { club: Club }) {
  const api = clubApi(club.id);
  const set = useClubMutation(api.setUsual);
  const remove = useClubMutation(api.removeUsual);
  const [editing, setEditing] = useState(false);
  const usual = club.myUsual;
  const [autoAdd, setAutoAdd] = useState<boolean>();
  const pickedFrom = (u: NonNullable<Club['myUsual']>) =>
    Object.fromEntries(u.choices.map((c) => [c.option, c.choice]));

  return (
    <section className="card space-y-2" aria-label="Your usual">
      <h2 className="font-semibold">Your usual coffee</h2>
      {editing ? (
        <CoffeePicker
          menu={club.menu}
          initial={usual}
          submitLabel="Save"
          pending={set.isPending}
          error={set.error?.message}
          onCancel={() => setEditing(false)}
          onSubmit={(picked) =>
            set.mutate(
              { ...picked, autoAdd: autoAdd ?? usual?.autoAdd ?? false },
              { onSuccess: () => setEditing(false) },
            )
          }
        />
      ) : usual ? (
        <>
          <p className="font-medium">{describeOrder(usual)}</p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-brand-600"
              checked={autoAdd ?? usual.autoAdd}
              onChange={(e) => {
                setAutoAdd(e.target.checked);
                set.mutate({
                  menuItemId: usual.menuItemId,
                  choices: pickedFrom(usual),
                  autoAdd: e.target.checked,
                });
              }}
            />
            Order it whenever I say I'm going
          </label>
          <div className="flex gap-4 text-sm font-medium">
            <button className="text-brand-600" onClick={() => setEditing(true)}>
              Change
            </button>
            <button
              className="text-stone-500"
              disabled={remove.isPending}
              onClick={() => remove.mutate(undefined)}
            >
              Forget it
            </button>
          </div>
          <FormError message={set.error?.message} />
        </>
      ) : (
        <>
          <p className="text-sm text-stone-500">
            Save what you usually have, then order it in one tap, or have it
            ordered whenever you say you're going.
          </p>
          <button className="btn-secondary" onClick={() => setEditing(true)}>
            Choose your usual
          </button>
        </>
      )}
    </section>
  );
}

function ShareLevelCard({ club }: { club: Club }) {
  const set = useClubMutation(clubApi(club.id).setShareLevel);
  const [level, setLevel] = useState(club.shareLevel);
  return (
    <section className="card space-y-2">
      <label className="font-semibold" htmlFor="shareLevel">
        What you share with {club.name}
      </label>
      <select
        className="input"
        id="shareLevel"
        value={level}
        onChange={(e) => {
          setLevel(e.target.value as ShareLevel);
          set.mutate(e.target.value as ShareLevel);
        }}
      >
        {shareLevelSchema.options.map((level) => (
          <option key={level} value={level}>
            {SHARE_LEVEL_LABELS[level]}
          </option>
        ))}
      </select>
      <p className="text-sm text-stone-500">{SHARE_LEVEL_HELP[level]}</p>
    </section>
  );
}

function MuteCard({ club }: { club: Club }) {
  const set = useClubMutation(clubApi(club.id).setMuted);
  const [muted, setMuted] = useState(club.muted);
  return (
    <section className="card">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-4 shrink-0 accent-brand-600"
          checked={muted}
          onChange={(e) => {
            setMuted(e.target.checked);
            set.mutate(e.target.checked);
          }}
        />
        <span>
          <span className="font-medium">
            Mute notifications from {club.name}
          </span>
          <span className="block text-stone-500">
            No reminders or updates from this club. Choose what you hear about
            in{' '}
            <Link to="/settings" className="text-brand-600">
              Settings
            </Link>
            .
          </span>
        </span>
      </label>
    </section>
  );
}

function Members({ club }: { club: Club }) {
  const active = club.members.filter((m) => m.status === 'active');
  return (
    <section className="card">
      <h2 className="font-semibold">Members</h2>
      <ul className="mt-2 flex flex-wrap gap-1.5 text-sm">
        {active.map((m) => (
          <li
            key={m.userId}
            className="rounded-full bg-stone-100 px-2.5 py-1 dark:bg-stone-800"
          >
            {m.name}
            {m.role !== 'member' && (
              <span className="text-stone-500">
                {' '}
                · {m.role === 'owner' ? 'owner' : 'organiser'}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function LeaveClub({ club }: { club: Club }) {
  const leave = useClubMutation(() => clubApi(club.id).removeMember('me'));
  const navigate = useNavigate();
  if (club.role === 'owner') return null;
  const onLeave = () => {
    if (!window.confirm(`Leave ${club.name}? Your RSVPs will be removed.`))
      return;
    leave.mutate(undefined, { onSuccess: () => navigate('/clubs') });
  };
  return (
    <section>
      <button className="btn-secondary text-red-600" onClick={onLeave}>
        Leave club
      </button>
      <FormError message={leave.error?.message} />
    </section>
  );
}
