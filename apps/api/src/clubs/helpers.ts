import { and, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { schema } from '@openrun/db';
import type { AuthedEnv } from '../context.js';
import { getMembership } from './access.js';

export type Ctx = Context<AuthedEnv>;

export const notFound = (c: Ctx) => c.json({ error: 'Not found' }, 404);
export const forbidden = (c: Ctx) => c.json({ error: 'Organisers only' }, 403);

export function findClub(c: Ctx, id: string) {
  return c
    .get('db')
    .select()
    .from(schema.club)
    .where(eq(schema.club.id, id))
    .get();
}

/** The signed-in user's membership of a club. */
export function me(c: Ctx, clubId: string) {
  return getMembership(c.get('db'), clubId, c.get('user').id);
}

export function findRun(c: Ctx, clubId: string, runId: string) {
  return c
    .get('db')
    .select()
    .from(schema.clubRun)
    .where(and(eq(schema.clubRun.id, runId), eq(schema.clubRun.clubId, clubId)))
    .get();
}
