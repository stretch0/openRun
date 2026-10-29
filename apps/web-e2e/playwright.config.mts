import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Kept free of @nx/* imports: Nx's native module fails to load inside Playwright's config loader.
const workspaceRoot = resolve(import.meta.dirname, '../..');

const port = 3100;
const baseURL = process.env['BASE_URL'] || `http://localhost:${port}`;

// Each run starts from an empty database.
const dataDir = mkdtempSync(join(tmpdir(), 'openrun-e2e-'));

export default defineConfig({
  testDir: './src',
  outputDir: './test-output/playwright/output',
  reporter: [
    ['list'],
    [
      'html',
      { outputFolder: './test-output/playwright/report', open: 'never' },
    ],
  ],
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  // Runs the production setup: the API serving the built PWA on one origin.
  webServer: process.env['BASE_URL']
    ? undefined
    : {
        command:
          'npx nx run-many -t build -p api web && node apps/api/dist/main.js',
        url: `${baseURL}/api/health`,
        reuseExistingServer: false,
        timeout: 180_000,
        cwd: workspaceRoot,
        env: {
          NODE_ENV: 'production',
          PORT: String(port),
          ORIGIN: baseURL,
          BETTER_AUTH_SECRET: randomBytes(32).toString('base64'),
          DATA_DIR: dataDir,
          WEB_DIR: 'apps/web/dist',
          // Tests stub place search in the browser; never reach a real geocoder.
          PLACE_SEARCH_URL: 'http://127.0.0.1:9/search',
          WEATHER_URL: '',
        },
      },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { executablePath: process.env['CHROMIUM_PATH'] },
      },
    },
  ],
});
