import type Stripe from 'stripe';
import { advance, ClockedOperator, clockedOperator } from './clock';
import { deliver, fetchEvents } from './eventPump';
import { adminDb, seedHouse, seedResident, SeededHouse, SeededResident } from './fixtures';
import { waitFor } from './waitFor';

export const DAY_S = 86400;
export const nowS = () => Math.floor(Date.now() / 1000);

export const docData = async (path: string) => (await adminDb().doc(path).get()).data() ?? {};
export const houseStatus = async (id: string) => (await docData(`houses/${id}`)).subscriptionStatus;
export const operatorMeta = async (uid: string) => (await docData(`users/${uid}`)).subscriptionMetadata ?? {};

/** The next `count` events of this type for the object, without delivering them. */
export async function eventsOfType(
  stripe: Stripe,
  opts: { since: number; objectId: string; type: string; count?: number },
): Promise<Stripe.Event[]> {
  const { since, objectId, type, count = 1 } = opts;
  return waitFor(
    () => fetchEvents(stripe, { since, objectId, types: [type], settleMs: 0 }),
    (events) => events.length >= count,
    90000,
  );
}

/** Fetches and delivers one type of event, and requires each delivery to succeed. */
export async function deliverType(
  stripe: Stripe,
  opts: { since: number; objectId: string; type: string; count?: number },
): Promise<Stripe.Event[]> {
  const events = await eventsOfType(stripe, opts);
  for (const event of events) {
    const res = await deliver(event);
    if (res.status !== 200) throw new Error(`${event.type} ${event.id} answered ${res.status}: ${res.body}`);
  }
  return events;
}

export type Lifecycle = { op: ClockedOperator; house: SeededHouse; resident: SeededResident };

/** A clocked operator on trial, with a house written the way createHouses writes it, and a resident. */
export async function lifecycle(stripe: Stripe, opts: { failingCard?: boolean } = {}): Promise<Lifecycle> {
  const op = await clockedOperator(stripe, opts);
  const house = await seedHouse(op, { subscriptionStatus: 'trialing' });
  const resident = await seedResident(house, { rentOwed: 15000 });
  return { op, house, resident };
}

/** Moves Stripe past the trial and the invoice's finalization, when the first charge is attempted. */
export async function pastTrial(stripe: Stripe, op: ClockedOperator): Promise<void> {
  const subscription = await stripe.subscriptions.retrieve(op.subscriptionId);
  await advance(stripe, op.clockId, (subscription.trial_end as number) + 2 * 3600);
}

/** An invitation is what an entitled operator can do and a blocked one can't. */
export const inviteInput = (houseId: string) => ({
  houseId,
  email: `invitee-${Date.now()}@rats-e2e.invalid`,
  role: 'guest',
});

export const newHouseInput = () => ({
  houses: [{ requestKey: `req-${Date.now()}`, name: 'New test house', lat: 30.2672, lng: -97.7431 }],
});
