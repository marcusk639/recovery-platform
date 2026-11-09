import { expect, reseed, signInAs, test } from './helpers';

test.beforeEach(() => reseed());

test('a reload returns to a working screen without signing in again', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.click('#nav-residents');
  await expect(page.getByText('Bob Rivera')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Bob Rivera')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#sign-in-form')).toHaveCount(0);
});

test('the session is kept out of persistent storage', async ({ page }) => {
  await signInAs(page, 'manager');
  const stored = await page.evaluate(async () => ({
    local: JSON.stringify(localStorage),
    databases: (await indexedDB.databases()).map((d) => d.name),
    session: Object.keys(sessionStorage).some((k) => k.startsWith('firebase:authUser')),
  }));
  expect(stored.local).not.toContain('firebase:authUser');
  expect(stored.databases).not.toContain('firebaseLocalStorageDb');
  expect(stored.session).toBe(true);
});

test('a new tab has to sign in', async ({ page, context }) => {
  await signInAs(page, 'manager');
  const tab = await context.newPage();
  await tab.goto('/');
  await expect(tab.locator('#sign-in-form')).toBeVisible({ timeout: 15_000 });
});

test('a wrong password shows a message that does not say which part was wrong', async ({ page }) => {
  await page.goto('/');
  await page.locator('#sign-in-email').fill('test-manager@rats-e2e.com');
  await page.locator('#sign-in-password').fill('wrong-password');
  await page.locator('#sign-in-submit').click();
  await expect(page.getByRole('alert')).toContainText('email or password');
  await expect(page.locator('#sign-in-form')).toBeVisible();
});

test('the sign-in button cannot double-submit', async ({ page }) => {
  await page.goto('/');
  await page.locator('#sign-in-email').fill('test-manager@rats-e2e.com');
  await page.locator('#sign-in-password').fill(process.env.E2E_TEST_PASSWORD!);
  let signIns = 0;
  page.on('request', (r) => {
    if (r.url().includes('signInWithPassword')) signIns += 1;
  });
  await page.locator('#sign-in-submit').dblclick();
  await expect(page.locator('#nav-residents')).toBeVisible({ timeout: 20_000 });
  expect(signIns).toBe(1);
});

test('sign-in links to password reset on the existing site', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /forgot/i })).toHaveAttribute('href', /\/reset$/);
});
