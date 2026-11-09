import { getAuth } from 'firebase-admin/auth';
import { admin, expect, reseed, signInAs, signInAsRaw, test } from './helpers';

test.beforeEach(() => reseed());

test('a resident is told to use the phone and can sign out', async ({ page }) => {
  await signInAsRaw(page, 'test-guest-a@rats-e2e.com');
  await expect(page.getByText(/use the Regroup app on your phone/i)).toBeVisible();
  await expect(page.locator('#nav-residents')).toHaveCount(0);
  await page.locator('#sign-out').click();
  await expect(page.locator('#sign-in-form')).toBeVisible();
});

test('a lapsed operator sees the subscription screen, not the portal', async ({ page }) => {
  await admin().doc('users/e2e-manager').update({ 'subscriptionMetadata.status': 'canceled' });
  await admin().doc('houses/test-house-123').update({ subscriptionStatus: 'canceled' });
  await signInAsRaw(page, 'test-manager@rats-e2e.com');
  await expect(page.getByTestId('subscription-required-screen')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('guest-list-item')).toHaveCount(0);
});

test('signing out then pressing Back shows no resident data', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.click('#nav-residents');
  await expect(page.getByText('Bob Rivera')).toBeVisible();
  await page.locator('#sign-out').click();
  await expect(page.locator('#sign-in-form')).toBeVisible();
  // Task 4's URLs add history entries, and shell.spec covers landing on the form.
  await page.goBack();
  await expect(page.getByText('Bob Rivera')).toHaveCount(0);
});

test('signing out never creates an anonymous user', async ({ page }) => {
  const before = (await getAuth().listUsers()).users.length;
  await signInAs(page, 'manager');
  await page.locator('#sign-out').click();
  await expect(page.locator('#sign-in-form')).toBeVisible();
  expect((await getAuth().listUsers()).users.length).toBe(before);
});
