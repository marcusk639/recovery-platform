"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getReferral = exports.getReferrals = exports.createReferral = void 0;
exports.handleCreateReferral = handleCreateReferral;
exports.handleGetReferrals = handleGetReferrals;
exports.handleGetReferral = handleGetReferral;
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const firestore_1 = require("firebase-admin/firestore");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const config_1 = require("../config");
const apps_1 = require("../config/apps");
// `toApp` accepts a display name, alias, or canonical app-id on the wire; it is
// resolved to the canonical app-id (and validated as a target) before storage.
const CreateReferralSchema = zod_1.z.object({
    toApp: zod_1.z.string().min(1).max(64),
    clientName: zod_1.z.string().min(1).max(100),
    clientEmail: zod_1.z.string().email(),
    condition: zod_1.z.string().max(200).optional(),
    notes: zod_1.z.string().max(500).optional(),
});
async function handleCreateReferral(data, context, db) {
    let parsed;
    try {
        parsed = CreateReferralSchema.parse(data);
    }
    catch (err) {
        if (err instanceof zod_1.z.ZodError) {
            // Log issue paths/codes only — never the raw payload (clientName/email are PII).
            v2_1.logger.warn('createReferral: invalid payload', { issues: err.issues });
            throw new https_1.HttpsError('invalid-argument', 'Invalid referral payload');
        }
        throw err;
    }
    const toApp = (0, apps_1.resolveAppId)(parsed.toApp);
    if (!toApp || !(0, apps_1.isTargetAppId)(toApp)) {
        throw new https_1.HttpsError('invalid-argument', `Unknown referral target: ${parsed.toApp}`);
    }
    // Drop the raw wire `toApp` so the spread can't re-store the unnormalized value;
    // the canonical `toApp` below is the only one persisted.
    const { toApp: _rawToApp } = parsed, rest = __rest(parsed, ["toApp"]);
    try {
        const ref = await db.collection('referrals').add(Object.assign(Object.assign({}, rest), { toApp, fromApp: context.appId, referredBy: context.uid, referredByApp: context.appId, status: 'pending', createdAt: new Date() }));
        return { id: ref.id, status: 'pending' };
    }
    catch (err) {
        v2_1.logger.error('createReferral: persistence failed', err);
        throw new https_1.HttpsError('internal', 'Failed to create referral');
    }
}
async function handleGetReferrals(context, db) {
    const snap = await db
        .collection('referrals')
        .where('referredBy', '==', context.uid)
        .where('referredByApp', '==', context.appId)
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();
    const referrals = snap.docs.map((d) => (Object.assign({ id: d.id }, d.data())));
    return { referrals };
}
async function handleGetReferral(data, context, db) {
    const doc = await db.collection('referrals').doc(data.id).get();
    if (!doc.exists)
        throw new https_1.HttpsError('not-found', 'Referral not found');
    const referral = doc.data();
    if (referral.referredBy !== context.uid || referral.referredByApp !== context.appId) {
        throw new https_1.HttpsError('permission-denied', 'Forbidden');
    }
    return Object.assign({ id: doc.id }, referral);
}
exports.createReferral = (0, https_1.onCall)({ secrets: [config_1.RECOVERY_PLATFORM_API_KEY] }, async (request) => {
    const context = (0, auth_1.requireServiceAuth)(request);
    return handleCreateReferral(request.data, context, (0, firestore_1.getFirestore)());
});
exports.getReferrals = (0, https_1.onCall)({ secrets: [config_1.RECOVERY_PLATFORM_API_KEY] }, async (request) => {
    const context = (0, auth_1.requireServiceAuth)(request);
    return handleGetReferrals(context, (0, firestore_1.getFirestore)());
});
exports.getReferral = (0, https_1.onCall)({ secrets: [config_1.RECOVERY_PLATFORM_API_KEY] }, async (request) => {
    const context = (0, auth_1.requireServiceAuth)(request);
    return handleGetReferral(request.data, context, (0, firestore_1.getFirestore)());
});
