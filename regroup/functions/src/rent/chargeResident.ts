/**
 * The one place rent is added to a balance. Every path (joining, the hourly job,
 * catch-up) calls chargeResident. The charge records, the rentAccounts update and
 * the rentOwed increment commit in one transaction, and charge ids are
 * `${guestId}_${from}`, so a retry or a concurrent call can never charge a day twice.
 */
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { localDateString } from '../activities/weekSummaryMath';
import {
  guestCollection,
  houseCollection,
  ratsFirestore,
  rentAccountCollection,
  rentChargeCollection,
  rentConfigRef,
} from '../api/firestore';
import { isActiveGuestDoc, isPlausibleUid } from '../util/guestMembership';
import { addCents, asCents, Cents, formatCents } from '../util/money';
import { sendNotification } from '../util/notifications';
import { chargeFromFor, planCharges } from './chargeRule';
import { maxDate, toLocalDate } from './period';
import { rentSettingsOf, residentRate } from './rate';
import { ChargeOutcome, RentAccount } from './types';

type Skip = Extract<ChargeOutcome, { status: 'skipped' }>['reason'];
type Data = Record<string, unknown>;

const skipped = (reason: Skip): ChargeOutcome => ({ status: 'skipped', reason });

export function chargeDocId(guestId: string, from: string): string {
  return `${guestId}_${from}`;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

/** Charges every period due by `now` (house-local), oldest first. Safe to call any time. */
export async function chargeResident(guestId: string, now: Date): Promise<ChargeOutcome> {
  const config = await rentConfigRef().get();
  if (config.exists && config.data()?.paused === true) return skipped('paused');

  let notifyUid: string | null = null;
  const outcome = await ratsFirestore.runTransaction(async (txn) => {
    notifyUid = null;
    const guestRef = guestCollection.doc(guestId);
    const guestSnap = await txn.get(guestRef);
    if (!guestSnap.exists) return skipped('missing');
    const guest = (guestSnap.data() ?? {}) as Data;
    if (!isActiveGuestDoc(guest)) return skipped('inactive');
    if (str(guest.rentLinkedTo)) return skipped('linked');
    const houseId = str(guest.houseId);
    if (!houseId) return skipped('charging-off');

    const houseSnap = await txn.get(houseCollection.doc(houseId));
    const settings = houseSnap.exists ? rentSettingsOf((houseSnap.data() ?? {}) as Data) : null;
    if (!settings) return skipped('charging-off');
    const { startDate, startedAtMs, timeZone, frequency } = settings;
    if (startDate === null || startedAtMs === null) return skipped('not-started');

    const accountRef = rentAccountCollection.doc(guestId);
    const accountSnap = await txn.get(accountRef);
    const account = accountSnap.exists ? (accountSnap.data() as Partial<RentAccount>) : null;

    const createdMs = guestSnap.createTime?.toMillis() ?? now.getTime();
    const today = localDateString(now, timeZone);
    // The guest-write trigger records moves and returns outside this transaction, so
    // the hourly job can get here first. A move it hasn't recorded is a join today;
    // a return it hasn't recorded (departed after the last re-activation) starts
    // today. Neither is ever back-charged for the time before.
    const unrecordedMove = !!str(account?.houseId) && account?.houseId !== houseId;
    const away = str(account?.inactiveSince);
    const back = str(account?.reactivatedOn);
    const reactivatedOn = away && !(back && back >= away) ? today : back;
    let houseJoinedAtMs: number;
    let joinedOn: string | null;
    let chargeFrom: string;
    const anchor =
      !account || unrecordedMove || account.anchoredTo !== startDate || !str(account.chargeFrom);
    if (unrecordedMove) {
      houseJoinedAtMs = now.getTime();
      joinedOn = today;
      chargeFrom = chargeFromFor({
        startDate,
        startedAtMs,
        houseJoinedAtMs,
        joinDate: joinedOn,
        importedOn: null,
        frequency,
      });
    } else if (anchor) {
      houseJoinedAtMs =
        account?.houseId === houseId && typeof account.houseJoinedAtMs === 'number'
          ? account.houseJoinedAtMs
          : createdMs;
      joinedOn =
        str(account?.joinedOn) ??
        toLocalDate(guest.moveInDate, timeZone) ??
        localDateString(new Date(createdMs), timeZone);
      chargeFrom = chargeFromFor({
        startDate,
        startedAtMs,
        houseJoinedAtMs,
        joinDate: joinedOn,
        importedOn: toLocalDate(guest.importedAt, timeZone),
        frequency,
      });
    } else {
      houseJoinedAtMs =
        typeof account.houseJoinedAtMs === 'number' ? account.houseJoinedAtMs : createdMs;
      joinedOn = str(account.joinedOn);
      chargeFrom = account.chargeFrom as string;
    }
    chargeFrom = maxDate(chargeFrom, reactivatedOn, joinedOn);

    const rate = residentRate(guest, settings);
    if (!rate) {
      logger.warn('rent: custom rate above the limit; resident not charged', { guestId, houseId });
      return skipped('bad-rate');
    }
    const { rateCents, source } = rate;
    const plan = planCharges({
      chargeFrom,
      chargedThrough: str(account?.chargedThrough),
      today,
      frequency,
      rateCents,
    });

    const nextAccount: RentAccount = {
      guestId,
      houseId,
      houseJoinedAtMs,
      joinedOn,
      reactivatedOn,
      anchoredTo: startDate,
      chargeFrom,
      chargedThrough: str(account?.chargedThrough),
      updatedAtMs: now.getTime(),
    };
    if (plan.length === 0) {
      if (anchor || reactivatedOn !== back) txn.set(accountRef, nextAccount, { merge: true });
      return skipped('not-due');
    }

    const userId = isPlausibleUid(guest.userId) ? guest.userId : null;
    for (const c of plan) {
      txn.create(rentChargeCollection.doc(chargeDocId(guestId, c.from)), {
        guestId,
        houseId,
        guestUserId: userId,
        from: c.from,
        through: c.through,
        daysCovered: c.daysCovered,
        daysInPeriod: c.daysInPeriod,
        amountCents: c.amountCents,
        rateCents,
        rateSource: source,
        frequency,
        createdAtMs: now.getTime(),
      });
    }
    txn.set(
      accountRef,
      { ...nextAccount, chargedThrough: plan[plan.length - 1].through },
      { merge: true },
    );

    const total: Cents = addCents(...plan.map((c) => c.amountCents));
    if (total > 0) {
      const owedBefore = typeof guest.rentOwed === 'number' ? guest.rentOwed : 0;
      txn.update(guestRef, {
        rentOwed: FieldValue.increment(total),
        ...(owedBefore <= 0 ? { rentDueDate: plan[0].from } : {}),
      });
      notifyUid = userId;
    }
    return { status: 'charged', totalCents: total, periods: plan.length } as ChargeOutcome;
  });

  if (outcome.status === 'charged') {
    logger.info('rent charged', { guestId, periods: outcome.periods });
    if (notifyUid) {
      try {
        await sendNotification({
          recipientId: notifyUid,
          title: 'Rent added',
          body: `${formatCents(asCents(outcome.totalCents))} was added to your balance.`,
        });
      } catch (err) {
        logger.warn('rent notification failed', { guestId, error: (err as Error).message });
      }
    }
  }
  return outcome;
}
