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
  await expect(
    page.getByRole('navigation').getByRole('link', { name: 'Admin' }),
  ).toBeVisible();
  await page.context().storageState({ path: authFile });
});

test('signs back in and creates an invite', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(admin.email);
  await page.getByLabel('Password').fill(admin.password);
  await page.getByRole('button', { name: 'Sign in with password' }).click();
  await expect(page.getByRole('heading', { name: /Hi Ada/ })).toBeVisible();

  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Admin' })
    .click();
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

  test('chooses which notifications to get', async ({ page }) => {
    await page.goto('/settings');
    const section = page.getByRole('region', { name: 'Notifications' });
    await expect(section.getByLabel('Run reminders')).toHaveValue('auto');
    await section.getByLabel('Run reminders').selectOption('1h');
    await section.getByLabel(/Coffee orders closing soon/).uncheck();
    await expect(
      section.getByLabel(/Coffee orders closing soon/),
    ).not.toBeChecked();
    await page.reload();
    await expect(section.getByLabel('Run reminders')).toHaveValue('1h');
    await expect(
      section.getByLabel(/Coffee orders closing soon/),
    ).not.toBeChecked();
  });

  test('tracks shoes, shows stats and exports', async ({ page }) => {
    await page.goto('/');

    await page
      .getByRole('navigation')
      .getByRole('link', { name: 'Settings' })
      .click();
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

    await page
      .getByRole('navigation')
      .getByRole('link', { name: 'Stats' })
      .click();
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

    await page
      .getByRole('navigation')
      .getByRole('link', { name: 'Settings' })
      .click();
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

test.describe('clubs', () => {
  test.use({ storageState: authFile });

  test('runs a club from invite to RSVP, coffee and sharing', async ({
    page,
    browser,
  }) => {
    await page.goto('/clubs');
    await page.getByRole('button', { name: 'Start a club' }).click();
    await page.getByLabel('Name').fill('Parkside Runners');
    await page.getByRole('button', { name: 'Create club' }).click();
    await expect(
      page.getByRole('heading', { name: 'Manage club' }),
    ).toBeVisible();

    // Every day, so there's always a run in the next few days.
    await page.getByLabel('Name', { exact: true }).first().fill('Club run');
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      await page.getByText(day, { exact: true }).click();
    }
    await page.getByRole('button', { name: 'Add repeating run' }).click();
    await expect(page.getByText(/Every Monday, .* at 08:00/)).toBeVisible();

    // Find the meeting point by searching for it.
    await page.route('**/api/places?*', (route) =>
      route.fulfill({
        json: [
          {
            name: 'Victoria Park',
            address: 'Victoria Park, London, E9, United Kingdom',
            lat: 51.536,
            lng: -0.039,
          },
        ],
      }),
    );
    await page.getByRole('button', { name: 'Add a meeting point' }).click();
    await page.getByLabel('Search for a place').fill('victoria park');
    await page.getByRole('button', { name: 'Search' }).click();
    await page
      .getByRole('list', { name: 'Places found' })
      .getByRole('button', { name: /Victoria Park/ })
      .click();
    // Picking a place fills in an empty name.
    await expect(page.locator('#pointName')).toHaveValue('Victoria Park');
    await page.getByRole('button', { name: 'Save meeting point' }).click();
    await expect(
      page.getByRole('listitem').filter({ hasText: 'Victoria Park' }),
    ).toBeVisible();

    // A café menu, for coffee after the run.
    await page.getByRole('button', { name: 'Add to the menu' }).click();
    await page.locator('#itemName').fill('Flat white');
    await page
      .getByLabel('Choices')
      .fill('Milk: Whole, Oat\nSize: Regular, Large');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('Milk: Whole, Oat')).toBeVisible();

    await page.getByRole('link', { name: '← Parkside Runners' }).click();
    const code = (
      await page
        .locator('section', { hasText: 'Invite people' })
        .locator('.font-mono')
        .textContent()
    )?.trim();
    expect(code).toMatch(/^[A-Z2-9]{8}$/);

    const firstRun = page.getByRole('article').first();
    await firstRun.getByRole('button', { name: 'Going' }).click();
    await expect(firstRun.getByText('1 going')).toBeVisible();
    await firstRun.getByRole('link').first().click();
    await expect(page.getByRole('heading', { name: '1 going' })).toBeVisible();
    const runUrl = page.url();

    // A second runner joins with the invite link and says maybe.
    const bea = await browser.newPage({ storageState: undefined });
    await bea.goto('/register');
    await bea.getByLabel('Name').fill('Bea');
    await bea.getByLabel('Email').fill('bea@example.com');
    await bea.getByLabel('Password').fill('correct horse battery');
    await bea.getByRole('button', { name: 'Create account' }).click();
    await expect(bea.getByRole('heading', { name: /Hi Bea/ })).toBeVisible();
    await bea.goto(`/clubs/join/${code}`);
    await expect(bea.getByText(/Your runs stay private/)).toBeVisible();
    await bea.getByRole('button', { name: 'Join Parkside Runners' }).click();
    await bea
      .getByRole('article')
      .first()
      .getByRole('button', { name: 'Maybe' })
      .click();
    await expect(
      bea.getByRole('article').first().getByText('1 maybe'),
    ).toBeVisible();
    await bea.close();

    await page.goto(runUrl);
    await expect(
      page.getByRole('heading', { name: '1 going · 1 maybe' }),
    ).toBeVisible();
    const attendees = page.locator('section', { hasText: '1 going' });
    await expect(
      attendees.getByText('Ada Runner', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Bea', { exact: true })).toBeVisible();

    // Coffee for tomorrow's run (today's may have closed already).
    await page.getByRole('link', { name: '← Parkside Runners' }).click();
    const nextRun = page.getByRole('article').nth(1);
    await nextRun.getByRole('button', { name: 'Going' }).click();
    await expect(nextRun.getByText('1 going')).toBeVisible();
    await nextRun.getByRole('link').first().click();
    const coffee = page.getByRole('region', { name: 'Coffee' });
    await coffee.getByRole('button', { name: 'Order a coffee' }).click();
    await coffee.getByLabel('Milk').selectOption('Oat');
    await coffee.getByRole('button', { name: 'Order', exact: true }).click();
    await expect(coffee.getByText('Flat white · Oat')).toBeVisible();

    // Anyone in the club can show the order list at the counter.
    await coffee.getByRole('link', { name: 'Order list (1)' }).click();
    const order = page.getByRole('region', { name: 'What to order' });
    await expect(order.getByText('1 × Flat white')).toBeVisible();
    await expect(order.getByText('1 × Oat')).toBeVisible();

    // It was saved as Ada's usual.
    await page.goto(runUrl.replace(/\/runs\/.*/, ''));
    await expect(
      page
        .getByRole('region', { name: 'Your usual' })
        .getByText('Flat white · Oat'),
    ).toBeVisible();

    // Share a run with the club: needs more than attendance only.
    const clubUrl = runUrl.replace(/\/runs\/.*/, '');
    await page
      .getByLabel('What you share with Parkside Runners')
      .selectOption('summaries');
    await expect(page.getByText(/Plus distance, time and pace/)).toBeVisible();
    await page.goto('/');
    await page
      .getByRole('link', { name: /Parkrun/ })
      .first()
      .click();
    const share = page.getByRole('region', { name: 'Share with clubs' });
    await share.getByRole('button', { name: 'Share' }).click();
    await expect(
      share.getByRole('button', { name: 'Take back' }),
    ).toBeVisible();
    await page.goto(clubUrl);
    await expect(
      page
        .getByRole('region', { name: 'Recently shared' })
        .getByText('Parkrun'),
    ).toBeVisible();

    // Highlights only name people who opt in.
    const highlights = page.getByRole('region', { name: 'Highlights' });
    await highlights.getByLabel(/Celebrate me in highlights/).check();
    await page.reload();
    await expect(
      highlights.getByLabel(/Celebrate me in highlights/),
    ).toBeChecked();

    // Ada hands the club to Bea and stays on as an organiser.
    await page.goto(`${clubUrl}/manage`);
    const handOver = page.locator('section', {
      hasText: 'Hand over the club',
    });
    await handOver.getByLabel('New owner').selectOption({ label: 'Bea' });
    page.once('dialog', (d) => d.accept());
    await handOver.getByRole('button', { name: 'Hand over' }).click();
    await expect(handOver).toBeHidden();
    await expect(
      page.locator('li', { hasText: 'Bea' }).getByText('Owner'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Delete club' }),
    ).toBeHidden();
  });

  test('syncs runs from intervals.icu', async ({ page }) => {
    await page.goto('/settings');
    const card = page.getByRole('region', { name: 'Sync from your watch' });
    await card.getByLabel('intervals.icu API key').fill('wrong-key');
    await card.getByRole('button', { name: 'Connect' }).click();
    await expect(card.getByText(/didn't accept that API key/)).toBeVisible();

    await card.getByLabel('intervals.icu API key').fill('a-good-api-key');
    await card.getByRole('button', { name: 'Connect' }).click();
    await expect(card.getByText('Connected to Test Runner')).toBeVisible();
    await expect(card.getByText(/1 run imported/)).toBeVisible();
    await card.getByText('Sync log').click();
    await expect(card.getByText('1 new')).toBeVisible();

    await page.goto('/');
    const run = page.getByRole('link', { name: /Towpath tempo/ });
    await expect(run.getByText('Garmin Forerunner 265')).toBeVisible();
    await run.click();
    await expect(
      page.getByRole('heading', { name: 'Towpath tempo' }),
    ).toBeVisible();
    await expect(page.getByText(/Garmin Forerunner 265/)).toBeVisible();

    await page.goto('/settings');
    page.once('dialog', (d) => d.accept());
    await card.getByRole('button', { name: 'Disconnect' }).click();
    await expect(card.getByLabel('intervals.icu API key')).toBeVisible();
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
  // The service worker shows push notifications.
  expect(await (await request.get('/sw.js')).text()).toContain(
    'push-handler.js',
  );
  expect((await request.get('/push-handler.js')).ok()).toBe(true);
});
