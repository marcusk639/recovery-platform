/**
 * Keeps house-listings/{houseId}, a house's public listing (houses/houseListing.ts),
 * in step with the house. Decides from the current house doc, not the event, so
 * redelivered or out-of-order events converge; an unchanged listing isn't rewritten.
 * The house is read and the listing written in one transaction, as in
 * houseRentSettings.ts: otherwise a handler that read the house just before a
 * newer write could write its older listing after the newer handler's, leaving,
 * say, a canceled house listed until the house is next written.
 */
import { logger } from 'firebase-functions/v2';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { houseCollection, houseListingCollection, ratsFirestore } from '../../api/firestore';
import { planHouseListing, ListingPlan } from '../../houses/houseListing';

/** Re-plans one house's listing from its current doc; also the grace sweep's step. */
export async function syncHouseListing(
  houseId: string,
  now: number = Date.now(),
): Promise<ListingPlan['kind']> {
  const houseRef = houseCollection.doc(houseId);
  const listingRef = houseListingCollection.doc(houseId);
  return ratsFirestore.runTransaction(async (txn) => {
    const houseSnap = await txn.get(houseRef);
    const listingSnap = await txn.get(listingRef);
    const plan = planHouseListing(
      houseId,
      houseSnap.exists ? houseSnap.data() : undefined,
      listingSnap.exists ? listingSnap.data() : undefined,
      now,
    );
    if (plan.kind === 'write') {
      txn.set(listingRef, { ...plan.listing, updatedAt: FieldValue.serverTimestamp() });
    } else if (plan.kind === 'delete') {
      txn.delete(listingRef);
    }
    return plan.kind;
  });
}

export const onHouseListingSync = onDocumentWritten(
  { document: '/houses/{houseId}', retry: true },
  async (event) => {
    const houseId = event.params.houseId;
    const result = await syncHouseListing(houseId);
    if (result !== 'unchanged') logger.info('house_listing.synced', { houseId, result });
  },
);
