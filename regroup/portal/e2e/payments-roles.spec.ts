import { addInvitedManager, clearPayments, makePeerLeader } from './fixtures';
import { admin, expect, fillSignIn, reseed, signInAs, test } from './helpers';

const HOUSE = 'test-house-123';

test.beforeEach(() => reseed({ E2E_RENT_CENTS: '15000' }));

// Every earlier payment test signed in as the seeded operator, who passes the
// server's isHouseAdmin through ownerId. A manager made by an invitation doesn't.
test("an invited manager's payment views", async ({ page, browser }) => {
  const manager = await addInvitedManager(browser);
  const house = (await admin().doc(`houses/${HOUSE}`).get()).data()!;
  expect([house.ownerId, ...(house.adminIds ?? []), ...(house.superAdminIds ?? [])]).not.toContain(manager.uid);
  expect((await admin().doc(`house-roles/${HOUSE}_${manager.uid}`).get()).data()?.tier).toBe('manager');

  await page.goto(`/houses/${HOUSE}/payments`);
  await fillSignIn(page, manager.email);
  await expect(page.getByTestId('payment-stats-card')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Failed to load payment data.')).toHaveCount(0);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);

  const code = await page.evaluate(async (houseId) => {
    try {
      await (window as any).__portalTest.callable('listHousePayments', { houseId, limit: 100 });
      return 'ok';
    } catch (error) {
      return String((error as { code?: string }).code ?? error);
    }
  }, HOUSE);
  // Finding, P5 Task 1, waiting on the owner: isHouseAdmin compares the caller's
  // uid with the house's adminIds (admins doc ids, and invitations add none) and
  // ownerId, so every invited manager is refused, on the phone too. The fix is a
  // functions change. Pinned so the gap stays visible; flip it with that PR.
  expect(code).toBe('functions/permission-denied');
});

test('Balance Details shows what each resident owes', async ({ page }) => {
  await clearPayments();
  // guest-a owes $150 after an earlier $150 payment; guest-b owes nothing.
  const guestA = (await admin().doc('guests/guest-a').get()).data()!;
  await admin().doc('payments/pay-bal-1').set({
    id: 'pay-bal-1', guestId: 'guest-a', houseId: HOUSE, guestUserId: guestA.userId ?? null,
    amount: 15000, currency: 'usd', status: 'succeeded', description: 'Rent', createdAt: new Date().toISOString(),
  });
  await admin().doc('guests/guest-b').update({ rentOwed: 0, choreFees: 0 });
  await signInAs(page, 'manager');
  await page.click('#nav-balances');
  await expect(page.getByText('Test GuestA').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('$150.00').first()).toBeVisible();
  await expect(page.getByText(/overdue/i).first()).toBeVisible();
});

test('the Balances tab fits the strip at 1280 px', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signInAs(page, 'manager');
  const strip = page.locator('#nav-balances').locator('xpath=..');
  await expect(page.locator('#nav-balances')).toBeInViewport();
  await expect(page.locator('#nav-reports')).toBeInViewport();
  const overflow = await strip.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: test.info().outputPath('tabs-1280.png') });
});

test('a peer leader sees no payment money by URL', async ({ page }) => {
  await makePeerLeader('manager');
  const calls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('listHousePayments')) calls.push(request.url());
  });
  for (const path of ['payments', 'payments/balances']) {
    await page.goto(`/houses/${HOUSE}/${path}`);
    if (path === 'payments') await fillSignIn(page, 'test-manager@rats-e2e.com');
    await expect(page.getByText("This page isn't available for your role.")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('payment-stats-card')).toHaveCount(0);
    await expect(page.getByTestId('manual-payment-fab')).toHaveCount(0);
  }
  await expect(page.locator('#nav-payments')).toHaveCount(0);
  await expect(page.locator('#nav-balances')).toHaveCount(0);
  expect(calls).toEqual([]);
  await page.goto(`/houses/${HOUSE}/residents/guest-a`);
  await page.getByTestId('record-payments').getByText('Payment history').click();
  await expect(page.getByText(/payment history/i).first()).toBeVisible();
});
