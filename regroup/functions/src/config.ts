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

// Shared service key for server-to-server calls into recovery-api (the shared
// meeting directory). Must match recovery-api's RECOVERY_PLATFORM_API_KEY.
// Set in Firebase Secret Manager: firebase functions:secrets:set RECOVERY_PLATFORM_API_KEY
// The recovery-api base URL is a non-secret deploy config read from
// process.env.RECOVERY_API_BASE_URL.
export const RECOVERY_PLATFORM_API_KEY = defineSecret(
  "RECOVERY_PLATFORM_API_KEY",
);

/**
 * Rent application-fee model (P-1/P-2/P-3 of the pricing revision plan).
 *
 * - ACH / bank transfer: a flat per-transaction fee (cheap, to nudge bank pay).
 *   If `RENT_FEE_ACH_RATE` is set > 0, a percentage-with-cap model is used
 *   instead (0.5% capped at $3, per P-1's alternative) — flat is the default.
 * - Card: a thin platform fee on top of Stripe's processing cost. The card
 *   processing cost itself is borne by the resident as a disclosed convenience
 *   fee (P-2), so it is NOT double-charged here.
 * - Legacy houses are grandfathered at the old flat 2% (P-3) until migrated.
 *
 * All values are integer-cents / decimal-rate, env-overridable for tuning.
 */
export const RENT_FEE = {
  achFlatCents: Number(process.env.RENT_FEE_ACH_FLAT_CENTS ?? 200), // $2.00
  achRate: Number(process.env.RENT_FEE_ACH_RATE ?? 0), // 0 = use flat fee
  achCapCents: Number(process.env.RENT_FEE_ACH_CAP_CENTS ?? 300), // $3.00 cap
  cardPlatformRate: Number(process.env.RENT_FEE_CARD_PLATFORM_RATE ?? 0.0075), // 0.75%
  legacyRate: Number(process.env.RENT_FEE_LEGACY_RATE ?? 0.02), // 2%
} as const;

/**
 * Explicit allow-list of house IDs grandfathered at the legacy 2% rent fee
 * (the 5 legacy houses, per P-3). Comma-separated in the environment.
 * Houses may also be flagged individually via `house.legacyRentFee === true`.
 */
export const LEGACY_RENT_FEE_HOUSE_IDS = (
  process.env.LEGACY_RENT_FEE_HOUSE_IDS ?? ""
)
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

export const SUBSCRIPTION_TIERS = {
  traditional: {
    starter: {
      priceEnvVar: "STRIPE_PRICE_TRAD_STARTER",
      annualPriceEnvVar: "STRIPE_PRICE_TRAD_STARTER_ANNUAL",
      amountCents: 6900,
      maxResidents: 10,
      maxProperties: 1,
      label: "Traditional Starter",
      features: {
        automatedRentCollection: false,
        multiProperty: false,
        complianceExport: false,
        analytics: false,
        whiteLabel: false,
      },
    },
    professional: {
      priceEnvVar: "STRIPE_PRICE_TRAD_PROFESSIONAL",
      annualPriceEnvVar: "STRIPE_PRICE_TRAD_PROFESSIONAL_ANNUAL",
      amountCents: 12900,
      maxResidents: 20,
      maxProperties: 3,
      label: "Traditional Professional",
      features: {
        automatedRentCollection: true,
        multiProperty: true,
        complianceExport: true,
        analytics: true,
        whiteLabel: false,
      },
    },
    enterprise: {
      priceEnvVar: "STRIPE_PRICE_TRAD_ENTERPRISE",
      annualPriceEnvVar: "STRIPE_PRICE_TRAD_ENTERPRISE_ANNUAL",
      amountCents: 24900,
      maxResidents: null,
      maxProperties: null,
      label: "Traditional Enterprise",
      features: {
        automatedRentCollection: true,
        multiProperty: true,
        complianceExport: true,
        analytics: true,
        whiteLabel: true,
      },
    },
  },
  oxford: {
    standard: {
      priceEnvVar: "STRIPE_PRICE_OXFORD_STANDARD",
      annualPriceEnvVar: "STRIPE_PRICE_OXFORD_STANDARD_ANNUAL",
      amountCents: 4900,
      maxResidents: 15,
      maxProperties: 1,
      label: "Oxford Standard",
      features: {
        automatedRentCollection: false,
        multiProperty: false,
        complianceExport: false,
        analytics: false,
        whiteLabel: false,
      },
    },
    plus: {
      priceEnvVar: "STRIPE_PRICE_OXFORD_PLUS",
      annualPriceEnvVar: "STRIPE_PRICE_OXFORD_PLUS_ANNUAL",
      amountCents: 8900,
      maxResidents: 25,
      maxProperties: 1,
      label: "Oxford Plus",
      features: {
        automatedRentCollection: true,
        multiProperty: true,
        complianceExport: true,
        analytics: true,
        whiteLabel: false,
      },
    },
    network: {
      priceEnvVar: "STRIPE_PRICE_OXFORD_NETWORK",
      annualPriceEnvVar: "STRIPE_PRICE_OXFORD_NETWORK_ANNUAL",
      amountCents: 29900,
      maxResidents: null,
      maxProperties: null,
      label: "Oxford Network",
      // P-8: keep the tier defined but block checkout until a regional chapter
      // signs and validates the price.
      availableForSale: false,
      features: {
        automatedRentCollection: true,
        multiProperty: true,
        complianceExport: true,
        analytics: true,
        whiteLabel: true,
      },
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
