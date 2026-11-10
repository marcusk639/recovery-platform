/**
 * One person, two records: a manager's intake creates a record with no account, then
 * the person signs up from an invite and the app creates a second one. Both are
 * active, so both would be charged. This moves the rent (balance, account dates and
 * charge history) onto the invite record, the one the resident's app uses, and marks
 * the intake record rentLinkedTo so it is never charged again. Nothing else merges.
 */
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import {
  guestCollection,
  ratsFirestore,
  rentAccountCollection,
  rentChargeCollection,
} from '../api/firestore';
import { isActiveGuestDoc, isPlausibleUid } from '../util/guestMembership';

type Data = Record<string, unknown>;

const normalEmail = (v: unknown): string => (typeof v === 'string' ? v.trim().toLowerCase() : '');
const hasNoUserId = (g: Data) => g.userId === undefined || g.userId === null || g.userId === '';
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** `newGuest` is the record's data when the caller already has it (saves a read). */
export async function linkIntakeRecord(
  newGuestId: string,
  newGuest?: Data,
): Promise<'linked' | 'none' | 'ambiguous'> {
  const fresh = newGuest ?? ((await guestCollection.doc(newGuestId).get()).data() as Data);
  const email = normalEmail(fresh?.email);
  const houseId = typeof fresh?.houseId === 'string' ? fresh.houseId : '';
  if (!fresh || !email || !houseId || !isPlausibleUid(fresh.userId)) return 'none';
  const userId = fresh.userId;

  const inHouse = await guestCollection.where('houseId', '==', houseId).get();
  const matches = inHouse.docs.filter((d) => {
    const g = (d.data() ?? {}) as Data;
    return (
      d.id !== newGuestId &&
      isActiveGuestDoc(g) &&
      hasNoUserId(g) &&
      !g.rentLinkedTo &&
      normalEmail(g.email) === email
    );
  });
  if (matches.length === 0) return 'none';
  if (matches.length > 1) {
    logger.warn('linkIntakeRecord: more than one intake record matches; none linked', {
      guestId: newGuestId,
      houseId,
      matches: matches.length,
    });
    return 'ambiguous';
  }
  const intakeId = matches[0].id;

  const linked = await ratsFirestore.runTransaction(async (txn) => {
    const newRef = guestCollection.doc(newGuestId);
    const intakeRef = guestCollection.doc(intakeId);
    const oldAccountRef = rentAccountCollection.doc(intakeId);
    const newAccountRef = rentAccountCollection.doc(newGuestId);
    const [newSnap, intakeSnap, oldAccount, newAccount] = await txn.getAll(
      newRef,
      intakeRef,
      oldAccountRef,
      newAccountRef,
    );
    const target = (newSnap.data() ?? {}) as Data;
    const source = (intakeSnap.data() ?? {}) as Data;
    if (!newSnap.exists || !intakeSnap.exists || source.rentLinkedTo || !hasNoUserId(source)) {
      return false;
    }
    const due = [target.rentDueDate, source.rentDueDate]
      .filter((d): d is string => typeof d === 'string' && d !== '')
      .sort()[0];
    txn.update(newRef, {
      rentOwed: FieldValue.increment(num(source.rentOwed)),
      choreFees: FieldValue.increment(num(source.choreFees)),
      ...(!target.moveInDate && source.moveInDate ? { moveInDate: source.moveInDate } : {}),
      ...(due && num(source.rentOwed) > 0 ? { rentDueDate: due } : {}),
    });
    txn.update(intakeRef, { rentOwed: 0, choreFees: 0, rentLinkedTo: newGuestId });
    if (oldAccount.exists) {
      if (!newAccount.exists) {
        txn.set(newAccountRef, { ...(oldAccount.data() ?? {}), guestId: newGuestId });
      }
      txn.delete(oldAccountRef);
    }
    return true;
  });
  if (!linked) return 'none';

  // So the resident sees the intake record's charges in their own history.
  const history = await rentChargeCollection.where('guestId', '==', intakeId).get();
  if (!history.empty) {
    const batch = ratsFirestore.batch();
    history.docs.forEach((d) => batch.update(d.ref, { guestUserId: userId }));
    await batch.commit();
  }
  logger.info('linkIntakeRecord: linked', { guestId: newGuestId, intakeId, houseId });
  return 'linked';
}
