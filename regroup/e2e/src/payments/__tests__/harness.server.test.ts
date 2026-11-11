/**
 * Runs through `npm run test:payments`, against emulators and the local sandbox.
 * The first test is the walking skeleton: a broken Connect account or key fails it
 * as plainly as possible, so run this file first when a rent test fails oddly.
 */
import type Stripe from 'stripe';
import { callAs } from '../harness/callables';
import { advance, clockedOperator, deleteOpenClocks } from '../harness/clock';
import { deliver, fetchEvents } from '../harness/eventPump';
import { adminDb, seedConnectedHouse, seedOperator, seedResident } from '../harness/fixtures';
import { assertSafeTarget } from '../harness/guards';
import { waitFor } from '../harness/waitFor';

let stripe: Stripe;
const nowS = () => Math.floor(Date.now() / 1000);

beforeAll(async () => {
  stripe = await assertSafeTarget();
});
afterAll(() => deleteOpenClocks(stripe));

const rentOwed = async (guestId: string) => (await adminDb().doc(`guests/${guestId}`).get()).get('rentOwed');

test('one real rent payment reaches the ledger through a delivered event', async () => {
  const operator = await seedOperator();
  const house = await seedConnectedHouse(operator);
  const resident = await seedResident(house, { rentOwed: 15000 });

  const status = await callAs(operator.uid, 'getStripeAccountStatus', { houseId: house.id });
  expect(status.errorCode).toBeUndefined();
  expect((status.data as { status: string }).status).toBe('active');

  const since = nowS() - 5;
  const intent = await callAs(resident.uid, 'createPaymentIntent', { amount: 5000, guestId: resident.guestId, houseId: house.id });
  expect(intent.errorCode).toBeUndefined();
  const piId = (intent.data as { clientSecret: string }).clientSecret.split('_secret_')[0];
  await stripe.paymentIntents.confirm(piId, { payment_method: 'pm_card_visa' });

  const events = await fetchEvents(stripe, { since, objectId: piId, types: ['payment_intent.succeeded'] });
  expect(events).toHaveLength(1);
  expect((await deliver(events[0])).status).toBe(200);

  expect(await waitFor(() => rentOwed(resident.guestId), (owed) => owed === 10000)).toBe(10000);
  const payment = (await adminDb().doc(`payments/${piId}`).get()).data();
  expect(payment).toMatchObject({ status: 'succeeded', amount: 5000, guestId: resident.guestId, houseId: house.id, rentApplied: true });
});

test('a wrong signature is refused and writes nothing', async () => {
  const id = `evt_wrong_${Date.now()}`;
  const res = await deliver({ id, object: 'event', type: 'invoice.payment_failed', data: { object: {} } }, { secret: 'whsec_wrong' });
  expect(res.status).toBe(400);
  expect((await adminDb().doc(`webhookEvents/${id}`).get()).exists).toBe(false);
});

test('a fetched subscription event is delivered, applied and marked done', async () => {
  const since = nowS() - 5;
  const op = await clockedOperator(stripe);
  await stripe.subscriptions.update(op.subscriptionId, { metadata: { touched: 'yes' } });
  const [event] = await fetchEvents(stripe, { since, objectId: op.subscriptionId, types: ['customer.subscription.updated'] });
  expect((await deliver(event)).status).toBe(200);
  const marker = await waitFor(
    async () => (await adminDb().doc(`webhookEvents/${event.id}`).get()).data(),
    (doc) => doc?.status === 'done',
  );
  expect(marker?.status).toBe('done');
});

test('fixtures write houses the way createHouses does', async () => {
  const operator = await seedOperator();
  const house = await seedConnectedHouse(operator);
  const doc = (await adminDb().doc(`houses/${house.id}`).get()).data();
  expect(doc?.adminIds).toEqual([operator.adminId]);
  expect(doc?.adminIds).not.toContain(operator.uid);
  expect(doc?.ownerId).toBe(operator.uid);
});

test('a clock moves Stripe’s time, and a past deadline in Firestore is what blocks', async () => {
  const op = await clockedOperator(stripe);
  const before = (await stripe.testHelpers.testClocks.retrieve(op.clockId)).frozen_time;
  await advance(stripe, op.clockId, before + 86400);
  expect((await stripe.testHelpers.testClocks.retrieve(op.clockId)).frozen_time).toBe(before + 86400);

  // setHouseSubscriptionStatusOnCreate stamps the house from the operator's status after
  // the write below, so the operator must be past due too or the stamp undoes it.
  const operator = await seedOperator({ status: 'past_due' });
  const house = await seedConnectedHouse(operator);
  const invite = { houseId: house.id, email: 'invitee@rats-e2e.invalid', role: 'guest' };
  await adminDb().doc(`houses/${house.id}`).update({ subscriptionStatus: 'past_due', guestGraceEndsAt: new Date(Date.now() - 60000).toISOString() });
  expect((await callAs(operator.uid, 'createInvitation', invite)).errorCode).toBe('failed-precondition');
});
