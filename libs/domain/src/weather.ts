/** The forecast for a run's start: what the run page and cards show. */
export type RunWeather = {
  /** WMO weather code, see describeWeather. */
  code: number;
  temperatureC: number;
  /** Chance of rain, 0–100. */
  precipitationChance: number;
  windKmh: number;
};

/** Open-Meteo's hourly forecast, requested with timezone=GMT. */
export type HourlyForecast = {
  time: string[];
  weather_code: (number | null)[];
  temperature_2m: (number | null)[];
  precipitation_probability: (number | null)[];
  wind_speed_10m: (number | null)[];
};

const HOUR_MS = 3_600_000;

/** The forecast hour nearest the start, if there's one within an hour. */
export function forecastAt(
  hourly: HourlyForecast,
  startsAt: Date,
): RunWeather | null {
  let best = -1;
  let bestGap = HOUR_MS;
  hourly.time.forEach((t, i) => {
    const gap = Math.abs(Date.parse(`${t}Z`) - startsAt.getTime());
    if (gap <= bestGap) {
      best = i;
      bestGap = gap;
    }
  });
  if (best < 0) return null;
  const code = hourly.weather_code[best];
  const temperatureC = hourly.temperature_2m[best];
  if (code == null || temperatureC == null) return null;
  return {
    code,
    temperatureC,
    precipitationChance: hourly.precipitation_probability[best] ?? 0,
    windKmh: hourly.wind_speed_10m[best] ?? 0,
  };
}

export type WeatherKind =
  | 'clear'
  | 'partly-cloudy'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'storm';

const KINDS: [codes: number[], kind: WeatherKind, label: string][] = [
  [[0], 'clear', 'Clear'],
  [[1, 2], 'partly-cloudy', 'Partly cloudy'],
  [[3], 'cloudy', 'Cloudy'],
  [[45, 48], 'fog', 'Fog'],
  [[51, 53, 55, 56, 57], 'drizzle', 'Drizzle'],
  [[61, 63, 65, 66, 67, 80, 81, 82], 'rain', 'Rain'],
  [[71, 73, 75, 77, 85, 86], 'snow', 'Snow'],
  [[95, 96, 99], 'storm', 'Thunderstorms'],
];

/** A WMO weather code as a kind (for an icon) and a label. */
export function describeWeather(code: number): {
  kind: WeatherKind;
  label: string;
} {
  const found = KINDS.find(([codes]) => codes.includes(code));
  return found
    ? { kind: found[1], label: found[2] }
    : { kind: 'cloudy', label: 'Unknown' };
}

export function formatTemperature(
  celsius: number,
  units: 'metric' | 'imperial',
): string {
  return units === 'metric'
    ? `${Math.round(celsius)}°C`
    : `${Math.round((celsius * 9) / 5 + 32)}°F`;
}

export function formatWind(kmh: number, units: 'metric' | 'imperial'): string {
  return units === 'metric'
    ? `${Math.round(kmh)} km/h`
    : `${Math.round(kmh / 1.609344)} mph`;
}
