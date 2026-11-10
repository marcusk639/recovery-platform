/**
 * What a guest write means for rent: a resident joining (create), moving to another
 * house, or coming back after a discharge is charged right away, so they can see and
 * pay their balance that day. Every other write returns 'none' without reads; that
 * matters because the charge's own rentOwed write re-fires the trigger.
 */
import { localDateString, resolveTimeZone } from '../activities/weekSummaryMath';
import {
  guestCollection,
  houseCollection,
  ratsFirestore,
  rentAccountCollection,
} from '../api/firestore';
import { isActiveGuestDoc } from '../util/guestMembership';
import { chargeResident } from './chargeResident';
import { linkIntakeRecord } from './linkIntakeRecord';
import { ChargeOutcome } from './types';

type Data = Record<string, unknown>;

export interface GuestRentEvent {
  guestId: string;
  before?: Data;
  after?: Data;
  afterCreateTimeMs?: number;
  /** The event's ISO time: when the move or re-activation happened. */
  eventTime: string;
  now?: Date;
}

/** Intake's format: the full ISO timestamp of when the record was created. */
async function backfillMoveInDate(guestId: string, createTimeMs: number): Promise<void> {
  const ref = guestCollection.doc(guestId);
  await ratsFirestore.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    if (!snap.exists || snap.data()?.moveInDate) return;
    txn.update(ref, { moveInDate: new Date(createTimeMs).toISOString() });
  });
}

async function houseLocalDate(houseId: string, at: Date): Promise<string> {
  const snap = await houseCollection.doc(houseId).get();
  return localDateString(at, resolveTimeZone(snap.data()?.timezone).timeZone);
}

export async function rentOnGuestWrite(e: GuestRentEvent): Promise<'none' | ChargeOutcome> {
  const { guestId, before, after } = e;
  if (!after || !isActiveGuestDoc(after)) return 'none';
  const houseId = typeof after.houseId === 'string' ? after.houseId : '';
  const isCreate = !before;
  const moved =
    !!before &&
    typeof before.houseId === 'string' &&
    before.houseId !== '' &&
    before.houseId !== houseId;
  const reactivated = !!before && !isActiveGuestDoc(before);
  if (!isCreate && !moved && !reactivated) return 'none';

  if (isCreate) {
    // Before the backfill, so a linked intake record's moveInDate wins over createTime.
    await linkIntakeRecord(guestId, after);
    if (!after.moveInDate && typeof e.afterCreateTimeMs === 'number') {
      await backfillMoveInDate(guestId, e.afterCreateTimeMs);
    }
  } else if (houseId) {
    const at = new Date(e.eventTime);
    const day = await houseLocalDate(houseId, at);
    await rentAccountCollection.doc(guestId).set(
      moved
        ? {
            guestId,
            houseId,
            houseJoinedAtMs: at.getTime(),
            joinedOn: day,
            reactivatedOn: reactivated ? day : null,
          }
        : { guestId, reactivatedOn: day },
      { merge: true },
    );
  }
  return chargeResident(guestId, e.now ?? new Date());
}
