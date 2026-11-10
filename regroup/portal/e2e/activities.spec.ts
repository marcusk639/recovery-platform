import type { Page } from '@playwright/test';
import { makeResidentAManager, uidOf } from './fixtures';
import { admin, expect, fillSignIn, reseed, signInAs, test } from './helpers';

const activityCount = async () => (await admin().collection('activities').get()).size;

async function openSummary(page: Page, link: string) {
  await signInAs(page, 'manager');
  await page.getByRole('link', { name: 'Test GuestA' }).click();
  await expect(page.getByTestId('record-week')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('record-week').getByRole('link', { name: link, exact: true }).click();
}

test.beforeEach(() => reseed({ E2E_RENT_CENTS: '15000' }));

test('verifying an activity writes what the phone writes', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.click('#nav-activities');
  await page.getByTestId('verify-activity-button-test-activity-b1').click();
  await expect.poll(async () => (await admin().doc('activities/test-activity-b1').get()).data()!.verified).toBe(true);
  expect((await admin().doc('activities/test-activity-b1').get()).data()!.verifiedBy).toBe(await uidOf('manager'));
});

test('staff see no way to log an activity for a resident', async ({ page }) => {
  const before = await activityCount();
  await openSummary(page, 'Work');
  await expect(page.getByText('VIEW DISPUTES')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('add-hours-button')).toBeHidden();
  await expect(page.getByText('ADD HOURS')).toBeHidden();
  await page.waitForTimeout(1500);
  expect(await activityCount()).toBe(before);
});

test('changing a resident chore uses the web picker and writes currentChore', async ({ page }) => {
  await openSummary(page, 'Chores');
  await page.getByTestId('change-chore-button').click();
  await page.getByTestId('chore-select-picker').getByRole('combobox').selectOption({ label: 'Bathroom' });
  await page.getByTestId('submit-chore-change-button').click();
  await expect.poll(async () => (await admin().doc('guests/guest-a').get()).data()!.currentChore).toBe('Bathroom');
});

test('changing a sponsor writes primarySupporterName', async ({ page }) => {
  await openSummary(page, 'Primary supporter');
  await page.getByTestId('change-sponsor-button').click();
  await page.getByTestId('sponsor-name-input').fill('Sam Sponsor');
  await page.getByTestId('submit-sponsor-name-button').click();
  await expect.poll(async () => (await admin().doc('guests/guest-a').get()).data()!.primarySupporterName).toBe('Sam Sponsor');
});

test("VIEW DISPUTES on a summary opens the house's disputes tab", async ({ page }) => {
  await openSummary(page, 'Chores');
  await page.getByText('VIEW DISPUTES').click();
  await expect(page).toHaveURL(/\/houses\/test-house-123\/disputes$/);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('the summary graph fits the page', async ({ page }) => {
  await openSummary(page, 'Chores');
  await expect(page.getByText('VIEW DISPUTES')).toBeVisible({ timeout: 20_000 });
  const fits = await page.evaluate(() => {
    const body = document.querySelector('[data-testid="screen-body"]') as HTMLElement;
    const widest = Math.max(...[...body.querySelectorAll('svg')].map((svg) => svg.getBoundingClientRect().right));
    return { widest, edge: body.getBoundingClientRect().right };
  });
  expect(fits.widest).toBeLessThanOrEqual(fits.edge + 1);
});

test("a staff member who is also a resident gets no resident logging on their own record", async ({ page }) => {
  await makeResidentAManager('e2e-guest-b');
  const before = await activityCount();
  await page.goto('/houses/test-house-123/residents/guest-b/chores');
  await fillSignIn(page, 'test-guest-b@rats-e2e.com');
  await expect(page.getByText('VIEW DISPUTES')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('complete-chore-button')).toBeHidden();
  for (const [path, button] of [['supporter', 'meet-sponsor-button'], ['work', 'add-job-button'], ['meetings', 'create-meeting-button']]) {
    await page.goto(`/houses/test-house-123/residents/guest-b/${path}`);
    await expect(page.getByText('VIEW DISPUTES')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId(button)).toBeHidden();
  }
  expect(await activityCount()).toBe(before);
});
