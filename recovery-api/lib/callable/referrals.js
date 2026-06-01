"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getReferral = exports.getReferrals = exports.createReferral = void 0;
exports.handleCreateReferral = handleCreateReferral;
exports.handleGetReferrals = handleGetReferrals;
exports.handleGetReferral = handleGetReferral;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const config_1 = require("../config");
const TARGET_APPS = [
    'treatment-center',
    'phoenix-cleanhouse',
    'homegroups',
    'sober-living',
];
const CreateReferralSchema = zod_1.z.object({
    toApp: zod_1.z.enum(TARGET_APPS),
    clientName: zod_1.z.string().min(1).max(100),
    clientEmail: zod_1.z.string().email(),
    condition: zod_1.z.string().max(200).optional(),
    notes: zod_1.z.string().max(500).optional(),
});
async function handleCreateReferral(data, context, db) {
    const parsed = CreateReferralSchema.parse(data);
    const ref = await db.collection('referrals').add(Object.assign(Object.assign({}, parsed), { fromApp: context.appId, referredBy: context.uid, referredByApp: context.appId, status: 'pending', createdAt: new Date() }));
    return { id: ref.id, status: 'pending' };
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
