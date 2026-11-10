/**
 * The hourly rent job. Every hour it charges each active resident of every house with
 * charging on whose next chargeable day has come, on the house's own local date, so
 * any timezone (an empty one reads as New York) is charged within an hour of its
 * local midnight with no zone list. Missed periods catch up through chargeResident.
 */
import { logger } from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { localDateString } from '../activities/weekSummaryMath';
import {
  guestCollection,
  houseCollection,
  ratsFirestore,
  rentAccountCollection,
  rentConfigRef,
  rentHouseStateCollection,
} from '../api/firestore';
import { chargeResident } from '../rent/chargeResident';
import { nextChargeDay } from '../rent/chargeRule';
import { linkIntakeRecord } from '../rent/linkIntakeRecord';
import { rentSettingsOf } from '../rent/rate';
import { isActiveGuestDoc } from '../util/guestMembership';

/**
 * A record with no account created or changed this recently belongs to the guest-write
 * trigger: it links an intake record first, and records a move-in's time.
 */
const NEW_RECORD_GRACE_MS = 60 * 60 * 1000;
/** Stop well inside the 540s timeout, so a long run still logs its counts. */
const DEFAULT_BUDGET_MS = 480 * 1000;

type Data = Record<string, unknown>;
interface Counts {
  houses: number;
  charged: number;
  skipped: number;
  failed: number;
}

export async function runRentCharges(
  now: Date = new Date(),
  opts: { budgetMs?: number; clock?: () => number } = {},
): Promise<Counts> {
  const { budgetMs = DEFAULT_BUDGET_MS, clock = Date.now } = opts;
  const startedAt = clock();
  const counts: Counts = { houses: 0, charged: 0, skipped: 0, failed: 0 };
  const config = await rentConfigRef().get();
  if (config.exists && config.data()?.paused === true) {
    logger.warn('rentCharges: paused by config/rentCharges');
    return counts;
  }

  const houses = await houseCollection.where('rentFrequency', 'in', ['weekly', 'monthly']).get();
  for (const houseDoc of houses.docs) {
    try {
      if (!(await chargeHouse(houseDoc, now, counts, () => clock() - startedAt > budgetMs))) {
        // Charging is idempotent, so the next hourly run picks up where this stopped.
        logger.warn('rentCharges: stopped at the time budget; the next run carries on', {
          ...counts,
        });
        return counts;
      }
    } catch (err) {
      counts.failed++;
      logger.error('rentCharges: house failed', { houseId: houseDoc.id, error: err });
    }
  }
  logger.info('rentCharges: done', { ...counts });
  return counts;
}

/** Charges one house's due residents. Returns false when the time budget ran out. */
async function chargeHouse(
  houseDoc: FirebaseFirestore.QueryDocumentSnapshot,
  now: Date,
  counts: Counts,
  outOfTime: () => boolean,
): Promise<boolean> {
  const state = await rentHouseStateCollection.doc(houseDoc.id).get();
  const settings = rentSettingsOf(
    (houseDoc.data() ?? {}) as Data,
    state.data() as Data | undefined,
  );
  if (!settings || settings.startDate === null || settings.startedAtMs === null) return true;
  counts.houses++;
  const today = localDateString(now, settings.timeZone);

  const guests = await guestCollection.where('houseId', '==', houseDoc.id).get();
  // A linked intake record is never charged; chargeResident would only skip it.
  const active = guests.docs.filter((d) => {
    const g = (d.data() ?? {}) as Data;
    return isActiveGuestDoc(g) && !g.rentLinkedTo;
  });
  if (active.length === 0) return true;
  const accounts = await ratsFirestore.getAll(
    ...active.map((d) => rentAccountCollection.doc(d.id)),
  );

  for (let i = 0; i < active.length; i++) {
    const guestDoc = active[i];
    const acct = accounts[i].exists ? ((accounts[i].data() ?? {}) as Data) : null;
    const due = acct
      ? acct.anchoredTo !== settings.startDate ||
        typeof acct.chargeFrom !== 'string' ||
        nextChargeDay({
          chargeFrom: acct.chargeFrom,
          chargedThrough: typeof acct.chargedThrough === 'string' ? acct.chargedThrough : null,
        }) <= today
      : Math.max(
          guestDoc.createTime?.toMillis() ?? now.getTime(),
          guestDoc.updateTime?.toMillis() ?? 0,
        ) <
        now.getTime() - NEW_RECORD_GRACE_MS;
    if (!due) continue;
    if (outOfTime()) return false;
    try {
      // A record with no account may be half of a pair its own trigger never linked
      // (the trigger failed or came late). Link first, as the trigger does, so days an
      // intake record was already charged for are never charged again on this one.
      if (!acct) await linkIntakeRecord(guestDoc.id, (guestDoc.data() ?? {}) as Data);
      const outcome = await chargeResident(guestDoc.id, now);
      if (outcome.status === 'charged') counts.charged++;
      else counts.skipped++;
    } catch (err) {
      counts.failed++;
      logger.error('rentCharges: resident failed', {
        guestId: guestDoc.id,
        houseId: houseDoc.id,
        error: err,
      });
    }
  }
  return true;
}

export const rentCharges = onSchedule(
  // A Monday midnight or a month start charges every resident at once, one at a time.
  { schedule: '5 * * * *', timeZone: 'UTC', timeoutSeconds: 540 },
  async () => {
    await runRentCharges();
  },
);
