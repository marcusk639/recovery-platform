import { addResidents, makeManager, makePeerLeader, setRooms, setWeekStats, twoBedsOneFilled } from './fixtures';
import { addSecondHouseForManager, admin, expect, fillSignIn, reseed, SECOND_HOUSE, signInAs, test } from './helpers';

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

const record = (id: string) => `/houses/test-house-123/residents/${id}`;

test('clicking a resident opens their record, by id', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.getByRole('link', { name: 'Bob Rivera' }).click();
  await expect(page).toHaveURL(/\/houses\/test-house-123\/residents\/guest-b$/);
  await expect(page.getByRole('heading', { name: 'Bob Rivera' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Bob Rivera');
  expect(page.url()).not.toContain('Bob');
});

test('the record shows status, phase, room, move-in and money', async ({ page }) => {
  await setRooms('test-house-123', twoBedsOneFilled);
  await admin().doc('guests/guest-a').update({ moveInDate: '2026-03-02', choreFees: 2500, autoPayEnabled: true });
  await page.goto(record('guest-a'));
  await fillSignIn(page, 'test-manager@rats-e2e.com');
  const header = page.getByTestId('record-header');
  await expect(header).toContainText(/active/i);
  await expect(header).toContainText('Default');
  await expect(header).toContainText('Room 2A');
  await expect(header).toContainText('Mar 2, 2026');
  const money = page.getByTestId('record-payments');
  await expect(money).toContainText('$150.00');
  await expect(money).toContainText('$25.00');
  await expect(money).toContainText('On');
});

test('this week matches the list', async ({ page }) => {
  await setWeekStats('guest-b', { choresCompleted: 1 });
  await signInAs(page, 'manager');
  await expect(page.getByTestId('guest-list-item').filter({ hasText: 'Bob Rivera' })).toContainText('50%');
  await page.getByRole('link', { name: 'Bob Rivera' }).click();
  await expect(page.getByTestId('record-week')).toContainText('50%');
});

test('sensitive fields show, and a probation officer shows only as on file', async ({ page }) => {
  await admin().doc('guests/guest-a').update({ legalStatus: 'parole', probationOfficer: 'Officer Name' });
  await page.goto(record('guest-a'));
  await fillSignIn(page, 'test-manager@rats-e2e.com');
  const legal = page.getByTestId('record-recovery');
  await expect(legal).toContainText('Jan 1, 2025');
  await expect(legal).toContainText(/parole/i);
  await expect(legal).toContainText('On file');
  await expect(legal).not.toContainText('Officer Name');
});

test('a peer leader sees the balance but not the legal fields', async ({ page }) => {
  await admin().doc('guests/guest-a').update({ legalStatus: 'parole' });
  await makePeerLeader('manager');
  await page.goto(record('guest-a'));
  await fillSignIn(page, 'test-manager@rats-e2e.com');
  await expect(page.getByTestId('record-payments')).toContainText('$150.00');
  const recovery = page.getByTestId('record-recovery');
  await expect(recovery).toContainText('Jan 1, 2025');
  await expect(recovery).not.toContainText(/parole|legal status|probation/i);
});

test('a manager sees the legal fields', async ({ page }) => {
  await admin().doc('guests/guest-a').update({ legalStatus: 'parole' });
  await makeManager('manager');
  await page.goto(record('guest-a'));
  await fillSignIn(page, 'test-manager@rats-e2e.com');
  await expect(page.getByTestId('record-recovery')).toContainText(/parole/i);
});

test('a resident with no activity this week shows 0%, not an error', async ({ page }) => {
  await addResidents('test-house-123', 1);
  await page.goto(record('zed0'));
  await fillSignIn(page, 'test-manager@rats-e2e.com');
  const week = page.getByTestId('record-week');
  await expect(week).toContainText(/(^|\D)0%/);
  await expect(week).toContainText('No activity logged this week.');
  await expect(week).not.toContainText("Couldn't load");
});

test("open items count this resident's disputes", async ({ page }) => {
  await page.goto(record('guest-a'));
  await fillSignIn(page, 'test-manager@rats-e2e.com');
  await expect(page.getByTestId('record-open-items')).toContainText('1 open dispute');
});

test('a resident in another house gets a message and none of their data', async ({ page }) => {
  await addSecondHouseForManager();
  await page.goto(`/houses/${SECOND_HOUSE}/residents/guest-a`);
  await fillSignIn(page, 'test-manager@rats-e2e.com');
  await expect(page.getByText("This resident isn't in this house.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('record-header')).toHaveCount(0);
  await expect(page.getByText(guestAName)).toHaveCount(0);
});

test('a resident who does not exist gets a message', async ({ page }) => {
  await page.goto(record('no-such-guest'));
  await fillSignIn(page, 'test-manager@rats-e2e.com');
  await expect(page.getByText("Couldn't open this resident.")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#nav-residents')).toBeVisible();
});

test('a resident in a house the operator does not run is refused by the gate', async ({ page }) => {
  await page.goto(record('guest-a'));
  await fillSignIn(page, 'test-oxford-operator@rats-e2e.com');
  await expect(page.getByText(/don't have access to this house/i)).toBeVisible({ timeout: 20_000 });
});

test("a discharged resident's record still opens, and says so", async ({ page }) => {
  await admin().doc('guests/guest-b').update({ status: 'discharged' });
  await page.goto(record('guest-b'));
  await fillSignIn(page, 'test-manager@rats-e2e.com');
  await expect(page.getByTestId('record-header')).toContainText(/discharged/i);
});

test('a record survives a reload', async ({ page }) => {
  await page.goto(record('guest-b'));
  await fillSignIn(page, 'test-manager@rats-e2e.com');
  await expect(page.getByRole('heading', { name: 'Bob Rivera' })).toBeVisible({ timeout: 20_000 });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Bob Rivera' })).toBeVisible({ timeout: 20_000 });
});

test('links from the record open that resident in the reused screen, with no name in the URL', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.getByRole('link', { name: 'Bob Rivera' }).click();
  await page.getByRole('link', { name: 'Full profile' }).click();
  await expect(page).toHaveURL(/\/residents\/guest-b\/profile$/);
  await expect(page.getByTestId('screen-body')).toContainText('Bob');
  await page.goBack();
  await expect(page).toHaveURL(/\/residents\/guest-b$/);
  await page.getByRole('button', { name: 'Documents' }).click();
  await expect(page.getByTestId('document-list-screen')).toBeVisible();
  expect(page.url()).not.toContain('?');
  expect(page.url()).not.toContain('Bob');
});

test('a resident chosen in one house does not carry into the next', async ({ page }) => {
  await addSecondHouseForManager();
  await page.goto(record('guest-b'));
  await fillSignIn(page, 'test-manager@rats-e2e.com');
  await expect(page.getByRole('heading', { name: 'Bob Rivera' })).toBeVisible({ timeout: 20_000 });
  await page.click('#nav-home');
  await page.getByRole('link', { name: 'Second House' }).click();
  await expect(page.locator('#nav-residents')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__portalTest.selectedGuestId())).toBeNull();
});

// Entered through the app: a page opened by URL leaves nothing to go Back to but about:blank.
test('signing out from a record then pressing Back shows no resident data', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.getByRole('link', { name: 'Bob Rivera' }).click();
  await expect(page.getByRole('heading', { name: 'Bob Rivera' })).toBeVisible({ timeout: 20_000 });
  await page.locator('#sign-out').click();
  await expect(page.locator('#sign-in-form')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#sign-in-form')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Bob Rivera')).toHaveCount(0);
});

test('a peer leader who opens Payments by URL is told it is not for their role', async ({ page }) => {
  await makePeerLeader('manager');
  await page.goto('/houses/test-house-123/payments');
  await fillSignIn(page, 'test-manager@rats-e2e.com');
  await expect(page.getByText("This page isn't available for your role.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('screen-body')).not.toContainText('$');
});

test('a manager who opens Payments by URL gets the page', async ({ page }) => {
  await makeManager('manager');
  await page.goto('/houses/test-house-123/payments');
  await fillSignIn(page, 'test-manager@rats-e2e.com');
  await expect(page.locator('#nav-payments')).toHaveAttribute('aria-current', 'page', { timeout: 20_000 });
  await expect(page.getByText("This page isn't available for your role.")).toHaveCount(0);
});
