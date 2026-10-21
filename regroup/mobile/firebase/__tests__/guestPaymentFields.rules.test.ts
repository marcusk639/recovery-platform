/**
 * Firestore Security Rules Tests — guests/{guestId} self-create payment fields
 *
 * A user may create their own guest doc (invite signup), but not with the
 * Stripe payment fields. Account deletion deletes the customer on every guest
 * doc whose userId is the caller, and rent collection charges it, so a
 * self-made doc carrying a co-resident's stripeCustomerId pointed both at
 * someone else's card. House admins still create guests with any field.
 *
 * Requires the Firebase Firestore emulator running on port 8080.
 *
 * Setup:
 *   cd firebase && firebase emulators:start --only firestore
 *   npx jest --config jest.config.rules.js firebase/__tests__/guestPaymentFields.rules.test.ts
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

const PROJECT_ID = 'rats-guest-payment-fields-rules-test';
const RULES_PATH = path.resolve(__dirname, '../firestore.rules');

const SELF_UID = 'newResident';
const ADMIN_UID = 'houseAdmin';
const HOUSE_ID = 'house123';

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

afterEach(async () => {
  await testEnv.clearFirestore();
});

const signupGuest = {
  userId: SELF_UID,
  houseId: HOUSE_ID,
  firstName: 'New',
  lastName: 'Resident',
  email: 'new@example.com',
};

describe('guests self-create payment fields', () => {
  it('lets a user create their own guest doc without payment fields', async () => {
    const ctx = testEnv.authenticatedContext(SELF_UID);
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'guests/g1'), signupGuest));
  });

  it.each([
    ['stripeCustomerId', { stripeCustomerId: 'cus_victim' }],
    ['defaultPaymentMethodId', { defaultPaymentMethodId: 'pm_victim' }],
  ])('BLOCKS a self-created guest doc carrying %s', async (_label, extra) => {
    const ctx = testEnv.authenticatedContext(SELF_UID);
    await assertFails(setDoc(doc(ctx.firestore(), 'guests/g1'), { ...signupGuest, ...extra }));
  });

  it('still lets a house admin create a guest with payment fields', async () => {
    const ctx = testEnv.authenticatedContext(ADMIN_UID, { admin: { [HOUSE_ID]: true } });
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), 'guests/g1'), {
        ...signupGuest,
        stripeCustomerId: 'cus_1',
        defaultPaymentMethodId: 'pm_1',
      }),
    );
  });
});
