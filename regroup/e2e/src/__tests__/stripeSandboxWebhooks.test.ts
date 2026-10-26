import { assertSandboxHygiene, ensureWebhooks, STRIPE_API_VERSION } from '../stripeSandbox';
import { makeStripe } from './helpers/mockStripe';

const PLATFORM_URL = 'https://us-central1-regroup-e2e.cloudfunctions.net/stripeEvents';
const CONNECT_URL = 'https://us-central1-regroup-e2e.cloudfunctions.net/handleStripeConnectWebhook';
const opts = { platformUrl: PLATFORM_URL, connectUrl: CONNECT_URL };

describe('ensureWebhooks api_version pin', () => {
  it('mirrors the functions pin (functions/src/util/stripeApiVersion.ts)', () => {
    expect(STRIPE_API_VERSION).toBe('2026-01-28.clover');
  });

  it('creates both endpoints pinned to the API version', async () => {
    const { mock, stripe } = makeStripe();
    await ensureWebhooks(stripe, opts);
    for (const [params] of mock.webhookEndpoints.create.mock.calls as any[]) {
      expect(params.api_version).toBe('2026-01-28.clover');
    }
    expect(mock.webhookEndpoints.create).toHaveBeenCalledTimes(2);
  });

  it('rejects a reused endpoint on a different API version, without updating', async () => {
    const { mock, stripe, endpoints } = makeStripe();
    await ensureWebhooks(stripe, opts);
    endpoints[1].api_version = '2024-06-20';
    await expect(ensureWebhooks(stripe, opts)).rejects.toThrow(/we_1.*api_version/);
    expect(mock.webhookEndpoints.update).not.toHaveBeenCalled();
  });

  it('accepts a reused endpoint that reports no API version', async () => {
    const { stripe, endpoints } = makeStripe();
    await ensureWebhooks(stripe, opts);
    endpoints[0].api_version = null;
    await expect(ensureWebhooks(stripe, opts)).resolves.toBeDefined();
  });
});

describe('webhook endpoint pagination', () => {
  const filler = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `we_fill_${i}`,
      url: `https://elsewhere.example/off-${i}`,
      status: 'disabled',
      enabled_events: [],
    }));

  it('mock pages like Stripe: has_more on page 1, auto-pagination walks every page', async () => {
    const { stripe } = makeStripe({ endpoints: filler(250) });
    const page = await stripe.webhookEndpoints.list({ limit: 100 });
    expect(page.data).toHaveLength(100);
    expect(page.has_more).toBe(true);
    const all = await stripe.webhookEndpoints
      .list({ limit: 100 })
      .autoPagingToArray({ limit: 10000 });
    expect(all).toHaveLength(250);
  });

  it('hygiene catches an offending endpoint on page 2', async () => {
    const endpoints = [
      ...filler(150),
      {
        id: 'we_bad_p2',
        url: 'https://us-central1-phoenix-cleanhouse.cloudfunctions.net/stripeEvents',
        status: 'enabled',
        enabled_events: [],
      },
    ];
    const { stripe } = makeStripe({ endpoints });
    await expect(assertSandboxHygiene(stripe)).rejects.toThrow(/we_bad_p2/);
  });

  it('ensureWebhooks reuses an endpoint found on page 2 instead of creating a duplicate', async () => {
    const seeded = makeStripe();
    await ensureWebhooks(seeded.stripe, opts);
    const { mock, stripe } = makeStripe({ endpoints: [...filler(120), ...seeded.endpoints] });
    await ensureWebhooks(stripe, opts);
    expect(mock.webhookEndpoints.create).not.toHaveBeenCalled();
  });
});
