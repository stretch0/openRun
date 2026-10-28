import { useState } from 'react';

export type Bar = {
  key: string;
  /** Short axis label, e.g. "Oct". */
  label: string;
  /** Full period name for the tooltip and table, e.g. "Week of 20 Oct". */
  title: string;
  value: number;
  /** Extra tooltip lines, e.g. "3 runs · 2:41:00". */
  detail: string;
};

/**
 * Vertical bars from one baseline. Only the latest bar is labelled; every
 * value is in the tooltip (hover or keyboard focus) and the table view.
 */
export function BarChart({
  bars,
  format,
  caption,
  labelEvery = 1,
}: {
  bars: Bar[];
  format: (v: number) => string;
  caption: string;
  labelEvery?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(...bars.map((b) => b.value), 0));

  return (
    <figure>
      <div className="relative">
        <span className="absolute left-0 top-0 text-[11px] tabular-nums text-stone-500">
          {format(max)}
        </span>
        <div
          className="relative flex h-40 items-end border-b border-stone-300 pt-5 dark:border-stone-700"
          aria-label={caption}
          role="group"
          onPointerLeave={() => setActive(null)}
        >
          {/* Gridline at the axis maximum. */}
          <div className="pointer-events-none absolute inset-x-0 top-5 border-t border-stone-200 dark:border-stone-800" />
          {bars.map((bar, i) => {
            const height = max > 0 ? (bar.value / max) * 100 : 0;
            const last = i === bars.length - 1;
            return (
              <div
                key={bar.key}
                className="group relative flex h-full flex-1 cursor-default flex-col items-center justify-end outline-none"
                tabIndex={0}
                aria-label={`${bar.title}: ${format(bar.value)}, ${bar.detail}`}
                onPointerEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              >
                {last && bar.value > 0 && active === null && (
                  <span className="mb-1 whitespace-nowrap text-[11px] font-semibold tabular-nums text-stone-700 dark:text-stone-300">
                    {format(bar.value)}
                  </span>
                )}
                <div
                  className={`w-[70%] max-w-6 rounded-t transition-colors ${
                    active === i
                      ? 'bg-brand-700 dark:bg-brand-500/80'
                      : 'bg-brand-600 dark:bg-brand-500'
                  } group-focus-visible:ring-2 group-focus-visible:ring-brand-500/40`}
                  style={{
                    height: `${height}%`,
                    minHeight: bar.value > 0 ? 2 : 0,
                  }}
                />
                {active === i && (
                  <Tooltip
                    bar={bar}
                    format={format}
                    index={i}
                    count={bars.length}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="flex">
          {bars.map((bar, i) => (
            <span
              key={bar.key}
              className="flex flex-1 justify-center overflow-visible whitespace-nowrap pt-1 text-[11px] text-stone-500"
            >
              {(bars.length - 1 - i) % labelEvery === 0 ? bar.label : ''}
            </span>
          ))}
        </div>
      </div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-stone-500">
          Show as table
        </summary>
        <table className="mt-2 w-full text-right tabular-nums">
          <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
            {[...bars].reverse().map((bar) => (
              <tr key={bar.key}>
                <td className="py-1 text-left">{bar.title}</td>
                <td className="py-1 font-medium">{format(bar.value)}</td>
                <td className="py-1 text-stone-500">{bar.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

function Tooltip({
  bar,
  format,
  index,
  count,
}: {
  bar: Bar;
  format: (v: number) => string;
  index: number;
  count: number;
}) {
  // Keep the tooltip inside the chart near the edges.
  const align =
    index < 2
      ? 'left-0'
      : index > count - 3
        ? 'right-0'
        : 'left-1/2 -translate-x-1/2';
  return (
    <div
      role="tooltip"
      className={`pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs shadow-md dark:border-stone-700 dark:bg-stone-800 ${align}`}
    >
      <p className="font-semibold tabular-nums text-stone-900 dark:text-stone-100">
        {format(bar.value)}
      </p>
      <p className="text-stone-500">{bar.title}</p>
      <p className="text-stone-500">{bar.detail}</p>
    </div>
  );
}

/** Rounds up to a clean axis maximum, e.g. 101 -> 120, 43 -> 50. */
function niceMax(value: number) {
  if (value <= 0) return 0;
  const power = 10 ** Math.floor(Math.log10(value));
  const step =
    [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => s * power >= value) ??
    10;
  return step * power;
}
