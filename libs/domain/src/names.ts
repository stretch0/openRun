const SPORT_NAMES: Record<string, string> = {
  run: 'Run',
  trail_run: 'Trail Run',
  treadmill: 'Treadmill Run',
  track: 'Track Run',
  walk: 'Walk',
};

/** A name like "Morning Run" from the local start time, for unnamed imports. */
export function defaultActivityName(
  startedAt: Date,
  timeZone: string,
  sport: string,
): string {
  let hour: number;
  try {
    hour = Number(
      new Intl.DateTimeFormat('en-GB', {
        hour: 'numeric',
        hourCycle: 'h23',
        timeZone,
      }).format(startedAt),
    );
  } catch {
    hour = startedAt.getUTCHours();
  }
  return `${partOfDay(hour)} ${SPORT_NAMES[sport] ?? 'Activity'}`;
}

function partOfDay(hour: number) {
  if (hour < 5) return 'Night';
  if (hour < 12) return 'Morning';
  if (hour < 14) return 'Lunch';
  if (hour < 18) return 'Afternoon';
  if (hour < 22) return 'Evening';
  return 'Night';
}
