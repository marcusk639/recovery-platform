import type Stripe from 'stripe';

/** The pre-existing sandbox whose webhooks point at production. Never touch it. */
export const PRODUCTION_SANDBOX_ACCOUNT_ID = 'acct_1RXiFg2KPgAtfsl6';

/**
 * Maps price env var names (regroup/functions/src/config.ts SUBSCRIPTION_TIERS
 * priceEnvVar/annualPriceEnvVar, and regroup/scripts/stripe-prices.env) to Stripe price ids.
 */
export type PriceIds = Record<string, string>;

type TierSpec = {
  key: string; // lookup_key / product id stem
  label: string;
  amountCents: number;
  envVar: string;
  annualEnvVar: string;
};

// Source: regroup/functions/src/config.ts SUBSCRIPTION_TIERS.
export const TIERS: TierSpec[] = [
  ['trad_starter', 'Traditional Starter', 6900, 'STRIPE_PRICE_TRAD_STARTER'],
  ['trad_professional', 'Traditional Professional', 12900, 'STRIPE_PRICE_TRAD_PROFESSIONAL'],
  ['trad_enterprise', 'Traditional Enterprise', 24900, 'STRIPE_PRICE_TRAD_ENTERPRISE'],
  ['oxford_standard', 'Oxford Standard', 4900, 'STRIPE_PRICE_OXFORD_STANDARD'],
  ['oxford_plus', 'Oxford Plus', 8900, 'STRIPE_PRICE_OXFORD_PLUS'],
  ['oxford_network', 'Oxford Network', 29900, 'STRIPE_PRICE_OXFORD_NETWORK'],
].map(([key, label, amountCents, envVar]) => ({
  key: key as string,
  label: label as string,
  amountCents: amountCents as number,
  envVar: envVar as string,
  annualEnvVar: `${envVar}_ANNUAL`,
}));

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

// Source: api/stripe.ts bundleCouponIds; percentages per docs/go-to-market/monetization.md
// (the "20%" in an api/stripe.ts comment is stale).
const COUPONS = [
  { id: 'regroup-bundle-3', percent_off: 10 },
  { id: 'regroup-bundle-5', percent_off: 15 },
];

// Source: regroup/functions/src/webhooks/stripeWebhook.ts switch statements, minus
// account.updated: production's platform endpoint does not subscribe to it
// (scripts/stripe-product-values.md section 4a); it arrives via the Connect endpoint.
export const PLATFORM_EVENTS = [
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'charge.dispute.created',
  'charge.dispute.closed',
  'charge.refunded',
  'charge.refund.updated',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'customer.subscription.deleted',
  'customer.subscription.updated',
  'payout.failed',
] as Stripe.WebhookEndpointCreateParams.EnabledEvent[];

export const CONNECT_EVENTS = [
  'account.updated',
  'account.application.deauthorized',
] as Stripe.WebhookEndpointCreateParams.EnabledEvent[];

// Load-bearing even though HOST_PATTERN already excludes these: it is the
// independent second check if the pattern is ever loosened.
const FORBIDDEN_HOST_PARTS = ['phoenix-cleanhouse', 'regroup-app.com', 'recovery-connect'];

/** <gcp-region>-regroup-e2e, e.g. us-central1-regroup-e2e. Project id is exact. */
const HOST_PATTERN = /^[a-z]+-[a-z]+[0-9]+-regroup-e2e\.cloudfunctions\.net$/;

/**
 * Deployed function names (regroup/functions/src/index.ts): the platform
 * handler is exported as `stripeEvents`; the Connect one as-is.
 */
export const WEBHOOK_PATHS = {
  platform: '/stripeEvents',
  connect: '/handleStripeConnectWebhook',
} as const;

const EXPECTED_SHAPE = 'https://<region>-regroup-e2e.cloudfunctions.net';

/**
 * Fixed rule, never operator input. The string must already be the canonical
 * WHATWG href (so nothing normalises differently between here and Stripe) and
 * equal https://<region>-regroup-e2e.cloudfunctions.net<path> character for
 * character: no port, credentials, query, fragment, or empty `?`/`#`.
 */
function matchesWebhookRule(url: string, paths: readonly string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname;
  return (
    parsed.href === url &&
    parsed.protocol === 'https:' &&
    HOST_PATTERN.test(host) &&
    !FORBIDDEN_HOST_PARTS.some((part) => host.includes(part)) &&
    paths.includes(parsed.pathname) &&
    url === `https://${host}${parsed.pathname}`
  );
}

/** True for either e2e endpoint URL; used to judge endpoints already in the sandbox. */
export function isAllowedWebhookUrl(url: string): boolean {
  return matchesWebhookRule(url, Object.values(WEBHOOK_PATHS));
}

/** Pure validation; call before any Stripe client exists. */
export function assertWebhookUrls(platformUrl: string, connectUrl: string): void {
  const checks = [
    ['Platform', platformUrl, WEBHOOK_PATHS.platform],
    ['Connect', connectUrl, WEBHOOK_PATHS.connect],
  ] as const;
  for (const [label, url, expectedPath] of checks) {
    if (!matchesWebhookRule(url, [expectedPath])) {
      throw new Error(
        `${label} webhook URL not allowed: expected ${EXPECTED_SHAPE}${expectedPath}, got ${JSON.stringify(url)}`,
      );
    }
  }
  // Identical URLs cannot pass: each endpoint is pinned to a different path.
}

const isMissing = (err: unknown): boolean =>
  (err as { code?: string } | null)?.code === 'resource_missing';

async function ensureProduct(stripe: Stripe, id: string, name: string): Promise<void> {
  try {
    await stripe.products.retrieve(id);
  } catch (err) {
    if (!isMissing(err)) throw err;
    await stripe.products.create({ id, name });
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
  } else if (existing.percent_off !== percentOff) {
    throw new Error(`Existing coupon ${id} is not ${percentOff}% off; not updating.`);
  }
}

/** Idempotent: products by fixed id, prices by lookup_key, coupons by id. Verifies reuse, never updates. */
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

export type WebhookOptions = {
  platformUrl: string;
  connectUrl: string;
  /**
   * Awaited right after each endpoint is created, because Stripe reveals the
   * secret once. Only called for newly created endpoints.
   */
  onSecret?: (kind: 'platform' | 'connect', secret: string) => void | Promise<void>;
};

async function listEndpoints(stripe: Stripe): Promise<Stripe.WebhookEndpoint[]> {
  const page = await stripe.webhookEndpoints.list({ limit: 100 });
  if (page.has_more) throw new Error('More than 100 webhook endpoints; refusing to guess.');
  return page.data;
}

function assertEndpointMatches(
  endpoint: Stripe.WebhookEndpoint,
  events: readonly string[],
  connect: boolean,
): void {
  const have = [...endpoint.enabled_events].sort().join(',');
  const want = [...events].sort().join(',');
  // Stripe does not always echo the connect flag back; only compare when present.
  const flag = (endpoint as { connect?: boolean }).connect;
  if (endpoint.status !== 'enabled' || have !== want || (flag !== undefined && flag !== connect)) {
    throw new Error(
      `Existing webhook endpoint ${endpoint.id} does not match the e2e spec; not updating.`,
    );
  }
}

export async function ensureWebhooks(stripe: Stripe, opts: WebhookOptions): Promise<void> {
  assertWebhookUrls(opts.platformUrl, opts.connectUrl);
  const existing = await listEndpoints(stripe);
  const specs = [
    { kind: 'platform' as const, url: opts.platformUrl, events: PLATFORM_EVENTS, connect: false },
    { kind: 'connect' as const, url: opts.connectUrl, events: CONNECT_EVENTS, connect: true },
  ];
  for (const spec of specs) {
    const found = existing.find((e) => e.url === spec.url);
    if (found) {
      assertEndpointMatches(found, spec.events, spec.connect);
      continue;
    }
    const created = await stripe.webhookEndpoints.create({
      url: spec.url,
      enabled_events: spec.events,
      ...(spec.connect ? { connect: true } : {}),
    });
    if (created.secret) await opts.onSecret?.(spec.kind, created.secret);
  }
}

/** Read-only: throws when an enabled endpoint violates the fixed allowlist rule. */
export async function assertSandboxHygiene(stripe: Stripe): Promise<void> {
  const offenders = (await listEndpoints(stripe)).filter(
    (e) => e.status === 'enabled' && !isAllowedWebhookUrl(e.url),
  );
  if (offenders.length > 0) {
    const list = offenders.map((e) => `${e.id} -> ${e.url}`).join(', ');
    throw new Error(`Sandbox has enabled webhook endpoints outside the e2e allowlist: ${list}`);
  }
}

/** Key shape check; needs no Stripe call. */
export function assertTestKey(key: string): void {
  if (/^(sk|rk)_live_/.test(key)) throw new Error('Refusing to run with a live-mode Stripe key.');
  if (!/^(sk|rk)_test_/.test(key))
    throw new Error('Refusing to run: key is not an sk_test_/rk_test_ key.');
}

/** Returns the account id after confirming this is not the production-pointing sandbox. */
export async function assertSandboxAccount(stripe: Stripe, key: string): Promise<string> {
  assertTestKey(key);
  const account = await stripe.accounts.retrieve();
  if (account.id === PRODUCTION_SANDBOX_ACCOUNT_ID) {
    throw new Error(
      `Refusing to run against ${PRODUCTION_SANDBOX_ACCOUNT_ID}: it hosts production-pointing webhooks.`,
    );
  }
  return account.id;
}
