import type Stripe from 'stripe';
import * as fs from 'fs';
import * as path from 'path';
import { callAs } from '../harness/callables';
import { advance, deleteOpenClocks } from '../harness/clock';
import { deliverType, docData, houseStatus, inviteInput, lifecycle, newHouseInput, nowS, operatorMeta } from '../harness/flows';
import { adminDb, seedConnectedHouse, seedResident } from '../harness/fixtures';
import { assertSafeTarget, CONFIG_DIR, LOCAL_PRICES_FILE } from '../harness/guards';

let stripe: Stripe;
let prices: Record<string, string>;
beforeAll(async () => {
  stripe = await assertSafeTarget();
  prices = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, LOCAL_PRICES_FILE), 'utf8'));
});
afterAll(() => deleteOpenClocks(stripe));

const DELETED = 'customer.subscription.deleted';
const UPDATED = 'customer.subscription.updated';

test('SUB-030: cancel at period end keeps access until then, then blocks', async () => {
  const { op, house } = await lifecycle(stripe);
  const since = nowS() - 5;
  const subscription = await stripe.subscriptions.update(op.subscriptionId, { cancel_at_period_end: true });
  await deliverType(stripe, { since, objectId: op.customerId, type: UPDATED });
  expect(await houseStatus(house.id)).toBe('trialing');

  await advance(stripe, op.clockId, (subscription.trial_end as number) + 3600);
  await deliverType(stripe, { since, objectId: op.customerId, type: DELETED });
  expect(await houseStatus(house.id)).toBe('canceled');
  expect((await callAs(op.uid, 'createHouses', newHouseInput())).errorCode).toBe('failed-precondition');
});

test('SUB-031: cancel immediately blocks at once, and the operator record says so', async () => {
  const { op, house } = await lifecycle(stripe);
  const since = nowS() - 5;
  await stripe.subscriptions.cancel(op.subscriptionId);
  await deliverType(stripe, { since, objectId: op.customerId, type: DELETED });
  expect(await houseStatus(house.id)).toBe('canceled');
  expect((await operatorMeta(op.uid)).status).toBe('canceled');
  expect((await callAs(op.uid, 'createHouses', newHouseInput())).errorCode).toBe('failed-precondition');
});

test('SUB-032: reactivating after a cancel is entitled, on the same customer, with no second trial', async () => {
  const { op, house } = await lifecycle(stripe);
  const since = nowS() - 5;
  await stripe.subscriptions.cancel(op.subscriptionId);
  await deliverType(stripe, { since, objectId: op.customerId, type: DELETED });
  await adminDb().doc(`users/${op.uid}`).update({ 'subscriptionMetadata.status': 'canceled' });

  const res = await callAs(op.uid, 'reactivateOperatorSubscription', {
    user: { id: op.uid, subscriptionMetadata: { status: 'canceled', subscriptionId: op.subscriptionId, customerId: op.customerId } },
  });
  expect(res.errorMessage).toBeUndefined();
  const meta = await operatorMeta(op.uid);
  expect(meta.status).toBe('active');
  expect(meta.customerId).toBe(op.customerId);
  const fresh = await stripe.subscriptions.retrieve(meta.subscriptionId);
  expect(fresh.trial_end).toBeNull();
  expect((await docData(`houses/${house.id}`)).ownerId).toBe(op.uid);
});

test('SUB-033: upgrade and downgrade change the price, and the tier follows', async () => {
  const { op } = await lifecycle(stripe);
  const since = nowS() - 5;
  const subscription = await stripe.subscriptions.retrieve(op.subscriptionId);
  await stripe.subscriptions.update(op.subscriptionId, {
    items: [{ id: subscription.items.data[0].id, price: prices.STRIPE_PRICE_TRAD_PROFESSIONAL }],
    metadata: { tier: 'professional' },
  });
  await deliverType(stripe, { since, objectId: op.customerId, type: UPDATED });
  expect((await docData(`subscriptions/${op.subscriptionId}`)).planId).toBe(prices.STRIPE_PRICE_TRAD_PROFESSIONAL);
  expect((await operatorMeta(op.uid)).tier).toBe('professional');
  expect((await operatorMeta(op.uid)).maxResidents).toBe(20);
});

const atResidentLimit = async () => {
  const { op, house } = await lifecycle(stripe);
  await adminDb().doc(`users/${op.uid}`).update({
    'subscriptionMetadata.maxResidents': 1,
    'subscriptionMetadata.status': 'active',
    'subscriptionMetadata.houses': { [house.id]: { numberOfGuests: 1 } },
  });
  await adminDb().doc(`houses/${house.id}`).update({ subscriptionStatus: 'active' });
  return { op, house };
};

test('SUB-034: over the limit after a downgrade, existing residents stay and new ones are refused', async () => {
  const { op, house } = await atResidentLimit();
  const second = await seedResident(house, { rentOwed: 100 });
  expect((await callAs(op.uid, 'createInvitation', inviteInput(house.id))).errorMessage).toMatch(/supports up to 1 residents/);
  expect((await docData(`guests/${second.guestId}`)).houseId).toBe(house.id);
});

test('SUB-036: Oxford on and off updates the operator’s house type', async () => {
  const { op, house } = await lifecycle(stripe);
  await adminDb().doc(`users/${op.uid}`).update({ 'subscriptionMetadata.status': 'active', 'subscriptionMetadata.oxfordEnabled': true });
  await adminDb().doc(`houses/${house.id}`).update({ subscriptionStatus: 'active' });
  expect((await callAs(op.uid, 'setOxfordEnabled', { houseId: house.id, enabled: true })).errorMessage).toBeUndefined();
  expect((await operatorMeta(op.uid)).houseType).toBe('oxford');
  expect((await callAs(op.uid, 'setOxfordEnabled', { houseId: house.id, enabled: false })).errorMessage).toBeUndefined();
  expect((await operatorMeta(op.uid)).houseType).toBe('traditional');
});

test('SUB-037: adding a resident at the limit is refused', async () => {
  const { op, house } = await atResidentLimit();
  expect((await callAs(op.uid, 'createInvitation', inviteInput(house.id))).errorMessage).toMatch(/supports up to 1 residents/);
});

test('SUB-037: an unlimited tier never refuses', async () => {
  const { op } = await lifecycle(stripe);
  await adminDb().doc(`users/${op.uid}`).update({ 'subscriptionMetadata.maxResidents': null, 'subscriptionMetadata.status': 'active' });
  const house = await seedConnectedHouse(op);
  await seedResident(house);
  await seedResident(house);
  const res = await callAs(op.uid, 'createInvitation', inviteInput(house.id));
  expect(res.errorMessage).toBeUndefined();
});

test('SUB-038: deleting the account cancels an active subscription', async () => {
  const { op } = await lifecycle(stripe);
  const since = nowS() - 5;
  const res = await callAs(op.uid, 'deleteAccount', {});
  expect(res.errorMessage).toBeUndefined();
  expect((await stripe.subscriptions.retrieve(op.subscriptionId)).status).toBe('canceled');
  const res2 = await deliverType(stripe, { since, objectId: op.customerId, type: DELETED });
  expect(res2).toHaveLength(1);
});
