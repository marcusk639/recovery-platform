// How the reused phone screens sit at a desk (P9).
import type { Locator } from '@playwright/test';
import { expect, reseed, signInAs, test } from './helpers';

const HOUSE = '/houses/test-house-123';
const RECORD = `${HOUSE}/residents/guest-a`;

const fontSize = (target: Locator) =>
  target.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

test.beforeAll(() => reseed());

test('reused screens use phone type at a desk', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.goto(`${HOUSE}/activities`);
  const name = page.getByText('Bob Rivera', { exact: true }).first();
  await expect(name).toBeVisible({ timeout: 20_000 });
  expect(await fontSize(name)).toBeLessThanOrEqual(18);

  // The week's summary comes from a server trigger after the seed, so the
  // breakdown can be missing on the first look.
  const verdict = page.getByText('Requirements not met', { exact: true });
  await expect(async () => {
    await page.goto(RECORD);
    await expect(verdict).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
  expect(await fontSize(verdict)).toBeLessThanOrEqual(18);
});

const MAIN_LEFT = 160;
const READABLE = 960;
const right = (target: Locator) => target.evaluate((el) => el.getBoundingClientRect().right);
const pageOverflow = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test('reused screens keep a readable width', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.goto(`${HOUSE}/activities`);
  const dispute = page.getByText('DISPUTE', { exact: true }).first();
  await expect(dispute).toBeVisible({ timeout: 20_000 });
  expect(await right(dispute)).toBeLessThanOrEqual(MAIN_LEFT + READABLE);

  await page.evaluate(() => (window as any).__portalTest.open('ResidentIntake', { houseId: 'test-house-123' }));
  const inputs = page.locator('main input');
  await expect(inputs.first()).toBeVisible({ timeout: 20_000 });
  for (const width of await inputs.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width)))
    expect(width).toBeLessThanOrEqual(READABLE);

  for (const path of [`${RECORD}/notes`, `${HOUSE}/shift-log`]) {
    await page.goto(path);
    await expect(page.getByTestId('staff-note-input')).toBeVisible({ timeout: 20_000 });
    expect(await pageOverflow(page)).toBe(0);
  }
});

test("the portal's own pages keep the full width", async ({ page }) => {
  await signInAs(page, 'manager');
  const table = page.locator('main table').first();
  await expect(table).toBeVisible({ timeout: 20_000 });
  expect(await table.evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThan(1100);
});

// The wrapper around a reused screen, or the whole screen body before there is one.
const frameRight = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const frame = document.querySelector('[data-testid="reused-screen"]') ?? document.querySelector('[data-testid="screen-body"]');
    return frame!.getBoundingClientRect().right;
  });

for (const width of [1440, 1024]) {
  test(`intake's steps fit the screen at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await signInAs(page, 'manager');
    await page.evaluate(() => (window as any).__portalTest.open('ResidentIntake', { houseId: 'test-house-123' }));
    const legal = page.getByText('Legal', { exact: true });
    await expect(legal).toBeVisible({ timeout: 20_000 });
    expect(await pageOverflow(page)).toBe(0);
    expect(await right(legal)).toBeLessThanOrEqual(await frameRight(page));
  });
}
