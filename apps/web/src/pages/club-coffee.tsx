import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useOrderSummary } from '../lib/clubs';
import { formatRunTime } from '../lib/format';

/** Keeps the screen on while the order list is open, where supported. */
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | undefined;
    let cancelled = false;
    const request = () =>
      navigator.wakeLock
        ?.request('screen')
        .then((l) => {
          if (cancelled) void l.release();
          else lock = l;
        })
        .catch(() => undefined);
    // The lock is dropped when the page is hidden; take it again on return.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request();
    };
    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
    };
  }, []);
}

/** The order list, big enough to read out or hand over at the counter. */
export function ClubCoffeePage() {
  const { id = '', runId = '' } = useParams();
  const summary = useOrderSummary(id, runId);
  useWakeLock();
  const s = summary.data;

  if (!s) {
    return summary.error ? (
      <section className="card text-center">
        <p className="font-medium">Couldn't load the order list</p>
        <Link to={`/clubs/${id}/runs/${runId}`} className="btn-secondary mt-3">
          Back to the run
        </Link>
      </section>
    ) : null;
  }

  return (
    <>
      <div>
        <Link
          to={`/clubs/${id}/runs/${runId}`}
          className="text-sm text-brand-600"
        >
          ← {s.runTitle}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Coffee order</h1>
        <p className="text-stone-600 dark:text-stone-300">
          {s.clubName} · {formatRunTime(s.startsAt, s.timezone)}
        </p>
      </div>

      <p
        className={`rounded-lg px-3 py-2 text-sm ${
          s.open
            ? 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
            : 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300'
        }`}
      >
        {s.open
          ? `Orders are still open until ${formatRunTime(s.closesAt, s.timezone)}, so this may change.`
          : 'Orders have closed.'}{' '}
        Updated{' '}
        {new Date(summary.dataUpdatedAt).toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
        })}
        .
      </p>

      {s.total === 0 ? (
        <section className="card text-center text-stone-500">
          Nobody has ordered.
        </section>
      ) : (
        <section className="card space-y-5" aria-label="What to order">
          {s.lines.map((line) => {
            const plainOnly =
              line.variants.length === 1 && line.variants[0].choices === '';
            return (
              <div key={line.item}>
                <p className="text-3xl font-semibold tabular-nums">
                  {line.count} × {line.item}
                </p>
                {!plainOnly && (
                  <ul className="mt-1 space-y-0.5 text-xl tabular-nums text-stone-600 dark:text-stone-300">
                    {line.variants.map((v) => (
                      <li key={v.choices}>
                        {v.count} × {v.choices || 'standard'}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
          <p className="border-t border-stone-200 pt-3 text-lg font-medium dark:border-stone-800">
            {s.total} {s.total === 1 ? 'order' : 'orders'} in all
          </p>
        </section>
      )}

      {s.people.length > 0 && (
        <section className="card" aria-label="Who's having what">
          <h2 className="font-semibold">Who's having what</h2>
          <ul className="mt-2 divide-y divide-stone-200 dark:divide-stone-800">
            {s.people.map((p, i) => (
              <li key={i} className="flex justify-between gap-3 py-2">
                <span className="font-medium">{p.name}</span>
                <span className="text-right text-stone-600 dark:text-stone-300">
                  {p.item}
                  {p.choices && ` · ${p.choices}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
