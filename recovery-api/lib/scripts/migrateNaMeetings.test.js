"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const migrateNaMeetings_1 = require("./migrateNaMeetings");
/**
 * Pure mocks — ZERO real Firestore. Mirrors the dependency-injection style of
 * lib/meetings/ingest.test.ts. The migration script injects sourceDb/destDb, so
 * the same-instance guard can be exercised with a trivial in-memory stub.
 */
// Sentinel returned by FieldValue.serverTimestamp() in the mock below.
const SERVER_TS = '__serverTimestamp__';
jest.mock('firebase-admin/firestore', () => ({
    FieldValue: { serverTimestamp: () => SERVER_TS },
    getFirestore: jest.fn(),
}));
/**
 * Minimal in-memory Firestore mock covering the surface runMigration touches:
 * collection(name).get() (source read) and collection().doc(id).get() +
 * db.batch().set/commit (dest writes). `seed` populates the SOURCE collection.
 */
function makeDb(seed = []) {
    const sourceDocs = seed.map((data, i) => ({ id: `src${i}`, data: () => data }));
    const db = {
        collection: jest.fn(() => ({
            get: async () => ({ size: sourceDocs.length, docs: sourceDocs }),
            doc: (id) => ({
                id,
                get: async () => ({ exists: false, data: () => undefined }),
            }),
        })),
        batch: jest.fn(() => ({
            set: jest.fn(),
            commit: jest.fn(async () => undefined),
        })),
    };
    return { db };
}
describe('runMigration same-instance guard', () => {
    let warnSpy;
    beforeEach(() => {
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => {
        warnSpy.mockRestore();
    });
    it('emits a loud WARNING when sourceDb === destDb (the silent no-op risk)', async () => {
        const { db } = makeDb();
        await (0, migrateNaMeetings_1.runMigration)({ sourceDb: db, destDb: db });
        expect(warnSpy).toHaveBeenCalledTimes(1);
        const message = String(warnSpy.mock.calls[0][0]);
        expect(message).toContain('migrateNaMeetings');
        expect(message.toLowerCase()).toContain('same');
    });
    it('does NOT warn when sourceDb and destDb are distinct instances', async () => {
        const { db: sourceDb } = makeDb();
        const { db: destDb } = makeDb();
        await (0, migrateNaMeetings_1.runMigration)({ sourceDb, destDb });
        expect(warnSpy).not.toHaveBeenCalled();
    });
});
