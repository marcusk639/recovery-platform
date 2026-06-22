"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const apps_1 = require("./apps");
describe('app registry resolution', () => {
    it('resolves display names to canonical app-ids', () => {
        expect((0, apps_1.resolveAppId)('Homegroups')).toBe('homegroups');
        expect((0, apps_1.resolveAppId)('Regroup')).toBe('phoenix-cleanhouse');
        expect((0, apps_1.resolveAppId)('Next Step Recovery')).toBe('nextstep-recovery');
    });
    it('resolves the legacy sober-living alias to phoenix-cleanhouse', () => {
        expect((0, apps_1.resolveAppId)('sober-living')).toBe('phoenix-cleanhouse');
    });
    it('resolves canonical app-ids to themselves', () => {
        expect((0, apps_1.resolveAppId)('homegroups')).toBe('homegroups');
        expect((0, apps_1.resolveAppId)('treatment-center')).toBe('treatment-center');
    });
    it('is case- and whitespace-insensitive', () => {
        expect((0, apps_1.resolveAppId)('  rEgRoUp  ')).toBe('phoenix-cleanhouse');
    });
    it('returns undefined for unknown values', () => {
        expect((0, apps_1.resolveApp)('not-an-app')).toBeUndefined();
        expect((0, apps_1.resolveAppId)('not-an-app')).toBeUndefined();
    });
    it('returns undefined for non-string input instead of throwing', () => {
        // Phase 2 JWT appId claims are client-influenceable; a non-string claim must
        // resolve to undefined, not throw `value.trim is not a function` (opaque 500).
        expect((0, apps_1.resolveApp)(undefined)).toBeUndefined();
        expect((0, apps_1.resolveApp)(123)).toBeUndefined();
        expect((0, apps_1.resolveApp)({ appId: 'homegroups' })).toBeUndefined();
    });
    it('never maps one lookup key to two different entries (no cross-entry collision)', () => {
        var _a;
        // appId/displayName may coincide WITHIN an entry (e.g. 'treatment-center');
        // what must never happen is one key silently resolving to a different entry
        // (byKey is last-writer-wins, so a collision would corrupt resolution).
        const owner = new Map();
        for (const entry of apps_1.APP_REGISTRY) {
            const keys = [
                entry.appId.toLowerCase(),
                entry.displayName.toLowerCase(),
                ...((_a = entry.aliases) !== null && _a !== void 0 ? _a : []).map((a) => a.toLowerCase()),
            ];
            for (const key of keys) {
                const existing = owner.get(key);
                expect(existing === undefined || existing === entry).toBe(true);
                owner.set(key, entry);
            }
        }
    });
    it('classifies originators vs targets', () => {
        // treatment-center is target-only (no credentials of its own).
        expect((0, apps_1.isOriginatorAppId)('treatment-center')).toBe(false);
        expect((0, apps_1.isTargetAppId)('treatment-center')).toBe(true);
        expect((0, apps_1.isOriginatorAppId)('nextstep-recovery')).toBe(true);
        expect(apps_1.ORIGINATOR_APP_IDS).not.toContain('treatment-center');
        expect(apps_1.TARGET_APP_IDS).toContain('treatment-center');
    });
});
