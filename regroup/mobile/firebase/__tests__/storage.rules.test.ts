/**
 * Firebase Storage Security Rules Tests
 *
 * Tests every rule path in storage.rules for both allowed and denied access.
 * Requires the Firebase Storage emulator running on port 9199.
 *
 * Setup:
 *   firebase emulators:start --only storage
 *   npx jest firebase/__tests__/storage.rules.test.ts
 *
 * Or install deps first:
 *   npm install --save-dev @firebase/rules-unit-testing firebase
 */

import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
  RulesTestContext,
} from '@firebase/rules-unit-testing';
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ID = 'rats-storage-rules-test';
const STORAGE_HOST = '127.0.0.1';
const STORAGE_PORT = 9199;

const RULES_PATH = path.resolve(__dirname, '../storage.rules');

const USER_A_UID = 'userA';
const USER_B_UID = 'userB';
const HOUSE_ID = 'house123';
const HOUSE_ID_OTHER = 'houseOther';
const GUEST_ID = 'guest456';

// Minimal valid PNG (1×1 pixel) for image upload tests
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64',
);

// Minimal valid PDF for report tests
const TINY_PDF = Buffer.from(
  '%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj\ntrailer<</Size 4/Root 1 0 R>>',
  'ascii',
);

// ---------------------------------------------------------------------------
// Auth token builders — mirror the custom claims in firestore.rules
// ---------------------------------------------------------------------------

function authUserOnly(uid: string) {
  return { sub: uid };
}

function authHouseAdmin(uid: string, houseId: string) {
  return { sub: uid, admin: { [houseId]: true } };
}

function authHouseSuperAdmin(uid: string, houseId: string) {
  return { sub: uid, superAdmin: { [houseId]: true } };
}

function authHouseGuest(uid: string, houseId: string) {
  return { sub: uid, guest: { [houseId]: true } };
}

function authHouseMember(uid: string, houseId: string) {
  return { sub: uid, guest: { [houseId]: true }, admin: { [houseId]: true } };
}

// ---------------------------------------------------------------------------
// Test environment setup
// ---------------------------------------------------------------------------

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  const rules = fs.readFileSync(RULES_PATH, 'utf8');
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: { rules, host: STORAGE_HOST, port: STORAGE_PORT },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

afterEach(async () => {
  await testEnv.clearStorage();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uploadToPath(
  ctx: RulesTestContext,
  filePath: string,
  data: Buffer,
  contentType: string,
) {
  return uploadBytes(ref(ctx.storage(), filePath), data, { contentType });
}

function readFromPath(ctx: RulesTestContext, filePath: string) {
  return getDownloadURL(ref(ctx.storage(), filePath));
}

function deleteFromPath(ctx: RulesTestContext, filePath: string) {
  return deleteObject(ref(ctx.storage(), filePath));
}

// ===========================================================================
// TESTS
// ===========================================================================

// ---------------------------------------------------------------------------
// 1. Unauthenticated access — ALWAYS denied on every path
// ---------------------------------------------------------------------------
describe('Unauthenticated access', () => {
  const unauthed = () => testEnv.unauthenticatedContext();

  test.each([
    [`users/${USER_A_UID}/avatar`, 'image/png'],
    [`houses/${HOUSE_ID}/photo`, 'image/png'],
    [`houses/${HOUSE_ID}/logo/logo.png`, 'image/png'],
    [`houses/${HOUSE_ID}/guests/${GUEST_ID}/avatar/photo.jpg`, 'image/jpeg'],
    [
      `houses/${HOUSE_ID}/2024-W01/monday/chores/${GUEST_ID}/chore.jpg`,
      'image/jpeg',
    ],
    [`reports/${HOUSE_ID}/report.pdf`, 'application/pdf'],
    [`temp/${USER_A_UID}/file.dat`, 'application/octet-stream'],
    [`some/random/path/file.txt`, 'text/plain'],
  ])('DENY unauthenticated write to %s', async (filePath, contentType) => {
    await assertFails(
      uploadToPath(unauthed(), filePath, TINY_PNG, contentType),
    );
  });

  test.each([
    `users/${USER_A_UID}/avatar`,
    `houses/${HOUSE_ID}/photo`,
    `houses/${HOUSE_ID}/logo/logo.png`,
    `reports/${HOUSE_ID}/report.pdf`,
    `temp/${USER_A_UID}/file.dat`,
  ])('DENY unauthenticated read from %s', async filePath => {
    await assertFails(readFromPath(unauthed(), filePath));
  });
});

// ---------------------------------------------------------------------------
// 2. User avatars: users/{userId}/avatar
// ---------------------------------------------------------------------------
describe('User avatars (users/{userId}/avatar)', () => {
  const avatarPath = `users/${USER_A_UID}/avatar`;

  test('ALLOW owner to upload PNG avatar under 5 MB', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authUserOnly(USER_A_UID),
    );
    await assertSucceeds(uploadToPath(ctx, avatarPath, TINY_PNG, 'image/png'));
  });

  test('ALLOW owner to upload JPEG avatar', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authUserOnly(USER_A_UID),
    );
    await assertSucceeds(uploadToPath(ctx, avatarPath, TINY_PNG, 'image/jpeg'));
  });

  test('ALLOW any authenticated user to read another user avatar', async () => {
    const ownerCtx = testEnv.authenticatedContext(
      USER_A_UID,
      authUserOnly(USER_A_UID),
    );
    await uploadToPath(ownerCtx, avatarPath, TINY_PNG, 'image/png');

    const otherCtx = testEnv.authenticatedContext(
      USER_B_UID,
      authUserOnly(USER_B_UID),
    );
    await assertSucceeds(readFromPath(otherCtx, avatarPath));
  });

  test('ALLOW owner to delete their own avatar', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authUserOnly(USER_A_UID),
    );
    await uploadToPath(ctx, avatarPath, TINY_PNG, 'image/png');
    await assertSucceeds(deleteFromPath(ctx, avatarPath));
  });

  test('DENY another user writing to someone else avatar', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_B_UID,
      authUserOnly(USER_B_UID),
    );
    await assertFails(uploadToPath(ctx, avatarPath, TINY_PNG, 'image/png'));
  });

  test('DENY another user deleting someone else avatar', async () => {
    const ownerCtx = testEnv.authenticatedContext(
      USER_A_UID,
      authUserOnly(USER_A_UID),
    );
    await uploadToPath(ownerCtx, avatarPath, TINY_PNG, 'image/png');

    const otherCtx = testEnv.authenticatedContext(
      USER_B_UID,
      authUserOnly(USER_B_UID),
    );
    await assertFails(deleteFromPath(otherCtx, avatarPath));
  });

  test('DENY non-image content type on avatar upload', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authUserOnly(USER_A_UID),
    );
    await assertFails(
      uploadToPath(ctx, avatarPath, TINY_PDF, 'application/pdf'),
    );
  });

  test('DENY avatar over 5 MB', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authUserOnly(USER_A_UID),
    );
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1, 0);
    await assertFails(uploadToPath(ctx, avatarPath, oversized, 'image/png'));
  });
});

// ---------------------------------------------------------------------------
// 3. House photos: houses/{houseId}/photo
// ---------------------------------------------------------------------------
describe('House photos (houses/{houseId}/photo)', () => {
  const photoPath = `houses/${HOUSE_ID}/photo`;

  test('ALLOW house admin to upload photo', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseAdmin(USER_A_UID, HOUSE_ID),
    );
    await assertSucceeds(uploadToPath(ctx, photoPath, TINY_PNG, 'image/png'));
  });

  test('ALLOW house superAdmin to upload photo', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseSuperAdmin(USER_A_UID, HOUSE_ID),
    );
    await assertSucceeds(uploadToPath(ctx, photoPath, TINY_PNG, 'image/png'));
  });

  test('ALLOW admin to delete house photo', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseAdmin(USER_A_UID, HOUSE_ID),
    );
    await uploadToPath(ctx, photoPath, TINY_PNG, 'image/png');
    await assertSucceeds(deleteFromPath(ctx, photoPath));
  });

  test('ALLOW any authenticated user to read house photo', async () => {
    const adminCtx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseAdmin(USER_A_UID, HOUSE_ID),
    );
    await uploadToPath(adminCtx, photoPath, TINY_PNG, 'image/png');

    const plainCtx = testEnv.authenticatedContext(
      USER_B_UID,
      authUserOnly(USER_B_UID),
    );
    await assertSucceeds(readFromPath(plainCtx, photoPath));
  });

  test('DENY house guest writing house photo', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseGuest(USER_A_UID, HOUSE_ID),
    );
    await assertFails(uploadToPath(ctx, photoPath, TINY_PNG, 'image/png'));
  });

  test('DENY guest deleting house photo', async () => {
    const adminCtx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseAdmin(USER_A_UID, HOUSE_ID),
    );
    await uploadToPath(adminCtx, photoPath, TINY_PNG, 'image/png');

    const guestCtx = testEnv.authenticatedContext(
      USER_B_UID,
      authHouseGuest(USER_B_UID, HOUSE_ID),
    );
    await assertFails(deleteFromPath(guestCtx, photoPath));
  });

  test('DENY admin of a DIFFERENT house writing photo', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseAdmin(USER_A_UID, HOUSE_ID_OTHER),
    );
    await assertFails(uploadToPath(ctx, photoPath, TINY_PNG, 'image/png'));
  });

  test('DENY plain authenticated user (no house role) writing photo', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authUserOnly(USER_A_UID),
    );
    await assertFails(uploadToPath(ctx, photoPath, TINY_PNG, 'image/png'));
  });

  test('DENY non-image content type for house photo', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseAdmin(USER_A_UID, HOUSE_ID),
    );
    await assertFails(
      uploadToPath(ctx, photoPath, TINY_PDF, 'application/pdf'),
    );
  });

  test('DENY house photo over 10 MB', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseAdmin(USER_A_UID, HOUSE_ID),
    );
    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1, 0);
    await assertFails(uploadToPath(ctx, photoPath, oversized, 'image/png'));
  });
});

// ---------------------------------------------------------------------------
// 4. House logos: houses/{houseId}/logo/{fileName}
// ---------------------------------------------------------------------------
describe('House logos (houses/{houseId}/logo/{fileName})', () => {
  const logoPath = `houses/${HOUSE_ID}/logo/logo.png`;

  test('ALLOW house admin to upload logo', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseAdmin(USER_A_UID, HOUSE_ID),
    );
    await assertSucceeds(uploadToPath(ctx, logoPath, TINY_PNG, 'image/png'));
  });

  test('ALLOW authenticated user to read logo', async () => {
    const adminCtx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseAdmin(USER_A_UID, HOUSE_ID),
    );
    await uploadToPath(adminCtx, logoPath, TINY_PNG, 'image/png');

    const plainCtx = testEnv.authenticatedContext(
      USER_B_UID,
      authUserOnly(USER_B_UID),
    );
    await assertSucceeds(readFromPath(plainCtx, logoPath));
  });

  test('DENY guest writing logo', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseGuest(USER_A_UID, HOUSE_ID),
    );
    await assertFails(uploadToPath(ctx, logoPath, TINY_PNG, 'image/png'));
  });

  test('DENY non-image content type for logo', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseAdmin(USER_A_UID, HOUSE_ID),
    );
    await assertFails(uploadToPath(ctx, logoPath, TINY_PDF, 'text/plain'));
  });

  test('DENY logo over 5 MB', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseAdmin(USER_A_UID, HOUSE_ID),
    );
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1, 0);
    await assertFails(uploadToPath(ctx, logoPath, oversized, 'image/png'));
  });
});

// ---------------------------------------------------------------------------
// 5. Guest avatars: houses/{houseId}/guests/{guestId}/avatar/{fileName}
// ---------------------------------------------------------------------------
describe('Guest avatars (houses/{houseId}/guests/{guestId}/avatar/{fileName})', () => {
  const avatarPath = `houses/${HOUSE_ID}/guests/${GUEST_ID}/avatar/avatar.jpg`;

  test('ALLOW house admin to upload guest avatar', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseAdmin(USER_A_UID, HOUSE_ID),
    );
    await assertSucceeds(uploadToPath(ctx, avatarPath, TINY_PNG, 'image/jpeg'));
  });

  test('ALLOW house superAdmin to upload guest avatar', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseSuperAdmin(USER_A_UID, HOUSE_ID),
    );
    await assertSucceeds(uploadToPath(ctx, avatarPath, TINY_PNG, 'image/jpeg'));
  });

  // Reads are scoped to the house. These three cases replace a single
  // 'ALLOW any authenticated user to read guest avatar' test, which pinned an
  // open read rather than a contract. Note this path is currently unused —
  // nothing calls uploadGuestAvatar — so these guard a future wiring-up rather
  // than a live flow.
  test('ALLOW a guest of the house to read guest avatar', async () => {
    const adminCtx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseAdmin(USER_A_UID, HOUSE_ID),
    );
    await uploadToPath(adminCtx, avatarPath, TINY_PNG, 'image/jpeg');

    const memberCtx = testEnv.authenticatedContext(
      USER_B_UID,
      authHouseGuest(USER_B_UID, HOUSE_ID),
    );
    await assertSucceeds(readFromPath(memberCtx, avatarPath));
  });

  test('ALLOW an admin of the house to read guest avatar', async () => {
    const adminCtx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseAdmin(USER_A_UID, HOUSE_ID),
    );
    await uploadToPath(adminCtx, avatarPath, TINY_PNG, 'image/jpeg');
    await assertSucceeds(readFromPath(adminCtx, avatarPath));
  });

  test('DENY an authenticated non-member reading guest avatar', async () => {
    const adminCtx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseAdmin(USER_A_UID, HOUSE_ID),
    );
    await uploadToPath(adminCtx, avatarPath, TINY_PNG, 'image/jpeg');

    // Signed up, belongs to no house — the free-signup attacker.
    const plainCtx = testEnv.authenticatedContext(
      USER_B_UID,
      authUserOnly(USER_B_UID),
    );
    await assertFails(readFromPath(plainCtx, avatarPath));

    // Member of a different house — the ex-resident / wrong-house case.
    const otherHouseCtx = testEnv.authenticatedContext(
      USER_B_UID,
      authHouseGuest(USER_B_UID, HOUSE_ID_OTHER),
    );
    await assertFails(readFromPath(otherHouseCtx, avatarPath));
  });

  test('DENY guest (non-admin) writing guest avatar', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseGuest(USER_A_UID, HOUSE_ID),
    );
    await assertFails(uploadToPath(ctx, avatarPath, TINY_PNG, 'image/jpeg'));
  });

  test('DENY admin of wrong house writing guest avatar', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseAdmin(USER_A_UID, HOUSE_ID_OTHER),
    );
    await assertFails(uploadToPath(ctx, avatarPath, TINY_PNG, 'image/jpeg'));
  });

  test('DENY non-image content type for guest avatar', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseAdmin(USER_A_UID, HOUSE_ID),
    );
    await assertFails(
      uploadToPath(ctx, avatarPath, TINY_PDF, 'application/pdf'),
    );
  });

  test('DENY guest avatar over 5 MB', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseAdmin(USER_A_UID, HOUSE_ID),
    );
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1, 0);
    await assertFails(uploadToPath(ctx, avatarPath, oversized, 'image/png'));
  });
});

// ---------------------------------------------------------------------------
// 6. Chore photos: houses/{houseId}/{week}/{day}/chores/{guestId}/{fileName}
// ---------------------------------------------------------------------------
describe('Chore photos (houses/{houseId}/{week}/{day}/chores/{guestId}/{fileName})', () => {
  const chorePath = `houses/${HOUSE_ID}/2024-W01/monday/chores/${GUEST_ID}/chore.jpg`;

  test('ALLOW house guest to upload chore photo', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseGuest(USER_A_UID, HOUSE_ID),
    );
    await assertSucceeds(uploadToPath(ctx, chorePath, TINY_PNG, 'image/jpeg'));
  });

  test('ALLOW house admin to upload chore photo', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseAdmin(USER_A_UID, HOUSE_ID),
    );
    await assertSucceeds(uploadToPath(ctx, chorePath, TINY_PNG, 'image/jpeg'));
  });

  test('ALLOW house member to read chore photo', async () => {
    const guestCtx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseGuest(USER_A_UID, HOUSE_ID),
    );
    await uploadToPath(guestCtx, chorePath, TINY_PNG, 'image/jpeg');

    const adminCtx = testEnv.authenticatedContext(
      USER_B_UID,
      authHouseAdmin(USER_B_UID, HOUSE_ID),
    );
    await assertSucceeds(readFromPath(adminCtx, chorePath));
  });

  test('DENY non-member reading chore photo', async () => {
    const guestCtx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseGuest(USER_A_UID, HOUSE_ID),
    );
    await uploadToPath(guestCtx, chorePath, TINY_PNG, 'image/jpeg');

    const plainCtx = testEnv.authenticatedContext(
      USER_B_UID,
      authUserOnly(USER_B_UID),
    );
    await assertFails(readFromPath(plainCtx, chorePath));
  });

  test('DENY non-member writing chore photo', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_B_UID,
      authUserOnly(USER_B_UID),
    );
    await assertFails(uploadToPath(ctx, chorePath, TINY_PNG, 'image/jpeg'));
  });

  test('DENY guest of wrong house writing chore photo', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseGuest(USER_A_UID, HOUSE_ID_OTHER),
    );
    await assertFails(uploadToPath(ctx, chorePath, TINY_PNG, 'image/jpeg'));
  });

  test('DENY non-image content type for chore photo', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseGuest(USER_A_UID, HOUSE_ID),
    );
    await assertFails(
      uploadToPath(ctx, chorePath, TINY_PDF, 'application/pdf'),
    );
  });

  test('DENY chore photo over 10 MB', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseGuest(USER_A_UID, HOUSE_ID),
    );
    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1, 0);
    await assertFails(uploadToPath(ctx, chorePath, oversized, 'image/jpeg'));
  });

  test('User with both guest+admin claims can upload chore photo', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseMember(USER_A_UID, HOUSE_ID),
    );
    await assertSucceeds(uploadToPath(ctx, chorePath, TINY_PNG, 'image/jpeg'));
  });
});

// ---------------------------------------------------------------------------
// 7. PDF reports: reports/{houseId}/{reportPath=**}
// ---------------------------------------------------------------------------
describe('PDF reports (reports/{houseId}/{reportPath=**})', () => {
  const reportPath = `reports/${HOUSE_ID}/weekly/2024-W01.pdf`;

  test('ALLOW house admin to upload PDF report', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseAdmin(USER_A_UID, HOUSE_ID),
    );
    await assertSucceeds(
      uploadToPath(ctx, reportPath, TINY_PDF, 'application/pdf'),
    );
  });

  test('ALLOW house superAdmin to upload PDF report', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseSuperAdmin(USER_A_UID, HOUSE_ID),
    );
    await assertSucceeds(
      uploadToPath(ctx, reportPath, TINY_PDF, 'application/pdf'),
    );
  });

  test('ALLOW house guest to read report', async () => {
    const adminCtx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseAdmin(USER_A_UID, HOUSE_ID),
    );
    await uploadToPath(adminCtx, reportPath, TINY_PDF, 'application/pdf');

    const guestCtx = testEnv.authenticatedContext(
      USER_B_UID,
      authHouseGuest(USER_B_UID, HOUSE_ID),
    );
    await assertSucceeds(readFromPath(guestCtx, reportPath));
  });

  test('ALLOW reading deeply-nested report path', async () => {
    const deepPath = `reports/${HOUSE_ID}/2024/01/weekly/guest-summary.pdf`;
    const adminCtx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseAdmin(USER_A_UID, HOUSE_ID),
    );
    await uploadToPath(adminCtx, deepPath, TINY_PDF, 'application/pdf');

    const guestCtx = testEnv.authenticatedContext(
      USER_B_UID,
      authHouseGuest(USER_B_UID, HOUSE_ID),
    );
    await assertSucceeds(readFromPath(guestCtx, deepPath));
  });

  test('DENY house guest writing report', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseGuest(USER_A_UID, HOUSE_ID),
    );
    await assertFails(
      uploadToPath(ctx, reportPath, TINY_PDF, 'application/pdf'),
    );
  });

  test('DENY non-member reading report', async () => {
    const adminCtx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseAdmin(USER_A_UID, HOUSE_ID),
    );
    await uploadToPath(adminCtx, reportPath, TINY_PDF, 'application/pdf');

    const plainCtx = testEnv.authenticatedContext(
      USER_B_UID,
      authUserOnly(USER_B_UID),
    );
    await assertFails(readFromPath(plainCtx, reportPath));
  });

  test('DENY admin of wrong house reading report', async () => {
    const adminCtx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseAdmin(USER_A_UID, HOUSE_ID),
    );
    await uploadToPath(adminCtx, reportPath, TINY_PDF, 'application/pdf');

    const wrongAdmin = testEnv.authenticatedContext(
      USER_B_UID,
      authHouseAdmin(USER_B_UID, HOUSE_ID_OTHER),
    );
    await assertFails(readFromPath(wrongAdmin, reportPath));
  });

  test('DENY non-PDF content type for report', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseAdmin(USER_A_UID, HOUSE_ID),
    );
    await assertFails(uploadToPath(ctx, reportPath, TINY_PNG, 'image/png'));
  });

  test('DENY report over 20 MB', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseAdmin(USER_A_UID, HOUSE_ID),
    );
    const oversized = Buffer.alloc(20 * 1024 * 1024 + 1, 0);
    await assertFails(
      uploadToPath(ctx, reportPath, oversized, 'application/pdf'),
    );
  });
});

// ---------------------------------------------------------------------------
// 8. Temporary uploads: temp/{userId}/{tempPath=**}
// ---------------------------------------------------------------------------
describe('Temporary uploads (temp/{userId}/{tempPath=**})', () => {
  const tempPath = `temp/${USER_A_UID}/upload.dat`;

  test('ALLOW owner to write to their temp directory', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authUserOnly(USER_A_UID),
    );
    await assertSucceeds(uploadToPath(ctx, tempPath, TINY_PNG, 'image/png'));
  });

  test('ALLOW owner to read from their temp directory', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authUserOnly(USER_A_UID),
    );
    await uploadToPath(ctx, tempPath, TINY_PNG, 'image/png');
    await assertSucceeds(readFromPath(ctx, tempPath));
  });

  test('ALLOW owner to write any content type to temp', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authUserOnly(USER_A_UID),
    );
    await assertSucceeds(
      uploadToPath(
        ctx,
        `temp/${USER_A_UID}/doc.pdf`,
        TINY_PDF,
        'application/pdf',
      ),
    );
  });

  test('ALLOW deeply nested temp path', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authUserOnly(USER_A_UID),
    );
    await assertSucceeds(
      uploadToPath(
        ctx,
        `temp/${USER_A_UID}/subdir/nested/file.jpg`,
        TINY_PNG,
        'image/jpeg',
      ),
    );
  });

  test('DENY another user reading owner temp file', async () => {
    const ownerCtx = testEnv.authenticatedContext(
      USER_A_UID,
      authUserOnly(USER_A_UID),
    );
    await uploadToPath(ownerCtx, tempPath, TINY_PNG, 'image/png');

    const otherCtx = testEnv.authenticatedContext(
      USER_B_UID,
      authUserOnly(USER_B_UID),
    );
    await assertFails(readFromPath(otherCtx, tempPath));
  });

  test('DENY another user writing to owner temp directory', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_B_UID,
      authUserOnly(USER_B_UID),
    );
    await assertFails(uploadToPath(ctx, tempPath, TINY_PNG, 'image/png'));
  });

  test('DENY temp upload over 10 MB', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authUserOnly(USER_A_UID),
    );
    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1, 0);
    await assertFails(uploadToPath(ctx, tempPath, oversized, 'image/png'));
  });
});

// ---------------------------------------------------------------------------
// 9. Catch-all deny for paths not matching any rule
// ---------------------------------------------------------------------------
describe('Catch-all deny for unlisted paths', () => {
  test.each([
    'rootfile.txt',
    'arbitrary/deeply/nested/path.txt',
    'backups/database.sql',
    'config/settings.json',
    'admin/secret.key',
  ])('DENY authenticated user writing to unlisted path: %s', async filePath => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authUserOnly(USER_A_UID),
    );
    await assertFails(uploadToPath(ctx, filePath, TINY_PNG, 'image/png'));
  });

  test('DENY admin writing to path outside defined house structure', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseAdmin(USER_A_UID, HOUSE_ID),
    );
    await assertFails(
      uploadToPath(ctx, 'logs/access.log', TINY_PNG, 'text/plain'),
    );
  });

  test('DENY admin writing to houses/{houseId} root (no sub-resource)', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authHouseAdmin(USER_A_UID, HOUSE_ID),
    );
    await assertFails(
      uploadToPath(ctx, `houses/${HOUSE_ID}`, TINY_PNG, 'image/png'),
    );
  });

  test('DENY writing to users/{userId} without the avatar sub-path', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authUserOnly(USER_A_UID),
    );
    await assertFails(
      uploadToPath(ctx, `users/${USER_A_UID}/notavatar`, TINY_PNG, 'image/png'),
    );
  });

  test('DENY writing to users/{userId}/avatar/extra/nested (too deep)', async () => {
    const ctx = testEnv.authenticatedContext(
      USER_A_UID,
      authUserOnly(USER_A_UID),
    );
    await assertFails(
      uploadToPath(
        ctx,
        `users/${USER_A_UID}/avatar/extra/nested`,
        TINY_PNG,
        'image/png',
      ),
    );
  });
});
