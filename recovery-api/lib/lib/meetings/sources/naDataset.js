"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapNaMeeting = mapNaMeeting;
const identity_1 = require("../identity");
/**
 * Map one pre-seeded `na-meetings` Firestore doc to the canonical
 * DirectoryMeeting shape (provider 'NA', source 'external').
 *
 * Returns `null` for malformed rows (missing name/day/time, non-finite lat/lng)
 * so a single bad source doc cannot abort the migration batch — mirrors the
 * skip-on-throw behavior in `sources/meetingGuide.ts` `mapMeetingGuideMeeting`.
 *
 * Timestamps (`lastRefreshedAt`/`lastSeenAt`/`createdAt`/`updatedAt`) are NOT
 * set here — the migration script's upsert path owns them (mirrors the other
 * source adapters, which return the public source-derived slice only).
 */
function mapNaMeeting(doc) {
    var _a, _b, _c;
    try {
        if (typeof doc.name !== 'string' || doc.name.trim() === '') {
            return null;
        }
        if (doc.day === undefined || doc.day === null) {
            return null;
        }
        if (typeof doc.time !== 'string' || doc.time.trim() === '') {
            return null;
        }
        // Frozen helpers — these throw on bad data, caught below to skip the row.
        const day = (0, identity_1.normalizeDay)(doc.day);
        const time = (0, identity_1.normalizeTime)(doc.time);
        const lat = typeof doc.lat === 'number' ? doc.lat : NaN;
        const lng = typeof doc.lng === 'number' ? doc.lng : NaN;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return null;
        }
        const link = ((_a = doc.link) !== null && _a !== void 0 ? _a : '').trim();
        const formattedAddress = ((_c = (_b = doc.formattedAddress) !== null && _b !== void 0 ? _b : doc.address) !== null && _c !== void 0 ? _c : '').trim();
        const id = (0, identity_1.directoryMeetingId)({
            name: doc.name,
            day,
            time,
            link,
            formattedAddress,
        });
        const meeting = {
            id,
            source: 'external',
            provider: 'NA',
            name: doc.name,
            day,
            time,
            location: {
                lat,
                lng,
                // Re-derive the geohash through the frozen helper rather than trusting
                // the source `geohash` (the seed used ngeohash at varying precision).
                geohash: (0, identity_1.directoryGeohash)(lat, lng),
            },
        };
        if (doc.id !== undefined && doc.id !== null) {
            meeting.externalId = String(doc.id);
        }
        if (doc.type)
            meeting.type = doc.type;
        if (doc.format)
            meeting.format = doc.format;
        if (doc.address)
            meeting.location.address = doc.address;
        if (doc.city)
            meeting.location.city = doc.city;
        if (doc.state)
            meeting.location.state = doc.state;
        if (doc.zip)
            meeting.location.zip = doc.zip;
        if (doc.online !== undefined)
            meeting.online = doc.online;
        if (link)
            meeting.link = link;
        if (doc.onlineNotes)
            meeting.onlineNotes = doc.onlineNotes;
        return meeting;
    }
    catch (_d) {
        // Malformed source record (bad day/time etc.) — skip it so one bad row
        // can't drop the whole migration batch.
        return null;
    }
}
