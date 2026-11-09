import type { Page } from '@playwright/test';
import { admin, expect, reseed, signInAs, test } from './helpers';

const documents = async () => admin().collection('documents').where('houseId', '==', 'test-house-123').get();

test.beforeEach(() => reseed());

async function open(page: Page) {
  await signInAs(page, 'manager');
  await page.click('#nav-documents');
  await expect(page.getByTestId('upload-document-button')).toBeVisible();
}

async function pickLease(page: Page) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('upload-document-button').click();
  await (await chooser).setFiles({ name: 'lease.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') });
}

// Finding, reported to the owner: storage.rules has no match for the document
// paths, so every upload is refused, on the phone too. Pinned as a visible error.
test('an upload the storage rules refuse shows an error and creates no record', async ({ page }) => {
  await open(page);
  await pickLease(page);
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

test('an existing document is listed and opens', async ({ page, context }) => {
  await admin().doc('documents/doc-1').set({
    houseId: 'test-house-123',
    guestId: 'guest-a',
    fileName: 'lease.pdf',
    storageUrl: 'http://127.0.0.1:19199/v0/b/x/o/lease.pdf',
    storagePath: 'houses/test-house-123/guests/guest-a/documents/doc-1',
    fileType: 'pdf',
    category: 'lease',
    uploadedBy: 'e2e-manager',
    createdAt: new Date(),
  });
  await open(page);
  await expect(page.getByText('lease.pdf')).toBeVisible();
  const popup = context.waitForEvent('page');
  await page.getByTestId('document-open-doc-1').click();
  expect((await popup).url()).toContain('127.0.0.1:19199');
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
