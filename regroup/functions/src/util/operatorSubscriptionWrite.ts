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
): Promise<M & { houses: HousesMap }> => {
  const ref = userCollection.doc(uid);
  return ratsFirestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const houses = (snap.data()?.subscriptionMetadata?.houses ?? {}) as HousesMap;
    const written = { ...meta, houses };
    // potentialSuperAdmin on the doc is what the app routes an operator who has
    // not finished setup by. A new web signup writes it when it creates the
    // account; an existing account checking out while signed in has no such
    // write, so the checkout sets it here, with the plan it is for.
    tx.update(ref, { subscriptionMetadata: stripUndefinedDeep(written), potentialSuperAdmin: true });
    return written;
  });
};

export type SubscriptionHouses = Record<string, { numberOfGuests: number }>;

/**
 * Changes the operator's subscription houses map from the stored one, in a
 * transaction, and writes only it and lastUpdatedAt. Writers used to write
 * back the whole metadata they had read earlier, which put back fields changed
 * meanwhile: an erased checkout lock (util/checkoutGuard) refused a checkout
 * still under way, and a houses map read before createHouses added a house
 * dropped it, freeing a property-cap slot. `change` may throw to refuse (the
 * cap checks), and runs on the stored map. Returns the map as written.
 */
export const changeSubscriptionHouses = async (
  uid: string,
  change: (houses: SubscriptionHouses) => SubscriptionHouses,
): Promise<SubscriptionHouses> => {
  const ref = userCollection.doc(uid);
  return ratsFirestore.runTransaction(async (tx) => {
    const stored = (await tx.get(ref)).data()?.subscriptionMetadata?.houses;
    const houses = change((stored ?? {}) as SubscriptionHouses);
    tx.update(ref, {
      'subscriptionMetadata.houses': houses,
      'subscriptionMetadata.lastUpdatedAt': new Date().toISOString(),
    });
    return houses;
  });
};

/**
 * Sets the operator's subscription status alone, while the record still names
 * this subscription (false, and nothing written, once it names another). For
 * the same reason as changeSubscriptionHouses: the rest is left as stored.
 */
export const setSubscriptionStatus = async (
  uid: string,
  subscriptionId: string,
  status: string,
): Promise<boolean> => {
  const ref = userCollection.doc(uid);
  return ratsFirestore.runTransaction(async (tx) => {
    const meta = (await tx.get(ref)).data()?.subscriptionMetadata;
    if (meta?.subscriptionId !== subscriptionId) return false;
    tx.update(ref, {
      'subscriptionMetadata.status': status,
      'subscriptionMetadata.lastUpdatedAt': new Date().toISOString(),
    });
    return true;
  });
};
