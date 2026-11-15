import { addSecondHouseForManager, admin, expect, fillSignIn, reseed, SECOND_HOUSE, signInAs, test } from './helpers';

test.beforeEach(() => reseed());

const secondHouseLink = (page: import('@playwright/test').Page) => page.getByRole('link', { name: 'Second House' });

test('opening another house from home takes one click', async ({ page }) => {
  await addSecondHouseForManager();
  await signInAs(page, 'manager');
  await page.click('#nav-home');
  await secondHouseLink(page).click();
  await expect(page).toHaveURL(new RegExp(`/houses/${SECOND_HOUSE}$`));
  await page.click('#nav-residents');
  await expect(page.getByText('Cara Second')).toBeVisible();
  await expect(page.getByText('Bob Rivera')).toHaveCount(0);
});

test('Back across houses returns to the first house and its data', async ({ page }) => {
  await addSecondHouseForManager();
  await signInAs(page, 'manager');
  await expect(page.getByText('Bob Rivera')).toBeVisible();
  await page.click('#nav-home');
  await secondHouseLink(page).click();
  await page.click('#nav-residents');
  await expect(page.getByText('Cara Second')).toBeVisible();
  await page.goBack();
  await page.goBack();
  await page.goBack();
  await expect(page).toHaveURL(/\/houses\/test-house-123\/residents$/);
  await expect(page.getByText('Bob Rivera')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Cara Second')).toHaveCount(0);
});

test('a lapsed first house does not block an active second house', async ({ page }) => {
  await addSecondHouseForManager();
  await admin().doc('houses/test-house-123').update({ subscriptionStatus: 'canceled' });
  await page.goto(`/houses/${SECOND_HOUSE}/residents`);
  await fillSignIn(page, 'test-manager@rats-e2e.com');
  await expect(page.getByText('Cara Second')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('subscription-required-screen')).toHaveCount(0);
});

test('opening a lapsed house keeps the sidebar, so the operator can leave', async ({ page }) => {
  await addSecondHouseForManager('canceled');
  await signInAs(page, 'manager');
  await page.click('#nav-home');
  await secondHouseLink(page).click();
  await expect(page.getByTestId('subscription-required-screen')).toBeVisible({ timeout: 10_000 });
  await page.click('#nav-home');
  await page.getByRole('link', { name: 'E2E Test House' }).click();
  await page.click('#nav-residents');
  await expect(page.getByText('Bob Rivera')).toBeVisible();
});

test('Back to a screen with no house in its URL keeps its house', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.click('#nav-house-summary');
  await page.getByText('Issues', { exact: true }).first().click();
  await expect(page.getByTestId('guest-list-screen')).toHaveCount(0);
  await page.click('#nav-home');
  await page.goBack();
  await expect(page.locator('#nav-residents')).toHaveAttribute('href', '/houses/test-house-123/residents');
});

test('home lists houses from roles, for staff with no admin record', async ({ page }) => {
  await admin().doc('users/e2e-manager').update({ adminId: null });
  await signInAs(page, 'manager');
  await page.click('#nav-home');
  await expect(page.getByRole('link', { name: 'E2E Test House' })).toBeVisible({ timeout: 10_000 });
});
