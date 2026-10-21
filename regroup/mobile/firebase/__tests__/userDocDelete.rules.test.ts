/**
 * Firestore Security Rules Tests — users/{userId} cannot be deleted by a client
 *
 * The user doc holds the server-written subscriptionMetadata: its houses map is
 * the property-cap count createHouses enforces. Deleting and recreating the doc
 * (create allows an empty map) reset that count, so an operator at the cap could
 * subscribe again and add a full new set of houses. Account deletion runs
 * server-side through the deleteAccount callable (Admin SDK), unaffected.
 *
 * Requires the Firebase Firestore emulator running on port 8080.
 *
 * Setup:
 *   cd firebase && firebase emulators:start --only firestore
 *   npx jest --config jest.config.rules.js firebase/__tests__/userDocDelete.rules.test.ts
 */

import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ID = 'rats-user-doc-delete-rules-test';
const RULES_PATH = path.resolve(__dirname, '../firestore.rules');
const UID = 'operatorUser';

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

const seedOperatorAtCap = () =>
  testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `users/${UID}`), {
      id: UID,
      subscriptionMetadata: { status: 'active', houses: { h1: { numberOfGuests: 0 } } },
    });
  });

describe('users/{userId} delete', () => {
  it('BLOCKS a user deleting their own user doc', async () => {
    await seedOperatorAtCap();
    const ctx = testEnv.authenticatedContext(UID);
    await assertFails(deleteDoc(doc(ctx.firestore(), `users/${UID}`)));
  });

  it("BLOCKS deleting another user's doc", async () => {
    await seedOperatorAtCap();
    const ctx = testEnv.authenticatedContext('someoneElse');
    await assertFails(deleteDoc(doc(ctx.firestore(), `users/${UID}`)));
  });

  it('still lets a new user create their own doc with an empty houses map', async () => {
    const ctx = testEnv.authenticatedContext('newUser');
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), 'users/newUser'), {
        id: 'newUser',
        subscriptionMetadata: { status: '', houses: {} },
      }),
    );
  });
});
