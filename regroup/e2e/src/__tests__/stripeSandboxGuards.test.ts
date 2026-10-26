import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  assertSandboxAccount,
  E2E_SANDBOX_ACCOUNT_ID,
  LIVE_PRODUCTION_ACCOUNT_ID,
  PRODUCTION_SANDBOX_ACCOUNT_ID,
} from '../stripeSandbox';
import { buildSetupDeps, formatNextSteps, parseFlags } from '../stripeSandboxCli';
import { runSetup } from '../stripeSandboxRun';
import {
  assertSandboxHygiene,
  assertWebhookUrls,
  CONNECT_EVENTS,
  isAllowedWebhookUrl,
  PLATFORM_EVENTS,
  WEBHOOK_PATHS,
} from '../stripeWebhooks';
import { makeStripe } from './helpers/mockStripe';

// Guards ported from PR #123's review: account allowlist, exact paths, the production
// event list, endpoint-bound secrets, run order, and strict CLI handling.
const API = '2026-01-28.clover';
const HOST = 'https://us-central1-regroup-e2e.cloudfunctions.net';
const urls = {
  platformUrl: `${HOST}/stripeEvents`,
  connectUrl: `${HOST}/handleStripeConnectWebhook`,
};

let outDir: string;
beforeEach(() => {
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-guards-'));
});
afterEach(() => jest.restoreAllMocks());

const base = (stripe: unknown, extra = {}) => ({
  readKey: () => 'sk_test_zzz',
  createStripe: () => stripe as never,
  outDir,
  confirmAccount: E2E_SANDBOX_ACCOUNT_ID,
  apiVersion: API,
  ...urls,
  ...extra,
});
const secretsFile = () => path.join(outDir, 'stripe-e2e-webhook-secrets.json');
const endpoint = (
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
const bothEndpoints = () => [
  endpoint('we_p', urls.platformUrl, PLATFORM_EVENTS, null),
  endpoint('we_c', urls.connectUrl, CONNECT_EVENTS, 'ca_x'),
];

describe('account allowlist', () => {
  it.each([
    [LIVE_PRODUCTION_ACCOUNT_ID, /live production account/],
    [PRODUCTION_SANDBOX_ACCOUNT_ID, /production-pointing webhooks/],
    ['acct_1SomeOtherSandbox', /only the e2e sandbox/],
  ])('refuses %s even with an sk_test_ key, writing and creating nothing', async (id, error) => {
    const { mock, stripe } = makeStripe({ accountId: id });
    await expect(assertSandboxAccount(stripe, 'sk_test_abc')).rejects.toThrow(error);
    await expect(runSetup(base(stripe, { confirmAccount: id }))).rejects.toThrow(error);
    expect(mock.products.create).not.toHaveBeenCalled();
    expect(mock.webhookEndpoints.create).not.toHaveBeenCalled();
    expect(fs.readdirSync(outDir)).toEqual([]);
  });

  it('accepts the e2e sandbox', async () => {
    const { stripe } = makeStripe();
    await expect(assertSandboxAccount(stripe, 'sk_test_abc')).resolves.toBe(E2E_SANDBOX_ACCOUNT_ID);
  });

  it('does not echo the retrieved account id when --confirm-account is missing', async () => {
    const { stripe } = makeStripe();
    let message = '';
    await runSetup(base(stripe, { confirmAccount: undefined })).catch((e: Error) => {
      message = e.message;
    });
    expect(message).toMatch(/--confirm-account <the e2e sandbox account id>/);
    expect(message).not.toContain(E2E_SANDBOX_ACCOUNT_ID);
  });
});

describe('exact webhook paths', () => {
  it('pins each kind to its deployed function', () => {
    expect(WEBHOOK_PATHS).toEqual({
      platform: '/stripeEvents',
      connect: '/handleStripeConnectWebhook',
    });
    expect(() => assertWebhookUrls(urls.platformUrl, urls.connectUrl)).not.toThrow();
  });

  it.each([
    ['swapped', urls.connectUrl, urls.platformUrl],
    ['a typo', `${HOST}/stripeEvent`, urls.connectUrl],
    ['another function', `${HOST}/stripeWebhook`, urls.connectUrl],
    ['a trailing slash', `${HOST}/stripeEvents/`, urls.connectUrl],
    ['an empty query', `${HOST}/stripeEvents?`, urls.connectUrl],
    ['an empty fragment', urls.platformUrl, `${HOST}/handleStripeConnectWebhook#`],
    [
      'a non-canonical host',
      'https://US-central1-regroup-e2e.cloudfunctions.net/stripeEvents',
      urls.connectUrl,
    ],
    [
      'an explicit default port',
      'https://us-central1-regroup-e2e.cloudfunctions.net:443/stripeEvents',
      urls.connectUrl,
    ],
  ])('refuses %s', (_label, platformUrl, connectUrl) => {
    expect(() => assertWebhookUrls(platformUrl, connectUrl)).toThrow(/not allowed/);
  });

  it('hygiene flags an enabled endpoint on the e2e host at any other path', async () => {
    expect(isAllowedWebhookUrl(`${HOST}/somethingElse`)).toBe(false);
    const { stripe } = makeStripe({
      endpoints: [{ id: 'we_other', url: `${HOST}/somethingElse`, status: 'enabled' }],
    });
    await expect(assertSandboxHygiene(stripe)).rejects.toThrow(/we_other/);
  });
});

describe('platform events', () => {
  it('match production: 11 events, account.updated only on the Connect endpoint', () => {
    expect(PLATFORM_EVENTS).toHaveLength(11);
    expect(PLATFORM_EVENTS).not.toContain('account.updated');
    expect(CONNECT_EVENTS).toContain('account.updated');
  });
});

describe('secrets bound to their endpoint', () => {
  const saved = (platformEndpointId: string) =>
    fs.writeFileSync(
      secretsFile(),
      JSON.stringify({
        platform: 'whsec_p',
        platformEndpointId,
        connect: 'whsec_c',
        connectEndpointId: 'we_c',
      }),
    );

  it('reuses endpoints whose secrets were saved for exactly those endpoints', async () => {
    saved('we_p');
    const { mock, stripe } = makeStripe({ endpoints: bothEndpoints() });
    await runSetup(base(stripe));
    expect(mock.webhookEndpoints.create).not.toHaveBeenCalled();
  });

  it('refuses a secret saved for a different (deleted or recreated) endpoint', async () => {
    saved('we_deleted');
    const { mock, stripe } = makeStripe({ endpoints: bothEndpoints() });
    await expect(runSetup(base(stripe))).rejects.toThrow(/we_p.*platform.*not saved/);
    expect(mock.webhookEndpoints.create).not.toHaveBeenCalled();
  });
});

describe('run order', () => {
  it('rejects an unusable secrets file before creating a Stripe client', async () => {
    fs.writeFileSync(secretsFile(), '{"platform": whsec_leakme}');
    const createStripe = jest.fn();
    let message = '';
    await runSetup({ ...base(null), createStripe }).catch((e: Error) => {
      message = e.message;
    });
    expect(message).toContain(secretsFile());
    expect(message).not.toMatch(/whsec_|leakme/);
    expect(createStripe).not.toHaveBeenCalled();
  });

  it('runs hygiene before pinning the account', async () => {
    const { stripe } = makeStripe({
      endpoints: [{ id: 'we_prod', url: 'https://example.com/hook', status: 'enabled' }],
    });
    await expect(runSetup(base(stripe))).rejects.toThrow(/we_prod/);
    expect(fs.existsSync(path.join(outDir, 'stripe-e2e-account.txt'))).toBe(false);
  });
});

describe('CLI', () => {
  it.each([
    [['--platform-url', 'a', '--bogus', 'x'], /Unknown argument "--bogus"/],
    [['stray'], /Unknown argument "stray"/],
    [['--platform-url'], /--platform-url needs a value/],
    [['--platform-url', '--connect-url', 'b'], /--platform-url needs a value/],
    [['--platform-url', ''], /--platform-url needs a value/],
    [['--platform-url', 'a', '--platform-url', 'b'], /--platform-url given more than once/],
  ])('refuses %j', (argv, error) => {
    expect(() => parseFlags(argv)).toThrow(error);
  });

  it('warns about a key file others can read, without printing the key', () => {
    const keyFile = path.join(outDir, 'stripe-e2e-sandbox-key.txt');
    fs.writeFileSync(keyFile, 'sk_test_secretvalue', { mode: 0o644 });
    fs.chmodSync(keyFile, 0o644);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const deps = buildSetupDeps(['--platform-url', 'a', '--connect-url', 'b'], outDir, jest.fn());
    expect(deps.readKey()).toBe('sk_test_secretvalue');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls.flat().join('\n')).toMatch(/chmod 600/);
    expect(warn.mock.calls.flat().join('\n')).not.toContain('secretvalue');

    warn.mockClear();
    fs.chmodSync(keyFile, 0o600);
    deps.readKey();
    expect(warn).not.toHaveBeenCalled();
  });

  it('next steps name the secrets to set and never contain a value', () => {
    const text = formatNextSteps({
      secretsFile: secretsFile(),
      keyFile: '/k/stripe-e2e-sandbox-key.txt',
      createdKinds: ['platform', 'connect'],
    });
    for (const name of [
      'STRIPE_TEST_WEBHOOK_SECRET',
      'STRIPE_CONNECT_TEST_WEBHOOK_SECRET',
      'STRIPE_SECRET_KEY',
    ]) {
      expect(text).toContain(name);
    }
    expect(text).toMatch(/npm run e2e:gen-env/);
    expect(text).toMatch(/[Rr]edeploy/);
    // The shape checks name the prefixes; no value-shaped string may appear.
    expect(text).not.toMatch(/(whsec|sk_test|sk_live)_[A-Za-z0-9]{4,}/);
  });
});
