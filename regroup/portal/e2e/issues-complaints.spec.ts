// Issues and complaints through the phone's screens, against the real rules.
// Residents add both to the house's maps only (Personal.tsx), so these seed and
// read the maps. Removing a closed issue and the refusal rows rely on the phone
// fix (fix/regroup-silent-house-writes).
import type { Page } from '@playwright/test';
import { addInvitedPeerLeader } from './fixtures';
import { expect, fillSignIn, reseed, revokeClaimsAndRefresh, signInAs, test } from './helpers';
import { HOUSE, houseData, putComplaints, putIssues } from './later-fixtures';

const ISSUE = 'p8-issue-1';
const COMPLAINT = 'p8-complaint-1';
const now = new Date().toISOString();

// The shape Personal.tsx writes: a HouseIssue plus houseId.
const issue = (status = 'open', extra: object = {}) => ({
  [ISSUE]: {
    id: ISSUE,
    type: 'house',
    description: 'The kitchen sink leaks',
    emergency: false,
    issuer: 'guest-b',
    resolution: '',
    resolver: '',
    invalid: false,
    houseId: HOUSE,
    status,
    ...extra,
  },
});
const complaint = (reply = '') => ({
  [COMPLAINT]: {
    id: COMPLAINT,
    plaintiff: 'guest-b',
    plaintiffType: 'guest',
    description: 'Too much noise after ten',
    reply,
    houseId: HOUSE,
    createdAt: now,
    updatedAt: now,
  },
});

const issues = async () => (await houseData()).issues ?? {};
const complaints = async () => (await houseData()).complaints ?? {};
const row = (page: Page) => page.getByTestId(`issue-row-${ISSUE}`);

test.beforeEach(() => reseed());

async function openIssues(page: Page) {
  await signInAs(page, 'manager');
  await page.locator('#nav-issues').click();
  await expect(row(page)).toBeVisible({ timeout: 15_000 });
}

async function openComplaints(page: Page) {
  await signInAs(page, 'manager');
  await page.locator('#nav-complaints').click();
  await expect(page.getByText('Too much noise after ten')).toBeVisible({ timeout: 15_000 });
}

async function resolve(page: Page, text: string) {
  await row(page).getByText('RESOLVE', { exact: true }).click();
  await page.getByPlaceholder('Enter resolution (optional)...').fill(text);
  await page.getByText('SAVE', { exact: true }).click();
}

const confirm = (page: Page, name: string) =>
  page.getByRole('alertdialog').getByRole('button', { name }).click();

test('resolving an issue records the resolution', async ({ page }) => {
  await putIssues(issue());
  await openIssues(page);
  await resolve(page, 'Fixed the sink');
  await expect(page.getByText('Issue Resolved')).toBeVisible({ timeout: 15_000 });
  expect((await issues())[ISSUE]).toMatchObject({
    status: 'resolved',
    resolution: 'Fixed the sink',
    invalid: false,
  });
});

test('removing a closed issue', async ({ page }) => {
  await putIssues(issue('resolved', { resolution: 'Fixed the sink' }));
  await openIssues(page);
  await row(page).getByText('REMOVE', { exact: true }).click();
  await confirm(page, 'Continue');
  await expect(page.getByText('Issue Removed')).toBeVisible({ timeout: 15_000 });
  expect(await issues()).not.toHaveProperty(ISSUE);
});

test('dismissing an issue', async ({ page }) => {
  await putIssues(issue());
  await openIssues(page);
  await page.getByTestId(`dismiss-issue-button-${ISSUE}`).click();
  await confirm(page, 'Dismiss');
  await expect(page.getByText('Issue Dismissed')).toBeVisible({ timeout: 15_000 });
  expect((await issues())[ISSUE]).toMatchObject({ status: 'dismissed', invalid: true });
});

test('a refused issue resolve shows an error', async ({ page }) => {
  await putIssues(issue());
  await openIssues(page);
  await revokeClaimsAndRefresh(page, 'manager');
  await resolve(page, 'Fixed the sink');
  await expect(page.getByText('Resolution Failed')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Issue Resolved')).toHaveCount(0);
  expect(await issues()).toEqual(issue());
});

async function reply(page: Page, text: string) {
  await page.getByText('REPLY', { exact: true }).click();
  await page.getByPlaceholder('Enter reply...').fill(text);
  await page.getByText('SAVE', { exact: true }).click();
}

test('replying to a complaint', async ({ page }) => {
  await putComplaints(complaint());
  await openComplaints(page);
  await reply(page, 'Quiet hours start at ten');
  await expect(page.getByText('Reply Submitted')).toBeVisible({ timeout: 15_000 });
  const saved = (await complaints())[COMPLAINT];
  expect(saved.reply).toBe('Quiet hours start at ten');
  expect(saved.updatedAt).not.toBe(now);
});

test('removing a complaint', async ({ page }) => {
  await putComplaints(complaint('Quiet hours start at ten'));
  await openComplaints(page);
  await page.getByText('REMOVE', { exact: true }).click();
  await confirm(page, 'Continue');
  await expect(page.getByText('Complaint Removed')).toBeVisible({ timeout: 15_000 });
  expect(await complaints()).not.toHaveProperty(COMPLAINT);
});

test('a refused complaint removal shows an error', async ({ page }) => {
  await putComplaints(complaint('Quiet hours start at ten'));
  await openComplaints(page);
  await revokeClaimsAndRefresh(page, 'manager');
  await page.getByText('REMOVE', { exact: true }).click();
  await confirm(page, 'Continue');
  await expect(page.getByText('Removal Failed')).toBeVisible({ timeout: 15_000 });
  expect(await complaints()).toEqual(complaint('Quiet hours start at ten'));
});

test('an invited peer leader replies to a complaint', async ({ page, browser }) => {
  await putComplaints(complaint());
  const leader = await addInvitedPeerLeader(browser);
  await page.goto(`/houses/${HOUSE}/complaints`);
  await fillSignIn(page, leader.email);
  await expect(page.getByText('Too much noise after ten')).toBeVisible({ timeout: 20_000 });
  await reply(page, 'We will talk to the house');
  await expect
    .poll(async () => (await complaints())[COMPLAINT].reply, { timeout: 15_000 })
    .toBe('We will talk to the house');
});
