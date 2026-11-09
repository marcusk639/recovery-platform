import { getAuth } from 'firebase-admin/auth';
import { admin, expect, fillSignIn, removeFromHouse, reseed, signInAs, signInAsRaw, test } from './helpers';

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
  // The check is per house, so Home stays open and the house shows the notice.
  await page.goto('/houses/test-house-123/residents');
  await fillSignIn(page, 'test-manager@rats-e2e.com');
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

test('losing access while the tab is open replaces the portal with a message', async ({ page }) => {
  await signInAs(page, 'manager');
  await expect(page.getByText('Bob Rivera')).toBeVisible();
  await removeFromHouse('manager');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText(/use the Regroup app|don't have access/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Bob Rivera')).toHaveCount(0);
});

test('claims refresh on the interval too, with the tab in the background', async ({ page }) => {
  await page.clock.install();
  await signInAs(page, 'manager');
  await expect(page.getByText('Bob Rivera')).toBeVisible();
  await removeFromHouse('manager');
  await page.mouse.move(5, 5);
  await page.clock.fastForward('10:01');
  await expect(page.getByText('Bob Rivera')).toHaveCount(0, { timeout: 10_000 });
});

test('a promotion takes effect without signing in again', async ({ page }) => {
  await signInAsRaw(page, 'test-guest-a@rats-e2e.com');
  await expect(page.getByText(/use the Regroup app on your phone/i)).toBeVisible();
  const user = await getAuth().getUserByEmail('test-guest-a@rats-e2e.com');
  await getAuth().setCustomUserClaims(user.uid, { admin: { 'test-house-123': true } });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('#nav-home')).toBeVisible({ timeout: 10_000 });
});

test('a failed refresh, as when offline, keeps the current screen', async ({ page, context }) => {
  await signInAs(page, 'manager');
  await expect(page.getByText('Bob Rivera')).toBeVisible();
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(1000);
  await expect(page.getByText('Bob Rivera')).toBeVisible();
  await context.setOffline(false);
});

test('a disabled account is signed out and its data is gone', async ({ page }) => {
  await signInAs(page, 'manager');
  await expect(page.getByText('Bob Rivera')).toBeVisible();
  await getAuth().updateUser('e2e-manager', { disabled: true });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('#sign-in-form')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Bob Rivera')).toHaveCount(0);
});

test('a subscription that lapses while the tab is open is noticed', async ({ page }) => {
  await signInAs(page, 'manager');
  await expect(page.getByText('Bob Rivera')).toBeVisible();
  await admin().doc('houses/test-house-123').update({ subscriptionStatus: 'canceled' });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByTestId('subscription-required-screen')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Bob Rivera')).toHaveCount(0);
});
