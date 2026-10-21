import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
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
 * updateSubscriptionHouses frees a slot only for a house whose doc is already
 * gone; this trigger frees it automatically. Writers that rewrite the whole
 * subscriptionMetadata outside a transaction can still race this and restore a
 * deleted house's entry (a known gap). Returns false when the owner doc or
 * the map entry is already gone (so redelivery is safe), true when it freed one.
 */
export const releaseSubscriptionSlot = async (
  ownerId: string,
  houseId: string,
): Promise<boolean> => {
  const ref = userCollection.doc(ownerId);
  return ratsFirestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const meta = snap.data()?.subscriptionMetadata as OperatorSubscription | undefined;
    if (!meta?.houses || !(houseId in meta.houses)) {
      return false;
    }
    tx.update(ref, { subscriptionMetadata: removeHouseFromSubscription(meta, houseId) });
    return true;
  });
};

/**
 * Releases the slot, logging (ids only) when none was freed: a house without
 * an ownerId, or one whose ownerId was rewritten before the delete, leaves its
 * slot in the original owner's map, where the operator would hit the cap with
 * no other signal (a redelivery after a successful release also logs it).
 * A failure is logged with its code and rethrown so the event is retried.
 */
const releaseSlotFor = async (houseId: string, ownerId: unknown): Promise<void> => {
  if (typeof ownerId !== 'string' || ownerId === '') {
    logger.warn('house.delete.slot_not_released', { houseId, reason: 'no-owner' });
    return;
  }
  try {
    if (!(await releaseSubscriptionSlot(ownerId, houseId))) {
      logger.warn('house.delete.slot_not_released', {
        houseId,
        ownerId,
        reason: 'not-in-owner-map',
      });
    }
  } catch (err) {
    logger.error('house.delete.slot_release_failed', {
      houseId,
      ownerId,
      code: (err as { code?: unknown })?.code,
    });
    throw err;
  }
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
    await releaseSlotFor(houseId, ownerId);
  },
);
