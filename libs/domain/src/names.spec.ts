import { defaultActivityName } from './names.js';

describe('defaultActivityName', () => {
  it('names an activity from its local start time', () => {
    const at = new Date('2026-10-01T06:30:00Z');
    expect(defaultActivityName(at, 'Europe/London', 'run')).toBe('Morning Run');
    expect(defaultActivityName(at, 'America/New_York', 'walk')).toBe(
      'Night Walk',
    );
    // An unknown time zone falls back to UTC.
    expect(defaultActivityName(at, 'Not/AZone', 'trail_run')).toBe(
      'Morning Trail Run',
    );
  });
});
