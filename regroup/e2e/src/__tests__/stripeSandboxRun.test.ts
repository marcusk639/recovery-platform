import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PRODUCTION_SANDBOX_ACCOUNT_ID } from '../stripeSandbox';
import { CONNECT_EVENTS, PLATFORM_EVENTS } from '../stripeWebhooks';
import { runSetup } from '../stripeSandboxRun';
import { makeStripe } from './helpers/mockStripe';

const API = '2026-01-28.clover';
const urls = {
  platformUrl: 'https://us-central1-regroup-e2e.cloudfunctions.net/stripeEvents',
  connectUrl: 'https://us-central1-regroup-e2e.cloudfunctions.net/handleStripeConnectWebhook',
};

// The mock gives created endpoints ids we_0, we_1 in creation order (platform first).
const PLATFORM_SAVED = { platform: 'whsec_mock', platformEndpointId: 'we_0' };
const BOTH_SAVED = { ...PLATFORM_SAVED, connect: 'whsec_mock', connectEndpointId: 'we_1' };

describe('runSetup', () => {
  let outDir: string;
  beforeEach(() => {
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-stripe-'));
  });

  const base = (stripe: unknown, extra = {}) => ({
    readKey: () => 'sk_test_zzz',
    createStripe: () => stripe as never,
    outDir,
    confirmAccount: 'acct_1UUsyi44OQke4tKl',
    apiVersion: API,
    ...urls,
    ...extra,
  });
  const secretsFile = () => path.join(outDir, 'stripe-e2e-webhook-secrets.json');
  const existing = (
    id: string,
    url: string,
    events: readonly string[],
    application: string | null,
  ) => ({
    id,
    url,
    status: 'enabled',
    enabled_events: [...events],
    api_version: API,
    application,
  });

  it('refuses a production URL with zero Stripe calls', async () => {
    const createStripe = jest.fn();
    await expect(
      runSetup({
        readKey: () => 'sk_test_zzz',
        createStripe,
        outDir,
        apiVersion: API,
        platformUrl: 'https://us-central1-phoenix-cleanhouse.cloudfunctions.net/w',
        connectUrl: urls.connectUrl,
      }),
    ).rejects.toThrow(/not allowed/);
    expect(createStripe).not.toHaveBeenCalled();
    expect(fs.readdirSync(outDir)).toEqual([]);
  });

  it('refuses http and identical URLs before creating a client', async () => {
    const createStripe = jest.fn();
    const key = { readKey: () => 'sk_test_zzz', createStripe, outDir, apiVersion: API };
    await expect(
      runSetup({
        ...key,
        platformUrl: 'http://us-central1-regroup-e2e.cloudfunctions.net/a',
        connectUrl: urls.connectUrl,
      }),
    ).rejects.toThrow(/not allowed/);
    await expect(
      runSetup({ ...key, platformUrl: urls.platformUrl, connectUrl: urls.platformUrl }),
    ).rejects.toThrow(/Connect webhook URL not allowed/);
    expect(createStripe).not.toHaveBeenCalled();
  });

  it('refuses live and non-test keys before creating a client', async () => {
    const createStripe = jest.fn();
    for (const key of ['sk_live_zzz', 'rk_live_zzz', 'pk_test_zzz']) {
      await expect(
        runSetup({ readKey: () => key, createStripe, outDir, apiVersion: API, ...urls }),
      ).rejects.toThrow(/live|not an sk_test/i);
    }
    expect(createStripe).not.toHaveBeenCalled();
  });

  it('refuses the old sandbox account id and writes nothing', async () => {
    const { mock, stripe } = makeStripe({ accountId: PRODUCTION_SANDBOX_ACCOUNT_ID });
    await expect(runSetup(base(stripe))).rejects.toThrow(PRODUCTION_SANDBOX_ACCOUNT_ID);
    expect(mock.products.create).not.toHaveBeenCalled();
    expect(fs.readdirSync(outDir)).toEqual([]);
  });

  it('refuses a first run without a matching --confirm-account', async () => {
    const { mock, stripe } = makeStripe();
    await expect(runSetup(base(stripe, { confirmAccount: undefined }))).rejects.toThrow(
      /--confirm-account <the e2e sandbox account id>/,
    );
    await expect(runSetup(base(stripe, { confirmAccount: 'acct_other' }))).rejects.toThrow(
      /--confirm-account/,
    );
    expect(mock.products.create).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(outDir, 'stripe-e2e-account.txt'))).toBe(false);
  });

  it('pins the account and refuses a later run on a different account', async () => {
    const first = makeStripe();
    await runSetup(base(first.stripe));
    const account = path.join(outDir, 'stripe-e2e-account.txt');
    expect(fs.readFileSync(account, 'utf8').trim()).toBe('acct_1UUsyi44OQke4tKl');
    expect(fs.statSync(account).mode & 0o777).toBe(0o600);

    fs.writeFileSync(account, 'acct_1Different0000\n');
    const other = makeStripe();
    await expect(runSetup(base(other.stripe))).rejects.toThrow(/pinned/);
    expect(other.mock.products.create).not.toHaveBeenCalled();
  });

  it('creates nothing when hygiene fails', async () => {
    const { mock, stripe } = makeStripe({
      endpoints: [
        {
          id: 'we_prod',
          url: 'https://us-central1-phoenix-cleanhouse.cloudfunctions.net/stripeEvents',
          status: 'enabled',
        },
      ],
    });
    await expect(runSetup(base(stripe))).rejects.toThrow(/we_prod/);
    expect(mock.products.create).not.toHaveBeenCalled();
    expect(mock.webhookEndpoints.create).not.toHaveBeenCalled();
    expect(mock.webhookEndpoints.update).not.toHaveBeenCalled();
    expect(mock.webhookEndpoints.del).not.toHaveBeenCalled();
  });

  it('writes price ids and webhook secrets with mode 600 in a 700 directory', async () => {
    fs.chmodSync(outDir, 0o755);
    const { stripe } = makeStripe();
    await runSetup(base(stripe));

    const pricesFile = path.join(outDir, 'stripe-e2e-prices.json');
    const secretsFile = path.join(outDir, 'stripe-e2e-webhook-secrets.json');
    expect(JSON.parse(fs.readFileSync(pricesFile, 'utf8')).STRIPE_PRICE_TRAD_STARTER).toMatch(
      /^price_/,
    );
    expect(JSON.parse(fs.readFileSync(secretsFile, 'utf8'))).toEqual(BOTH_SAVED);
    expect(fs.statSync(pricesFile).mode & 0o777).toBe(0o600);
    expect(fs.statSync(secretsFile).mode & 0o777).toBe(0o600);
    expect(fs.statSync(outDir).mode & 0o777).toBe(0o700);
    expect(fs.readdirSync(outDir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('keeps the first secret when a crash follows the first endpoint, then merges on re-run', async () => {
    const { mock, stripe } = makeStripe();
    const create = mock.webhookEndpoints.create.getMockImplementation()!;
    mock.webhookEndpoints.create
      .mockImplementationOnce(create)
      .mockRejectedValueOnce(new Error('boom'));

    await expect(runSetup(base(stripe))).rejects.toThrow('boom');
    const secretsFile = path.join(outDir, 'stripe-e2e-webhook-secrets.json');
    expect(JSON.parse(fs.readFileSync(secretsFile, 'utf8'))).toEqual(PLATFORM_SAVED);

    await runSetup(base(stripe));
    expect(mock.webhookEndpoints.create).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fs.readFileSync(secretsFile, 'utf8'))).toEqual(BOTH_SAVED);
  });

  it('refuses to reuse an endpoint whose secret was never saved, naming it', async () => {
    const { mock, stripe } = makeStripe({
      endpoints: [existing('we_orphan', urls.platformUrl, PLATFORM_EVENTS, null)],
    });
    await expect(runSetup(base(stripe))).rejects.toThrow(/we_orphan.*secret.*not saved/);
    expect(mock.webhookEndpoints.create).not.toHaveBeenCalled();
    expect(fs.existsSync(secretsFile())).toBe(false);
  });

  it('checks each endpoint secret separately: a saved platform secret does not cover connect', async () => {
    const { mock, stripe } = makeStripe({
      endpoints: [
        existing('we_platform', urls.platformUrl, PLATFORM_EVENTS, null),
        existing('we_connect', urls.connectUrl, CONNECT_EVENTS, 'ca_x'),
      ],
    });
    fs.writeFileSync(secretsFile(), JSON.stringify({ platform: 'whsec_saved', platformEndpointId: 'we_platform' }));
    await expect(runSetup(base(stripe))).rejects.toThrow(/we_connect.*connect.*not saved/);
    expect(mock.webhookEndpoints.create).not.toHaveBeenCalled();
  });

  it('refuses a sandbox with more than one page of endpoints, creating nothing', async () => {
    const { mock, stripe } = makeStripe();
    mock.webhookEndpoints.list.mockResolvedValue({ data: [], has_more: true });
    await expect(runSetup(base(stripe))).rejects.toThrow(/refusing to guess/);
    expect(mock.products.create).not.toHaveBeenCalled();
    expect(mock.webhookEndpoints.create).not.toHaveBeenCalled();
  });

  it('changes nothing when run twice', async () => {
    const { mock, stripe } = makeStripe();
    await runSetup(base(stripe));
    const counts = () => [
      mock.products.create.mock.calls.length,
      mock.prices.create.mock.calls.length,
      mock.coupons.create.mock.calls.length,
      mock.webhookEndpoints.create.mock.calls.length,
    ];
    const before = counts();
    const secrets = fs.readFileSync(secretsFile());
    await runSetup(base(stripe));
    expect(counts()).toEqual(before);
    expect(fs.readFileSync(secretsFile()).equals(secrets)).toBe(true);
  });

  it('never prints a webhook secret or puts one in an error message', async () => {
    const spies = (['log', 'error', 'warn'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => undefined),
    );
    const messages: string[] = [];
    const attempt = async (deps: Parameters<typeof runSetup>[0]) => {
      try {
        await runSetup(deps);
      } catch (err) {
        messages.push((err as Error).message);
      }
    };

    await attempt(base(makeStripe().stripe));

    const blockedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-stripe-'));
    fs.mkdirSync(path.join(blockedDir, 'stripe-e2e-prices.json'));
    fs.writeFileSync(path.join(blockedDir, 'stripe-e2e-prices.json', 'keep'), 'x');
    await attempt(base(makeStripe().stripe, { outDir: blockedDir }));

    const failing = makeStripe();
    const create = failing.mock.webhookEndpoints.create.getMockImplementation()!;
    failing.mock.webhookEndpoints.create
      .mockImplementationOnce(create)
      .mockRejectedValueOnce(new Error('connect create failed'));
    const failDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-stripe-'));
    await attempt(base(failing.stripe, { outDir: failDir }));

    // A hand-damaged secrets file next to an existing endpoint: JSON.parse would quote it.
    const corruptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-stripe-'));
    fs.writeFileSync(
      path.join(corruptDir, 'stripe-e2e-webhook-secrets.json'),
      '{"platform": whsec_leakme}',
    );
    const withEndpoint = makeStripe({
      endpoints: [existing('we_p', urls.platformUrl, PLATFORM_EVENTS, null)],
    });
    await attempt(base(withEndpoint.stripe, { outDir: corruptDir }));

    const logged = spies.flatMap((s) => s.mock.calls.flat().map(String));
    spies.forEach((s) => s.mockRestore());
    expect(messages.length).toBeGreaterThanOrEqual(3);
    expect(messages.find((m) => m.includes('stripe-e2e-webhook-secrets.json'))).toMatch(
      /not valid JSON/,
    );
    for (const text of [...messages, ...logged]) expect(text).not.toMatch(/whsec_/);
  });

  it('leaves no temp file behind when a write fails', async () => {
    const { stripe } = makeStripe();
    const blocker = path.join(outDir, 'stripe-e2e-prices.json');
    fs.mkdirSync(blocker);
    fs.writeFileSync(path.join(blocker, 'keep'), 'x');
    await expect(runSetup(base(stripe))).rejects.toThrow();
    expect(fs.readdirSync(outDir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('parks a one-time secret in a 600 file when the secrets file is damaged mid-run, then fails', async () => {
    const { mock, stripe } = makeStripe();
    const create = mock.webhookEndpoints.create.getMockImplementation()!;
    mock.webhookEndpoints.create.mockImplementationOnce(async (p: unknown) => {
      fs.writeFileSync(secretsFile(), '{not json');
      return create(p);
    });
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(runSetup(base(stripe))).rejects.toThrow(/Corrupt/);

    const rescue = fs.readdirSync(outDir).filter((f) => f.startsWith('stripe-e2e-webhook-secret-'));
    expect(rescue).toHaveLength(1);
    const rescuePath = path.join(outDir, rescue[0]);
    expect(JSON.parse(fs.readFileSync(rescuePath, 'utf8'))).toEqual(PLATFORM_SAVED);
    expect(fs.statSync(rescuePath).mode & 0o777).toBe(0o600);
    const logged = errors.mock.calls.flat().join('\n');
    expect(logged).toContain(rescuePath);
    expect(logged).not.toContain('whsec_');
    errors.mockRestore();
  });
});
