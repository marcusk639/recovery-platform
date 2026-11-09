import type { DirectoryMeeting } from '../../entities/DirectoryMeeting';
import type { RegionSweep } from './naSweep';

/**
 * The rules for removing an NA listing. A wrong call here takes a meeting away from
 * someone looking for one, so a row goes only if its region answered in full and
 * isn't losing an unusual share of its rows, or a person named the region.
 */

/** Normal turnover is small. A bigger drop waits for a person to name the region. */
export const MAX_REGION_DELETE_FRACTION = 0.1;
/** Lets a small region lose a few rows, where 10% would round down to nothing. */
export const MIN_REGION_DELETE_ALLOWANCE = 5;

export interface NaReconcileResult {
  created: number;
  updated: number;
  /** Same listing, confirmed by a newer import. */
  redated: number;
  deleted: number;
  unchanged: number;
  unmappable: number;
  excludedService: number;
  collapsedDuplicates: number;
  skippedAppOwned: number;
  /** Missing rows kept because their region failed a check or wasn't swept. */
  keptUnhealthy: number;
  /** NA rows with no `sourceRegion`, which this sync doesn't own. */
  legacyRows: number;
  blockedRegions: string[];
}

type Doc = FirebaseFirestore.QueryDocumentSnapshot;

/** Decides which rows missing from the sweep may go, one region at a time. */
export function chooseDeletes(
  existing: readonly Doc[],
  wanted: ReadonlyMap<string, unknown>,
  sweeps: readonly RegionSweep[],
  allowDeletes: readonly string[],
  result: NaReconcileResult,
): Doc[] {
  const sweepByRegion = new Map(sweeps.map((s) => [String(s.region.sourceId), s]));
  const countInRegion = new Map<string, number>();
  const missingByRegion = new Map<string, Doc[]>();

  for (const doc of existing) {
    const region = (doc.data() as Partial<DirectoryMeeting>).sourceRegion;
    const isMissing = !wanted.has(doc.id);
    if (!region) {
      if (isMissing) result.legacyRows++;
      continue;
    }
    countInRegion.set(region, (countInRegion.get(region) ?? 0) + 1);
    if (isMissing) missingByRegion.set(region, [...(missingByRegion.get(region) ?? []), doc]);
  }

  const deletes: Doc[] = [];
  for (const [region, missing] of missingByRegion) {
    const sweep = sweepByRegion.get(region);
    const named = allowDeletes.includes(region);
    const allowance = Math.max(
      MIN_REGION_DELETE_ALLOWANCE,
      Math.floor((countInRegion.get(region) ?? 0) * MAX_REGION_DELETE_FRACTION),
    );

    if (sweep?.problem || (!sweep && !named)) {
      result.keptUnhealthy += missing.length;
    } else if (!named && missing.length > allowance) {
      result.blockedRegions.push(region);
      console.error('syncNa: region delete blocked', {
        region,
        missing: missing.length,
        existing: countInRegion.get(region),
      });
    } else {
      deletes.push(...missing);
    }
  }
  return deletes;
}
