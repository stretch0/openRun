import { addDays, localDate, monthStart, weekStart } from './totals.js';

// Club highlights celebrate turning up, never speed. Saying you're going to
// a run that went ahead counts as being there.

/** Someone going to a club run that has happened. */
export type Attendance = {
  userId: string;
  name: string;
  startsAt: Date;
  /** It rained (or drizzled, or stormed) at the start. */
  rainy: boolean;
};

export type SharedDistance = { startedAt: Date; distanceM: number };

/** Run counts worth celebrating. */
export const MILESTONES = [1, 10, 25, 50, 100, 200, 300, 500];

/** How long a moment stays on the highlights card. */
const RECENT_DAYS = 30;

export type Highlights = {
  thisMonth: {
    /** People turning up, counted once per run. */
    turnout: number;
    runs: number;
    /** Kilometres from runs members shared with the club. */
    sharedDistanceM: number;
  };
  /** Weeks in a row someone has come, if two or more. Listed by name. */
  streaks: { userId: string; name: string; weeks: number }[];
  /** Recent milestones and rainy runs, newest first. */
  moments: { userId: string; name: string; text: string; at: Date }[];
};

function ordinal(n: number) {
  const tens = n % 100;
  const suffix =
    tens >= 11 && tens <= 13
      ? 'th'
      : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ??
        'th');
  return `${n}${suffix}`;
}

/**
 * Turnout and shared distance for the club this month, plus streaks and
 * moments for the people in `opted` (members who chose to appear).
 */
export function clubHighlights(
  attendances: Attendance[],
  shares: SharedDistance[],
  opted: Set<string>,
  timeZone: string,
  now = new Date(),
): Highlights {
  const day = (d: Date) => localDate(d, timeZone);
  const month = monthStart(day(now));
  const inMonth = (d: Date) => monthStart(day(d)) === month;
  const past = attendances
    .filter((a) => a.startsAt <= now)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const monthly = past.filter((a) => inMonth(a.startsAt));
  const thisMonth = {
    turnout: monthly.length,
    runs: new Set(monthly.map((a) => a.startsAt.getTime())).size,
    sharedDistanceM: shares
      .filter((s) => s.startedAt <= now && inMonth(s.startedAt))
      .reduce((sum, s) => sum + s.distanceM, 0),
  };

  const byPerson = new Map<string, Attendance[]>();
  for (const a of past) {
    if (!opted.has(a.userId)) continue;
    byPerson.set(a.userId, [...(byPerson.get(a.userId) ?? []), a]);
  }

  const thisWeek = weekStart(day(now));
  const streaks: Highlights['streaks'] = [];
  const moments: Highlights['moments'] = [];
  const recentSince = now.getTime() - RECENT_DAYS * 86_400_000;

  for (const [userId, runs] of byPerson) {
    const name = runs[0].name;
    // A streak still counts if this week's run hasn't happened yet.
    const weeks = new Set(runs.map((r) => weekStart(day(r.startsAt))));
    let week = weeks.has(thisWeek) ? thisWeek : addDays(thisWeek, -7);
    let count = 0;
    while (weeks.has(week)) {
      count++;
      week = addDays(week, -7);
    }
    if (count >= 2) streaks.push({ userId, name, weeks: count });

    runs.forEach((run, i) => {
      if (run.startsAt.getTime() < recentSince) return;
      const nth = i + 1;
      if (MILESTONES.includes(nth)) {
        moments.push({
          userId,
          name,
          text:
            nth === 1
              ? 'First run with the club'
              : `${ordinal(nth)} run with the club`,
          at: run.startsAt,
        });
      }
      if (run.rainy) {
        moments.push({
          userId,
          name,
          text: 'Ran in the rain',
          at: run.startsAt,
        });
      }
    });
  }

  return {
    thisMonth,
    streaks: streaks.sort((a, b) => a.name.localeCompare(b.name)),
    moments: moments
      .sort(
        (a, b) =>
          b.at.getTime() - a.at.getTime() || a.name.localeCompare(b.name),
      )
      .slice(0, 12),
  };
}
