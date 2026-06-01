"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const auth_1 = require("./auth");
const makeRequest = (headers, auth) => ({
    rawRequest: { headers },
    auth,
});
describe('requireServiceAuth', () => {
    const OLD_ENV = process.env;
    beforeEach(() => {
        process.env = Object.assign(Object.assign({}, OLD_ENV), { RECOVERY_PLATFORM_API_KEY: 'test-key' });
    });
    afterEach(() => {
        process.env = OLD_ENV;
    });
    it('extracts context from valid service key headers', () => {
        const req = makeRequest({
            'x-service-key': 'test-key',
            'x-app-id': 'homegroups',
            'x-user-uid': 'uid123',
            'x-user-email': 'user@test.com',
        });
        expect((0, auth_1.requireServiceAuth)(req)).toEqual({
            appId: 'homegroups',
            uid: 'uid123',
            email: 'user@test.com',
        });
    });
    it('throws unauthenticated when service key is wrong', () => {
        const req = makeRequest({
            'x-service-key': 'wrong-key',
            'x-app-id': 'homegroups',
            'x-user-uid': 'uid123',
        });
        expect(() => (0, auth_1.requireServiceAuth)(req)).toThrow(expect.objectContaining({ code: 'unauthenticated' }));
    });
    it('throws unauthenticated when appId is invalid', () => {
        const req = makeRequest({
            'x-service-key': 'test-key',
            'x-app-id': 'unknown-app',
            'x-user-uid': 'uid123',
        });
        expect(() => (0, auth_1.requireServiceAuth)(req)).toThrow(expect.objectContaining({ code: 'unauthenticated' }));
    });
    it('throws unauthenticated when uid is missing', () => {
        const req = makeRequest({
            'x-service-key': 'test-key',
            'x-app-id': 'homegroups',
        });
        expect(() => (0, auth_1.requireServiceAuth)(req)).toThrow(expect.objectContaining({ code: 'unauthenticated' }));
    });
    it('falls back to request.auth for Phase 2 token flow', () => {
        const req = makeRequest({}, {
            uid: 'uid456',
            token: { appId: 'sober-living', email: 'user2@test.com' },
        });
        expect((0, auth_1.requireServiceAuth)(req)).toEqual({
            appId: 'sober-living',
            uid: 'uid456',
            email: 'user2@test.com',
        });
    });
    it('throws when no service key and no request.auth', () => {
        const req = makeRequest({});
        expect(() => (0, auth_1.requireServiceAuth)(req)).toThrow(expect.objectContaining({ code: 'unauthenticated' }));
    });
});
