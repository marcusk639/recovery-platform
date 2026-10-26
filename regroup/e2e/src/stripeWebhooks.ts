import type Stripe from 'stripe';

// Source: regroup/functions/src/webhooks/stripeWebhook.ts switch statements. Matches the
// production platform endpoint: account.updated arrives via the Connect endpoint, as in production.
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

const FORBIDDEN_HOST_PARTS = ['phoenix-cleanhouse', 'regroup-app.com', 'recovery-connect'];
// <region>-regroup-e2e, where a region is e.g. us-central1: no other project id can match.
const E2E_FUNCTIONS_HOST = /^[a-z]+-[a-z]+[0-9]+-regroup-e2e\.cloudfunctions\.net$/;

export type Kind = 'platform' | 'connect';

/** Shape of stripe-e2e-webhook-secrets.json: each kind's whsec_ secret and the id of its endpoint. */
export type SecretsFile = Partial<Record<Kind | `${Kind}EndpointId`, string>>;
export const endpointIdKey = (kind: Kind): `${Kind}EndpointId` => `${kind}EndpointId`;

/**
 * Deployed function names (regroup/functions/src/index.ts): the platform handler is
 * exported as `stripeEvents`, the Connect one as-is.
 */
export const WEBHOOK_PATHS: Readonly<Record<Kind, `/${string}`>> = {
  platform: '/stripeEvents',
  connect: '/handleStripeConnectWebhook',
};

/**
 * Fixed rule, never operator input. The string must already be the canonical WHATWG
 * href (nothing normalises differently here and at Stripe) and equal
 * https://<region>-regroup-e2e.cloudfunctions.net<path> character for character:
 * no port, credentials, query, fragment, or empty `?`/`#`.
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
    E2E_FUNCTIONS_HOST.test(host) &&
    !FORBIDDEN_HOST_PARTS.some((part) => host.includes(part)) &&
    paths.includes(parsed.pathname) &&
    url === `https://${host}${parsed.pathname}`
  );
}

/** True for either e2e endpoint URL; used to judge endpoints already in the sandbox. */
export function isAllowedWebhookUrl(url: string): boolean {
  return matchesWebhookRule(url, Object.values(WEBHOOK_PATHS));
}

/** Pure validation; call before any Stripe client exists. Swapped or misspelt paths fail. */
export function assertWebhookUrls(platformUrl: string, connectUrl: string): void {
  const checks: [string, string, string][] = [
    ['Platform', platformUrl, WEBHOOK_PATHS.platform],
    ['Connect', connectUrl, WEBHOOK_PATHS.connect],
  ];
  for (const [label, url, expectedPath] of checks) {
    if (!matchesWebhookRule(url, [expectedPath])) {
      throw new Error(
        `${label} webhook URL not allowed: expected https://<region>-regroup-e2e.cloudfunctions.net${expectedPath}`,
      );
    }
  }
}

export type WebhookOptions = {
  platformUrl: string;
  connectUrl: string;
  /** Stripe API version every endpoint is pinned to, so staging events match production's shape. */
  apiVersion: string;
  /**
   * Awaited right after each endpoint is created, because Stripe reveals the
   * secret once. Only called for newly created endpoints.
   */
  onSecret: (kind: Kind, secret: string, endpointId: string) => void | Promise<void>;
  /**
   * Whether, and how, a secret was saved for THIS endpoint: see SecretStatus. An
   * endpoint whose secret is not on file is never reused, and the operator is told
   * how to recover the secret (rescue file, or reveal it in the Dashboard) before
   * any deletion, because a live endpoint's secret may already be deployed.
   */
  secretStatus: (kind: Kind, endpointId: string) => SecretStatus;
  /** Path of the secrets file, named in recovery instructions. */
  secretsFile: string;
};

/**
 * 'saved': a whsec_ secret recorded for this endpoint. 'unbound': a secret with no
 * endpoint id (the file predates ids). { rescued }: the secret is in that rescue file.
 * 'missing': anything else, including a secret recorded for an endpoint id other
 * than this one (for example, one since deleted).
 */
export type SecretStatus = 'saved' | 'unbound' | 'missing' | { rescued: string };

async function listEndpoints(stripe: Stripe): Promise<Stripe.WebhookEndpoint[]> {
  const page = await stripe.webhookEndpoints.list({ limit: 100 });
  if (page.has_more) throw new Error('More than 100 webhook endpoints; refusing to guess.');
  return page.data;
}

function assertEndpointMatches(
  endpoint: Stripe.WebhookEndpoint,
  spec: { events: readonly string[]; connect: boolean },
  apiVersion: string,
): void {
  const have = [...endpoint.enabled_events].sort().join(',');
  const want = [...spec.events].sort().join(',');
  if (endpoint.status !== 'enabled' || have !== want) {
    throw new Error(
      `Existing webhook endpoint ${endpoint.id} does not match the e2e spec; not updating.`,
    );
  }
  // null means "the account's default version", which is not the pinned one.
  if (endpoint.api_version !== apiVersion) {
    throw new Error(
      `Existing webhook endpoint ${endpoint.id} is not on API version ${apiVersion}; ` +
        'Stripe cannot change it, so delete that endpoint in the Stripe Dashboard and rerun.',
    );
  }
  // The endpoint object has no `connect` field; a Connect endpoint carries the platform's `application`.
  const isConnect = Boolean(endpoint.application);
  if (isConnect !== spec.connect) {
    throw new Error(
      `Existing webhook endpoint ${endpoint.id} is a ${isConnect ? 'Connect' : 'platform'} endpoint ` +
        `but this URL needs a ${spec.connect ? 'Connect' : 'platform'} one; delete it and rerun.`,
    );
  }
}

/** Throws unless the endpoint's secret is on file; every message leads with a non-destructive fix. */
function assertSecretOnFile(kind: Kind, id: string, opts: WebhookOptions): void {
  const status = opts.secretStatus(kind, id);
  if (status === 'saved') return;
  const idKey = endpointIdKey(kind);
  if (status === 'unbound') {
    throw new Error(
      `The secrets file has a ${kind} signing secret but no ${idKey} ` +
        '(it predates endpoint ids). Do not delete the endpoint: its secret may be deployed. ' +
        `If that secret belongs to ${id}, add "${idKey}": "${id}" to ${opts.secretsFile} and rerun.`,
    );
  }
  if (typeof status === 'object') {
    throw new Error(
      `The ${kind} signing secret of webhook endpoint ${id} is in the rescue file ${status.rescued}. ` +
        `Merge its "${kind}" and "${idKey}" into ${opts.secretsFile} and rerun; the endpoint is fine.`,
    );
  }
  throw new Error(
    `Webhook endpoint ${id} exists but its ${kind} signing secret was not saved for this endpoint. ` +
      `Reveal the endpoint's signing secret in the Stripe Dashboard (Developers → Webhooks → ${id} → ` +
      `Signing secret) and add "${kind}": "<its signing secret>" and "${idKey}": "${id}" to ` +
      `${opts.secretsFile}, then rerun. Delete the endpoint only if it is not in use.`,
  );
}

export async function ensureWebhooks(stripe: Stripe, opts: WebhookOptions): Promise<void> {
  assertWebhookUrls(opts.platformUrl, opts.connectUrl);
  const existing = await listEndpoints(stripe);
  const specs = [
    { kind: 'platform' as const, url: opts.platformUrl, events: PLATFORM_EVENTS, connect: false },
    { kind: 'connect' as const, url: opts.connectUrl, events: CONNECT_EVENTS, connect: true },
  ];
  for (const spec of specs) {
    // Disabled endpoints are ignored: they receive nothing, and a new one is created beside them.
    const enabled = existing.filter((e) => e.url === spec.url && e.status === 'enabled');
    if (enabled.length > 1) {
      throw new Error(
        `${enabled.length} enabled webhook endpoints share ${spec.url} ` +
          `(${enabled.map((e) => e.id).join(', ')}); disable all but one in the Stripe Dashboard and rerun.`,
      );
    }
    const found = enabled[0];
    if (found) {
      assertEndpointMatches(found, spec, opts.apiVersion);
      assertSecretOnFile(spec.kind, found.id, opts);
      continue;
    }
    const created = await stripe.webhookEndpoints.create({
      url: spec.url,
      enabled_events: spec.events,
      api_version: opts.apiVersion as Stripe.WebhookEndpointCreateParams.ApiVersion,
      ...(spec.connect ? { connect: true } : {}),
    });
    if (!created.secret) {
      throw new Error(
        `Webhook endpoint ${created.id} was created but Stripe returned no signing secret; ` +
          'delete it in the Stripe Dashboard and rerun.',
      );
    }
    await opts.onSecret(spec.kind, created.secret, created.id);
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '(unparseable URL)';
  }
}

/** Read-only: throws when an enabled endpoint violates the fixed allowlist rule. */
export async function assertSandboxHygiene(stripe: Stripe): Promise<void> {
  const offenders = (await listEndpoints(stripe)).filter(
    (e) => e.status === 'enabled' && !isAllowedWebhookUrl(e.url),
  );
  if (offenders.length > 0) {
    // Host only: an endpoint URL can carry credentials or tokens in its userinfo, path or query.
    const list = offenders.map((e) => `${e.id} -> ${hostOf(e.url)}`).join(', ');
    throw new Error(`Sandbox has enabled webhook endpoints outside the e2e allowlist: ${list}`);
  }
}
