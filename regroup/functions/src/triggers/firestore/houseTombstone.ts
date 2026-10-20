import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { houseTombstoneCollection } from '../../api/firestore';

/** The event's own timestamp, falling back to now if absent or unparseable. */
export const deletedAtFor = (eventTime: string | undefined): string => {
  const t = eventTime ? new Date(eventTime) : undefined;
  return t && !Number.isNaN(t.getTime()) ? t.toISOString() : new Date().toISOString();
};

/**
 * Records a tombstone when a house is deleted; createHouses refuses tombstoned
 * ids. Defence in depth (house ids are already caller-scoped) and eventual: the
 * tombstone is written by this trigger some time after the delete, not with it.
 * houseTombstones has no client rule, so it is server-only (default deny).
 * Retried on failure; deletedAt is the event time, so a redelivered event
 * rewrites the same value.
 */
export const onHouseDeleted = onDocumentDeleted(
  { document: '/houses/{houseId}', retry: true },
  async (event) => {
    await houseTombstoneCollection
      .doc(event.params.houseId)
      .set({ deletedAt: deletedAtFor(event.time) });
  },
);
