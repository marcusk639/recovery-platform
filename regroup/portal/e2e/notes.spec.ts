import type { Page } from '@playwright/test';
import { makePeerLeader, uidOf } from './fixtures';
import { admin, expect, reseed, signInAs, test } from './helpers';

const notesOf = async (field: string, value: string) =>
  (await admin().collection('staffNotes').where(field, '==', value).get()).docs.map((d) => ({ id: d.id, ...d.data() }) as any);

async function openResidentNotes(page: Page) {
  await signInAs(page, 'manager');
  await page.getByRole('link', { name: 'Bob Rivera' }).click();
  await page.getByRole('link', { name: 'Staff notes' }).click();
  await expect(page.getByTestId('staff-notes-feed-screen')).toBeVisible({ timeout: 20_000 });
}

async function addNote(page: Page, text: string) {
  await page.getByTestId('staff-note-input').fill(text);
  await page.getByTestId('staff-note-submit').click();
  await expect(page.getByText(text)).toBeVisible({ timeout: 15_000 });
  // The feed clears its input only once the server has the note.
  await expect(page.getByTestId('staff-note-input')).toHaveValue('', { timeout: 15_000 });
}

test.beforeEach(() => reseed({ E2E_RENT_CENTS: '15000' }));

test('staff add a note to a resident, and it stays after a reload', async ({ page }) => {
  await openResidentNotes(page);
  await expect(page).toHaveURL(/\/houses\/test-house-123\/residents\/guest-b\/notes$/);
  expect(page.url()).not.toContain('Bob');
  await addNote(page, 'Asked about the curfew.');
  await page.reload();
  await expect(page.getByText('Asked about the curfew.')).toBeVisible({ timeout: 20_000 });
  const [note] = await notesOf('guestId', 'guest-b');
  expect(note).toMatchObject({ houseId: 'test-house-123', type: 'resident_note', authorId: await uidOf('manager'), pinned: false });
});

test('pinning and deleting a note', async ({ page }) => {
  await openResidentNotes(page);
  await addNote(page, 'Pin me.');
  const [note] = await notesOf('guestId', 'guest-b');
  await page.getByTestId(`staff-note-pin-${note.id}`).click();
  await expect.poll(async () => (await admin().doc(`staffNotes/${note.id}`).get()).data()!.pinned).toBe(true);
  await page.getByTestId(`staff-note-delete-${note.id}`).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('alertdialog').getByText('Delete', { exact: true }).click();
  await expect.poll(async () => (await admin().doc(`staffNotes/${note.id}`).get()).exists).toBe(false);
});

test('the shift log is reached from the house page and keeps house-wide notes', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.click('#nav-house-summary');
  await page.getByRole('button', { name: 'Shift log' }).click();
  await expect(page).toHaveURL(/\/houses\/test-house-123\/shift-log$/);
  await addNote(page, 'Quiet night.');
  const [note] = await notesOf('type', 'shift_log');
  expect(note).toMatchObject({ houseId: 'test-house-123', type: 'shift_log' });
  expect('guestId' in note).toBe(false);
});

test('a peer leader can keep notes, as the rule allows', async ({ page }) => {
  await makePeerLeader('manager');
  await openResidentNotes(page);
  await addNote(page, 'Peer leader note.');
  expect(await notesOf('guestId', 'guest-b')).toHaveLength(1);
});
