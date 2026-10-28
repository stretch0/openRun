import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

// Later tests reuse the admin's session: signing in every test trips the
// auth rate limit.
const authFile = join(tmpdir(), `openrun-e2e-auth-${process.pid}.json`);

const admin = {
  name: 'Ada Runner',
  email: 'ada@example.com',
  password: 'correct horse battery',
};

test('first visit sets up the admin account', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Set up openRun' }),
  ).toBeVisible();

  await page.getByLabel('Name').fill(admin.name);
  await page.getByLabel('Email').fill(admin.email);
  await page.getByLabel('Password').fill(admin.password);
  await page.getByRole('button', { name: 'Create admin account' }).click();

  await expect(page.getByRole('heading', { name: /Hi Ada/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Admin' })).toBeVisible();
  await page.context().storageState({ path: authFile });
});

test('signs back in and creates an invite', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(admin.email);
  await page.getByLabel('Password').fill(admin.password);
  await page.getByRole('button', { name: 'Sign in with password' }).click();
  await expect(page.getByRole('heading', { name: /Hi Ada/ })).toBeVisible();

  await page.getByRole('link', { name: 'Admin' }).click();
  await page.getByRole('button', { name: 'Create invite' }).click();
  await expect(page.getByRole('button', { name: 'Copy link' })).toBeVisible();
});

/** A 2 km GPX run, sampled every 5 seconds, with heart rate. */
function gpxRun() {
  const start = Date.parse('2026-10-01T07:00:00Z');
  const points = Array.from({ length: 121 }, (_, k) => {
    const s = k * 5;
    const lat = (51.5 + (s * 3.5) / 111_195).toFixed(7);
    const time = new Date(start + s * 1000).toISOString();
    return `<trkpt lat="${lat}" lon="-0.1"><ele>${20 + k / 12}</ele><time>${time}</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${140 + (k % 15)}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>`;
  }).join('');
  return `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"><trk><name>Riverside loop</name><type>running</type><trkseg>${points}</trkseg></trk></gpx>`;
}

test.describe('signed in', () => {
  test.use({ storageState: authFile });

  test('imports a run, shows it and deletes it', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('No runs yet')).toBeVisible();

    await page.getByRole('link', { name: 'Add run' }).click();
    await page.getByLabel('Activity files').setInputFiles({
      name: 'riverside.gpx',
      mimeType: 'application/gpx+xml',
      buffer: Buffer.from(gpxRun()),
    });
    const results = page.getByRole('list', { name: 'Import results' });
    await expect(results.getByText('Imported')).toBeVisible();
    await results.getByRole('link', { name: 'View' }).click();

    await expect(
      page.getByRole('heading', { name: 'Riverside loop' }),
    ).toBeVisible();
    await expect(page.getByText('2.10 km')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Best efforts' }),
    ).toBeVisible();
    await expect(page.getByText('PB').first()).toBeVisible();
    await expect(
      page.getByRole('img', { name: 'Map of the route' }),
    ).toBeVisible();
    await expect(
      page.getByRole('group', { name: /Pace, heart rate/ }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Splits' })).toBeVisible();

    await page.getByRole('link', { name: '← Runs' }).click();
    await expect(
      page.getByRole('link', { name: /Riverside loop/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Personal bests' }),
    ).toBeVisible();

    await page.getByRole('link', { name: /Riverside loop/ }).click();
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('No runs yet')).toBeVisible();
  });

  test('adds a run by hand', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Add run' }).click();
    await page.getByLabel('Name').fill('Parkrun');
    await page.getByLabel('Distance (km)').fill('5');
    await page.getByLabel('Time').fill('24:30');
    await page.getByRole('button', { name: 'Save run' }).click();

    await expect(page.getByRole('heading', { name: 'Parkrun' })).toBeVisible();
    await expect(page.getByText('4:54 /km')).toBeVisible();
    await expect(page.getByText('PB')).toBeVisible();
  });

  test('tracks shoes, shows stats and exports', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Add shoes' }).click();
    await page.getByLabel('Name', { exact: true }).last().fill('Pegasus');
    await page.getByLabel(/Distance already on them/).fill('100');
    await page.getByRole('button', { name: 'Add shoes' }).click();
    await expect(page.getByText('100.00 km · 0 runs')).toBeVisible();

    await page.goto('/activities/new');
    await page.getByLabel('Name').fill('Tempo');
    await page.getByLabel('Distance (km)').fill('10');
    await page.getByLabel('Time').fill('45:00');
    await page.getByLabel('Shoes').selectOption({ label: 'Pegasus' });
    await page.getByRole('button', { name: 'Save run' }).click();
    await expect(page.getByRole('heading', { name: 'Tempo' })).toBeVisible();
    await expect(page.getByText('Pegasus')).toBeVisible();

    await page.getByRole('link', { name: 'Stats' }).click();
    await expect(page.getByRole('heading', { name: 'Stats' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Race predictions' }),
    ).toBeVisible();
    await expect(page.getByText(/VDOT/)).toBeVisible();
    await expect(
      page.getByRole('meter', { name: 'Pegasus wear' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Monthly' }).click();
    await expect(
      page.getByRole('group', { name: 'Monthly running distance' }),
    ).toBeVisible();

    await page.getByRole('link', { name: 'Settings' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Download CSV' }).click();
    const csv = await (await download).path();

    expect(readFileSync(csv, 'utf8')).toContain('Tempo,run,10000,2700');
  });
});

test.describe('privacy', () => {
  test.use({ storageState: authFile });

  test('shares nothing by default and trims shared maps', async ({ page }) => {
    await page.goto('/activities/new');
    await page.getByLabel('Activity files').setInputFiles({
      name: 'private.gpx',
      mimeType: 'application/gpx+xml',
      buffer: Buffer.from(gpxRun().replace('Riverside loop', 'Private loop')),
    });
    await page
      .getByRole('list', { name: 'Import results' })
      .getByRole('link', { name: 'View' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Private loop' }),
    ).toBeVisible();
    await expect(page.getByLabel('Who can see this run')).toHaveValue(
      'private',
    );

    // Maps aren't shared until the owner allows it.
    await page.getByRole('button', { name: 'What clubs see' }).click();
    await expect(
      page.getByText('Clubs see no map for this run.'),
    ).toBeVisible();
    const runUrl = page.url();

    await page.goto('/settings');
    await page.getByLabel('Who can see new runs').selectOption('clubs');
    await page
      .getByRole('checkbox', { name: /Include the map when sharing/ })
      .check();
    await page.getByRole('button', { name: 'Add a privacy zone' }).click();
    const zoneMap = page.getByRole('application', { name: /place the centre/ });
    await expect(zoneMap.locator('canvas')).toBeVisible();
    await zoneMap.click();
    await page.getByRole('button', { name: 'Save zone' }).click();
    await expect(page.getByText('Home · 500 m')).toBeVisible();

    await page.goto(runUrl);
    await page.getByRole('button', { name: 'What clubs see' }).click();
    await expect(
      page.getByRole('img', { name: 'Map of the route' }),
    ).toBeVisible();
    await expect(page.getByText('Clubs see no map for this run.')).toBeHidden();

    // New runs now default to shared.
    await page.goto('/activities/new');
    await expect(page.getByLabel('Who can see it')).toHaveValue('clubs');
  });

  test('explains who can see what before signing up', async ({ browser }) => {
    const page = await browser.newPage({ storageState: undefined });
    await page.goto('/register');
    await page.getByRole('link', { name: 'Who can see what' }).click();
    await expect(
      page.getByRole('heading', { name: 'Who can see what' }),
    ).toBeVisible();
    await expect(page.getByText(/There's no reset by email/)).toBeVisible();
    await page.close();
  });
});

test('serves an installable PWA', async ({ page, request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ name: 'openRun', display: 'standalone' });
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toContain(
    '512x512',
  );

  await page.goto('/login');
  const registered = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return Boolean(reg.active);
  });
  expect(registered).toBe(true);
});
