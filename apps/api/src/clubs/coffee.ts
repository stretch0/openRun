import { zValidator } from '@hono/zod-validator';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { type Db, schema } from '@openrun/db';
import {
  ordersCloseAt,
  resolveChoices,
  summariseOrders,
} from '@openrun/domain';
import {
  type MenuItem,
  type OrderSummaryOutput,
  type RunCoffee,
  type Usual,
  createMenuItemSchema,
  orderInputSchema,
  updateMenuItemSchema,
  usualInputSchema,
} from '@openrun/schemas';
import type { AuthedEnv } from '../context.js';
import { canManage, isActive } from './access.js';
import {
  type Ctx,
  findClub,
  findRun,
  forbidden,
  me,
  notFound,
} from './helpers.js';

// Coffee after the run: a café menu per club, one order per member per run,
// a saved usual, and a summary anyone in the club can show at the counter.

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type RunRow = typeof schema.clubRun.$inferSelect;
type MenuRow = typeof schema.menuItem.$inferSelect;

function toMenuItem(row: MenuRow): MenuItem {
  return {
    id: row.id,
    name: row.name,
    options: row.options,
    hidden: row.hidden,
  };
}

/** The club's menu. Hidden items are only for organisers. */
export function listMenu(db: Db, clubId: string, includeHidden: boolean) {
  return db
    .select()
    .from(schema.menuItem)
    .where(
      and(
        eq(schema.menuItem.clubId, clubId),
        includeHidden ? undefined : eq(schema.menuItem.hidden, false),
      ),
    )
    .orderBy(asc(schema.menuItem.name))
    .all()
    .map(toMenuItem);
}

export function getUsual(db: Db, clubId: string, userId: string) {
  const row = db
    .select()
    .from(schema.coffeeUsual)
    .innerJoin(
      schema.menuItem,
      eq(schema.menuItem.id, schema.coffeeUsual.menuItemId),
    )
    .where(
      and(
        eq(schema.coffeeUsual.clubId, clubId),
        eq(schema.coffeeUsual.userId, userId),
      ),
    )
    .get();
  if (!row) return null;
  const usual: Usual = {
    menuItemId: row.menu_item.id,
    item: row.menu_item.name,
    choices: row.coffee_usual.choices,
    autoAdd: row.coffee_usual.autoAdd,
  };
  return usual;
}

function ordersOpen(run: RunRow, now = new Date()) {
  return (
    run.status === 'scheduled' &&
    now < ordersCloseAt(run.startsAt, run.orderCutoffMin)
  );
}

function hasMenu(db: Db, clubId: string) {
  return Boolean(
    db
      .select({ id: schema.menuItem.id })
      .from(schema.menuItem)
      .where(
        and(
          eq(schema.menuItem.clubId, clubId),
          eq(schema.menuItem.hidden, false),
        ),
      )
      .limit(1)
      .get(),
  );
}

/** Coffee for a run page; null if the club has no menu and nobody ordered. */
export function runCoffee(
  db: Db,
  run: RunRow,
  userId: string,
): RunCoffee | null {
  const orderCount =
    db
      .select({ n: count() })
      .from(schema.coffeeOrder)
      .where(eq(schema.coffeeOrder.clubRunId, run.id))
      .get()?.n ?? 0;
  if (!orderCount && !hasMenu(db, run.clubId)) return null;
  const mine = db
    .select()
    .from(schema.coffeeOrder)
    .where(
      and(
        eq(schema.coffeeOrder.clubRunId, run.id),
        eq(schema.coffeeOrder.userId, userId),
      ),
    )
    .get();
  return {
    closesAt: ordersCloseAt(run.startsAt, run.orderCutoffMin).toISOString(),
    open: ordersOpen(run),
    orderCount,
    myOrder: mine
      ? { menuItemId: mine.menuItemId, item: mine.item, choices: mine.choices }
      : null,
  };
}

function findItem(db: Db | Tx, clubId: string, itemId: string) {
  return db
    .select()
    .from(schema.menuItem)
    .where(
      and(eq(schema.menuItem.id, itemId), eq(schema.menuItem.clubId, clubId)),
    )
    .get();
}

function placeOrder(
  db: Db | Tx,
  runId: string,
  userId: string,
  item: MenuRow,
  choices: Usual['choices'],
) {
  const values = { menuItemId: item.id, item: item.name, choices };
  db.insert(schema.coffeeOrder)
    .values({ ...values, clubRunId: runId, userId })
    .onConflictDoUpdate({
      target: [schema.coffeeOrder.clubRunId, schema.coffeeOrder.userId],
      set: values,
    })
    .run();
}

export function removeOrder(db: Db | Tx, runId: string, userId: string) {
  db.delete(schema.coffeeOrder)
    .where(
      and(
        eq(schema.coffeeOrder.clubRunId, runId),
        eq(schema.coffeeOrder.userId, userId),
      ),
    )
    .run();
}

/**
 * When someone says they're going, orders their usual if they asked for
 * that, orders are open, they haven't ordered yet and it's still on the menu.
 */
export function addUsualIfWanted(db: Db | Tx, run: RunRow, userId: string) {
  if (!ordersOpen(run)) return;
  const usual = db
    .select()
    .from(schema.coffeeUsual)
    .where(
      and(
        eq(schema.coffeeUsual.clubId, run.clubId),
        eq(schema.coffeeUsual.userId, userId),
      ),
    )
    .get();
  if (!usual?.autoAdd) return;
  const item = findItem(db, run.clubId, usual.menuItemId);
  if (!item || item.hidden) return;
  // The menu may have changed since; only reorder choices still offered.
  const picked = Object.fromEntries(
    usual.choices.map((c) => [c.option, c.choice]),
  );
  const choices = resolveChoices(item.options, picked);
  if (!choices) return;
  db.insert(schema.coffeeOrder)
    .values({
      clubRunId: run.id,
      userId,
      menuItemId: item.id,
      item: item.name,
      choices,
    })
    .onConflictDoNothing()
    .run();
}

/** A leaving member's orders and usual go with them. */
export function removeMemberCoffee(tx: Tx, clubId: string, userId: string) {
  const runIds = tx
    .select({ id: schema.clubRun.id })
    .from(schema.clubRun)
    .where(eq(schema.clubRun.clubId, clubId));
  tx.delete(schema.coffeeOrder)
    .where(
      and(
        eq(schema.coffeeOrder.userId, userId),
        inArray(schema.coffeeOrder.clubRunId, runIds),
      ),
    )
    .run();
  tx.delete(schema.coffeeUsual)
    .where(
      and(
        eq(schema.coffeeUsual.clubId, clubId),
        eq(schema.coffeeUsual.userId, userId),
      ),
    )
    .run();
}

function goingTo(db: Db, runId: string, userId: string) {
  return (
    db
      .select({ status: schema.rsvp.status })
      .from(schema.rsvp)
      .where(
        and(eq(schema.rsvp.clubRunId, runId), eq(schema.rsvp.userId, userId)),
      )
      .get()?.status === 'going'
  );
}

/** A visible item of this club, with the picked choices checked against it. */
function resolveOrder(
  c: Ctx,
  clubId: string,
  input: { menuItemId: string; choices: Record<string, string | null> },
) {
  const item = findItem(c.get('db'), clubId, input.menuItemId);
  if (!item || item.hidden) {
    return { error: 'That isn’t on the menu any more' } as const;
  }
  const choices = resolveChoices(item.options, input.choices);
  if (!choices) return { error: 'That choice isn’t on the menu' } as const;
  return { item, choices } as const;
}

export const coffeeRoutes = new Hono<AuthedEnv>()
  // ---- Menu ----
  .post('/:id/menu', zValidator('json', createMenuItemSchema), (c) => {
    const club = findClub(c, c.req.param('id'));
    const m = club && me(c, club.id);
    if (!club || !m) return notFound(c);
    if (!canManage(m)) return forbidden(c);
    const [row] = c
      .get('db')
      .insert(schema.menuItem)
      .values({ ...c.req.valid('json'), clubId: club.id })
      .returning()
      .all();
    return c.json(toMenuItem(row), 201);
  })
  .patch('/:id/menu/:itemId', zValidator('json', updateMenuItemSchema), (c) => {
    const club = findClub(c, c.req.param('id'));
    const m = club && me(c, club.id);
    if (!club || !m) return notFound(c);
    if (!canManage(m)) return forbidden(c);
    const [row] = c
      .get('db')
      .update(schema.menuItem)
      .set(c.req.valid('json'))
      .where(
        and(
          eq(schema.menuItem.id, c.req.param('itemId')),
          eq(schema.menuItem.clubId, club.id),
        ),
      )
      .returning()
      .all();
    if (!row) return notFound(c);
    return c.json(toMenuItem(row));
  })

  // ---- My usual ----
  .put('/:id/usual', zValidator('json', usualInputSchema), (c) => {
    const club = findClub(c, c.req.param('id'));
    const m = club && me(c, club.id);
    if (!club || !isActive(m)) return notFound(c);
    const input = c.req.valid('json');
    const order = resolveOrder(c, club.id, input);
    if ('error' in order) return c.json({ error: order.error }, 400);
    const values = {
      menuItemId: order.item.id,
      choices: order.choices,
      autoAdd: input.autoAdd,
    };
    c.get('db')
      .insert(schema.coffeeUsual)
      .values({ ...values, clubId: club.id, userId: m.userId })
      .onConflictDoUpdate({
        target: [schema.coffeeUsual.clubId, schema.coffeeUsual.userId],
        set: values,
      })
      .run();
    return c.json(getUsual(c.get('db'), club.id, m.userId));
  })
  .delete('/:id/usual', (c) => {
    const club = findClub(c, c.req.param('id'));
    const m = club && me(c, club.id);
    if (!club || !isActive(m)) return notFound(c);
    c.get('db')
      .delete(schema.coffeeUsual)
      .where(
        and(
          eq(schema.coffeeUsual.clubId, club.id),
          eq(schema.coffeeUsual.userId, m.userId),
        ),
      )
      .run();
    return c.body(null, 204);
  })

  // ---- Orders ----
  .put('/:id/runs/:runId/order', zValidator('json', orderInputSchema), (c) => {
    const club = findClub(c, c.req.param('id'));
    const m = club && me(c, club.id);
    if (!club || !isActive(m)) return notFound(c);
    const run = findRun(c, club.id, c.req.param('runId'));
    if (!run) return notFound(c);
    const db = c.get('db');
    if (!ordersOpen(run)) {
      return c.json({ error: 'Orders for this run have closed' }, 400);
    }
    if (!goingTo(db, run.id, m.userId)) {
      return c.json({ error: 'Say you’re going first' }, 400);
    }
    const input = c.req.valid('json');
    const order = resolveOrder(c, club.id, input);
    if ('error' in order) return c.json({ error: order.error }, 400);
    db.transaction((tx) => {
      placeOrder(tx, run.id, m.userId, order.item, order.choices);
      if (!input.saveAsUsual) return;
      const values = { menuItemId: order.item.id, choices: order.choices };
      tx.insert(schema.coffeeUsual)
        .values({ ...values, clubId: club.id, userId: m.userId })
        .onConflictDoUpdate({
          target: [schema.coffeeUsual.clubId, schema.coffeeUsual.userId],
          set: values,
        })
        .run();
    });
    return c.json(runCoffee(db, run, m.userId));
  })
  .delete('/:id/runs/:runId/order', (c) => {
    const club = findClub(c, c.req.param('id'));
    const m = club && me(c, club.id);
    if (!club || !isActive(m)) return notFound(c);
    const run = findRun(c, club.id, c.req.param('runId'));
    if (!run) return notFound(c);
    if (!ordersOpen(run)) {
      return c.json({ error: 'Orders for this run have closed' }, 400);
    }
    removeOrder(c.get('db'), run.id, m.userId);
    return c.json(runCoffee(c.get('db'), run, m.userId));
  })
  .get('/:id/runs/:runId/orders', (c) => {
    const club = findClub(c, c.req.param('id'));
    const m = club && me(c, club.id);
    if (!club || !isActive(m)) return notFound(c);
    const run = findRun(c, club.id, c.req.param('runId'));
    if (!run) return notFound(c);
    const orders = c
      .get('db')
      .select({
        name: schema.user.name,
        item: schema.coffeeOrder.item,
        choices: schema.coffeeOrder.choices,
      })
      .from(schema.coffeeOrder)
      .innerJoin(schema.user, eq(schema.user.id, schema.coffeeOrder.userId))
      .where(eq(schema.coffeeOrder.clubRunId, run.id))
      .all();
    const summary: OrderSummaryOutput = {
      clubName: club.name,
      runTitle: run.title,
      startsAt: run.startsAt.toISOString(),
      timezone: club.timezone,
      closesAt: ordersCloseAt(run.startsAt, run.orderCutoffMin).toISOString(),
      open: ordersOpen(run),
      ...summariseOrders(orders),
    };
    return c.json(summary);
  });
