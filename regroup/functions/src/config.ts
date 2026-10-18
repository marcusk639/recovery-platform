/**
 * Firebase Secret Manager definitions.
 * Set each secret before deploying:
 *   firebase functions:secrets:set SENDGRID_API_KEY
 *   firebase functions:secrets:set STRIPE_SECRET_KEY
 *   firebase functions:secrets:set STRIPE_CLIENT_ID
 *   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
 *   firebase functions:secrets:set STRIPE_CONNECT_WEBHOOK_SECRET
 *   firebase functions:secrets:set GOOGLE_MAPS_API_KEY
 *   firebase functions:secrets:set RECOVERY_PLATFORM_API_KEY
 *
 * The two test-mode signing secrets below are always offered for verification,
 * whatever mode the bound Stripe key is in — the key's mode only ORDERS the
 * candidates. What the key's mode does decide is which events may be ACTED on:
 * util/verifyStripeWebhook.ts requires a verified event's mode to match both the
 * secret that verified it and this deployment, so on a live deployment a
 * test-mode event is verified and then refused:
 *   firebase functions:secrets:set STRIPE_TEST_WEBHOOK_SECRET
 *   firebase functions:secrets:set STRIPE_CONNECT_TEST_WEBHOOK_SECRET
 *
 * Declare which secrets a function uses in its options object:
 *   onCall({ secrets: [SENDGRID_API_KEY] }, async (request) => { ... })
 *
 * Access at runtime via process.env.SECRET_NAME
 */
import { logger } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";

export const SENDGRID_API_KEY = defineSecret("SENDGRID_API_KEY");
export const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
export const STRIPE_CLIENT_ID = defineSecret("STRIPE_CLIENT_ID");
export const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");
export const STRIPE_CONNECT_WEBHOOK_SECRET = defineSecret(
  "STRIPE_CONNECT_WEBHOOK_SECRET"
);

// Test-mode webhook signing secrets. Separate from the live pair above because a
// signature only verifies against the secret of the endpoint that signed it, and
// a test and a live endpoint on the same URL are two endpoints.
//
// Bound alongside the live pair on both functions so that a deployment pointed at
// a test key can verify its webhooks, and so that a cross-mode event is diagnosed
// as "wrong mode" rather than as an opaque signature failure. It does NOT widen
// what a deployment will act on: util/verifyStripeWebhook.ts refuses any verified
// event whose mode differs from this deployment's, so on a live deployment the
// test secret can verify an event but never get one processed.
//
// Candidate ordering lives in util/stripeWebhookSecrets.ts.
export const STRIPE_TEST_WEBHOOK_SECRET = defineSecret(
  "STRIPE_TEST_WEBHOOK_SECRET"
);
export const STRIPE_CONNECT_TEST_WEBHOOK_SECRET = defineSecret(
  "STRIPE_CONNECT_TEST_WEBHOOK_SECRET"
);

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
  "RECOVERY_PLATFORM_API_KEY"
);

/**
 * Rent application-fee model (P-1/P-3 of the pricing revision plan).
 *
 * The platform fee has TWO parts, and the sum is what Stripe is told to take:
 *
 *   application_fee_amount = platform margin + estimated Stripe processing cost
 *
 * WHY THE STRIPE COST IS INCLUDED. These are destination charges, so the
 * platform is merchant of record and Stripe debits its processing fee from the
 * PLATFORM, not the house. A margin-only fee was therefore loss-making: 0.75%
 * collected against ~2.9% + 30c paid meant roughly -$11 on a $500 card payment.
 *
 * The model used to assume the resident covered processing through a disclosed
 * convenience fee (the old P-2). That fee was never built — no code added it and
 * no screen disclosed it — so the assumption silently financed every card
 * payment out of platform margin. Rather than build it, the house now bears
 * processing, which is also where the card-vs-ACH cost difference can actually
 * be acted on.
 *
 * WHY NOT `on_behalf_of`, which would pass the real cost through exactly:
 * Stripe's Connect guidance lists it under traps to avoid for marketplace
 * flows, and it would make the house merchant of record and put the house's
 * name on the resident's bank statement. Stripe's recommendation for a platform
 * fee under ~4% on destination charges is exactly this — fold the estimated
 * processing cost into `application_fee_amount`.
 *
 * THE TRADE-OFF THIS ACCEPTS: it is an ESTIMATE. An Amex or a non-US card costs
 * more than the figures below and the platform absorbs the difference. Revisit
 * the rates if the card mix shifts; they are env-overridable for exactly that.
 *
 * ROLLBACK: set the four stripe-cost values below to 0 and the fee reverts
 * to margin-only, with no code change.
 *
 * - ACH / bank transfer: a flat per-transaction margin (cheap, to nudge bank
 *   pay). If `RENT_FEE_ACH_RATE` is set > 0, a percentage-with-cap model is
 *   used instead (0.5% capped at $3, per P-1's alternative).
 * - Legacy houses are grandfathered at the old flat 2% (P-3) until migrated.
 *
 * All values are integer-cents / decimal-rate, env-overridable for tuning.
 * Stripe's published US rates are the defaults; see stripe.com/pricing.
 */
export const RENT_FEE = {
  // Platform margin.
  achFlatCents: Number(process.env.RENT_FEE_ACH_FLAT_CENTS ?? 200), // $2.00
  achRate: Number(process.env.RENT_FEE_ACH_RATE ?? 0), // 0 = use flat fee
  achCapCents: Number(process.env.RENT_FEE_ACH_CAP_CENTS ?? 300), // $3.00 cap
  cardPlatformRate: Number(process.env.RENT_FEE_CARD_PLATFORM_RATE ?? 0.0075), // 0.75%

  // Estimated Stripe processing cost, recovered from the house so the margin
  // above is what the platform actually keeps. Set to 0 to disable recovery.
  stripeCardRate: Number(process.env.RENT_FEE_STRIPE_CARD_RATE ?? 0.029), // 2.9%
  stripeCardFixedCents: Number(
    process.env.RENT_FEE_STRIPE_CARD_FIXED_CENTS ?? 30
  ), // 30c
  stripeAchRate: Number(process.env.RENT_FEE_STRIPE_ACH_RATE ?? 0.008), // 0.8%
  stripeAchCapCents: Number(process.env.RENT_FEE_STRIPE_ACH_CAP_CENTS ?? 500), // $5.00 cap
} as const;

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

export type ConnectAccountsApi = "v1" | "v2";

// Which Stripe Accounts API creates NEW house accounts. Accounts v2 is gated:
// Stripe has to enable it for the platform on request, and until then a v2
// create is rejected (non_connect_platform_accounts_v2_access_blocked). So
// anything other than exactly "v2" means v1. Existing houses keep the API
// recorded on them (houses.stripeAccountApi); this only affects new accounts.
export const connectAccountsApi = (): ConnectAccountsApi => {
  const value = process.env.CONNECT_ACCOUNTS_API;
  if (value !== undefined && value !== "v1" && value !== "v2") {
    // Most likely a typo of "v2" that would otherwise silently keep v1.
    logger.warn("CONNECT_ACCOUNTS_API is not v1 or v2; creating v1 accounts", {
      value,
    });
  }
  return value === "v2" ? "v2" : "v1";
};
