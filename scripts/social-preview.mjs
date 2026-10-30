// Renders the repository's social preview card (1280x640) from the README
// screenshots, to docs/images/social-preview.png. Run it after
// scripts/screenshots.mjs, then upload the card in the repository's
// Settings → General → Social preview (GitHub has no API for it).
//
//   node scripts/social-preview.mjs
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const images = new URL('../docs/images/', import.meta.url);
const dataUrl = (name) =>
  `data:image/png;base64,${readFileSync(new URL(name, images)).toString('base64')}`;
const logo = readFileSync(
  new URL('../apps/web/public/favicon.svg', import.meta.url),
  'utf8',
);

const phone = (name, tilt, lift) => `
  <div class="phone" style="transform: translateY(${lift}px) rotate(${tilt}deg)">
    <img src="${dataUrl(name)}" alt="">
  </div>`;

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body {
    width: 1280px; height: 640px; overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif;
    background: linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%);
    color: #1c1917; display: flex; align-items: center;
  }
  .text { width: 560px; padding: 0 0 0 80px; }
  .brand { display: flex; align-items: center; gap: 18px; margin-bottom: 28px; }
  .brand svg { width: 72px; height: 72px; }
  .brand span { font-size: 56px; font-weight: 700; letter-spacing: -1px; }
  h1 { font-size: 40px; line-height: 1.15; font-weight: 700; letter-spacing: -0.5px; }
  p { margin-top: 20px; font-size: 24px; line-height: 1.4; color: #44403c; }
  .tags { margin-top: 28px; display: flex; gap: 10px; flex-wrap: wrap; }
  .tags span {
    background: #0d9488; color: #fff; border-radius: 999px;
    padding: 6px 16px; font-size: 18px; font-weight: 600;
  }
  .phones { position: relative; flex: 1; height: 100%; display: flex;
    align-items: center; justify-content: center; gap: 24px; padding-right: 40px; }
  .phone {
    width: 200px; border-radius: 28px; overflow: hidden; background: #fff;
    box-shadow: 0 24px 48px rgba(15, 118, 110, 0.25), 0 0 0 6px #1c1917;
  }
  .phone img { display: block; width: 100%; }
</style></head><body>
  <div class="text">
    <div class="brand">${logo}<span>openRun</span></div>
    <h1>The self-hosted running app for you and your run club</h1>
    <p>Run log, watch sync, RSVPs, weather and the coffee order. Your runs stay on your server.</p>
    <div class="tags"><span>Open source</span><span>Docker</span><span>PWA</span></div>
  </div>
  <div class="phones">
    ${phone('runs-light.png', -4, 20)}
    ${phone('run-light.png', 0, -20)}
    ${phone('club-run-light.png', 4, 20)}
  </div>
</body></html>`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const page = await browser.newPage({
  viewport: { width: 1280, height: 640 },
  deviceScaleFactor: 1,
});
await page.setContent(html);
await page.screenshot({ path: new URL('social-preview.png', images).pathname });
await browser.close();
console.log('docs/images/social-preview.png');
