import type { Page } from '@playwright/test';
import { addHouseClaim, addOxfordResident, removeSecondHouse, setRooms, setWeekStats, twoBedsOneFilled } from './fixtures';
import { addSecondHouseForManager, admin, expect, reseed, SECOND_HOUSE, signInAs, test } from './helpers';

const row = (page: Page, name: string) => page.getByRole('row', { name: new RegExp(name) });

test.beforeEach(() => reseed({ E2E_RENT_CENTS: '15000' }));

test('a house row shows the real numbers', async ({ page }) => {
  await setRooms('test-house-123', twoBedsOneFilled);
  await setWeekStats('guest-a', { choresCompleted: 1, primarySupporterMet: 1 });
  await setWeekStats('guest-b', { choresCompleted: 1 });
  await signInAs(page, 'manager');
  await page.click('#nav-home');
  const house = row(page, 'E2E Test House');
  await expect(house).toContainText('1 / 2');
  await expect(house).toContainText('75%');
  await expect(house).toContainText('$150.00');
  await expect(house.getByRole('cell').nth(4)).toHaveText('1');
  await expect(house.getByRole('cell').nth(5)).toHaveText('1');
});

test('totals add across houses', async ({ page }) => {
  await addSecondHouseForManager();
  await admin().doc('guests/guest-c').update({ rentOwed: 2550 });
  await signInAs(page, 'manager');
  await page.click('#nav-home');
  await expect(page.getByTestId('total-overdue')).toHaveText(/\$175\.50/);
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('a house that cannot be read says so, and the rest still works', async ({ page }) => {
  await addHouseClaim('manager', 'ghost-house');
  await signInAs(page, 'manager');
  await page.click('#nav-home');
  await expect(row(page, 'ghost-house')).toContainText("Couldn't load this house", { timeout: 20_000 });
  await expect(row(page, 'E2E Test House')).toContainText('$150.00');
  await expect(page.getByRole('status')).toContainText('Not counting 1 of 2 houses');
});

test('a lapsed house shows its state and its residents are not read', async ({ page }) => {
  await addSecondHouseForManager('canceled');
  const reads: string[] = [];
  const disputeReads: string[] = [];
  // One listen request can carry several targets, so match the dispute doc's path.
  page.on('request', (r) => {
    let body = r.postData() ?? '';
    try {
      body = decodeURIComponent(body);
    } catch {}
    if (r.url().includes(':18080') && body.includes('guests')) reads.push(body);
    if (r.url().includes(':18080') && body.includes('house-disputes/')) disputeReads.push(body);
  });
  await signInAs(page, 'manager');
  await page.click('#nav-home');
  await expect(row(page, 'Second House')).toContainText('Subscription ended');
  await expect(row(page, 'E2E Test House')).toContainText('$150.00');
  expect(reads.some((b) => b.includes('test-house-123')), 'control: the watcher sees reads').toBe(true);
  expect(reads.some((b) => b.includes(SECOND_HOUSE))).toBe(false);
  expect(disputeReads.some((b) => b.includes('house-disputes/test-house-123')), 'control').toBe(true);
  expect(disputeReads.some((b) => b.includes(`house-disputes/${SECOND_HOUSE}`))).toBe(false);
});

test('a dispute count that changed shows on returning to the table', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.click('#nav-home');
  await expect(row(page, 'E2E Test House').getByRole('cell').nth(5)).toHaveText('1');
  await page.getByRole('link', { name: 'E2E Test House' }).click();
  await admin().doc('house-disputes/test-house-123').set({ disputes: {} });
  await page.click('#nav-home');
  await expect(row(page, 'E2E Test House').getByRole('cell').nth(5)).toHaveText('0');
});

test('a house taken away leaves the table and the totals', async ({ page }) => {
  await addSecondHouseForManager();
  await admin().doc('guests/guest-c').update({ rentOwed: 2550 });
  await signInAs(page, 'manager');
  await page.click('#nav-home');
  await expect(page.getByTestId('total-overdue')).toHaveText(/\$175\.50/);
  await removeSecondHouse();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(row(page, 'Second House')).toHaveCount(0);
  await expect(page.getByTestId('total-overdue')).toHaveText(/\$150\.00/);
});

test('a balance that changes shows after returning to the tab', async ({ page }) => {
  test.setTimeout(90_000);
  await signInAs(page, 'manager');
  await page.click('#nav-home');
  await expect(row(page, 'E2E Test House')).toContainText('$150.00');
  await admin().doc('guests/guest-a').update({ rentOwed: 9900 });
  await page.waitForTimeout(31_000); // the guest list's staleTime
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await expect(row(page, 'E2E Test House')).toContainText('$99.00', { timeout: 10_000 });
});

test("an Oxford house shows its residents' rent owed", async ({ page }) => {
  await addOxfordResident(12345);
  await signInAs(page, 'oxford-operator');
  await page.click('#nav-home');
  await expect(row(page, 'E2E Oxford House')).toContainText('$123.45');
});

test('a house name in the table can open in a new tab', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.click('#nav-home');
  await expect(page.getByRole('link', { name: 'E2E Test House' })).toHaveAttribute('href', '/houses/test-house-123');
});
