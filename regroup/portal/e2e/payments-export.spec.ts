import { readFile } from 'node:fs/promises';
import { clearPayments } from './fixtures';
import { admin, expect, fillSignIn, reseed, signInAs, test } from './helpers';

// "Export CSV" did nothing on a desktop browser (Share is navigator.share on the
// web); the portal downloads the file instead.
const HOUSE = 'test-house-123';
const now = () => new Date().toISOString();

async function addRecord(id: string, guestId: string, amount: number, description: string) {
  const guest = (await admin().doc(`guests/${guestId}`).get()).data()!;
  await admin().doc(`payments/${id}`).set({
    id,
    guestId,
    houseId: HOUSE,
    guestUserId: guest.userId ?? null,
    amount,
    currency: 'usd',
    status: 'succeeded',
    description,
    createdAt: now(),
  });
}

test.beforeEach(async () => {
  reseed({ E2E_RENT_CENTS: '15000' });
  await clearPayments();
  await addRecord('pay-x1', 'guest-a', 5000, 'Manual Payment — Cash');
  await addRecord('pay-x2', 'guest-a', 2500, 'Rent');
});

test("the dashboard's CSV export downloads the period's rows", async ({ page }) => {
  await signInAs(page, 'manager');
  await page.click('#nav-payments');
  await expect(page.getByTestId('payment-stats-card')).toBeVisible({ timeout: 15_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('csv-export-button').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^payments-\d{4}-\d{2}-\d{2}\.csv$/);
  const lines = (await readFile((await download.path())!, 'utf8')).trim().split('\n');
  expect(lines[0]).toBe('Date,Guest Name,Amount,Status,Type');
  expect(lines.slice(1)).toHaveLength(2);
  expect(lines.some((l) => l.includes('50.00') && l.endsWith('Manual'))).toBe(true);
});

test("a resident's payment history exports", async ({ page }) => {
  await page.goto(`/houses/${HOUSE}/residents/guest-a`);
  await fillSignIn(page, 'test-manager@rats-e2e.com');
  await page.getByTestId('record-payments').getByText('Payment history').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByText(/export csv/i).first().click(),
  ]);
  expect(download.suggestedFilename()).toBe('payment-history-export.csv');
  const text = await readFile((await download.path())!, 'utf8');
  expect(text).toContain('50.00');
  expect(text).toContain('25.00');
});
