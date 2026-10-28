import {
  describeRule,
  formatRule,
  occurrences,
  parseRule,
  zonedTime,
} from './schedule.js';

describe('rules', () => {
  it('parses and formats weekly rules', () => {
    expect(parseRule('FREQ=WEEKLY;BYDAY=SA')).toEqual({
      interval: 1,
      days: ['SA'],
    });
    expect(parseRule('RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TH,TU')).toEqual({
      interval: 2,
      days: ['TU', 'TH'],
    });
    expect(parseRule('FREQ=DAILY')).toBeNull();
    expect(parseRule('FREQ=WEEKLY;BYDAY=XX')).toBeNull();
    expect(parseRule('FREQ=WEEKLY;INTERVAL=0;BYDAY=MO')).toBeNull();
    expect(formatRule({ interval: 2, days: ['TH', 'TU'] })).toBe(
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH',
    );
    expect(describeRule({ interval: 1, days: ['SA'] })).toBe('Every Saturday');
    expect(describeRule({ interval: 2, days: ['TU', 'TH', 'SU'] })).toBe(
      'Every 2 weeks on Tuesday, Thursday and Sunday',
    );
  });
});

describe('zonedTime', () => {
  it('converts wall-clock time in a time zone to an instant', () => {
    // BST (UTC+1) before the clocks go back on 25 October 2026, GMT after.
    expect(
      zonedTime('2026-10-24', '08:00', 'Europe/London').toISOString(),
    ).toBe('2026-10-24T07:00:00.000Z');
    expect(
      zonedTime('2026-10-31', '08:00', 'Europe/London').toISOString(),
    ).toBe('2026-10-31T08:00:00.000Z');
    expect(
      zonedTime('2026-10-24', '18:30', 'America/New_York').toISOString(),
    ).toBe('2026-10-24T22:30:00.000Z');
    // 01:30 happens twice on 25 October 2026 in London; the first is BST.
    expect(
      zonedTime('2026-10-25', '01:30', 'Europe/London').toISOString(),
    ).toBe('2026-10-25T00:30:00.000Z');
    // 01:30 doesn't exist on 29 March 2026 in London; it moves to 02:30 BST.
    expect(
      zonedTime('2026-03-29', '01:30', 'Europe/London').toISOString(),
    ).toBe('2026-03-29T01:30:00.000Z');
  });
});

describe('occurrences', () => {
  const saturdays = {
    rule: { interval: 1, days: ['SA'] as const },
    anchor: '2026-10-01',
    time: '08:00',
    timeZone: 'Europe/London',
  };

  it('keeps the local time across a clock change', () => {
    const runs = occurrences(
      { ...saturdays, rule: { interval: 1, days: ['SA'] } },
      new Date('2026-10-17T00:00:00Z'),
      new Date('2026-11-08T00:00:00Z'),
    );
    expect(runs.map((d) => d.toISOString())).toEqual([
      '2026-10-17T07:00:00.000Z',
      '2026-10-24T07:00:00.000Z',
      '2026-10-31T08:00:00.000Z',
      '2026-11-07T08:00:00.000Z',
    ]);
  });

  it('skips weeks and respects the first day', () => {
    // Every 2 weeks on Tue and Thu, starting Thursday 1 October 2026.
    const runs = occurrences(
      {
        rule: { interval: 2, days: ['TU', 'TH'] },
        anchor: '2026-10-01',
        time: '18:30',
        timeZone: 'UTC',
      },
      new Date('2026-09-01T00:00:00Z'),
      new Date('2026-10-31T00:00:00Z'),
    );
    expect(runs.map((d) => d.toISOString().slice(0, 10))).toEqual([
      // Tuesday 29 September is in the anchor week but before the anchor.
      '2026-10-01',
      '2026-10-13',
      '2026-10-15',
      '2026-10-27',
      '2026-10-29',
    ]);
  });

  it('leaves out a run that has already started', () => {
    const runs = occurrences(
      { ...saturdays, rule: { interval: 1, days: ['SA'] } },
      new Date('2026-10-17T07:30:00Z'),
      new Date('2026-10-25T00:00:00Z'),
    );
    expect(runs.map((d) => d.toISOString())).toEqual([
      '2026-10-24T07:00:00.000Z',
    ]);
  });
});
