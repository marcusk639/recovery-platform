import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { ratsFirestore } from '../../api/firestore';
import { restampGuestActivities } from '../../activities/guestRestamp';
import { stampGuestCharges } from '../../rent/chargeAccountStamp';
import { eventAgeMinutes, isStaleEvent } from '../../util/eventAge';

/**
 * When a guest's account (guests.userId) is linked or changed, fills
 * residentUid on that guest's activities that have none yet, from the guest
 * doc's current account (activities/guestRestamp). A stamp, once set, never
 * moves. Separate from onGuestWrite, which owns the guest's claims and
 * billing. It also fills guestUserId on the guest's rent charges that have none
 * (rent/chargeAccountStamp, owner decision 2026-11-26), so a resident's own history
 * shows the charges made before their record linked to their account.
 *
 * Idempotent (each fill is a transaction that re-reads the activity and the
 * guest), so the trigger retries on failure, but stops retrying an event
 * older than RETRY_CUTOFF_MS (util/eventAge).
 */
export const onGuestLinkedRestamp = onDocumentWritten(
  { document: 'guests/{guestId}', retry: true },
  async (event) => {
    if (isStaleEvent(event.time)) {
      // Given up: any activity this event failed to fill was left pending,
      // so its next write or the backfill fills it.
      logger.error('resident_restamp.stale_event', {
        guestId: event.params.guestId,
        ageMinutes: eventAgeMinutes(event.time),
      });
      return;
    }
    const args = [
      ratsFirestore,
      event.params.guestId,
      event.data?.before?.data(),
      event.data?.after?.data(),
    ] as const;
    // Both run; either failing retries the event, and both are idempotent.
    const results = await Promise.allSettled([
      restampGuestActivities(...args),
      stampGuestCharges(...args),
    ]);
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed) throw failed.reason;
  },
);
