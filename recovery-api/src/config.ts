/**
 * Firebase Secret Manager definitions for recovery-platform functions.
 * Set before deploying:
 *   firebase functions:secrets:set RECOVERY_PLATFORM_API_KEY
 *
 * Access at runtime via process.env.RECOVERY_PLATFORM_API_KEY
 */
import { defineSecret } from "firebase-functions/params";
import { setGlobalOptions } from "firebase-functions/v2";

export const RECOVERY_PLATFORM_API_KEY = defineSecret(
  "RECOVERY_PLATFORM_API_KEY",
);

setGlobalOptions({
  region: "us-central1",
  secrets: [RECOVERY_PLATFORM_API_KEY],
});
