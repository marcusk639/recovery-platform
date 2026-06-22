"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchAAMeetings = fetchAAMeetings;
const identity_1 = require("../identity");
/**
 * AA Meeting Guide source adapter.
 *
 * Endpoint (keyless) copied verbatim from homegroups
 * `functions/src/api/api.ts` (AA_API, line 35):
 *   https://api.meetingguide.org/app/v2/request?latitude=${lat}&longitude=${lng}
 *
 * Response parsing (lat/lng/day/time/name/address) mirrors the homegroups
 * `getAAMeetings` shape (AAMeetingResponse) and the regroup `mapAAMeeting`
 * field reads: `day` is already an integer 0–6, `time` is "HH:mm:ss",
 * `latitude`/`longitude` are strings, address fields are flat.
 */
const AA_API = (lat, lng) => `https://api.meetingguide.org/app/v2/request?latitude=${lat}&longitude=${lng}`;
/**
 * Fetch AA meetings near (lat, lng) from the Meeting Guide API and map them to
 * the canonical DirectoryMeeting shape. Records that fail to map (bad day/time
 * etc.) are skipped rather than aborting the whole batch.
 */
async function fetchAAMeetings(lat, lng, deps = {}) {
    var _a, _b;
    const fetchFn = (_a = deps.fetchFn) !== null && _a !== void 0 ? _a : fetch;
    const res = await fetchFn(AA_API(lat, lng));
    if (!res.ok) {
        throw new Error(`Meeting Guide request failed: ${res.status}`);
    }
    const body = (await res.json());
    const meetings = (_b = body === null || body === void 0 ? void 0 : body.meetings) !== null && _b !== void 0 ? _b : [];
    return meetings
        .map((m) => mapMeetingGuideMeeting(m))
        .filter((m) => m !== null);
}
function mapMeetingGuideMeeting(m) {
    var _a, _b, _c;
    try {
        const day = (0, identity_1.normalizeDay)(m.day);
        // Meeting Guide returns "HH:mm:ss" or "HH:mm"; normalizeTime accepts both.
        const time = (0, identity_1.normalizeTime)(m.time);
        const lat = parseFloat(m.latitude);
        const lng = parseFloat(m.longitude);
        if (Number.isNaN(lat) || Number.isNaN(lng)) {
            return null;
        }
        const link = (_a = m.conference_url) !== null && _a !== void 0 ? _a : '';
        const formattedAddress = (_c = (_b = m.formatted_address) !== null && _b !== void 0 ? _b : m.address) !== null && _c !== void 0 ? _c : '';
        const id = (0, identity_1.directoryMeetingId)({
            name: m.name,
            day,
            time,
            link,
            formattedAddress,
        });
        const meeting = {
            id,
            source: 'external',
            externalId: String(m.id),
            provider: 'AA',
            name: m.name,
            day,
            time,
            location: {
                lat,
                lng,
                geohash: (0, identity_1.directoryGeohash)(lat, lng),
            },
            // Timestamps are owned by the ingestor that writes to Firestore; the
            // fetcher returns the public, source-derived slice only.
        };
        if (m.types)
            meeting.type = m.types;
        if (m.address)
            meeting.location.address = m.address;
        if (m.city)
            meeting.location.city = m.city;
        if (m.state)
            meeting.location.state = m.state;
        if (m.postal_code)
            meeting.location.zip = m.postal_code;
        if (m.conference_url) {
            meeting.online = true;
            meeting.link = m.conference_url;
        }
        if (m.conference_url_notes)
            meeting.onlineNotes = m.conference_url_notes;
        return meeting;
    }
    catch (_d) {
        // Malformed source record — skip it so one bad row can't drop the batch.
        return null;
    }
}
