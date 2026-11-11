/**
 * Firestore Security Rules Tests — who may record a payment.
 *
 * Staff record a cash, check, Venmo or Zelle payment as a payments record plus a
 * rentOwed decrement, in one batch (app services/payments recordManualPayment).
 * Only a manager or above may (owner decision 2026-11-10: peer leaders do not
 * record payments at launch). A peer leader paying their own rent by card still
 * writes the pending record the app keeps for it (recordRentPayment); the Stripe
 * webhook writes the real one.
 *
 *   cd firebase && firebase emulators:exec --only firestore --project demo-test \
 *     "npm --prefix .. run test:rules -- manualPayments"
 */

import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, increment, setDoc, writeBatch } from 'firebase/firestore';
import { ADMIN, HOUSE, OWNER, PEER, RESIDENT, useRentRulesEnv } from './rentRulesHarness';

const rules = useRentRulesEnv('demo-manual-payments-rules-test');
const as = rules.as;

const manualPayment = (uid: string, id: string) => {
  const db = as(uid);
  const batch = writeBatch(db);
  batch.set(doc(db, `payments/${id}`), {
    id,
    guestId: 'gResident',
    houseId: HOUSE,
    guestUserId: RESIDENT,
    amount: 5000,
    currency: 'usd',
    status: 'succeeded',
    description: 'Manual Payment — Cash',
    createdAt: '2026-11-10T00:00:00.000Z',
  });
  batch.update(doc(db, 'guests/gResident'), { rentOwed: increment(-5000) });
  return batch.commit();
};

const pendingCardRecord = (uid: string, guestUserId: string, status = 'pending') =>
  setDoc(doc(as(uid), 'payments/pi_test_1'), {
    id: 'pi_test_1',
    guestId: 'gPeer',
    houseId: HOUSE,
    guestUserId,
    amount: 20000,
    status,
    description: 'Rent Payment',
    createdAt: '2026-11-10T00:00:00.000Z',
  });

describe('payments: recording a payment', () => {
  it('a manager records a manual payment', () => assertSucceeds(manualPayment(ADMIN, 'm1')));
  it('an owner records a manual payment', () => assertSucceeds(manualPayment(OWNER, 'm2')));
  it('a peer leader cannot record a manual payment', () => assertFails(manualPayment(PEER, 'm3')));
  it('a peer leader cannot write the payment record alone either', () =>
    assertFails(
      setDoc(doc(as(PEER), 'payments/m4'), {
        guestId: 'gResident',
        houseId: HOUSE,
        guestUserId: RESIDENT,
        amount: 5000,
        status: 'succeeded',
      }),
    ));
  it('a resident cannot record a payment', () => assertFails(manualPayment(RESIDENT, 'm5')));
});

describe("payments: a peer leader's own card payment", () => {
  it('a peer leader writes the pending record for their own card payment', () =>
    assertSucceeds(pendingCardRecord(PEER, PEER)));
  it("a peer leader cannot write a pending record for another resident's payment", () =>
    assertFails(pendingCardRecord(PEER, RESIDENT)));
  it('a peer leader cannot write their own record as succeeded', () =>
    assertFails(pendingCardRecord(PEER, PEER, 'succeeded')));
});
