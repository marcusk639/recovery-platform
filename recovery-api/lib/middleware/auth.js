"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireServiceAuth = requireServiceAuth;
const https_1 = require("firebase-functions/v2/https");
const apps_1 = require("../config/apps");
// Incoming X-App-Id / appId claims are resolved through the registry, so
// display names and legacy aliases (e.g. 'sober-living' → 'phoenix-cleanhouse')
// are accepted and normalized to the canonical app-id before validation.
const ORIGINATOR_LIST = apps_1.ORIGINATOR_APP_IDS.join(', ');
/** Resolve a raw X-App-Id / appId claim to a canonical originator app-id, or undefined. */
function resolveOriginator(raw) {
    var _a;
    const appId = (_a = (0, apps_1.resolveApp)(raw)) === null || _a === void 0 ? void 0 : _a.appId;
    if (appId && (0, apps_1.isOriginatorAppId)(appId)) {
        return appId;
    }
    return undefined;
}
/**
 * Phase 1: Verify X-Service-Key + extract X-App-Id / X-User-Uid / X-User-Email.
 * Phase 2 fallback: use request.auth token claims (appId, email).
 */
function requireServiceAuth(request) {
    var _a, _b;
    const headers = request.rawRequest.headers;
    const serviceKey = headers['x-service-key'];
    const apiKey = process.env.RECOVERY_PLATFORM_API_KEY;
    if (apiKey && serviceKey === apiKey) {
        const rawAppId = headers['x-app-id'];
        const uid = headers['x-user-uid'];
        const email = (_a = headers['x-user-email']) !== null && _a !== void 0 ? _a : '';
        const appId = rawAppId ? resolveOriginator(rawAppId) : undefined;
        if (!appId) {
            throw new https_1.HttpsError('unauthenticated', `X-App-Id must be one of: ${ORIGINATOR_LIST}`);
        }
        if (!uid) {
            throw new https_1.HttpsError('unauthenticated', 'Missing X-User-Uid header');
        }
        return { appId, uid, email };
    }
    // Phase 2: Firebase custom token flow
    if (request.auth) {
        const rawAppId = request.auth.token['appId'];
        const appId = rawAppId ? resolveOriginator(rawAppId) : undefined;
        if (!appId) {
            throw new https_1.HttpsError('unauthenticated', 'Missing or invalid appId claim');
        }
        return {
            appId,
            uid: request.auth.uid,
            email: (_b = request.auth.token.email) !== null && _b !== void 0 ? _b : '',
        };
    }
    throw new https_1.HttpsError('unauthenticated', 'Unauthorized');
}
