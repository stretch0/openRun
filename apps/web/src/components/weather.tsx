import {
  type WeatherKind,
  describeWeather,
  formatTemperature,
  formatWind,
} from '@openrun/domain';
import type { ClubRun } from '@openrun/schemas';
import { useMe } from '../lib/queries';

type Weather = NonNullable<ClubRun['weather']>;

const CLOUD = 'M17.5 19H9a7 7 0 116.7-9h1.8a4.5 4.5 0 110 9z';
const HIGH_CLOUD = 'M20 16.6A5 5 0 0018 7h-1.3A8 8 0 104 15.3';

const ICONS: Record<WeatherKind, string> = {
  clear:
    'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  'partly-cloudy': `M12 2v2M4.9 4.9l1.4 1.4M20 12h2M19.1 4.9l-1.4 1.4M15.9 13.1A4 4 0 008 9.8M13 22H7a5 5 0 114.9-6H13a3 3 0 010 6z`,
  cloudy: CLOUD,
  fog: 'M4 14h16M4 18h12M6 10h14',
  drizzle: `${HIGH_CLOUD}M8 19v1M8 14v1M16 19v1M16 14v1M12 21v1M12 16v1`,
  rain: `${HIGH_CLOUD}M16 14v6M8 14v6M12 16v6`,
  snow: `${HIGH_CLOUD}M8 15h.01M8 19h.01M12 17h.01M12 21h.01M16 15h.01M16 19h.01`,
  storm: `${HIGH_CLOUD}M13 11l-4 6h6l-4 6`,
};

export function WeatherIcon({ kind }: { kind: WeatherKind }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={ICONS[kind]} />
    </svg>
  );
}

/** A short forecast for run cards: icon, temperature, and rain if likely. */
export function WeatherBrief({ weather }: { weather: Weather }) {
  const { data: me } = useMe();
  const units = me?.units ?? 'metric';
  const { kind, label } = describeWeather(weather.code);
  return (
    <span className="inline-flex items-center gap-1" title={label}>
      <WeatherIcon kind={kind} />
      <span className="sr-only">{label}, </span>
      {formatTemperature(weather.temperatureC, units)}
      {weather.precipitationChance >= 20 &&
        ` · ${Math.round(weather.precipitationChance)}% rain`}
    </span>
  );
}

/** The full forecast for the run page. */
export function WeatherDetail({ weather }: { weather: Weather }) {
  const { data: me } = useMe();
  const units = me?.units ?? 'metric';
  const { kind, label } = describeWeather(weather.code);
  return (
    <p className="flex items-center gap-1.5">
      <WeatherIcon kind={kind} />
      <span>
        {[
          label,
          formatTemperature(weather.temperatureC, units),
          `${Math.round(weather.precipitationChance)}% chance of rain`,
          `wind ${formatWind(weather.windKmh, units)}`,
        ].join(', ')}
      </span>
    </p>
  );
}
