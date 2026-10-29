import { type FormEvent, Suspense, lazy, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { WEEKDAYS, zonedTime } from '@openrun/domain';
import type { Club, Member } from '@openrun/schemas';
import { FormError } from '../components/auth-card';
import { clubApi, useClub, useClubMutation } from '../lib/clubs';
import { useMe } from '../lib/queries';

const PointMap = lazy(() => import('../components/zone-map'));

const DAY_LABELS: Record<(typeof WEEKDAYS)[number], string> = {
  MO: 'Mon',
  TU: 'Tue',
  WE: 'Wed',
  TH: 'Thu',
  FR: 'Fri',
  SA: 'Sat',
  SU: 'Sun',
};

export function ClubManagePage() {
  const { id = '' } = useParams();
  const { data: club } = useClub(id);
  if (!club) return null;
  if (club.role === 'member') {
    return (
      <section className="card text-center">
        <p className="font-medium">Only organisers can manage {club.name}</p>
        <Link to={`/clubs/${club.id}`} className="btn-secondary mt-3">
          Back to the club
        </Link>
      </section>
    );
  }
  return (
    <>
      <div>
        <Link to={`/clubs/${club.id}`} className="text-sm text-brand-600">
          ← {club.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Manage club</h1>
      </div>
      <Requests club={club} />
      <RepeatingRuns club={club} />
      <OneOffRun club={club} />
      <MeetingPoints club={club} />
      <MemberRoles club={club} />
      <Details club={club} />
      {club.role === 'owner' && <DeleteClub club={club} />}
    </>
  );
}

function Requests({ club }: { club: Club }) {
  const update = useClubMutation(clubApi(club.id).updateMember);
  const remove = useClubMutation(clubApi(club.id).removeMember);
  const pending = club.members.filter((m) => m.status === 'pending');
  if (!pending.length) return null;
  return (
    <section className="card space-y-2">
      <h2 className="font-semibold">Asking to join</h2>
      <ul className="divide-y divide-stone-200 text-sm dark:divide-stone-800">
        {pending.map((m) => (
          <li key={m.userId} className="flex items-center gap-3 py-2">
            <span className="flex-1">{m.name}</span>
            <button
              className="font-medium text-brand-600"
              onClick={() =>
                update.mutate({ userId: m.userId, status: 'active' })
              }
            >
              Let in
            </button>
            <button
              className="text-stone-500"
              onClick={() => remove.mutate(m.userId)}
            >
              Decline
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RepeatingRuns({ club }: { club: Club }) {
  const add = useClubMutation(clubApi(club.id).addSeries);
  const update = useClubMutation(clubApi(club.id).updateSeries);
  const [adding, setAdding] = useState(club.series.length === 0);
  const locationName = (id: string | null) =>
    club.locations.find((l) => l.id === id)?.name;

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    add.mutate(
      {
        title: String(form.get('seriesTitle')),
        days: WEEKDAYS.filter((d) => form.get(`day-${d}`) === 'on'),
        interval: Number(form.get('interval')),
        startsOn: String(form.get('startsOn')),
        startTime: String(form.get('startTime')),
        locationId: String(form.get('seriesLocation') ?? '') || null,
        notes: String(form.get('seriesNotes') ?? '') || null,
      },
      { onSuccess: () => setAdding(false) },
    );
  };

  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">Repeating runs</h2>
      <p className="text-sm text-stone-500">
        Runs are created eight weeks ahead, in the club's time zone (
        {club.timezone}), so people can RSVP early. Changing a schedule updates
        future runs and keeps RSVPs on runs that still happen.
      </p>
      {club.series.length > 0 && (
        <ul className="divide-y divide-stone-200 text-sm dark:divide-stone-800">
          {club.series.map((s) => (
            <li key={s.id} className="flex items-start gap-3 py-2">
              <div className={`flex-1 ${s.ended ? 'text-stone-500' : ''}`}>
                <p className="font-medium">
                  {s.title}
                  {s.ended && ' (stopped)'}
                </p>
                <p className="text-stone-500">
                  {[
                    `${s.summary} at ${s.startTime}`,
                    locationName(s.locationId),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <button
                className={
                  s.ended ? 'font-medium text-brand-600' : 'text-red-600'
                }
                onClick={() => {
                  if (
                    s.ended ||
                    window.confirm(
                      `Stop “${s.title}”? Its future runs and their RSVPs are removed.`,
                    )
                  ) {
                    update.mutate({ id: s.id, ended: !s.ended });
                  }
                }}
              >
                {s.ended ? 'Restart' : 'Stop'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="label" htmlFor="seriesTitle">
              Name
            </label>
            <input
              className="input"
              id="seriesTitle"
              name="seriesTitle"
              placeholder="Saturday social run"
              required
            />
          </div>
          <fieldset>
            <legend className="label">Days</legend>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((d) => (
                <label
                  key={d}
                  className="cursor-pointer rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm has-[:checked]:border-brand-600 has-[:checked]:bg-brand-600 has-[:checked]:text-white dark:border-stone-700"
                >
                  <input
                    type="checkbox"
                    name={`day-${d}`}
                    className="sr-only"
                  />
                  {DAY_LABELS[d]}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label" htmlFor="interval">
                Every
              </label>
              <select
                className="input"
                id="interval"
                name="interval"
                defaultValue="1"
              >
                <option value="1">week</option>
                <option value="2">2 weeks</option>
                <option value="3">3 weeks</option>
                <option value="4">4 weeks</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="startTime">
                Time
              </label>
              <input
                className="input"
                id="startTime"
                name="startTime"
                type="time"
                defaultValue="08:00"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="startsOn">
                From
              </label>
              <input
                className="input"
                id="startsOn"
                name="startsOn"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                required
              />
            </div>
          </div>
          <LocationSelect club={club} name="seriesLocation" />
          <div>
            <label className="label" htmlFor="seriesNotes">
              Notes
            </label>
            <textarea
              className="input"
              id="seriesNotes"
              name="seriesNotes"
              rows={2}
            />
          </div>
          <FormError message={add.error?.message} />
          <div className="flex gap-2">
            <button className="btn-primary" disabled={add.isPending}>
              Add repeating run
            </button>
            {club.series.length > 0 && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setAdding(false)}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      ) : (
        <button
          className="btn-secondary w-full"
          onClick={() => setAdding(true)}
        >
          Add a repeating run
        </button>
      )}
    </section>
  );
}

function OneOffRun({ club }: { club: Club }) {
  const add = useClubMutation(clubApi(club.id).addRun);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    // The picker shows wall-clock time; it means that time in the club's zone.
    const [day, time] = String(form.get('runStart')).split('T');
    add.mutate(
      {
        title: String(form.get('runTitle')),
        startsAt: zonedTime(day, time, club.timezone).toISOString(),
        locationId: String(form.get('runLocation') ?? '') || null,
        notes: String(form.get('runNotes') ?? '') || null,
      },
      { onSuccess: (run) => navigate(`/clubs/${club.id}/runs/${run.id}`) },
    );
  };
  if (!open) {
    return (
      <button className="btn-secondary w-full" onClick={() => setOpen(true)}>
        Add a one-off run (a race, a social, a trip)
      </button>
    );
  }
  return (
    <form onSubmit={onSubmit} className="card space-y-3">
      <h2 className="font-semibold">One-off run</h2>
      <div>
        <label className="label" htmlFor="runTitle">
          Name
        </label>
        <input className="input" id="runTitle" name="runTitle" required />
      </div>
      <div>
        <label className="label" htmlFor="runStart">
          Starts ({club.timezone})
        </label>
        <input
          className="input"
          id="runStart"
          name="runStart"
          type="datetime-local"
          required
        />
      </div>
      <LocationSelect club={club} name="runLocation" />
      <div>
        <label className="label" htmlFor="runNotes">
          Notes
        </label>
        <textarea className="input" id="runNotes" name="runNotes" rows={2} />
      </div>
      <FormError message={add.error?.message} />
      <div className="flex gap-2">
        <button className="btn-primary" disabled={add.isPending}>
          Add run
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function LocationSelect({ club, name }: { club: Club; name: string }) {
  if (!club.locations.length) return null;
  return (
    <div>
      <label className="label" htmlFor={name}>
        Meeting point
      </label>
      <select
        className="input"
        id={name}
        name={name}
        defaultValue={club.locations[0].id}
      >
        <option value="">None</option>
        {club.locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function MeetingPoints({ club }: { club: Club }) {
  const add = useClubMutation(clubApi(club.id).addLocation);
  const remove = useClubMutation(clubApi(club.id).removeLocation);
  const [adding, setAdding] = useState(false);
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const first = club.locations[0];

  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">Meeting points</h2>
      {club.locations.length > 0 && (
        <ul className="divide-y divide-stone-200 text-sm dark:divide-stone-800">
          {club.locations.map((l) => (
            <li key={l.id} className="flex items-center gap-3 py-2">
              <span className="flex-1">
                {l.name}
                {l.notes && (
                  <span className="text-stone-500"> · {l.notes}</span>
                )}
              </span>
              <button
                className="text-red-600"
                onClick={() => remove.mutate(l.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <div className="space-y-3">
          <Suspense
            fallback={
              <div className="h-64 rounded-xl bg-stone-100 dark:bg-stone-800" />
            }
          >
            <PointMap
              label="Map: tap where the club meets"
              centre={
                point ?? (first ? { lat: first.lat, lng: first.lng } : null)
              }
              zones={club.locations.map((l) => ({ ...l, radiusM: 30 }))}
              draft={point ? { ...point, radiusM: 30 } : null}
              onPick={setPoint}
            />
          </Suspense>
          <p className="text-sm text-stone-500">Tap the map where you meet.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="pointName">
                Name
              </label>
              <input
                className="input"
                id="pointName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Park bandstand"
              />
            </div>
            <div>
              <label className="label" htmlFor="pointNotes">
                Directions
              </label>
              <input
                className="input"
                id="pointNotes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="By the café"
              />
            </div>
          </div>
          <FormError message={add.error?.message} />
          <div className="flex gap-2">
            <button
              className="btn-primary"
              disabled={!point || !name.trim() || add.isPending}
              onClick={() =>
                point &&
                add.mutate(
                  { ...point, name: name.trim(), notes: notes.trim() || null },
                  {
                    onSuccess: () => {
                      setAdding(false);
                      setPoint(null);
                      setName('');
                      setNotes('');
                    },
                  },
                )
              }
            >
              Save meeting point
            </button>
            <button className="btn-secondary" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          className="btn-secondary w-full"
          onClick={() => setAdding(true)}
        >
          Add a meeting point
        </button>
      )}
    </section>
  );
}

function MemberRoles({ club }: { club: Club }) {
  const { data: me } = useMe();
  const update = useClubMutation(clubApi(club.id).updateMember);
  const remove = useClubMutation(clubApi(club.id).removeMember);
  const active = club.members.filter((m) => m.status === 'active');
  const canRemove = (m: Member) =>
    m.userId !== me?.id &&
    m.role !== 'owner' &&
    (club.role === 'owner' || m.role === 'member');
  return (
    <section className="card space-y-2">
      <h2 className="font-semibold">Members</h2>
      <ul className="divide-y divide-stone-200 text-sm dark:divide-stone-800">
        {active.map((m) => (
          <li key={m.userId} className="flex items-center gap-3 py-2">
            <span className="flex-1">{m.name}</span>
            {club.role === 'owner' && m.role !== 'owner' ? (
              <select
                className="rounded-md bg-transparent text-sm"
                aria-label={`Role for ${m.name}`}
                value={m.role}
                onChange={(e) =>
                  update.mutate({
                    userId: m.userId,
                    role: e.target.value as 'organiser' | 'member',
                  })
                }
              >
                <option value="member">Member</option>
                <option value="organiser">Organiser</option>
              </select>
            ) : (
              <span className="text-stone-500">
                {m.role === 'owner'
                  ? 'Owner'
                  : m.role === 'organiser'
                    ? 'Organiser'
                    : ''}
              </span>
            )}
            {canRemove(m) && (
              <button
                className="text-red-600"
                onClick={() => {
                  if (window.confirm(`Remove ${m.name} from ${club.name}?`)) {
                    remove.mutate(m.userId);
                  }
                }}
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      <FormError message={update.error?.message ?? remove.error?.message} />
    </section>
  );
}

function Details({ club }: { club: Club }) {
  const update = useClubMutation(clubApi(club.id).update);
  const newCode = useClubMutation(clubApi(club.id).newCode);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    update.mutate({
      name: String(form.get('detailName')),
      description: String(form.get('detailDescription') ?? '') || null,
      requireApproval: form.get('detailApproval') === 'on',
    });
  };
  return (
    <form onSubmit={onSubmit} className="card space-y-3">
      <h2 className="font-semibold">Club details</h2>
      <div>
        <label className="label" htmlFor="detailName">
          Name
        </label>
        <input
          className="input"
          id="detailName"
          name="detailName"
          defaultValue={club.name}
          required
        />
      </div>
      <div>
        <label className="label" htmlFor="detailDescription">
          Description
        </label>
        <textarea
          className="input"
          id="detailDescription"
          name="detailDescription"
          rows={2}
          defaultValue={club.description ?? ''}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="detailApproval"
          defaultChecked={club.requireApproval}
          className="size-4 accent-brand-600"
        />
        Approve new members before they can join
      </label>
      <FormError message={update.error?.message} />
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={update.isPending}>
          {update.isSuccess ? 'Saved' : 'Save'}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            if (
              window.confirm(
                'Make a new invite code? The old link and code stop working.',
              )
            ) {
              newCode.mutate();
            }
          }}
        >
          New invite code
        </button>
      </div>
    </form>
  );
}

function DeleteClub({ club }: { club: Club }) {
  const remove = useClubMutation(clubApi(club.id).remove);
  const navigate = useNavigate();
  return (
    <section>
      <button
        className="btn-secondary text-red-600"
        onClick={() => {
          if (
            window.confirm(
              `Delete ${club.name}? Every run, RSVP and membership is removed. Members' own run logs aren't affected.`,
            )
          ) {
            remove.mutate(undefined, { onSuccess: () => navigate('/clubs') });
          }
        }}
      >
        Delete club
      </button>
      <FormError message={remove.error?.message} />
    </section>
  );
}
