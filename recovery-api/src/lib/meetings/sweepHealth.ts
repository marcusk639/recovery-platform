import type { DirectoryProvider } from '../../entities/DirectoryMeeting';
import type { IngestSourceName, SourceResult } from './ingest';

/**
 * Decides which providers the stale prune may touch.
 *
 * A row missing from a sweep only means "gone from the source" if the source
 * actually answered for the whole grid. Otherwise an outage reads as every row
 * having disappeared: Meeting Guide returning 401 would delete every AA row.
 */

export interface SourceTally {
  attempted: number;
  failed: number;
  records: number;
}

export type SweepTally = Partial<Record<IngestSourceName, SourceTally>>;

/**
 * Providers with a live source. NA and CUSTOM are deliberately absent: nothing
 * re-sees them, so they can never be judged stale.
 */
const SOURCE_PROVIDERS: Record<IngestSourceName, DirectoryProvider> = {
  AA: 'AA',
  CelebrateRecovery: 'CELEBRATE_RECOVERY',
};

/** Tolerates scattered per-cell errors without treating an outage as healthy. */
export const MAX_SOURCE_FAILURE_RATE = 0.05;

export function addCellToTally(tally: SweepTally, results: SourceResult[]): SweepTally {
  const next: SweepTally = { ...tally };
  for (const { source, ok, records } of results) {
    const current = next[source] ?? { attempted: 0, failed: 0, records: 0 };
    next[source] = {
      attempted: current.attempted + 1,
      failed: current.failed + (ok ? 0 : 1),
      records: current.records + records,
    };
  }
  return next;
}

export function providersSafeToPrune(tally: SweepTally, totalCells: number): DirectoryProvider[] {
  const sources = Object.keys(SOURCE_PROVIDERS) as IngestSourceName[];
  return sources
    .filter((source) => {
      const result = tally[source];
      if (!result || result.attempted < totalCells) return false;
      if (result.records === 0) return false;
      return result.failed / result.attempted <= MAX_SOURCE_FAILURE_RATE;
    })
    .map((source) => SOURCE_PROVIDERS[source]);
}
