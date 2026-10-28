import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { schema } from '@openrun/db';
import { type Me, updateMeSchema } from '@openrun/schemas';
import { type AuthedEnv, requireUser } from '../context.js';

function toMe(u: typeof schema.user.$inferSelect): Me {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    units: u.units,
    timezone: u.timezone,
  };
}

export const meRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .get('/', (c) => {
    const me = c
      .get('db')
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, c.get('user').id))
      .get();
    if (!me) return c.json({ error: 'Unauthorized' }, 401);
    return c.json(toMe(me));
  })
  .patch('/', zValidator('json', updateMeSchema), (c) => {
    const [me] = c
      .get('db')
      .update(schema.user)
      .set(c.req.valid('json'))
      .where(eq(schema.user.id, c.get('user').id))
      .returning()
      .all();
    return c.json(toMe(me));
  });
