/**
 * Records the day a house turns rent charging on (rentChargesStartDate, house-local)
 * and clears it when charging turns off, so no resident is ever charged for a day
 * before charging began or while it was off. Decides from the current house doc,
 * not the event, so redelivered or out-of-order events converge.
 */
import { logger } from 'firebase-functions/v2';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { localDateString } from '../../activities/weekSummaryMath';
import { houseCollection, ratsFirestore } from '../../api/firestore';
import { rentSettingsOf } from '../../rent/rate';

type Data = Record<string, unknown>;

const WATCHED = [
  'rentFrequency',
  'monthlyRent',
  'weeklyRent',
  'timezone',
  'rentChargesStartDate',
  'rentChargesStartedAtMs',
] as const;

export async function syncRentChargeStart(
  houseId: string,
  now: Date,
): Promise<'stamped' | 'cleared' | 'unchanged'> {
  const ref = houseCollection.doc(houseId);
  return ratsFirestore.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    if (!snap.exists) return 'unchanged';
    const house = (snap.data() ?? {}) as Data;
    const settings = rentSettingsOf(house);
    const stamped = !!house.rentChargesStartDate;
    if (settings && !stamped) {
      txn.update(ref, {
        rentChargesStartDate: localDateString(now, settings.timeZone),
        rentChargesStartedAtMs: now.getTime(),
      });
      return 'stamped';
    }
    if (!settings && (stamped || house.rentChargesStartedAtMs != null)) {
      txn.update(ref, { rentChargesStartDate: null, rentChargesStartedAtMs: null });
      return 'cleared';
    }
    return 'unchanged';
  });
}

function rentFieldsChanged(before: Data | undefined, after: Data): boolean {
  return WATCHED.some((k) => JSON.stringify(before?.[k]) !== JSON.stringify(after[k]));
}

export const onHouseRentSettingsWrite = onDocumentWritten(
  { document: 'houses/{houseId}', retry: true },
  async (event) => {
    const after = event.data?.after?.exists ? (event.data.after.data() as Data) : undefined;
    if (!after) return;
    const before = event.data?.before?.exists ? (event.data.before.data() as Data) : undefined;
    if (!rentFieldsChanged(before, after)) return;
    const houseId = event.params.houseId;
    const result = await syncRentChargeStart(houseId, new Date());
    if (result !== 'unchanged') logger.info('rent charging start', { houseId, result });
  },
);
