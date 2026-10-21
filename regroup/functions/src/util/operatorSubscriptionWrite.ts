import { ratsFirestore, stripUndefinedDeep, userCollection } from '../api/firestore';

type HousesMap = Record<string, unknown>;

/**
 * Writes a newly created operator subscription onto the user doc, keeping the
 * stored subscription houses map. That map is the property-cap count
 * createHouses enforces and a new subscription carries none, so replacing it
 * let an operator at the cap subscribe again (a new trial, another tier or
 * interval, or the next day) and add a full new set of houses. Runs in a
 * transaction so it cannot race createHouses adding to the map. Returns the
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
    tx.update(ref, { subscriptionMetadata: stripUndefinedDeep(written) });
    return written;
  });
};
