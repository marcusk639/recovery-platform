import Stripe from "stripe";

// --- Environment Variable Names (Use uppercase by convention) ---
const STRIPE_TEST_SECRET_KEY_ENV = "STRIPE_TEST_SECRET_KEY";
const STRIPE_TEST_WEBHOOK_SECRET_ENV = "STRIPE_TEST_WEBHOOK_SECRET";
const STRIPE_TEST_CONNECT_WEBHOOK_SECRET_ENV =
  "STRIPE_TEST_CONNECT_WEBHOOK_SECRET";
const STRIPE_TEST_PRICE_ID_MEMBER_ENV = "STRIPE_TEST_PRICE_ID_MEMBER";
const STRIPE_TEST_PRODUCT_ID_GROUP_ENV = "STRIPE_TEST_PRODUCT_ID_GROUP";
const STRIPE_SECRET_KEY_ENV = "STRIPE_SECRET_KEY";
const STRIPE_WEBHOOK_SECRET_ENV = "STRIPE_WEBHOOK_SECRET";
const STRIPE_CONNECT_WEBHOOK_SECRET_ENV = "STRIPE_CONNECT_WEBHOOK_SECRET";
const STRIPE_PRICE_ID_MEMBER_ENV = "STRIPE_PRICE_ID_MEMBER";
const STRIPE_PRODUCT_ID_GROUP_ENV = "STRIPE_PRODUCT_ID_GROUP";

// V4.4: Intergroup product env var names
const STRIPE_PRODUCT_ID_INTERGROUP_A_ENV = "STRIPE_PRODUCT_ID_INTERGROUP_A";
const STRIPE_PRODUCT_ID_INTERGROUP_B_ENV = "STRIPE_PRODUCT_ID_INTERGROUP_B";
const STRIPE_TEST_PRODUCT_ID_INTERGROUP_A_ENV =
  "STRIPE_TEST_PRODUCT_ID_INTERGROUP_A";
const STRIPE_TEST_PRODUCT_ID_INTERGROUP_B_ENV =
  "STRIPE_TEST_PRODUCT_ID_INTERGROUP_B";

// Direct price ID env vars — preferred fallback for getDefaultPriceForProduct.
// Set these to skip the Stripe API round-trip and avoid a throw when a product
// has no default_price configured in the Stripe dashboard.
const STRIPE_PRICE_ID_GROUP_ENV = "STRIPE_PRICE_ID_GROUP";
const STRIPE_TEST_PRICE_ID_GROUP_ENV = "STRIPE_TEST_PRICE_ID_GROUP";
const STRIPE_PRICE_ID_INTERGROUP_A_ENV = "STRIPE_PRICE_ID_INTERGROUP_A";
const STRIPE_TEST_PRICE_ID_INTERGROUP_A_ENV = "STRIPE_TEST_PRICE_ID_INTERGROUP_A";
const STRIPE_PRICE_ID_INTERGROUP_B_ENV = "STRIPE_PRICE_ID_INTERGROUP_B";
const STRIPE_TEST_PRICE_ID_INTERGROUP_B_ENV = "STRIPE_TEST_PRICE_ID_INTERGROUP_B";

// Determine if we're in test mode (use test keys if test secret key is set)
const isTestMode = !!process.env[STRIPE_TEST_SECRET_KEY_ENV];

// V4.4: Intergroup product IDs
export const productIdIntergroupA = isTestMode
  ? process.env[STRIPE_TEST_PRODUCT_ID_INTERGROUP_A_ENV]
  : process.env[STRIPE_PRODUCT_ID_INTERGROUP_A_ENV];

export const productIdIntergroupB = isTestMode
  ? process.env[STRIPE_TEST_PRODUCT_ID_INTERGROUP_B_ENV]
  : process.env[STRIPE_PRODUCT_ID_INTERGROUP_B_ENV];

// Retrieve configuration securely from process.env
const stripeSecretKey = isTestMode
  ? process.env[STRIPE_TEST_SECRET_KEY_ENV]
  : process.env[STRIPE_SECRET_KEY_ENV];
const webhookSecret = isTestMode
  ? process.env[STRIPE_TEST_WEBHOOK_SECRET_ENV]
  : process.env[STRIPE_WEBHOOK_SECRET_ENV];
const connectWebhookSecret = isTestMode
  ? process.env[STRIPE_TEST_CONNECT_WEBHOOK_SECRET_ENV]
  : process.env[STRIPE_CONNECT_WEBHOOK_SECRET_ENV];
const priceIdMember = isTestMode
  ? process.env[STRIPE_TEST_PRICE_ID_MEMBER_ENV]
  : process.env[STRIPE_PRICE_ID_MEMBER_ENV];
const productIdGroup = isTestMode
  ? process.env[STRIPE_TEST_PRODUCT_ID_GROUP_ENV]
  : process.env[STRIPE_PRODUCT_ID_GROUP_ENV];

// Centralized configuration
const TRIAL_PERIOD_DAYS = 7;
const PLATFORM_FEE_PERCENT = 0.05; // 5% platform fee on donations

/**
 * Verify that required environment variables are configured.
 * Called lazily on first Stripe access — NOT at module load — because secrets
 * from Cloud Secret Manager are not available during the local source-analysis
 * phase of `firebase deploy`. They ARE available at function runtime (after
 * Firebase injects them per the `secrets: [...]` binding in index.ts).
 */
function checkRequiredEnvVars(): void {
  const required: string[] = [
    isTestMode ? STRIPE_TEST_SECRET_KEY_ENV : STRIPE_SECRET_KEY_ENV,
    "RATS_API_KEY",
  ];

  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    const message = `Required environment variables not configured: ${missing.join(", ")}`;
    console.error(message);
    throw new Error(message);
  }
}

// Warn-only at module load (don't throw — would crash `firebase deploy` analysis).
if (!webhookSecret) {
  const webhookEnv = isTestMode
    ? STRIPE_TEST_WEBHOOK_SECRET_ENV
    : STRIPE_WEBHOOK_SECRET_ENV;
  console.warn(
    `Stripe webhook secret (${webhookEnv}) is not configured. Platform webhook verification will fail.`,
  );
}
if (!connectWebhookSecret) {
  const connectWebhookEnv = isTestMode
    ? STRIPE_TEST_CONNECT_WEBHOOK_SECRET_ENV
    : STRIPE_CONNECT_WEBHOOK_SECRET_ENV;
  console.warn(
    `Stripe Connect webhook secret (${connectWebhookEnv}) is not configured. Connect webhook verification will fail.`,
  );
}
if (!priceIdMember) {
  const priceEnv = isTestMode
    ? STRIPE_TEST_PRICE_ID_MEMBER_ENV
    : STRIPE_PRICE_ID_MEMBER_ENV;
  console.warn(`Stripe Price ID for members (${priceEnv}) is not configured.`);
}
if (!productIdGroup) {
  const productEnv = isTestMode
    ? STRIPE_TEST_PRODUCT_ID_GROUP_ENV
    : STRIPE_PRODUCT_ID_GROUP_ENV;
  console.warn(
    `Stripe Product ID for Groups (${productEnv}) is not configured.`,
  );
}

// Lazy Stripe instance.
// We can't call `new Stripe(key)` at module load because secrets from Cloud
// Secret Manager aren't available during the local source-analysis pass of
// `firebase deploy`. At function runtime they ARE present (injected by the
// `secrets: [...]` binding in index.ts), so instantiation defers to first use.
// A Proxy lets us keep the `import { stripe } from './utils/stripe'` API
// across all 25 call sites — no changes needed elsewhere.
let _stripeInstance: Stripe | undefined;
function ensureStripe(): Stripe {
  if (_stripeInstance) return _stripeInstance;
  checkRequiredEnvVars();
  // Re-read at first use — by now secrets are injected at runtime
  const key = isTestMode
    ? process.env[STRIPE_TEST_SECRET_KEY_ENV]
    : process.env[STRIPE_SECRET_KEY_ENV];
  if (!key) {
    const envName = isTestMode
      ? STRIPE_TEST_SECRET_KEY_ENV
      : STRIPE_SECRET_KEY_ENV;
    throw new Error(`Stripe secret key (${envName}) is not configured.`);
  }
  _stripeInstance = new Stripe(key, {
    apiVersion: "2025-12-15.clover",
    typescript: true,
  });
  return _stripeInstance;
}

const stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    return Reflect.get(ensureStripe(), prop, receiver);
  },
});

// Custom error class for non-retriable errors
export class NonRetriableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetriableError";
  }
}

/**
 * Get the default price ID for a product
 * @param productId - The Stripe product ID
 * @returns The default price ID for the product
 */
export async function getDefaultPriceForProduct(
  productId: string,
): Promise<string> {
  // Check direct env-var price IDs first — avoids a Stripe API round-trip and
  // works even when the Stripe product has no default_price configured in the
  // dashboard. Operators set STRIPE_PRICE_ID_GROUP / _INTERGROUP_A / _B.
  const directPriceMap: Record<string, string | undefined> = {
    ...(productIdGroup
      ? {
          [productIdGroup]: isTestMode
            ? process.env[STRIPE_TEST_PRICE_ID_GROUP_ENV]
            : process.env[STRIPE_PRICE_ID_GROUP_ENV],
        }
      : {}),
    ...(productIdIntergroupA
      ? {
          [productIdIntergroupA]: isTestMode
            ? process.env[STRIPE_TEST_PRICE_ID_INTERGROUP_A_ENV]
            : process.env[STRIPE_PRICE_ID_INTERGROUP_A_ENV],
        }
      : {}),
    ...(productIdIntergroupB
      ? {
          [productIdIntergroupB]: isTestMode
            ? process.env[STRIPE_TEST_PRICE_ID_INTERGROUP_B_ENV]
            : process.env[STRIPE_PRICE_ID_INTERGROUP_B_ENV],
        }
      : {}),
  };
  const directPriceId = directPriceMap[productId];
  if (directPriceId) return directPriceId;

  // Fall back to retrieving default_price from the Stripe product object.
  try {
    const product = await stripe.products.retrieve(productId);
    const defaultPriceId =
      typeof product.default_price === "string"
        ? product.default_price
        : product.default_price?.id;

    if (!defaultPriceId) {
      throw new Error(`Product ${productId} has no default price set`);
    }

    return defaultPriceId;
  } catch (error: any) {
    console.error(
      `Error fetching default price for product ${productId}:`,
      error,
    );
    throw new Error(
      `Failed to get default price for product ${productId}: ${error.message}`,
    );
  }
}

export function assertGroupPriceIsAnnual(price: Stripe.Price): void {
  if (price.recurring?.interval !== "year") {
    throw new Error(
      `Stripe price ${price.id} must be annual (got "${price.recurring?.interval ?? "null"}"). ` +
        `Check the Stripe dashboard — productIdGroup must have a yearly price as its default.`,
    );
  }
}

// Export the initialized instance and config values
export {
  stripe,
  webhookSecret,
  connectWebhookSecret,
  priceIdMember,
  productIdGroup,
  isTestMode,
  TRIAL_PERIOD_DAYS,
  PLATFORM_FEE_PERCENT,
  // Exporting the env var names can be useful for setting them
  STRIPE_TEST_SECRET_KEY_ENV,
  STRIPE_TEST_WEBHOOK_SECRET_ENV,
  STRIPE_TEST_CONNECT_WEBHOOK_SECRET_ENV,
  STRIPE_TEST_PRICE_ID_MEMBER_ENV,
  STRIPE_TEST_PRODUCT_ID_GROUP_ENV,
  STRIPE_SECRET_KEY_ENV,
  STRIPE_WEBHOOK_SECRET_ENV,
  STRIPE_CONNECT_WEBHOOK_SECRET_ENV,
  STRIPE_PRICE_ID_MEMBER_ENV,
  STRIPE_PRODUCT_ID_GROUP_ENV,
};
