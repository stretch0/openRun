import { isMorningRun, localTime, reminderTime } from './reminders.js';

const london = 'Europe/London';

describe('run reminders', () => {
  const saturday8am = new Date('2026-10-31T08:00:00Z'); // BST ended 25 Oct
  const wednesday630pm = new Date('2026-11-04T18:30:00Z');

  it('treats runs before 10:00 local time as morning runs', () => {
    expect(localTime(saturday8am, london)).toBe('08:00');
    expect(isMorningRun(saturday8am, london)).toBe(true);
    expect(isMorningRun(new Date('2026-11-04T10:00:00Z'), london)).toBe(false);
    // 08:00 UTC is 09:00 in Paris: still morning; 10:00 in Athens: not.
    expect(isMorningRun(saturday8am, 'Europe/Paris')).toBe(true);
    expect(isMorningRun(saturday8am, 'Europe/Athens')).toBe(false);
  });

  it('defaults to the evening before for morning runs, else two hours before', () => {
    expect(reminderTime(saturday8am, london, 'auto')?.toISOString()).toBe(
      '2026-10-30T19:00:00.000Z',
    );
    expect(reminderTime(wednesday630pm, london, 'auto')?.toISOString()).toBe(
      '2026-11-04T16:30:00.000Z',
    );
  });

  it('follows the choice someone made', () => {
    expect(reminderTime(saturday8am, london, '1h')?.toISOString()).toBe(
      '2026-10-31T07:00:00.000Z',
    );
    expect(reminderTime(saturday8am, london, '2h')?.toISOString()).toBe(
      '2026-10-31T06:00:00.000Z',
    );
    expect(reminderTime(wednesday630pm, london, 'evening')?.toISOString()).toBe(
      '2026-11-03T19:00:00.000Z',
    );
    expect(reminderTime(saturday8am, london, 'off')).toBeNull();
  });

  it('uses local evening time across a clock change', () => {
    // Sunday 25 Oct 2026, clocks go back at 02:00. The evening before is BST.
    expect(
      reminderTime(
        new Date('2026-10-25T08:00:00Z'),
        london,
        'evening',
      )?.toISOString(),
    ).toBe('2026-10-24T18:00:00.000Z');
  });
});
