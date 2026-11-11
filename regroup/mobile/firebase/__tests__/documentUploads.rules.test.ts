/**
 * Storage rules for house and resident documents (#195).
 *
 * services/documents.ts uploads to houses/{houseId}/documents/{docId} and
 * houses/{houseId}/guests/{guestId}/documents/{docId}. No rule matched either
 * path, so the catch-all denied every upload. Only house admins may read or
 * write them, matching the documents collection in firestore.rules. The
 * document picker offers PDFs and images only.
 *
 * Requires the Storage emulator (FIREBASE_STORAGE_EMULATOR_HOST, set by
 * `firebase emulators:exec`).
 */
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
  RulesTestContext,
} from '@firebase/rules-unit-testing';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import * as fs from 'fs';
import * as path from 'path';

const [STORAGE_HOST, STORAGE_PORT] = (
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? '127.0.0.1:9199'
).split(':');

const HOUSE = 'house123';
const OTHER_HOUSE = 'houseOther';
const GUEST = 'guest456';
const TINY_PDF = Buffer.from('%PDF-1.0\ntrailer<</Root 1 0 R>>', 'ascii');
const MB = 1024 * 1024;

const PATHS = {
  house: `houses/${HOUSE}/documents/doc1`,
  resident: `houses/${HOUSE}/guests/${GUEST}/documents/doc1`,
};

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'rats-document-uploads-rules-test',
    storage: {
      rules: fs.readFileSync(path.resolve(__dirname, '../storage.rules'), 'utf8'),
      host: STORAGE_HOST,
      port: Number(STORAGE_PORT),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

afterEach(async () => {
  await testEnv.clearStorage();
});

const admin = () => testEnv.authenticatedContext('admin', { admin: { [HOUSE]: true } });
const superAdmin = () =>
  testEnv.authenticatedContext('super', { superAdmin: { [HOUSE]: true } });
const otherAdmin = () =>
  testEnv.authenticatedContext('other', { admin: { [OTHER_HOUSE]: true } });
const resident = () => testEnv.authenticatedContext(GUEST, { guest: { [HOUSE]: true } });

const upload = (ctx: RulesTestContext, filePath: string, data: Buffer, type: string) =>
  uploadBytes(ref(ctx.storage(), filePath), data, { contentType: type });

describe.each(Object.entries(PATHS))('%s documents', (_kind, filePath) => {
  test('a house admin can upload a PDF, read it and delete it', async () => {
    const ctx = admin();
    await assertSucceeds(upload(ctx, filePath, TINY_PDF, 'application/pdf'));
    await assertSucceeds(getDownloadURL(ref(ctx.storage(), filePath)));
    await assertSucceeds(deleteObject(ref(ctx.storage(), filePath)));
  });

  test('a house super-admin can upload an image', async () => {
    await assertSucceeds(upload(superAdmin(), filePath, TINY_PDF, 'image/jpeg'));
  });

  test('the resident, another house admin and a signed-out user cannot upload', async () => {
    await assertFails(upload(resident(), filePath, TINY_PDF, 'application/pdf'));
    await assertFails(upload(otherAdmin(), filePath, TINY_PDF, 'application/pdf'));
    await assertFails(
      upload(testEnv.unauthenticatedContext(), filePath, TINY_PDF, 'application/pdf'),
    );
  });

  test('the resident and another house admin cannot read', async () => {
    await assertSucceeds(upload(admin(), filePath, TINY_PDF, 'application/pdf'));
    await assertFails(getDownloadURL(ref(resident().storage(), filePath)));
    await assertFails(getDownloadURL(ref(otherAdmin().storage(), filePath)));
  });

  test('a file over 25 MB is refused', async () => {
    await assertFails(upload(admin(), filePath, Buffer.alloc(26 * MB), 'application/pdf'));
  });

  test('a file that is not a PDF or an image is refused', async () => {
    await assertFails(upload(admin(), filePath, TINY_PDF, 'application/x-msdownload'));
  });
});
