import { createMiddleware } from 'hono/factory';
import type { Db } from '@openrun/db';
import type { Config } from './config.js';
import type { Notifier } from './push.js';

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  units: string;
  timezone: string;
};

export type AppEnv = {
  Variables: {
    db: Db;
    config: Config;
    notifier: Notifier;
    user: SessionUser | null;
  };
};

export type AuthedEnv = {
  Variables: AppEnv['Variables'] & { user: SessionUser };
};

export const requireUser = createMiddleware<AuthedEnv>(async (c, next) => {
  if (!c.get('user')) return c.json({ error: 'Unauthorized' }, 401);
  return next();
});

export const requireAdmin = createMiddleware<AuthedEnv>(async (c, next) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  if (user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);
  return next();
});
