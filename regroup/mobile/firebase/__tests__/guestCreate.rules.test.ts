/**
 * Firestore Security Rules Tests — who may create a guests/{guestId} doc
 *
 * onGuestWrite splits the house's Equal Expense Share (EES) over the house's
 * guest docs, so a guest doc is a money input. The create rule used to accept
 * any signed-in user writing a doc with their own userId into ANY house; a
 * stranger's "ghost" doc changed real residents' EES amounts.
 *
 * Legitimate creates, all kept working here:
 *  - Invite signup (SignUpForm): redeemInvitation grants the guest claim,
 *    the client refreshes its token, then writes its own guest doc in a batch
 *    with the house currentCapacity update. Senior-peer invites get guest and
 *    admin claims.
 *  - Admin flows: resident intake form, CSV import (no userId), creating a
 *    guest for another account.
 *
 * Requires the Firebase Firestore emulator running on port 8080.
 *
 *   cd firebase && firebase emulators:exec --only firestore --project demo-rules \
 *     "cd .. && npx jest --config jest.config.rules.js firebase/__tests__/guestCreate.rules.test.ts"
 */

import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, writeBatch } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ID = 'demo-guest-create-rules-test';
const RULES_PATH = path.resolve(__dirname, '../firestore.rules');

const HOUSE_ID = 'house123';
const OTHER_HOUSE_ID = 'house456';
const RESIDENT_UID = 'newResident';
const STRANGER_UID = 'stranger';
const ADMIN_UID = 'houseAdmin';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(RULES_PATH, 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `houses/${HOUSE_ID}`), {
      id: HOUSE_ID,
      name: 'Test House',
      currentCapacity: 3,
    });
  });
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

const guestFor = (userId: string | undefined, houseId = HOUSE_ID) => ({
  ...(userId ? { userId } : {}),
  houseId,
  firstName: 'New',
  lastName: 'Resident',
  status: 'active',
});

describe('guests create — strangers are denied', () => {
  it('DENIES a signed-in user with no claims creating their own guest doc in a house', async () => {
    const ctx = testEnv.authenticatedContext(STRANGER_UID);
    await assertFails(setDoc(doc(ctx.firestore(), 'guests/ghost'), guestFor(STRANGER_UID)));
  });

  it('DENIES a guest of another house creating their own guest doc in this house', async () => {
    const ctx = testEnv.authenticatedContext(STRANGER_UID, {
      guest: { [OTHER_HOUSE_ID]: true },
    });
    await assertFails(setDoc(doc(ctx.firestore(), 'guests/ghost'), guestFor(STRANGER_UID)));
  });

  it('DENIES an admin of another house creating a guest doc in this house', async () => {
    const ctx = testEnv.authenticatedContext(STRANGER_UID, {
      admin: { [OTHER_HOUSE_ID]: true },
    });
    await assertFails(setDoc(doc(ctx.firestore(), 'guests/ghost'), guestFor(STRANGER_UID)));
  });

  it("DENIES a resident creating a guest doc that names someone else's userId", async () => {
    const ctx = testEnv.authenticatedContext(RESIDENT_UID, { guest: { [HOUSE_ID]: true } });
    await assertFails(setDoc(doc(ctx.firestore(), 'guests/g2'), guestFor('someoneElse')));
  });

  it('DENIES a resident creating a guest doc with no userId', async () => {
    const ctx = testEnv.authenticatedContext(RESIDENT_UID, { guest: { [HOUSE_ID]: true } });
    await assertFails(setDoc(doc(ctx.firestore(), 'guests/g2'), guestFor(undefined)));
  });

  it('DENIES an unauthenticated create', async () => {
    const ctx = testEnv.unauthenticatedContext();
    await assertFails(setDoc(doc(ctx.firestore(), 'guests/ghost'), guestFor(STRANGER_UID)));
  });
});

describe('guests create — invite signup still works', () => {
  it('ALLOWS a resident holding the guest claim to create their own guest doc', async () => {
    const ctx = testEnv.authenticatedContext(RESIDENT_UID, { guest: { [HOUSE_ID]: true } });
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'guests/g1'), guestFor(RESIDENT_UID)));
  });

  it('ALLOWS the SignUpForm batch: own guest doc plus the house currentCapacity bump', async () => {
    const ctx = testEnv.authenticatedContext(RESIDENT_UID, { guest: { [HOUSE_ID]: true } });
    const db = ctx.firestore();
    const batch = writeBatch(db);
    batch.update(doc(db, `houses/${HOUSE_ID}`), { currentCapacity: 4 });
    batch.set(doc(db, 'guests/g1'), guestFor(RESIDENT_UID));
    await assertSucceeds(batch.commit());
  });

  it('ALLOWS a senior peer (guest + admin claims) to create their own guest doc', async () => {
    const ctx = testEnv.authenticatedContext(RESIDENT_UID, {
      guest: { [HOUSE_ID]: true },
      admin: { [HOUSE_ID]: true },
    });
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), 'guests/g1'), { ...guestFor(RESIDENT_UID), isAdmin: true }),
    );
  });
});

describe('guests create — admin flows still work', () => {
  it('ALLOWS a house admin to admit a resident through intake (no userId)', async () => {
    const ctx = testEnv.authenticatedContext(ADMIN_UID, { admin: { [HOUSE_ID]: true } });
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'guests/intake1'), guestFor(undefined)));
  });

  it('ALLOWS a house admin to CSV-import several residents in one batch', async () => {
    const ctx = testEnv.authenticatedContext(ADMIN_UID, { admin: { [HOUSE_ID]: true } });
    const db = ctx.firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'guests/imp1'), guestFor(undefined));
    batch.set(doc(db, 'guests/imp2'), guestFor(undefined));
    await assertSucceeds(batch.commit());
  });

  it('ALLOWS a house admin to create a guest doc for another account', async () => {
    const ctx = testEnv.authenticatedContext(ADMIN_UID, { admin: { [HOUSE_ID]: true } });
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'guests/g1'), guestFor(RESIDENT_UID)));
  });

  it('ALLOWS a superAdmin of the house to create a guest doc', async () => {
    const ctx = testEnv.authenticatedContext(ADMIN_UID, { superAdmin: { [HOUSE_ID]: true } });
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'guests/g1'), guestFor(RESIDENT_UID)));
  });
});
