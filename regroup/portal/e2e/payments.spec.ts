import type { Page } from '@playwright/test';
import { clearPayments } from './fixtures';
import { admin, expect, reseed, revokeClaimsAndRefresh, signInAs, test } from './helpers';

const rentOwed = async (guest: string) => (await admin().doc(`guests/${guest}`).get()).data()!.rentOwed;
const paymentsOf = async (guest: string, amount: number) =>
  (await admin().collection('payments').where('guestId', '==', guest).where('amount', '==', amount).get()).size;

// The dashboard reads the house's Firestore payment records (#191), so these
// need no Stripe account; only the failed-payment banner calls Stripe.
test.beforeEach(async () => {
  reseed({ E2E_RENT_CENTS: '15000' });
  await clearPayments();
});

const HOUSE = 'test-house-123';
async function addRecord(fields: Record<string, unknown> & { id: string; guestId: string }) {
  const guest = (await admin().doc(`guests/${fields.guestId}`).get()).data()!;
  await admin().doc(`payments/${fields.id}`).set({
    houseId: HOUSE,
    guestUserId: guest.userId ?? null,
    currency: 'usd',
    description: 'Rent',
    createdAt: new Date().toISOString(),
    ...fields,
  });
}

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

test('the dashboard loads with no error', async ({ page }) => {
  await open(page);
  await expect(page.getByText('Failed to load payment data.')).toHaveCount(0);
  await expect(page.getByTestId('overdue-residents-card')).toContainText('$150.00 owed');
});

test("Collected is the house's payment records, net of refunds", async ({ page }) => {
  await addRecord({ id: 'pay-c1', guestId: 'guest-a', amount: 20000, status: 'succeeded', description: 'Manual Payment — Cash' });
  await addRecord({ id: 'pay-c2', guestId: 'guest-a', amount: 10000, status: 'succeeded', refundedAmountCents: 4000 });
  await addRecord({ id: 'pay-c3', guestId: 'guest-a', amount: 50000, status: 'failed' });
  // The webhook's unsupported-currency path: no cents amount.
  await addRecord({ id: 'pay-c4', guestId: 'guest-a', amountMinorUnits: 900, currency: 'eur', status: 'succeeded' });
  await open(page);
  await page.getByText('All Time', { exact: true }).click();
  await expect(page.getByTestId('payment-stats-card')).toContainText('$260.00');
  await expect(page.locator('body')).not.toContainText('NaN');
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

// #189: a desktop keyboard can type what the phone's decimal pad mostly blocks.
test('an amount typed as 1,500.00 records $1,500.00, not $1.00', async ({ page }) => {
  await record(page, 'guest-a', '1,500.00');
  expect(await paymentsOf('guest-a', 150000)).toBe(1);
  expect(await rentOwed('guest-a')).toBe(15000 - 150000);
});

for (const typed of ['1e3', '5OO', '12,34']) {
  test(`an amount typed as ${typed} is refused, not misread`, async ({ page }) => {
    await open(page);
    await fillForm(page, 'guest-a', typed);
    await recordButton(page).click();
    await expect(page.getByTestId('manual-payment-amount-error')).toBeVisible();
    expect(await rentOwed('guest-a')).toBe(15000);
  });
}

// #190: a double-click recorded two payments.
test('double-clicking RECORD records one payment', async ({ page }) => {
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
  // The form stays open with no success state, and the balance on screen is unchanged.
  await expect(page.getByText('Record Manual Payment')).toBeVisible();
  await page.getByText('CANCEL', { exact: true }).click();
  await expect(page.getByTestId('overdue-residents-card')).toContainText('$150.00 owed');
  expect(await rentOwed('guest-a')).toBe(15000);
  expect(await paymentsOf('guest-a', 5000)).toBe(0);
});

// #191: the dashboard read only Stripe charges, so cash never appeared.
test('a manual payment appears in the dashboard', async ({ page }) => {
  await open(page);
  await fillForm(page, 'guest-a', '50.00');
  await recordButton(page).click();
  await expect(page.getByTestId('overdue-residents-card')).toContainText('$100.00 owed');
  await expect(page.getByText(/Manual Payment/).first()).toBeVisible();
});

// #183 item 6: Outstanding was pending Stripe charges.
test('Outstanding counts rent that is overdue', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('payment-stats-card')).toContainText('$150.00');
});

test('Outstanding is what current residents owe, not credits or residents who left', async ({ page }) => {
  await admin().doc('guests/guest-b').update({ rentOwed: -5000, choreFees: 0 });
  await admin().doc('guests/guest-c').set({
    ...(await admin().doc('guests/guest-a').get()).data(),
    id: 'guest-c', userId: 'nobody', status: 'discharged', rentOwed: 9000, choreFees: 0,
  });
  await open(page);
  const stats = page.getByTestId('payment-stats-card');
  await expect(stats).toContainText('$150.00');
  await expect(stats).not.toContainText('100%');
});

test('a stale pending record shows the stale-payments banner', async ({ page }) => {
  await addRecord({
    id: 'pay-stale', guestId: 'guest-a', amount: 15000, status: 'pending',
    createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
  });
  await open(page);
  await expect(page.getByTestId('stale-pending-banner')).toBeVisible();
});

test("a payment recorded here reads the same on the resident's record and history", async ({ page }) => {
  await record(page, 'guest-a', '50.00');
  const snap = await admin().collection('payments').where('guestId', '==', 'guest-a').where('amount', '==', 5000).get();
  const id = snap.docs[0].id;
  expect(snap.docs[0].data().description).toBe('Manual Payment — Cash');
  await expect(page.getByTestId(`payment-row-${id}`)).toContainText('Test GuestA');
  await page.goto(`/houses/${HOUSE}/residents/guest-a`);
  await expect(page.getByTestId('record-payments')).toContainText('$100.00');
  await page.getByTestId('record-payments').getByText('Payment history').click();
  await expect(page.getByText('$50.00').first()).toBeVisible();
  await expect(page.getByText(/Manual Payment/).first()).toBeVisible();
});

test('a refused write, then a retry, records once with the same id', async ({ page }) => {
  await open(page);
  await fillForm(page, 'guest-a', '50.00');
  const guest = (await admin().doc('guests/guest-a').get()).data()!;
  // The batch's balance write fails while the resident doc is missing.
  await admin().doc('guests/guest-a').delete();
  await recordButton(page).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Failed to record payment');
  await dialog.getByRole('button', { name: 'OK' }).click();
  await admin().doc('guests/guest-a').set(guest);
  await recordButton(page).click();
  await expect(page.getByText('Record Manual Payment')).toHaveCount(0);
  expect(await paymentsOf('guest-a', 5000)).toBe(1);
  expect(await rentOwed('guest-a')).toBe(10000);
});
