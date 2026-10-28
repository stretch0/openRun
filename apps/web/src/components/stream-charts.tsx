import { type KeyboardEvent, type PointerEvent, useMemo } from 'react';
import {
  type Units,
  distanceIn,
  formatDuration,
  smoothedSpeed,
} from '@openrun/domain';
import type { ActivityStream } from '@openrun/schemas';

type Series = {
  key: string;
  title: string;
  values: (number | null)[];
  format: (v: number) => string;
  /** Pace: smaller is faster, so faster is drawn higher. */
  inverted?: boolean;
};

const W = 600;
const H = 120;

/**
 * Pace, heart rate and elevation against distance, as small multiples that
 * share one crosshair. `hover` is the hovered sample index, shared with the
 * map so the position shows there too.
 */
export function StreamCharts({
  stream,
  units,
  hover,
  onHover,
}: {
  stream: ActivityStream;
  units: Units;
  hover: number | null;
  onHover: (index: number | null) => void;
}) {
  const unit = units === 'metric' ? 'km' : 'mi';
  const xs = useMemo(
    () => stream.d.map((d) => (d == null ? null : distanceIn(d, units))),
    [stream, units],
  );
  const series = useMemo(() => {
    const perUnit = units === 'metric' ? 1000 : 1609.344;
    const pace = smoothedSpeed(stream).map((s) => (s ? perUnit / s : null));
    const all: Series[] = [
      {
        key: 'pace',
        title: 'Pace',
        values: pace,
        format: (v) => `${formatDuration(v)} /${unit}`,
        inverted: true,
      },
      {
        key: 'hr',
        title: 'Heart rate',
        values: stream.hr,
        format: (v) => `${Math.round(v)} bpm`,
      },
      {
        key: 'alt',
        title: 'Elevation',
        values: stream.alt,
        format: (v) => `${Math.round(v)} m`,
      },
    ];
    return all.filter((s) => s.values.some((v) => v != null));
  }, [stream, units, unit]);

  const maxX = xs.reduce<number>((m, x) => Math.max(m, x ?? 0), 0);
  if (!series.length || maxX <= 0) return null;

  const indexAt = (fraction: number) => {
    const target = fraction * maxX;
    let best = 0;
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i];
      if (x == null) continue;
      if (Math.abs(x - target) < Math.abs((xs[best] ?? 0) - target)) best = i;
    }
    return best;
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    onHover(indexAt(f));
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 1;
    const current = hover ?? 0;
    if (e.key === 'ArrowRight')
      onHover(Math.min(xs.length - 1, current + step));
    else if (e.key === 'ArrowLeft') onHover(Math.max(0, current - step));
    else if (e.key === 'Escape') onHover(null);
    else return;
    e.preventDefault();
  };

  const hoverX = hover !== null ? xs[hover] : null;

  return (
    <section className="card space-y-3" aria-label="Charts">
      <Readout
        series={series}
        hover={hover}
        distance={hoverX != null ? `${hoverX.toFixed(2)} ${unit}` : null}
      />
      <div
        className="space-y-4 outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
        tabIndex={0}
        role="group"
        aria-label="Pace, heart rate and elevation by distance. Use the arrow keys to move along the run."
        onPointerMove={onPointerMove}
        onPointerDown={onPointerMove}
        onPointerLeave={() => onHover(null)}
        onKeyDown={onKeyDown}
        onBlur={() => onHover(null)}
        style={{ touchAction: 'pan-y' }}
      >
        {series.map((s) => (
          <Chart key={s.key} series={s} xs={xs} maxX={maxX} hoverX={hoverX} />
        ))}
        <div className="flex justify-between text-xs tabular-nums text-stone-500">
          <span>0 {unit}</span>
          <span>
            {maxX.toFixed(1)} {unit}
          </span>
        </div>
      </div>
    </section>
  );
}

/** One readout for every series at the crosshair; values lead, labels follow. */
function Readout({
  series,
  hover,
  distance,
}: {
  series: Series[];
  hover: number | null;
  distance: string | null;
}) {
  if (hover === null || distance === null) {
    return (
      <p className="text-sm text-stone-500">
        Move across a chart to see values along the run.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-live="polite">
      <div>
        <p className="font-semibold tabular-nums">{distance}</p>
        <p className="text-xs text-stone-500">Distance</p>
      </div>
      {series.map((s) => {
        const v = s.values[hover];
        return (
          <div key={s.key}>
            <p className="font-semibold tabular-nums">
              {v == null ? '–' : s.format(v)}
            </p>
            <p className="text-xs text-stone-500">{s.title}</p>
          </div>
        );
      })}
    </div>
  );
}

/** Value at the given quantile, ignoring nulls; used to keep spikes from flattening the chart. */
function quantile(sorted: number[], q: number) {
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

function Chart({
  series,
  xs,
  maxX,
  hoverX,
}: {
  series: Series;
  xs: (number | null)[];
  maxX: number;
  hoverX: number | null;
}) {
  const { line, area, top, bottom } = useMemo(() => {
    const present = series.values
      .filter((v): v is number => v != null)
      .sort((a, b) => a - b);
    // Pace has long slow tails (walk breaks, GPS glitches) that would
    // flatten the rest of the run; clip them to 1.5x the median pace.
    let lo = series.inverted ? quantile(present, 0.02) : present[0];
    let hi = series.inverted
      ? Math.min(quantile(present, 0.98), quantile(present, 0.5) * 1.5)
      : (present.at(-1) ?? 0);
    if (hi - lo < 1e-6) {
      lo -= 1;
      hi += 1;
    }
    const pad = (hi - lo) * 0.08;
    lo -= pad;
    hi += pad;
    const y = (v: number) => {
      const f = (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo);
      return (series.inverted ? f : 1 - f) * H;
    };
    let line = '';
    let area = '';
    let segStart: number | null = null;
    let lastX = 0;
    const close = () => {
      if (segStart !== null) area += `L${lastX},${H}L${segStart},${H}Z`;
      segStart = null;
    };
    series.values.forEach((v, i) => {
      const xv = xs[i];
      if (v == null || xv == null) {
        close();
        return;
      }
      const px = (xv / maxX) * W;
      const py = y(v);
      if (segStart === null) {
        segStart = px;
        line += `M${px},${py}`;
        area += `M${px},${H}L${px},${py}`;
      } else {
        line += `L${px},${py}`;
        area += `L${px},${py}`;
      }
      lastX = px;
    });
    close();
    // The labels name the visible top and bottom of the axis.
    return {
      line,
      area,
      top: series.inverted ? lo + pad : hi - pad,
      bottom: series.inverted ? hi - pad : lo + pad,
    };
  }, [series, xs, maxX]);

  return (
    <figure>
      <figcaption className="mb-1 flex items-baseline justify-between text-xs">
        <span className="font-medium text-stone-700 dark:text-stone-300">
          {series.title}
        </span>
      </figcaption>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="block h-24 w-full overflow-visible text-brand-600 dark:text-brand-500"
          aria-hidden
        >
          {[0, H / 2, H].map((gy) => (
            <line
              key={gy}
              x1={0}
              x2={W}
              y1={gy}
              y2={gy}
              className="stroke-stone-200 dark:stroke-stone-800"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path d={area} fill="currentColor" fillOpacity={0.1} />
          <path
            d={line}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {hoverX != null && (
            <line
              x1={(hoverX / maxX) * W}
              x2={(hoverX / maxX) * W}
              y1={0}
              y2={H}
              className="stroke-stone-500"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        <span className="pointer-events-none absolute left-1 top-0 text-[11px] tabular-nums text-stone-500">
          {series.format(top)}
        </span>
        <span className="pointer-events-none absolute bottom-0 left-1 text-[11px] tabular-nums text-stone-500">
          {series.format(bottom)}
        </span>
      </div>
    </figure>
  );
}
