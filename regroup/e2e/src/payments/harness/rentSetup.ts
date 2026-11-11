/** Houses, residents and accounts for the rent charging rows, written as the server writes them. */
import type Stripe from 'stripe';
import { callAs } from './callables';
import {
  adminDb,
  seedConnectedHouse,
  seedResident,
  SeededHouse,
  SeededOperator,
  SeededResident,
  uniqueId,
} from './fixtures';
import { deliverType, docData, nowS } from './flows';
import { confirmWithCard, paymentIntentId } from './payWithTestCard';
import { waitFor } from './waitFor';

export const WEEKLY = { rentFrequency: 'weekly', weeklyRent: 175 };
export const MONTHLY = { rentFrequency: 'monthly', monthlyRent: 800 };

const houseState = (house: SeededHouse) => docData(`rentHouseStates/${house.id}`);

/** A house that turns charging on now; resolves once its rent trigger has recorded the start. */
export async function houseChargingNow(by: SeededOperator, rent: object): Promise<SeededHouse> {
  const house = await seedConnectedHouse(by, rent);
  await waitFor(
    () => houseState(house),
    (s) => typeof s.startDate === 'string',
  );
  return house;
}

/**
 * A house that charges nothing yet. It starts on and is turned off: for a house created
 * off, its rent trigger writes nothing, so a test can't tell it has run, and a late run
 * would clear a start the test wrote.
 */
export async function houseNotCharging(by: SeededOperator): Promise<SeededHouse> {
  const house = await houseChargingNow(by, WEEKLY);
  await adminDb().doc(`houses/${house.id}`).update({ rentFrequency: null });
  await waitFor(
    () => houseState(house),
    (s) => s.startDate === null && typeof s.clearedAtMs === 'number',
  );
  return house;
}

export const turnOn = (house: SeededHouse, rent: object) =>
  adminDb().doc(`houses/${house.id}`).update(rent);

/** Charging that began on `startDate`, as the house trigger records it. */
export const startedOn = (house: SeededHouse, startDate: string) =>
  adminDb()
    .doc(`rentHouseStates/${house.id}`)
    .set({
      startDate,
      startedAtMs: Date.parse(`${startDate}T12:00:00Z`),
      clearedAtMs: null,
      updatedAtMs: Date.now(),
    });

/** The account of a resident charged since `startDate`, through `chargedThrough`. */
export const chargedAccount = (startDate: string, chargedThrough: string) => ({
  anchoredTo: startDate,
  chargeFrom: startDate,
  chargedThrough,
  joinedOn: startDate,
  houseJoinedAtMs: Date.parse(`${startDate}T12:00:00Z`),
  reactivatedOn: null,
});

/**
 * A resident added while the house charges nothing, with their account written first,
 * so only a later path charges them. Their create trigger backfills moveInDate before
 * it reads the house and finds charging off; the pause lets it finish. A guest passed
 * in should be inactive, which the trigger leaves alone.
 */
export async function residentBeforeCharging(
  house: SeededHouse,
  opts: { account?: object; guest?: object; rentOwed?: number } = {},
): Promise<SeededResident> {
  const guestId = uniqueId('guest');
  if (opts.account) {
    await adminDb()
      .doc(`rentAccounts/${guestId}`)
      .set({ guestId, houseId: house.id, ...opts.account });
  }
  const r = await seedResident(house, { guestId, guest: opts.guest, rentOwed: opts.rentOwed });
  if (!opts.guest) {
    await waitFor(
      () => docData(`guests/${guestId}`),
      (g) => !!g.moveInDate,
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return r;
}

/** The resident's charges, oldest first. */
export async function chargesOf(r: SeededResident): Promise<Record<string, unknown>[]> {
  const snap = await adminDb().collection('rentCharges').where('guestId', '==', r.guestId).get();
  return snap.docs
    .map((d): Record<string, unknown> => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(a.from).localeCompare(String(b.from)));
}

/** Pays `amount` by test card, as the app does, and delivers Stripe's success event. */
export async function payRent(stripe: Stripe, r: SeededResident, amount: number): Promise<void> {
  const since = nowS() - 5;
  const res = await callAs(r.uid, 'createPaymentIntent', {
    guestId: r.guestId,
    houseId: r.houseId,
    amount,
    // The key the app sends: rentPaymentIdempotencyKey in mobile services/payments.ts.
    idempotencyKey: `${r.guestId}-${r.houseId}-${new Date().toISOString().slice(0, 10)}-${amount}`,
  });
  if (res.errorCode) throw new Error(`createPaymentIntent: ${res.errorCode}: ${res.errorMessage}`);
  const secret = (res.data as { clientSecret: string }).clientSecret;
  await confirmWithCard(stripe, secret, 'pm_card_visa');
  await deliverType(stripe, {
    since,
    objectId: paymentIntentId(secret),
    type: 'payment_intent.succeeded',
  });
}
