import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { ratsFirestore } from '../../api/firestore';
import { restampGuestActivities } from '../../activities/guestRestamp';

/**
 * When a guest's account (guests.userId) is linked or changed, re-stamps
 * residentUid on that guest's activities from the guest doc's current
 * account (activities/guestRestamp). Separate from onGuestWrite, which owns
 * the guest's claims and billing.
 *
 * Idempotent (only differing stamps are written, each in a transaction that
 * re-reads the activity and the guest), so the trigger retries on failure.
 */
export const onGuestLinkedRestamp = onDocumentWritten(
  { document: 'guests/{guestId}', retry: true },
  async (event) => {
    await restampGuestActivities(
      ratsFirestore,
      event.params.guestId,
      event.data?.before?.data(),
      event.data?.after?.data(),
    );
  },
);
