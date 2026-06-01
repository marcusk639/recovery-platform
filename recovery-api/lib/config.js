"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RECOVERY_PLATFORM_API_KEY = void 0;
/**
 * Firebase Secret Manager definitions for recovery-platform functions.
 * Set before deploying:
 *   firebase functions:secrets:set RECOVERY_PLATFORM_API_KEY
 *
 * Access at runtime via process.env.RECOVERY_PLATFORM_API_KEY
 */
const params_1 = require("firebase-functions/params");
const v2_1 = require("firebase-functions/v2");
exports.RECOVERY_PLATFORM_API_KEY = (0, params_1.defineSecret)("RECOVERY_PLATFORM_API_KEY");
(0, v2_1.setGlobalOptions)({
    region: "us-central1",
    secrets: [exports.RECOVERY_PLATFORM_API_KEY],
});
