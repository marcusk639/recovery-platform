import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PRODUCTION_SANDBOX_ACCOUNT_ID } from '../stripeSandbox';
import { runSetup } from '../stripeSandboxRun';
import { makeStripe } from './helpers/mockStripe';

const urls = {
  platformUrl: 'https://us-central1-regroup-e2e.cloudfunctions.net/stripeWebhook',
  connectUrl: 'https://us-central1-regroup-e2e.cloudfunctions.net/stripeConnectWebhook',
};

describe('runSetup', () => {
  let outDir: string;
  beforeEach(() => {
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-stripe-'));
  });

  const base = (stripe: unknown, extra = {}) => ({
    readKey: () => 'sk_test_zzz',
    createStripe: () => stripe as never,
    outDir,
    confirmAccount: 'acct_new',
    ...urls,
    ...extra,
  });

  it('refuses a production URL with zero Stripe calls', async () => {
    const createStripe = jest.fn();
    await expect(
      runSetup({
        readKey: () => 'sk_test_zzz',
        createStripe,
        outDir,
        platformUrl: 'https://us-central1-phoenix-cleanhouse.cloudfunctions.net/w',
        connectUrl: urls.connectUrl,
      }),
    ).rejects.toThrow(/not allowed/);
    expect(createStripe).not.toHaveBeenCalled();
    expect(fs.readdirSync(outDir)).toEqual([]);
  });

  it('refuses http and identical URLs before creating a client', async () => {
    const createStripe = jest.fn();
    const key = { readKey: () => 'sk_test_zzz', createStripe, outDir };
    await expect(
      runSetup({
        ...key,
        platformUrl: 'http://us-central1-regroup-e2e.cloudfunctions.net/a',
        connectUrl: urls.connectUrl,
      }),
    ).rejects.toThrow(/not allowed/);
    await expect(
      runSetup({ ...key, platformUrl: urls.platformUrl, connectUrl: urls.platformUrl }),
    ).rejects.toThrow(/differ/);
    expect(createStripe).not.toHaveBeenCalled();
  });

  it('refuses live and non-test keys before creating a client', async () => {
    const createStripe = jest.fn();
    for (const key of ['sk_live_zzz', 'rk_live_zzz', 'pk_test_zzz']) {
      await expect(runSetup({ readKey: () => key, createStripe, outDir, ...urls })).rejects.toThrow(
        /live|not an sk_test/i,
      );
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
      /--confirm-account acct_new/,
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
    expect(fs.readFileSync(account, 'utf8').trim()).toBe('acct_new');
    expect(fs.statSync(account).mode & 0o777).toBe(0o600);

    const other = makeStripe({ accountId: 'acct_different' });
    await expect(
      runSetup(base(other.stripe, { confirmAccount: 'acct_different' })),
    ).rejects.toThrow(/pinned/);
    expect(other.mock.products.create).not.toHaveBeenCalled();
  });

  it('creates nothing when hygiene fails', async () => {
    const { mock, stripe } = makeStripe({
      endpoints: [
        {
          id: 'we_prod',
          url: 'https://us-central1-phoenix-cleanhouse.cloudfunctions.net/stripeWebhook',
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
    expect(JSON.parse(fs.readFileSync(secretsFile, 'utf8'))).toEqual({
      platform: 'whsec_mock',
      connect: 'whsec_mock',
    });
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
    expect(JSON.parse(fs.readFileSync(secretsFile, 'utf8'))).toEqual({ platform: 'whsec_mock' });

    await runSetup(base(stripe));
    expect(mock.webhookEndpoints.create).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fs.readFileSync(secretsFile, 'utf8'))).toEqual({
      platform: 'whsec_mock',
      connect: 'whsec_mock',
    });
  });

  it('parks a one-time secret in a separate 600 file when the secrets file is corrupt, then fails', async () => {
    const { stripe } = makeStripe();
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'stripe-e2e-webhook-secrets.json'), '{not json');
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(runSetup(base(stripe))).rejects.toThrow(/Corrupt/);

    const rescue = fs.readdirSync(outDir).filter((f) => f.startsWith('stripe-e2e-webhook-secret-'));
    expect(rescue).toHaveLength(1);
    const rescuePath = path.join(outDir, rescue[0]);
    expect(JSON.parse(fs.readFileSync(rescuePath, 'utf8'))).toEqual({ platform: 'whsec_mock' });
    expect(fs.statSync(rescuePath).mode & 0o777).toBe(0o600);
    const logged = errors.mock.calls.flat().join('\n');
    expect(logged).toContain(rescuePath);
    expect(logged).not.toContain('whsec_');
    errors.mockRestore();
  });
});
