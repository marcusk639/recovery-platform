import type { Page } from '@playwright/test';
import { admin, expect, reseed, signInAs, test } from './helpers';

const ID = 'test-activity-123';
const data = async () => (await admin().doc(`activities/${ID}`).get()).data()!;
// Server triggers from the previous test can land after the reseed, so only
// entries from this test count. Decision ids carry their time in milliseconds.
let startedAt = 0;
const decisions = async () =>
  (await admin().collection(`activities/${ID}/dispute-decisions`).get()).docs
    .map((d) => d.id)
    .filter((id) => Number(id.split('_')[1]) >= startedAt - 1000);

// useActivities drops activities from UTC Sunday until Monday (reported to the
// owner as a phone bug), so use a time that is never a UTC Sunday.
async function moveOffUtcSunday() {
  const at = new Date();
  at.setUTCDate(at.getUTCDate() - (at.getUTCDay() === 0 ? 1 : 0));
  at.setUTCHours(0, 30, 0, 0);
  await admin().doc(`activities/${ID}`).update({ timestamp: at, loggedAt: at });
}

test.beforeEach(async () => {
  reseed();
  await moveOffUtcSunday();
  startedAt = Date.now();
});

async function open(page: Page) {
  await signInAs(page, 'manager');
  await page.click('#nav-disputes');
  await expect(page.getByTestId(`resolve-dispute-button-${ID}`)).toBeVisible();
}

const prompt = (page: Page) => page.getByRole('alertdialog');

async function approve(page: Page) {
  await open(page);
  await page.getByTestId(`resolve-dispute-button-${ID}`).click();
  await prompt(page).getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByTestId(`undo-dispute-decision-button-${ID}`)).toBeVisible();
}

test('approve writes exactly the required outcome through the real rules', async ({ page }) => {
  await approve(page);
  const a = await data();
  expect(a).toMatchObject({
    status: 'resolved',
    disputed: 'successful',
    incomplete: true,
    disputeOutcome: 'incomplete-per-residents',
    disputeResult: 'success',
    disputeResolvedBy: 'e2e-manager',
  });
  expect(a.disputeResolvedAt).toBeTruthy();
});

test('the server logs the decision, which proves real functions ran', async ({ page }) => {
  await approve(page);
  await expect.poll(decisions, { timeout: 15_000 }).toEqual([expect.stringMatching(/^decided_/)]);
});

test('reject keeps the activity counting', async ({ page }) => {
  await open(page);
  await page.getByTestId(`reject-dispute-button-${ID}`).click();
  await prompt(page).getByRole('button', { name: 'Reject' }).click();
  await expect(page.getByTestId(`undo-dispute-decision-button-${ID}`)).toBeVisible();
  expect(await data()).toMatchObject({ status: 'resolved', disputed: 'rejected', incomplete: false, disputeResult: 'fail' });
});

test('undo reopens the decision', async ({ page }) => {
  await approve(page);
  await expect.poll(decisions, { timeout: 15_000 }).toHaveLength(1);
  await page.getByTestId(`undo-dispute-decision-button-${ID}`).click();
  await prompt(page).getByRole('button').last().click();
  await expect(page.getByTestId(`resolve-dispute-button-${ID}`)).toBeVisible({ timeout: 15_000 });
  const a = await data();
  expect(a).toMatchObject({
    status: 'disputed',
    disputed: null,
    incomplete: null,
    disputeResult: null,
    disputeOutcome: null,
    disputeResolvedBy: null,
    disputeResolvedAt: null,
    reopenedBy: 'e2e-manager',
  });
});

test('cancel writes nothing', async ({ page }) => {
  await open(page);
  await page.getByTestId(`resolve-dispute-button-${ID}`).click();
  await prompt(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(prompt(page)).toHaveCount(0);
  expect((await data()).status).toBe('disputed');
  expect(await decisions()).toEqual([]);
});

test('Escape writes nothing', async ({ page }) => {
  await open(page);
  await page.getByTestId(`resolve-dispute-button-${ID}`).click();
  await page.keyboard.press('Escape');
  await expect(prompt(page)).toHaveCount(0);
  expect((await data()).status).toBe('disputed');
});

test('double-clicking Approve in the prompt decides once', async ({ page }) => {
  await open(page);
  await page.getByTestId(`resolve-dispute-button-${ID}`).click();
  await prompt(page).getByRole('button', { name: 'Approve' }).dblclick();
  await expect(page.getByTestId(`undo-dispute-decision-button-${ID}`)).toBeVisible();
  await expect.poll(decisions, { timeout: 15_000 }).toHaveLength(1);
  await page.waitForTimeout(1500);
  expect(await decisions()).toHaveLength(1);
});
