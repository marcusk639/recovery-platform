/**
 * Firestore Security Rules Tests: choreRotations/{houseId} (issue #196)
 *
 * The collection had no rule, so every read was refused. House Summary runs
 * useAutoAdvanceRotation for whoever opens it, which reads
 * choreRotations/{houseId} and logged a permission-denied error on every view.
 * services/choreRotation.ts sets a house's rotation (setRotationOrder) and
 * advances it weekly (advanceRotation: currentIndex and lastRotatedAt only).
 *
 * Needs a Firestore emulator. FIRESTORE_EMULATOR_HOST, which
 * `firebase emulators:exec` sets, overrides the default 127.0.0.1:8080:
 *
 *   cd firebase && firebase emulators:exec --only firestore --project demo-test \
 *     "cd .. && npx jest --config jest.config.rules.js firebase/__tests__/choreRotations.rules.test.ts"
 */

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ID = 'demo-chore-rotations-rules-test';
const [FIRESTORE_HOST, FIRESTORE_PORT] = (
  process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080'
).split(':');
const RULES_PATH = path.resolve(__dirname, '../firestore.rules');

const HOUSE = 'house123';
const OTHER_HOUSE = 'house999';

let testEnv: RulesTestEnvironment;

const staff = () => testEnv.authenticatedContext('staffUid', { admin: { [HOUSE]: true } });
const owner = () => testEnv.authenticatedContext('ownerUid', { superAdmin: { [HOUSE]: true } });
const otherStaff = () =>
  testEnv.authenticatedContext('otherUid', { admin: { [OTHER_HOUSE]: true } });
const resident = () => testEnv.authenticatedContext('residentUid', { guest: { [HOUSE]: true } });
const otherResident = () =>
  testEnv.authenticatedContext('otherResident', { guest: { [OTHER_HOUSE]: true } });

const rotation = (overrides: Record<string, unknown> = {}) => ({
  choreName: 'Dishes',
  guestIds: ['g1', 'g2', 'g3'],
  currentIndex: 0,
  lastRotatedAt: '2026-11-08',
  ...overrides,
});
const rotationDoc = (
  ctx: ReturnType<RulesTestEnvironment['authenticatedContext']>,
  houseId = HOUSE,
) => doc(ctx.firestore(), `choreRotations/${houseId}`);

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(RULES_PATH, 'utf8'),
      host: FIRESTORE_HOST,
      port: Number(FIRESTORE_PORT),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `choreRotations/${HOUSE}`), rotation());
  });
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

describe('choreRotations read', () => {
  it("lets the house's staff, owner and residents read its rotation", async () => {
    await assertSucceeds(getDoc(rotationDoc(staff())));
    await assertSucceeds(getDoc(rotationDoc(owner())));
    await assertSucceeds(getDoc(rotationDoc(resident())));
  });

  it('lets House Summary read a house that has no rotation yet', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(), `choreRotations/${HOUSE}`));
    });
    await assertSucceeds(getDoc(rotationDoc(resident())));
  });

  it("refuses another house's staff and residents, and anyone signed out", async () => {
    await assertFails(getDoc(rotationDoc(otherStaff())));
    await assertFails(getDoc(rotationDoc(otherResident())));
    await assertFails(getDoc(rotationDoc(testEnv.unauthenticatedContext())));
  });
});

describe('choreRotations write', () => {
  it("lets the house's staff set its rotation, as setRotationOrder does", async () => {
    await assertSucceeds(setDoc(rotationDoc(staff()), rotation({ guestIds: ['g2', 'g1'] })));
    await assertSucceeds(setDoc(rotationDoc(owner()), rotation()));
  });

  it("lets the house's staff advance it, as advanceRotation does", async () => {
    await assertSucceeds(
      updateDoc(rotationDoc(staff()), { currentIndex: 1, lastRotatedAt: '2026-11-15' }),
    );
  });

  it('refuses residents, who could otherwise skip their own turn', async () => {
    await assertFails(setDoc(rotationDoc(resident()), rotation({ currentIndex: 2 })));
    await assertFails(
      updateDoc(rotationDoc(resident()), { currentIndex: 1, lastRotatedAt: '2026-11-15' }),
    );
  });

  it("refuses another house's staff", async () => {
    await assertFails(setDoc(rotationDoc(otherStaff()), rotation()));
    await assertFails(
      updateDoc(rotationDoc(otherStaff()), { currentIndex: 1, lastRotatedAt: '2026-11-15' }),
    );
  });

  it('refuses a rotation with unknown fields or the wrong types', async () => {
    await assertFails(setDoc(rotationDoc(staff()), rotation({ extra: true })));
    await assertFails(setDoc(rotationDoc(staff()), rotation({ guestIds: 'g1' })));
    await assertFails(setDoc(rotationDoc(staff()), rotation({ currentIndex: -1 })));
    await assertFails(setDoc(rotationDoc(staff()), rotation({ currentIndex: 1.5 })));
    await assertFails(setDoc(rotationDoc(staff()), rotation({ choreName: 7 })));
    await assertFails(setDoc(rotationDoc(staff()), rotation({ lastRotatedAt: 20261108 })));
  });

  it('refuses deletes, which the app never makes', async () => {
    await assertFails(deleteDoc(rotationDoc(staff())));
  });
});
