"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const findMeetings_1 = require("./findMeetings");
const hash_1 = require("../lib/hash");
/**
 * Pure mocks — ZERO real network, ZERO real Firestore. Mirrors the
 * dependency-injection style of callable/referrals.test.ts and the
 * geofire-common / FieldValue mocking style of lib/meetings/ingest.test.ts.
 */
// Sentinel returned by FieldValue.serverTimestamp() in the mock below.
const SERVER_TS = '__serverTimestamp__';
jest.mock('firebase-admin/firestore', () => ({
    FieldValue: { serverTimestamp: () => SERVER_TS },
    getFirestore: jest.fn(),
}));
// Deterministic, network-free geo helpers. geohashQueryBounds returns one bound;
// distanceBetween returns the haversine-ish distance from the seeded fixtures so
// the true-distance filter is exercised without pulling in real geofire math.
jest.mock('geofire-common', () => ({
    geohashQueryBounds: jest.fn(() => [['aaa', 'aaz']]),
    distanceBetween: jest.fn((a, b) => {
        // Simple planar approximation in km good enough for fixtures near the center.
        const dLat = a[0] - b[0];
        const dLng = a[1] - b[1];
        return Math.sqrt(dLat * dLat + dLng * dLng) * 111; // ~111 km per degree
    }),
}));
const ctx = {
    appId: 'homegroups',
    uid: 'uid123',
    email: 'user@test.com',
};
const CENTER = { lat: 40, lng: -100 };
function meeting(over = {}) {
    var _a;
    return Object.assign({ id: (_a = over.id) !== null && _a !== void 0 ? _a : 'm1', source: 'external', provider: 'AA', name: 'Sunrise Group', type: 'AA', day: 2, time: '07:00', location: { lat: 40.001, lng: -100.001, geohash: 'aaa1' }, lastRefreshedAt: {}, lastSeenAt: {}, createdAt: {}, updatedAt: {} }, over);
}
/**
 * In-memory Firestore mock. `query` records the last add() payload via
 * `addedDocs`. The geohash range query just returns the seeded docs (the
 * geo/day/type filtering under test happens in handler code, not Firestore).
 */
function makeDb(seed = []) {
    const addedDocs = [];
    const directoryMeetingsQuery = {
        orderBy: jest.fn().mockReturnThis(),
        startAt: jest.fn().mockReturnThis(),
        endAt: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({
            docs: seed.map((m) => ({ id: m.id, data: () => m })),
        }),
    };
    const requestsCollection = {
        add: jest.fn(async (payload) => {
            addedDocs.push(payload);
            return { id: `req${addedDocs.length}` };
        }),
    };
    const db = {
        collection: jest.fn((name) => {
            if (name === 'directoryMeetings')
                return directoryMeetingsQuery;
            if (name === 'directoryMeetingRequests')
                return requestsCollection;
            throw new Error(`unexpected collection: ${name}`);
        }),
    };
    return { db, addedDocs, requestsCollection, directoryMeetingsQuery };
}
describe('handleFindMeetings (auth via wrapper)', () => {
    it('rejects a call with a missing/invalid X-Service-Key', async () => {
        // The deployed wrapper gates on requireServiceAuth; a request with neither a
        // valid service key nor request.auth must be rejected as unauthenticated.
        const request = {
            data: { location: CENTER },
            rawRequest: { headers: {} },
            auth: undefined,
        };
        await expect(findMeetings_1.findMeetings.run(request)).rejects.toMatchObject({
            code: 'unauthenticated',
        });
    });
});
describe('handleFindMeetings (handler)', () => {
    it('returns seeded directory results for a known location', async () => {
        const { db } = makeDb([meeting({ id: 'm1' })]);
        const result = await (0, findMeetings_1.handleFindMeetings)({ location: CENTER }, ctx, { db });
        expect(result.meetings).toHaveLength(1);
        expect(result.meetings[0].id).toBe('m1');
        expect(db.collection).toHaveBeenCalledWith('directoryMeetings');
    });
    it('rejects a malformed payload with invalid-argument', async () => {
        const { db } = makeDb();
        await expect((0, findMeetings_1.handleFindMeetings)({ location: { lat: 'nope', lng: -100 } }, ctx, { db })).rejects.toMatchObject({ code: 'invalid-argument' });
    });
    it('filters out meetings beyond the radius via true distanceBetween', async () => {
        // Second meeting is ~111km away (1 degree) — outside the 5km default radius.
        const { db } = makeDb([
            meeting({ id: 'near', location: { lat: 40.001, lng: -100.001, geohash: 'aaa1' } }),
            meeting({ id: 'far', location: { lat: 41, lng: -100, geohash: 'aaa9' } }),
        ]);
        const result = await (0, findMeetings_1.handleFindMeetings)({ location: CENTER }, ctx, { db });
        expect(result.meetings.map((m) => m.id)).toEqual(['near']);
    });
    it('respects the day filter', async () => {
        const { db } = makeDb([meeting({ id: 'tue', day: 2 }), meeting({ id: 'wed', day: 3 })]);
        const result = await (0, findMeetings_1.handleFindMeetings)({ location: CENTER, day: 2 }, ctx, { db });
        expect(result.meetings.map((m) => m.id)).toEqual(['tue']);
    });
    it('respects the type filter', async () => {
        const { db } = makeDb([meeting({ id: 'aa', type: 'AA' }), meeting({ id: 'na', type: 'NA' })]);
        const result = await (0, findMeetings_1.handleFindMeetings)({ location: CENTER, type: 'NA' }, ctx, { db });
        expect(result.meetings.map((m) => m.id)).toEqual(['na']);
    });
});
describe('findMeetings audit row', () => {
    it('writes a per-request audit row with a HASHED uid and no PII', async () => {
        const { db, addedDocs, requestsCollection } = makeDb([meeting()]);
        await (0, findMeetings_1.handleFindMeetings)({ location: CENTER, day: 2, type: 'AA' }, ctx, { db });
        expect(requestsCollection.add).toHaveBeenCalledTimes(1);
        expect(addedDocs).toHaveLength(1);
        const row = addedDocs[0];
        // Hashed uid present and != raw uid.
        expect(row.uidHash).toBe((0, hash_1.hashUid)('uid123'));
        expect(row.uidHash).not.toBe('uid123');
        // Attribution-only fields.
        expect(row.appId).toBe('homegroups');
        expect(row.day).toBe(2);
        expect(row.type).toBe('AA');
        expect(row.at).toBe(SERVER_TS);
        // Coarsened coordinates (~2 decimals), not the precise input.
        expect(row.lat).toBe(40);
        expect(row.lng).toBe(-100);
        // NO email / name / raw uid keys.
        expect(row).not.toHaveProperty('email');
        expect(row).not.toHaveProperty('name');
        expect(row).not.toHaveProperty('uid');
        expect(Object.values(row)).not.toContain('uid123');
        expect(Object.values(row)).not.toContain('user@test.com');
    });
    it('coarsens precise coordinates so the row is not a precise fix', async () => {
        const { db, addedDocs } = makeDb([meeting()]);
        await (0, findMeetings_1.handleFindMeetings)({ location: { lat: 40.123456, lng: -100.987654 } }, ctx, { db });
        expect(addedDocs[0].lat).toBe(40.12);
        expect(addedDocs[0].lng).toBe(-100.99);
    });
    it('still returns results when the audit write fails (best-effort)', async () => {
        const { db, requestsCollection } = makeDb([meeting({ id: 'm1' })]);
        requestsCollection.add.mockRejectedValueOnce(new Error('boom'));
        const result = await (0, findMeetings_1.handleFindMeetings)({ location: CENTER }, ctx, { db });
        expect(result.meetings.map((m) => m.id)).toEqual(['m1']);
    });
    it('returns results WITHOUT awaiting the audit write (fire-and-forget)', async () => {
        // The audit write returns a promise that never resolves. If handleFindMeetings
        // awaited it the call would hang; instead it must resolve the meetings
        // immediately while the audit write is still pending.
        const { db, requestsCollection } = makeDb([meeting({ id: 'm1' })]);
        requestsCollection.add.mockImplementationOnce(() => new Promise(() => { }));
        const result = await (0, findMeetings_1.handleFindMeetings)({ location: CENTER }, ctx, { db });
        expect(result.meetings.map((m) => m.id)).toEqual(['m1']);
        // The audit write was kicked off (fire-and-forget), not awaited.
        expect(requestsCollection.add).toHaveBeenCalledTimes(1);
    });
    it('stores null for omitted day/type', async () => {
        const { db, addedDocs } = makeDb([meeting()]);
        await (0, findMeetings_1.handleFindMeetings)({ location: CENTER }, ctx, { db });
        expect(addedDocs[0].day).toBeNull();
        expect(addedDocs[0].type).toBeNull();
    });
});
