import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../context.js';

/**
 * What visitors can't do on the public demo, where everyone shares one
 * login: make accounts, change the login, upload files (the demo shouldn't
 * host strangers' files), connect real intervals.icu accounts, sign up for
 * notifications or use admin tools. Everything else is reset every night.
 */
const ALLOWED_AUTH = new Set(['/api/auth/sign-in/email', '/api/auth/sign-out']);

const BLOCKED: [method: string, path: RegExp][] = [
  ['POST', /^\/api\/activities\/import$/],
  ['POST', /^\/api\/clubs\/[^/]+\/logo$/],
  ['*', /^\/api\/admin\//],
  ['*', /^\/api\/integrations\//],
  ['*', /^\/api\/notifications\//],
];

export const demoLimits = createMiddleware<AppEnv>(async (c, next) => {
  const { method, path } = c.req;
  if (method === 'GET' || method === 'HEAD') return next();
  const blocked = path.startsWith('/api/auth/')
    ? !ALLOWED_AUTH.has(path)
    : BLOCKED.some(([m, re]) => (m === '*' || m === method) && re.test(path));
  if (!blocked) return next();
  return c.json(
    {
      error:
        'That’s turned off on the demo. Run your own openRun to try it: see github.com/stretch0/openRun.',
    },
    403,
  );
});
