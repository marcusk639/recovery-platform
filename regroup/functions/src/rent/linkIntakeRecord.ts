/**
 * One person, two records: a manager's intake creates a record with no account, then
 * the person signs up from an invite and the app creates a second one. Both are
 * active, so both would be charged. This moves the rent (balance, account dates and
 * charge history) onto the invite record, the one the resident's app uses, and marks
 * the intake record rentLinkedTo so it is never charged again. Nothing else merges.
 */
import { auth } from 'firebase-admin';
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
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * Each account's email as Firebase Auth has it, lower-cased. A guest doc's email is
 * written by the client (the invited self-create rule doesn't bind it), so an invite
 * record is matched by its account's email, never by its own. A missing account is
 * left out; any other Auth error throws, so the trigger retries.
 */
async function accountEmails(uids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < uids.length; i += 100) {
    const { users } = await auth().getUsers(uids.slice(i, i + 100).map((uid) => ({ uid })));
    for (const u of users) if (u.email) out.set(u.uid, normalEmail(u.email));
  }
  return out;
}

/**
 * Links in either order: a new invite record finds the intake record (no userId), or
 * a new intake record, made after the person already signed up, finds the invite
 * record (with a userId). The rent always moves onto the invite record.
 * `newGuest` is the new record's data when the caller already has it (saves a read).
 */
export async function linkIntakeRecord(
  newGuestId: string,
  newGuest?: Data,
): Promise<'linked' | 'none' | 'ambiguous'> {
  const fresh = newGuest ?? ((await guestCollection.doc(newGuestId).get()).data() as Data);
  const email = normalEmail(fresh?.email);
  const houseId = typeof fresh?.houseId === 'string' ? fresh.houseId : '';
  if (!fresh || !email || !houseId || fresh.rentLinkedTo) return 'none';
  const newIsInvite = isPlausibleUid(fresh.userId);
  if (!newIsInvite && !hasNoUserId(fresh)) return 'none';

  const inHouse = await guestCollection.where('houseId', '==', houseId).get();
  const candidates = inHouse.docs.filter((d) => {
    const g = (d.data() ?? {}) as Data;
    return (
      d.id !== newGuestId &&
      isActiveGuestDoc(g) &&
      (newIsInvite ? hasNoUserId(g) : isPlausibleUid(g.userId)) &&
      !g.rentLinkedTo
    );
  });
  if (candidates.length === 0) return 'none';
  const uidOf = (d: { data: () => unknown }) => ((d.data() ?? {}) as Data).userId as string;
  const emails = await accountEmails(newIsInvite ? [fresh.userId as string] : candidates.map(uidOf));
  const inviteEmail = newIsInvite ? emails.get(fresh.userId as string) : undefined;
  const matches = candidates.filter((d) =>
    newIsInvite
      ? !!inviteEmail && normalEmail(((d.data() ?? {}) as Data).email) === inviteEmail
      : emails.get(uidOf(d)) === email,
  );
  if (matches.length === 0) return 'none';
  if (matches.length > 1) {
    logger.warn('linkIntakeRecord: more than one record matches; none linked', {
      guestId: newGuestId,
      houseId,
      matches: matches.length,
    });
    return 'ambiguous';
  }
  const intakeId = newIsInvite ? matches[0].id : newGuestId;
  const inviteId = newIsInvite ? newGuestId : matches[0].id;
  const userId = (newIsInvite ? fresh : (matches[0].data() as Data)).userId as string;
  return linkRecords(intakeId, inviteId, userId, houseId);
}

async function linkRecords(
  intakeId: string,
  newGuestId: string,
  userId: string,
  houseId: string,
): Promise<'linked' | 'none'> {
  let selfMade = false;
  const linked = await ratsFirestore.runTransaction(async (txn) => {
    selfMade = false;
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
    if (
      !newSnap.exists ||
      !intakeSnap.exists ||
      source.rentLinkedTo ||
      target.rentLinkedTo ||
      !hasNoUserId(source)
    ) {
      return false;
    }
    // Who made the intake record: only createdBy counts, because the rules bind it to
    // the caller. A record the person made for themselves never links. With no
    // confirmed creator, only amounts owed move (they can only raise a balance),
    // never a rate or a move-in date.
    const creator = str(source.createdBy);
    if (creator === userId) {
      selfMade = true;
      return false;
    }
    // Only amounts owed move across. A credit stays on the intake record for a
    // manager to apply by hand, so no record can lower another's balance.
    const owed = Math.max(0, num(source.rentOwed));
    const fees = Math.max(0, num(source.choreFees));
    const due = [target.rentDueDate, source.rentDueDate]
      .filter((d): d is string => typeof d === 'string' && d !== '')
      .sort()[0];
    // A manager's custom rate (a scholarship, say) follows the person, but only when
    // a known manager, not the person, made the intake record.
    const rate = creator && source.customRent && !target.customRent ? source.customRent : null;
    txn.update(newRef, {
      rentOwed: FieldValue.increment(owed),
      choreFees: FieldValue.increment(fees),
      ...(creator && !target.moveInDate && source.moveInDate
        ? { moveInDate: source.moveInDate }
        : {}),
      ...(due && owed > 0 ? { rentDueDate: due } : {}),
      ...(rate ? { customRent: rate } : {}),
    });
    txn.update(intakeRef, {
      rentOwed: num(source.rentOwed) - owed,
      choreFees: num(source.choreFees) - fees,
      rentLinkedTo: newGuestId,
    });
    if (oldAccount.exists) {
      if (!newAccount.exists) {
        txn.set(newAccountRef, { ...(oldAccount.data() ?? {}), guestId: newGuestId });
      }
      txn.delete(oldAccountRef);
    } else if (!newAccount.exists && intakeSnap.createTime) {
      // Not yet charged: pass on when the person really joined the house, so they are
      // anchored as the resident they are, not as a sign-up today.
      txn.set(newAccountRef, {
        guestId: newGuestId,
        houseId,
        houseJoinedAtMs: intakeSnap.createTime.toMillis(),
      });
    }
    return true;
  });
  if (!linked) {
    if (selfMade) {
      logger.warn('linkIntakeRecord: intake record made by the same account; not linked', {
        guestId: newGuestId,
        intakeId,
        houseId,
      });
    }
    return 'none';
  }

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
