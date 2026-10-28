import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

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
