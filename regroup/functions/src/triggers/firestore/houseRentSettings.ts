/**
 * Records the day a house turns rent charging on (rentHouseStates/{houseId}, house-local)
 * and clears it when charging turns off, so no resident is ever charged for a day
 * before charging began or while it was off. Decides from the current house doc,
 * not the event, so redelivered or out-of-order events converge.
 */
import { logger } from 'firebase-functions/v2';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { localDateString } from '../../activities/weekSummaryMath';
import { houseCollection, ratsFirestore, rentHouseStateCollection } from '../../api/firestore';
import { rentSettingsOf } from '../../rent/rate';

type Data = Record<string, unknown>;

const WATCHED = ['rentFrequency', 'monthlyRent', 'weeklyRent', 'timezone', 'houseType'] as const;

/**
 * The stamp lives in rentHouseStates/{houseId}, not on the house doc: the app writes
 * whole house objects back from memory, and a server-owned field there that changed
 * since the app loaded it would make those writes fail the rules.
 */
export async function syncRentChargeStart(
  houseId: string,
  now: Date,
): Promise<'stamped' | 'cleared' | 'unchanged'> {
  const houseRef = houseCollection.doc(houseId);
  const stateRef = rentHouseStateCollection.doc(houseId);
  return ratsFirestore.runTransaction(async (txn) => {
    const snap = await txn.get(houseRef);
    const stateSnap = await txn.get(stateRef);
    if (!snap.exists) return 'unchanged';
    const settings = rentSettingsOf((snap.data() ?? {}) as Data);
    const state = (stateSnap.data() ?? {}) as Data;
    const stamped =
      !!state.startDate || (state.startedAtMs !== null && state.startedAtMs !== undefined);
    if (settings && !state.startDate) {
      txn.set(stateRef, {
        startDate: localDateString(now, settings.timeZone),
        startedAtMs: now.getTime(),
        updatedAtMs: now.getTime(),
      });
      return 'stamped';
    }
    if (!settings && stamped) {
      txn.set(stateRef, { startDate: null, startedAtMs: null, updatedAtMs: now.getTime() });
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
    // The time of the change, not of a retry, so a resident who joined in between
    // still counts as a new joiner.
    const changedAt = Date.parse(event.time ?? '');
    const at = Number.isFinite(changedAt) ? new Date(changedAt) : new Date();
    const result = await syncRentChargeStart(houseId, at);
    if (result !== 'unchanged') logger.info('rent charging start', { houseId, result });
  },
);
