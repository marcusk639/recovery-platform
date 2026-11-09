import { addResidents, makeManager, makePeerLeader, setRooms, twoBedsOneFilled } from './fixtures';
import { admin, expect, reseed, signInAs, test } from './helpers';

// From regroup/mobile/e2e/setup/testAccounts.json. Bob Rivera is guest-b.
const guestAName = 'Test GuestA';

test.beforeEach(() => reseed({ E2E_RENT_CENTS: '15000' }));

test("the list shows a resident's details in columns", async ({ page }) => {
  await setRooms('test-house-123', twoBedsOneFilled);
  await admin().doc('guests/guest-a').update({ moveInDate: '2026-03-02' });
  await signInAs(page, 'manager');
  const row = page.getByTestId('guest-list-item').filter({ hasText: guestAName });
  await expect(row).toContainText(/active/i);
  await expect(row).toContainText('Default');
  await expect(row).toContainText('2A');
  await expect(row).toContainText('Mar 2, 2026');
  await expect(row).toContainText('$150.00');
});

test('filtering narrows the list by name', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.getByRole('searchbox', { name: 'Filter by name' }).fill('rivera');
  await expect(page.getByText('Bob Rivera')).toBeVisible();
  await expect(page.getByTestId('guest-list-item')).toHaveCount(1);
});

test('a filter that matches nobody says so', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.getByRole('searchbox', { name: 'Filter by name' }).fill('zzz');
  await expect(page.getByText('No residents match that name.')).toBeVisible();
});

test('sorting by balance puts the largest first', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.getByRole('button', { name: /Balance/ }).click();
  await page.getByRole('button', { name: /Balance/ }).click();
  await expect(page.getByTestId('guest-list-item').first()).toContainText('$150.00');
});

test('a house with no residents says so', async ({ page }) => {
  await signInAs(page, 'oxford-operator');
  await page.click('#nav-residents');
  await expect(page.getByText('No residents in this house yet.')).toBeVisible();
});

test('a long list can scroll to its last row', async ({ page }) => {
  await addResidents('test-house-123', 40);
  await signInAs(page, 'manager');
  const last = page.getByText('Zed Resident39');
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
});

test('a resident with a missing phase shows no score', async ({ page }) => {
  await admin().doc('guests/guest-b').update({ phase: 'Gone' });
  await signInAs(page, 'manager');
  const row = page.getByTestId('guest-list-item').filter({ hasText: 'Bob Rivera' });
  await expect(row).toContainText('No phase rules');
  await expect(row).not.toContainText('100%');
});

test('sort and filter are still there on coming back from a resident', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.getByRole('searchbox', { name: 'Filter by name' }).fill('rivera');
  await page.getByRole('link', { name: 'Bob Rivera' }).click();
  await expect(page).toHaveURL(/\/residents\/guest-b$/);
  await page.goBack();
  await expect(page.getByRole('searchbox', { name: 'Filter by name' })).toHaveValue('rivera');
  await expect(page.getByTestId('guest-list-item')).toHaveCount(1);
});

test('a peer leader sees no house money, balances, Payments or Reports', async ({ page }) => {
  await makePeerLeader('manager');
  await signInAs(page, 'manager');
  await expect(page.getByTestId('guest-list-item').first()).toBeVisible();
  await expect(page.getByTestId('guest-list-item').first()).not.toContainText('$');
  await expect(page.getByTestId('house-numbers')).not.toContainText('$');
  await expect(page.locator('#nav-disputes')).toBeVisible();
  await expect(page.locator('#nav-payments')).toHaveCount(0);
  await expect(page.locator('#nav-reports')).toHaveCount(0);
  await page.click('#nav-home');
  const house = page.getByRole('row', { name: /E2E Test House/ });
  await expect(house.getByRole('cell').nth(4)).toHaveText('1');
  await expect(house).not.toContainText('$');
  await expect(page.getByTestId('total-overdue')).toHaveCount(0);
});

test('a manager sees what an owner sees', async ({ page }) => {
  await makeManager('manager');
  await signInAs(page, 'manager');
  await expect(page.getByTestId('guest-list-item').filter({ hasText: guestAName })).toContainText('$150.00');
  await expect(page.getByTestId('house-numbers')).toContainText('$150.00');
  await expect(page.locator('#nav-payments')).toBeVisible();
  await expect(page.locator('#nav-reports')).toBeVisible();
  await page.click('#nav-home');
  await expect(page.getByTestId('total-overdue')).toHaveText(/\$150\.00/);
});

test('when the role cannot be confirmed, the limited view shows and says so', async ({ page }) => {
  await makeManager('manager');
  await page.route('**/myHouseTiers', (route) => route.abort());
  await signInAs(page, 'manager');
  await expect(page.getByTestId('role-notice')).toContainText("Couldn't confirm your role");
  await expect(page.getByTestId('house-numbers')).not.toContainText('$');
  await expect(page.locator('#nav-payments')).toHaveCount(0);
  await expect(page.locator('#nav-disputes')).toBeVisible();
});

test('an owner needs no role check', async ({ page }) => {
  await page.route('**/myHouseTiers', (route) => route.abort());
  await signInAs(page, 'manager');
  await expect(page.getByTestId('house-numbers')).toContainText('$150.00');
  await expect(page.getByTestId('role-notice')).toHaveCount(0);
});
