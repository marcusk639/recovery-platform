import { ensureWebhooks, STRIPE_API_VERSION } from '../stripeSandbox';
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
