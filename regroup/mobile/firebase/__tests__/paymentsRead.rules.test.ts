/**
 * Firestore Security Rules Tests — who may read payment records.
 *
 * The owner decided (2026-11-09) that peer leaders see no house money. They
 * hold the same `admin` claim as managers, so the read rule checks the
 * server-only house-roles tier (callerRank >= 2: owner or manager), as the
 * payment callables already do (isHouseMoneyStaff). A peer leader is also a
 * resident and still reads their own payments, like any resident.
 *
 *   cd firebase && firebase emulators:exec --only firestore --project demo-test \
 *     "npm --prefix .. run test:rules -- paymentsRead"
 */

import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import {
  ADMIN,
  HOUSE,
  OTHER_RESIDENT,
  OWNER,
  PEER,
  RESIDENT,
  useRentRulesEnv,
} from './rentRulesHarness';

const rules = useRentRulesEnv('demo-payments-read-rules-test');
const as = rules.as;

const payment = (id: string, guestId: string, guestUserId: string) => ({
  id,
  guestId,
  houseId: HOUSE,
  guestUserId,
  amount: 20000,
  status: 'succeeded',
});

beforeEach(async () => {
  await rules.env().withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'payments/pResident'), payment('pResident', 'gResident', RESIDENT));
    await setDoc(doc(db, 'payments/pPeer'), payment('pPeer', 'gPeer', PEER));
  });
});

const read = (uid: string, id: string) => getDoc(doc(as(uid), `payments/${id}`));
const houseQuery = (uid: string) =>
  getDocs(query(collection(as(uid), 'payments'), where('houseId', '==', HOUSE)));
const ownQuery = (uid: string) =>
  getDocs(
    query(
      collection(as(uid), 'payments'),
      where('houseId', '==', HOUSE),
      where('guestUserId', '==', uid),
    ),
  );

describe("payments: reading a resident's payment", () => {
  it('the owner reads it', () => assertSucceeds(read(OWNER, 'pResident')));
  it('a manager reads it', () => assertSucceeds(read(ADMIN, 'pResident')));
  it('a peer leader cannot read it', () => assertFails(read(PEER, 'pResident')));
  it('the resident reads their own', () => assertSucceeds(read(RESIDENT, 'pResident')));
  it('another resident cannot read it', () => assertFails(read(OTHER_RESIDENT, 'pResident')));
});

describe("payments: a peer leader's own payments", () => {
  it('a peer leader reads their own payment', () => assertSucceeds(read(PEER, 'pPeer')));
  it('a peer leader lists their own payment history', () => assertSucceeds(ownQuery(PEER)));
});

describe("payments: listing a house's payments", () => {
  it('the owner lists them', () => assertSucceeds(houseQuery(OWNER)));
  it('a manager lists them', () => assertSucceeds(houseQuery(ADMIN)));
  it('a peer leader cannot list them', () => assertFails(houseQuery(PEER)));
  it('a resident cannot list them', () => assertFails(houseQuery(RESIDENT)));
  it('a resident lists their own payment history', () => assertSucceeds(ownQuery(RESIDENT)));
});
