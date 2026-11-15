// Beds through the phone's own screen and hooks, against the real rules. The
// refusal rows rely on the phone fix (fix/regroup-silent-house-writes): before
// it, a refused assignment said "Bed Assigned".
import type { Page } from '@playwright/test';
import { addInvitedPeerLeader, setRooms, twoBedsOneFilled } from './fixtures';
import { expect, reseed, revokeClaimsAndRefresh, fillSignIn, signInAs, test } from './helpers';
import { HOUSE, houseData } from './later-fixtures';

const rooms = async () => (await houseData()).rooms;

test.beforeEach(async () => {
  reseed();
  await setRooms(HOUSE, twoBedsOneFilled);
});

async function openBeds(page: Page) {
  await page.locator('#nav-beds').click();
  await expect(page.getByText('2A', { exact: true })).toBeVisible({ timeout: 15_000 });
}

async function pickBobForEmptyBed(page: Page) {
  await page.getByText('ASSIGN GUEST', { exact: true }).click();
  await page.getByText('Bob Rivera', { exact: true }).click();
}

test("assigning a resident to an empty bed writes the phone's rooms shape", async ({ page }) => {
  await signInAs(page, 'manager');
  await openBeds(page);
  await pickBobForEmptyBed(page);
  await page.getByText('ASSIGN', { exact: true }).click();
  await expect(page.getByText('Bed Assigned')).toBeVisible({ timeout: 15_000 });
  const after = await rooms();
  expect(after['2A'].beds.b2.guestId).toBe('guest-b');
  expect(after['2A'].beds.b1).toEqual(twoBedsOneFilled['2A'].beds.b1);
  await page.reload();
  await expect(page.getByText('Bob Rivera')).toBeVisible({ timeout: 15_000 });
});

test('removing a resident frees the bed', async ({ page }) => {
  await signInAs(page, 'manager');
  await openBeds(page);
  await page.getByText('REMOVE GUEST', { exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click();
  await expect
    .poll(async () => (await rooms())['2A'].beds.b1.guestId, { timeout: 15_000 })
    .toBeNull();
  await expect(page.getByText('ASSIGN GUEST', { exact: true })).toHaveCount(2);
});

test('adding a room and a bed', async ({ page }) => {
  await signInAs(page, 'manager');
  await openBeds(page);
  await page.getByText('ADD ROOM', { exact: true }).click();
  await page.getByPlaceholder('Room Name').fill('3A');
  await page.getByText('ADD BED', { exact: true }).click();
  await page.getByText('SAVE', { exact: true }).click();
  await expect(page.getByText('Room Added')).toBeVisible({ timeout: 15_000 });
  const room = (await rooms())['3A'];
  expect(Object.keys(room.beds)).toEqual(['Bed 1']);
  expect(room.beds['Bed 1'].guestId).toBeFalsy();
  expect((await rooms())['2A']).toEqual(twoBedsOneFilled['2A']);
});

test('an invited peer leader assigns a bed', async ({ page, browser }) => {
  const { email } = await addInvitedPeerLeader(browser);
  await page.goto(`/houses/${HOUSE}/beds`);
  await fillSignIn(page, email);
  await expect(page.getByText('2A', { exact: true })).toBeVisible({ timeout: 20_000 });
  await pickBobForEmptyBed(page);
  await page.getByText('ASSIGN', { exact: true }).click();
  await expect
    .poll(async () => (await rooms())['2A'].beds.b2.guestId, { timeout: 15_000 })
    .toBe('guest-b');
});

test('a refused assignment says so', async ({ page }) => {
  await signInAs(page, 'manager');
  await openBeds(page);
  await pickBobForEmptyBed(page);
  await revokeClaimsAndRefresh(page, 'manager');
  await page.getByText('ASSIGN', { exact: true }).click();
  await expect(page.getByText('Assignment Failed')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Bed Assigned')).toHaveCount(0);
  expect(await rooms()).toEqual(twoBedsOneFilled);
});

test('a refused room delete says so', async ({ page }) => {
  await signInAs(page, 'manager');
  await openBeds(page);
  await page.getByLabel('pencil-alt').first().click();
  await page.getByLabel('trash').click();
  await revokeClaimsAndRefresh(page, 'manager');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Room Not Removed')).toBeVisible({ timeout: 15_000 });
  expect(await rooms()).toEqual(twoBedsOneFilled);
});
