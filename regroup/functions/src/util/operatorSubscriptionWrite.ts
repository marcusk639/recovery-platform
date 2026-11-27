import { ratsFirestore, stripUndefinedDeep, userCollection } from '../api/firestore';

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
 * meanwhile or bring back a house deleted meanwhile. Clears the lock too.
 */
export const writeReplacementSubscription = async <M extends object>(
  uid: string,
  meta: M,
): Promise<M & { houses: HousesMap }> => writeKeepingHouses(uid, meta, {});

const writeKeepingHouses = async <M extends object>(
  uid: string,
  meta: M,
  extra: Record<string, unknown>,
): Promise<M & { houses: HousesMap }> => {
  const ref = userCollection.doc(uid);
  return ratsFirestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const houses = (snap.data()?.subscriptionMetadata?.houses ?? {}) as HousesMap;
    const written = { ...meta, houses };
    tx.update(ref, { subscriptionMetadata: stripUndefinedDeep(written), ...extra });
    return written;
  });
};

export type SubscriptionHouses = Record<string, { numberOfGuests: number }>;
type StoredMetadata = Record<string, any>;

/**
 * Changes the operator's subscription houses map from the stored one, in a
 * transaction, and writes only it and lastUpdatedAt. Writers used to write
 * back the whole metadata they had read earlier, which put back fields changed
 * meanwhile: an erased checkout lock (util/checkoutGuard) refused a checkout
 * still under way, and a houses map read before createHouses added a house
 * dropped it, freeing a property-cap slot. `change` runs on the stored map
 * and the stored metadata (the plan's caps), and throws to refuse (the cap
 * checks). Returns the map as written.
 */
export const changeSubscriptionHouses = async (
  uid: string,
  change: (houses: SubscriptionHouses, stored: StoredMetadata) => SubscriptionHouses,
): Promise<SubscriptionHouses> => {
  const ref = userCollection.doc(uid);
  return ratsFirestore.runTransaction(async (tx) => {
    const meta = ((await tx.get(ref)).data()?.subscriptionMetadata ?? {}) as StoredMetadata;
    const houses = change((meta.houses ?? {}) as SubscriptionHouses, meta);
    tx.update(ref, {
      'subscriptionMetadata.houses': houses,
      'subscriptionMetadata.lastUpdatedAt': new Date().toISOString(),
    });
    return houses;
  });
};

/**
 * Sets the operator's subscription status alone, while the record still names
 * this subscription; once it names another nothing is written. For the same
 * reason as changeSubscriptionHouses: the rest is left as stored. Returns
 * whether it wrote, and the stored metadata as it now is.
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
