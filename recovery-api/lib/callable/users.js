"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateUserProfile = exports.getUserProfile = void 0;
exports.handleGetUserProfile = handleGetUserProfile;
exports.handleUpdateUserProfile = handleUpdateUserProfile;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const config_1 = require("../config");
const UpdateProfileSchema = zod_1.z.object({
    displayName: zod_1.z.string().min(1).max(100).optional(),
    sobrietyDate: zod_1.z.string().date().optional(),
    homeApp: zod_1.z.string().optional(),
});
async function handleGetUserProfile(context, db) {
    const docId = `${context.appId}:${context.uid}`;
    const doc = await db.collection('users').doc(docId).get();
    if (!doc.exists)
        return { profile: null };
    return { profile: doc.data() };
}
async function handleUpdateUserProfile(data, context, db) {
    const parsed = UpdateProfileSchema.parse(data);
    const docId = `${context.appId}:${context.uid}`;
    await db
        .collection('users')
        .doc(docId)
        .set(Object.assign(Object.assign({}, parsed), { updatedAt: new Date() }), { merge: true });
    return { updated: true };
}
exports.getUserProfile = (0, https_1.onCall)({ secrets: [config_1.RECOVERY_PLATFORM_API_KEY] }, async (request) => {
    const context = (0, auth_1.requireServiceAuth)(request);
    return handleGetUserProfile(context, (0, firestore_1.getFirestore)());
});
exports.updateUserProfile = (0, https_1.onCall)({ secrets: [config_1.RECOVERY_PLATFORM_API_KEY] }, async (request) => {
    const context = (0, auth_1.requireServiceAuth)(request);
    return handleUpdateUserProfile(request.data, context, (0, firestore_1.getFirestore)());
});
