/**
 * Keeps the admins records' copy of a user's name and phone in step with
 * users/{uid}. Runs from the onUserAdminProfileSync trigger.
 *
 * The app's profile form (EditUserInfoForm) copies its fields to the admins
 * record only when that record has loaded, so a save made before it loads
 * left the copy stale. The form's copy stays (it also copies avatar, date of
 * birth and other fields); for these three fields the server is the backstop.
 *
 * admins records are keyed by createAdminId() auto-ids and carry `userId`, so
 * a user's records are found with where('userId', '==', uid); a user may have
 * none, or several. Each record is updated in its own transaction that
 * re-reads the CURRENT users/{uid} and the record, so events delivered out of
 * order, or redelivered, converge on the user doc's latest values. A field is
 * copied only when the user doc holds a string for it, so a legacy user doc
 * without the field never blanks the copy. A record whose userId no longer
 * matches is skipped.
 *
 * Idempotent and retry-safe: a record that already matches is not written.
 * Logs ids and counts only, never the values.
 */
import { logger } from 'firebase-functions';

type Firestore = FirebaseFirestore.Firestore;
type Data = Record<string, unknown>;

/** The users/{uid} fields mirrored onto the user's admins records. */
export const SYNCED_FIELDS = ['firstName', 'lastName', 'phoneNumber'] as const;

export function profileChanged(before: Data | undefined, after: Data | undefined): boolean {
  if (!after) return false;
  return SYNCED_FIELDS.some((f) => before?.[f] !== after[f]);
}

/** The fields of `admin` that differ from the user's current string values. */
export function profilePatch(user: Data, admin: Data): Record<string, string> {
  const patch: Record<string, string> = {};
  for (const f of SYNCED_FIELDS) {
    const value = user[f];
    if (typeof value === 'string' && admin[f] !== value) patch[f] = value;
  }
  return patch;
}

export async function syncAdminProfile(
  db: Firestore,
  uid: string,
  before: Data | undefined,
  after: Data | undefined,
): Promise<{ matched: number; updated: number }> {
  if (!profileChanged(before, after)) return { matched: 0, updated: 0 };
  const admins = await db.collection('admins').where('userId', '==', uid).get();
  if (admins.empty) return { matched: 0, updated: 0 };
  const userRef = db.collection('users').doc(uid);
  let updated = 0;
  let failed: unknown;
  for (const doc of admins.docs) {
    const sync = db.runTransaction(async (tx) => {
      const user = await tx.get(userRef);
      const admin = await tx.get(doc.ref);
      const userData = user.exists ? (user.data() as Data) : undefined;
      const adminData = admin.exists ? (admin.data() as Data) : undefined;
      if (!userData || !adminData || adminData.userId !== uid) return false;
      const patch = profilePatch(userData, adminData);
      if (Object.keys(patch).length === 0) return false;
      tx.update(doc.ref, patch);
      return true;
    });
    try {
      if (await sync) updated++;
    } catch (err) {
      // Keep going, so one failing record does not hold back the others;
      // the event's retry re-runs every record, and the ones done are no-ops.
      failed = failed ?? err;
    }
  }
  const matched = admins.size;
  logger.info('admin_profile_sync.done', { uid, matched, updated, failed: !!failed });
  // eslint-disable-next-line @typescript-eslint/only-throw-error -- rethrows the caught error as is
  if (failed) throw failed; // retried until RETRY_CUTOFF_MS
  return { matched, updated };
}
