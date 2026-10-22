import type Stripe from 'stripe';

/** The pre-existing sandbox whose webhooks point at production. Never touch it. */
export const PRODUCTION_SANDBOX_ACCOUNT_ID = 'acct_1RXiFg2KPgAtfsl6';

/** Maps price env var names (regroup/functions/.env.example) to Stripe price ids. */
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

// Source: regroup/functions/src/webhooks/stripeWebhook.ts switch statements.
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
  'account.updated',
  'payout.failed',
] as Stripe.WebhookEndpointCreateParams.EnabledEvent[];

export const CONNECT_EVENTS = [
  'account.updated',
  'account.application.deauthorized',
] as Stripe.WebhookEndpointCreateParams.EnabledEvent[];

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
  const existing = await stripe.prices.list({ lookup_keys: [params.lookupKey], limit: 1 });
  if (existing.data[0]) return existing.data[0].id;
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
  try {
    await stripe.coupons.retrieve(id);
  } catch (err) {
    if (!isMissing(err)) throw err;
    await stripe.coupons.create({ id, percent_off: percentOff, duration: 'forever' });
  }
}

/** Idempotent: products by fixed id, prices by lookup_key, coupons by id. */
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
  /** Called only when an endpoint is newly created; Stripe reveals the secret once. */
  onSecret?: (kind: 'platform' | 'connect', secret: string) => void;
};

async function listEndpoints(stripe: Stripe): Promise<Stripe.WebhookEndpoint[]> {
  const page = await stripe.webhookEndpoints.list({ limit: 100 });
  if (page.has_more) throw new Error('More than 100 webhook endpoints; refusing to guess.');
  return page.data;
}

export async function ensureWebhooks(stripe: Stripe, opts: WebhookOptions): Promise<void> {
  const existing = await listEndpoints(stripe);
  const specs = [
    { kind: 'platform' as const, url: opts.platformUrl, events: PLATFORM_EVENTS, connect: false },
    { kind: 'connect' as const, url: opts.connectUrl, events: CONNECT_EVENTS, connect: true },
  ];
  for (const spec of specs) {
    if (existing.some((e) => e.url === spec.url)) continue;
    const created = await stripe.webhookEndpoints.create({
      url: spec.url,
      enabled_events: spec.events,
      ...(spec.connect ? { connect: true } : {}),
    });
    if (created.secret) opts.onSecret?.(spec.kind, created.secret);
  }
}

/** Read-only: throws when an enabled endpoint points outside the allowed prefixes. */
export async function assertSandboxHygiene(
  stripe: Stripe,
  allowedUrlPrefixes: string[],
): Promise<void> {
  const offenders = (await listEndpoints(stripe)).filter(
    (e) => e.status === 'enabled' && !allowedUrlPrefixes.some((p) => e.url.startsWith(p)),
  );
  if (offenders.length > 0) {
    const list = offenders.map((e) => `${e.id} -> ${e.url}`).join(', ');
    throw new Error(`Sandbox has enabled webhook endpoints outside the e2e allowlist: ${list}`);
  }
}

export async function assertSandboxAccount(stripe: Stripe, key: string): Promise<void> {
  if (/^(sk|rk)_live_/.test(key)) throw new Error('Refusing to run with a live-mode Stripe key.');
  const account = await stripe.accounts.retrieve();
  if (account.id === PRODUCTION_SANDBOX_ACCOUNT_ID) {
    throw new Error(
      `Refusing to run against ${PRODUCTION_SANDBOX_ACCOUNT_ID}: it hosts production-pointing webhooks.`,
    );
  }
}
