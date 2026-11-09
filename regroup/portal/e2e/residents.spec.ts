import fs from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, reseed, signInAs, test } from './helpers';

test.beforeAll(() => reseed());

test('manager signs in and sees seeded residents', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.click('#nav-residents');
  const row = page.getByTestId('guest-list-item').first();
  await expect(row).toBeVisible();
  expect((await row.boundingBox())!.height).toBeGreaterThan(20);
  await expect(page.getByText('Bob Rivera')).toBeVisible();
});

test('icons render real glyphs', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.click('#nav-residents');
  const icon = page.getByRole('img').first();
  // Retrying assertions: the screen can re-render its icons while data loads.
  await expect(icon).toHaveCSS('font-family', /Ionicons|MaterialIcons|FontAwesome/);
  await expect(icon).not.toHaveText('?');
  await expect(icon).not.toHaveText('');
});

test('reloading mid-session does not leave a blank page', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.reload();
  await expect(page.locator('#nav-residents, #sign-in-form').first()).toBeVisible({ timeout: 15_000 });
});

test('a link to a route the portal lacks fails visibly', async ({ page }) => {
  await signInAs(page, 'oxford-operator');
  await page.click('#nav-house-summary');
  await page.getByText('Oxford House Hub').click();
  await expect(page.getByRole('alertdialog')).toContainText("isn't available on the web yet");
});

test('records the time to the sign-in form for the go/no-go report', async ({ page }) => {
  const started = Date.now();
  await page.goto('/');
  await page.locator('#sign-in-form').waitFor();
  fs.writeFileSync('dist/load-time.json', JSON.stringify({ msToSignInForm: Date.now() - started }));
});

const openScreen = (page: Page, route: string) =>
  page.evaluate((r) => (window as any).__portalTest.open(r), route);

test('text is translated, not raw keys', async ({ page }) => {
  await signInAs(page, 'manager');
  await openScreen(page, 'EditUserInfo');
  await expect(page.getByText('Date of Birth', { exact: true })).toBeVisible();
  await expect(page.getByText('dateOfBirth', { exact: true })).toHaveCount(0);
});

test.describe('failures', () => {
  test.use({ allowPageErrors: true });

  test('a crashing screen leaves the navigation and shows an error', async ({ page }) => {
    await signInAs(page, 'manager');
    await openScreen(page, 'MedicationSummary');
    await expect(page.getByText('Something went wrong')).toBeVisible();
    await expect(page.locator('#nav-residents')).toBeVisible();
  });

  test('a deferred feature reached from a button fails visibly', async ({ page }) => {
    await signInAs(page, 'manager');
    await openScreen(page, 'EditUserInfo');
    await page.getByText('LIBRARY', { exact: true }).click();
    await expect(page.getByRole('alertdialog')).toContainText(/not available on the web yet/i);
  });
});
