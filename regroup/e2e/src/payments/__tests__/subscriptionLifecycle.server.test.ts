import type Stripe from 'stripe';
import { callAs } from '../harness/callables';
import { deleteOpenClocks } from '../harness/clock';
import { deliver } from '../harness/eventPump';
import { deliverType, DAY_S, docData, eventsOfType, houseStatus, inviteInput, latestInvoiceId, lifecycle, newHouseInput, nowS, operatorMeta, pastTrial } from '../harness/flows';
import { adminDb, seedConnectedHouse, seedResident } from '../harness/fixtures';
import { assertSafeTarget } from '../harness/guards';

let stripe: Stripe;
beforeAll(async () => {
  stripe = await assertSafeTarget();
});
afterAll(() => deleteOpenClocks(stripe));

const FAILED = 'invoice.payment_failed';
const SUCCEEDED = 'invoice.payment_succeeded';
const UPDATED = 'customer.subscription.updated';

const graceEndsAt = async (houseId: string) => (await docData(`houses/${houseId}`)).guestGraceEndsAt;
const finalizedAt = (event: Stripe.Event) => (event.data.object as Stripe.Invoice).status_transitions.finalized_at as number;
const expired = (houseId: string) =>
  adminDb().doc(`houses/${houseId}`).update({ subscriptionStatus: 'past_due', guestGraceEndsAt: new Date(Date.now() - 60000).toISOString() });

test('SUB-020: the trial converts to paid at day 7, and the house follows', async () => {
  const { op, house } = await lifecycle(stripe);
  const since = nowS() - 5;
  await pastTrial(stripe, op);
  const converted = await latestInvoiceId(stripe, op);
  await deliverType(stripe, { since, objectId: converted, type: SUCCEEDED });
  await deliverType(stripe, { since, objectId: op.customerId, type: UPDATED });
  expect((await stripe.subscriptions.retrieve(op.subscriptionId)).status).toBe('active');
  expect((await docData(`subscriptions/${op.subscriptionId}`)).status).toBe('active');
  expect(await houseStatus(house.id)).toBe('active');
});

test('SUB-021: first failure starts 7-day grace from the invoice, and a retry does not change it', async () => {
  const { op, house } = await lifecycle(stripe, { failingCard: true });
  const since = nowS() - 5;
  await pastTrial(stripe, op);
  const [first] = await deliverType(stripe, { since, objectId: op.customerId, type: FAILED });

  expect(await houseStatus(house.id)).toBe('past_due');
  const deadline = await graceEndsAt(house.id);
  expect(Date.parse(deadline)).toBe((finalizedAt(first) + 7 * DAY_S) * 1000);

  const invoice = first.data.object as Stripe.Invoice;
  await expect(stripe.invoices.pay(invoice.id as string)).rejects.toMatchObject({ type: 'StripeCardError' });
  await deliverType(stripe, { since, objectId: op.customerId, type: FAILED, count: 2 });
  expect(await graceEndsAt(house.id)).toBe(deadline);
});

test('SUB-022: payment recovered during grace clears it', async () => {
  const { op, house } = await lifecycle(stripe, { failingCard: true });
  const since = nowS() - 5;
  await pastTrial(stripe, op);
  const [failed] = await deliverType(stripe, { since, objectId: op.customerId, type: FAILED });

  const card = await stripe.paymentMethods.attach('pm_card_visa', { customer: op.customerId });
  await stripe.customers.update(op.customerId, { invoice_settings: { default_payment_method: card.id } });
  const invoiceId = (failed.data.object as Stripe.Invoice).id as string;
  await stripe.invoices.pay(invoiceId, { payment_method: card.id });
  await deliverType(stripe, { since, objectId: invoiceId, type: SUCCEEDED });

  expect(await houseStatus(house.id)).toBe('active');
  expect(await graceEndsAt(house.id)).toBeUndefined();
});

test('SUB-023: past the deadline, the operator is blocked', async () => {
  const { op, house } = await lifecycle(stripe);
  await adminDb().doc(`users/${op.uid}`).update({ 'subscriptionMetadata.status': 'past_due' });
  await expired(house.id);
  expect((await callAs(op.uid, 'createInvitation', inviteInput(house.id))).errorCode).toBe('failed-precondition');
  expect((await callAs(op.uid, 'createHouses', newHouseInput())).errorCode).toBe('failed-precondition');
});

test('SUB-024: past the deadline, data stays, the resident reads their history and can still pay rent', async () => {
  const { op, house, resident } = await lifecycle(stripe);
  await expired(house.id);
  expect((await docData(`houses/${house.id}`)).ownerId).toBe(op.uid);
  expect((await docData(`guests/${resident.guestId}`)).rentOwed).toBe(15000);
  const history = await callAs(resident.uid, 'listPayments', { guestId: resident.guestId, houseId: house.id });
  expect(history.errorMessage).toBeUndefined();

  // Paying needs a house connected to Stripe, which the lifecycle house isn't. The
  // operator is past due too, as a lapsed operator's record would be.
  await adminDb().doc(`users/${op.uid}`).update({ 'subscriptionMetadata.status': 'past_due' });
  const payer = await seedResident(await seedConnectedHouse(op), { rentOwed: 15000 });
  await expired(payer.houseId);
  const start = await callAs(payer.uid, 'createPaymentIntent', {
    guestId: payer.guestId,
    houseId: payer.houseId,
    amount: 15000,
    idempotencyKey: `${payer.guestId}-lapsed`,
  });
  expect(start.errorMessage).toBeUndefined();
  expect((start.data as { clientSecret?: string }).clientSecret).toEqual(expect.any(String));
});

test('SUB-025: dunning exhausted is blocked, and a new card unblocks with no second subscription', async () => {
  const { op, house } = await lifecycle(stripe, { failingCard: true });
  const since = nowS() - 5;
  await pastTrial(stripe, op);
  const invoiceId = await latestInvoiceId(stripe, op);
  for (let attempt = 0; attempt < 2; attempt++) {
    await expect(stripe.invoices.pay(invoiceId)).rejects.toMatchObject({ type: 'StripeCardError' });
  }
  // Stripe raises attempt_count only on its own retry schedule, never for a manual pay, and
  // the sandbox's schedule can't be driven to its end here. So the third real failure is
  // delivered as the schedule's last retry carries it, attempt_count 3, the count
  // handleInvoicePaymentFailed treats as exhausted.
  const failures = await eventsOfType(stripe, { since, objectId: invoiceId, type: FAILED, count: 3 });
  const last = failures[failures.length - 1] as unknown as { data: { object: object } };
  const exhausted: object = { ...last, data: { ...last.data, object: { ...last.data.object, attempt_count: 3 } } };
  const toDeliver: object[] = [...failures.slice(0, -1), exhausted];
  for (const event of toDeliver) expect((await deliver(event)).status).toBe(200);
  // The subscription doc proves the exhausted count was read, whatever happens to houses (#222).
  expect((await docData(`subscriptions/${op.subscriptionId}`)).status).toBe('unpaid');
  expect(await houseStatus(house.id)).toBe('unpaid');

  const card = await stripe.paymentMethods.attach('pm_card_visa', { customer: op.customerId });
  await stripe.invoices.pay(invoiceId, { payment_method: card.id });
  await deliverType(stripe, { since, objectId: invoiceId, type: SUCCEEDED });
  expect(await houseStatus(house.id)).toBe('active');
  expect((await operatorMeta(op.uid)).subscriptionId).toBe(op.subscriptionId);
  expect((await stripe.subscriptions.list({ customer: op.customerId, status: 'all' })).data).toHaveLength(1);
});
