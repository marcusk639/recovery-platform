"use strict";
/**
 * Cross-app registry — the single source of truth for the three namespaces a
 * referral flows through:
 *
 *   display name (wire value)  →  Firebase project id (internal)  →  app-id (stored)
 *
 * Frontends speak DISPLAY NAMES. recovery-api resolves them to the canonical
 * APP-ID at the boundary and stores the app-id form everywhere
 * (`toApp` / `fromApp` / `referredByApp` / `{appId}:{uid}` doc keys).
 * Project ids are an internal detail of that translation — recovery-api runs
 * only in the `recovery-platform` project and never introspects the others.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TARGET_APP_IDS = exports.ORIGINATOR_APP_IDS = exports.APP_REGISTRY = void 0;
exports.resolveApp = resolveApp;
exports.resolveAppId = resolveAppId;
exports.isOriginatorAppId = isOriginatorAppId;
exports.isTargetAppId = isTargetAppId;
exports.APP_REGISTRY = [
    {
        appId: 'homegroups',
        displayName: 'Homegroups',
        projectId: 'recovery-connect-cad4b',
        canOriginate: true,
        canReceive: true,
    },
    {
        appId: 'phoenix-cleanhouse',
        displayName: 'Regroup',
        projectId: 'phoenix-cleanhouse',
        // 'sober-living' was an earlier identity for this product (regroup/RATS).
        aliases: ['sober-living'],
        canOriginate: true,
        canReceive: true,
    },
    {
        appId: 'nextstep-recovery',
        displayName: 'Next Step Recovery',
        // Bare 'nextstep-recovery' is taken; the live project id is suffixed.
        projectId: 'nextsteprecovery-1d5c2',
        canOriginate: true,
        canReceive: true,
    },
    {
        appId: 'treatment-center',
        displayName: 'treatment-center',
        // Target-only today: homegroups' intergroup treatment-center onboarding.
        // Provisionally backed by the homegroups project until a dedicated
        // treatment-center platform exists; it has no credentials of its own.
        projectId: 'recovery-connect-cad4b',
        canOriginate: false,
        canReceive: true,
    },
];
// Lowercased lookup over app-ids, display names, and aliases — built once.
const byKey = (() => {
    var _a;
    const map = new Map();
    for (const entry of exports.APP_REGISTRY) {
        map.set(entry.appId.toLowerCase(), entry);
        map.set(entry.displayName.toLowerCase(), entry);
        for (const alias of (_a = entry.aliases) !== null && _a !== void 0 ? _a : []) {
            map.set(alias.toLowerCase(), entry);
        }
    }
    return map;
})();
/** Resolve a display name, alias, or app-id to its registry entry (case-insensitive). */
function resolveApp(value) {
    if (typeof value !== 'string')
        return undefined;
    return byKey.get(value.trim().toLowerCase());
}
/** Resolve any accepted wire value to the canonical app-id, or undefined if unknown. */
function resolveAppId(value) {
    var _a;
    return (_a = resolveApp(value)) === null || _a === void 0 ? void 0 : _a.appId;
}
/** True if `appId` is a canonical app-id allowed to authenticate / originate referrals. */
function isOriginatorAppId(appId) {
    return exports.APP_REGISTRY.some((e) => e.appId === appId && e.canOriginate);
}
/** True if `appId` is a canonical app-id allowed to be a referral target. */
function isTargetAppId(appId) {
    return exports.APP_REGISTRY.some((e) => e.appId === appId && e.canReceive);
}
exports.ORIGINATOR_APP_IDS = exports.APP_REGISTRY.filter((e) => e.canOriginate).map((e) => e.appId);
exports.TARGET_APP_IDS = exports.APP_REGISTRY.filter((e) => e.canReceive).map((e) => e.appId);
