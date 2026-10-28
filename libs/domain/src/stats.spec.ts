import { toCsv } from './csv.js';
import {
  dailyTotals,
  localDate,
  monthlyTotals,
  weekStart,
  weeklyTotals,
} from './totals.js';
import { predictTime, vdot } from './vdot.js';

describe('vdot', () => {
  it("matches Daniels' tables", () => {
    // A 20:00 5k is about VDOT 49.8; a 3:10:49 marathon is VDOT 50.
    expect(vdot(5000, 20 * 60)).toBeCloseTo(49.8, 0);
    expect(vdot(42195, 3 * 3600 + 10 * 60 + 49)).toBeCloseTo(50, 0);
  });

  it('predicts times that round-trip', () => {
    const v = vdot(10000, 45 * 60);
    expect(predictTime(v, 10000)).toBeCloseTo(45 * 60, 0);
    // A 45:00 10k predicts a half of roughly 1:39–1:41.
    const half = predictTime(v, 21097);
    expect(half).toBeGreaterThan(99 * 60);
    expect(half).toBeLessThan(101 * 60);
  });
});

const run = (iso: string, km: number) => ({
  startedAt: new Date(iso),
  distanceM: km * 1000,
  durationS: km * 300,
});

describe('totals', () => {
  it('uses the local date', () => {
    const late = new Date('2026-10-04T23:30:00Z');
    expect(localDate(late, 'UTC')).toBe('2026-10-04');
    expect(localDate(late, 'Europe/London')).toBe('2026-10-05');
    expect(localDate(late, 'Nowhere/Invalid')).toBe('2026-10-04');
  });

  it('starts weeks on Monday', () => {
    expect(weekStart('2026-10-28')).toBe('2026-10-26'); // Wednesday
    expect(weekStart('2026-10-26')).toBe('2026-10-26'); // Monday
    expect(weekStart('2026-11-01')).toBe('2026-10-26'); // Sunday
  });

  it('totals by week, including empty weeks', () => {
    const now = new Date('2026-10-28T12:00:00Z');
    const weeks = weeklyTotals(
      [
        run('2026-10-27T07:00:00Z', 5),
        run('2026-10-26T07:00:00Z', 10),
        run('2026-10-14T07:00:00Z', 8),
        run('2026-01-01T07:00:00Z', 30), // too old
      ],
      'UTC',
      now,
      3,
    );
    expect(weeks).toEqual([
      { start: '2026-10-12', distanceM: 8000, durationS: 2400, count: 1 },
      { start: '2026-10-19', distanceM: 0, durationS: 0, count: 0 },
      { start: '2026-10-26', distanceM: 15000, durationS: 4500, count: 2 },
    ]);
  });

  it('totals by month and day', () => {
    const now = new Date('2026-10-28T12:00:00Z');
    const runs = [
      run('2026-09-30T07:00:00Z', 5),
      run('2026-10-28T06:00:00Z', 7),
    ];
    expect(monthlyTotals(runs, 'UTC', now, 2).map((m) => m.start)).toEqual([
      '2026-09-01',
      '2026-10-01',
    ]);
    expect(monthlyTotals(runs, 'UTC', now, 2).map((m) => m.distanceM)).toEqual([
      5000, 7000,
    ]);
    const days = dailyTotals(runs, 'UTC', now, 30);
    expect(days).toHaveLength(30);
    expect(days[0].start).toBe('2026-09-29');
    expect(days.at(-1)).toMatchObject({ start: '2026-10-28', distanceM: 7000 });
  });
});

describe('toCsv', () => {
  it('quotes and neutralises formulas', () => {
    expect(
      toCsv(
        ['name', 'km', 'notes'],
        [
          ['Hill, reps', 10, 'said "ouch"'],
          ['=HYPERLINK("x")', null, '-5 felt hard'],
        ],
      ),
    ).toBe(
      [
        'name,km,notes',
        '"Hill, reps",10,"said ""ouch"""',
        `"'=HYPERLINK(""x"")",,'-5 felt hard`,
      ].join('\r\n'),
    );
  });
});
