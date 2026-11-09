import type { SweepCell } from './meetingSweep';
import { pruneStale, type PruneResult } from './pruneStale';
import { usBaseCells } from './usLandCells';

export const DAY_MS = 86_400_000;

/** Well inside the prune horizon, so a late or skipped run can't cost a live meeting. */
export const RESTAMP_AFTER_DAYS = 14;

function cellContains(cell: SweepCell, lat: number, lng: number): boolean {
  return lat >= cell.s && lat <= cell.n && lng >= cell.w && lng <= cell.e;
}

/**
 * Deletes only meetings two healthy sweeps in a row have missed. A single sweep isn't
 * enough: the API can hide a meeting, and sweeps run by hand can be further apart than
 * the horizon, which would make one miss fatal.
 *
 * A meeting the previous sweep saw was stamped no more than RESTAMP_AFTER_DAYS before
 * that sweep began, so an older stamp proves that sweep missed it too. Dry runs and
 * unhealthy sweeps don't count, because they don't stamp every meeting they could see.
 */
export async function pruneAfterHealthySweep(
  db: FirebaseFirestore.Firestore,
  unresolvedSpots: readonly SweepCell[],
  sweepStartedAt: number,
  now: () => Date,
): Promise<PruneResult | undefined> {
  const state = db.collection('script_progress').doc('meetingSync');
  const previous = (await state.get()).data()?.lastHealthySweepStartedAt as number | undefined;

  let prune: PruneResult | undefined;
  if (previous !== undefined) {
    const covered = usBaseCells();
    // A row outside the sweep's area, or at a spot it couldn't fully read, can't be re-seen.
    prune = await pruneStale(
      { db, now },
      ['AA'],
      previous - RESTAMP_AFTER_DAYS * DAY_MS,
      ({ lat, lng } = {}) =>
        typeof lat === 'number' &&
        typeof lng === 'number' &&
        covered.some((cell) => cellContains(cell, lat, lng)) &&
        !unresolvedSpots.some((spot) => cellContains(spot, lat, lng)),
    );
  }
  await state.set({ lastHealthySweepStartedAt: sweepStartedAt });
  return prune;
}
