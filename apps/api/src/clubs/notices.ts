import { and, eq, gt, inArray, isNull, lte } from 'drizzle-orm';
import { type Db, schema } from '@openrun/db';
import {
  COFFEE_NUDGE_MS,
  type RunWeather,
  describeWeather,
  formatTemperature,
  localDate,
  localTime,
  ordersCloseAt,
  reminderTime,
} from '@openrun/domain';
import type { NotificationSettings } from '@openrun/schemas';
import type { Notification, Notifier } from '../push.js';
import { getNotificationSettings } from '../routes/notifications.js';

// What clubs tell members, and when. Every notice respects the member's
// notification settings and whether they muted the club.

type ClubRow = typeof schema.club.$inferSelect;
type RunRow = typeof schema.clubRun.$inferSelect;
type Units = 'metric' | 'imperial';

const HOUR_MS = 3_600_000;

/** Sends without waiting; a failed notification never fails the request. */
export function send(
  notifier: Notifier,
  userIds: string[],
  notification: Notification,
  key?: string,
) {
  if (!userIds.length) return;
  notifier.notify(userIds, notification, key).catch((e: unknown) => {
    console.error('Sending a notification failed:', e);
  });
}

/** Of `userIds`, the active, unmuted members who want this kind of notice. */
export function recipients(
  db: Db,
  clubId: string,
  userIds: string[],
  wants: keyof Omit<NotificationSettings, 'runReminder'>,
) {
  return activeUnmuted(db, clubId, userIds).filter(
    (id) => getNotificationSettings(db, id)[wants],
  );
}

/** "Sat 31 Oct, 08:00" in the club's time zone. */
export function runWhen(startsAt: Date, timeZone: string) {
  return startsAt.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  });
}

/** "Today at 18:30", "Tomorrow at 08:00" or "Sat 31 Oct, 08:00". */
function relativeWhen(startsAt: Date, timeZone: string, now: Date) {
  const day = localDate(startsAt, timeZone);
  const today = localDate(now, timeZone);
  const tomorrow = localDate(new Date(now.getTime() + 24 * HOUR_MS), timeZone);
  const time = localTime(startsAt, timeZone);
  if (day === today) return `Today at ${time}`;
  if (day === tomorrow) return `Tomorrow at ${time}`;
  return runWhen(startsAt, timeZone);
}

export function describeForecast(weather: RunWeather, units: Units) {
  const parts = [
    describeWeather(weather.code).label,
    formatTemperature(weather.temperatureC, units),
  ];
  if (weather.precipitationChance >= 20) {
    parts.push(`${Math.round(weather.precipitationChance)}% chance of rain`);
  }
  return parts.join(', ');
}

const runUrl = (run: RunRow) => `/clubs/${run.clubId}/runs/${run.id}`;

function clubOf(db: Db, clubId: string) {
  return db.select().from(schema.club).where(eq(schema.club.id, clubId)).get();
}

function locationName(db: Db, id: string | null) {
  if (!id) return null;
  return (
    db
      .select({ name: schema.clubLocation.name })
      .from(schema.clubLocation)
      .where(eq(schema.clubLocation.id, id))
      .get()?.name ?? null
  );
}

/** Scheduled runs starting after `now` and before `until`. */
function upcomingRuns(db: Db, now: Date, until: Date) {
  return db
    .select()
    .from(schema.clubRun)
    .where(
      and(
        eq(schema.clubRun.status, 'scheduled'),
        gt(schema.clubRun.startsAt, now),
        lte(schema.clubRun.startsAt, until),
      ),
    )
    .all();
}

/** People going to a run, with when they said so and their units. */
function goingTo(db: Db, runId: string) {
  return db
    .select({
      userId: schema.rsvp.userId,
      since: schema.rsvp.updatedAt,
      units: schema.user.units,
    })
    .from(schema.rsvp)
    .innerJoin(schema.user, eq(schema.user.id, schema.rsvp.userId))
    .where(
      and(eq(schema.rsvp.clubRunId, runId), eq(schema.rsvp.status, 'going')),
    )
    .all();
}

/**
 * Reminds people about runs they're going to, at the time they chose
 * (by default the evening before a morning run, otherwise two hours before).
 * Someone who said they're going after their reminder time isn't reminded.
 */
export function sendRunReminders(db: Db, notifier: Notifier, now = new Date()) {
  // An "evening before" reminder can come up to ~29 hours ahead.
  for (const run of upcomingRuns(
    db,
    now,
    new Date(now.getTime() + 30 * HOUR_MS),
  )) {
    const club = clubOf(db, run.clubId);
    if (!club) continue;
    const going = goingTo(db, run.id);
    const active = new Set(
      activeUnmuted(
        db,
        club.id,
        going.map((g) => g.userId),
      ),
    );
    for (const person of going) {
      if (!active.has(person.userId)) continue;
      const pref = getNotificationSettings(db, person.userId).runReminder;
      const at = reminderTime(run.startsAt, club.timezone, pref);
      if (!at || at > now || person.since > at) continue;
      send(
        notifier,
        [person.userId],
        reminder(db, club, run, person.units as Units, now),
        `reminder:${run.id}`,
      );
    }
  }
}

function activeUnmuted(db: Db, clubId: string, userIds: string[]) {
  if (!userIds.length) return [];
  return db
    .select({ userId: schema.clubMember.userId })
    .from(schema.clubMember)
    .where(
      and(
        eq(schema.clubMember.clubId, clubId),
        inArray(schema.clubMember.userId, userIds),
        eq(schema.clubMember.status, 'active'),
        eq(schema.clubMember.muted, false),
      ),
    )
    .all()
    .map((m) => m.userId);
}

function reminder(
  db: Db,
  club: ClubRow,
  run: RunRow,
  units: Units,
  now: Date,
): Notification {
  const where = locationName(db, run.locationId);
  const lines = [
    `${relativeWhen(run.startsAt, club.timezone, now)}${where ? ` at ${where}` : ''}.`,
  ];
  if (run.weather) lines.push(`${describeForecast(run.weather, units)}.`);
  return {
    title: `${run.title} · ${club.name}`,
    body: lines.join(' '),
    url: runUrl(run),
    tag: `run:${run.id}`,
  };
}

/** Nudges people going to a run who haven't ordered, before orders close. */
export function sendCoffeeNudges(db: Db, notifier: Notifier, now = new Date()) {
  // Orders close at most a day before the start.
  for (const run of upcomingRuns(
    db,
    now,
    new Date(now.getTime() + 25 * HOUR_MS),
  )) {
    const closes = ordersCloseAt(run.startsAt, run.orderCutoffMin);
    if (closes <= now || closes.getTime() - now.getTime() > COFFEE_NUDGE_MS) {
      continue;
    }
    const club = clubOf(db, run.clubId);
    const hasMenu = db
      .select({ id: schema.menuItem.id })
      .from(schema.menuItem)
      .where(
        and(
          eq(schema.menuItem.clubId, run.clubId),
          eq(schema.menuItem.hidden, false),
        ),
      )
      .limit(1)
      .get();
    if (!club || !hasMenu) continue;
    const ordered = new Set(
      db
        .select({ userId: schema.coffeeOrder.userId })
        .from(schema.coffeeOrder)
        .where(eq(schema.coffeeOrder.clubRunId, run.id))
        .all()
        .map((o) => o.userId),
    );
    const waiting = goingTo(db, run.id)
      .map((g) => g.userId)
      .filter((id) => !ordered.has(id));
    for (const userId of recipients(db, club.id, waiting, 'coffeeNudge')) {
      send(
        notifier,
        [userId],
        {
          title: `Coffee orders close at ${localTime(closes, club.timezone)}`,
          body: `Order for after ${run.title} with ${club.name}.`,
          url: runUrl(run),
          tag: `coffee:${run.id}`,
        },
        `coffee:${run.id}`,
      );
    }
  }
}

/** People who said going or maybe, except whoever made the change. */
function interested(db: Db, runId: string, except?: string) {
  return db
    .select({ userId: schema.rsvp.userId, status: schema.rsvp.status })
    .from(schema.rsvp)
    .where(eq(schema.rsvp.clubRunId, runId))
    .all()
    .filter((r) => r.status !== 'not_going' && r.userId !== except)
    .map((r) => r.userId);
}

export type RunChange =
  | { kind: 'cancelled'; reason: string | null }
  | { kind: 'moved'; from: Date }
  | { kind: 'removed'; seriesEnded: boolean };

/**
 * Tells people going (or maybe going) that a run was cancelled, moved or
 * taken off the schedule. Call before a removed run is deleted.
 */
export function noticeRunChange(
  db: Db,
  notifier: Notifier,
  club: ClubRow,
  run: RunRow,
  change: RunChange,
  actorId?: string,
) {
  const to = recipients(
    db,
    club.id,
    interested(db, run.id, actorId),
    'runChanges',
  );
  const when = runWhen(run.startsAt, club.timezone);
  const notification: Notification =
    change.kind === 'cancelled'
      ? {
          title: `Cancelled: ${run.title}`,
          body: [`${club.name}, ${when}.`, change.reason]
            .filter(Boolean)
            .join(' '),
          url: runUrl(run),
          tag: `run:${run.id}`,
        }
      : change.kind === 'moved'
        ? {
            title: `${run.title} has moved`,
            body: `${club.name}: now ${when} (was ${runWhen(change.from, club.timezone)}).`,
            url: runUrl(run),
            tag: `run:${run.id}`,
          }
        : {
            title: `${run.title} on ${when} is off`,
            body: change.seriesEnded
              ? `${club.name} has stopped ${run.title}.`
              : `${club.name} changed the schedule. Check the club and RSVP again.`,
            url: `/clubs/${run.clubId}`,
            tag: `run:${run.id}`,
          };
  send(notifier, to, notification);
}

/** Tells organisers someone is waiting to be let in. */
export function noticeJoinRequest(
  db: Db,
  notifier: Notifier,
  club: ClubRow,
  name: string,
) {
  const organisers = db
    .select({ userId: schema.clubMember.userId })
    .from(schema.clubMember)
    .where(
      and(
        eq(schema.clubMember.clubId, club.id),
        inArray(schema.clubMember.role, ['owner', 'organiser']),
      ),
    )
    .all()
    .map((m) => m.userId);
  send(notifier, recipients(db, club.id, organisers, 'joinRequests'), {
    title: `${name} asked to join ${club.name}`,
    body: 'Approve or turn down the request in Manage.',
    url: `/clubs/${club.id}/manage`,
    tag: `join:${club.id}`,
  });
}

/** Clubs with a running series, whose runs the scheduler keeps created ahead. */
export function activeClubIds(db: Db) {
  return db
    .selectDistinct({ clubId: schema.clubRunSeries.clubId })
    .from(schema.clubRunSeries)
    .where(isNull(schema.clubRunSeries.endedAt))
    .all()
    .map((s) => s.clubId);
}
