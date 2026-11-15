import type { Page } from '@playwright/test';
import { expect, reseed, signInAs, test } from './helpers';

test.beforeEach(() => reseed());

const open = (page: Page, route: string, params?: object) =>
  page.evaluate(([r, p]) => (window as any).__portalTest.open(r, p), [route, params] as const);

test('a screen opened with no params has a real URL, and reload returns to it', async ({ page }) => {
  await signInAs(page, 'manager');
  await open(page, 'HouseDisputes');
  await expect(page).toHaveURL(/\/houses\/test-house-123\/disputes$/);
  await page.reload();
  await expect(page).toHaveURL(/\/houses\/test-house-123\/disputes$/);
  await expect(page.locator('#nav-residents')).toBeVisible({ timeout: 15_000 });
});

test('a name passed in navigation params never reaches the URL', async ({ page }) => {
  await signInAs(page, 'manager');
  await open(page, 'Documents', { houseId: 'test-house-123', guestId: 'guest-a', title: 'Alice Documents' });
  await expect(page.getByTestId('document-list-screen')).toBeVisible();
  expect(page.url()).not.toContain('?');
  expect(page.url()).not.toContain('Alice');
});

test('the phone house button opens the house table', async ({ page }) => {
  await signInAs(page, 'manager');
  await open(page, 'HouseList');
  await expect(page.getByRole('link', { name: 'E2E Test House' })).toBeVisible();
  await expect(page.locator('#nav-residents')).toHaveCount(0);
});

test('a malformed house URL does not blank the page', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.goto('/houses/%E0%A4%A/residents');
  await expect(page.locator('#nav-home')).toBeVisible({ timeout: 15_000 });
});

test('going back after a reload goes up a level instead of saying it is unavailable', async ({ page }) => {
  await signInAs(page, 'manager');
  await open(page, 'Beds');
  await expect(page).toHaveURL(/\/houses\/test-house-123\/beds$/);
  await page.reload();
  await expect(page.locator('#nav-residents')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => (window as any).__portalTest.goBack());
  await expect(page).toHaveURL(/\/houses\/test-house-123$/);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});
