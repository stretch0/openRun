import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inlineScriptHashes } from './security-headers.js';
import { setup } from './test-utils.js';

const THEME = "document.documentElement.dataset.theme = 'dark';";
const sha = (s: string) =>
  `'sha256-${createHash('sha256').update(s).digest('base64')}'`;

function webDir() {
  const dir = mkdtempSync(join(tmpdir(), 'openrun-web-'));
  writeFileSync(
    join(dir, 'index.html'),
    `<html><head><script>${THEME}</script>` +
      '<script type="module" crossorigin src="/assets/index.js"></script>' +
      '</head><body></body></html>',
  );
  return dir;
}

describe('security headers', () => {
  it('allows only the page’s own inline script', () => {
    const html = `<script>${THEME}</script><script src="/a.js"></script>`;
    expect(inlineScriptHashes(html)).toEqual([sha(THEME)]);
  });

  it('sends a content security policy with every response', async () => {
    const { app } = setup({ WEB_DIR: webDir() });
    for (const path of ['/', '/api/health']) {
      const res = await app.request(path);
      const csp = res.headers.get('content-security-policy') ?? '';
      expect(csp).toContain(`script-src 'self' ${sha(THEME)}`);
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain('https://tile.openstreetmap.org');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      expect(res.headers.get('referrer-policy')).toBe(
        'strict-origin-when-cross-origin',
      );
      // Plain HTTP here, so no HSTS.
      expect(res.headers.get('strict-transport-security')).toBeNull();
    }
  });

  it('asks browsers to stay on HTTPS when served over it', async () => {
    const { app } = setup({ ORIGIN: 'https://run.example.com' });
    const res = await app.request('/api/health');
    expect(res.headers.get('strict-transport-security')).toBe(
      'max-age=31536000',
    );
  });
});
