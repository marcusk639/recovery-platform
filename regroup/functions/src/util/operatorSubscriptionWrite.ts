import type * as admin from 'firebase-admin';
import { ratsFirestore, stripUndefinedDeep, userCollection } from '../api/firestore';
import { setOperatorHousesStatus } from './operatorHouses';

type HousesMap = Record<string, unknown>;

/**
 * Writes a newly created operator subscription onto the user doc, keeping the
 * stored subscription houses map. That map is the property-cap count
 * createHouses enforces and a new subscription carries none, so replacing it
 * let an operator at the cap subscribe again (a new trial, another tier or
 * interval, or the next day) and add a full new set of houses. Runs in a
 * transaction so it cannot race createHouses adding to the map. Replacing the
 * metadata also clears the checkout lock (util/checkoutGuard). Returns the
 * metadata as written.
 */
export const writeOperatorSubscription = async <M extends object>(
  uid: string,
  meta: M,
): Promise<M & { houses: HousesMap }> =>
  // potentialSuperAdmin on the doc is what the app routes an operator who has
  // not finished setup by. A new web signup writes it when it creates the
  // account; an existing account checking out while signed in has no such
  // write, so the checkout sets it here, with the plan it is for.
  writeKeepingHouses(uid, meta, { potentialSuperAdmin: true });

/**
 * Writes Reactivate's replacement plan, keeping the stored houses map as
 * writeOperatorSubscription does. The replacement is built from the record
 * read before Stripe created it, so its own map could drop a resident counted
 * meanwhile or bring back a house deleted meanwhile. Replacing the metadata
 * drops `checkoutStartedAt`, which releases Reactivate's lock: the replacement
 * never carries one. The houses' statuses are written in the same transaction:
 * written apart, a failure between them left a record naming the replacement
 * with its houses still canceled, which no retry would see.
 */
export const writeReplacementSubscription = async <M extends { status?: string }>(
  uid: string,
  meta: M,
): Promise<M & { houses: HousesMap }> =>
  writeKeepingHouses(uid, meta, {}, async (tx) => {
    await setOperatorHousesStatus(uid, meta.status ?? '', tx);
  });

const writeKeepingHouses = async <M extends object>(
  uid: string,
  meta: M,
  extra: Record<string, unknown>,
  // Reads and writes more in the transaction (after its read, before its write).
  alongside?: (tx: admin.firestore.Transaction) => Promise<void>,
): Promise<M & { houses: HousesMap }> => {
  const ref = userCollection.doc(uid);
  return ratsFirestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const houses = (snap.data()?.subscriptionMetadata?.houses ?? {}) as HousesMap;
    const written = { ...meta, houses };
    if (alongside) await alongside(tx);
    tx.update(ref, { subscriptionMetadata: stripUndefinedDeep(written), ...extra });
    return written;
  });
};

export type SubscriptionHouses = Record<string, { numberOfGuests: number }>;
type StoredMetadata = Record<string, any>;

/**
 * Changes the operator's subscription houses map from the stored one, in a
 * transaction, writing only it and lastUpdatedAt. Writing back a whole copy
 * read earlier would put back fields changed meanwhile, such as the checkout
 * lock (util/checkoutGuard) or a house createHouses added (a freed
 * property-cap slot). `change` gets the stored map and the stored metadata (the
 * plan's caps) and throws to refuse (the cap checks). Firestore runs it again
 * when the doc changed before the commit, so it must have no side effects.
 * Returns the stored metadata as written.
 */
export const changeSubscriptionHouses = async (
  uid: string,
  change: (houses: SubscriptionHouses, stored: StoredMetadata) => SubscriptionHouses,
): Promise<StoredMetadata> => {
  const ref = userCollection.doc(uid);
  return ratsFirestore.runTransaction(async (tx) => {
    const meta = ((await tx.get(ref)).data()?.subscriptionMetadata ?? {}) as StoredMetadata;
    const houses = change((meta.houses ?? {}) as SubscriptionHouses, meta);
    const lastUpdatedAt = new Date().toISOString();
    tx.update(ref, {
      'subscriptionMetadata.houses': houses,
      'subscriptionMetadata.lastUpdatedAt': lastUpdatedAt,
    });
    return { ...meta, houses, lastUpdatedAt };
  });
};

/**
 * Sets the operator's subscription status alone, leaving the rest as stored
 * (see changeSubscriptionHouses). Writes only while the record still names
 * `subscriptionId`: a cancel or resume of a plan a checkout or Reactivate has
 * since replaced must not set the new plan's status. Returns whether it wrote,
 * and the stored metadata as it now is.
 */
export const setSubscriptionStatus = async (
  uid: string,
  subscriptionId: string,
  status: string,
): Promise<{ written: boolean; subscriptionMetadata: StoredMetadata }> => {
  const ref = userCollection.doc(uid);
  return ratsFirestore.runTransaction(async (tx) => {
    const meta = ((await tx.get(ref)).data()?.subscriptionMetadata ?? {}) as StoredMetadata;
    if (meta.subscriptionId !== subscriptionId) return { written: false, subscriptionMetadata: meta };
    const lastUpdatedAt = new Date().toISOString();
    tx.update(ref, {
      'subscriptionMetadata.status': status,
      'subscriptionMetadata.lastUpdatedAt': lastUpdatedAt,
    });
    return { written: true, subscriptionMetadata: { ...meta, status, lastUpdatedAt } };
  });
};
