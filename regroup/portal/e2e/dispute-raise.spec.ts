// Raising a dispute from the portal: the phone's ActivityScreen offers staff
// DISPUTE on an active activity that isn't theirs.
import type { Page } from '@playwright/test';
import { admin, expect, reseed, revokeClaimsAndRefresh, signInAs, test } from './helpers';
import {
  ACTIVE,
  HOUSE,
  OP_LOGGED_ACTIVE,
  activityData,
  moveOffUtcSunday,
  operatorLogged,
  settled,
} from './dispute-fixtures';

const disputeButton = (page: Page, id: string) => page.getByTestId(`dispute-activity-button-${id}`);

test.beforeEach(async () => {
  reseed();
  await moveOffUtcSunday(ACTIVE);
});

async function openActivities(page: Page) {
  await signInAs(page, 'manager');
  await page.click('#nav-activities');
  await expect(disputeButton(page, ACTIVE)).toBeVisible({ timeout: 20_000 });
}

async function dispute(page: Page, reason: string) {
  await disputeButton(page, ACTIVE).click();
  const modal = page.getByTestId('dispute-modal');
  await expect(modal).toBeVisible();
  if (reason)
    await modal
      .getByTestId('dispute-message-input')
      .locator('textarea, input')
      .first()
      .fill(reason);
  await modal.getByTestId('dispute-submit-button').click();
}

const openDisputes = (page: Page) =>
  page.locator('xpath=//div[text()="Open disputes"]/following-sibling::div[1]');

test("an operator disputes a resident's chore", async ({ page }) => {
  await openActivities(page);
  const before = await settled(ACTIVE);
  await dispute(page, 'Kitchen not cleaned');
  await expect(page.getByText('Successfully disputed activity')).toBeVisible();
  const a = await activityData(ACTIVE);
  expect(a).toMatchObject({
    status: 'disputed',
    disputeReason: 'Kitchen not cleaned',
    disputedBy: 'e2e-manager',
    disputeResolvedBy: 'e2e-manager',
  });
  expect(a.disputedAt).toBeTruthy();
  expect(a.loggedAt).toEqual(before.loggedAt);
  // The server mirrors it into the house's live dispute list.
  await expect
    .poll(
      async () =>
        Object.keys((await admin().doc(`house-disputes/${HOUSE}`).get()).get('disputes') ?? {}),
      { timeout: 15_000 },
    )
    .toContain(ACTIVE);
  await page.click('#nav-disputes');
  await expect(page.getByTestId(`resolve-dispute-button-${ACTIVE}`)).toBeVisible({
    timeout: 15_000,
  });
  await page.click('#nav-house-summary');
  await expect(openDisputes(page)).toHaveText('2', { timeout: 15_000 });
});

// The phone's reason field is optional.
test('an empty reason still records the dispute', async ({ page }) => {
  await openActivities(page);
  await dispute(page, '');
  await expect(page.getByText('Successfully disputed activity')).toBeVisible();
  expect(await activityData(ACTIVE)).toMatchObject({
    status: 'disputed',
    disputedBy: 'e2e-manager',
  });
});

test('an operator gets no DISPUTE on an activity they logged', async ({ page }) => {
  await operatorLogged('active');
  await openActivities(page);
  await expect(page.getByTestId(`activity-item-${OP_LOGGED_ACTIVE}`)).toBeVisible();
  await expect(disputeButton(page, OP_LOGGED_ACTIVE)).toHaveCount(0);
});

test('a refused dispute says so and saves nothing', async ({ page }) => {
  await openActivities(page);
  await disputeButton(page, ACTIVE).click();
  await expect(page.getByTestId('dispute-modal')).toBeVisible();
  await revokeClaimsAndRefresh(page, 'manager');
  await page.getByTestId('dispute-submit-button').click();
  await expect(page.getByRole('alertdialog')).toContainText('Dispute not saved');
  expect((await activityData(ACTIVE)).status).toBe('active');
});
