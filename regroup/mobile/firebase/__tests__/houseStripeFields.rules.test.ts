/**
 * Firestore Security Rules Tests — a house's Stripe Connect destination is server-only
 *
 * createPaymentIntent sends rent to houses/{id}.stripeAccountId once
 * stripeStatus is "active", and scheduled rent collection (rentDestination.ts)
 * reads the same fields. Only the server writes them, through the Admin SDK
 * (createHouses, the connect/disconnect/status callables, the Connect webhooks,
 * account deletion). A client of any rank, the owner and co-owners included,
 * must not be able to point rent at another connected account or mark an
 * unfinished one active.
 *
 * Requires the Firebase Firestore emulator running on port 8080.
 *
 * Setup:
 *   cd firebase && firebase emulators:start --only firestore
 *   npx jest --config jest.config.rules.js firebase/__tests__/houseStripeFields.rules.test.ts
 */

import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteField } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ID = 'rats-house-stripe-fields-rules-test';
const RULES_PATH = path.resolve(__dirname, '../firestore.rules');

const OWNER_UID = 'houseOwner';
const HOUSE_ID = 'house123';
const SUPER_ADMIN_CLAIMS = { superAdmin: { [HOUSE_ID]: true } };

const seededHouse = {
  id: HOUSE_ID,
  name: 'Test House',
  ownerId: OWNER_UID,
  superAdminId: OWNER_UID,
  stripeAccountId: 'acct_server_set',
  stripeStatus: 'pending',
  stripeAccountApi: 'v1',
  subscriptionStatus: 'active',
};

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
    await setDoc(doc(ctx.firestore(), `houses/${HOUSE_ID}`), seededHouse);
  });
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

function ownerHouseRef() {
  const ctx = testEnv.authenticatedContext(OWNER_UID, SUPER_ADMIN_CLAIMS);
  return doc(ctx.firestore(), `houses/${HOUSE_ID}`);
}

describe('houses/{houseId} Stripe Connect fields are server-only', () => {
  it('BLOCKS a house superAdmin pointing stripeAccountId at another connected account', async () => {
    await assertFails(updateDoc(ownerHouseRef(), { stripeAccountId: 'acct_someone_else' }));
  });

  it('BLOCKS a house superAdmin removing stripeAccountId', async () => {
    await assertFails(updateDoc(ownerHouseRef(), { stripeAccountId: deleteField() }));
  });

  it('BLOCKS a house superAdmin marking stripeStatus active', async () => {
    await assertFails(updateDoc(ownerHouseRef(), { stripeStatus: 'active' }));
  });

  it('BLOCKS a stale whole-house save that puts back an older stripeAccountId and stripeStatus', async () => {
    await assertFails(
      updateDoc(ownerHouseRef(), {
        name: 'Renamed House',
        stripeAccountId: 'acct_old',
        stripeStatus: 'not_connected',
      }),
    );
  });

  it('lets a house superAdmin save a whole-house copy whose Stripe fields are unchanged', async () => {
    await assertSucceeds(updateDoc(ownerHouseRef(), { ...seededHouse, name: 'Renamed House' }));
  });

  it('BLOCKS a merge set that changes stripeAccountId', async () => {
    await assertFails(
      setDoc(ownerHouseRef(), { stripeAccountId: 'acct_someone_else' }, { merge: true }),
    );
  });
});

// Before Connect is set up the house has neither field: the first account must
// still come from connectStripeAccount, not from a client adding the fields.
describe('a house with no Stripe Connect account yet', () => {
  const unconnectedHouse: Record<string, unknown> = { ...seededHouse };
  delete unconnectedHouse.stripeAccountId;
  delete unconnectedHouse.stripeStatus;
  const hijack = { stripeAccountId: 'acct_someone_else', stripeStatus: 'active' };

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `houses/${HOUSE_ID}`), unconnectedHouse);
    });
  });

  it('BLOCKS a house superAdmin adding an active account', async () => {
    await assertFails(updateDoc(ownerHouseRef(), hijack));
  });

  it('BLOCKS a house manager (admin claim) adding an active account', async () => {
    const ctx = testEnv.authenticatedContext('manager', { admin: { [HOUSE_ID]: true } });
    await assertFails(updateDoc(doc(ctx.firestore(), `houses/${HOUSE_ID}`), hijack));
  });

  it('BLOCKS a house manager (admin claim) adding only stripeStatus', async () => {
    const ctx = testEnv.authenticatedContext('manager', { admin: { [HOUSE_ID]: true } });
    await assertFails(
      updateDoc(doc(ctx.firestore(), `houses/${HOUSE_ID}`), { stripeStatus: 'active' }),
    );
  });

  it('lets the same house superAdmin and manager rename the house', async () => {
    await assertSucceeds(updateDoc(ownerHouseRef(), { name: 'Renamed House' }));
    const ctx = testEnv.authenticatedContext('manager', { admin: { [HOUSE_ID]: true } });
    await assertSucceeds(
      updateDoc(doc(ctx.firestore(), `houses/${HOUSE_ID}`), { name: 'Renamed Again' }),
    );
  });
});
