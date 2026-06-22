"use strict";
/**
 * Google Maps geocoding / reverse-geocoding / timezone helpers for the meeting
 * directory ingestors.
 *
 * Endpoint URLs copied verbatim from regroup `functions/src/api/api.ts`:
 *   GEOCODE         (line 28): https://maps.googleapis.com/maps/api/geocode/json?address=${street},+${city},+${state}&key=${KEY}
 *   REVERSE_GEOCODE (line 26): https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}+&key=${KEY}
 *   timezoneUrl     (line 24): https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${time}&key=${KEY}
 *
 * The API key is INJECTED via deps (never read from process.env inside these
 * pure functions) so tests need neither network nor secrets.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.geocode = geocode;
exports.reverseGeocode = reverseGeocode;
exports.getTimezone = getTimezone;
const GEOCODE = (street, city, state, key) => {
    // Encode each data-derived address component so characters like `&` or `#`
    // can't corrupt the query string or break out into the `key` param. The key
    // is from Secret Manager (safe) and is intentionally left un-encoded.
    const address = `${encodeURIComponent(street)},+${encodeURIComponent(city)},+${encodeURIComponent(state)}`;
    return `https://maps.googleapis.com/maps/api/geocode/json?address=${address}&key=${key}`;
};
const REVERSE_GEOCODE = (lat, lng, key) => `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}+&key=${key}`;
const TIMEZONE = (lat, lng, timestamp, key) => `https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${timestamp}&key=${key}`;
/**
 * Geocode a street/city/state address to a lat/lng, or null when no result has
 * geometry. Mirrors regroup `geocode` (api.ts:61) reading
 * `results[].geometry.location`.
 */
async function geocode(address, deps) {
    var _a, _b;
    const fetchFn = (_a = deps.fetchFn) !== null && _a !== void 0 ? _a : fetch;
    const url = GEOCODE(address.street, address.city, address.state, deps.apiKey);
    const res = await fetchFn(url);
    if (!res.ok) {
        throw new Error(`Geocode request failed: ${res.status}`);
    }
    const body = (await res.json());
    const result = (_b = body === null || body === void 0 ? void 0 : body.results) === null || _b === void 0 ? void 0 : _b.find((r) => { var _a; return (_a = r.geometry) === null || _a === void 0 ? void 0 : _a.location; });
    return result ? result.geometry.location : null;
}
/**
 * Reverse-geocode a lat/lng to a formatted address, or null when none found.
 * Mirrors regroup `reverseGeocode` (api.ts:53).
 */
async function reverseGeocode(lat, lng, deps) {
    var _a, _b, _c, _d;
    const fetchFn = (_a = deps.fetchFn) !== null && _a !== void 0 ? _a : fetch;
    const res = await fetchFn(REVERSE_GEOCODE(lat, lng, deps.apiKey));
    if (!res.ok) {
        throw new Error(`Reverse geocode request failed: ${res.status}`);
    }
    const body = (await res.json());
    return (_d = (_c = (_b = body === null || body === void 0 ? void 0 : body.results) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.formatted_address) !== null && _d !== void 0 ? _d : null;
}
/**
 * Look up the IANA timezone id for a lat/lng. Returns "unknown" on failure,
 * matching regroup `getTimezone` (api.ts:85).
 */
async function getTimezone(lat, lng, deps, timestamp = Math.floor(Date.now() / 1000)) {
    var _a, _b;
    const fetchFn = (_a = deps.fetchFn) !== null && _a !== void 0 ? _a : fetch;
    try {
        const res = await fetchFn(TIMEZONE(lat, lng, timestamp, deps.apiKey));
        if (!res.ok)
            return 'unknown';
        const body = (await res.json());
        return (_b = body === null || body === void 0 ? void 0 : body.timeZoneId) !== null && _b !== void 0 ? _b : 'unknown';
    }
    catch (_c) {
        return 'unknown';
    }
}
