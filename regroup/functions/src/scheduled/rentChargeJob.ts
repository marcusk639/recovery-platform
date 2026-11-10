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
import { rentSettingsOf } from '../rent/rate';
import { isActiveGuestDoc } from '../util/guestMembership';

/**
 * A record with no account created or changed this recently belongs to the guest-write
 * trigger: it links an intake record first, and records a move-in's time.
 */
const NEW_RECORD_GRACE_MS = 60 * 60 * 1000;

type Data = Record<string, unknown>;
interface Counts {
  houses: number;
  charged: number;
  skipped: number;
  failed: number;
}

export async function runRentCharges(now: Date = new Date()): Promise<Counts> {
  const counts: Counts = { houses: 0, charged: 0, skipped: 0, failed: 0 };
  const config = await rentConfigRef().get();
  if (config.exists && config.data()?.paused === true) {
    logger.warn('rentCharges: paused by config/rentCharges');
    return counts;
  }

  const houses = await houseCollection.where('rentFrequency', 'in', ['weekly', 'monthly']).get();
  for (const houseDoc of houses.docs) {
    const state = await rentHouseStateCollection.doc(houseDoc.id).get();
    const settings = rentSettingsOf(
      (houseDoc.data() ?? {}) as Data,
      state.data() as Data | undefined,
    );
    if (!settings || settings.startDate === null || settings.startedAtMs === null) continue;
    counts.houses++;
    const today = localDateString(now, settings.timeZone);

    const guests = await guestCollection.where('houseId', '==', houseDoc.id).get();
    const active = guests.docs.filter((d) => isActiveGuestDoc((d.data() ?? {}) as Data));
    if (active.length === 0) continue;
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
      try {
        const outcome = await chargeResident(guestDoc.id, now);
        if (outcome.status === 'charged') counts.charged++;
        else counts.skipped++;
      } catch (err) {
        counts.failed++;
        logger.error('rentCharges: resident failed', {
          guestId: guestDoc.id,
          houseId: houseDoc.id,
          error: (err as Error).message,
        });
      }
    }
  }
  logger.info('rentCharges: done', { ...counts });
  return counts;
}

export const rentCharges = onSchedule({ schedule: '5 * * * *', timeZone: 'UTC' }, async () => {
  await runRentCharges();
});
