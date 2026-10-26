import type Stripe from 'stripe';

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

const FORBIDDEN_HOST_PARTS = ['phoenix-cleanhouse', 'regroup-app.com', 'recovery-connect'];
// <region>-regroup-e2e, where a region is e.g. us-central1: no other project id can match.
const E2E_FUNCTIONS_HOST = /^[a-z]+-[a-z]+[0-9]+-regroup-e2e\.cloudfunctions\.net$/;

/** Fixed rule, never operator input: https://<region>-regroup-e2e.cloudfunctions.net/<name>, no port or credentials. */
export function isAllowedWebhookUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  return (
    parsed.protocol === 'https:' &&
    E2E_FUNCTIONS_HOST.test(host) &&
    parsed.port === '' &&
    parsed.search === '' &&
    parsed.hash === '' &&
    parsed.username === '' &&
    parsed.password === '' &&
    /^\/[A-Za-z0-9_-]+$/.test(parsed.pathname) &&
    !FORBIDDEN_HOST_PARTS.some((part) => host.includes(part))
  );
}

/** Pure validation; call before any Stripe client exists. */
export function assertWebhookUrls(platformUrl: string, connectUrl: string): void {
  for (const url of [platformUrl, connectUrl]) {
    if (!isAllowedWebhookUrl(url)) {
      throw new Error(
        `Webhook URL not allowed (https://<region>-regroup-e2e.cloudfunctions.net/<name>): ${url}`,
      );
    }
  }
  if (platformUrl === connectUrl) throw new Error('Platform and connect webhook URLs must differ.');
}

type Kind = 'platform' | 'connect';

export type WebhookOptions = {
  platformUrl: string;
  connectUrl: string;
  /** Stripe API version every endpoint is pinned to, so staging events match production's shape. */
  apiVersion: string;
  /**
   * Awaited right after each endpoint is created, because Stripe reveals the
   * secret once. Only called for newly created endpoints.
   */
  onSecret: (kind: Kind, secret: string) => void | Promise<void>;
  /**
   * Whether the secret of an existing endpoint was saved. An endpoint created
   * by a run that died before saving its secret cannot be reused: Stripe will
   * not reveal that secret again.
   */
  hasSecret?: (kind: Kind) => boolean;
};

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
      assertEndpointMatches(found, spec, opts.apiVersion);
      if (opts.hasSecret && !opts.hasSecret(spec.kind)) {
        throw new Error(
          `Webhook endpoint ${found.id} exists but its ${spec.kind} signing secret was not saved. ` +
            'Delete that endpoint in the Stripe Dashboard and rerun.',
        );
      }
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
    await opts.onSecret(spec.kind, created.secret);
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
