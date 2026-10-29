import { zonedTime } from './schedule.js';
import { addDays, localDate } from './totals.js';

/**
 * When to remind someone about a run they're going to. "auto" is the
 * default: the evening before for morning runs, otherwise two hours before.
 */
export const REMINDER_PREFS = ['auto', '1h', '2h', 'evening', 'off'] as const;
export type ReminderPref = (typeof REMINDER_PREFS)[number];

/** Runs starting before this local time count as morning runs. */
export const MORNING_ENDS = '10:00';
/** Evening reminders go out at this local time the day before. */
export const EVENING_REMINDER_AT = '19:00';

const HOUR_MS = 3_600_000;

/** HH:MM of `date` in `timeZone`. */
export function localTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

export function isMorningRun(startsAt: Date, timeZone: string): boolean {
  return localTime(startsAt, timeZone) < MORNING_ENDS;
}

/** When the reminder is due, or null if they don't want one. */
export function reminderTime(
  startsAt: Date,
  timeZone: string,
  pref: ReminderPref,
): Date | null {
  const choice =
    pref === 'auto'
      ? isMorningRun(startsAt, timeZone)
        ? 'evening'
        : '2h'
      : pref;
  switch (choice) {
    case 'off':
      return null;
    case '1h':
      return new Date(startsAt.getTime() - HOUR_MS);
    case '2h':
      return new Date(startsAt.getTime() - 2 * HOUR_MS);
    case 'evening': {
      const dayBefore = addDays(localDate(startsAt, timeZone), -1);
      return zonedTime(dayBefore, EVENING_REMINDER_AT, timeZone);
    }
  }
}

/** Coffee nudges go out this long before orders close. */
export const COFFEE_NUDGE_MS = 30 * 60_000;
