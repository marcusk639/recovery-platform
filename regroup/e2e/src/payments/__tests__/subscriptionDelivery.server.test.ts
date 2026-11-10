import type Stripe from 'stripe';
import { callAs, readDocAs } from '../harness/callables';
import { deleteOpenClocks } from '../harness/clock';
import { deliver } from '../harness/eventPump';
import { DAY_S, docData, eventsOfType, houseStatus, inviteInput, lifecycle, nowS, pastTrial } from '../harness/flows';
import { adminDb, seedConnectedHouse, seedHouse, seedOperator, seedResident } from '../harness/fixtures';
import { assertSafeTarget, FUNCTIONS_BASE } from '../harness/guards';

let stripe: Stripe;
beforeAll(async () => {
  stripe = await assertSafeTarget();
});
afterAll(() => deleteOpenClocks(stripe));

const UPDATED = 'customer.subscription.updated';
const DELETED = 'customer.subscription.deleted';
const FAILED = 'invoice.payment_failed';
const SUCCEEDED = 'invoice.payment_succeeded';
const marker = async (id: string) => (await docData(`webhookEvents/${id}`)).status;

test('SUB-040: the same event twice is applied once', async () => {
  const { op } = await lifecycle(stripe);
  const since = nowS() - 5;
  await stripe.subscriptions.update(op.subscriptionId, { metadata: { touched: 'yes' } });
  const [event] = await eventsOfType(stripe, { since, objectId: op.customerId, type: UPDATED });
  expect((await deliver(event)).status).toBe(200);
  const before = await docData(`subscriptions/${op.subscriptionId}`);
  const second = await deliver(event);
  expect(second.status).toBe(200);
  expect(second.body).toContain('duplicate');
  expect((await docData(`subscriptions/${op.subscriptionId}`)).updatedAt).toEqual(before.updatedAt);
});

test('SUB-040: concurrent delivery backs off instead of reporting success', async () => {
  const { op } = await lifecycle(stripe);
  const since = nowS() - 5;
  await stripe.subscriptions.update(op.subscriptionId, { metadata: { touched: 'yes' } });
  const [event] = await eventsOfType(stripe, { since, objectId: op.customerId, type: UPDATED });
  await adminDb().doc(`webhookEvents/${event.id}`).set({ status: 'processing', claimedAtMs: Date.now(), type: event.type });
  const res = await deliver(event);
  expect(res.status).toBe(409);
  expect(await marker(event.id)).toBe('processing');
  await adminDb().doc(`webhookEvents/${event.id}`).delete();
  expect((await deliver(event)).status).toBe(200);
});

test('SUB-041: an older active event after the cancel leaves it canceled', async () => {
  const { op, house } = await lifecycle(stripe);
  const since = nowS() - 5;
  await stripe.subscriptions.update(op.subscriptionId, { metadata: { touched: 'yes' } });
  const [older] = await eventsOfType(stripe, { since, objectId: op.customerId, type: UPDATED });
  await stripe.subscriptions.cancel(op.subscriptionId);
  const [deleted] = await eventsOfType(stripe, { since, objectId: op.customerId, type: DELETED });
  expect((await deliver(deleted)).status).toBe(200);
  expect((await deliver(older)).status).toBe(200);
  expect(await houseStatus(house.id)).toBe('canceled');
  expect((await docData(`subscriptions/${op.subscriptionId}`)).status).toBe('canceled');
});

test('SUB-042: a failure for an older invoice after a later success leaves it active, with no grace', async () => {
  const { op, house } = await lifecycle(stripe, { failingCard: true });
  const since = nowS() - 5;
  await pastTrial(stripe, op);
  const [failed] = await eventsOfType(stripe, { since, objectId: op.customerId, type: FAILED });
  const card = await stripe.paymentMethods.attach('pm_card_visa', { customer: op.customerId });
  await stripe.invoices.pay((failed.data.object as Stripe.Invoice).id as string, { payment_method: card.id });
  const [succeeded] = await eventsOfType(stripe, { since, objectId: op.customerId, type: SUCCEEDED });
  expect((await deliver(succeeded)).status).toBe(200);
  expect((await deliver(failed)).status).toBe(200);
  expect(await houseStatus(house.id)).toBe('active');
  expect((await docData(`houses/${house.id}`)).guestGraceEndsAt).toBeUndefined();
});

test('SUB-043: a handler failure answers 500, releases the claim, and redelivery applies', async () => {
  const operator = await seedOperator();
  const house = await seedConnectedHouse(operator);
  const resident = await seedResident(house, { rentOwed: 1000 });
  const intent = await callAs(resident.uid, 'createPaymentIntent', { amount: 1000, guestId: resident.guestId, houseId: house.id });
  const piId = (intent.data as { clientSecret: string }).clientSecret.split('_secret_')[0];
  const paid = await stripe.paymentIntents.confirm(piId, { payment_method: 'pm_card_visa' });

  const eventId = `evt_retry_${Date.now()}`;
  const event = (charge: string) => ({ id: eventId, object: 'event', type: 'charge.dispute.created', livemode: false, created: nowS(), api_version: '2026-01-28.clover', data: { object: { id: `dp_${eventId}`, object: 'dispute', charge, status: 'needs_response', reason: 'fraudulent', amount: 1000, currency: 'usd' } } });
  expect((await deliver(event('ch_does_not_exist'))).status).toBe(500);
  expect(await marker(eventId)).toBe('failed');
  expect((await deliver(event(paid.latest_charge as string))).status).toBe(200);
  expect(await marker(eventId)).toBe('done');
});

test('SUB-044: a missing signature is refused and writes nothing', async () => {
  const res = await fetch(`${FUNCTIONS_BASE}/stripeEvents`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"id":"evt_nosig"}' });
  expect(res.status).toBe(400);
  expect(await marker('evt_nosig')).toBeUndefined();
});

test('SUB-044: a tampered payload is refused', async () => {
  const stripeHeaderFor = 't=1,v1=deadbeef';
  const res = await fetch(`${FUNCTIONS_BASE}/stripeEvents`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': stripeHeaderFor }, body: '{"id":"evt_tampered"}' });
  expect(res.status).toBe(400);
});

test('SUB-044: a live-mode event is not applied by a test-mode deployment', async () => {
  const { op, house } = await lifecycle(stripe);
  const id = `evt_live_${Date.now()}`;
  const res = await deliver({ id, object: 'event', type: DELETED, livemode: true, created: nowS(), api_version: '2026-01-28.clover', data: { object: { id: op.subscriptionId, object: 'subscription', customer: op.customerId, metadata: { userId: op.uid }, status: 'canceled' } } });
  expect(res.status).toBe(400);
  expect(await marker(id)).toBeUndefined();
  expect(await houseStatus(house.id)).toBe('trialing');
});

test('SUB-045: a status change reaches every house created the normal way', async () => {
  const { op, house } = await lifecycle(stripe);
  const second = await seedHouse(op, { subscriptionStatus: 'trialing' });
  const since = nowS() - 5;
  await stripe.subscriptions.cancel(op.subscriptionId);
  const [deleted] = await eventsOfType(stripe, { since, objectId: op.customerId, type: DELETED });
  expect((await deliver(deleted)).status).toBe(200);
  expect(await houseStatus(house.id)).toBe('canceled');
  expect(await houseStatus(second.id)).toBe('canceled');
});

test('SUB-046: an event for an unknown subscription is done, and touches nobody', async () => {
  const bystander = await seedOperator();
  const house = await seedHouse(bystander);
  const id = `evt_unknown_${Date.now()}`;
  const res = await deliver({ id, object: 'event', type: DELETED, livemode: false, created: nowS(), api_version: '2026-01-28.clover', data: { object: { id: 'sub_nobody', object: 'subscription', customer: 'cus_nobody', metadata: {}, status: 'canceled' } } });
  expect(res.status).toBe(200);
  expect(await marker(id)).toBe('done');
  expect(await houseStatus(house.id)).toBe('active');
});

test('SUB-048: a first failure delivered late leaves the deadline tied to the invoice', async () => {
  const { op, house } = await lifecycle(stripe, { failingCard: true });
  const since = nowS() - 5;
  await pastTrial(stripe, op);
  const [failed] = await eventsOfType(stripe, { since, objectId: op.customerId, type: FAILED });
  const finalized = (failed.data.object as Stripe.Invoice).status_transitions.finalized_at as number;
  const late = { ...failed, data: { object: { ...failed.data.object, status_transitions: { finalized_at: finalized - 2 * DAY_S } } } };
  expect((await deliver(late)).status).toBe(200);
  expect(Date.parse((await docData(`houses/${house.id}`)).guestGraceEndsAt)).toBe((finalized - 2 * DAY_S + 7 * DAY_S) * 1000);
});

test('SUB-050: signed-in users can read the paywall switch', async () => {
  const operator = await seedOperator();
  await adminDb().doc('paywall/config').set({ enabled: true });
  expect(await readDocAs(operator.uid, 'paywall/config')).toBe(200);
});

test('SUB-050: with the switch off, a lapsed operator can act', async () => {
  const { op, house } = await lifecycle(stripe);
  await adminDb().doc('paywall/config').set({ enabled: false });
  await adminDb().doc(`houses/${house.id}`).update({ subscriptionStatus: 'canceled' });
  let res: Awaited<ReturnType<typeof callAs>> | undefined;
  try {
    await new Promise((resolve) => setTimeout(resolve, 61000)); // the switch is cached for up to a minute
    res = await callAs(op.uid, 'createInvitation', inviteInput(house.id));
  } finally {
    await adminDb().doc('paywall/config').set({ enabled: true });
    await new Promise((resolve) => setTimeout(resolve, 61000)); // don't leave it cached off for later tests
  }
  expect(res).toBeDefined();
  expect(res?.errorMessage).toBeUndefined();
}, 300000);
