import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { ratsFirestore } from '../../api/firestore';
import { restampGuestActivities } from '../../activities/guestRestamp';
import { eventAgeMinutes, isStaleEvent } from '../../util/eventAge';

/**
 * When a guest's account (guests.userId) is linked or changed, fills
 * residentUid on that guest's activities that have none yet, from the guest
 * doc's current account (activities/guestRestamp). A stamp, once set, never
 * moves. Separate from onGuestWrite, which owns the guest's claims and
 * billing.
 *
 * Idempotent (each fill is a transaction that re-reads the activity and the
 * guest), so the trigger retries on failure, but stops retrying an event
 * older than RETRY_CUTOFF_MS (util/eventAge).
 */
export const onGuestLinkedRestamp = onDocumentWritten(
  { document: 'guests/{guestId}', retry: true },
  async (event) => {
    if (isStaleEvent(event.time)) {
      logger.warn('resident_restamp.stale_event', {
        guestId: event.params.guestId,
        ageMinutes: eventAgeMinutes(event.time),
      });
      return;
    }
    await restampGuestActivities(
      ratsFirestore,
      event.params.guestId,
      event.data?.before?.data(),
      event.data?.after?.data(),
    );
  },
);
