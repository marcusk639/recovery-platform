// Real Stripe charges in the local sandbox, with their real events delivered to the
// webhook. Run with: npm run test:payments -- rentLedger
import type Stripe from 'stripe';
import { callAs } from '../harness/callables';
import { deliver } from '../harness/eventPump';
import {
  seedConnectedHouse,
  seedOperator,
  seedResident,
  SeededHouse,
  SeededResident,
} from '../harness/fixtures';
import { deliverType, docData, eventsOfType, nowS } from '../harness/flows';
import { assertSafeTarget, LOCAL_CONNECT_ACCOUNT_FILE, readConfigFile } from '../harness/guards';
import { confirmWithCard, paymentIntentId } from '../harness/payWithTestCard';
import { waitFor } from '../harness/waitFor';

const SUCCEEDED = 'payment_intent.succeeded';
const FAILED = 'payment_intent.payment_failed';

let stripe: Stripe;
let house: SeededHouse;

beforeAll(async () => {
  stripe = await assertSafeTarget();
  const operator = await seedOperator();
  house = await seedConnectedHouse(operator);
});

const resident = (rentOwed: number) => seedResident(house, { rentOwed });
const rentOwed = async (r: SeededResident) => (await docData(`guests/${r.guestId}`)).rentOwed;

// The key the app always sends: rentPaymentIdempotencyKey in mobile services/payments.ts.
const startInput = (r: SeededResident, amount: number) => ({
  guestId: r.guestId,
  houseId: r.houseId,
  amount,
  idempotencyKey: `${r.guestId}-${r.houseId}-${new Date().toISOString().slice(0, 10)}-${amount}`,
});

async function startPayment(r: SeededResident, amount: number): Promise<string> {
  const res = await callAs(r.uid, 'createPaymentIntent', startInput(r, amount));
  if (res.errorCode) throw new Error(`createPaymentIntent: ${res.errorCode}: ${res.errorMessage}`);
  return (res.data as { clientSecret: string }).clientSecret;
}

async function pay(r: SeededResident, amount: number): Promise<{ pi: string; since: number }> {
  const since = nowS() - 5;
  const secret = await startPayment(r, amount);
  await confirmWithCard(stripe, secret, 'pm_card_visa');
  return { pi: paymentIntentId(secret), since };
}

test('RENT-001: paying the full balance clears it, records it, and pays the house with the right fee', async () => {
  const r = await resident(20000);
  const { pi, since } = await pay(r, 20000);

  // Nothing moves until Stripe's event arrives.
  expect(await rentOwed(r)).toBe(20000);
  await deliverType(stripe, { since, objectId: pi, type: SUCCEEDED });

  expect(await rentOwed(r)).toBe(0);
  expect(await docData(`payments/${pi}`)).toMatchObject({
    status: 'succeeded',
    amount: 20000,
    guestId: r.guestId,
    houseId: r.houseId,
    guestUserId: r.uid,
    rentApplied: true,
  });

  const intent = await stripe.paymentIntents.retrieve(pi);
  expect(intent.status).toBe('succeeded');
  expect(intent.amount_received).toBe(20000);
  expect(intent.transfer_data?.destination).toBe(readConfigFile(LOCAL_CONNECT_ACCOUNT_FILE));
  // By hand, for $200.00 by card: 0.75% ($1.50) + 2.9% ($5.80) + $0.30 = $7.60.
  expect(intent.application_fee_amount).toBe(760);
  // As Stripe moved the money, not just as it was asked to: a destination charge
  // transfers all of it to the house, then collects the fee back from the house.
  // Both appear a moment after the charge succeeds.
  const charge = await waitFor(
    () => stripe.charges.retrieve(intent.latest_charge as string),
    (c) => typeof c.transfer === 'string',
  );
  expect((await stripe.transfers.retrieve(charge.transfer as string)).amount).toBe(20000);
  const fees = await waitFor(
    async () => (await stripe.applicationFees.list({ created: { gte: since - 60 }, limit: 100 })).data.filter((f) => f.originating_transaction === charge.id),
    (found) => found.length > 0,
  );
  expect(fees.map((f) => f.amount)).toEqual([760]);
});

test('RENT-002: a partial payment lowers the balance by exactly that, in integer cents', async () => {
  const r = await resident(20000);
  const { pi, since } = await pay(r, 5033);
  await deliverType(stripe, { since, objectId: pi, type: SUCCEEDED });
  expect(await rentOwed(r)).toBe(14967);
  expect(Number.isInteger(await rentOwed(r))).toBe(true);
});

test('RENT-010: a double tap makes one intent and one charge', async () => {
  const r = await resident(20000);
  const first = await startPayment(r, 7000);
  const second = await startPayment(r, 7000);
  expect(paymentIntentId(second)).toBe(paymentIntentId(first));
  await confirmWithCard(stripe, first, 'pm_card_visa');
  const charges = await stripe.charges.list({ payment_intent: paymentIntentId(first) });
  expect(charges.data).toHaveLength(1);
});

test('RENT-010: two taps at the same moment still make one intent and one charge', async () => {
  const r = await resident(20000);
  const since = nowS() - 5;
  // Stripe may refuse one of two simultaneous requests with the same key; that tap
  // shows an error, which is safe. Charging twice is not.
  const taps = await Promise.allSettled([startPayment(r, 7100), startPayment(r, 7100)]);
  const secrets = taps.flatMap((t) => (t.status === 'fulfilled' ? [t.value] : []));
  expect(secrets.length).toBeGreaterThan(0);
  const pi = paymentIntentId(secrets[0]);
  for (const secret of secrets) expect(paymentIntentId(secret)).toBe(pi);
  await confirmWithCard(stripe, secrets[0], 'pm_card_visa');
  const intents = await stripe.paymentIntents.list({ created: { gte: since }, limit: 100 });
  expect(intents.data.filter((i) => i.metadata.guestId === r.guestId)).toHaveLength(1);
  expect((await stripe.charges.list({ payment_intent: pi })).data).toHaveLength(1);
});

test('RENT-013: a declined card leaves the balance alone and records no successful payment', async () => {
  const r = await resident(20000);
  const since = nowS() - 5;
  const secret = await startPayment(r, 6000);
  const pi = paymentIntentId(secret);
  await expect(confirmWithCard(stripe, secret, 'pm_card_chargeDeclined')).rejects.toThrow(
    /declined/i,
  );
  await deliverType(stripe, { since, objectId: pi, type: FAILED });

  expect(await rentOwed(r)).toBe(20000);
  const record = await docData(`payments/${pi}`);
  expect(record.status).toBe('failed');
  expect(record.failureCode).toEqual(expect.any(String));
  expect(record.rentApplied).not.toBe(true);
});

test('RENT-011: after a decline the same amount can be retried, and is charged once', async () => {
  const r = await resident(20000);
  const since = nowS() - 5;
  const secret = await startPayment(r, 6100);
  await expect(confirmWithCard(stripe, secret, 'pm_card_chargeDeclined')).rejects.toThrow(
    /declined/i,
  );

  const retry = await startPayment(r, 6100);
  expect(paymentIntentId(retry)).toBe(paymentIntentId(secret));
  await confirmWithCard(stripe, retry, 'pm_card_visa');
  const pi = paymentIntentId(retry);
  await deliverType(stripe, { since, objectId: pi, type: SUCCEEDED });

  expect(await rentOwed(r)).toBe(13900);
  const charges = await stripe.charges.list({ payment_intent: pi });
  expect(charges.data.filter((c) => c.status === 'succeeded')).toHaveLength(1);
});

test('RENT-026: a failure delivered after the retry succeeded leaves the payment paid', async () => {
  const r = await resident(20000);
  const since = nowS() - 5;
  const secret = await startPayment(r, 6200);
  await expect(confirmWithCard(stripe, secret, 'pm_card_chargeDeclined')).rejects.toThrow(
    /declined/i,
  );
  const retry = await startPayment(r, 6200);
  await confirmWithCard(stripe, retry, 'pm_card_visa');
  const pi = paymentIntentId(retry);

  // Out of order: the success lands first, then the earlier decline.
  await deliverType(stripe, { since, objectId: pi, type: SUCCEEDED });
  await deliverType(stripe, { since, objectId: pi, type: FAILED });

  expect(await rentOwed(r)).toBe(13800);
  const record = await docData(`payments/${pi}`);
  expect(record).toMatchObject({ status: 'succeeded', rentApplied: true });
  expect(record.failureCode).toBeUndefined();
});

test('RENT-023: a succeeded event delivered twice and at the same time lowers the balance once', async () => {
  const r = await resident(20000);
  const { pi, since } = await pay(r, 5000);
  const [event] = await eventsOfType(stripe, { since, objectId: pi, type: SUCCEEDED });

  // One concurrent delivery may be told to retry (409) or answer 500, which Stripe
  // redelivers. At least one must apply it.
  const concurrent = await Promise.all([deliver(event), deliver(event)]);
  for (const res of concurrent) expect([200, 409, 500]).toContain(res.status);
  expect(concurrent.some((res) => res.status === 200)).toBe(true);
  const last = await deliver(event);

  expect(last.status).toBe(200);
  expect(await rentOwed(r)).toBe(15000);
  expect((await docData(`payments/${pi}`)).rentApplied).toBe(true);
});

test('RENT-023: the same payment under a new event id still lowers the balance once', async () => {
  const r = await resident(20000);
  const { pi, since } = await pay(r, 5000);
  const [event] = await deliverType(stripe, { since, objectId: pi, type: SUCCEEDED });
  // A new id gets past the per-event claim, so only the payment's rentApplied marker stops it.
  expect((await deliver({ ...event, id: `${event.id}_again` })).status).toBe(200);
  expect(await rentOwed(r)).toBe(15000);
});

test('RENT-030: a resident cannot start a payment for another resident or another house', async () => {
  const r = await resident(20000);
  const other = await resident(20000);
  const otherOperator = await seedOperator();
  const otherHouse = await seedConnectedHouse(otherOperator);

  const forOtherGuest = await callAs(r.uid, 'createPaymentIntent', { guestId: other.guestId, houseId: r.houseId, amount: 1000 });
  expect(forOtherGuest.errorCode).toBe('permission-denied');
  const forOtherHouse = await callAs(r.uid, 'createPaymentIntent', { guestId: r.guestId, houseId: otherHouse.id, amount: 1000 });
  expect(forOtherHouse.errorCode).toBe('permission-denied');
});

test('RENT-032: signed out is refused', async () => {
  const r = await resident(20000);
  const res = await callAs(null, 'createPaymentIntent', {
    guestId: r.guestId,
    houseId: r.houseId,
    amount: 1000,
  });
  expect(res.errorCode).toBe('unauthenticated');
});

test('RENT-005: invalid amounts are refused before any intent exists', async () => {
  const r = await resident(20000);
  for (const amount of [0, -100, 10.5]) {
    const res = await callAs(r.uid, 'createPaymentIntent', {
      guestId: r.guestId,
      houseId: r.houseId,
      amount,
    });
    expect(res.errorCode).toBe('invalid-argument');
  }
});

test('RENT-006: paying more than is owed is refused when the payment starts (decision D3)', async () => {
  const r = await resident(1000);
  const res = await callAs(r.uid, 'createPaymentIntent', {
    guestId: r.guestId,
    houseId: r.houseId,
    amount: 5000,
  });
  expect(res.errorCode).toBe('failed-precondition');
});

test('RENT-006: exactly the balance is accepted, and one cent over is refused', async () => {
  const r = await resident(1000);
  const over = await callAs(r.uid, 'createPaymentIntent', { guestId: r.guestId, houseId: r.houseId, amount: 1001 });
  expect(over.errorCode).toBe('failed-precondition');
  expect(over.errorMessage).toContain('$10.00');
  await expect(startPayment(r, 1000)).resolves.toEqual(expect.any(String));
});

test('RENT-003: rent plus chore fees can be paid in full, and the total owed falls by that much', async () => {
  const r = await seedResident(house, { rentOwed: 20000, choreFees: 1500 });
  const { pi, since } = await pay(r, 21500);
  await deliverType(stripe, { since, objectId: pi, type: SUCCEEDED });
  const guest = await docData(`guests/${r.guestId}`);
  expect(guest.rentOwed + guest.choreFees).toBe(0);
});

test('RENT-012: the same amount again the same day says it already went through, with no second charge', async () => {
  const r = await resident(20000);
  const first = await pay(r, 5000);
  await deliverType(stripe, { since: first.since, objectId: first.pi, type: SUCCEEDED });
  expect(await rentOwed(r)).toBe(15000);

  const again = await callAs(r.uid, 'createPaymentIntent', startInput(r, 5000));
  expect(again.errorCode).toBeUndefined();
  expect(again.data).toEqual({ alreadyPaid: true });
});

test('RENT-012: a different amount the same day can still be paid', async () => {
  const r = await resident(20000);
  const first = await pay(r, 5000);
  await deliverType(stripe, { since: first.since, objectId: first.pi, type: SUCCEEDED });

  const again = await callAs(r.uid, 'createPaymentIntent', startInput(r, 3000));
  expect(again.errorCode).toBeUndefined();
  const secret = (again.data as { clientSecret: string }).clientSecret;
  expect(paymentIntentId(secret)).not.toBe(first.pi);
});

test('RENT-006: a malformed balance is refused, not treated as no limit', async () => {
  const r = await seedResident(house, { guest: { rentOwed: 'abc' } });
  const res = await callAs(r.uid, 'createPaymentIntent', startInput(r, 1000));
  expect(res.errorCode).toBe('failed-precondition');
});
