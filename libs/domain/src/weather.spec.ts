import {
  describeWeather,
  forecastAt,
  formatTemperature,
  formatWind,
} from './weather.js';

const hourly = {
  time: ['2026-10-31T07:00', '2026-10-31T08:00', '2026-10-31T09:00'],
  weather_code: [3, 61, 2],
  temperature_2m: [9.4, 10.2, 11],
  precipitation_probability: [20, 65, null],
  wind_speed_10m: [12, 18.4, 20],
};

describe('weather', () => {
  it('picks the forecast hour nearest the start', () => {
    expect(forecastAt(hourly, new Date('2026-10-31T08:20:00Z'))).toEqual({
      code: 61,
      temperatureC: 10.2,
      precipitationChance: 65,
      windKmh: 18.4,
    });
    expect(forecastAt(hourly, new Date('2026-10-31T09:40:00Z'))).toMatchObject({
      code: 2,
      precipitationChance: 0,
    });
  });

  it('has nothing for runs beyond the forecast', () => {
    expect(forecastAt(hourly, new Date('2026-11-02T08:00:00Z'))).toBeNull();
    expect(
      forecastAt(
        { ...hourly, temperature_2m: [null, null, null] },
        new Date('2026-10-31T08:00:00Z'),
      ),
    ).toBeNull();
  });

  it('describes codes and formats units', () => {
    expect(describeWeather(0)).toEqual({ kind: 'clear', label: 'Clear' });
    expect(describeWeather(81).kind).toBe('rain');
    expect(describeWeather(1234).label).toBe('Unknown');
    expect(formatTemperature(10.2, 'metric')).toBe('10°C');
    expect(formatTemperature(10.2, 'imperial')).toBe('50°F');
    expect(formatWind(18.4, 'metric')).toBe('18 km/h');
    expect(formatWind(18.4, 'imperial')).toBe('11 mph');
  });
});
