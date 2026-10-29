import { useState } from 'react';
import type { Club } from '@openrun/schemas';
import { clubApi, useClubHighlights, useClubMutation } from '../lib/clubs';
import { formatTotalDistance } from '../lib/format';
import { useMe } from '../lib/queries';
import { SharedRuns } from './shared-runs';

/** Turning up, celebrated. Never who's fastest. */
export function ClubHighlights({ club }: { club: Club }) {
  const { data: h } = useClubHighlights(club.id);
  const { data: me } = useMe();
  const optIn = useClubMutation(clubApi(club.id).setHighlights);
  const [shown, setShown] = useState(club.highlights);
  if (!h || !me) return null;
  const { turnout, runs, sharedDistanceM } = h.thisMonth;
  const day = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: club.timezone,
    });

  return (
    <>
      <section className="card space-y-3" aria-label="Highlights">
        <h2 className="font-semibold">Highlights</h2>
        <p className="text-sm">
          {runs
            ? `This month: ${turnout} ${turnout === 1 ? 'person' : 'people'} turned up across ${runs} ${runs === 1 ? 'run' : 'runs'}`
            : 'No club runs yet this month'}
          {sharedDistanceM > 0 &&
            `, and members shared ${formatTotalDistance(sharedDistanceM, me.units)} of running`}
          .
        </p>

        {h.streaks.length > 0 && (
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-stone-500">
              On a roll
            </h3>
            <ul className="mt-1 flex flex-wrap gap-1.5 text-sm">
              {h.streaks.map((s) => (
                <li
                  key={s.userId}
                  className="rounded-full bg-brand-50 px-2.5 py-1 text-brand-700 dark:bg-brand-500/15 dark:text-brand-100"
                >
                  {s.name} · {s.weeks} weeks in a row
                </li>
              ))}
            </ul>
          </div>
        )}

        {h.moments.length > 0 && (
          <ul className="space-y-1 text-sm">
            {h.moments.map((m, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span>
                  <span className="font-medium">{m.name}</span>: {m.text}
                </span>
                <span className="shrink-0 text-stone-500">{day(m.at)}</span>
              </li>
            ))}
          </ul>
        )}

        <label className="flex items-start gap-2 border-t border-stone-200 pt-3 text-sm dark:border-stone-800">
          <input
            type="checkbox"
            className="mt-0.5 size-4 shrink-0 accent-brand-600"
            checked={shown}
            onChange={(e) => {
              setShown(e.target.checked);
              optIn.mutate(e.target.checked);
            }}
          />
          <span>
            Celebrate me in highlights
            <span className="block text-stone-500">
              Your streaks and milestones appear here by name. Totals never name
              anyone.
            </span>
          </span>
        </label>
      </section>
      <SharedRuns shares={h.recentShares} title="Recently shared" />
    </>
  );
}
