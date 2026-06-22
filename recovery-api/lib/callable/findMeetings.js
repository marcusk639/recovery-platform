"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findMeetings = void 0;
exports.handleFindMeetings = handleFindMeetings;
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const firestore_1 = require("firebase-admin/firestore");
const geofire_common_1 = require("geofire-common");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const config_1 = require("../config");
const identity_1 = require("../lib/meetings/identity");
const hash_1 = require("../lib/hash");
/**
 * Cross-product PUBLIC READ for the shared meeting directory.
 *
 * PURE FIRESTORE ONLY: this is a geohash-bounded read of the `directoryMeetings`
 * collection (the system of record). It deliberately imports nothing from
 * lib/meetings/sources/ and never touches an external API or GOOGLE_MAPS_API_KEY
 * — ingestion is a separate write path; this is the read interface.
 *
 * Query shape ported from homegroups scripts/findMeetingsByLocation.ts: bound the
 * search with geofire-common geohashQueryBounds, run one range query per bound on
 * `location.geohash`, then filter the union by true distanceBetween. day/type are
 * applied in-memory after the geo filter.
 */
// Default search radius. homegroups' read path filters on a maxDistance in km;
// 5km is a sensible neighborhood default, expressed in meters here.
const DEFAULT_RADIUS_METERS = 5000;
const MAX_RADIUS_METERS = 100000;
const FindMeetingsSchema = zod_1.z.object({
    location: zod_1.z.object({
        lat: zod_1.z.number().min(-90).max(90),
        lng: zod_1.z.number().min(-180).max(180),
    }),
    day: zod_1.z.number().int().min(0).max(6).optional(),
    type: zod_1.z.string().min(1).max(64).optional(),
    radiusMeters: zod_1.z.number().positive().max(MAX_RADIUS_METERS).optional(),
});
async function handleFindMeetings(data, context, deps) {
    var _a, _b, _c;
    let parsed;
    try {
        parsed = FindMeetingsSchema.parse(data);
    }
    catch (err) {
        if (err instanceof zod_1.z.ZodError) {
            // Log issue paths/codes only — never the raw payload (location is user data).
            v2_1.logger.warn('findMeetings: invalid payload', { issues: err.issues });
            throw new https_1.HttpsError('invalid-argument', 'Invalid findMeetings payload');
        }
        throw err;
    }
    const { db } = deps;
    const center = [parsed.location.lat, parsed.location.lng];
    const radiusMeters = (_a = parsed.radiusMeters) !== null && _a !== void 0 ? _a : DEFAULT_RADIUS_METERS;
    const dayFilter = parsed.day !== undefined ? (0, identity_1.normalizeDay)(parsed.day) : undefined;
    // geohashQueryBounds → one range query per bound on location.geohash. Mirrors
    // findMeetingsByLocation.ts' >= / <= geohash range, but using the canonical
    // geofire-common bounds (precise across cell edges) rather than a single cell.
    const bounds = (0, geofire_common_1.geohashQueryBounds)(center, radiusMeters);
    const snapshots = await Promise.all(bounds.map(([start, end]) => db
        .collection('directoryMeetings')
        .orderBy('location.geohash')
        .startAt(start)
        .endAt(end)
        .get()));
    // Collect, dedupe by doc id, then apply the true-distance filter (the geohash
    // bounds are a superset — distanceBetween prunes false positives).
    const seen = new Set();
    const meetings = [];
    for (const snap of snapshots) {
        for (const doc of snap.docs) {
            if (seen.has(doc.id))
                continue;
            seen.add(doc.id);
            const meeting = doc.data();
            const lat = (_b = meeting.location) === null || _b === void 0 ? void 0 : _b.lat;
            const lng = (_c = meeting.location) === null || _c === void 0 ? void 0 : _c.lng;
            if (typeof lat !== 'number' || typeof lng !== 'number')
                continue;
            const distanceKm = (0, geofire_common_1.distanceBetween)([lat, lng], center);
            if (distanceKm * 1000 > radiusMeters)
                continue;
            if (dayFilter !== undefined && meeting.day !== dayFilter)
                continue;
            if (parsed.type !== undefined && meeting.type !== parsed.type)
                continue;
            meetings.push(meeting);
        }
    }
    // Per-request attribution audit row. FIRE-AND-FORGET: the write must NOT add
    // its latency to the read hot path, and a write failure must NOT block (or
    // reject) returning results. We deliberately do NOT await it. Stores ONLY a
    // hashed uid + coarsened coordinates — never email, names, or the raw uid.
    void writeAuditRow(db, context, parsed).catch((err) => v2_1.logger.warn('findMeetings: audit write failed', err));
    return { meetings };
}
/** Coarsen a coordinate to ~2 decimals (~1km) so the audit row isn't a precise fix. */
function coarsen(value) {
    return Math.round(value * 100) / 100;
}
async function writeAuditRow(db, context, parsed) {
    var _a, _b;
    // No try/catch here: the caller invokes this fire-and-forget and attaches a
    // .catch() that logs failures, so a rejection never reaches the read path.
    await db.collection('directoryMeetingRequests').add({
        appId: context.appId,
        uidHash: (0, hash_1.hashUid)(context.uid),
        day: (_a = parsed.day) !== null && _a !== void 0 ? _a : null,
        type: (_b = parsed.type) !== null && _b !== void 0 ? _b : null,
        lat: coarsen(parsed.location.lat),
        lng: coarsen(parsed.location.lng),
        at: firestore_1.FieldValue.serverTimestamp(),
    });
}
exports.findMeetings = (0, https_1.onCall)({ secrets: [config_1.RECOVERY_PLATFORM_API_KEY] }, async (request) => {
    const context = (0, auth_1.requireServiceAuth)(request);
    return handleFindMeetings(request.data, context, { db: (0, firestore_1.getFirestore)() });
});
