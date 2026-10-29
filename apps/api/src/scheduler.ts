import { Cron } from 'croner';
import type { Db } from '@openrun/db';
import {
  activeClubIds,
  sendCoffeeNudges,
  sendRunReminders,
} from './clubs/notices.js';
import { ensureUpcomingRuns } from './clubs/runs.js';
import { refreshWeather } from './clubs/weather.js';
import type { Config } from './config.js';
import { syncAll } from './integrations/sync.js';
import type { Notifier } from './push.js';

/**
 * Background jobs, run inside the server: reminders and coffee nudges every
 * minute, weather every half hour (each run's forecast refreshes every few
 * hours), intervals.icu sync every half hour, and runs created eight weeks
 * ahead every night.
 */
export function startScheduler({
  db,
  notifier,
  config,
}: {
  db: Db;
  notifier: Notifier;
  config: Config;
}) {
  const safely = (name: string, job: () => unknown) => async () => {
    try {
      await job();
    } catch (e) {
      console.error(`Scheduled job "${name}" failed:`, e);
    }
  };
  const runsAhead = safely('runs ahead', () => {
    for (const clubId of activeClubIds(db)) ensureUpcomingRuns(db, clubId);
  });
  const weather = safely('weather', () =>
    config.weatherUrl ? refreshWeather(db, config.weatherUrl) : undefined,
  );
  const sync = safely('intervals.icu sync', () => syncAll(db, config));
  const jobs = [
    new Cron(
      '* * * * *',
      { protect: true },
      safely('notifications', () => {
        sendRunReminders(db, notifier);
        sendCoffeeNudges(db, notifier);
      }),
    ),
    new Cron('*/30 * * * *', { protect: true }, weather),
    new Cron('15 3 * * *', { protect: true }, runsAhead),
    // Off the half hour, away from the weather job.
    new Cron('10,40 * * * *', { protect: true }, sync),
  ];
  // Catch up after a restart, without delaying start-up.
  const startup = setTimeout(() => {
    void runsAhead().then(weather).then(sync);
  }, 5_000);
  return {
    stop() {
      clearTimeout(startup);
      for (const job of jobs) job.stop();
    },
  };
}
