"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const referrals_1 = require("./referrals");
const ctx = {
    appId: 'homegroups',
    uid: 'uid123',
    email: 'user@test.com',
};
const makeDb = (docData) => {
    const docMock = {
        exists: docData !== undefined,
        id: 'ref123',
        data: () => docData,
    };
    return {
        collection: jest.fn().mockReturnValue({
            add: jest.fn().mockResolvedValue({ id: 'ref123' }),
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({
                docs: docData ? [{ id: 'ref123', data: () => docData }] : [],
            }),
            doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(docMock) }),
        }),
    };
};
describe('handleCreateReferral', () => {
    it('creates referral and returns id + pending status', async () => {
        const db = makeDb();
        const result = await (0, referrals_1.handleCreateReferral)({
            toApp: 'phoenix-cleanhouse',
            clientName: 'Jane Doe',
            clientEmail: 'jane@test.com',
        }, ctx, db);
        expect(result).toEqual({ id: 'ref123', status: 'pending' });
        expect(db.collection).toHaveBeenCalledWith('referrals');
    });
    it('rejects an unknown toApp with invalid-argument (registry gate, not Zod enum)', async () => {
        const db = makeDb();
        await expect((0, referrals_1.handleCreateReferral)({ toApp: 'unknown', clientName: 'Jane', clientEmail: 'jane@test.com' }, ctx, db)).rejects.toMatchObject({ code: 'invalid-argument' });
    });
    it('writes fromApp and referredByApp from context.appId', async () => {
        const db = makeDb();
        await (0, referrals_1.handleCreateReferral)({ toApp: 'sober-living', clientName: 'Bob', clientEmail: 'bob@test.com' }, ctx, db);
        const addCall = db.collection.mock.results[0].value.add.mock.calls[0][0];
        expect(addCall.fromApp).toBe('homegroups');
        expect(addCall.referredByApp).toBe('homegroups');
    });
    it('stores the canonical toApp for a display-name wire value', async () => {
        const db = makeDb();
        await (0, referrals_1.handleCreateReferral)({ toApp: 'Regroup', clientName: 'Jane', clientEmail: 'jane@test.com' }, ctx, db);
        const addCall = db.collection.mock.results[0].value.add.mock.calls[0][0];
        expect(addCall.toApp).toBe('phoenix-cleanhouse');
    });
    it('stores the canonical toApp for a legacy alias wire value', async () => {
        const db = makeDb();
        await (0, referrals_1.handleCreateReferral)({ toApp: 'sober-living', clientName: 'Jane', clientEmail: 'jane@test.com' }, ctx, db);
        const addCall = db.collection.mock.results[0].value.add.mock.calls[0][0];
        expect(addCall.toApp).toBe('phoenix-cleanhouse');
    });
});
describe('handleGetReferral', () => {
    it('throws not-found when document does not exist', async () => {
        const db = makeDb(); // docData undefined → exists: false
        await expect((0, referrals_1.handleGetReferral)({ id: 'nonexistent' }, ctx, db)).rejects.toMatchObject({
            code: 'not-found',
        });
    });
    it('throws permission-denied when referredBy does not match', async () => {
        const db = makeDb({
            referredBy: 'other-uid',
            referredByApp: 'homegroups',
            toApp: 'sober-living',
            clientName: 'Jane',
            clientEmail: 'jane@test.com',
            status: 'pending',
            fromApp: 'homegroups',
        });
        await expect((0, referrals_1.handleGetReferral)({ id: 'ref123' }, ctx, db)).rejects.toMatchObject({
            code: 'permission-denied',
        });
    });
});
