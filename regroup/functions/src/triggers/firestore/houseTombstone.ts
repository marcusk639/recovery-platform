import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { houseTombstoneCollection, ratsFirestore, userCollection } from '../../api/firestore';
import type OperatorSubscription from '../../entities/OperatorSubscription';
import { removeHouseFromSubscription } from '../../util/subscriptionHouses';

/** The event's own timestamp, falling back to now if absent or unparseable. */
export const deletedAtFor = (eventTime: string | undefined): string => {
  const t = eventTime ? new Date(eventTime) : undefined;
  return t && !Number.isNaN(t.getTime()) ? t.toISOString() : new Date().toISOString();
};

/**
 * Frees the deleted house's slot in its owner's subscription houses map (the
 * property-cap count), in a transaction so it cannot race createHouses.
 * updateSubscriptionHouses refuses to remove a house that still exists, so
 * this is the only path that frees a slot. A no-op if the owner doc or the
 * map entry is already gone, so redelivery is safe.
 */
export const releaseSubscriptionSlot = async (ownerId: string, houseId: string): Promise<void> => {
  const ref = userCollection.doc(ownerId);
  await ratsFirestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const meta = snap.data()?.subscriptionMetadata as OperatorSubscription | undefined;
    if (!meta?.houses || !(houseId in meta.houses)) {
      return;
    }
    tx.update(ref, { subscriptionMetadata: removeHouseFromSubscription(meta, houseId) });
  });
};

/**
 * On house delete: records a tombstone (createHouses refuses tombstoned ids)
 * and releases the owner's property-cap slot. Both are eventual: written by
 * this trigger some time after the delete, not with it. The tombstone is
 * defence in depth (house ids are already caller-scoped); houseTombstones has
 * no client rule, so it is server-only (default deny). Retried on failure.
 * deletedAt is the event time, so a redelivery rewrites the same value when
 * event.time is present; without it, the retry time is used.
 */
export const onHouseDeleted = onDocumentDeleted(
  { document: '/houses/{houseId}', retry: true },
  async (event) => {
    const houseId = event.params.houseId;
    await houseTombstoneCollection.doc(houseId).set({ deletedAt: deletedAtFor(event.time) });
    const ownerId = (event.data?.data() as { ownerId?: unknown } | undefined)?.ownerId;
    if (typeof ownerId === 'string' && ownerId !== '') {
      await releaseSubscriptionSlot(ownerId, houseId);
    }
  },
);
