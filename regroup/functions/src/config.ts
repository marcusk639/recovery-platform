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

export const SUBSCRIPTION_TIERS = {
  traditional: {
    starter: {
      priceEnvVar: "STRIPE_PRICE_TRAD_STARTER",
      amountCents: 6900,
      maxResidents: 10,
      maxProperties: 1,
      label: "Traditional Starter",
    },
    professional: {
      priceEnvVar: "STRIPE_PRICE_TRAD_PROFESSIONAL",
      amountCents: 12900,
      maxResidents: 20,
      maxProperties: 3,
      label: "Traditional Professional",
    },
    enterprise: {
      priceEnvVar: "STRIPE_PRICE_TRAD_ENTERPRISE",
      amountCents: 24900,
      maxResidents: null,
      maxProperties: null,
      label: "Traditional Enterprise",
    },
  },
  oxford: {
    standard: {
      priceEnvVar: "STRIPE_PRICE_OXFORD_STANDARD",
      amountCents: 4900,
      maxResidents: 15,
      maxProperties: 1,
      label: "Oxford Standard",
    },
    plus: {
      priceEnvVar: "STRIPE_PRICE_OXFORD_PLUS",
      amountCents: 8900,
      maxResidents: 25,
      maxProperties: 1,
      label: "Oxford Plus",
    },
    network: {
      priceEnvVar: "STRIPE_PRICE_OXFORD_NETWORK",
      amountCents: 29900,
      maxResidents: null,
      maxProperties: null,
      label: "Oxford Network",
    },
  },
} as const;

export type HouseType = keyof typeof SUBSCRIPTION_TIERS;
export type TraditionalTier = keyof typeof SUBSCRIPTION_TIERS.traditional;
export type OxfordTier = keyof typeof SUBSCRIPTION_TIERS.oxford;
export type TierKey = TraditionalTier | OxfordTier;

// Gate for the tier-based flat-fee billing model. New subscriptions use the
// tier model only when this is exactly "true". Legacy subscribers are unaffected.
export const isTierBillingEnabled = (): boolean =>
  process.env.TIER_BILLING_ENABLED === "true";
