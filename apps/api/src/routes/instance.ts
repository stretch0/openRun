import { count } from 'drizzle-orm';
import { Hono } from 'hono';
import { schema } from '@openrun/db';
import type { InstanceInfo } from '@openrun/schemas';
import type { AppEnv } from '../context.js';
import { version } from '../version.js';

export const instanceRoutes = new Hono<AppEnv>().get('/', (c) => {
  const config = c.get('config');
  const [{ users }] = c
    .get('db')
    .select({ users: count() })
    .from(schema.user)
    .all();
  return c.json<InstanceInfo>({
    name: config.instanceName,
    version,
    inviteOnly: config.inviteOnly,
    passwordLogin: config.passwordLogin,
    needsSetup: users === 0,
  });
});
