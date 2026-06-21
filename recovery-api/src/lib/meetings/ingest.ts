import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import type { DirectoryMeeting } from '../../entities/DirectoryMeeting';
import { directoryMeetingId } from './identity';
import { fetchAAMeetings } from './sources/meetingGuide';
import { fetchCelebrateRecoveryMeetings } from './sources/celebrateRecovery';

/**
 * Ingestion layer for the shared meeting directory (`directoryMeetings`).
 *
 * Reads public source adapters (AA Meeting Guide + Celebrate Recovery) and
 * upserts the canonical DirectoryMeeting records into Firestore. The ingestor
 * OWNS the Timestamp fields (`lastRefreshedAt`, `lastSeenAt`, `createdAt`,
 * `updatedAt`) — the source fetchers deliberately never set them.
 *
 * Grid-sweep + batch-upsert + resumable-cursor patterns are ported from
 * homegroups `functions/scripts/populateMeetings.ts`:
 *   - grid loop (LAT/LON/STEP)        ~L421-425
 *   - batched .set(..., {merge:true}) ~L514
 *   - script_progress cursor          ~L362-391
 * Grid bounds/step copied verbatim from homegroups
 * `functions/scripts/shared-types.ts` CONFIG L137-144 (STEP 0.5, LAT 24→49,
 * LON -125→-67).
 *
 * Critical deviation from the homegroups script: that script SKIPS docs that
 * already exist. Here we MUST upsert and re-stamp `lastSeenAt`/`lastRefreshedAt`
 * on every sweep so the stale-prune signal stays fresh.
 */

/** Firestore batch limit. Mirrors homegroups CONFIG.BATCH_SIZE. */
export const BATCH_SIZE = 500;

/**
 * Continental-US grid config. Bounds + step copied verbatim from homegroups
 * `functions/scripts/shared-types.ts` CONFIG (L137-144).
 */
export const GRID_CONFIG = {
  LAT_MIN: 24.0,
  LAT_MAX: 49.0,
  LON_MIN: -125.0,
  LON_MAX: -67.0,
  STEP: 0.5,
} as const;

export interface GridCell {
  lat: number;
  lng: number;
}

/**
 * Yield every {lat, lng} cell across the continental-US grid. Mirrors the
 * nested grid loop in populateMeetings.ts (~L421-425): inclusive of both bounds,
 * stepping by GRID_CONFIG.STEP.
 */
export function* gridCells(): Generator<GridCell> {
  const { LAT_MIN, LAT_MAX, LON_MIN, LON_MAX, STEP } = GRID_CONFIG;
  for (let lat = LAT_MIN; lat <= LAT_MAX; lat += STEP) {
    for (let lng = LON_MIN; lng <= LON_MAX; lng += STEP) {
      yield { lat, lng };
    }
  }
}

export interface IngestDeps {
  /** Firestore instance, injected for testability (mirrors callable/referrals.ts). */
  db: FirebaseFirestore.Firestore;
  /** Injected fetch passed down to the source adapters; tests inject a mock. */
  fetchFn?: typeof fetch;
}

export interface IngestResult {
  /** Total source records fetched for the cell (pre-dedupe). */
  fetched: number;
  /** Records written (created or updated) in this run. */
  upserted: number;
  /** Records skipped because the existing doc is app-owned. */
  skippedAppOwned: number;
  /**
   * Number of source fetchers that rejected for this cell. Additive/observability
   * field: a single source failing no longer drops the whole cell — the healthy
   * source's data is still upserted. 0 means all sources succeeded.
   */
  fetchErrors: number;
}

/**
 * Build the persisted payload for an external meeting. Drops any `undefined`
 * fields (Firestore rejects them) and strips the source's `id` field (it lives
 * in the doc key, not the body). Timestamps are NOT set here — the upsert path
 * stamps them with serverTimestamp so they reflect write time.
 */
function buildExternalPayload(m: DirectoryMeeting): Record<string, unknown> {
  const { id: _id, ...rest } = m;
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) payload[key] = value;
  }
  // Force provenance — ingestion only ever writes external records.
  payload.source = 'external';
  return payload;
}

/**
 * Ingest a single grid cell: fetch AA + Celebrate Recovery meetings near the
 * cell, dedupe by directory id, and upsert each into `directoryMeetings`.
 *
 * Idempotency + createdAt-once: each doc is read first. If it does not exist we
 * include `createdAt: serverTimestamp()` in the merged payload; if it already
 * exists we omit `createdAt` so the original is preserved. On EVERY write we
 * re-stamp `lastRefreshedAt`, `lastSeenAt`, and `updatedAt` — so re-running the
 * same cell produces zero NEW docs but does update the freshness timestamps.
 *
 * Hard guard: ingestion never touches `source:'app'` docs. Since the id is
 * content-derived, an external and an app meeting could collide on id; if the
 * existing doc is app-owned we skip the write entirely.
 */
export async function ingestGridCell(
  lat: number,
  lng: number,
  deps: IngestDeps,
): Promise<IngestResult> {
  const { db, fetchFn } = deps;

  // Resilient fan-out: one source rejecting must NOT drop the whole cell (and
  // with it the healthy source's data). Use allSettled, keep the fulfilled
  // results, and log+count the rejected ones for observability.
  const sources: Array<{ name: string; fetch: () => Promise<DirectoryMeeting[]> }> = [
    { name: 'AA', fetch: () => fetchAAMeetings(lat, lng, { fetchFn }) },
    {
      name: 'CelebrateRecovery',
      fetch: () => fetchCelebrateRecoveryMeetings(lat, lng, { fetchFn }),
    },
  ];

  const settled = await Promise.allSettled(sources.map((s) => s.fetch()));

  const fetched: DirectoryMeeting[] = [];
  let fetchErrors = 0;
  settled.forEach((outcome, i) => {
    if (outcome.status === 'fulfilled') {
      fetched.push(...outcome.value);
    } else {
      fetchErrors++;
      logger.warn('ingestGridCell: source fetch failed', {
        source: sources[i].name,
        lat,
        lng,
        error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
      });
    }
  });

  // Dedupe within the cell by directory id (the same room can surface from
  // overlapping radius queries). Keep the first occurrence.
  const byId = new Map<string, DirectoryMeeting>();
  for (const m of fetched) {
    const id = directoryMeetingId(m);
    if (!byId.has(id)) byId.set(id, m);
  }

  const collection = db.collection('directoryMeetings');
  let batch = db.batch();
  let opsInBatch = 0;
  let upserted = 0;
  let skippedAppOwned = 0;

  for (const [id, meeting] of byId) {
    const docRef = collection.doc(id);
    const snap = await docRef.get();

    if (snap.exists) {
      const existing = snap.data() as Partial<DirectoryMeeting> | undefined;
      // Hard guard: never overwrite or touch an app-owned doc.
      if (existing?.source === 'app') {
        skippedAppOwned++;
        continue;
      }
    }

    const payload = buildExternalPayload(meeting);
    payload.lastRefreshedAt = FieldValue.serverTimestamp();
    payload.lastSeenAt = FieldValue.serverTimestamp();
    payload.updatedAt = FieldValue.serverTimestamp();
    // createdAt-once: only stamp on first write so re-ingests preserve it.
    if (!snap.exists) {
      payload.createdAt = FieldValue.serverTimestamp();
    }

    batch.set(docRef, payload, { merge: true });
    opsInBatch++;
    upserted++;

    if (opsInBatch >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      opsInBatch = 0;
    }
  }

  if (opsInBatch > 0) {
    await batch.commit();
  }

  return { fetched: fetched.length, upserted, skippedAppOwned, fetchErrors };
}
