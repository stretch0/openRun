import {
  formatDistance,
  formatDuration,
  formatPace,
  paceSeconds,
} from './units.js';

describe('units', () => {
  it('formats durations', () => {
    expect(formatDuration(59)).toBe('0:59');
    expect(formatDuration(1530)).toBe('25:30');
    expect(formatDuration(3723)).toBe('1:02:03');
  });

  it('calculates pace per km and per mile', () => {
    expect(paceSeconds(5000, 1500, 'metric')).toBe(300);
    expect(formatPace(5000, 1500, 'metric')).toBe('5:00 /km');
    expect(formatPace(1609.344, 480, 'imperial')).toBe('8:00 /mi');
    expect(formatPace(0, 100, 'metric')).toBe('–');
  });

  it('formats distances', () => {
    expect(formatDistance(10000, 'metric')).toBe('10.00 km');
    expect(formatDistance(1609.344, 'imperial')).toBe('1.00 mi');
  });
});
