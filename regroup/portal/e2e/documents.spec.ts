import type { Page } from '@playwright/test';
import { getStorage } from 'firebase-admin/storage';
import { admin, expect, reseed, revokeClaimsAndRefresh, signInAs, test } from './helpers';

process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:19199';
const stored = async (path: string) =>
  (await getStorage().bucket('demo-regroup-e2e.appspot.com').file(path).exists())[0];

const documents = async () => admin().collection('documents').where('houseId', '==', 'test-house-123').get();

test.beforeEach(() => reseed());

async function open(page: Page) {
  await signInAs(page, 'manager');
  await page.evaluate(() =>
    (window as any).__portalTest.open('Documents', { houseId: 'test-house-123', guestId: 'guest-a', title: 'Documents' }),
  );
  await expect(page.getByTestId('upload-document-button')).toBeVisible();
}

async function pickLease(page: Page) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('upload-document-button').click();
  await (await chooser).setFiles({ name: 'lease.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') });
}

// #195: storage.rules had no match for the document paths, so every upload was
// refused. A house admin's upload now lands, with no permanent link stored.
test("a house admin's upload is stored and recorded", async ({ page }) => {
  await open(page);
  await pickLease(page);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Lease Agreement' }).click();
  await expect.poll(async () => (await documents()).size, { timeout: 15_000 }).toBe(1);
  const record = (await documents()).docs[0].data();
  expect(record.storagePath).toMatch(/^houses\/test-house-123\/guests\/guest-a\/documents\//);
  expect('storageUrl' in record).toBe(false);
  await expect(page.getByText('lease.pdf')).toBeVisible();
});

test('an upload the storage rules refuse shows an error and creates no record', async ({ page }) => {
  await open(page);
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('upload-document-button').click();
  // Documents are PDFs and images only; the rules refuse anything else.
  await (await chooser).setFiles({ name: 'lease.zip', mimeType: 'application/zip', buffer: Buffer.from('PK test') });
  await page.getByRole('alertdialog').getByRole('button', { name: 'Lease Agreement' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Upload Failed', { timeout: 15_000 });
  expect((await documents()).size).toBe(0);
});

test('a file reaches Storage intact through the real rules on an allowed path', async ({ page }) => {
  await open(page);
  const body = '%PDF-1.4 probe';
  const text = await page.evaluate(async (content) => {
    const url = URL.createObjectURL(new Blob([content], { type: 'application/pdf' }));
    const downloadUrl = await (window as any).__portalTest.uploadToTemp(url);
    return (await fetch(downloadUrl)).text();
  }, body);
  expect(text).toBe(body);
});

// Documents open through getDocumentLink's short-lived signed link. The
// functions emulator has no service account, so signing fails here with a
// SigningError and the screen must say so; real signing is checked on staging.
test('an existing document is listed, and opening it asks the server for a link', async ({ page }) => {
  await admin().doc('documents/doc-1').set({
    houseId: 'test-house-123',
    guestId: 'guest-a',
    fileName: 'lease.pdf',
    storagePath: 'houses/test-house-123/guests/guest-a/documents/doc-1',
    fileType: 'pdf',
    category: 'lease',
    uploadedBy: 'e2e-manager',
    createdAt: new Date(),
  });
  await open(page);
  await expect(page.getByText('lease.pdf')).toBeVisible();
  const asked = page.waitForRequest((r) => r.url().includes('/getDocumentLink'));
  await page.getByTestId('document-open-doc-1').click();
  expect(JSON.parse((await asked).postData() ?? '{}').data).toEqual({ documentId: 'doc-1' });
  await expect(page.getByRole('alertdialog')).toContainText("Couldn't open the document. Try again.");
});

// A URL of its own: a reload used to land on All houses.
test("a resident's documents keep their place through a reload", async ({ page }) => {
  await open(page);
  await expect(page).toHaveURL(/\/houses\/test-house-123\/residents\/guest-a\/documents$/);
  await page.reload();
  await expect(page.getByTestId('upload-document-button')).toBeVisible({ timeout: 20_000 });
});

test('cancelling the picker shows no error', async ({ page }) => {
  await open(page);
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('upload-document-button').click();
  await chooser;
  await page.evaluate(() => document.querySelector('input[type="file"]')!.dispatchEvent(new Event('cancel')));
  await page.waitForTimeout(500);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect((await documents()).size).toBe(0);
});

test('choosing no category uploads nothing', async ({ page }) => {
  await open(page);
  await pickLease(page);
  const uploads: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes(':19199/') && request.method() === 'POST') uploads.push(request.url());
  });
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
  await page.waitForTimeout(500);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(uploads).toEqual([]);
  expect((await documents()).size).toBe(0);
});

// Uploads through the phone's flow and returns the record it made.
async function uploadLease(page: Page): Promise<{ id: string; storagePath: string }> {
  await open(page);
  await pickLease(page);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Lease Agreement' }).click();
  await expect.poll(async () => (await documents()).size, { timeout: 15_000 }).toBe(1);
  const record = (await documents()).docs[0];
  const uploaded = { id: record.id, storagePath: record.data().storagePath as string };
  expect(await stored(uploaded.storagePath)).toBe(true);
  await expect(page.getByTestId(`document-row-${uploaded.id}`)).toBeVisible({ timeout: 15_000 });
  return uploaded;
}

const askToDelete = (page: Page, id: string) => page.getByTestId(`document-delete-${id}`).click();

test('deleting a document removes its record and its file', async ({ page }) => {
  const { id, storagePath } = await uploadLease(page);
  await askToDelete(page, id);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect.poll(async () => (await documents()).size, { timeout: 15_000 }).toBe(0);
  await expect.poll(() => stored(storagePath), { timeout: 15_000 }).toBe(false);
  await expect(page.getByTestId(`document-row-${id}`)).toHaveCount(0);
});

test('a refused delete removes neither', async ({ page }) => {
  const { id, storagePath } = await uploadLease(page);
  await revokeClaimsAndRefresh(page, 'manager');
  await askToDelete(page, id);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Could not delete the document.', { timeout: 15_000 });
  expect((await documents()).size).toBe(1);
  expect(await stored(storagePath)).toBe(true);
});

test('cancelling delete keeps it', async ({ page }) => {
  const { id, storagePath } = await uploadLease(page);
  await askToDelete(page, id);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect((await documents()).size).toBe(1);
  expect(await stored(storagePath)).toBe(true);
});
