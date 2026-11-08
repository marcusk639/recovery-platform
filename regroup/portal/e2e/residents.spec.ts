import fs from 'node:fs';
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
  await expect(icon).toBeVisible();
  const { text, family } = await icon.evaluate((el) => ({ text: el.textContent, family: getComputedStyle(el).fontFamily }));
  expect(text).not.toBe('?');
  expect(text!.length).toBeGreaterThan(0);
  expect(family).toMatch(/Ionicons|MaterialIcons|FontAwesome/);
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
