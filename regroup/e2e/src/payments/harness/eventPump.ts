import Stripe from 'stripe';
import { pinnedStripeApiVersion } from '../../launchConfig';
import { FUNCTIONS_BASE, LOCAL_WEBHOOK_SECRET_FILE, readConfigFile } from './guards';

const PATHS = { platform: 'stripeEvents', connect: 'handleStripeConnectWebhook' } as const;
const RELATED_FIELDS = ['id', 'customer', 'subscription', 'payment_intent', 'charge', 'account'];

/** Signs an event the way Stripe does and posts it to the emulated webhook. */
export async function deliver(
  event: Stripe.Event | object,
  opts: { endpoint?: keyof typeof PATHS; secret?: string } = {},
): Promise<{ status: number; body: string }> {
  const payload = JSON.stringify(event);
  const secret = opts.secret ?? readConfigFile(LOCAL_WEBHOOK_SECRET_FILE);
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  const res = await fetch(`${FUNCTIONS_BASE}/${PATHS[opts.endpoint ?? 'platform']}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': header },
    body: payload,
  });
  return { status: res.status, body: await res.text() };
}

function relatesTo(event: Stripe.Event, objectId: string): boolean {
  const object = event.data.object as unknown as Record<string, unknown>;
  return RELATED_FIELDS.some((field) => object[field] === objectId) || (event.account ?? '') === objectId;
}

async function listSince(stripe: Stripe, since: number, types?: string[]): Promise<Stripe.Event[]> {
  const events: Stripe.Event[] = [];
  let startingAfter: string | undefined;
  for (;;) {
    const page = await stripe.events.list({
      created: { gte: since },
      limit: 100,
      ...(types ? { types } : {}),
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    events.push(...page.data);
    if (!page.has_more) return events;
    startingAfter = page.data[page.data.length - 1].id;
  }
}

/**
 * The object's events since `since`, oldest first, once the list has stopped
 * growing. Tests decide what to deliver and when. Throws on an event rendered in
 * another API version, so a test can't pass on a payload production wouldn't get.
 */
export async function fetchEvents(
  stripe: Stripe,
  opts: { since: number; objectId: string; types?: string[]; settleMs?: number; timeoutMs?: number },
): Promise<Stripe.Event[]> {
  const { since, objectId, types, settleMs = 2000, timeoutMs = 30000 } = opts;
  const pinned = pinnedStripeApiVersion();
  const deadline = Date.now() + timeoutMs;
  let previous = -1;
  for (;;) {
    const events = (await listSince(stripe, since, types)).filter((e) => relatesTo(e, objectId));
    for (const event of events) {
      if (event.api_version !== pinned) {
        throw new Error(`${event.id} is rendered in API version ${event.api_version}, not the pinned ${pinned}.`);
      }
    }
    const settled = events.length === previous && (events.length > 0 || Date.now() > deadline);
    if (settled || settleMs === 0) {
      return events.sort((a, b) => a.created - b.created || (a.id < b.id ? -1 : 1));
    }
    previous = events.length;
    await new Promise((resolve) => setTimeout(resolve, settleMs));
  }
}
