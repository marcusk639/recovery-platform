"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GRID_CONFIG = exports.BATCH_SIZE = void 0;
exports.gridCells = gridCells;
exports.ingestGridCell = ingestGridCell;
const firestore_1 = require("firebase-admin/firestore");
const v2_1 = require("firebase-functions/v2");
const identity_1 = require("./identity");
const meetingGuide_1 = require("./sources/meetingGuide");
const celebrateRecovery_1 = require("./sources/celebrateRecovery");
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
exports.BATCH_SIZE = 500;
/**
 * Continental-US grid config. Bounds + step copied verbatim from homegroups
 * `functions/scripts/shared-types.ts` CONFIG (L137-144).
 */
exports.GRID_CONFIG = {
    LAT_MIN: 24.0,
    LAT_MAX: 49.0,
    LON_MIN: -125.0,
    LON_MAX: -67.0,
    STEP: 0.5,
};
/**
 * Yield every {lat, lng} cell across the continental-US grid. Mirrors the
 * nested grid loop in populateMeetings.ts (~L421-425): inclusive of both bounds,
 * stepping by GRID_CONFIG.STEP.
 */
function* gridCells() {
    const { LAT_MIN, LAT_MAX, LON_MIN, LON_MAX, STEP } = exports.GRID_CONFIG;
    for (let lat = LAT_MIN; lat <= LAT_MAX; lat += STEP) {
        for (let lng = LON_MIN; lng <= LON_MAX; lng += STEP) {
            yield { lat, lng };
        }
    }
}
/**
 * Build the persisted payload for an external meeting. Drops any `undefined`
 * fields (Firestore rejects them) and strips the source's `id` field (it lives
 * in the doc key, not the body). Timestamps are NOT set here — the upsert path
 * stamps them with serverTimestamp so they reflect write time.
 */
function buildExternalPayload(m) {
    const { id: _id } = m, rest = __rest(m, ["id"]);
    const payload = {};
    for (const [key, value] of Object.entries(rest)) {
        if (value !== undefined)
            payload[key] = value;
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
async function ingestGridCell(lat, lng, deps) {
    const { db, fetchFn } = deps;
    // Resilient fan-out: one source rejecting must NOT drop the whole cell (and
    // with it the healthy source's data). Use allSettled, keep the fulfilled
    // results, and log+count the rejected ones for observability.
    const sources = [
        { name: 'AA', fetch: () => (0, meetingGuide_1.fetchAAMeetings)(lat, lng, { fetchFn }) },
        {
            name: 'CelebrateRecovery',
            fetch: () => (0, celebrateRecovery_1.fetchCelebrateRecoveryMeetings)(lat, lng, { fetchFn }),
        },
    ];
    const settled = await Promise.allSettled(sources.map((s) => s.fetch()));
    const fetched = [];
    let fetchErrors = 0;
    settled.forEach((outcome, i) => {
        if (outcome.status === 'fulfilled') {
            fetched.push(...outcome.value);
        }
        else {
            fetchErrors++;
            v2_1.logger.warn('ingestGridCell: source fetch failed', {
                source: sources[i].name,
                lat,
                lng,
                error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
            });
        }
    });
    // Dedupe within the cell by directory id (the same room can surface from
    // overlapping radius queries). Keep the first occurrence.
    const byId = new Map();
    for (const m of fetched) {
        const id = (0, identity_1.directoryMeetingId)(m);
        if (!byId.has(id))
            byId.set(id, m);
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
            const existing = snap.data();
            // Hard guard: never overwrite or touch an app-owned doc.
            if ((existing === null || existing === void 0 ? void 0 : existing.source) === 'app') {
                skippedAppOwned++;
                continue;
            }
        }
        const payload = buildExternalPayload(meeting);
        payload.lastRefreshedAt = firestore_1.FieldValue.serverTimestamp();
        payload.lastSeenAt = firestore_1.FieldValue.serverTimestamp();
        payload.updatedAt = firestore_1.FieldValue.serverTimestamp();
        // createdAt-once: only stamp on first write so re-ingests preserve it.
        if (!snap.exists) {
            payload.createdAt = firestore_1.FieldValue.serverTimestamp();
        }
        batch.set(docRef, payload, { merge: true });
        opsInBatch++;
        upserted++;
        if (opsInBatch >= exports.BATCH_SIZE) {
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
