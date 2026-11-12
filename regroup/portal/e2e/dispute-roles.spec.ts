// Deciding disputes on the portal's Disputes tab: by role, on a stale screen,
// on decisions older phone builds made, and with the counts that follow them.
import type { Page } from '@playwright/test';
import { admin, expect, fillSignIn, reseed, signInAs, test } from './helpers';
import { addInvitedManager, addInvitedPeerLeader, makePeerLeader, makeResidentAManager } from './fixtures';
import {
  DISPUTED,
  OP_LOGGED,
  activityData,
  decisionIds,
  moveOffUtcSunday,
  operatorLogged,
  probe,
  putActivity,
  settled,
  waitForDecisions,
} from './dispute-fixtures';

let startedAt = 0;
test.beforeEach(async () => {
  reseed();
  await moveOffUtcSunday(DISPUTED);
  startedAt = Date.now();
});

const DISPUTES_URL = '/houses/test-house-123/disputes';
const prompt = (page: Page) => page.getByRole('alertdialog');
const approveButton = (page: Page, id = DISPUTED) =>
  page.getByTestId(`resolve-dispute-button-${id}`);
const rejectButton = (page: Page, id = DISPUTED) => page.getByTestId(`reject-dispute-button-${id}`);
const undoButton = (page: Page, id = DISPUTED) =>
  page.getByTestId(`undo-dispute-decision-button-${id}`);
const openDisputes = (page: Page) =>
  page.locator('xpath=//div[text()="Open disputes"]/following-sibling::div[1]');

async function openAs(page: Page, email: string) {
  await page.goto(DISPUTES_URL);
  await fillSignIn(page, email);
  await expect(page.getByTestId('disputes-screen')).toBeVisible({ timeout: 20_000 });
}

async function openAsOwner(page: Page) {
  await signInAs(page, 'manager');
  await page.click('#nav-disputes');
}

async function decide(page: Page, choice: 'Approve' | 'Reject') {
  await (choice === 'Approve' ? approveButton(page) : rejectButton(page)).click();
  await prompt(page).getByRole('button', { name: choice }).click();
}

async function undo(page: Page, id = DISPUTED) {
  await undoButton(page, id).click();
  await prompt(page).getByRole('button').last().click();
  await expect(approveButton(page, id)).toBeVisible({ timeout: 15_000 });
}

test('a peer leader approves from the Disputes tab', async ({ page }) => {
  await makePeerLeader('manager');
  await openAsOwner(page);
  await decide(page, 'Approve');
  await expect(undoButton(page)).toBeVisible();
  expect(await activityData(DISPUTED)).toMatchObject({
    disputed: 'successful',
    disputeResolvedBy: 'e2e-manager',
  });
});

// Invited peer leaders hold guest and admin claims, unlike a demoted owner.
test('an invited peer leader approves from the Disputes tab', async ({ page, browser }) => {
  const leader = await addInvitedPeerLeader(browser);
  await openAs(page, leader.email);
  await decide(page, 'Approve');
  await expect(undoButton(page)).toBeVisible();
  expect(await activityData(DISPUTED)).toMatchObject({ disputed: 'successful', disputeResolvedBy: leader.uid });
});

test('an invited manager rejects and undoes', async ({ page, browser }) => {
  const manager = await addInvitedManager(browser);
  await openAs(page, manager.email);
  await decide(page, 'Reject');
  await expect(undoButton(page)).toBeVisible();
  expect(await activityData(DISPUTED)).toMatchObject({
    disputed: 'rejected',
    disputeResolvedBy: manager.uid,
  });
  await waitForDecisions(DISPUTED, startedAt, 1);
  await undo(page);
  expect(await activityData(DISPUTED)).toMatchObject({
    status: 'disputed',
    reopenedBy: manager.uid,
  });
});

test('a manager who is the resident sees no decision buttons', async ({ page }) => {
  await operatorLogged('disputed');
  await makeResidentAManager('e2e-guest-a');
  await openAs(page, 'test-guest-a@rats-e2e.com');
  // Control: as a manager they are offered the dispute that isn't theirs.
  await expect(approveButton(page, OP_LOGGED)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId(`activity-item-${DISPUTED}`)).toBeVisible();
  await expect(approveButton(page)).toHaveCount(0);
  await expect(rejectButton(page)).toHaveCount(0);
});

test("a second operator deciding a stale dispute is told it's resolved", async ({
  page,
  browser,
}) => {
  const manager = await addInvitedManager(browser);
  await openAsOwner(page);
  await approveButton(page).click();
  await expect(prompt(page)).toBeVisible();
  // While the owner's prompt is open, another operator rejects it.
  const other = await browser.newPage();
  await openAs(other, manager.email);
  expect(await probe(other, 'decide', DISPUTED, 'reject')).toEqual({ ok: true });
  await other.close();
  await prompt(page).getByRole('button', { name: 'Approve' }).click();
  await expect(prompt(page)).toContainText('Dispute already resolved');
  await expect(prompt(page)).toContainText('Another admin has already resolved this dispute.');
  expect(await activityData(DISPUTED)).toMatchObject({
    disputed: 'rejected',
    disputeResolvedBy: manager.uid,
  });
  await waitForDecisions(DISPUTED, startedAt, 1);
  await page.waitForTimeout(3000);
  await waitForDecisions(DISPUTED, startedAt, 1);
});

// Older builds decided by writing the activity straight from pending.
async function legacyDecision(id: string, decided: object) {
  await putActivity(id, {
    status: 'disputed',
    disputeReason: 'Not done.',
    disputedBy: 'e2e-guest-a',
    disputeResolvedBy: 'e2e-guest-a',
    disputedAt: new Date(),
  });
  await settled(id);
  await admin().doc(`activities/${id}`).update(decided);
  // A decision's log id is its disputeResolvedAt, which for an old "delete" is
  // loggedAt, before this test started.
  await expect
    .poll(() => decisionIds(id, 0).then((ids) => ids.length), { timeout: 15_000 })
    .toBeGreaterThan(0);
}

test('legacy decisions can be undone: an old build\'s "delete"', async ({ page }) => {
  const id = 'p6-legacy-delete';
  await putActivity(id, {});
  const { loggedAt } = await activityData(id);
  await legacyDecision(id, {
    status: 'deleted',
    disputeResolvedBy: 'e2e-manager',
    disputeResolvedAt: loggedAt,
  });
  await openAsOwner(page);
  await undo(page, id);
  expect(await activityData(id)).toMatchObject({ status: 'disputed', reopenedBy: 'e2e-manager' });
});

test('legacy decisions can be undone: an old build\'s "keep"', async ({ page }) => {
  const id = 'p6-legacy-keep';
  await legacyDecision(id, {
    status: 'resolved',
    disputeResolvedBy: 'e2e-manager',
    disputeResolvedAt: new Date(),
  });
  await openAsOwner(page);
  await undo(page, id);
  expect(await activityData(id)).toMatchObject({ status: 'disputed', reopenedBy: 'e2e-manager' });
});

test('the open-dispute count follows decisions', async ({ page }) => {
  await openAsOwner(page);
  await decide(page, 'Approve');
  await expect(undoButton(page)).toBeVisible();
  await page.click('#nav-house-summary');
  await expect(openDisputes(page)).toHaveText('0', { timeout: 15_000 });
  await waitForDecisions(DISPUTED, startedAt, 1);
  await page.click('#nav-disputes');
  await undo(page);
  await page.click('#nav-house-summary');
  await expect(openDisputes(page)).toHaveText('1', { timeout: 15_000 });
});

test('search finds a dispute by its reason, and filters open', async ({ page }) => {
  await openAsOwner(page);
  const row = page.getByTestId(`activity-item-${DISPUTED}`);
  await expect(row).toBeVisible();
  const search = page.getByPlaceholder('Search disputes...');
  await search.fill('Kitchen');
  await expect(row).toBeVisible();
  await search.fill('zzzz');
  await expect(row).toBeHidden();
  await search.fill('');
  await expect(row).toBeVisible();
  const before = await activityData(DISPUTED);
  await page.getByTestId('filter-activities-button').click();
  await expect(page.getByText('Disputed', { exact: true })).toBeVisible();
  await expect(page.getByText('Guests', { exact: true })).toBeVisible();
  expect(await activityData(DISPUTED)).toEqual(before);
});
