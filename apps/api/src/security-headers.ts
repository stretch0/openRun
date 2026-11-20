import { createHash } from 'node:crypto';
import { secureHeaders } from 'hono/secure-headers';
import type { Config } from './config.js';

/** Map tiles; see OSM_STYLE in apps/web/src/components/maplibre.ts. */
const TILES = 'https://tile.openstreetmap.org';

/**
 * Headers that keep browsers from running anything openRun didn't send, from
 * framing it on another site, and (on HTTPS) from ever using plain HTTP.
 *
 * `indexHtml` is the built web app's page: its inline script (the theme, set
 * before the first paint) is allowed by hash, so no other inline script runs.
 */
export function securityHeaders(config: Config, indexHtml?: string) {
  return secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", ...inlineScriptHashes(indexHtml ?? '')],
      // react-easy-crop adds a <style> tag for the logo picker.
      styleSrc: ["'self'", "'unsafe-inline'"],
      // blob: is the logo picker's preview of the chosen file.
      imgSrc: ["'self'", 'data:', 'blob:', TILES],
      // MapLibre's worker fetches the tiles.
      connectSrc: ["'self'", TILES],
      workerSrc: ["'self'", 'blob:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
    xFrameOptions: 'DENY',
    // OpenStreetMap's tile servers require a Referer, so send the origin
    // (never the path) to other sites.
    referrerPolicy: 'strict-origin-when-cross-origin',
    strictTransportSecurity: config.origin.startsWith('https:')
      ? 'max-age=31536000'
      : false,
  });
}

/** 'sha256-…' sources for each inline <script> in the page. */
export function inlineScriptHashes(html: string) {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1])
    .filter((body) => body.trim())
    .map(
      (body) =>
        `'sha256-${createHash('sha256').update(body).digest('base64')}'`,
    );
}
