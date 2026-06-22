"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshDirectory = exports.STALE_PRUNE_DAYS = exports.REFRESH_CYCLE_RUNS = exports.REFRESH_STATE_DOC_ID = exports.REFRESH_STATE_COLLECTION = void 0;
exports.cellsPerRun = cellsPerRun;
exports.computeSlice = computeSlice;
exports.refreshSlice = refreshSlice;
exports.pruneStale = pruneStale;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const v2_1 = require("firebase-functions/v2");
const firestore_1 = require("firebase-admin/firestore");
const firebase_1 = require("../lib/firebase");
const ingest_1 = require("../lib/meetings/ingest");
/**
 * Scheduled directory refresh + stale prune for the shared meeting directory
 * (`directoryMeetings`).
 *
 * The refresh runs NIGHTLY but processes only a BOUNDED SLICE of the grid each
 * run, so a full continental-US sweep completes once per cadence window
 * (default: a full grid every 7 nights). A resumable cursor doc tracks where the
 * next slice begins and WRAPS to 0 at the end of the grid.
 *
 * NOTE ON SECRETS: ingestGridCell calls ONLY the keyless AA Meeting Guide +
 * Celebrate Recovery sources — it does NOT geocode and never reads
 * GOOGLE_MAPS_API_KEY. So this function is deliberately NOT bound to that secret;
 * binding an unprovisioned secret would block deploy. If geocoding is wired into
 * ingestion later, bind GOOGLE_MAPS_API_KEY here at that time.
 *
 * Slicing + cursor patterns mirror the resumable-cursor approach already used by
 * the ingestion layer (lib/meetings/ingest.ts) — one geohash/identity recipe, no
 * second hash.
 */
/** Firestore collection holding the single refresh cursor doc. */
exports.REFRESH_STATE_COLLECTION = 'refreshState';
/** Document id of the directory-refresh cursor. */
exports.REFRESH_STATE_DOC_ID = 'directory';
/**
 * Cadence: how many nightly runs it takes to cover the whole grid once.
 * Default 7 → "full grid weekly, sliced nightly".
 */
exports.REFRESH_CYCLE_RUNS = 7;
/**
 * Stale-prune horizon. External docs not re-seen within this many days are
 * considered gone-from-source and pruned. Sized to span several full cycles
 * (cycle is ~7 days), so a doc must miss multiple sweeps before deletion.
 */
exports.STALE_PRUNE_DAYS = 30;
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
function cellsPerRun(totalCells, cycleRuns) {
    if (totalCells <= 0)
        return 0;
    if (cycleRuns <= 0)
        return totalCells;
    return Math.ceil(totalCells / cycleRuns);
}
/**
 * Pure cursor advance: given a start cursor, slice size, and total cell count,
 * compute the [start, end) window (clamped to the grid) and the next cursor,
 * wrapping to 0 once the end of the grid is reached.
 */
function computeSlice(startCursor, perRun, totalCells) {
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
/** Read the persisted cursor, defaulting to 0 when the doc is absent/malformed. */
async function readCursor(database) {
    const snap = await database.collection(exports.REFRESH_STATE_COLLECTION).doc(exports.REFRESH_STATE_DOC_ID).get();
    if (!snap.exists)
        return 0;
    const data = snap.data();
    const cursor = data === null || data === void 0 ? void 0 : data.cursor;
    return typeof cursor === 'number' && cursor >= 0 ? cursor : 0;
}
/** Persist the next cursor for the following run. */
async function writeCursor(database, nextCursor) {
    await database
        .collection(exports.REFRESH_STATE_COLLECTION)
        .doc(exports.REFRESH_STATE_DOC_ID)
        .set({ cursor: nextCursor }, { merge: true });
}
/**
 * Process one bounded slice of the grid: read the cursor, ingest each cell in the
 * slice (re-stamping lastSeenAt/lastRefreshedAt via ingestGridCell), advance and
 * persist the cursor (wrapping at grid end). At the end of a FULL cycle it also
 * runs the stale prune.
 *
 * Pure with respect to its deps — db, fetchFn, and the clock are all injected, so
 * tests run with zero real Firestore/network.
 */
async function refreshSlice(deps) {
    const { db: database, fetchFn } = deps;
    const allCells = [...(0, ingest_1.gridCells)()];
    const totalCells = allCells.length;
    const perRun = cellsPerRun(totalCells, exports.REFRESH_CYCLE_RUNS);
    const startCursor = await readCursor(database);
    const { start, end, nextCursor, cycleCompleted } = computeSlice(startCursor, perRun, totalCells);
    for (let i = start; i < end; i++) {
        const { lat, lng } = allCells[i];
        await (0, ingest_1.ingestGridCell)(lat, lng, { db: database, fetchFn });
    }
    // Cursor advances past EVERY cell in this slice unconditionally — including any
    // cell where one source fetcher failed (ingestGridCell now returns a non-zero
    // fetchErrors but still upserts the healthy source rather than throwing). This
    // is an INTENTIONAL design choice: we do NOT retry/re-pin a partially-failed
    // cell. A transient source outage self-heals on the NEXT full sweep, and the
    // stale-prune horizon (STALE_PRUNE_DAYS) plus lastSeenAt re-stamping eventually
    // reconcile any rows missed during the outage. Pinning the cursor on partial
    // failures would risk stalling the whole grid behind one flaky source.
    await writeCursor(database, nextCursor);
    // Run the stale prune at the close of each full grid cycle.
    if (cycleCompleted) {
        await pruneStale(deps);
    }
    return {
        startCursor: start,
        nextCursor,
        cellsProcessed: end - start,
        totalCells,
        cycleCompleted,
    };
}
/**
 * Delete external directory docs that have not been re-seen within
 * STALE_PRUNE_DAYS. Queries only `source == 'external'` AND
 * `lastSeenAt < cutoff`, so app-owned docs are never selected. As belt-and-braces
 * the per-doc loop also HARD-GUARDS against deleting any `source === 'app'` doc.
 */
async function pruneStale(deps) {
    const { db: database } = deps;
    const now = deps.now ? deps.now() : new Date();
    const cutoffMs = now.getTime() - exports.STALE_PRUNE_DAYS * 24 * 60 * 60 * 1000;
    const cutoff = firestore_1.Timestamp.fromMillis(cutoffMs);
    const snapshot = await database
        .collection('directoryMeetings')
        .where('source', '==', 'external')
        .where('lastSeenAt', '<', cutoff)
        .get();
    let deleted = 0;
    let scanned = 0;
    let batch = database.batch();
    let opsInBatch = 0;
    for (const doc of snapshot.docs) {
        scanned++;
        const data = doc.data();
        // HARD GUARD: never prune an app-owned doc, even if a query ever returned one.
        if ((data === null || data === void 0 ? void 0 : data.source) === 'app')
            continue;
        batch.delete(doc.ref);
        opsInBatch++;
        deleted++;
        if (opsInBatch >= 500) {
            await batch.commit();
            batch = database.batch();
            opsInBatch = 0;
        }
    }
    if (opsInBatch > 0) {
        await batch.commit();
    }
    return { deleted, scanned };
}
/**
 * Nightly scheduled wrapper. Thin: resolves real deps (Firestore + global fetch)
 * and delegates to the pure refreshSlice. NOT bound to GOOGLE_MAPS_API_KEY — see
 * the file header (ingestGridCell uses only keyless sources).
 */
exports.refreshDirectory = (0, scheduler_1.onSchedule)('every day 03:00', async () => {
    const result = await refreshSlice({ db: firebase_1.db, fetchFn: fetch });
    v2_1.logger.info('directory refresh slice complete', {
        startCursor: result.startCursor,
        nextCursor: result.nextCursor,
        cellsProcessed: result.cellsProcessed,
        totalCells: result.totalCells,
        cycleCompleted: result.cycleCompleted,
    });
});
