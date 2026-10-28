/** Training totals by day, week and month, in the runner's time zone. */

export type TotalsInput = {
  startedAt: Date;
  distanceM: number;
  durationS: number;
};

export type Total = {
  /** First day of the period, as YYYY-MM-DD in the runner's time zone. */
  start: string;
  distanceM: number;
  durationS: number;
  count: number;
};

/** The calendar date (YYYY-MM-DD) of `date` in `timeZone`; UTC if unknown. */
export function localDate(date: Date, timeZone: string): string {
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return date.toISOString().slice(0, 10);
  }
  // en-CA formats as YYYY-MM-DD.
  return fmt.format(date);
}

/** Calendar arithmetic on YYYY-MM-DD strings, done in UTC to avoid DST. */
function toUtc(day: string) {
  return new Date(`${day}T00:00:00Z`);
}

export function addDays(day: string, days: number): string {
  const d = toUtc(day);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The Monday on or before `day`. */
export function weekStart(day: string): string {
  const dow = (toUtc(day).getUTCDay() + 6) % 7; // Monday = 0
  return addDays(day, -dow);
}

export function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

function addMonths(month: string, months: number): string {
  const d = toUtc(month);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/**
 * Totals for each of the `count` periods ending with the one containing
 * `now`, oldest first. Periods with no activities are included as zeros.
 */
function totalsBy(
  activities: TotalsInput[],
  timeZone: string,
  now: Date,
  count: number,
  periodOf: (day: string) => string,
  step: (period: string, n: number) => string,
): Total[] {
  const last = periodOf(localDate(now, timeZone));
  const periods = Array.from({ length: count }, (_, i) =>
    step(last, i - count + 1),
  );
  const byStart = new Map<string, Total>(
    periods.map((start) => [
      start,
      { start, distanceM: 0, durationS: 0, count: 0 },
    ]),
  );
  for (const a of activities) {
    const total = byStart.get(periodOf(localDate(a.startedAt, timeZone)));
    if (!total) continue;
    total.distanceM += a.distanceM;
    total.durationS += a.durationS;
    total.count += 1;
  }
  return periods.map((p) => byStart.get(p) as Total);
}

export function dailyTotals(
  activities: TotalsInput[],
  timeZone: string,
  now: Date,
  days: number,
): Total[] {
  return totalsBy(activities, timeZone, now, days, (d) => d, addDays);
}

export function weeklyTotals(
  activities: TotalsInput[],
  timeZone: string,
  now: Date,
  weeks: number,
): Total[] {
  return totalsBy(activities, timeZone, now, weeks, weekStart, (w, n) =>
    addDays(w, n * 7),
  );
}

export function monthlyTotals(
  activities: TotalsInput[],
  timeZone: string,
  now: Date,
  months: number,
): Total[] {
  return totalsBy(activities, timeZone, now, months, monthStart, addMonths);
}
