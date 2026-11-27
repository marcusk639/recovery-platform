import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { ratsFirestore } from '../../api/firestore';
import { syncAdminProfile } from '../../admins/profileSync';
import { eventAgeMinutes, isStaleEvent } from '../../util/eventAge';

/**
 * When a user's firstName, lastName or phoneNumber changes, copies the user
 * doc's current values onto every admins record with that userId
 * (admins/profileSync). Does nothing for other user updates or for a user
 * with no admins record.
 *
 * Idempotent (each record's update is a transaction that re-reads the user
 * and the record), so the trigger retries on failure, but stops retrying an
 * event older than RETRY_CUTOFF_MS (util/eventAge).
 */
export const onUserAdminProfileSync = onDocumentUpdated(
  { document: 'users/{userId}', retry: true },
  async (event) => {
    if (isStaleEvent(event.time)) {
      // Given up: the copy stays stale until the user's next name or phone
      // change, or the app's own copy on the next profile save.
      logger.error('admin_profile_sync.stale_event', {
        uid: event.params.userId,
        ageMinutes: eventAgeMinutes(event.time),
      });
      return;
    }
    await syncAdminProfile(
      ratsFirestore,
      event.params.userId,
      event.data?.before?.data(),
      event.data?.after?.data(),
    );
  },
);
