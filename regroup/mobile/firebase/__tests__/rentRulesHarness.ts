/**
 * Setup for the rent rules suite (rentCharges.rules.test.ts): one traditional house with an owner, a manager,
 * a peer leader and two residents, their rent records, and an `as(uid)` context.
 * Not a suite itself.
 */
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const RULES_PATH = path.resolve(__dirname, '../firestore.rules');

export const HOUSE = 'house123';
export const OWNER = 'operator';
export const ADMIN = 'houseAdmin';
export const PEER = 'peerLeader';
export const RESIDENT = 'resident';
export const OTHER_RESIDENT = 'otherResident';

/** Registers the suite's hooks. Call once at the top of a suite file. */
/** Each suite passes its own project id: jest runs suites in parallel on one emulator. */
export function useRentRulesEnv(projectId: string) {
  let testEnv: RulesTestEnvironment;
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId,
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

  const guest = (userId: string) => ({
    userId,
    houseId: HOUSE,
    firstName: 'Test',
    status: 'active',
    rentOwed: 20000,
    choreFees: 0,
    phoneNumber: '',
  });

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `houses/${HOUSE}`), {
        id: HOUSE,
        name: 'Test House',
        rentFrequency: 'both',
        weeklyRent: 0,
        monthlyRent: 0,
      });
      await setDoc(doc(db, `house-roles/${HOUSE}_${PEER}`), { tier: 'peerLeader' });
      await setDoc(doc(db, `house-roles/${HOUSE}_${ADMIN}`), { tier: 'manager' });
      await setDoc(doc(db, 'guests/gPeer'), guest(PEER));
      await setDoc(doc(db, 'guests/gResident'), guest(RESIDENT));
      await setDoc(doc(db, 'guests/gOther'), guest(OTHER_RESIDENT));
      await setDoc(doc(db, 'rentCharges/gResident_2026-11-18'), {
        guestId: 'gResident',
        houseId: HOUSE,
        guestUserId: RESIDENT,
        amountCents: 12500,
      });
      await setDoc(doc(db, 'rentCharges/gOther_2026-11-18'), {
        guestId: 'gOther',
        houseId: HOUSE,
        guestUserId: OTHER_RESIDENT,
        amountCents: 12500,
      });
      await setDoc(doc(db, 'rentAccounts/gResident'), { guestId: 'gResident', houseId: HOUSE });
      await setDoc(doc(db, 'config/rentCharges'), { paused: false });
    });
  });

  afterEach(async () => {
    await testEnv.clearFirestore();
  });

  const as = (uid: string) => {
    const claims: Record<string, unknown> =
      uid === OWNER
        ? { superAdmin: { [HOUSE]: true } }
        : uid === ADMIN || uid === PEER
        ? { admin: { [HOUSE]: true }, ...(uid === PEER ? { guest: { [HOUSE]: true } } : {}) }
        : { guest: { [HOUSE]: true } };
    return testEnv.authenticatedContext(uid, claims).firestore();
  };
  return { env: () => testEnv, as };
}
