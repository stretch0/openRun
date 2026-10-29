import { clubHighlights } from './highlights.js';

const tz = 'Europe/London';
// Saturdays at 08:00, going back from 28 Nov 2026.
const saturday = (weeksAgo: number) =>
  new Date(Date.UTC(2026, 10, 28 - 7 * weeksAgo, 8));
const now = new Date('2026-11-29T12:00:00Z'); // Sunday

const going = (userId: string, weeksAgo: number[], rainyWeek?: number) =>
  weeksAgo.map((w) => ({
    userId,
    name: userId.toUpperCase(),
    startsAt: saturday(w),
    rainy: w === rainyWeek,
  }));

describe('club highlights', () => {
  it('counts turnout and shared distance this month for everyone', () => {
    const h = clubHighlights(
      [...going('ann', [0, 1, 2, 3, 5]), ...going('bea', [0, 2])],
      [
        { startedAt: saturday(0), distanceM: 8000 },
        { startedAt: saturday(5), distanceM: 5000 }, // October
      ],
      new Set(),
      tz,
      now,
    );
    // November Saturdays: 7, 14, 21, 28.
    expect(h.thisMonth).toEqual({ turnout: 6, runs: 4, sharedDistanceM: 8000 });
    // Nobody opted in, so nobody is named.
    expect(h.streaks).toEqual([]);
    expect(h.moments).toEqual([]);
  });

  it('celebrates streaks, milestones and rain for people who opted in', () => {
    const tenRuns = [0, 1, 2, 3, 5, 6, 7, 8, 9, 10];
    const h = clubHighlights(
      [
        ...going('ann', tenRuns, 1),
        ...going('bea', [0]),
        ...going('cal', [1, 2]),
      ],
      [],
      new Set(['ann', 'bea', 'cal']),
      tz,
      now,
    );
    expect(h.streaks).toEqual([
      { userId: 'ann', name: 'ANN', weeks: 4 },
      { userId: 'cal', name: 'CAL', weeks: 2 },
    ]);
    expect(h.moments.map((m) => `${m.name}: ${m.text}`)).toEqual([
      'ANN: 10th run with the club',
      'BEA: First run with the club',
      'ANN: Ran in the rain',
      'CAL: First run with the club',
    ]);
  });

  it('keeps a streak going until a whole week is missed', () => {
    // Monday after a run on each of the last three Saturdays.
    const monday = new Date('2026-11-30T09:00:00Z');
    const h = clubHighlights(
      going('ann', [0, 1, 2]),
      [],
      new Set(['ann']),
      tz,
      monday,
    );
    expect(h.streaks[0].weeks).toBe(3);
    const later = new Date('2026-12-08T09:00:00Z');
    expect(
      clubHighlights(going('ann', [0, 1, 2]), [], new Set(['ann']), tz, later)
        .streaks,
    ).toEqual([]);
  });

  it('ignores runs that have not happened yet', () => {
    const h = clubHighlights(going('ann', [-1]), [], new Set(['ann']), tz, now);
    expect(h.thisMonth.turnout).toBe(0);
    expect(h.moments).toEqual([]);
  });
});
