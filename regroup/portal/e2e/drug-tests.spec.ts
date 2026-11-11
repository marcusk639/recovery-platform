// Drug tests through the phone's DrugTestForm and logDrugTest, against the real
// rules. The create rule (an admin of the record's house) has no rules test, so
// these rows are its first proof.
import type { Page } from '@playwright/test';
import { addInvitedPeerLeader, uidOf } from './fixtures';
import {
  admin,
  expect,
  fillSignIn,
  reseed,
  revokeClaimsAndRefresh,
  signInAs,
  test,
} from './helpers';
import { HOUSE, drugTests } from './later-fixtures';

// DrugTestForm's payload (DrugTestForm.tsx) plus what logDrugTest adds.
const FIELDS = [
  'createdAt',
  'escalationTriggered',
  'guestId',
  'houseId',
  'id',
  'isRandom',
  'notes',
  'observedBy',
  'observerName',
  'result',
  'substancesDetected',
  'testDate',
  'testType',
];

test.beforeEach(() => reseed());

async function openForm(page: Page) {
  await page.locator('#nav-drug-tests').click();
  await page.getByTestId('fab-log-test').click();
  await expect(page.getByText('Select Guest', { exact: true })).toBeVisible({ timeout: 15_000 });
}

async function fill(page: Page, result: 'Negative' | 'Positive', notes = 'Observed at intake') {
  await page.getByText('Test GuestA', { exact: true }).click();
  await page.getByText('Urine', { exact: true }).click();
  await page.getByText(result, { exact: true }).click();
  await page.getByPlaceholder('Additional notes...').fill(notes);
}

const submit = (page: Page) => page.getByText('Log Drug Test', { exact: true }).last().click();

test("adding a result writes the phone's record", async ({ page }) => {
  await signInAs(page, 'manager');
  await openForm(page);
  await fill(page, 'Negative');
  await submit(page);
  await expect.poll(async () => (await drugTests('guest-a')).length, { timeout: 15_000 }).toBe(1);
  const [record] = await drugTests('guest-a');
  expect(Object.keys(record).sort()).toEqual(FIELDS);
  expect(record).toMatchObject({
    guestId: 'guest-a',
    houseId: HOUSE,
    result: 'negative',
    testType: 'urine',
    notes: 'Observed at intake',
    observedBy: await uidOf('manager'),
    substancesDetected: [],
    escalationTriggered: false,
  });
  expect(Date.parse(record.testDate)).not.toBeNaN();
  expect(Date.parse(record.createdAt)).not.toBeNaN();
  await page.getByText('Negative', { exact: true }).last().click();
  await expect(page.getByText('Total Tests')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Test GuestA');
});

test('a positive result with substances is recorded', async ({ page }) => {
  await signInAs(page, 'manager');
  await openForm(page);
  await fill(page, 'Positive');
  await page.getByPlaceholder('e.g. THC, cocaine').fill('THC, cocaine');
  await submit(page);
  await expect.poll(async () => (await drugTests('guest-a')).length, { timeout: 15_000 }).toBe(1);
  expect((await drugTests('guest-a'))[0]).toMatchObject({
    result: 'positive',
    substancesDetected: ['THC', 'cocaine'],
    escalationTriggered: true,
  });
});

test('a refused result shows an error and saves nothing', async ({ page }) => {
  await signInAs(page, 'manager');
  const before = await drugTests('guest-a');
  await openForm(page);
  await fill(page, 'Negative');
  await revokeClaimsAndRefresh(page, 'manager');
  await submit(page);
  await expect(page.getByRole('alertdialog')).toContainText('Failed to log drug test result', {
    timeout: 15_000,
  });
  expect(await drugTests('guest-a')).toEqual(before);
});

test('an invited peer leader adds a result', async ({ page, browser }) => {
  const leader = await addInvitedPeerLeader(browser);
  await page.goto(`/houses/${HOUSE}/drug-tests`);
  await fillSignIn(page, leader.email);
  await page.getByTestId('fab-log-test').click({ timeout: 20_000 });
  await fill(page, 'Negative');
  await submit(page);
  await expect.poll(async () => (await drugTests('guest-a')).length, { timeout: 15_000 }).toBe(1);
  expect((await drugTests('guest-a'))[0].observedBy).toBe(leader.uid);
});

test("history shows only this resident's tests", async ({ page }) => {
  const record = (guestId: string, result: string) => {
    const ref = admin().collection('drug-tests').doc();
    return ref.set({
      id: ref.id,
      guestId,
      houseId: HOUSE,
      result,
      testType: 'urine',
      substancesDetected: [],
      observedBy: 'seed',
      observerName: 'Seed Staff',
      notes: '',
      isRandom: false,
      escalationTriggered: result === 'positive',
      testDate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
  };
  await record('guest-a', 'negative');
  await record('guest-b', 'positive');
  await signInAs(page, 'manager');
  await page.evaluate(
    (h) => (window as any).__portalTest.open('DrugTestHistory', { houseId: h, guestId: 'guest-a' }),
    HOUSE,
  );
  await expect(page.getByText('Negative', { exact: true })).toHaveCount(1, { timeout: 15_000 });
  await expect(page.getByText('Positive', { exact: true })).toHaveCount(0);
});
