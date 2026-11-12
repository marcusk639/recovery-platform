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

  await page.goto(RECORD);
  const verdict = page.getByText('Requirements not met', { exact: true });
  await expect(verdict).toBeVisible({ timeout: 20_000 });
  expect(await fontSize(verdict)).toBeLessThanOrEqual(18);
});
