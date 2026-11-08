import type { Page } from '@playwright/test';
import { admin, expect, reseed, revokeClaimsAndRefresh, signInAs, test } from './helpers';

const rentOwed = async (guest: string) => (await admin().doc(`guests/${guest}`).get()).data()!.rentOwed;
const paymentsOf = async (guest: string, amount: number) =>
  (await admin().collection('payments').where('guestId', '==', guest).where('amount', '==', amount).get()).size;

test.beforeEach(() => reseed({ E2E_RENT_CENTS: '15000' }));

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

// Finding, reported to the owner: this is what the phone does too. Collected,
// the chart and the history come only from Stripe charges (listHousePayments),
// and Outstanding counts only pending charges, not overdue rent. Pinned so a
// change here is noticed; it describes current behavior, not desired behavior.
test('a manual payment lowers the balance but stays out of the dashboard totals', async ({ page }) => {
  await open(page);
  const card = page.getByTestId('payment-stats-card');
  const before = await card.innerText();
  await fillForm(page, 'guest-a', '50.00');
  await recordButton(page).click();
  await expect(page.getByTestId('overdue-residents-card')).toContainText('$100.00 owed');
  await page.waitForTimeout(1500);
  expect(await card.innerText()).toBe(before);
  await expect(page.getByText(/Manual Payment/)).toHaveCount(0);
  expect(before).toContain('Outstanding\n$0.00');
});
