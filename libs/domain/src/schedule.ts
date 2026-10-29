import { addDays, localDate, weekStart } from './totals.js';

/**
 * Repeating club runs. Rules are stored as a small subset of iCalendar
 * RRULE, "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH", so they can be exported or
 * extended later, but only weekly rules are supported for now.
 */

export const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export type WeeklyRule = {
  /** Every `interval` weeks. */
  interval: number;
  days: Weekday[];
};

export function parseRule(rrule: string): WeeklyRule | null {
  const parts = Object.fromEntries(
    rrule
      .replace(/^RRULE:/i, '')
      .split(';')
      .map((p) => p.split('=') as [string, string]),
  );
  if (parts['FREQ'] !== 'WEEKLY') return null;
  const interval = parts['INTERVAL'] ? Number(parts['INTERVAL']) : 1;
  if (!Number.isInteger(interval) || interval < 1 || interval > 52) return null;
  const days = (parts['BYDAY'] ?? '').split(',').filter(Boolean);
  if (!days.length || days.some((d) => !WEEKDAYS.includes(d as Weekday))) {
    return null;
  }
  // Keep them in week order and without repeats.
  return {
    interval,
    days: WEEKDAYS.filter((d) => days.includes(d)),
  };
}

export function formatRule(rule: WeeklyRule): string {
  return [
    'FREQ=WEEKLY',
    ...(rule.interval > 1 ? [`INTERVAL=${rule.interval}`] : []),
    `BYDAY=${WEEKDAYS.filter((d) => rule.days.includes(d)).join(',')}`,
  ].join(';');
}

const DAY_NAMES: Record<Weekday, string> = {
  MO: 'Monday',
  TU: 'Tuesday',
  WE: 'Wednesday',
  TH: 'Thursday',
  FR: 'Friday',
  SA: 'Saturday',
  SU: 'Sunday',
};

/** "Every Saturday", "Every 2 weeks on Tuesday and Thursday". */
export function describeRule(rule: WeeklyRule): string {
  const names = rule.days.map((d) => DAY_NAMES[d]);
  const days =
    names.length > 1
      ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
      : names[0];
  return rule.interval === 1
    ? `Every ${days}`
    : `Every ${rule.interval} weeks on ${days}`;
}

/** Minutes that `timeZone` is ahead of UTC at `instant`. */
function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/**
 * The instant a wall-clock time happens in a time zone, e.g. 08:00 on
 * 2026-10-25 in Europe/London. A time skipped by the clocks going forward
 * moves forward an hour; a repeated time uses its first occurrence.
 */
export function zonedTime(day: string, time: string, timeZone: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  const DAY = 86_400_000;
  // The offsets a day either side; at most one clock change lies between.
  const before = offsetMinutes(new Date(wall - DAY), timeZone) * 60_000;
  const after = offsetMinutes(new Date(wall + DAY), timeZone) * 60_000;
  const shows = (t: number) =>
    t + offsetMinutes(new Date(t), timeZone) * 60_000 === wall;
  const valid = [wall - before, wall - after].filter(shows);
  // A repeated time (clocks go back) has two; use the first. A skipped
  // time (clocks go forward) has none; keep the old offset, which lands an
  // hour later on the clock.
  return new Date(valid.length ? Math.min(...valid) : wall - before);
}

/** Monday = 0 … Sunday = 6 for a YYYY-MM-DD date. */
function weekdayIndex(day: string) {
  return (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/**
 * Start times of a weekly series between `from` and `until`. Weeks are
 * counted from the week containing `anchor` (YYYY-MM-DD), which is also the
 * first day the series can run.
 */
export function occurrences(
  {
    rule,
    anchor,
    time,
    timeZone,
  }: { rule: WeeklyRule; anchor: string; time: string; timeZone: string },
  from: Date,
  until: Date,
): Date[] {
  const anchorMonday = weekStart(anchor);
  const startDay = localDate(from, timeZone);
  const firstDay = startDay > anchor ? addDays(startDay, -1) : anchor;
  const out: Date[] = [];
  for (let day = firstDay; ; day = addDays(day, 1)) {
    const at = zonedTime(day, time, timeZone);
    if (at > until) break;
    if (day < anchor || at < from) continue;
    const weeks =
      (Date.parse(weekStart(day)) - Date.parse(anchorMonday)) /
      (7 * 86_400_000);
    const inWeek = weeks % rule.interval === 0;
    if (inWeek && rule.days.includes(WEEKDAYS[weekdayIndex(day)])) {
      out.push(at);
    }
  }
  return out;
}
