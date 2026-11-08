import type { Page } from '@playwright/test';
import { admin, expect, reseed, revokeClaimsAndRefresh, signInAs, test } from './helpers';

const rentOwed = async (guest: string) => (await admin().doc(`guests/${guest}`).get()).data()!.rentOwed;
const paymentsOf = async (guest: string, amount: number) =>
  (await admin().collection('payments').where('guestId', '==', guest).where('amount', '==', amount).get()).size;

test.beforeEach(() => {
  // Without a real connected account the callable fails, and these tests would
  // say nothing about the real payment data.
  expect(process.env.E2E_STRIPE_ACCOUNT_ID, 'set E2E_STRIPE_ACCOUNT_ID; see regroup/mobile/maestro/README.md').toBeTruthy();
  reseed({ E2E_RENT_CENTS: '15000' });
});

async function open(page: Page) {
  await signInAs(page, 'manager');
  await page.click('#nav-payments');
  await expect(page.getByTestId('payment-stats-card')).toBeVisible({ timeout: 15_000 });
}

async function fillForm(page: Page, guest: string, amount: string) {
  await page.getByTestId('manual-payment-fab').click();
  await expect(page.getByText('Record Manual Payment')).toBeVisible();
  await page.getByTestId(`guest-pill-${guest}`).click();
  await page.getByPlaceholder('Amount ($)').fill(amount);
}

const recordButton = (page: Page) => page.getByText('RECORD', { exact: true });

async function record(page: Page, guest: string, amount: string) {
  await open(page);
  await fillForm(page, guest, amount);
  await recordButton(page).click();
  await expect(page.getByText('Record Manual Payment')).toHaveCount(0);
}

test('the real callable loads with no error', async ({ page }) => {
  await open(page);
  await expect(page.getByText('Failed to load payment data.')).toHaveCount(0);
  await expect(page.getByTestId('overdue-residents-card')).toContainText('$150.00 owed');
});

test('Collected shows the real callable\'s dollars, not cents or dollars twice converted', async ({ page }) => {
  await open(page);
  await page.getByText('All Time', { exact: true }).click();
  const { data } = await page.evaluate(() =>
    (window as any).__portalTest.callable('listHousePayments', { houseId: 'test-house-123', limit: 100 }),
  );
  const dollars = data.payments
    .filter((p: { status: string }) => p.status === 'succeeded')
    .reduce((sum: number, p: { amount: number }) => sum + p.amount, 0);
  expect(dollars, 'the sandbox account needs at least one charge').toBeGreaterThan(0);
  await expect(page.getByTestId('payment-stats-card')).toContainText(`$${dollars.toFixed(2)}`);
});

test('recording $50 writes 5000 cents and lowers the balance in one batch', async ({ page }) => {
  await record(page, 'guest-a', '50.00');
  expect(await paymentsOf('guest-a', 5000)).toBe(1);
  expect(await rentOwed('guest-a')).toBe(10000);
  await expect(page.getByTestId('overdue-residents-card')).toContainText('$100.00 owed');
});

test('a cents value is not rounded wrongly', async ({ page }) => {
  await record(page, 'guest-a', '19.99');
  expect(await paymentsOf('guest-a', 1999)).toBe(1);
  expect(await rentOwed('guest-a')).toBe(13001);
});

test('a batch that cannot finish writes nothing', async ({ page }) => {
  await open(page);
  await fillForm(page, 'guest-a', '50.00');
  // The balance write will fail, so the payment in the same batch must not land.
  await admin().doc('guests/guest-a').delete();
  await recordButton(page).click();
  await expect(page.getByRole('alertdialog')).toContainText('Failed to record payment');
  expect(await paymentsOf('guest-a', 5000)).toBe(0);
});

// Finding, reported to the owner: parseFloat reads "1,500.00" as 1, and a desktop
// keyboard can type what the phone's decimal pad mostly blocks.
for (const typed of ['1,500.00', '1e3', '5OO']) {
  test(`an amount typed as ${typed} is refused, not misread`, async ({ page }) => {
    test.fail();
    await open(page);
    await fillForm(page, 'guest-a', typed);
    await recordButton(page).click();
    await page.waitForTimeout(800);
    expect(await rentOwed('guest-a')).toBe(15000);
  });
}

// Finding for P5: PaymentDashboard's handleRecord has no in-flight guard, so a
// double-click records two payments and lowers the balance twice. Fixing it
// means editing mobile code or guarding the portal's form, so it stays pinned.
test('double-clicking RECORD records one payment', async ({ page }) => {
  test.fail();
  await open(page);
  await fillForm(page, 'guest-a', '50.00');
  await recordButton(page).dblclick();
  await expect(page.getByText('Record Manual Payment')).toHaveCount(0);
  await page.waitForTimeout(1000);
  expect(await paymentsOf('guest-a', 5000)).toBe(1);
  expect(await rentOwed('guest-a')).toBe(10000);
});

test('a refused write shows an error they can dismiss, and changes nothing', async ({ page }) => {
  await open(page);
  await revokeClaimsAndRefresh(page, 'manager');
  await fillForm(page, 'guest-a', '50.00');
  await recordButton(page).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Failed to record payment');
  await dialog.getByRole('button', { name: 'OK' }).click();
  await expect(dialog).toHaveCount(0);
  expect(await rentOwed('guest-a')).toBe(15000);
  expect(await paymentsOf('guest-a', 5000)).toBe(0);
});

// Finding, reported to the owner: the phone does this too. Collected, the chart
// and the history come only from Stripe charges (listHousePayments), so cash never
// appears. These assert the behavior an operator would expect, and fail today.
test('a manual payment appears in the dashboard', async ({ page }) => {
  test.fail();
  await open(page);
  await fillForm(page, 'guest-a', '50.00');
  await recordButton(page).click();
  await expect(page.getByTestId('overdue-residents-card')).toContainText('$100.00 owed');
  await page.waitForTimeout(1500);
  await expect(page.getByText(/Manual Payment/).first()).toBeVisible({ timeout: 2000 });
});

test('Outstanding counts rent that is overdue', async ({ page }) => {
  test.fail();
  await open(page);
  await expect(page.getByTestId('payment-stats-card')).toContainText('$150.00', { timeout: 2000 });
});
