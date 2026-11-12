import type { Page } from '@playwright/test';
import { makePeerLeader, uidOf } from './fixtures';
import { admin, expect, reseed, signInAs, test } from './helpers';

const app = () => admin().doc('houses/test-house-123/applications/test-app-1');
const APP_URL = '/houses/test-house-123/applications/test-app-1';
const dialog = (page: Page) => page.getByRole('alertdialog');
const capacity = async () => (await admin().doc('houses/test-house-123').get()).data()!.currentCapacity;
const guestsWithEmail = async (email: string) =>
  (await admin().collection('guests').where('houseId', '==', 'test-house-123').where('email', '==', email).get()).size;

async function openApplication(page: Page) {
  await signInAs(page, 'manager');
  await page.goto(APP_URL);
  await expect(page.getByText('Test Applicant').first()).toBeVisible({ timeout: 20_000 });
}

async function approveIntoIntake(page: Page) {
  await openApplication(page);
  await page.getByTestId('btn-approve').click();
  await dialog(page).getByText('Approve', { exact: true }).click();
  await expect(page).toHaveURL(/\/houses\/test-house-123\/intake$/, { timeout: 15_000 });
}

async function fillIntake(page: Page, email: string) {
  await page.getByTestId('intake-first-name-input').fill('Nora');
  await page.getByTestId('intake-last-name-input').fill('Newcomer');
  await page.getByTestId('intake-email-input').fill(email);
  for (let step = 0; step < 3; step++) await page.getByTestId('intake-continue-button').click();
}

test.beforeEach(() => reseed({ E2E_RENT_CENTS: '15000' }));

test('an application opens by URL and survives a reload', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.click('#nav-applications');
  await page.getByTestId('app-row-test-app-1').click();
  await expect(page).toHaveURL(new RegExp(`${APP_URL}$`));
  await page.reload();
  await expect(page.getByText('Test Applicant').first()).toBeVisible({ timeout: 20_000 });
});

test('marking an application reviewing writes what the phone writes', async ({ page }) => {
  const before = (await app().get()).data()!;
  await openApplication(page);
  await page.getByText('Mark as Reviewing').click();
  await expect.poll(async () => (await app().get()).data()!.status).toBe('reviewing');
  const after = (await app().get()).data()!;
  expect(Object.keys(after).filter((k) => !(k in before)).sort()).toEqual(['operatorNote', 'reviewedAt', 'reviewedBy']);
  expect(after.reviewedBy).toBe(await uidOf('manager'));
  expect(after.operatorNote).toBe('');
});

test('rejecting asks first, then records the note', async ({ page }) => {
  await openApplication(page);
  await page.getByPlaceholder(/Leave a message visible to the applicant/).fill('No bed this month.');
  await page.getByTestId('btn-reject').click();
  await expect(dialog(page)).toContainText('Reject Application');
  expect((await app().get()).data()!.status).toBe('pending');
  await dialog(page).getByText('Reject', { exact: true }).click();
  await expect.poll(async () => (await app().get()).data()!.status).toBe('rejected');
  expect((await app().get()).data()!.operatorNote).toBe('No bed this month.');
});

test('approving leads into intake, which admits the resident', async ({ page }) => {
  const capacityBefore = await capacity();
  await approveIntoIntake(page);
  expect((await app().get()).data()!.status).toBe('approved');
  await fillIntake(page, 'nora.newcomer@rats-e2e.invalid');
  await page.getByTestId('intake-submit-button').click();
  await expect(dialog(page)).toContainText('has been admitted.');
  await dialog(page).getByText('OK', { exact: true }).click();
  const snap = await admin().collection('guests').where('email', '==', 'nora.newcomer@rats-e2e.invalid').get();
  expect(snap.size).toBe(1);
  const guest = snap.docs[0].data();
  expect(guest.houseId).toBe('test-house-123');
  expect(guest.infoEntered).toBe(true);
  expect(guest.intakeCompletedBy).toBe(await uidOf('manager'));
  expect(await capacity()).toBe(capacityBefore + 1);
});

test('leaving intake half done asks first, and Stay keeps what was typed', async ({ page }) => {
  await approveIntoIntake(page);
  await page.getByTestId('intake-first-name-input').fill('Nora');
  await page.click('#nav-residents');
  await expect(dialog(page)).toContainText('Leave the intake form?');
  await dialog(page).getByText('Stay', { exact: true }).click();
  await expect(page.getByTestId('intake-first-name-input')).toHaveValue('Nora');
  await page.click('#nav-residents');
  await dialog(page).getByText('Leave', { exact: true }).click();
  await expect(page).toHaveURL(/\/houses\/test-house-123\/residents$/);
});

test('the application stays approved when intake is abandoned, as on the phone', async ({ page }) => {
  await approveIntoIntake(page);
  await page.click('#nav-applications');
  await dialog(page).getByText('Leave', { exact: true }).click();
  await page.goto(APP_URL);
  await expect(page.getByText('Test Applicant').first()).toBeVisible({ timeout: 20_000 });
  expect((await app().get()).data()!.status).toBe('approved');
  await expect(page.getByTestId('btn-approve')).toHaveCount(0);
});

test('a peer leader can work applications, as on the phone', async ({ page }) => {
  await makePeerLeader('manager');
  await openApplication(page);
  await page.getByText('Mark as Reviewing').click();
  await expect.poll(async () => (await app().get()).data()!.status).toBe('reviewing');
});

test('home counts one fewer application waiting after a review', async ({ page }) => {
  await openApplication(page);
  await page.getByText('Mark as Reviewing').click();
  await expect.poll(async () => (await app().get()).data()!.status).toBe('reviewing');
  await page.click('#nav-home');
  await expect(page.getByRole('row', { name: /E2E Test House/ }).getByRole('cell').nth(4)).toHaveText('0');
});

// Escape used to close the success alert without its OK, leaving the filled form
// open to submit the same resident again.
test('Escape on the admitted alert closes the form, as OK does', async ({ page }) => {
  await approveIntoIntake(page);
  await fillIntake(page, 'escape@rats-e2e.invalid');
  await page.getByTestId('intake-submit-button').click();
  await expect(dialog(page)).toContainText('has been admitted.');
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByTestId('intake-form-screen')).toHaveCount(0, { timeout: 15_000 });
  expect(await guestsWithEmail('escape@rats-e2e.invalid')).toBe(1);
});

test('double-submitting intake admits one resident (#217)', async ({ page }) => {
  await approveIntoIntake(page);
  await fillIntake(page, 'twice@rats-e2e.invalid');
  await page.getByTestId('intake-submit-button').dblclick();
  await expect(dialog(page)).toContainText('has been admitted.');
  await page.waitForTimeout(3000);
  expect(await guestsWithEmail('twice@rats-e2e.invalid')).toBe(1);
});

test('idle sign-out on a half-filled intake form still signs out and clears it', async ({ page }) => {
  await page.clock.install();
  await approveIntoIntake(page);
  await page.getByTestId('intake-first-name-input').fill('Nora');
  await page.clock.fastForward('15:01');
  await expect(page.locator('#sign-in-form')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('intake-form-screen')).toHaveCount(0);
});

test("the form's own back arrow asks before losing what was typed", async ({ page }) => {
  await approveIntoIntake(page);
  await page.getByTestId('intake-first-name-input').fill('Nora');
  await page.getByTestId('intake-form-screen').getByTestId('back-button').click();
  await expect(dialog(page)).toContainText('Leave the intake form?');
  await dialog(page).getByText('Stay', { exact: true }).click();
  await expect(page.getByTestId('intake-first-name-input')).toHaveValue('Nora');
  await page.getByTestId('intake-form-screen').getByTestId('back-button').click();
  await dialog(page).getByText('Leave', { exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${APP_URL}$`));
});

test('finishing intake goes back without asking', async ({ page }) => {
  await approveIntoIntake(page);
  await fillIntake(page, 'finished@rats-e2e.invalid');
  await page.getByTestId('intake-submit-button').click();
  await expect(dialog(page)).toContainText('has been admitted.');
  await dialog(page).getByText('OK', { exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${APP_URL}$`));
  await expect(dialog(page)).toHaveCount(0);
});
