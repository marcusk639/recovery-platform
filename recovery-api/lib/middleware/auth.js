"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireServiceAuth = requireServiceAuth;
const https_1 = require("firebase-functions/v2/https");
const VALID_APP_IDS = new Set(['homegroups', 'sober-living']);
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
        const appId = headers['x-app-id'];
        const uid = headers['x-user-uid'];
        const email = (_a = headers['x-user-email']) !== null && _a !== void 0 ? _a : '';
        if (!appId || !VALID_APP_IDS.has(appId)) {
            throw new https_1.HttpsError('unauthenticated', 'X-App-Id must be homegroups or sober-living');
        }
        if (!uid) {
            throw new https_1.HttpsError('unauthenticated', 'Missing X-User-Uid header');
        }
        return { appId: appId, uid, email };
    }
    // Phase 2: Firebase custom token flow
    if (request.auth) {
        const appId = request.auth.token['appId'];
        if (!appId || !VALID_APP_IDS.has(appId)) {
            throw new https_1.HttpsError('unauthenticated', 'Missing or invalid appId claim');
        }
        return {
            appId: appId,
            uid: request.auth.uid,
            email: (_b = request.auth.token.email) !== null && _b !== void 0 ? _b : '',
        };
    }
    throw new https_1.HttpsError('unauthenticated', 'Unauthorized');
}
