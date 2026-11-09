import { expect, fillSignIn, reseed, signInAs, test } from './helpers';

test.beforeEach(() => reseed());

test('a house URL opens that house after sign-in', async ({ page }) => {
  await page.goto('/houses/test-house-123/residents');
  await fillSignIn(page, 'test-manager@rats-e2e.com');
  await expect(page.getByText('Bob Rivera')).toBeVisible({ timeout: 20_000 });
  expect(new URL(page.url()).pathname).toBe('/houses/test-house-123/residents');
});

test('sidebar links change the URL, and Back returns', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.click('#nav-disputes');
  await expect(page).toHaveURL(/\/houses\/test-house-123\/disputes$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/houses\/test-house-123\/residents$/);
  await expect(page.getByText('Bob Rivera')).toBeVisible();
});

test('a sidebar link replaces the screen rather than stacking it', async ({ page }) => {
  await signInAs(page, 'manager');
  await expect(page.getByText('Bob Rivera')).toHaveCount(1);
  await page.click('#nav-disputes');
  await expect(page).toHaveURL(/disputes$/);
  await expect(page.getByTestId('guest-list-screen')).toHaveCount(0);
  await page.click('#nav-residents');
  await expect(page.getByText('Bob Rivera')).toHaveCount(1);
});

test("home lists the operator's houses and links into one", async ({ page }) => {
  await signInAs(page, 'manager');
  await page.click('#nav-home');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#nav-residents')).toHaveCount(0);
  await page.getByRole('link', { name: 'E2E Test House' }).click();
  await expect(page).toHaveURL(/\/houses\/test-house-123$/);
  await expect(page.locator('#nav-residents')).toBeVisible();
});

test('a house the operator does not run shows a message and no residents', async ({ page }) => {
  const reads: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes(':18080') && (r.postData() ?? '').includes('test-house-123')) reads.push(r.url());
  });
  await page.goto('/houses/test-house-123/residents');
  await fillSignIn(page, 'test-oxford-operator@rats-e2e.com');
  await expect(page.getByText(/don't have access to this house/i)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Bob Rivera')).toHaveCount(0);
  await expect(page.locator('#nav-residents')).toHaveCount(0);
  expect(reads).toEqual([]);
});

test('an unknown URL lands on the house list', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.goto('/no/such/page');
  await expect(page.getByRole('link', { name: 'E2E Test House' })).toBeVisible({ timeout: 15_000 });
});

test('signing out then pressing Back lands on the sign-in form', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.click('#nav-disputes');
  await expect(page).toHaveURL(/disputes$/);
  await page.locator('#sign-out').click();
  await expect(page.locator('#sign-in-form')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#sign-in-form')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Bob Rivera')).toHaveCount(0);
});

test('the phone theme fonts resolve to readable faces', async ({ page }) => {
  await signInAs(page, 'manager');
  const families = await page.evaluate(() => [...document.fonts].map((f) => f.family.replace(/"/g, '')));
  for (const family of ['Quicksand-Bold', 'Quicksand-Medium', 'Quicksand-Light']) expect(families).toContain(family);
});

test.describe('after a crash', () => {
  test.use({ allowPageErrors: true });
  test('clicking a sidebar link leaves a crashed screen', async ({ page }) => {
    await signInAs(page, 'manager');
    await page.evaluate(() => (window as any).__portalTest.open('MedicationSummary'));
    await expect(page.getByText('Something went wrong')).toBeVisible();
    await page.click('#nav-residents');
    await expect(page.getByText('Bob Rivera')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#sign-in-form')).toHaveCount(0);
  });
});
