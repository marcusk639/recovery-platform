"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GEOHASH_PRECISION = void 0;
exports.normalizeDay = normalizeDay;
exports.normalizeTime = normalizeTime;
exports.directoryGeohash = directoryGeohash;
exports.directoryMeetingId = directoryMeetingId;
const crypto_1 = require("crypto");
const geofire_common_1 = require("geofire-common");
/**
 * FROZEN identity scheme for the shared meeting directory.
 *
 * There must be EXACTLY ONE hash recipe and ONE geohash precision repo-wide on
 * the directory path. homegroups drifted across precision 5/8/9/10 and across
 * day/time representations, producing duplicate + orphan docs. Do not add a
 * second hashing or geohash helper.
 *
 * Recipe ported from homegroups `scripts/cleanMeetings.ts` (generateMeetingHash):
 *   sha1(name | day | time | link | formattedAddress).slice(0, 24)
 * — but hashing the NORMALIZED day/time so equivalent representations
 * ("Tuesday" ≡ 2, "7:00 AM" ≡ "07:00") collapse to one id.
 */
/**
 * Frozen geohash precision. geofire-common's default is 10; homegroups'
 * read path (findMeetingsByLocation.ts) also uses 10. The `GEOHASH_PRECISION: 5`
 * in homegroups CONFIG was coarse-cell drift and is deliberately NOT used here.
 */
exports.GEOHASH_PRECISION = 10;
// 0 = Sunday .. 6 = Saturday (JS getDay convention; matches homegroups daysOfWeek).
const DAYS = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
];
/**
 * Canonicalize a day-of-week to an integer 0–6 (0 = Sunday).
 * Accepts an integer, a numeric string, a full weekday name, or any unambiguous
 * abbreviation that is a genuine prefix of the name and ≥3 chars
 * (case-insensitive: "Sun", "Tue", "Tues", "Thurs", "Wed"). Throws on anything
 * else so bad source data surfaces rather than silently producing a divergent id.
 * Note: "Weds" is not a prefix of "wednesday" — use "Wed".
 */
function normalizeDay(input) {
    if (typeof input === 'number') {
        if (Number.isInteger(input) && input >= 0 && input <= 6)
            return input;
        throw new RangeError(`normalizeDay: out-of-range day index: ${input}`);
    }
    const raw = input.trim().toLowerCase();
    if (!raw) {
        throw new RangeError('normalizeDay: empty day');
    }
    if (/^[0-6]$/.test(raw))
        return Number(raw);
    const exact = DAYS.findIndex((d) => d === raw);
    if (exact !== -1)
        return exact;
    // Prefix match for abbreviations. Require ≥3 chars so 1–2 letter prefixes
    // (ambiguous: s→sun/sat, t→tue/thu) can never match; at length 3 every prefix
    // in this set resolves to a single day.
    if (raw.length >= 3) {
        const prefix = DAYS.findIndex((d) => d.startsWith(raw));
        if (prefix !== -1)
            return prefix;
    }
    throw new RangeError(`normalizeDay: unrecognized day: ${JSON.stringify(input)}`);
}
/**
 * Canonicalize a local start time to "HH:mm" (24-hour). Accepts "HH:mm",
 * "HH:mm:ss", single-digit hours, and 12-hour "h:mm AM/PM". Throws on invalid.
 */
function normalizeTime(input) {
    var _a;
    const m = input.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?$/);
    if (!m) {
        throw new RangeError(`normalizeTime: unrecognized time: ${JSON.stringify(input)}`);
    }
    let hour = Number(m[1]);
    const minute = Number(m[2]);
    const meridiem = (_a = m[3]) === null || _a === void 0 ? void 0 : _a.toLowerCase();
    if (minute > 59) {
        throw new RangeError(`normalizeTime: minute out of range: ${JSON.stringify(input)}`);
    }
    if (meridiem) {
        if (hour < 1 || hour > 12) {
            throw new RangeError(`normalizeTime: 12-hour out of range: ${JSON.stringify(input)}`);
        }
        if (meridiem === 'am')
            hour = hour === 12 ? 0 : hour;
        else
            hour = hour === 12 ? 12 : hour + 12;
    }
    else if (hour > 23) {
        throw new RangeError(`normalizeTime: 24-hour out of range: ${JSON.stringify(input)}`);
    }
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
/** geofire-common geohash at the frozen precision. */
function directoryGeohash(lat, lng) {
    return (0, geofire_common_1.geohashForLocation)([lat, lng], exports.GEOHASH_PRECISION);
}
// Field separator for the hash preimage. A NUL byte is used (not "|") so a
// literal separator inside a free-form field (name/address from external
// sources, e.g. "Suite 100 | Bldg B") can't shift field boundaries and collide
// two distinct meetings onto the same id. NUL never appears in real source text.
const ID_FIELD_SEP = '\u0000';
/**
 * Deterministic 24-char directory id. Pure function of the meeting's identifying
 * fields, hashed AFTER normalization so format variants collapse to one id.
 * `day` is deliberately part of the key (the same room hosts distinct meetings
 * on different days).
 *
 * `name`/`formattedAddress` are case-SENSITIVE by design (matches the ported
 * homegroups recipe). If a source is known to vary capitalization for the same
 * real meeting, the INGESTOR must normalize case before calling this — otherwise
 * "Sunrise Group" and "SUNRISE GROUP" produce two directory docs.
 */
function directoryMeetingId(m) {
    var _a, _b;
    const parts = [
        m.name.trim(),
        String(normalizeDay(m.day)),
        normalizeTime(m.time),
        ((_a = m.link) !== null && _a !== void 0 ? _a : '').trim(),
        ((_b = m.formattedAddress) !== null && _b !== void 0 ? _b : '').trim(),
    ].join(ID_FIELD_SEP);
    return (0, crypto_1.createHash)('sha1').update(parts).digest('hex').slice(0, 24);
}
