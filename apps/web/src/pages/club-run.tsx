import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Attendee, ClubRunDetail, RunCoffee } from '@openrun/schemas';
import { FormError } from '../components/auth-card';
import { RsvpButtons } from '../components/club-run-card';
import { CoffeePicker, describeOrder } from '../components/coffee';
import { SharedRuns } from '../components/shared-runs';
import { WeatherDetail } from '../components/weather';
import {
  clubApi,
  useClub,
  useClubMutation,
  useClubRun,
  useOrderSummary,
} from '../lib/clubs';
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

      {(r.location || r.notes || (r.weather && !cancelled)) && (
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
          {r.weather && !cancelled && <WeatherDetail weather={r.weather} />}
          {r.notes && <p className="whitespace-pre-wrap">{r.notes}</p>}
        </section>
      )}

      {!cancelled && <Rsvp run={r} />}
      {r.coffee && <Coffee run={r} coffee={r.coffee} />}
      <Attendees run={r} />
      <SharedRuns shares={r.shares} />
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

function Coffee({ run, coffee }: { run: ClubRunDetail; coffee: RunCoffee }) {
  const { data: club } = useClub(run.clubId);
  const api = clubApi(run.clubId);
  const order = useClubMutation(api.order);
  const remove = useClubMutation(api.removeOrder);
  const [picking, setPicking] = useState(false);
  // Fetch the order list now, so it's there to show at the café even with
  // no signal.
  useOrderSummary(run.clubId, run.id, coffee.orderCount > 0);

  const going = run.myRsvp?.status === 'going';
  const mine = coffee.myOrder;
  const usual = club?.myUsual;
  const usualOnMenu =
    usual && club?.menu.some((i) => i.id === usual.menuItemId && !i.hidden);
  const closes =
    coffee.closesAt === run.startsAt
      ? 'when the run starts'
      : formatRunTime(coffee.closesAt, run.timezone);

  return (
    <section className="card space-y-3" aria-label="Coffee">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">Coffee after</h2>
        {coffee.orderCount > 0 && (
          <Link
            to={`/clubs/${run.clubId}/runs/${run.id}/coffee`}
            className="shrink-0 text-sm font-medium text-brand-600"
          >
            Order list ({coffee.orderCount})
          </Link>
        )}
      </div>

      {picking && club ? (
        <CoffeePicker
          menu={club.menu}
          initial={mine ?? usual}
          submitLabel="Order"
          pending={order.isPending}
          error={order.error?.message}
          onCancel={() => setPicking(false)}
          onSubmit={(picked, form) =>
            order.mutate(
              {
                runId: run.id,
                ...picked,
                saveAsUsual: form.get('saveAsUsual') === 'on',
              },
              { onSuccess: () => setPicking(false) },
            )
          }
        >
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="saveAsUsual"
              defaultChecked={!usual}
              className="size-4 accent-brand-600"
            />
            Make this my usual
          </label>
        </CoffeePicker>
      ) : mine ? (
        <>
          <p>
            <span className="text-stone-500">Your order: </span>
            <span className="font-medium">{describeOrder(mine)}</span>
          </p>
          {coffee.open && (
            <div className="flex gap-4 text-sm font-medium">
              <button
                className="text-brand-600"
                onClick={() => setPicking(true)}
              >
                Change
              </button>
              <button
                className="text-stone-500"
                disabled={remove.isPending}
                onClick={() => remove.mutate(run.id)}
              >
                No coffee
              </button>
            </div>
          )}
        </>
      ) : !coffee.open ? (
        <p className="text-sm text-stone-500">You didn't order.</p>
      ) : going ? (
        <div className="flex flex-wrap gap-2">
          {usual && usualOnMenu && (
            <button
              className="btn-primary"
              disabled={order.isPending}
              onClick={() =>
                order.mutate({
                  runId: run.id,
                  menuItemId: usual.menuItemId,
                  choices: Object.fromEntries(
                    usual.choices.map((c) => [c.option, c.choice]),
                  ),
                  saveAsUsual: false,
                })
              }
            >
              My usual: {describeOrder(usual)}
            </button>
          )}
          <button className="btn-secondary" onClick={() => setPicking(true)}>
            {usual && usualOnMenu ? 'Something else' : 'Order a coffee'}
          </button>
        </div>
      ) : (
        <p className="text-sm text-stone-500">
          Say you're going to order a coffee for after.
        </p>
      )}
      {!picking && <FormError message={order.error?.message} />}

      <p className="text-xs text-stone-500">
        {coffee.open
          ? `Orders close ${closes}.`
          : 'Orders have closed. The list is ready for the café.'}
      </p>
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
