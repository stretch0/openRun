// Takes the README screenshots from a running demo (DEMO_MODE=true).
//
//   node scripts/screenshots.mjs [url]     (default http://localhost:3000)
//
// Writes PNGs to docs/images/. Needs Playwright's Chromium, or CHROMIUM_PATH.
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const base = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '');
const out = new URL('../docs/images/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});

async function capture(theme) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: theme,
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const api = async (path) => (await page.request.get(base + path)).json();
  const shot = async (name) => {
    // Let maps load their tiles and charts finish animating.
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}${name}-${theme}.png` });
    console.log(`${name}-${theme}.png`);
  };

  await page.goto(`${base}/login`);
  await page.getByRole('button', { name: 'Try the demo' }).click();
  await page.waitForURL(`${base}/`);
  await shot('runs');

  const { items } = await api('/api/activities?limit=20');
  const long = items.find((a) => a.name === 'Saturday long run');
  await page.goto(`${base}/activities/${long.id}`);
  // Start at the map: the numbers above it are on the runs list already.
  await page.locator('.maplibregl-map').first().waitFor();
  await page.evaluate(() => {
    const map = document.querySelector('.maplibregl-map');
    window.scrollTo(0, map.getBoundingClientRect().top + window.scrollY - 64);
  });
  await shot('run');

  await page.goto(`${base}/stats`);
  await shot('stats');

  const [club] = await api('/api/clubs');
  await page.goto(`${base}/clubs/${club.id}`);
  await shot('club');

  await page.goto(`${base}/clubs/${club.id}/runs/${club.nextRun.id}`);
  await shot('club-run');

  await context.close();
}

await capture('light');
await capture('dark');
await browser.close();
