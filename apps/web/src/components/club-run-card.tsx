import { Link } from 'react-router-dom';
import type { ClubRun, RsvpStatus } from '@openrun/schemas';
import { clubApi, useClubMutation } from '../lib/clubs';
import { formatRunTime } from '../lib/format';

export const RSVP_LABELS: Record<RsvpStatus, string> = {
  going: 'Going',
  maybe: 'Maybe',
  not_going: "Can't make it",
};

/** Going / Maybe / Can't make it. */
export function RsvpButtons({ run }: { run: ClubRun }) {
  const rsvp = useClubMutation(clubApi(run.clubId).rsvp);
  return (
    <div
      className="flex gap-1.5"
      role="group"
      aria-label={`RSVP to ${run.title}`}
    >
      {(Object.keys(RSVP_LABELS) as RsvpStatus[]).map((status) => {
        const chosen = run.myRsvp?.status === status;
        return (
          <button
            key={status}
            className={`flex-1 rounded-lg border px-2 py-1.5 text-sm font-medium transition ${
              chosen
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-stone-300 hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800'
            }`}
            aria-pressed={chosen}
            disabled={rsvp.isPending}
            onClick={() => rsvp.mutate({ runId: run.id, status })}
          >
            {RSVP_LABELS[status]}
          </button>
        );
      })}
    </div>
  );
}

export function ClubRunCard({
  run,
  timeZone,
}: {
  run: ClubRun;
  timeZone: string;
}) {
  const cancelled = run.status === 'cancelled';
  return (
    <article className="card space-y-2">
      <Link to={`/clubs/${run.clubId}/runs/${run.id}`} className="block">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className={`font-medium ${cancelled ? 'line-through' : ''}`}>
            {run.title}
          </h3>
          <span className="shrink-0 text-sm tabular-nums text-stone-500">
            {formatRunTime(run.startsAt, timeZone)}
          </span>
        </div>
        <p className="text-sm text-stone-500">
          {cancelled
            ? `Cancelled${run.cancelledReason ? `: ${run.cancelledReason}` : ''}`
            : [
                run.location?.name,
                `${run.going} going`,
                run.maybe ? `${run.maybe} maybe` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
        </p>
      </Link>
      {!cancelled && <RsvpButtons run={run} />}
    </article>
  );
}
