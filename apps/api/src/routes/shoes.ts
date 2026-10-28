import { zValidator } from '@hono/zod-validator';
import { and, asc, count, eq, sql, sum } from 'drizzle-orm';
import { Hono } from 'hono';
import { type Db, schema } from '@openrun/db';
import {
  type Shoe,
  createShoeSchema,
  updateShoeSchema,
} from '@openrun/schemas';
import { type AuthedEnv, requireUser } from '../context.js';

/** The user's shoes with their total distance, active shoes first. */
export function listShoes(db: Db, userId: string, id?: string): Shoe[] {
  const s = schema.shoe;
  const a = schema.activity;
  return db
    .select({
      id: s.id,
      name: s.name,
      brand: s.brand,
      startingDistanceM: s.startingDistanceM,
      loggedM: sum(a.distanceM).mapWith(Number),
      runCount: count(a.id),
      retiredAt: s.retiredAt,
    })
    .from(s)
    .leftJoin(a, eq(a.shoeId, s.id))
    .where(and(eq(s.userId, userId), id ? eq(s.id, id) : undefined))
    .groupBy(s.id)
    .orderBy(sql`${s.retiredAt} is not null`, asc(s.name))
    .all()
    .map(({ loggedM, retiredAt, ...shoe }) => ({
      ...shoe,
      distanceM: shoe.startingDistanceM + (loggedM ?? 0),
      retired: retiredAt !== null,
    }));
}

export const shoeRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .get('/', (c) => c.json(listShoes(c.get('db'), c.get('user').id)))
  .post('/', zValidator('json', createShoeSchema), (c) => {
    const userId = c.get('user').id;
    const [row] = c
      .get('db')
      .insert(schema.shoe)
      .values({ ...c.req.valid('json'), userId })
      .returning()
      .all();
    return c.json(listShoes(c.get('db'), userId, row.id)[0], 201);
  })
  .patch('/:id', zValidator('json', updateShoeSchema), (c) => {
    const userId = c.get('user').id;
    const { retired, ...rest } = c.req.valid('json');
    const updated = c
      .get('db')
      .update(schema.shoe)
      .set({
        ...rest,
        ...(retired === undefined
          ? {}
          : { retiredAt: retired ? new Date() : null }),
      })
      .where(
        and(
          eq(schema.shoe.id, c.req.param('id')),
          eq(schema.shoe.userId, userId),
        ),
      )
      .returning()
      .all();
    if (!updated.length) return c.json({ error: 'Not found' }, 404);
    return c.json(listShoes(c.get('db'), userId, updated[0].id)[0]);
  })
  .delete('/:id', (c) => {
    // Runs in the shoe keep their data; their shoe is cleared (on delete set null).
    const deleted = c
      .get('db')
      .delete(schema.shoe)
      .where(
        and(
          eq(schema.shoe.id, c.req.param('id')),
          eq(schema.shoe.userId, c.get('user').id),
        ),
      )
      .returning()
      .all();
    if (!deleted.length) return c.json({ error: 'Not found' }, 404);
    return c.body(null, 204);
  });
