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
  rentHouseStateCollection,
} from '../api/firestore';
import { isActiveGuestDoc, isPlausibleUid } from '../util/guestMembership';
import { addCents, asCents, Cents, formatCents } from '../util/money';
import { sendNotification } from '../util/notifications';
import { anchorFor } from './anchor';
import { planCharges } from './chargeRule';
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
    // increment replaces a field that isn't a number, which would erase a legacy
    // balance such as "350". createPaymentIntent refuses these too; a manager fixes it.
    const owedNow = guest.rentOwed;
    if (owedNow !== undefined && owedNow !== null && !(typeof owedNow === 'number' && Number.isFinite(owedNow))) {
      logger.error('chargeResident: rentOwed is not a number; not charged', {
        guestId,
        houseId: str(guest.houseId),
        type: typeof owedNow,
      });
      return skipped('bad-balance');
    }
    const houseId = str(guest.houseId);
    if (!houseId) return skipped('charging-off');

    const houseSnap = await txn.get(houseCollection.doc(houseId));
    const stateSnap = await txn.get(rentHouseStateCollection.doc(houseId));
    const settings = houseSnap.exists
      ? rentSettingsOf((houseSnap.data() ?? {}) as Data, stateSnap.data() as Data | undefined)
      : null;
    if (!settings) return skipped('charging-off');
    const { startDate, startedAtMs, timeZone, frequency } = settings;
    if (startDate === null || startedAtMs === null) return skipped('not-started');

    const accountRef = rentAccountCollection.doc(guestId);
    const accountSnap = await txn.get(accountRef);
    const account = accountSnap.exists ? (accountSnap.data() as Partial<RentAccount>) : null;

    const today = localDateString(now, timeZone);
    const { houseJoinedAtMs, joinedOn, reactivatedOn, chargeFrom, changed } = anchorFor({
      account,
      guest,
      houseId,
      createdMs: guestSnap.createTime?.toMillis() ?? now.getTime(),
      startDate,
      startedAtMs,
      timeZone,
      frequency,
      now,
    });

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
      if (changed) txn.set(accountRef, nextAccount, { merge: true });
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
      { ...nextAccount, chargedThrough: plan[plan.length - 1].through, chargedHouseId: houseId },
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
