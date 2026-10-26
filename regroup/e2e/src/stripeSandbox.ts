import type Stripe from 'stripe';

/** The pre-existing sandbox whose webhooks point at production. Never touch it. */
export const PRODUCTION_SANDBOX_ACCOUNT_ID = 'acct_1RXiFg2KPgAtfsl6';
/** The live production account (regroup-app.com). Its sk_test_ keys must be refused too. */
export const LIVE_PRODUCTION_ACCOUNT_ID = 'acct_1GfryQKsstp3aqoP';
/** The only account this setup may touch: the dedicated e2e sandbox behind regroup-e2e. */
export const E2E_SANDBOX_ACCOUNT_ID = 'acct_1UUsyi44OQke4tKl';

/** Maps price env var names (regroup/functions/.env.example) to Stripe price ids. */
export type PriceIds = Record<string, string>;

type TierSpec = {
  key: string; // lookup_key / product id stem
  label: string;
  amountCents: number;
  envVar: string;
  annualEnvVar: string;
};

const tier = (key: string, label: string, amountCents: number, envVar: string): TierSpec => ({
  key,
  label,
  amountCents,
  envVar,
  annualEnvVar: `${envVar}_ANNUAL`,
});

// Source: regroup/functions/src/config.ts SUBSCRIPTION_TIERS.
export const TIERS: readonly TierSpec[] = [
  tier('trad_starter', 'Traditional Starter', 6900, 'STRIPE_PRICE_TRAD_STARTER'),
  tier('trad_professional', 'Traditional Professional', 12900, 'STRIPE_PRICE_TRAD_PROFESSIONAL'),
  tier('trad_enterprise', 'Traditional Enterprise', 24900, 'STRIPE_PRICE_TRAD_ENTERPRISE'),
  tier('oxford_standard', 'Oxford Standard', 4900, 'STRIPE_PRICE_OXFORD_STANDARD'),
  tier('oxford_plus', 'Oxford Plus', 8900, 'STRIPE_PRICE_OXFORD_PLUS'),
  tier('oxford_network', 'Oxford Network', 29900, 'STRIPE_PRICE_OXFORD_NETWORK'),
];

// Source: regroup/functions/src/api/stripe.ts (legacy per-house plans, $49 / $79).
const LEGACY_PRICES = [
  {
    key: 'legacy_house',
    label: 'Regroup House',
    amountCents: 4900,
    envVar: 'STRIPE_HOUSE_PRICE_ID',
  },
  {
    key: 'legacy_oxford',
    label: 'Regroup Oxford',
    amountCents: 7900,
    envVar: 'STRIPE_OXFORD_PRICE_ID',
  },
];

/** Every price env var ensureCatalog fills: the keys of stripe-e2e-prices.json. */
export const PRICE_ENV_VARS: readonly string[] = [
  ...TIERS.flatMap((tier) => [tier.envVar, tier.annualEnvVar]),
  ...LEGACY_PRICES.map((legacy) => legacy.envVar),
];

// Source: api/stripe.ts bundleCouponIds; percentages per pricing decision P-6
// (docs/launch-readiness/regroup-pricing-revision-plan.md, docs/go-to-market/monetization.md).
const COUPONS = [
  { id: 'regroup-bundle-3', percent_off: 10 },
  { id: 'regroup-bundle-5', percent_off: 15 },
];

const isMissing = (err: unknown): boolean =>
  (err as { code?: string } | null)?.code === 'resource_missing';

async function ensureProduct(stripe: Stripe, id: string, name: string): Promise<void> {
  let existing: Stripe.Product | undefined;
  try {
    existing = await stripe.products.retrieve(id);
  } catch (err) {
    if (!isMissing(err)) throw err;
  }
  if (!existing) {
    await stripe.products.create({ id, name });
  } else if (!existing.active) {
    throw new Error(`Existing product ${id} is archived; not updating.`);
  }
}

async function ensurePrice(
  stripe: Stripe,
  params: { lookupKey: string; product: string; amountCents: number; interval: 'month' | 'year' },
): Promise<string> {
  const existing = (await stripe.prices.list({ lookup_keys: [params.lookupKey], limit: 1 }))
    .data[0];
  if (existing) {
    const productId =
      typeof existing.product === 'string' ? existing.product : existing.product?.id;
    if (
      !existing.active ||
      existing.currency !== 'usd' ||
      existing.unit_amount !== params.amountCents ||
      existing.recurring?.interval !== params.interval ||
      productId !== params.product
    ) {
      throw new Error(
        `Existing price ${params.lookupKey} does not match the catalogue; not updating.`,
      );
    }
    return existing.id;
  }
  const created = await stripe.prices.create({
    lookup_key: params.lookupKey,
    product: params.product,
    unit_amount: params.amountCents,
    currency: 'usd',
    recurring: { interval: params.interval },
    metadata: { source: 'regroup-e2e-sandbox' },
  });
  return created.id;
}

async function ensureCoupon(stripe: Stripe, id: string, percentOff: number): Promise<void> {
  let existing: Stripe.Coupon | undefined;
  try {
    existing = await stripe.coupons.retrieve(id);
  } catch (err) {
    if (!isMissing(err)) throw err;
  }
  if (!existing) {
    await stripe.coupons.create({ id, percent_off: percentOff, duration: 'forever' });
  } else if (
    existing.percent_off !== percentOff ||
    !existing.valid ||
    existing.duration !== 'forever'
  ) {
    throw new Error(
      `Existing coupon ${id} is not a valid ${percentOff}% forever coupon; not updating.`,
    );
  }
}

/**
 * Idempotent: products by fixed id, prices by lookup_key, coupons by id. Never updates;
 * reuse requires an active product, an active usd price with the catalogue amount,
 * interval and product, and a valid forever coupon at the catalogue percentage.
 */
export async function ensureCatalog(stripe: Stripe): Promise<PriceIds> {
  const ids: PriceIds = {};
  for (const tier of TIERS) {
    const product = `regroup_tier_${tier.key}`;
    await ensureProduct(stripe, product, tier.label);
    ids[tier.envVar] = await ensurePrice(stripe, {
      lookupKey: `${product}_monthly`,
      product,
      amountCents: tier.amountCents,
      interval: 'month',
    });
    ids[tier.annualEnvVar] = await ensurePrice(stripe, {
      lookupKey: `${product}_annual`,
      product,
      amountCents: tier.amountCents * 10,
      interval: 'year',
    });
  }
  for (const legacy of LEGACY_PRICES) {
    const product = `regroup_${legacy.key}`;
    await ensureProduct(stripe, product, legacy.label);
    ids[legacy.envVar] = await ensurePrice(stripe, {
      lookupKey: `${product}_monthly`,
      product,
      amountCents: legacy.amountCents,
      interval: 'month',
    });
  }
  for (const coupon of COUPONS) await ensureCoupon(stripe, coupon.id, coupon.percent_off);
  return ids;
}

/** Key shape check; needs no Stripe call. */
export function assertTestKey(key: string): void {
  if (/^(sk|rk)_live_/.test(key)) throw new Error('Refusing to run with a live-mode Stripe key.');
  if (!/^(sk|rk)_test_/.test(key))
    throw new Error('Refusing to run: key is not an sk_test_/rk_test_ key.');
}

/**
 * Returns the account id after confirming it is the e2e sandbox. An allowlist,
 * not a denylist: a test key of any other account, including production's, is refused.
 */
export async function assertSandboxAccount(stripe: Stripe, key: string): Promise<string> {
  assertTestKey(key);
  const account = await stripe.accounts.retrieve();
  if (account.id === PRODUCTION_SANDBOX_ACCOUNT_ID) {
    throw new Error(
      `Refusing to run against ${PRODUCTION_SANDBOX_ACCOUNT_ID}: it hosts production-pointing webhooks.`,
    );
  }
  if (account.id === LIVE_PRODUCTION_ACCOUNT_ID) {
    throw new Error(
      `Refusing to run against ${LIVE_PRODUCTION_ACCOUNT_ID}: it is the live production account (regroup-app.com).`,
    );
  }
  if (account.id !== E2E_SANDBOX_ACCOUNT_ID) {
    throw new Error(
      `Refusing to run against ${account.id}: only the e2e sandbox ${E2E_SANDBOX_ACCOUNT_ID} is allowed.`,
    );
  }
  return account.id;
}
