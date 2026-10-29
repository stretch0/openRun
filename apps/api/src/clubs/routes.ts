import { zValidator } from '@hono/zod-validator';
import { and, asc, count, eq, gte, inArray, lt, ne, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { schema } from '@openrun/db';
import {
  clubHighlights,
  describeRule,
  describeWeather,
  formatRule,
  parseRule,
} from '@openrun/domain';
import {
  type Attendee,
  type Club,
  type ClubLocation,
  type ClubHighlights,
  type ClubPreview,
  type ClubRun,
  type ClubRunDetail,
  type ClubSummary,
  type Member,
  type Series,
  createClubRunSchema,
  createClubSchema,
  createLocationSchema,
  createSeriesSchema,
  joinClubSchema,
  rsvpInputSchema,
  updateClubRunSchema,
  updateClubSchema,
  updateMemberSchema,
  updateMyMembershipSchema,
  updateSeriesSchema,
} from '@openrun/schemas';
import { type AuthedEnv, requireUser } from '../context.js';
import {
  type Membership,
  canManage,
  getMembership,
  isActive,
  newJoinCode,
  outranks,
} from './access.js';
import {
  addUsualIfWanted,
  coffeeRoutes,
  getUsual,
  listMenu,
  removeMemberCoffee,
  removeOrder,
  runCoffee,
} from './coffee.js';
import {
  type Ctx,
  findClub,
  findRun,
  forbidden,
  me,
  notFound,
} from './helpers.js';
import { noticeJoinRequest, noticeRunChange } from './notices.js';
import { ensureUpcomingRuns, syncFutureRuns } from './runs.js';
import { listShares } from './shares.js';

type ClubRow = typeof schema.club.$inferSelect;
type RunRow = typeof schema.clubRun.$inferSelect;

/** Runs that started up to this long ago still show as upcoming. */
const STILL_ON_MS = 3 * 60 * 60 * 1000;

function memberCount(c: Ctx, clubId: string) {
  return (
    c
      .get('db')
      .select({ n: count() })
      .from(schema.clubMember)
      .where(
        and(
          eq(schema.clubMember.clubId, clubId),
          eq(schema.clubMember.status, 'active'),
        ),
      )
      .get()?.n ?? 0
  );
}

function nextRun(c: Ctx, clubId: string) {
  const run = c
    .get('db')
    .select()
    .from(schema.clubRun)
    .where(
      and(
        eq(schema.clubRun.clubId, clubId),
        eq(schema.clubRun.status, 'scheduled'),
        gte(schema.clubRun.startsAt, new Date(Date.now() - STILL_ON_MS)),
      ),
    )
    .orderBy(asc(schema.clubRun.startsAt))
    .limit(1)
    .get();
  return run
    ? { id: run.id, title: run.title, startsAt: run.startsAt.toISOString() }
    : null;
}

function toSummary(c: Ctx, club: ClubRow, m: Membership): ClubSummary {
  return {
    id: club.id,
    name: club.name,
    description: club.description,
    timezone: club.timezone,
    role: m.role,
    status: m.status,
    shareLevel: m.shareLevel,
    muted: m.muted,
    highlights: m.highlights,
    memberCount: memberCount(c, club.id),
    nextRun: isActive(m) ? nextRun(c, club.id) : null,
  };
}

function toLocation(l: typeof schema.clubLocation.$inferSelect): ClubLocation {
  return { id: l.id, name: l.name, lat: l.lat, lng: l.lng, notes: l.notes };
}

function toSeries(s: typeof schema.clubRunSeries.$inferSelect): Series {
  const rule = parseRule(s.rrule) ?? { interval: 1, days: [] };
  return {
    id: s.id,
    title: s.title,
    days: rule.days,
    interval: rule.interval,
    summary: rule.days.length ? describeRule(rule) : '',
    startsOn: s.startsOn,
    startTime: s.startTime,
    locationId: s.locationId,
    notes: s.notes,
    orderCutoffMin: s.orderCutoffMin,
    ended: s.endedAt !== null,
  };
}

function toClub(c: Ctx, club: ClubRow, m: Membership): Club {
  const db = c.get('db');
  const manage = canManage(m);
  const members: Member[] = db
    .select({
      userId: schema.clubMember.userId,
      name: schema.user.name,
      role: schema.clubMember.role,
      status: schema.clubMember.status,
    })
    .from(schema.clubMember)
    .innerJoin(schema.user, eq(schema.user.id, schema.clubMember.userId))
    .where(
      and(
        eq(schema.clubMember.clubId, club.id),
        manage ? undefined : eq(schema.clubMember.status, 'active'),
      ),
    )
    .orderBy(asc(schema.user.name))
    .all();
  return {
    ...toSummary(c, club, m),
    requireApproval: club.requireApproval,
    joinCode: manage ? club.joinCode : null,
    locations: db
      .select()
      .from(schema.clubLocation)
      .where(eq(schema.clubLocation.clubId, club.id))
      .orderBy(asc(schema.clubLocation.name))
      .all()
      .map(toLocation),
    series: db
      .select()
      .from(schema.clubRunSeries)
      .where(eq(schema.clubRunSeries.clubId, club.id))
      .orderBy(asc(schema.clubRunSeries.title))
      .all()
      .map(toSeries),
    members,
    menu: listMenu(db, club.id, manage),
    myUsual: getUsual(db, club.id, m.userId),
  };
}

function toRuns(c: Ctx, runs: RunRow[]): ClubRun[] {
  if (!runs.length) return [];
  const db = c.get('db');
  const ids = runs.map((r) => r.id);
  const rsvps = db
    .select()
    .from(schema.rsvp)
    .where(inArray(schema.rsvp.clubRunId, ids))
    .all();
  const locationIds = [
    ...new Set(runs.map((r) => r.locationId).filter((id) => id !== null)),
  ];
  const locations = new Map(
    (locationIds.length
      ? db
          .select()
          .from(schema.clubLocation)
          .where(inArray(schema.clubLocation.id, locationIds))
          .all()
      : []
    ).map((l) => [l.id, toLocation(l)]),
  );
  const userId = c.get('user').id;
  return runs.map((run) => {
    const mine = rsvps.find(
      (r) => r.clubRunId === run.id && r.userId === userId,
    );
    const forRun = rsvps.filter((r) => r.clubRunId === run.id);
    const tally = (status: string) =>
      forRun.filter((r) => r.status === status).length;
    return {
      id: run.id,
      clubId: run.clubId,
      seriesId: run.seriesId,
      title: run.title,
      startsAt: run.startsAt.toISOString(),
      location: run.locationId ? (locations.get(run.locationId) ?? null) : null,
      notes: run.notes,
      status: run.status,
      cancelledReason: run.cancelledReason,
      going: tally('going'),
      maybe: tally('maybe'),
      myRsvp: mine ? { status: mine.status } : null,
      weather: run.weather ?? null,
    };
  });
}

function toRunDetail(
  c: Ctx,
  club: ClubRow,
  run: RunRow,
  m: Membership,
): ClubRunDetail {
  const attendees: Attendee[] = c
    .get('db')
    .select({
      userId: schema.rsvp.userId,
      name: schema.user.name,
      status: schema.rsvp.status,
    })
    .from(schema.rsvp)
    .innerJoin(schema.user, eq(schema.user.id, schema.rsvp.userId))
    .where(
      and(
        eq(schema.rsvp.clubRunId, run.id),
        ne(schema.rsvp.status, 'not_going'),
      ),
    )
    .orderBy(asc(schema.user.name))
    .all()
    .map((a) => ({ ...a, status: a.status as Attendee['status'] }));
  return {
    ...toRuns(c, [run])[0],
    clubName: club.name,
    timezone: club.timezone,
    canManage: canManage(m),
    attendees,
    coffee: runCoffee(c.get('db'), run, m.userId),
    shares: listShares(c.get('db'), { runId: run.id }),
  };
}

/** The location id if it belongs to this club; undefined if it doesn't. */
function clubLocationId(c: Ctx, clubId: string, id: string | null | undefined) {
  if (!id) return null;
  const found = c
    .get('db')
    .select({ id: schema.clubLocation.id })
    .from(schema.clubLocation)
    .where(
      and(
        eq(schema.clubLocation.id, id),
        eq(schema.clubLocation.clubId, clubId),
      ),
    )
    .get();
  return found ? found.id : undefined;
}

export const clubRoutes = new Hono<AuthedEnv>()
  .use(requireUser)

  // ---- Clubs ----
  .get('/', (c) => {
    const db = c.get('db');
    const memberships = db
      .select()
      .from(schema.clubMember)
      .innerJoin(schema.club, eq(schema.club.id, schema.clubMember.clubId))
      .where(eq(schema.clubMember.userId, c.get('user').id))
      .orderBy(asc(schema.club.name))
      .all();
    for (const { club_member: m } of memberships) {
      if (isActive(m)) ensureUpcomingRuns(db, m.clubId);
    }
    return c.json(
      memberships.map(({ club, club_member: m }) => toSummary(c, club, m)),
    );
  })
  .post('/', zValidator('json', createClubSchema), (c) => {
    const db = c.get('db');
    const userId = c.get('user').id;
    const created = db.transaction((tx) => {
      const [club] = tx
        .insert(schema.club)
        .values({
          ...c.req.valid('json'),
          joinCode: newJoinCode(),
          createdBy: userId,
        })
        .returning()
        .all();
      const [m] = tx
        .insert(schema.clubMember)
        .values({ clubId: club.id, userId, role: 'owner' })
        .returning()
        .all();
      return { club, m };
    });
    return c.json(toClub(c, created.club, created.m), 201);
  })
  .get('/preview/:code', (c) => {
    const club = c
      .get('db')
      .select()
      .from(schema.club)
      .where(eq(schema.club.joinCode, c.req.param('code').toUpperCase()))
      .get();
    if (!club) return c.json({ error: 'That invite link has expired' }, 404);
    const preview: ClubPreview = {
      id: club.id,
      name: club.name,
      description: club.description,
      memberCount: memberCount(c, club.id),
      requireApproval: club.requireApproval,
      status: me(c, club.id)?.status ?? null,
    };
    return c.json(preview);
  })
  .post('/join', zValidator('json', joinClubSchema), (c) => {
    const db = c.get('db');
    const club = db
      .select()
      .from(schema.club)
      .where(eq(schema.club.joinCode, c.req.valid('json').code.toUpperCase()))
      .get();
    if (!club) return c.json({ error: 'That code doesn’t match a club' }, 404);
    const existing = me(c, club.id);
    if (existing) return c.json(toSummary(c, club, existing));
    const [m] = db
      .insert(schema.clubMember)
      .values({
        clubId: club.id,
        userId: c.get('user').id,
        status: club.requireApproval ? 'pending' : 'active',
      })
      .returning()
      .all();
    if (m.status === 'pending') {
      noticeJoinRequest(db, c.get('notifier'), club, c.get('user').name);
    }
    return c.json(toSummary(c, club, m), 201);
  })
  .get('/:id', (c) => {
    const club = findClub(c, c.req.param('id'));
    const m = club && me(c, club.id);
    if (!club || !m) return notFound(c);
    if (!isActive(m)) {
      return c.json({ error: 'Waiting for an organiser to approve you' }, 403);
    }
    ensureUpcomingRuns(c.get('db'), club.id);
    return c.json(toClub(c, club, m));
  })
  .patch('/:id', zValidator('json', updateClubSchema), (c) => {
    const club = findClub(c, c.req.param('id'));
    const m = club && me(c, club.id);
    if (!club || !m) return notFound(c);
    if (!canManage(m)) return forbidden(c);
    const [updated] = c
      .get('db')
      .update(schema.club)
      .set(c.req.valid('json'))
      .where(eq(schema.club.id, club.id))
      .returning()
      .all();
    return c.json(toClub(c, updated, m));
  })
  .delete('/:id', (c) => {
    const club = findClub(c, c.req.param('id'));
    const m = club && me(c, club.id);
    if (!club || !m) return notFound(c);
    if (m.role !== 'owner' || !isActive(m)) {
      return c.json({ error: 'Only the owner can delete the club' }, 403);
    }
    c.get('db').delete(schema.club).where(eq(schema.club.id, club.id)).run();
    return c.body(null, 204);
  })
  .post('/:id/join-code', (c) => {
    const club = findClub(c, c.req.param('id'));
    const m = club && me(c, club.id);
    if (!club || !m) return notFound(c);
    if (!canManage(m)) return forbidden(c);
    const [updated] = c
      .get('db')
      .update(schema.club)
      .set({ joinCode: newJoinCode() })
      .where(eq(schema.club.id, club.id))
      .returning()
      .all();
    return c.json(toClub(c, updated, m));
  })

  // ---- Membership ----
  .patch('/:id/me', zValidator('json', updateMyMembershipSchema), (c) => {
    const club = findClub(c, c.req.param('id'));
    const m = club && me(c, club.id);
    if (!club || !m) return notFound(c);
    const [updated] = c
      .get('db')
      .update(schema.clubMember)
      .set(c.req.valid('json'))
      .where(eq(schema.clubMember.id, m.id))
      .returning()
      .all();
    return c.json(toSummary(c, club, updated));
  })
  .patch(
    '/:id/members/:userId',
    zValidator('json', updateMemberSchema),
    (c) => {
      const club = findClub(c, c.req.param('id'));
      const actor = club && me(c, club.id);
      if (!club || !actor) return notFound(c);
      if (!canManage(actor)) return forbidden(c);
      const target = getMembership(c.get('db'), club.id, c.req.param('userId'));
      if (!target) return notFound(c);
      const { role, status } = c.req.valid('json');
      // Approving is for any organiser; changing roles is for the owner.
      if (role && (actor.role !== 'owner' || target.role === 'owner')) {
        return c.json({ error: 'Only the owner can change roles' }, 403);
      }
      c.get('db')
        .update(schema.clubMember)
        .set({ ...(role ? { role } : {}), ...(status ? { status } : {}) })
        .where(eq(schema.clubMember.id, target.id))
        .run();
      return c.json(toClub(c, club, actor));
    },
  )
  .delete('/:id/members/:userId', (c) => {
    const club = findClub(c, c.req.param('id'));
    const actor = club && me(c, club.id);
    if (!club || !actor) return notFound(c);
    const userId =
      c.req.param('userId') === 'me' ? actor.userId : c.req.param('userId');
    const target = getMembership(c.get('db'), club.id, userId);
    if (!target) return notFound(c);
    const leaving = target.id === actor.id;
    if (leaving && actor.role === 'owner') {
      return c.json(
        { error: 'The owner can’t leave. Delete the club instead.' },
        400,
      );
    }
    // Organisers can remove members (and turn down requests); the owner can
    // also remove organisers.
    if (
      !leaving &&
      !(
        canManage(actor) &&
        (target.status === 'pending' || outranks(actor.role, target.role))
      )
    ) {
      return forbidden(c);
    }
    // Someone who leaves takes their RSVPs, coffee orders and shared runs
    // with them, so their name doesn't stay on the club's runs.
    c.get('db').transaction((tx) => {
      const runIds = tx
        .select({ id: schema.clubRun.id })
        .from(schema.clubRun)
        .where(eq(schema.clubRun.clubId, club.id));
      tx.delete(schema.rsvp)
        .where(
          and(
            eq(schema.rsvp.userId, target.userId),
            inArray(schema.rsvp.clubRunId, runIds),
          ),
        )
        .run();
      removeMemberCoffee(tx, club.id, target.userId);
      tx.delete(schema.clubShare)
        .where(
          and(
            eq(schema.clubShare.clubId, club.id),
            eq(schema.clubShare.userId, target.userId),
          ),
        )
        .run();
      tx.delete(schema.clubMember)
        .where(eq(schema.clubMember.id, target.id))
        .run();
    });
    return c.body(null, 204);
  })

  // ---- Locations ----
  .post('/:id/locations', zValidator('json', createLocationSchema), (c) => {
    const club = findClub(c, c.req.param('id'));
    const m = club && me(c, club.id);
    if (!club || !m) return notFound(c);
    if (!canManage(m)) return forbidden(c);
    const [row] = c
      .get('db')
      .insert(schema.clubLocation)
      .values({ ...c.req.valid('json'), clubId: club.id })
      .returning()
      .all();
    return c.json(toLocation(row), 201);
  })
  .delete('/:id/locations/:locationId', (c) => {
    const club = findClub(c, c.req.param('id'));
    const m = club && me(c, club.id);
    if (!club || !m) return notFound(c);
    if (!canManage(m)) return forbidden(c);
    const deleted = c
      .get('db')
      .delete(schema.clubLocation)
      .where(
        and(
          eq(schema.clubLocation.id, c.req.param('locationId')),
          eq(schema.clubLocation.clubId, club.id),
        ),
      )
      .returning()
      .all();
    if (!deleted.length) return notFound(c);
    return c.body(null, 204);
  })

  // ---- Repeating runs ----
  .post('/:id/series', zValidator('json', createSeriesSchema), (c) => {
    const club = findClub(c, c.req.param('id'));
    const m = club && me(c, club.id);
    if (!club || !m) return notFound(c);
    if (!canManage(m)) return forbidden(c);
    const { days, interval, locationId, ...input } = c.req.valid('json');
    const location = clubLocationId(c, club.id, locationId);
    if (location === undefined)
      return c.json({ error: 'Unknown location' }, 400);
    const series = c.get('db').transaction((tx) => {
      const [row] = tx
        .insert(schema.clubRunSeries)
        .values({
          ...input,
          clubId: club.id,
          rrule: formatRule({ interval, days }),
          locationId: location,
        })
        .returning()
        .all();
      ensureUpcomingRuns(tx, club.id);
      return row;
    });
    return c.json(toSeries(series), 201);
  })
  .patch(
    '/:id/series/:seriesId',
    zValidator('json', updateSeriesSchema),
    (c) => {
      const club = findClub(c, c.req.param('id'));
      const m = club && me(c, club.id);
      if (!club || !m) return notFound(c);
      if (!canManage(m)) return forbidden(c);
      const db = c.get('db');
      const existing = db
        .select()
        .from(schema.clubRunSeries)
        .where(
          and(
            eq(schema.clubRunSeries.id, c.req.param('seriesId')),
            eq(schema.clubRunSeries.clubId, club.id),
          ),
        )
        .get();
      if (!existing) return notFound(c);
      const { days, interval, ended, locationId, ...rest } =
        c.req.valid('json');
      const location =
        locationId === undefined
          ? existing.locationId
          : clubLocationId(c, club.id, locationId);
      if (location === undefined) {
        return c.json({ error: 'Unknown location' }, 400);
      }
      const rule = parseRule(existing.rrule) ?? { interval: 1, days: [] };
      const series = db.transaction((tx) => {
        const [row] = tx
          .update(schema.clubRunSeries)
          .set({
            ...rest,
            locationId: location,
            rrule: formatRule({
              interval: interval ?? rule.interval,
              days: days ?? rule.days,
            }),
            ...(ended === undefined
              ? {}
              : { endedAt: ended ? new Date() : null }),
          })
          .where(eq(schema.clubRunSeries.id, existing.id))
          .returning()
          .all();
        syncFutureRuns(tx, row, (removed) =>
          noticeRunChange(
            db,
            c.get('notifier'),
            club,
            removed,
            { kind: 'removed', seriesEnded: row.endedAt !== null },
            m.userId,
          ),
        );
        return row;
      });
      return c.json(toSeries(series));
    },
  )

  // ---- Highlights ----
  .get('/:id/highlights', (c) => {
    const club = findClub(c, c.req.param('id'));
    const m = club && me(c, club.id);
    if (!club || !isActive(m)) return notFound(c);
    const db = c.get('db');
    const now = new Date();
    // A year is plenty for streaks and milestones to be worth celebrating.
    const since = new Date(now.getTime() - 400 * 86_400_000);
    const attendances = db
      .select({
        userId: schema.rsvp.userId,
        name: schema.user.name,
        startsAt: schema.clubRun.startsAt,
        weather: schema.clubRun.weather,
      })
      .from(schema.rsvp)
      .innerJoin(schema.clubRun, eq(schema.clubRun.id, schema.rsvp.clubRunId))
      .innerJoin(schema.user, eq(schema.user.id, schema.rsvp.userId))
      .where(
        and(
          eq(schema.clubRun.clubId, club.id),
          eq(schema.clubRun.status, 'scheduled'),
          eq(schema.rsvp.status, 'going'),
          gte(schema.clubRun.startsAt, since),
          lt(schema.clubRun.startsAt, now),
        ),
      )
      .all()
      .map((a) => ({
        ...a,
        rainy:
          a.weather !== null &&
          ['drizzle', 'rain', 'storm'].includes(
            describeWeather(a.weather.code).kind,
          ),
      }));
    const shares = db
      .select({
        startedAt: schema.clubShare.startedAt,
        distanceM: schema.clubShare.distanceM,
      })
      .from(schema.clubShare)
      .where(
        and(
          eq(schema.clubShare.clubId, club.id),
          gte(
            schema.clubShare.startedAt,
            new Date(now.getTime() - 40 * 86_400_000),
          ),
        ),
      )
      .all();
    const opted = new Set(
      db
        .select({ userId: schema.clubMember.userId })
        .from(schema.clubMember)
        .where(
          and(
            eq(schema.clubMember.clubId, club.id),
            eq(schema.clubMember.status, 'active'),
            eq(schema.clubMember.highlights, true),
          ),
        )
        .all()
        .map((o) => o.userId),
    );
    const h = clubHighlights(attendances, shares, opted, club.timezone, now);
    const result: ClubHighlights = {
      ...h,
      moments: h.moments.map((x) => ({ ...x, at: x.at.toISOString() })),
      recentShares: listShares(db, { clubId: club.id, limit: 5 }),
    };
    return c.json(result);
  })

  // ---- Runs ----
  .get('/:id/runs', (c) => {
    const club = findClub(c, c.req.param('id'));
    const m = club && me(c, club.id);
    if (!club || !isActive(m)) return notFound(c);
    ensureUpcomingRuns(c.get('db'), club.id);
    const past = c.req.query('when') === 'past';
    const cutoff = new Date(Date.now() - STILL_ON_MS);
    const runs = c
      .get('db')
      .select()
      .from(schema.clubRun)
      .where(
        and(
          eq(schema.clubRun.clubId, club.id),
          past
            ? lt(schema.clubRun.startsAt, cutoff)
            : gte(schema.clubRun.startsAt, cutoff),
        ),
      )
      .orderBy(
        past
          ? sql`${schema.clubRun.startsAt} desc`
          : asc(schema.clubRun.startsAt),
      )
      .limit(past ? 20 : 100)
      .all();
    return c.json(toRuns(c, runs));
  })
  .post('/:id/runs', zValidator('json', createClubRunSchema), (c) => {
    const club = findClub(c, c.req.param('id'));
    const m = club && me(c, club.id);
    if (!club || !m) return notFound(c);
    if (!canManage(m)) return forbidden(c);
    const { locationId, startsAt, ...input } = c.req.valid('json');
    const location = clubLocationId(c, club.id, locationId);
    if (location === undefined)
      return c.json({ error: 'Unknown location' }, 400);
    const [run] = c
      .get('db')
      .insert(schema.clubRun)
      .values({
        ...input,
        clubId: club.id,
        startsAt: new Date(startsAt),
        locationId: location,
      })
      .returning()
      .all();
    return c.json(toRunDetail(c, club, run, m), 201);
  })
  .get('/:id/runs/:runId', (c) => {
    const club = findClub(c, c.req.param('id'));
    const m = club && me(c, club.id);
    if (!club || !isActive(m)) return notFound(c);
    const run = findRun(c, club.id, c.req.param('runId'));
    if (!run) return notFound(c);
    return c.json(toRunDetail(c, club, run, m));
  })
  .patch('/:id/runs/:runId', zValidator('json', updateClubRunSchema), (c) => {
    const club = findClub(c, c.req.param('id'));
    const m = club && me(c, club.id);
    if (!club || !m) return notFound(c);
    if (!canManage(m)) return forbidden(c);
    const run = findRun(c, club.id, c.req.param('runId'));
    if (!run) return notFound(c);
    const { locationId, startsAt, status, cancelledReason, ...rest } =
      c.req.valid('json');
    const location =
      locationId === undefined
        ? run.locationId
        : clubLocationId(c, club.id, locationId);
    if (location === undefined) {
      return c.json({ error: 'Unknown location' }, 400);
    }
    const [updated] = c
      .get('db')
      .update(schema.clubRun)
      .set({
        ...rest,
        locationId: location,
        ...(startsAt ? { startsAt: new Date(startsAt) } : {}),
        ...(status ? { status } : {}),
        ...(status === 'scheduled'
          ? { cancelledReason: null }
          : cancelledReason !== undefined
            ? { cancelledReason }
            : {}),
      })
      .where(eq(schema.clubRun.id, run.id))
      .returning()
      .all();
    const notifier = c.get('notifier');
    const db = c.get('db');
    if (run.status === 'scheduled' && updated.status === 'cancelled') {
      noticeRunChange(
        db,
        notifier,
        club,
        updated,
        { kind: 'cancelled', reason: updated.cancelledReason },
        m.userId,
      );
    } else if (
      updated.status === 'scheduled' &&
      updated.startsAt.getTime() !== run.startsAt.getTime()
    ) {
      noticeRunChange(
        db,
        notifier,
        club,
        updated,
        { kind: 'moved', from: run.startsAt },
        m.userId,
      );
    }
    return c.json(toRunDetail(c, club, updated, m));
  })
  .put('/:id/runs/:runId/rsvp', zValidator('json', rsvpInputSchema), (c) => {
    const club = findClub(c, c.req.param('id'));
    const m = club && me(c, club.id);
    if (!club || !isActive(m)) return notFound(c);
    const run = findRun(c, club.id, c.req.param('runId'));
    if (!run) return notFound(c);
    if (run.status === 'cancelled') {
      return c.json({ error: 'This run has been cancelled' }, 400);
    }
    const values = { status: c.req.valid('json').status };
    c.get('db').transaction((tx) => {
      tx.insert(schema.rsvp)
        .values({ ...values, clubRunId: run.id, userId: m.userId })
        .onConflictDoUpdate({
          target: [schema.rsvp.clubRunId, schema.rsvp.userId],
          set: values,
        })
        .run();
      // Coffee is only for people who are coming.
      if (values.status === 'going') addUsualIfWanted(tx, run, m.userId);
      else removeOrder(tx, run.id, m.userId);
    });
    return c.json(toRunDetail(c, club, run, m));
  })
  .route('/', coffeeRoutes);
