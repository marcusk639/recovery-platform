/**
 * Firebase Secret Manager definitions.
 * Set each secret before deploying:
 *   firebase functions:secrets:set SENDGRID_API_KEY
 *   firebase functions:secrets:set STRIPE_SECRET_KEY
 *   firebase functions:secrets:set STRIPE_CLIENT_ID
 *   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
 *   firebase functions:secrets:set STRIPE_CONNECT_WEBHOOK_SECRET
 *   firebase functions:secrets:set RATS_API_KEY
 *   firebase functions:secrets:set GOOGLE_MAPS_API_KEY
 *
 * Declare which secrets a function uses in its options object:
 *   onCall({ secrets: [SENDGRID_API_KEY] }, async (request) => { ... })
 *
 * Access at runtime via process.env.SECRET_NAME
 */
import { defineSecret } from "firebase-functions/params";

export const SENDGRID_API_KEY = defineSecret("SENDGRID_API_KEY");
export const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
export const STRIPE_CLIENT_ID = defineSecret("STRIPE_CLIENT_ID");
export const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");
export const STRIPE_CONNECT_WEBHOOK_SECRET = defineSecret(
  "STRIPE_CONNECT_WEBHOOK_SECRET",
);

// Shared bearer token used to authenticate RATS → RecoveryConnect HTTP calls.
// Set in Firebase Secret Manager: firebase functions:secrets:set RATS_API_KEY
// The same value must be configured in RecoveryConnect's environment.
export const RATS_API_KEY = defineSecret("RATS_API_KEY");

// Google Maps Platform API key (Geocoding API, Time Zone API).
// Set in Firebase Secret Manager: firebase functions:secrets:set GOOGLE_MAPS_API_KEY
// Restrict to specific APIs + IPs in Google Cloud Console.
export const GOOGLE_MAPS_API_KEY = defineSecret("GOOGLE_MAPS_API_KEY");
