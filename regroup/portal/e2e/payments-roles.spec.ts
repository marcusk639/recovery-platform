import { addInvitedManager, callAsInvitedPeerLeader, clearPayments, makePeerLeader } from './fixtures';
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
  // P5 Task 1 found every invited manager refused: isHouseAdmin reads ownerId
  // and adminIds (admins doc ids, none from invitations). Fixed in #232 with
  // isHouseMoneyStaff: a house-roles tier of owner or manager (owner, 2026-11-10).
  expect(code).toBe('ok');
});

test('Balance Details shows what each resident owes', async ({ page }) => {
  await clearPayments();
  // guest-a owes $150 after an earlier $150 payment (#192 subtracted it again);
  // guest-b owes nothing; guest-c is in credit; guest-d left owing $90.
  const guestA = (await admin().doc('guests/guest-a').get()).data()!;
  await admin().doc('payments/pay-bal-1').set({
    id: 'pay-bal-1', guestId: 'guest-a', houseId: HOUSE, guestUserId: guestA.userId ?? null,
    amount: 15000, currency: 'usd', status: 'succeeded', description: 'Rent', createdAt: new Date().toISOString(),
  });
  await admin().doc('guests/guest-b').update({ rentOwed: 0, choreFees: 0 });
  for (const [id, fields] of [
    ['guest-c', { firstName: 'Cara', lastName: 'Credit', rentOwed: -5000, status: 'active' }],
    ['guest-d', { firstName: 'Dan', lastName: 'Departed', rentOwed: 9000, status: 'discharged' }],
  ] as const) {
    await admin().doc(`guests/${id}`).set({ ...guestA, id, userId: `nobody-${id}`, choreFees: 0, ...fields });
  }
  await signInAs(page, 'manager');
  await page.click('#nav-balances');
  const row = (id: string) => page.getByTestId(`balance-row-${id}`);
  await expect(row('guest-a')).toContainText('$150.00', { timeout: 15_000 });
  await expect(row('guest-a')).toContainText(/overdue/i);
  await expect(row('guest-b')).toContainText('$0.00');
  await expect(row('guest-b')).toContainText(/current/i);
  await expect(row('guest-c')).toContainText('$0.00');
  await expect(row('guest-c')).toContainText(/current/i);
  // The same residents as the Payments tab's Outstanding: not one who left.
  await expect(row('guest-d')).toHaveCount(0);
});

test('Balances opens by its URL for a manager', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.goto(`/houses/${HOUSE}/payments/balances`);
  await expect(page.getByTestId('balance-stats-card')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#nav-balances')).toHaveAttribute('aria-current', 'page');
});

test('the Balances tab fits the strip at 1280 px', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signInAs(page, 'manager');
  await expect(page.locator('#nav-balances')).toBeVisible();
  // The strip wraps rather than scrolls, so "fits" means one row.
  const tops = await page
    .getByRole('navigation', { name: 'House sections' })
    .getByRole('link')
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  expect(tops.length).toBeGreaterThan(5);
  expect(new Set(tops).size).toBe(1);
  await page.screenshot({ path: test.info().outputPath('tabs-1280.png') });
});

test('a peer leader sees no payment money by URL', async ({ page }) => {
  await makePeerLeader('manager');
  const calls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('listHousePayments')) calls.push(request.url());
  });
  // A ?guestId= used to send the page through the resident gate instead, which
  // skipped the role check (money review): it must make no difference.
  for (const path of ['payments', 'payments/balances', 'payments?guestId=guest-a', 'payments/balances?guestId=guest-a', 'reports?guestId=guest-a']) {
    await page.goto(`/houses/${HOUSE}/${path}`);
    if (path === 'payments') await fillSignIn(page, 'test-manager@rats-e2e.com');
    await expect(page.getByText("This page isn't available for your role.")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('payment-stats-card')).toHaveCount(0);
    await expect(page.getByTestId('manual-payment-fab')).toHaveCount(0);
  }
  await expect(page.locator('#nav-payments')).toHaveCount(0);
  await expect(page.locator('#nav-balances')).toHaveCount(0);
  expect(calls).toEqual([]);

  // Nor a resident's own balance or payment history (owner, 2026-11-11). The record
  // hides its money until the tier check answers, so assert only once it has.
  const tiers = page.waitForResponse((r) => r.url().includes('myHouseTiers'));
  await page.goto(`/houses/${HOUSE}/residents/guest-a`);
  await tiers;
  await expect(page.getByTestId('record-header')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('record-recovery')).toBeVisible();
  await expect(page.getByTestId('record-payments')).toHaveCount(0);
  await page.goto(`/houses/${HOUSE}/residents/guest-a/payments`);
  await expect(page.getByText("This page isn't available for your role.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('payment-history-screen')).toHaveCount(0);
});

// Peer leaders hold the same admin claim as managers, so the house-roles tier is
// what keeps them out of the house's money on the server (owner, 2026-11-10).
test("the server refuses an invited peer leader the house's payments", async ({ browser }) => {
  const call = await callAsInvitedPeerLeader(browser, 'listHousePayments', { houseId: HOUSE, limit: 100 });
  const house = (await admin().doc(`houses/${HOUSE}`).get()).data()!;
  expect([house.ownerId, ...(house.adminIds ?? [])]).not.toContain(call.uid);
  expect((await admin().doc(`house-roles/${HOUSE}_${call.uid}`).get()).data()?.tier).toBe('peerLeader');
  expect(call).toMatchObject({ ok: false, code: 'functions/permission-denied' });
});
