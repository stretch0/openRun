import { useEffect, useMemo, useRef, useState } from 'react';
import type { Total } from '@openrun/schemas';

// One hue, light to dark for more distance. Dark mode uses its own steps
// (dark to light) so the busiest days still read as the strongest.
const LEVELS = [
  'bg-stone-200 dark:bg-stone-800',
  'bg-orange-200 dark:bg-orange-900',
  'bg-orange-400 dark:bg-orange-700',
  'bg-orange-600 dark:bg-orange-500',
  'bg-orange-800 dark:bg-orange-300',
];

const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', ''];

/**
 * A year of daily distance as a GitHub-style grid: one column per week
 * (Monday first), coloured by quartile of the days with a run.
 */
export function Heatmap({
  days,
  format,
}: {
  /** Oldest first, starting on a Monday. */
  days: Total[];
  format: (metres: number) => string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);

  const levelOf = useMemo(() => {
    const sorted = days
      .map((d) => d.distanceM)
      .filter((d) => d > 0)
      .sort((a, b) => a - b);
    const q = (p: number) => sorted[Math.floor(p * (sorted.length - 1))] ?? 0;
    const [q1, q2, q3] = [q(0.25), q(0.5), q(0.75)];
    return (m: number) =>
      m <= 0 ? 0 : m <= q1 ? 1 : m <= q2 ? 2 : m <= q3 ? 3 : 4;
  }, [days]);

  const weeks = Math.ceil(days.length / 7);
  const monthLabels = useMemo(
    () =>
      Array.from({ length: weeks }, (_, w) => {
        const first = days[w * 7];
        const prev = days[(w - 1) * 7];
        if (
          !first ||
          (prev && prev.start.slice(5, 7) === first.start.slice(5, 7))
        ) {
          return '';
        }
        return new Date(`${first.start}T12:00:00Z`).toLocaleDateString(
          undefined,
          {
            month: 'short',
            timeZone: 'UTC',
          },
        );
      }),
    [days, weeks],
  );

  // Show the most recent weeks first on narrow screens.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [days]);

  const runDays = days.filter((d) => d.count > 0).length;
  const activeDay = active !== null ? days[active] : null;

  return (
    <figure>
      <div className="mb-2 h-9 text-xs" aria-live="polite">
        {activeDay ? (
          <>
            <p className="font-semibold tabular-nums">
              {activeDay.count ? format(activeDay.distanceM) : 'Rest day'}
            </p>
            <p className="text-stone-500">
              {new Date(`${activeDay.start}T12:00:00Z`).toLocaleDateString(
                undefined,
                {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  timeZone: 'UTC',
                },
              )}
            </p>
          </>
        ) : (
          <p className="pt-2 text-stone-500">
            {runDays} days with a run in the last year
          </p>
        )}
      </div>
      <div ref={scroller} className="overflow-x-auto pb-1">
        <div className="inline-grid grid-cols-[auto_1fr] gap-x-1">
          <span className="sticky left-0 bg-white dark:bg-stone-900" />
          <div
            className="grid gap-[2px] text-[10px] text-stone-500"
            style={{ gridTemplateColumns: `repeat(${weeks}, 11px)` }}
          >
            {monthLabels.map((label, w) => (
              <span key={w} className="overflow-visible whitespace-nowrap">
                {label}
              </span>
            ))}
          </div>
          <div className="sticky left-0 z-10 grid grid-rows-7 gap-[2px] bg-white pr-1 text-[10px] leading-[11px] text-stone-500 dark:bg-stone-900">
            {DAY_LABELS.map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <div
            className="grid grid-flow-col grid-rows-7 gap-[2px]"
            style={{ gridAutoColumns: '11px' }}
            role="img"
            aria-label={`Daily running distance for the last year: ${runDays} days with a run.`}
            onPointerLeave={() => setActive(null)}
          >
            {days.map((day, i) => (
              <div
                key={day.start}
                className={`size-[11px] rounded-[2px] ${LEVELS[levelOf(day.distanceM)]} ${
                  active === i ? 'ring-2 ring-stone-900 dark:ring-white' : ''
                }`}
                onPointerEnter={() => setActive(i)}
              />
            ))}
          </div>
        </div>
      </div>
      <figcaption className="mt-2 flex items-center justify-end gap-1 text-[11px] text-stone-500">
        Less
        {LEVELS.map((cls) => (
          <span key={cls} className={`size-[11px] rounded-[2px] ${cls}`} />
        ))}
        More
      </figcaption>
    </figure>
  );
}
