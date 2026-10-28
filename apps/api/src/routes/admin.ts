import { randomBytes } from 'node:crypto';
import { zValidator } from '@hono/zod-validator';
import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { schema } from '@openrun/db';
import { createInviteSchema, type Invite } from '@openrun/schemas';
import { type AuthedEnv, requireAdmin } from '../context.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function toInvite(i: typeof schema.invite.$inferSelect): Invite {
  return {
    id: i.id,
    code: i.code,
    email: i.email,
    usedAt: i.usedAt?.toISOString() ?? null,
    expiresAt: i.expiresAt?.toISOString() ?? null,
    createdAt: i.createdAt.toISOString(),
  };
}

export const adminRoutes = new Hono<AuthedEnv>()
  .use(requireAdmin)
  .get('/invites', (c) => {
    const invites = c
      .get('db')
      .select()
      .from(schema.invite)
      .orderBy(desc(schema.invite.createdAt))
      .all();
    return c.json(invites.map(toInvite));
  })
  .post('/invites', zValidator('json', createInviteSchema), (c) => {
    const { email, expiresInDays } = c.req.valid('json');
    const [invite] = c
      .get('db')
      .insert(schema.invite)
      .values({
        code: randomBytes(9).toString('base64url'),
        email: email?.toLowerCase(),
        createdBy: c.get('user').id,
        expiresAt: new Date(Date.now() + expiresInDays * DAY_MS),
      })
      .returning()
      .all();
    return c.json(toInvite(invite), 201);
  })
  .delete('/invites/:id', (c) => {
    c.get('db')
      .delete(schema.invite)
      .where(eq(schema.invite.id, c.req.param('id')))
      .run();
    return c.body(null, 204);
  });
