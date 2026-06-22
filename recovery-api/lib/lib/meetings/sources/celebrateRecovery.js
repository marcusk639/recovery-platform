"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchCelebrateRecoveryMeetings = fetchCelebrateRecoveryMeetings;
const xml2js_1 = require("xml2js");
const identity_1 = require("../identity");
/**
 * Celebrate Recovery source adapter.
 *
 * Endpoint copied verbatim from homegroups `functions/src/api/api.ts`
 * (getCelebrateRecoveryMeetings, line 101) — returns XML:
 *   https://locator.crgroups.info/index.php?option=com_storelocator&view=map&format=raw&searchall=0&Itemid=110&lat=${lat}&lng=${lng}&radius=25&catid=2&tagid=-1&featstate=0&name_search=
 *
 * XML parse via xml2js `parseString` mirrors regroup/homegroups
 * `functions/src/util/meetings.ts` (parseXml). Each xml2js field is an array of
 * strings; `custom2[0]._` holds the schedule text e.g. "Friday 5:00 PM".
 * Address shape ("street, city,  STATE ZIP COUNTRY") mirrors regroup `mapCRMeeting`.
 */
const CR_API = (lat, lng) => `https://locator.crgroups.info/index.php?option=com_storelocator&view=map&format=raw&searchall=0&Itemid=110&lat=${lat}&lng=${lng}&radius=25&catid=2&tagid=-1&featstate=0&name_search=`;
const parseXml = (xml) => new Promise((resolve, reject) => {
    (0, xml2js_1.parseString)(xml, (err, result) => {
        if (err)
            return reject(err);
        resolve(result);
    });
});
/**
 * Fetch Celebrate Recovery meetings near (lat, lng) and map to DirectoryMeeting.
 * Malformed records are skipped, not thrown.
 */
async function fetchCelebrateRecoveryMeetings(lat, lng, deps = {}) {
    var _a, _b, _c;
    const fetchFn = (_a = deps.fetchFn) !== null && _a !== void 0 ? _a : fetch;
    const res = await fetchFn(CR_API(lat, lng));
    if (!res.ok) {
        throw new Error(`Celebrate Recovery request failed: ${res.status}`);
    }
    const xml = await res.text();
    const parsed = await parseXml(xml);
    const markers = (_c = (_b = parsed === null || parsed === void 0 ? void 0 : parsed.markers) === null || _b === void 0 ? void 0 : _b.marker) !== null && _c !== void 0 ? _c : [];
    return markers
        .map((marker) => mapCrMarker(marker))
        .filter((m) => m !== null);
}
function mapCrMarker(marker) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    try {
        const name = (_a = marker.name) === null || _a === void 0 ? void 0 : _a[0];
        if (!name)
            return null;
        // Schedule text e.g. "Friday 5:00 PM" → day + 12-hour time. Mirrors regroup
        // mapCRMeeting's read of custom2[0]._, but we keep the AM/PM so normalizeTime
        // can produce a correct 24-hour value.
        const schedule = (_d = (_c = (_b = marker.custom2) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c._) !== null && _d !== void 0 ? _d : '';
        const firstSpace = schedule.indexOf(' ');
        if (firstSpace === -1)
            return null;
        const dayRaw = schedule.slice(0, firstSpace).trim();
        const timeRaw = schedule.slice(firstSpace + 1).trim();
        const day = (0, identity_1.normalizeDay)(dayRaw);
        const time = (0, identity_1.normalizeTime)(timeRaw);
        const lat = parseFloat((_e = marker.lat) === null || _e === void 0 ? void 0 : _e[0]);
        const lng = parseFloat((_f = marker.lng) === null || _f === void 0 ? void 0 : _f[0]);
        if (Number.isNaN(lat) || Number.isNaN(lng))
            return null;
        // Address shape: "street, city,  STATE ZIP COUNTRY" (regroup mapCRMeeting).
        const fullAddress = (_h = (_g = marker.address) === null || _g === void 0 ? void 0 : _g[0]) !== null && _h !== void 0 ? _h : '';
        const addressParts = fullAddress.split(',');
        const street = (_j = addressParts[0]) === null || _j === void 0 ? void 0 : _j.trim();
        const city = (_k = addressParts[1]) === null || _k === void 0 ? void 0 : _k.trim();
        let state;
        let zip;
        if (addressParts[2]) {
            const stateZipCountry = addressParts[2].split(' ').filter(Boolean);
            state = stateZipCountry[0];
            zip = stateZipCountry[1];
        }
        const link = (_m = (_l = marker.url) === null || _l === void 0 ? void 0 : _l[0]) !== null && _m !== void 0 ? _m : '';
        const id = (0, identity_1.directoryMeetingId)({
            name,
            day,
            time,
            link,
            formattedAddress: fullAddress.trim(),
        });
        const meeting = {
            id,
            source: 'external',
            provider: 'CELEBRATE_RECOVERY',
            name,
            day,
            time,
            location: {
                lat,
                lng,
                geohash: (0, identity_1.directoryGeohash)(lat, lng),
            },
        };
        if (street)
            meeting.location.address = street;
        if (city)
            meeting.location.city = city;
        if (state)
            meeting.location.state = state;
        if (zip)
            meeting.location.zip = zip;
        if ((_o = marker.url) === null || _o === void 0 ? void 0 : _o[0])
            meeting.link = marker.url[0];
        return meeting;
    }
    catch (_p) {
        return null;
    }
}
