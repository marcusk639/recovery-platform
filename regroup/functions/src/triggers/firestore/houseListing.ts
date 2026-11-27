/**
 * Keeps house-listings/{houseId}, a house's public listing (houses/houseListing.ts),
 * in step with the house. Decides from the current house doc, not the event, so
 * redelivered or out-of-order events converge; an unchanged listing isn't rewritten.
 */
import { logger } from 'firebase-functions/v2';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { houseCollection, houseListingCollection } from '../../api/firestore';
import { planHouseListing, ListingPlan } from '../../houses/houseListing';

/** Re-plans one house's listing from its current doc; also the grace sweep's step. */
export async function syncHouseListing(
  houseId: string,
  now: number = Date.now(),
): Promise<ListingPlan['kind']> {
  const [houseSnap, listingSnap] = await Promise.all([
    houseCollection.doc(houseId).get(),
    houseListingCollection.doc(houseId).get(),
  ]);
  const plan = planHouseListing(
    houseId,
    houseSnap.exists ? houseSnap.data() : undefined,
    listingSnap.exists ? listingSnap.data() : undefined,
    now,
  );
  if (plan.kind === 'write') {
    await houseListingCollection
      .doc(houseId)
      .set({ ...plan.listing, updatedAt: FieldValue.serverTimestamp() });
  } else if (plan.kind === 'delete') {
    await houseListingCollection.doc(houseId).delete();
  }
  return plan.kind;
}

export const onHouseListingSync = onDocumentWritten(
  { document: '/houses/{houseId}', retry: true },
  async (event) => {
    const houseId = event.params.houseId;
    const result = await syncHouseListing(houseId);
    if (result !== 'unchanged') logger.info('house_listing.synced', { houseId, result });
  },
);
