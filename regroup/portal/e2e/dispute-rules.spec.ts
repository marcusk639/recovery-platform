// Every dispute write the portal can make, made by the phone's own services
// through the portal's Firebase adapter, against the real rules and functions.
// Each row mirrors a case in regroup/mobile/firebase/__tests__/dispute*.rules.test.ts.
import type { Page } from '@playwright/test';
import { admin, expect, reseed, signInAs, signInAsRaw, test } from './helpers';
import { addInvitedManager, makePeerLeader, makeResidentAManager } from './fixtures';
import {
  ACTIVE,
  DISPUTED,
  OP_LOGGED,
  OP_LOGGED_ACTIVE,
  activityData,
  decisionIds,
  moveOffUtcSunday,
  operatorLogged,
  probe,
  refused,
  settled,
  waitForDecisions,
} from './dispute-fixtures';

let startedAt = 0;
test.beforeEach(async () => {
  reseed();
  await moveOffUtcSunday(DISPUTED);
  startedAt = Date.now();
});

const owner = (page: Page) => signInAs(page, 'manager');

// A refused write leaves the activity exactly as it was, and logs no decision.
async function expectRefused(
  page: Page,
  id: string,
  call: () => Promise<unknown>,
  message?: string,
  code?: string,
) {
  const before = await settled(id);
  const result = (await call()) as { ok: boolean; message?: string; code?: string };
  expect(result.ok).toBe(false);
  if (message) expect(result).toMatchObject(refused(message));
  if (code) expect(result.code).toBe(code);
  expect(await activityData(id)).toEqual(before);
  expect(await decisionIds(id, startedAt)).toEqual([]);
}

const APPROVED = {
  status: 'resolved',
  disputed: 'successful',
  incomplete: true,
  disputeOutcome: 'incomplete-per-residents',
  disputeResult: 'success',
};
const REOPENED = {
  status: 'disputed',
  disputed: null,
  incomplete: null,
  disputeResult: null,
  disputeOutcome: null,
  disputeResolvedBy: null,
  disputeResolvedAt: null,
};

test("the owner decides another resident's dispute", async ({ page }) => {
  await owner(page);
  expect(await probe(page, 'decide', DISPUTED, 'approve')).toEqual({ ok: true });
  const a = await activityData(DISPUTED);
  expect(a).toMatchObject({ ...APPROVED, disputeResolvedBy: 'e2e-manager' });
  expect(a.disputeResolvedAt).toBeTruthy();
});

test('an invited manager rejects', async ({ page, browser }) => {
  const manager = await addInvitedManager(browser);
  await signInAsRaw(page, manager.email);
  expect(await probe(page, 'decide', DISPUTED, 'reject')).toEqual({ ok: true });
  expect(await activityData(DISPUTED)).toMatchObject({
    status: 'resolved',
    disputed: 'rejected',
    incomplete: false,
    disputeResult: 'fail',
    disputeResolvedBy: manager.uid,
  });
});

test('a peer leader approves', async ({ page }) => {
  await makePeerLeader('manager');
  await owner(page);
  expect(await probe(page, 'decide', DISPUTED, 'approve')).toEqual({ ok: true });
  expect(await activityData(DISPUTED)).toMatchObject({
    ...APPROVED,
    disputeResolvedBy: 'e2e-manager',
  });
});

test('the logger may not decide', async ({ page }) => {
  await operatorLogged('disputed');
  await owner(page);
  await expectRefused(
    page,
    OP_LOGGED,
    () => probe(page, 'decide', OP_LOGGED, 'approve'),
    'Not allowed to decide this dispute',
  );
});

test('another admin decides what the owner logged', async ({ page, browser }) => {
  await operatorLogged('disputed');
  const manager = await addInvitedManager(browser);
  await signInAsRaw(page, manager.email);
  expect(await probe(page, 'decide', OP_LOGGED, 'approve')).toEqual({ ok: true });
});

test('a manager who is the resident may not decide', async ({ page }) => {
  await operatorLogged('disputed');
  await makeResidentAManager('e2e-guest-a');
  await signInAsRaw(page, 'test-guest-a@rats-e2e.com');
  await expectRefused(
    page,
    DISPUTED,
    () => probe(page, 'decide', DISPUTED, 'reject'),
    'Not allowed to decide this dispute',
  );
  // Control: as a manager they may decide a dispute that isn't theirs.
  expect(await probe(page, 'decide', OP_LOGGED, 'approve')).toEqual({ ok: true });
});

test('an admin of another house may not decide', async ({ page }) => {
  await signInAs(page, 'oxford-operator');
  await expectRefused(
    page,
    DISPUTED,
    () => probe(page, 'decide', DISPUTED, 'approve'),
    'Not allowed to decide this dispute',
  );
});

test("a decided dispute can't be decided again", async ({ page }) => {
  await owner(page);
  expect(await probe(page, 'decide', DISPUTED, 'approve')).toEqual({ ok: true });
  await waitForDecisions(DISPUTED, startedAt, 1);
  expect(await probe(page, 'decide', DISPUTED, 'reject')).toEqual(
    refused('Dispute already resolved'),
  );
  expect(await activityData(DISPUTED)).toMatchObject({ disputed: 'successful' });
  await expect.poll(() => decisionIds(DISPUTED, startedAt), { timeout: 3_000 }).toHaveLength(1);
});

test("an undisputed activity can't be decided", async ({ page }) => {
  await owner(page);
  await expectRefused(
    page,
    ACTIVE,
    () => probe(page, 'decide', ACTIVE, 'approve'),
    'Activity is not disputed',
  );
});

// The rules accept an undo only once the server has logged the decision it
// undoes. The emulator logs within milliseconds, so the test removes the entry.
test('undo before the decision is logged is refused, then accepted', async ({ page }) => {
  await owner(page);
  expect(await probe(page, 'decide', DISPUTED, 'approve')).toEqual({ ok: true });
  await waitForDecisions(DISPUTED, startedAt, 1);
  const [id] = await decisionIds(DISPUTED, startedAt);
  const entry = admin().doc(`activities/${DISPUTED}/dispute-decisions/${id}`);
  const logged = (await entry.get()).data()!;
  await entry.delete();
  const before = await settled(DISPUTED);
  expect(await probe(page, 'reopen', DISPUTED)).toEqual(
    refused('Not allowed to undo this decision'),
  );
  expect(await activityData(DISPUTED)).toEqual(before);
  await entry.set(logged);
  expect(await probe(page, 'reopen', DISPUTED)).toEqual({ ok: true });
  expect(await activityData(DISPUTED)).toMatchObject({ ...REOPENED, reopenedBy: 'e2e-manager' });
});

test('a second undo is refused', async ({ page }) => {
  await owner(page);
  expect(await probe(page, 'decide', DISPUTED, 'approve')).toEqual({ ok: true });
  await waitForDecisions(DISPUTED, startedAt, 1);
  expect(await probe(page, 'reopen', DISPUTED)).toEqual({ ok: true });
  expect(await probe(page, 'reopen', DISPUTED)).toEqual(refused('Dispute already reopened'));
});

test('nothing to undo on an active activity', async ({ page }) => {
  await owner(page);
  await expectRefused(page, ACTIVE, () => probe(page, 'reopen', ACTIVE), 'No decision to undo');
});

test('the logger may not undo', async ({ page, browser }) => {
  await operatorLogged('disputed');
  const manager = await addInvitedManager(browser);
  const other = await browser.newPage();
  await signInAsRaw(other, manager.email);
  expect(await probe(other, 'decide', OP_LOGGED, 'approve')).toEqual({ ok: true });
  await waitForDecisions(OP_LOGGED, startedAt, 1);
  await other.close();
  await owner(page);
  const before = await settled(OP_LOGGED);
  expect(await probe(page, 'reopen', OP_LOGGED)).toEqual(
    refused('Not allowed to undo this decision'),
  );
  expect(await activityData(OP_LOGGED)).toEqual(before);
});

test("an operator raises a dispute on someone else's activity", async ({ page }) => {
  await owner(page);
  const before = await settled(ACTIVE);
  expect(await probe(page, 'raise', ACTIVE, 'Not done')).toEqual({ ok: true });
  const a = await activityData(ACTIVE);
  expect(a).toMatchObject({
    status: 'disputed',
    disputeReason: 'Not done',
    disputedBy: 'e2e-manager',
    disputeResolvedBy: 'e2e-manager',
  });
  expect(a.disputedAt).toBeTruthy();
  expect(a.loggedAt).toEqual(before.loggedAt);
});

test('the logger may not raise a dispute', async ({ page }) => {
  await operatorLogged('active');
  await owner(page);
  await expectRefused(
    page,
    OP_LOGGED_ACTIVE,
    () => probe(page, 'raise', OP_LOGGED_ACTIVE, 'x'),
    undefined,
    'firestore/permission-denied',
  );
});

test("a disputed activity can't be disputed again", async ({ page, browser }) => {
  const manager = await addInvitedManager(browser);
  await signInAsRaw(page, manager.email);
  await expectRefused(
    page,
    DISPUTED,
    () => probe(page, 'raise', DISPUTED, 'x'),
    undefined,
    'firestore/permission-denied',
  );
});
