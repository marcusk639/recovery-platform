/**
 * Fills `guestUserId` on a resident's rent charges when their guest record links to
 * an app account (owner decision 2026-11-26). The rentCharges read rule lets a
 * resident read a charge only when its guestUserId is theirs, so charges made while
 * the record had no account (an intake or import record, linked later) were hidden
 * from their own history. Runs from onGuestLinkedRestamp, beside the activities'
 * residentUid fill, with the same rules:
 *
 * - only an empty guestUserId is filled; a set one never moves, so pointing a record
 *   at another account moves no charge;
 * - the account comes from the guest doc as it is now, re-read in the transaction,
 *   so late or redelivered events converge;
 * - idempotent and retry-safe. Logs ids and counts only.
 */
import { logger } from 'firebase-functions';
import { accountChanged } from '../activities/guestRestamp';
import { residentUidFrom } from '../activities/residentStamp';

type Firestore = FirebaseFirestore.Firestore;
type Data = Record<string, unknown>;

const hasAccount = (d: Data | undefined) =>
  typeof d?.guestUserId === 'string' && d.guestUserId !== '';

export async function stampGuestCharges(
  db: Firestore,
  guestId: string,
  before: Data | undefined,
  after: Data | undefined,
  { pageSize = 200 }: { pageSize?: number } = {},
): Promise<{ scanned: number; stamped: number }> {
  if (!accountChanged(before, after)) return { scanned: 0, stamped: 0 };
  const guestRef = db.collection('guests').doc(guestId);
  const base = db.collection('rentCharges').where('guestId', '==', guestId).orderBy('__name__');
  let scanned = 0;
  let stamped = 0;
  let last: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    const page = await (last ? base.startAfter(last) : base).limit(pageSize).get();
    for (const doc of page.docs) {
      scanned++;
      if (hasAccount(doc.data())) continue;
      const filled = await db.runTransaction(async (tx) => {
        const charge = await tx.get(doc.ref);
        const guest = await tx.get(guestRef);
        const uid = residentUidFrom(guest.exists ? guest.data() : undefined);
        const data = charge.exists ? (charge.data() as Data) : undefined;
        if (!uid || !data || data.guestId !== guestId || hasAccount(data)) return false;
        tx.update(doc.ref, { guestUserId: uid });
        return true;
      });
      if (filled) stamped++;
    }
    if (page.docs.length < pageSize) break;
    last = page.docs[page.docs.length - 1];
  }
  logger.info('rent_charge_stamp.done', { guestId, scanned, stamped });
  return { scanned, stamped };
}
