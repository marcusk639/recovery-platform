/**
 * Document records can't carry a permanent download link (owner decision
 * 2026-11-09). Anyone holding such a link could open the file whatever the
 * rules said; documents now open through getDocumentLink's short-lived link.
 *
 * Requires the Firestore emulator (FIRESTORE_EMULATOR_HOST, set by
 * `firebase emulators:exec`).
 */
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const [HOST, PORT] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
const HOUSE = 'house123';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'rats-document-records-rules-test',
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8'),
      host: HOST,
      port: Number(PORT),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

const record = (extra: Record<string, unknown> = {}) => ({
  id: 'doc1',
  houseId: HOUSE,
  fileName: 'lease.pdf',
  storagePath: `houses/${HOUSE}/documents/doc1`,
  fileType: 'pdf',
  category: 'lease',
  uploadedBy: 'admin',
  createdAt: new Date().toISOString(),
  ...extra,
});

const adminDb = () =>
  testEnv.authenticatedContext('admin', { admin: { [HOUSE]: true } }).firestore();

describe('documents create', () => {
  test('a house admin can create a record with no download link', async () => {
    await assertSucceeds(setDoc(doc(adminDb(), 'documents/doc1'), record()));
  });

  test('a record carrying a storageUrl is refused', async () => {
    await assertFails(
      setDoc(doc(adminDb(), 'documents/doc2'), record({ id: 'doc2', storageUrl: 'https://x' })),
    );
  });
});
