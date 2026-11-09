import type { DirectoryProvider } from '../entities/DirectoryMeeting';
import { gridCells, ingestGridCell, type GridCell } from '../lib/meetings/ingest';
import { pruneStale, type PruneResult } from '../lib/meetings/pruneStale';
import { addCellToTally, providersSafeToPrune, type SweepTally } from '../lib/meetings/sweepHealth';

/**
 * Sliced sweep of the grid + stale prune for the shared meeting directory
 * (`directoryMeetings`).
 *
 * NOT SCHEDULED, and not exported from index.ts. By owner decision (2026-11-08) no
 * scheduled job updates meetings: sync runs manually through scripts until further
 * notice, and noScheduledJobs.test.ts enforces it.
 *
 * Each call processes one bounded slice of the grid. A resumable cursor doc tracks
 * where the next slice begins and WRAPS to 0 at the end of the grid.
 *
 * Slicing + cursor patterns mirror the resumable-cursor approach already used by
 * the ingestion layer (lib/meetings/ingest.ts) — one geohash/identity recipe, no
 * second hash.
 */

/** Firestore collection holding the single refresh cursor doc. */
export const REFRESH_STATE_COLLECTION = 'refreshState';
/** Document id of the directory-refresh cursor. */
export const REFRESH_STATE_DOC_ID = 'directory';

/** How many slices it takes to cover the whole grid once. */
export const REFRESH_CYCLE_RUNS = 7;

/**
 * Stop starting new cells here and save the cursor. A slower run covers fewer
 * cells and the next run resumes from them.
 */
export const RUN_BUDGET_MS = 480_000;

/** Save progress this often so a run killed mid-slice keeps most of its work. */
export const CHECKPOINT_EVERY_CELLS = 25;

/** Persisted shape of the refresh cursor doc. */
export interface RefreshState {
  /** Index into the flattened grid where the NEXT run should begin. */
  cursor: number;
  /** Per-source results for the sweep in progress; decides what may be pruned. */
  sweep?: SweepTally;
  /** When the sweep in progress began at the first cell (epoch ms). */
  sweepStartedAt?: number;
}

export interface RefreshDeps {
  db: FirebaseFirestore.Firestore;
  fetchFn?: typeof fetch;
  /** Injected clock for deterministic tests. Defaults to real time. */
  now?: () => Date;
}

export interface RefreshSliceResult {
  /** Cursor index this run started from. */
  startCursor: number;
  /** Cursor index persisted for the next run (wrapped to 0 at grid end). */
  nextCursor: number;
  /** Number of cells processed this run. */
  cellsProcessed: number;
  /** Total cells in the full grid. */
  totalCells: number;
  /** True when this slice consumed the final cells of the grid (wrap occurred). */
  cycleCompleted: boolean;
  /** True when the time budget ended the run before the slice finished. */
  stoppedEarly: boolean;
  /** Per-source results so far; the tally that closed the cycle if it closed. */
  sweep: SweepTally;
  /** Set when the cycle closed: which providers were pruned and how many rows. */
  prune?: PruneResult & { providers: DirectoryProvider[] };
}

/**
 * Pure slicing math: how many cells to process per run so that REFRESH_CYCLE_RUNS
 * runs cover every cell of the grid exactly once before wrapping.
 *
 *   cellsPerRun = ceil(totalCells / cycleRuns)
 *
 * Using ceil guarantees full coverage within `cycleRuns` runs (the last slice may
 * be short when totalCells isn't divisible by cycleRuns). With cellsPerRun chosen
 * this way, run k processes [k*cellsPerRun, (k+1)*cellsPerRun); after at most
 * cycleRuns runs the cursor reaches/exceeds totalCells and wraps to 0.
 */
export function cellsPerRun(totalCells: number, cycleRuns: number): number {
  if (totalCells <= 0) return 0;
  if (cycleRuns <= 0) return totalCells;
  return Math.ceil(totalCells / cycleRuns);
}

/**
 * Pure cursor advance: given a start cursor, slice size, and total cell count,
 * compute the [start, end) window (clamped to the grid) and the next cursor,
 * wrapping to 0 once the end of the grid is reached.
 */
export function computeSlice(
  startCursor: number,
  perRun: number,
  totalCells: number,
): { start: number; end: number; nextCursor: number; cycleCompleted: boolean } {
  if (totalCells <= 0) {
    return { start: 0, end: 0, nextCursor: 0, cycleCompleted: false };
  }
  // Defensive: a cursor at/over the grid end (or negative) restarts at 0.
  const start = startCursor >= 0 && startCursor < totalCells ? startCursor : 0;
  const end = Math.min(start + Math.max(perRun, 0), totalCells);
  const cycleCompleted = end >= totalCells;
  const nextCursor = cycleCompleted ? 0 : end;
  return { start, end, nextCursor, cycleCompleted };
}

/** Read the persisted state, defaulting to the grid start when absent/malformed. */
async function readState(database: FirebaseFirestore.Firestore): Promise<RefreshState> {
  const snap = await database.collection(REFRESH_STATE_COLLECTION).doc(REFRESH_STATE_DOC_ID).get();
  if (!snap.exists) return { cursor: 0, sweep: {} };
  const data = snap.data() as Partial<RefreshState> | undefined;
  const cursor = data?.cursor;
  return {
    cursor: typeof cursor === 'number' && cursor >= 0 ? cursor : 0,
    sweep: data?.sweep ?? {},
    ...(typeof data?.sweepStartedAt === 'number' ? { sweepStartedAt: data.sweepStartedAt } : {}),
  };
}

/** Persist the cursor and tally together so they can never disagree. */
async function writeState(
  database: FirebaseFirestore.Firestore,
  state: RefreshState,
): Promise<void> {
  await database.collection(REFRESH_STATE_COLLECTION).doc(REFRESH_STATE_DOC_ID).set(state);
}

/**
 * Process one bounded slice of the grid: read the cursor, ingest each cell in the
 * slice (re-stamping lastSeenAt/lastRefreshedAt via ingestGridCell), advance and
 * persist the cursor (wrapping at grid end). At the end of a FULL cycle it also
 * prunes the providers whose source answered for the whole sweep.
 *
 * Pure with respect to its deps — db, fetchFn, and the clock are all injected, so
 * tests run with zero real Firestore/network.
 */
export async function refreshSlice(deps: RefreshDeps): Promise<RefreshSliceResult> {
  const { db: database, fetchFn } = deps;
  const clock = deps.now ?? (() => new Date());

  const allCells: GridCell[] = [...gridCells()];
  const totalCells = allCells.length;
  const perRun = cellsPerRun(totalCells, REFRESH_CYCLE_RUNS);

  const saved = await readState(database);
  const { start, end, nextCursor, cycleCompleted } = computeSlice(saved.cursor, perRun, totalCells);

  const startedAt = clock().getTime();
  let sweep: SweepTally = start === 0 ? {} : (saved.sweep ?? {});
  // Only a sweep that began at the first cell knows when it started.
  const sweepStartedAt = start === 0 ? startedAt : saved.sweepStartedAt;
  const startField = sweepStartedAt === undefined ? {} : { sweepStartedAt };
  let reached = start;

  while (reached < end && clock().getTime() - startedAt < RUN_BUDGET_MS) {
    const { lat, lng } = allCells[reached];
    const { sourceResults } = await ingestGridCell(lat, lng, { db: database, fetchFn });
    sweep = addCellToTally(sweep, sourceResults);
    reached++;
    if ((reached - start) % CHECKPOINT_EVERY_CELLS === 0 && reached < end) {
      await writeState(database, { cursor: reached, sweep, ...startField });
    }
  }

  const finished = reached === end;
  const closedCycle = finished && cycleCompleted;

  // Cursor advances past EVERY cell in this slice unconditionally — including any
  // cell where one source fetcher failed (ingestGridCell now returns a non-zero
  // fetchErrors but still upserts the healthy source rather than throwing). This
  // is an INTENTIONAL design choice: we do NOT retry/re-pin a partially-failed
  // cell. A transient source outage self-heals on the NEXT full sweep, and the
  // stale-prune horizon (STALE_PRUNE_DAYS) plus lastSeenAt re-stamping eventually
  // reconcile any rows missed during the outage. Pinning the cursor on partial
  // failures would risk stalling the whole grid behind one flaky source.
  const cursorAfterRun = finished ? nextCursor : reached;
  await writeState(
    database,
    closedCycle
      ? { cursor: cursorAfterRun, sweep: {} }
      : { cursor: cursorAfterRun, sweep, ...startField },
  );

  const result: RefreshSliceResult = {
    startCursor: start,
    nextCursor: cursorAfterRun,
    cellsProcessed: reached - start,
    totalCells,
    cycleCompleted: closedCycle,
    stoppedEarly: !finished,
    sweep,
  };

  if (closedCycle) {
    const providers = sweepStartedAt === undefined ? [] : providersSafeToPrune(sweep, totalCells);
    result.prune = { providers, ...(await pruneStale(deps, providers, sweepStartedAt)) };
  }

  return result;
}
