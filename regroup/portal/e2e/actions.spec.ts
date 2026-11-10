import type { Page } from '@playwright/test';
import { getAuth } from 'firebase-admin/auth';
import { addSecondPhase, earlierWeeks, makePeerLeader, makeResidentAManager, setWeekStats, weekStart } from './fixtures';
import { admin, expect, reseed, signInAs, test } from './helpers';

const guest = (id: string) => admin().doc(`guests/${id}`);
const dialog = (page: Page) => page.getByRole('alertdialog');

async function openRecord(page: Page, name: string) {
  await signInAs(page, 'manager');
  await page.getByRole('link', { name }).click();
  await expect(page.getByTestId('record-header')).toBeVisible({ timeout: 20_000 });
}

test.beforeEach(() => reseed({ E2E_RENT_CENTS: '15000' }));

test('discharging writes what the phone writes, and the record and list follow', async ({ page }) => {
  await openRecord(page, 'Bob Rivera');
  await page.getByRole('button', { name: 'Discharge' }).click();
  await page.getByPlaceholder('Notes (optional)').fill('Moved to a family home.');
  await page.getByTestId('confirm-discharge-button').click();
  await expect.poll(async () => (await guest('guest-b').get()).data()!.status).toBe('discharged');
  const data = (await guest('guest-b').get()).data()!;
  expect(data.moveOutDate).toBeTruthy();
  expect(data.dischargeNotes).toBe('Moved to a family home.');
  await expect
    .poll(async () => ((await getAuth().getUser('e2e-guest-b')).customClaims as any)?.guest?.['test-house-123'] ?? false, { timeout: 20_000 })
    .toBe(false);
  await expect(page.getByTestId('record-header')).toContainText(/discharged/i);
  await page.click('#nav-residents');
  await expect(page.getByTestId('guest-list-item')).toHaveCount(1);
  await expect(page.getByText('Bob Rivera')).toHaveCount(0);
});

test('a peer leader discharging a manager is refused, and is told so', async ({ page }) => {
  await makeResidentAManager('e2e-guest-b');
  await makePeerLeader('manager');
  await openRecord(page, 'Bob Rivera');
  await page.getByRole('button', { name: 'Discharge' }).click();
  await page.getByTestId('confirm-discharge-button').click();
  await expect(dialog(page)).toBeVisible({ timeout: 15_000 });
  expect((await guest('guest-b').get()).data()!.status).toBe('active');
});

test('a resident who is eligible can be moved up a phase from the record', async ({ page }) => {
  await addSecondPhase();
  // Eligibility counts back from the newest summaries, this week's included.
  for (const week of [weekStart(), ...earlierWeeks(3)]) await setWeekStats('guest-a', { choresCompleted: 1, primarySupporterMet: 1 }, week);
  await openRecord(page, 'Test GuestA');
  await page.getByTestId('advance-phase-button').click();
  await dialog(page).getByText('Advance', { exact: true }).click();
  await expect.poll(async () => (await guest('guest-a').get()).data()!.phase).toBe('Phase 2');
});

test('a discharged resident shows no Discharge button', async ({ page }) => {
  await guest('guest-b').update({ status: 'discharged' });
  await signInAs(page, 'manager');
  await page.goto('/houses/test-house-123/residents/guest-b');
  await expect(page.getByTestId('record-header')).toContainText(/discharged/i, { timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Discharge' })).toHaveCount(0);
});

test('Change Phase on the full profile says to use the phone', async ({ page }) => {
  await openRecord(page, 'Bob Rivera');
  await page.getByRole('link', { name: 'Full profile' }).click();
  await page.getByText('Change Phase').click();
  await expect(dialog(page)).toContainText(/use the Regroup app on your phone/i);
});
