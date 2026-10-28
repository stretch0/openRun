import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { getConnInfo } from '@hono/node-server/conninfo';
import { type Context, Hono } from 'hono';
import { logger } from 'hono/logger';
import type { Db } from '@openrun/db';
import type { Auth } from './auth.js';
import type { Config } from './config.js';
import type { AppEnv } from './context.js';
import { activityRoutes, personalBestRoutes } from './routes/activities.js';
import { clubRoutes } from './clubs/routes.js';
import { adminRoutes } from './routes/admin.js';
import { exportRoutes } from './routes/export.js';
import { instanceRoutes } from './routes/instance.js';
import { meRoutes } from './routes/me.js';
import { privacyRoutes } from './routes/privacy.js';
import { shoeRoutes } from './routes/shoes.js';
import { statsRoutes } from './routes/stats.js';

export function createApp({
  db,
  auth,
  config,
}: {
  db: Db;
  auth: Auth;
  config: Config;
}) {
  const app = new Hono<AppEnv>();

  if (config.logRequests) app.use(logger());

  app.use('/api/*', async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    c.set('user', session?.user ?? null);
    c.set('db', db);
    c.set('config', config);
    await next();
  });

  app.on(['GET', 'POST'], '/api/auth/*', (c) =>
    auth.handler(withClientIp(c.req.raw, config.trustProxy ? null : c)),
  );
  app.get('/api/health', (c) => c.json({ ok: true }));
  app.route('/api/instance', instanceRoutes);
  app.route('/api/me', meRoutes);
  app.route('/api/admin', adminRoutes);
  app.route('/api/activities', activityRoutes);
  app.route('/api/personal-bests', personalBestRoutes);
  app.route('/api/shoes', shoeRoutes);
  app.route('/api/stats', statsRoutes);
  app.route('/api/export', exportRoutes);
  app.route('/api/privacy', privacyRoutes);
  app.route('/api/clubs', clubRoutes);
  app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));

  if (config.webDir) serveWeb(app, config.webDir);

  return app;
}

/**
 * Better Auth rate-limits by client IP, read from X-Forwarded-For. Unless a
 * trusted proxy sets that header, replace it with the socket address so
 * clients cannot spoof it.
 */
function withClientIp(req: Request, c: Context | null) {
  if (!c) return req;
  let address: string | undefined;
  try {
    address = getConnInfo(c).remote.address;
  } catch {
    // No socket, e.g. in tests using app.request().
  }
  const headers = new Headers(req.headers);
  if (address) headers.set('x-forwarded-for', address);
  else headers.delete('x-forwarded-for');
  return new Request(req, { headers });
}

/** Serves the built PWA, falling back to index.html for client-side routes. */
function serveWeb(app: Hono<AppEnv>, webDir: string) {
  const indexPath = join(webDir, 'index.html');
  if (!existsSync(indexPath)) {
    console.warn(`WEB_DIR is set but ${indexPath} does not exist`);
    return;
  }
  const indexHtml = readFileSync(indexPath, 'utf8');
  app.use(
    '*',
    serveStatic({
      root: webDir,
      onFound: (path, c) => {
        // The service worker and HTML must always be revalidated; hashed assets can be cached forever.
        c.header(
          'Cache-Control',
          path.includes('/assets/')
            ? 'public, max-age=31536000, immutable'
            : 'no-cache',
        );
      },
    }),
  );
  app.get('*', (c) => c.html(indexHtml));
}
