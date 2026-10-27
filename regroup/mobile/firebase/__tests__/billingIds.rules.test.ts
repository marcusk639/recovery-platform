/**
 * Firestore Security Rules Tests — client-seeded Stripe billing ids
 *
 * Account deletion acts on Stripe ids read from a user's own guest docs and
 * user doc, and a user can create both (invite signup; the user doc can be
 * deleted and recreated). These pin that a client cannot seed those ids on
 * create or add them to a guest doc later. The server also checks Stripe
 * ownership (metadata.userId) before cancelling or deleting anything; house
 * admins can still set guest payment fields.
 *
 * Self-create needs the guest claim for the house (see guestCreate.rules.test.ts),
 * which invite signup holds before it writes, so the self-create cases here run
 * with that claim and still isolate the payment-field guard.
 *
 * Requires the Firebase Firestore emulator running on port 8080.
 *
 * Setup:
 *   cd firebase && firebase emulators:start --only firestore
 *   npx jest --config jest.config.rules.js firebase/__tests__/billingIds.rules.test.ts
 */

import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ID = 'rats-guest-payment-fields-rules-test';
const RULES_PATH = path.resolve(__dirname, '../firestore.rules');

const SELF_UID = 'newResident';
const ADMIN_UID = 'houseAdmin';
const HOUSE_ID = 'house123';
const SIGNUP_CLAIMS = { guest: { [HOUSE_ID]: true } };

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

// Invited self-create needs the server-written admission ticket that
// redeemInvitation leaves (admissionTicket.rules.test.ts covers its rules).
beforeEach(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `admission-tickets/${SELF_UID}_${HOUSE_ID}`), {
      invitationId: 'T',
      role: 'guest',
      initialPhase: '',
      used: false,
      createdAt: Timestamp.now(),
      expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 3600 * 1000),
    });
  });
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
    const ctx = testEnv.authenticatedContext(SELF_UID, SIGNUP_CLAIMS);
    await assertSucceeds(setDoc(doc(ctx.firestore(), 'guests/g1'), signupGuest));
  });

  it.each([
    ['stripeCustomerId', { stripeCustomerId: 'cus_victim' }],
    ['defaultPaymentMethodId', { defaultPaymentMethodId: 'pm_victim' }],
  ])('BLOCKS a self-created guest doc carrying %s', async (_label, extra) => {
    const ctx = testEnv.authenticatedContext(SELF_UID, SIGNUP_CLAIMS);
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

describe("guests self-update payment fields", () => {
  it.each([["stripeCustomerId"], ["defaultPaymentMethodId"]])(
    "BLOCKS a resident adding %s to their own guest doc",
    async (field) => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "guests/g1"), signupGuest);
      });
      const ctx = testEnv.authenticatedContext(SELF_UID);
      await assertFails(updateDoc(doc(ctx.firestore(), "guests/g1"), { [field]: "planted" }));
    },
  );
});

describe("users self-create Stripe ids", () => {
  // The client writes the whole User entity on create; its defaults are "".
  const defaults = { status: "", customerId: "", subscriptionId: "", houses: {} };

  it("lets a user create their doc with the default empty billing ids", async () => {
    const ctx = testEnv.authenticatedContext(SELF_UID);
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), `users/${SELF_UID}`), { subscriptionMetadata: defaults }),
    );
  });

  it.each([
    ["customerId", { customerId: "cus_victim" }],
    ["subscriptionId", { subscriptionId: "sub_victim" }],
  ])("BLOCKS a user creating their doc with a seeded %s", async (_label, seeded) => {
    const ctx = testEnv.authenticatedContext(SELF_UID);
    await assertFails(
      setDoc(doc(ctx.firestore(), `users/${SELF_UID}`), {
        subscriptionMetadata: { ...defaults, ...seeded },
      }),
    );
  });
});
