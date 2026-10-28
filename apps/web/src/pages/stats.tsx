import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  type Units,
  distanceIn,
  formatDistance,
  formatDuration,
  formatPace,
} from '@openrun/domain';
import type { Predictions, Shoe, Total } from '@openrun/schemas';
import { type Bar, BarChart } from '../components/bar-chart';
import { Heatmap } from '../components/heatmap';
import {
  formatDate,
  formatTotalDistance,
  formatTotalTime,
  pbLabel,
} from '../lib/format';
import { useMe } from '../lib/queries';
import { useShoes, useStats } from '../lib/stats';

export function StatsPage() {
  const { data: me } = useMe();
  const { data: stats } = useStats();
  if (!me || !stats) return null;
  const units = me.units;

  return (
    <>
      <h1 className="text-2xl font-semibold">Stats</h1>

      <section className="grid grid-cols-3 gap-2" aria-label="Totals">
        <Tile label="This week" total={stats.thisWeek} units={units} />
        <Tile label="This month" total={stats.thisMonth} units={units} />
        <Tile label="This year" total={stats.thisYear} units={units} />
      </section>

      <Distance weeks={stats.weeks} months={stats.months} units={units} />

      <section className="card">
        <h2 className="font-semibold">Last 12 months</h2>
        <div className="mt-2">
          <Heatmap days={stats.days} format={(m) => formatDistance(m, units)} />
        </div>
      </section>

      <RacePredictions predictions={stats.predictions} me={me} />
      <ShoeMileage units={units} />

      <p className="text-center text-xs text-stone-500">
        {stats.allTime.count} runs ·{' '}
        {formatTotalDistance(stats.allTime.distanceM, units)} all time. Walks
        aren't counted.
      </p>
    </>
  );
}

function Tile({
  label,
  total,
  units,
}: {
  label: string;
  total: Total;
  units: Units;
}) {
  return (
    <div className="card p-3">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="text-xl font-semibold">
        {formatTotalDistance(total.distanceM, units)}
      </p>
      <p className="text-xs text-stone-500">
        {total.count} {total.count === 1 ? 'run' : 'runs'}
      </p>
      <p className="text-xs text-stone-500">
        {formatTotalTime(total.durationS)}
      </p>
    </div>
  );
}

function Distance({
  weeks,
  months,
  units,
}: {
  weeks: Total[];
  months: Total[];
  units: Units;
}) {
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const unit = units === 'metric' ? 'km' : 'mi';
  const format = (v: number) =>
    `${v.toFixed(v >= 100 || v === 0 ? 0 : 1)} ${unit}`;
  const toBar = (t: Total, label: string, title: string): Bar => ({
    key: t.start,
    label,
    title,
    value: distanceIn(t.distanceM, units),
    detail: `${t.count} ${t.count === 1 ? 'run' : 'runs'}${
      t.durationS ? ` · ${formatTotalTime(t.durationS)}` : ''
    }`,
  });
  const day = (start: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(`${start}T12:00:00Z`).toLocaleDateString(undefined, {
      ...opts,
      timeZone: 'UTC',
    });

  const bars =
    period === 'week'
      ? weeks.map((w) =>
          toBar(
            w,
            day(w.start, { day: 'numeric', month: 'short' }),
            `Week of ${day(w.start, { day: 'numeric', month: 'short', year: 'numeric' })}`,
          ),
        )
      : months.map((m) =>
          toBar(
            m,
            day(m.start, { month: 'narrow' }),
            day(m.start, { month: 'long', year: 'numeric' }),
          ),
        );

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Distance</h2>
        <div
          className="flex rounded-lg bg-stone-100 p-0.5 text-sm dark:bg-stone-800"
          role="group"
          aria-label="Group by"
        >
          {(['week', 'month'] as const).map((p) => (
            <button
              key={p}
              className={`rounded-md px-3 py-1 ${
                period === p
                  ? 'bg-white font-medium shadow-sm dark:bg-stone-700'
                  : 'text-stone-500'
              }`}
              aria-pressed={period === p}
              onClick={() => setPeriod(p)}
            >
              {p === 'week' ? 'Weekly' : 'Monthly'}
            </button>
          ))}
        </div>
      </div>
      <BarChart
        bars={bars}
        format={format}
        caption={`${period === 'week' ? 'Weekly' : 'Monthly'} running distance`}
        labelEvery={period === 'week' ? 3 : 1}
      />
    </section>
  );
}

function RacePredictions({
  predictions,
  me,
}: {
  predictions: Predictions | null;
  me: { units: Units; timezone: string };
}) {
  return (
    <section className="card">
      <h2 className="font-semibold">Race predictions</h2>
      {predictions ? (
        <>
          <p className="mt-1 text-sm text-stone-500">
            From your {pbLabel(predictions.basedOn.distanceM)} in{' '}
            {formatDuration(predictions.basedOn.durationS)} on{' '}
            <Link
              to={`/activities/${predictions.basedOn.activityId}`}
              className="text-brand-600"
            >
              {formatDate(predictions.basedOn.achievedAt, me.timezone)}
            </Link>{' '}
            (VDOT {predictions.vdot.toFixed(1)}). They assume you've trained for
            the distance.
          </p>
          <table className="mt-2 w-full text-right text-sm tabular-nums">
            <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
              {predictions.races.map((r) => (
                <tr key={r.distanceM}>
                  <td className="py-1.5 text-left">{pbLabel(r.distanceM)}</td>
                  <td className="py-1.5 font-semibold">
                    {formatDuration(r.durationS)}
                  </td>
                  <td className="w-24 py-1.5 text-stone-500">
                    {formatPace(r.distanceM, r.durationS, me.units)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="mt-1 text-sm text-stone-500">
          Run a mile or further and your predictions for 5k to the marathon will
          show here. They use your best effort from the last 120 days.
        </p>
      )}
    </section>
  );
}

/** Most running shoes are good for roughly this far. */
const SHOE_LIFE_M = 800_000;

function ShoeMileage({ units }: { units: Units }) {
  const { data: shoes } = useShoes();
  const active = shoes?.filter((s) => !s.retired) ?? [];
  return (
    <section className="card">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Shoes</h2>
        <Link to="/settings" className="text-sm text-brand-600">
          Manage
        </Link>
      </div>
      {active.length ? (
        <ul className="mt-2 space-y-3">
          {active.map((shoe) => (
            <ShoeMeter key={shoe.id} shoe={shoe} units={units} />
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-stone-500">
          Add your shoes in Settings to track how far they've gone.
        </p>
      )}
    </section>
  );
}

function ShoeMeter({ shoe, units }: { shoe: Shoe; units: Units }) {
  const used = Math.min(1, shoe.distanceM / SHOE_LIFE_M);
  const worn = shoe.distanceM >= SHOE_LIFE_M;
  return (
    <li className="text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-medium">{shoe.name}</span>
        <span className="shrink-0 tabular-nums">
          {formatTotalDistance(shoe.distanceM, units)}
        </span>
      </div>
      <div
        className="mt-1 h-1.5 rounded-full bg-brand-100 dark:bg-stone-800"
        role="meter"
        aria-label={`${shoe.name} wear`}
        aria-valuemin={0}
        aria-valuemax={SHOE_LIFE_M}
        aria-valuenow={Math.round(shoe.distanceM)}
      >
        <div
          className="h-full rounded-full bg-brand-600 dark:bg-brand-500"
          style={{ width: `${used * 100}%` }}
        />
      </div>
      {worn && (
        <p className="mt-1 text-xs text-stone-500">
          ⚠ Past {formatTotalDistance(SHOE_LIFE_M, units)}: worth checking the
          cushioning.
        </p>
      )}
    </li>
  );
}
