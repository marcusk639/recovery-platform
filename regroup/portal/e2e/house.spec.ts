import { addSecondHouseForManager, admin, expect, reseed, signInAs, test } from './helpers';

test.beforeEach(() => reseed({ E2E_RENT_CENTS: '15000' }));

test('clicking a house shows its breadcrumb, numbers and residents', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.click('#nav-home');
  await page.getByRole('link', { name: 'E2E Test House' }).click();
  await expect(page).toHaveURL(/\/houses\/test-house-123$/);
  const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(crumbs).toContainText('All houses');
  await expect(crumbs).toContainText('E2E Test House');
  await expect(page.getByTestId('house-numbers')).toContainText('$150.00');
  await expect(page.getByText('Bob Rivera')).toBeVisible();
});

test('the breadcrumb goes back to all houses', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'All houses' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('tabs change the section and mark the current one', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.click('#nav-disputes');
  await expect(page).toHaveURL(/\/houses\/test-house-123\/disputes$/);
  await expect(page.locator('#nav-disputes')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#nav-residents')).not.toHaveAttribute('aria-current', 'page');
});

test('the sidebar holds only Houses and sign out', async ({ page }) => {
  await signInAs(page, 'manager');
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link')).toHaveCount(1);
  await expect(page.locator('#sign-out')).toBeVisible();
});

test('every tab fits a narrow window without scrolling the page sideways', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await signInAs(page, 'manager');
  await expect(page.locator('#nav-reports')).toBeInViewport();
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(fits).toBe(true);
});

test('a lapsed house shows no tabs', async ({ page }) => {
  await addSecondHouseForManager('canceled');
  await signInAs(page, 'manager');
  await page.click('#nav-home');
  await page.getByRole('link', { name: 'Second House' }).click();
  await expect(page.getByTestId('subscription-required-screen')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#nav-residents')).toHaveCount(0);
});

test('a reused screen keeps the breadcrumb but not the numbers', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.click('#nav-disputes');
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('E2E Test House');
  await expect(page.getByTestId('house-numbers')).toHaveCount(0);
});

test('a house with no scored residents shows no 0% health', async ({ page }) => {
  await signInAs(page, 'oxford-operator');
  await page.click('#nav-house-summary');
  await expect(page.getByTestId('house-numbers')).toBeVisible();
  await expect(page.getByTestId('house-numbers')).not.toContainText('0%');
});

test('opening a house page writes nothing', async ({ page }) => {
  await signInAs(page, 'manager');
  // After sign-in, which writes to its own account.
  const writes: string[] = [];
  page.on('request', (r) => {
    const isWrite = r.method() === 'POST' && r.url().includes(':18080') && r.url().includes('/Write/');
    if (isWrite && (r.postData() ?? '').includes('writes')) writes.push(r.url());
  });
  await page.click('#nav-house-summary');
  await expect(page.getByTestId('house-numbers')).toBeVisible();
  await page.waitForTimeout(2000);
  expect(writes).toEqual([]);
  await page.evaluate(() => (window as any).__portalTest.writeProbe());
  await expect.poll(() => writes.length, { message: 'control: the watcher sees writes' }).toBeGreaterThan(0);
});

test('money owed by discharged residents is called out', async ({ page }) => {
  await admin().doc('guests/guest-b').update({ status: 'discharged', rentOwed: 5000 });
  await signInAs(page, 'manager');
  await page.click('#nav-house-summary');
  const numbers = page.getByTestId('house-numbers');
  await expect(numbers).toContainText('$200.00');
  await expect(numbers).toContainText('includes $50.00 from discharged residents');
});

test('the page title never holds a house or resident name', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.click('#nav-house-summary');
  await expect(page.getByTestId('house-numbers')).toBeVisible();
  expect(await page.title()).not.toMatch(/E2E Test House|Bob|Rivera/);
});
