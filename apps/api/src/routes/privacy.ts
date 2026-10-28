import { zValidator } from '@hono/zod-validator';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { schema } from '@openrun/db';
import { randomiseZone } from '@openrun/domain';
import {
  type PrivacyZone,
  createPrivacyZoneSchema,
  updatePrivacySettingsSchema,
} from '@openrun/schemas';
import { type AuthedEnv, requireUser } from '../context.js';
import { getPrivacySettings, listZones } from '../privacy.js';

function toZone(z: typeof schema.privacyZone.$inferSelect): PrivacyZone {
  return { id: z.id, name: z.name, lat: z.lat, lng: z.lng, radiusM: z.radiusM };
}

export const privacyRoutes = new Hono<AuthedEnv>()
  .use(requireUser)
  .get('/settings', (c) =>
    c.json(getPrivacySettings(c.get('db'), c.get('user').id)),
  )
  .patch('/settings', zValidator('json', updatePrivacySettingsSchema), (c) => {
    const db = c.get('db');
    const userId = c.get('user').id;
    const next = { ...getPrivacySettings(db, userId), ...c.req.valid('json') };
    db.insert(schema.privacySettings)
      .values({ userId, ...next })
      .onConflictDoUpdate({ target: schema.privacySettings.userId, set: next })
      .run();
    return c.json(getPrivacySettings(db, userId));
  })
  .get('/zones', (c) =>
    c.json(listZones(c.get('db'), c.get('user').id).map(toZone)),
  )
  .post('/zones', zValidator('json', createPrivacyZoneSchema), (c) => {
    const input = c.req.valid('json');
    // The randomised edge is chosen once and kept, so the same zone always
    // trims the same way; re-randomising would leak the centre over time.
    const trim = randomiseZone(input);
    const [row] = c
      .get('db')
      .insert(schema.privacyZone)
      .values({
        ...input,
        userId: c.get('user').id,
        trimLat: trim.lat,
        trimLng: trim.lng,
        trimRadiusM: trim.radiusM,
      })
      .returning()
      .all();
    return c.json(toZone(row), 201);
  })
  .delete('/zones/:id', (c) => {
    const deleted = c
      .get('db')
      .delete(schema.privacyZone)
      .where(
        and(
          eq(schema.privacyZone.id, c.req.param('id')),
          eq(schema.privacyZone.userId, c.get('user').id),
        ),
      )
      .returning()
      .all();
    if (!deleted.length) return c.json({ error: 'Not found' }, 404);
    return c.body(null, 204);
  });
