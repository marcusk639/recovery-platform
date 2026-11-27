/**
 * Storage Security Rules Tests — the shared demo account (S5, REV-A8)
 *
 * The App Review demo login's password ships in the app, so anyone can sign in
 * as it. storage.rules lets it read what its claims allow but never upload,
 * overwrite or delete (notDemo()). Other accounts holding the same claims are
 * unaffected.
 *
 * Uses the ruleset the Storage emulator loaded (see storage.rules.test.ts for
 * why no suite uploads its own). Requires the Storage emulator on port 9199.
 */

import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

const PROJECT_ID = 'rats-storage-demo-rules-test';
const [STORAGE_HOST, STORAGE_PORT_TEXT] = (
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? '127.0.0.1:9199'
).split(':');

const DEMO_UID = 'demoUser';
const HOUSE_ID = 'demoHouse';
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64',
);
const TINY_PDF = Buffer.from('%PDF-1.0\ntrailer<</Size 1>>', 'ascii');

/** The demo account holds every role in its house; the rules must still refuse its writes. */
const allRoles = (email?: string) => ({
  ...(email === undefined ? {} : { email }),
  guest: { [HOUSE_ID]: true },
  admin: { [HOUSE_ID]: true },
  superAdmin: { [HOUSE_ID]: true },
});

/** Every write path, with a file its rule otherwise accepts from this account. */
const WRITES: Array<[string, Buffer, string]> = [
  [`users/${DEMO_UID}/avatar`, TINY_PNG, 'image/png'],
  [`houses/${HOUSE_ID}/photo`, TINY_PNG, 'image/png'],
  [`houses/${HOUSE_ID}/logo/logo.png`, TINY_PNG, 'image/png'],
  [`houses/${HOUSE_ID}/guests/g1/avatar/g1_avatar`, TINY_PNG, 'image/png'],
  [`houses/${HOUSE_ID}/chore-evidence/${DEMO_UID}/g1_1`, TINY_PNG, 'image/jpeg'],
  [`reports/${HOUSE_ID}/r.pdf`, TINY_PDF, 'application/pdf'],
  [`temp/${DEMO_UID}/probe.pdf`, TINY_PDF, 'application/pdf'],
  [`houses/${HOUSE_ID}/documents/d1`, TINY_PDF, 'application/pdf'],
  [`houses/${HOUSE_ID}/guests/g1/documents/d1`, TINY_PDF, 'application/pdf'],
];

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: { host: STORAGE_HOST, port: Number(STORAGE_PORT_TEXT) },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

afterEach(async () => {
  await testEnv.clearStorage();
});

const demo = (email = 'demo_user@appdemo.net') =>
  testEnv.authenticatedContext(DEMO_UID, allRoles(email)).storage();
const twin = () =>
  testEnv.authenticatedContext(DEMO_UID, allRoles('operator@example.com')).storage();
const seed = (path: string, data: Buffer, contentType: string) =>
  testEnv.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), path), data, { contentType });
  });

describe('the demo account in Storage', () => {
  test.each(WRITES)('DENY demo upload to %s', async (path, data, contentType) => {
    await assertFails(uploadBytes(ref(demo(), path), data, { contentType }));
  });

  test.each(WRITES)(
    'ALLOW the same account and claims without the demo email: %s',
    async (path, data, contentType) => {
      await assertSucceeds(uploadBytes(ref(twin(), path), data, { contentType }));
    },
  );

  test('DENY the demo email in any case', async () => {
    const [path, data, contentType] = WRITES[0];
    await assertFails(uploadBytes(ref(demo('Demo_User@AppDemo.NET'), path), data, { contentType }));
  });

  test('DENY demo deleting an existing file', async () => {
    const path = `houses/${HOUSE_ID}/photo`;
    await seed(path, TINY_PNG, 'image/png');
    await assertFails(deleteObject(ref(demo(), path)));
  });

  test('ALLOW demo reads its claims allow (house photo, chore photo, report)', async () => {
    for (const [path, data, contentType] of [WRITES[1], WRITES[4], WRITES[5]]) {
      await seed(path, data, contentType);
      await assertSucceeds(getDownloadURL(ref(demo(), path)));
    }
  });

  test('ALLOW an account with no email claim to upload (phone sign-in)', async () => {
    const ctx = testEnv.authenticatedContext(DEMO_UID, allRoles()).storage();
    const [path, data, contentType] = WRITES[0];
    await assertSucceeds(uploadBytes(ref(ctx, path), data, { contentType }));
  });
});
