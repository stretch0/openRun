import {
  formatDistance,
  formatDuration,
  formatPace,
  metresFrom,
  paceSeconds,
  parseDuration,
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

  it('parses durations typed by hand', () => {
    expect(parseDuration('45')).toBe(2700);
    expect(parseDuration('25:30')).toBe(1530);
    expect(parseDuration(' 1:02:03 ')).toBe(3723);
    expect(parseDuration('1:75')).toBeNull();
    expect(parseDuration('abc')).toBeNull();
    expect(parseDuration('')).toBeNull();
  });

  it('converts distances to metres', () => {
    expect(metresFrom(5, 'metric')).toBe(5000);
    expect(metresFrom(1, 'imperial')).toBe(1609.344);
  });
});
