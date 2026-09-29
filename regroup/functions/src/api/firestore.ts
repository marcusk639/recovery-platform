import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';
import { House } from '../entities/House';
import { Notification } from '../entities/Notification';
import { Guest } from '../entities/Guest';
import { Dispute } from '../entities/Dispute';
import { User } from '../entities/User';
import { getGeohashRange } from '../util/location';
import Stripe from 'stripe';
import { getQueriesForDocumentsAround } from '../util/geohash';
import { Contact } from '../entities/Contact';

export const app = admin.app();
export const ratsFirestore = admin.firestore();
export const guestCollection = ratsFirestore.collection('guests');
export const weeksCollection = ratsFirestore.collection('guest-weeks');
export const weekSummariesCollection = ratsFirestore.collection('week-summaries');
export const userCollection = ratsFirestore.collection('users');
export const houseCollection = ratsFirestore.collection('houses');
export const notificationCollection = ratsFirestore.collection('notifications');
export const meetingCollection = ratsFirestore.collection('meetings');
export const reportCollection = ratsFirestore.collection('guest-reports');
export const adminCollection = ratsFirestore.collection('admins');
export const stripeEventCollection = ratsFirestore.collection('stripeEvents');
export const contactCollection = ratsFirestore.collection('contact');
export const subscriptionCollection = ratsFirestore.collection('subscriptions');
export const drugTestCollection = ratsFirestore.collection('drug-tests');
export const activityCollection = ratsFirestore.collection('activities');
export const paymentsCollection = ratsFirestore.collection('payments');
export const invitationCollection = ratsFirestore.collection('invitations');

/**
 * Shape of a document in the `subscriptions` collection. Read by the Stripe
 * webhook handlers (`customer.subscription.updated/deleted`, `invoice.*`) which
 * look a doc up by `stripeSubscriptionId`. Seeded synchronously at purchase time
 * by `createOperatorSubscription` so those handlers resolve the sub instead of
 * early-returning "subscription not found".
 *
 * `houseId`/`guestCount` are not known at operator-subscribe time (an operator
 * subscription is not tied to a single house, and guests are added later), so
 * they are seeded empty/zero and updated as the operator provisions houses.
 */
export interface SubscriptionDoc {
  houseId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: 'active' | 'past_due' | 'canceled' | 'unpaid' | 'trialing' | 'cancelling';
  currentPeriodEnd: string;
  planId: string;
  guestCount: number;
  /** Operator Firebase UID (also embedded in Stripe subscription metadata). */
  userId?: string;
}

/**
 * Idempotently writes a `subscriptions` doc keyed by the Stripe subscription ID
 * (which is also what the webhook readers query on). Merge-writes so a later
 * webhook event never clobbers fields it doesn't own.
 */
export async function upsertSubscriptionDoc(doc: SubscriptionDoc) {
  await subscriptionCollection.doc(doc.stripeSubscriptionId).set(doc, { merge: true });
}

export const createHouseId = () => houseCollection.doc().id;
export const createAdminId = () => adminCollection.doc().id;
export const createGuestId = () => guestCollection.doc().id;

export function shapeHouses(docs: admin.firestore.QueryDocumentSnapshot[]): {
  [id: string]: House;
} {
  const houses: { [id: string]: House } = {};
  docs.forEach((house) => (houses[house.id] = house.data() as House));
  return houses;
}

export function saveStripeEvent(event: Stripe.Event) {
  return stripeEventCollection.add(event);
}

/**
 * Gets houses where attribute == value
 * @param {*} attribute The attribute to select by
 * @param {*} value The value of the attribute
 */
export async function getHouses(
  attribute: string,
  value: string,
): Promise<{ [id: string]: House }> {
  const result = await houseCollection.where(attribute, '==', value).get();
  return shapeHouses(result.docs);
}

export async function getAllHouses() {
  const result = await houseCollection.get();
  return shapeHouses(result.docs);
}

export async function getNearbyHouses(lat: number, lng: number, distanceInMiles: number) {
  const range = getGeohashRange(lat, lng, distanceInMiles);
  const result = await houseCollection
    .where('geohash', '>=', range.lower)
    .where('geohash', '<=', range.upper)
    .get();
  return shapeHouses(result.docs);
}

export async function getHouse(houseId: string) {
  return (await houseCollection.doc(houseId).get()).data() as House;
}

export async function getHousesByAttributes(
  attributes: string[],
  operator: FirebaseFirestore.WhereFilterOp,
  values: string[],
) {
  let query = houseCollection.where(attributes[0], '==', values[0]);
  const slicedValues = values.slice(1);
  attributes
    .slice(1)
    .forEach(
      (attribute, index, atts) => (query = query.where(attribute, operator, slicedValues[index])),
    );
  const result = await query.get();
  return shapeHouses(result.docs);
}

export async function getUserBySubscription(subscriptionId: string): Promise<User | null> {
  const result = await userCollection
    .where('subscriptionMetadata.subscriptionId', '==', subscriptionId)
    .get();
  if (result.empty) return null;
  return result.docs[0].data() as User;
}

export async function updateHouseStatuses(superAdminId: string, status: string) {
  const result = await houseCollection.where('superAdminIds', 'array-contains', superAdminId).get();
  const batch = ratsFirestore.batch();
  result.docs.forEach((doc) => {
    batch.update(doc.ref, { subscriptionStatus: status });
  });
  return batch.commit();
}

export async function updateUserSubscriptionStatus(subscriptionId: string, status: string) {
  const user = await getUserBySubscription(subscriptionId);
  if (!user) {
    logger.warn('updateUserSubscriptionStatus: no user for subscription');
    return;
  }
  const subscriptionMetadata: Partial<User> = {
    subscriptionMetadata: {
      ...user.subscriptionMetadata,
      status,
    },
  };
  await updateHouseStatuses(user.adminId, status);
  return userCollection.doc(user.id!).update(subscriptionMetadata);
}

export async function updateUserPeriodEnd(
  endDate: number,
  subscriptionId: string,
  cancel: boolean = false,
) {
  const user = await getUserBySubscription(subscriptionId);
  if (!user) {
    logger.warn('updateUserPeriodEnd: no user for subscription');
    return;
  }
  const subscriptionMetadata: Partial<User> = {
    subscriptionMetadata: {
      ...user.subscriptionMetadata,
      currentPeriodEnd: endDate,
    },
  };
  if (cancel) {
    // "canceled" is Stripe's spelling and the canonical one across the codebase.
    subscriptionMetadata.subscriptionMetadata!.status = 'canceled';
    await updateHouseStatuses(user.adminId, 'canceled');
  }
  return userCollection.doc(user.id!).update(subscriptionMetadata);
}

export async function getUsers(attribute: string, value: string) {
  return userCollection.where(attribute, '==', value).get();
}

export async function getUser(id: string) {
  return (await userCollection.doc(id).get()).data() as User;
}

// Recursively removes `undefined` values (Firestore rejects them by default)
// while preserving FieldValue sentinels (serverTimestamp/increment/delete),
// Date, and Timestamp objects — unlike JSON.parse(JSON.stringify(...)), which
// silently collapses sentinels to {} and converts Dates to ISO strings.
function stripUndefinedDeep<T>(value: T): T {
  if (
    value === null ||
    typeof value !== 'object' ||
    value instanceof Date ||
    value instanceof admin.firestore.FieldValue ||
    value instanceof admin.firestore.Timestamp
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (val === undefined) continue;
    result[key] = stripUndefinedDeep(val);
  }
  return result as T;
}

export async function updateUser(id: string, values: Partial<User>) {
  return userCollection.doc(id).update(stripUndefinedDeep(values));
}

export async function addNotification(notification: Notification) {
  const noteDoc = notificationCollection.doc();
  notification.id = noteDoc.id;
  return noteDoc.set(notification);
}

export async function getMeetingsWhere(attribute: string, value: string) {
  return meetingCollection.where(attribute, '==', value).get();
}

export async function getMeetings() {
  return meetingCollection.get();
}

export async function getGuestsWhere(attribute: string, value: string) {
  return guestCollection.where(attribute, '==', value).get();
}

export function updateDispute(
  house: Partial<House>,
  guest: Partial<Guest>,
  notifications: Notification[],
  transaction: FirebaseFirestore.Transaction,
  resolvedDispute?: Dispute,
) {
  transaction.update(houseCollection.doc(house.id!), house);
  transaction.update(guestCollection.doc(guest.id!), guest);
  if (resolvedDispute) {
    transaction.create(
      ratsFirestore.collection('disputes').doc(resolvedDispute.id),
      resolvedDispute,
    );
  }
  notifications.forEach((notification) => {
    const newNoteRef = notificationCollection.doc();
    transaction.set(newNoteRef, notification);
  });
}

export function updateContact(contactId: string, contact: Contact) {
  return contactCollection.doc(contactId).set(contact);
}

export async function updateHouseAdmins(houseId: string, adminId: string) {
  // arrayUnion is variadic — pass the element directly. Passing [adminId]
  // appended the array itself as a single element, corrupting adminIds.
  const adminIds = admin.firestore.FieldValue.arrayUnion(adminId);
  return houseCollection.doc(houseId).update({ adminIds: adminIds });
}

// ─── Compliance export (RG-SPEC-09) read helpers ────────────────────────────
// Typed loosely as DocumentData — the compliance callable owns the field shapes.
// Drug-test docs live in `drug-tests`; meeting attendance lives in the flat
// `activities` collection (type === "meeting").

export async function getGuestsForHouse(
  houseId: string,
): Promise<FirebaseFirestore.DocumentData[]> {
  const result = await guestCollection.where('houseId', '==', houseId).get();
  return result.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Single-field equality query (houseId only) so this never needs a composite
// Firestore index — this repo has no deploy path for firestore.indexes.json
// (deploys are `--only functions`), so a query requiring a manual composite
// index would silently fail in production with no way to add it.
export async function getInvitationsForHouse(
  houseId: string,
): Promise<FirebaseFirestore.DocumentData[]> {
  const result = await invitationCollection.where('houseId', '==', houseId).get();
  return result.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getGuest(
  guestId: string,
): Promise<FirebaseFirestore.DocumentData | undefined> {
  const snap = await guestCollection.doc(guestId).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : undefined;
}

export async function getDrugTestsForGuest(
  guestId: string,
): Promise<FirebaseFirestore.DocumentData[]> {
  const result = await drugTestCollection.where('guestId', '==', guestId).get();
  return result.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getDrugTestsForHouse(
  houseId: string,
): Promise<FirebaseFirestore.DocumentData[]> {
  const result = await drugTestCollection.where('houseId', '==', houseId).get();
  return result.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getMeetingActivitiesForGuest(
  guestId: string,
): Promise<FirebaseFirestore.DocumentData[]> {
  const result = await activityCollection
    .where('guestId', '==', guestId)
    .where('type', '==', 'meeting')
    .get();
  return result.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ─── Rent-collection ROI metrics (RG-TRACK) read helper ─────────────────────
// Returns all successful payment docs for a house. The date window is filtered
// in memory by the analytics callable (avoids a composite index on
// houseId + status + createdAt). The `payments` collection is written by the
// Stripe webhook on `payment_intent.succeeded`; `amount` is in dollars.
export async function getSuccessfulPaymentsForHouse(
  houseId: string,
): Promise<FirebaseFirestore.DocumentData[]> {
  const result = await paymentsCollection
    .where('houseId', '==', houseId)
    .where('status', '==', 'succeeded')
    .get();
  return result.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getMeetingActivitiesForHouse(
  houseId: string,
): Promise<FirebaseFirestore.DocumentData[]> {
  const result = await activityCollection
    .where('houseId', '==', houseId)
    .where('type', '==', 'meeting')
    .get();
  return result.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getNaMeetings(lat: number, lng: number, distance: number, day?: string) {
  const queries = getQueriesForDocumentsAround(
    ratsFirestore.collection('na-meetings'),
    { lat, lon: lng },
    10,
    day,
  );
  const results = queries.map((q) => q.get());
  const meetings: FirebaseFirestore.DocumentData[] = [];
  const resolved = await Promise.all(results);
  resolved.forEach((r) => {
    meetings.push(...r.docs.map((d) => d.data()));
  });
  return meetings;
}
