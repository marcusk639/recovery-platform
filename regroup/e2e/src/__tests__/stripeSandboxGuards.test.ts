import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ensureCatalog, ensureWebhooks } from '../stripeSandbox';
import { formatNextSteps } from '../stripeSandboxCli';
import { runSetup } from '../stripeSandboxRun';
import { makeStripe } from './helpers/mockStripe';

// Spied through the real module object: the code under test reads fs via a getter onto it.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const realFs: typeof fs = require('fs');

const PLATFORM_URL = 'https://us-central1-regroup-e2e.cloudfunctions.net/stripeEvents';
const CONNECT_URL = 'https://us-central1-regroup-e2e.cloudfunctions.net/handleStripeConnectWebhook';
const opts = { platformUrl: PLATFORM_URL, connectUrl: CONNECT_URL };

describe('connect flag on reused endpoints', () => {
  it.each([
    ['platform endpoint flagged connect', 0, true],
    ['connect endpoint flagged not-connect', 1, false],
  ])('rejects a %s', async (_label, index, flag) => {
    const { mock, stripe, endpoints } = makeStripe();
    await ensureWebhooks(stripe, opts);
    endpoints[index].connect = flag;
    await expect(ensureWebhooks(stripe, opts)).rejects.toThrow(/does not match/);
    expect(mock.webhookEndpoints.update).not.toHaveBeenCalled();
  });

  it('accepts endpoints whose objects omit the flag (stripe-node types do not declare it)', async () => {
    const { stripe, endpoints } = makeStripe();
    await ensureWebhooks(stripe, opts);
    for (const e of endpoints) delete e.connect;
    await expect(ensureWebhooks(stripe, opts)).resolves.toBeDefined();
  });
});

describe('catalogue amounts', () => {
  // Hardcoded on purpose (from functions/src/config.ts SUBSCRIPTION_TIERS and
  // api/stripe.ts), so an edit to the script's tables cannot pass unnoticed.
  const monthly: Record<string, number> = {
    regroup_tier_trad_starter: 6900,
    regroup_tier_trad_professional: 12900,
    regroup_tier_trad_enterprise: 24900,
    regroup_tier_oxford_standard: 4900,
    regroup_tier_oxford_plus: 8900,
    regroup_tier_oxford_network: 29900,
  };

  it('creates every tier at its exact monthly and 10x annual amount, in usd', async () => {
    const { stripe, prices } = makeStripe();
    await ensureCatalog(stripe);
    for (const [product, cents] of Object.entries(monthly)) {
      expect(prices[`${product}_monthly`]).toMatchObject({
        product,
        unit_amount: cents,
        currency: 'usd',
        recurring: { interval: 'month' },
      });
      expect(prices[`${product}_annual`]).toMatchObject({
        product,
        unit_amount: cents * 10,
        currency: 'usd',
        recurring: { interval: 'year' },
      });
    }
  });

  it('creates both legacy prices at exactly 4900 and 7900', async () => {
    const { stripe, prices } = makeStripe();
    const ids = await ensureCatalog(stripe);
    expect(prices['regroup_legacy_house_monthly']).toMatchObject({
      unit_amount: 4900,
      recurring: { interval: 'month' },
    });
    expect(prices['regroup_legacy_oxford_monthly']).toMatchObject({
      unit_amount: 7900,
      recurring: { interval: 'month' },
    });
    expect(ids.STRIPE_HOUSE_PRICE_ID).toBe(prices['regroup_legacy_house_monthly'].id);
    expect(ids.STRIPE_OXFORD_PRICE_ID).toBe(prices['regroup_legacy_oxford_monthly'].id);
  });
});

describe('Stripe errors other than resource_missing', () => {
  const rateLimit = () =>
    Object.assign(new Error('Too many requests'), {
      type: 'StripeRateLimitError',
      code: 'rate_limit',
    });
  const auth = () =>
    Object.assign(new Error('Invalid API Key'), { type: 'StripeAuthenticationError' });

  it.each([rateLimit, auth])(
    'product retrieve error %p propagates and nothing is created',
    async (make) => {
      const { mock, stripe } = makeStripe();
      const err = make();
      mock.products.retrieve.mockRejectedValue(err);
      await expect(ensureCatalog(stripe)).rejects.toBe(err);
      expect(mock.products.create).not.toHaveBeenCalled();
      expect(mock.prices.create).not.toHaveBeenCalled();
    },
  );

  it.each([rateLimit, auth])(
    'coupon retrieve error %p propagates and no coupon is created',
    async (make) => {
      const { mock, stripe } = makeStripe();
      const err = make();
      mock.coupons.retrieve.mockRejectedValue(err);
      await expect(ensureCatalog(stripe)).rejects.toBe(err);
      expect(mock.coupons.create).not.toHaveBeenCalled();
    },
  );
});

describe('runSetup file writes and output', () => {
  let outDir: string;
  beforeEach(() => {
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-stripe-guards-'));
  });
  afterEach(() => jest.restoreAllMocks());

  const deps = (stripe: unknown) => ({
    readKey: () => 'sk_test_zzz',
    createStripe: () => stripe as never,
    outDir,
    confirmAccount: 'acct_new',
    ...opts,
  });

  it('refuses to reuse a pre-existing temp file (exclusive create), leaving it and the target alone', async () => {
    const pricesFile = path.join(outDir, 'stripe-e2e-prices.json');
    const tmp = `${pricesFile}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, 'planted');
    const { stripe } = makeStripe();
    await expect(runSetup(deps(stripe))).rejects.toMatchObject({ code: 'EEXIST' });
    expect(fs.readFileSync(tmp, 'utf8')).toBe('planted');
    expect(fs.existsSync(pricesFile)).toBe(false);
  });

  it('writes every file via a temp file renamed onto the final path', async () => {
    const rename = jest.spyOn(realFs, 'renameSync');
    const { stripe } = makeStripe();
    const result = await runSetup(deps(stripe));
    const targets = rename.mock.calls.map(([from, to]) => {
      expect(String(from)).toBe(`${String(to)}.${process.pid}.tmp`);
      return String(to);
    });
    for (const file of [result.pricesFile, result.pricesEnvFile, result.secretsFile]) {
      expect(targets).toContain(file);
    }
    expect(targets).toContain(path.join(outDir, 'stripe-e2e-account.txt'));
  });

  it('never prints a webhook secret or the key across a whole run and its next steps', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => undefined),
    );
    const { stripe } = makeStripe();
    const result = await runSetup(deps(stripe));
    console.log(
      formatNextSteps({
        secretsFile: result.secretsFile,
        pricesEnvFile: result.pricesEnvFile,
        keyFile: path.join(outDir, 'stripe-e2e-sandbox-key.txt'),
      }),
    );
    const printed = spies.flatMap((s) => s.mock.calls.flat().map(String)).join('\n');
    expect(printed).toContain('STRIPE_TEST_WEBHOOK_SECRET');
    expect(printed).not.toMatch(/whsec_|sk_test_zzz/);
    // The secrets did reach the file, so the check above is not vacuous.
    expect(fs.readFileSync(result.secretsFile, 'utf8')).toContain('whsec_mock');
  });
});
