/**
 * Fills `residentUid` on a guest's activities when the guest's account
 * (guests.userId) is linked or changed. Runs from the onGuestLinkedRestamp
 * trigger.
 *
 * The stamp is immutable once set (see residentStamp): this only fills an
 * activity whose stamp is absent or null (e.g. logged before the guest had an
 * account), from the guest doc's CURRENT userId, in a transaction that
 * re-reads both. A stamped activity is never touched, so pointing a guest doc
 * at another account (or deleting and recreating it) moves no stamp. A
 * cleared userId stamps nothing.
 *
 * Idempotent and retry-safe; activities that are already stamped are skipped
 * without a transaction. The stamp is not part of a week summary's inputs, so
 * this triggers no recompute. Logs ids and counts only.
 */
import { logger } from 'firebase-functions';
import { fillStamp, residentUidFrom } from './residentStamp';

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
  let failed: unknown;
  let last: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    const page = await (last ? base.startAfter(last) : base).limit(pageSize).get();
    for (const doc of page.docs) {
      scanned++;
      const existing = doc.data() as Data;
      if (typeof existing.residentUid === 'string' && existing.residentUid !== '') continue;
      const fill = db.runTransaction(async (tx) => {
        const activity = await tx.get(doc.ref);
        const guest = await tx.get(guestRef);
        const uid = residentUidFrom(guest.exists ? (guest.data() as Data) : undefined);
        const data = activity.exists ? (activity.data() as Data) : undefined;
        const isStamped = typeof data?.residentUid === 'string' && data.residentUid !== '';
        if (!uid || !data || data.guestId !== guestId || isStamped) return false;
        tx.update(doc.ref, fillStamp(uid));
        return true;
      });
      try {
        if (await fill) stamped++;
      } catch (err) {
        // Leave it pending (not "unfillable"), so the next write of the
        // activity, the backfill or this event's retry can still fill it.
        failed = failed ?? err;
        await doc.ref.update({ residentUidPending: true }).catch(() => undefined);
      }
    }
    if (page.docs.length < pageSize) break;
    last = page.docs[page.docs.length - 1];
  }
  logger.info('resident_restamp.done', { guestId, scanned, stamped, failed: !!failed });
  if (failed) throw failed; // retried until RETRY_CUTOFF_MS
  return { scanned, stamped };
}
