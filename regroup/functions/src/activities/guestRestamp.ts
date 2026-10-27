/**
 * Re-stamps `residentUid` on a guest's activities when the guest's account
 * (guests.userId) changes: linked to an account it had none for, or changed
 * to another one. Runs from the onGuestLinkedRestamp trigger.
 *
 * The rules' owner rule trusts the stamp over the live guest doc, so a stamp
 * taken while the guest doc pointed elsewhere (a senior peer briefly setting
 * their own guest's userId to someone else, then logging an activity) must
 * not outlive the change back. Each activity is re-stamped from the guest
 * doc's CURRENT userId, in a transaction that re-reads both, so events that
 * arrive late or out of order converge on the current account. A cleared
 * userId stamps nothing (the stamp keeps the last known account).
 *
 * Idempotent and retry-safe: only activities whose stamp differs are written.
 * The stamp is not part of a week summary's inputs, so this triggers no
 * recompute. Logs ids and counts only.
 */
import { logger } from 'firebase-functions';
import { residentUidFrom } from './residentStamp';

type Firestore = FirebaseFirestore.Firestore;
type Data = Record<string, unknown>;

export function accountChanged(before: Data | undefined, after: Data | undefined): boolean {
  const next = residentUidFrom(after);
  return !!next && residentUidFrom(before) !== next;
}

export async function restampGuestActivities(
  db: Firestore,
  guestId: string,
  before: Data | undefined,
  after: Data | undefined,
  { pageSize = 200 }: { pageSize?: number } = {},
): Promise<{ scanned: number; stamped: number }> {
  if (!accountChanged(before, after)) return { scanned: 0, stamped: 0 };
  const guestRef = db.collection('guests').doc(guestId);
  const base = db.collection('activities').where('guestId', '==', guestId).orderBy('__name__');
  let scanned = 0;
  let stamped = 0;
  let last: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    const page = await (last ? base.startAfter(last) : base).limit(pageSize).get();
    for (const doc of page.docs) {
      scanned++;
      const wrote = await db.runTransaction(async (tx) => {
        const activity = await tx.get(doc.ref);
        const guest = await tx.get(guestRef);
        const uid = residentUidFrom(guest.exists ? (guest.data() as Data) : undefined);
        const data = activity.exists ? (activity.data() as Data) : undefined;
        if (!uid || !data || data.guestId !== guestId || data.residentUid === uid) return false;
        tx.update(doc.ref, { residentUid: uid });
        return true;
      });
      if (wrote) stamped++;
    }
    if (page.docs.length < pageSize) break;
    last = page.docs[page.docs.length - 1];
  }
  logger.info('resident_restamp.done', { guestId, scanned, stamped });
  return { scanned, stamped };
}
