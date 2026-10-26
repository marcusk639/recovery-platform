import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runSetup } from '../stripeSandboxRun';
import { assertSandboxHygiene, PLATFORM_EVENTS } from '../stripeWebhooks';
import { makeStripe } from './helpers/mockStripe';

// fs exports cannot be redefined with jest.spyOn here, so wrap the three the tests fail on.
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    writeFileSync: jest.fn(actual.writeFileSync),
    renameSync: jest.fn(actual.renameSync),
    rmSync: jest.fn(actual.rmSync),
  };
});
const actualFs = jest.requireActual('fs') as typeof fs;
const mocked = {
  writeFileSync: fs.writeFileSync as unknown as jest.Mock,
  renameSync: fs.renameSync as unknown as jest.Mock,
  rmSync: fs.rmSync as unknown as jest.Mock,
};

// Failure paths where a one-time webhook secret or a hand-edited file could leak or be lost.
const API = '2026-01-28.clover';
const urls = {
  platformUrl: 'https://us-central1-regroup-e2e.cloudfunctions.net/stripeWebhook',
  connectUrl: 'https://us-central1-regroup-e2e.cloudfunctions.net/stripeConnectWebhook',
};

let outDir: string;
beforeEach(() => {
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-secrets-'));
});
afterEach(() => {
  jest.restoreAllMocks();
  mocked.writeFileSync.mockImplementation(actualFs.writeFileSync);
  mocked.renameSync.mockImplementation(actualFs.renameSync);
  mocked.rmSync.mockImplementation(actualFs.rmSync);
});

const base = (stripe: unknown, extra = {}) => ({
  readKey: () => 'sk_test_zzz',
  createStripe: () => stripe as never,
  outDir,
  confirmAccount: 'acct_new',
  apiVersion: API,
  ...urls,
  ...extra,
});
const secretsFile = () => path.join(outDir, 'stripe-e2e-webhook-secrets.json');
const platformEndpoint = {
  id: 'we_p',
  url: urls.platformUrl,
  status: 'enabled',
  enabled_events: [...PLATFORM_EVENTS],
  api_version: API,
  application: null,
};
const tmpFiles = () => fs.readdirSync(outDir).filter((f) => f.endsWith('.tmp'));
const failWrites = (match: (file: string) => boolean, code: string) =>
  mocked.writeFileSync.mockImplementation((file: unknown, ...rest: unknown[]) => {
    if (match(String(file))) throw Object.assign(new Error(`${code}: mocked`), { code });
    return (actualFs.writeFileSync as (...a: unknown[]) => void)(file, ...rest);
  });
const messageOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return (err as Error).message;
  }
  throw new Error('expected a rejection');
};

describe('saved webhook secrets', () => {
  it.each([[''], ['x'], ['whsec_'], ['sk_test_abc']])(
    'refuses to reuse an endpoint whose saved secret is %p',
    async (saved) => {
      fs.writeFileSync(secretsFile(), JSON.stringify({ platform: saved }));
      const { mock, stripe } = makeStripe({ endpoints: [platformEndpoint] });
      await expect(runSetup(base(stripe))).rejects.toThrow(/we_p.*platform.*not saved/);
      expect(mock.webhookEndpoints.create).not.toHaveBeenCalled();
    },
  );

  it('names the file but never quotes a secret when the secrets file is corrupt', async () => {
    fs.writeFileSync(secretsFile(), '{"platform": whsec_leakme}');
    const { stripe } = makeStripe({ endpoints: [platformEndpoint] });
    const message = await messageOf(runSetup(base(stripe)));
    expect(message).toContain(secretsFile());
    expect(message).toMatch(/not valid JSON/);
    expect(message).not.toMatch(/whsec_|leakme/);
  });

  it('says to delete the new endpoint when neither the secrets file nor a rescue file can be written', async () => {
    fs.writeFileSync(secretsFile(), '{not json');
    failWrites((f) => f.includes('webhook-secret-'), 'EACCES');
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const message = await messageOf(runSetup(base(makeStripe().stripe)));
    expect(message).toMatch(/delete the new platform webhook endpoint/);
    expect(message).toMatch(/EACCES/);
    expect([message, ...errors.mock.calls.flat().map(String)].join('\n')).not.toMatch(/whsec_/);
    expect(tmpFiles()).toEqual([]);
  });

  it('parks the secret in a rescue file when the merged write fails', async () => {
    failWrites((f) => f.includes('webhook-secrets.json'), 'ENOSPC');
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const message = await messageOf(runSetup(base(makeStripe().stripe)));
    expect(message).toMatch(/recover the platform secret from/);
    const rescue = fs.readdirSync(outDir).filter((f) => f.startsWith('stripe-e2e-webhook-secret-'));
    expect(rescue).toHaveLength(1);
    expect(JSON.parse(fs.readFileSync(path.join(outDir, rescue[0]), 'utf8'))).toEqual({
      platform: 'whsec_mock',
    });
    expect(fs.statSync(path.join(outDir, rescue[0])).mode & 0o777).toBe(0o600);
    expect([message, ...errors.mock.calls.flat().map(String)].join('\n')).not.toMatch(/whsec_/);
  });

  it('says to delete the new endpoint when the merged write and the rescue write both fail', async () => {
    failWrites((f) => f.includes('webhook-secret'), 'ENOSPC');
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const message = await messageOf(runSetup(base(makeStripe().stripe)));
    expect(message).toMatch(/delete the new platform webhook endpoint/);
    expect(message).not.toMatch(/whsec_/);
    expect(tmpFiles()).toEqual([]);
  });
});

describe('temp-file cleanup', () => {
  it('reports the original write error even when removing the temp file also fails', async () => {
    mocked.renameSync.mockImplementation(() => {
      throw Object.assign(new Error('rename failed: EXDEV'), { code: 'EXDEV' });
    });
    mocked.rmSync.mockImplementation(() => {
      throw Object.assign(new Error('cleanup failed: EPERM'), { code: 'EPERM' });
    });
    await expect(runSetup(base(makeStripe().stripe))).rejects.toThrow(/rename failed: EXDEV/);
    expect(mocked.rmSync).toHaveBeenCalled();
  });
});

describe('account pin file', () => {
  it('refuses a malformed pin file without echoing its content', async () => {
    fs.writeFileSync(path.join(outDir, 'stripe-e2e-account.txt'), 'not-an-account-123\n');
    const { mock, stripe } = makeStripe();
    const message = await messageOf(runSetup(base(stripe)));
    expect(message).toMatch(/stripe-e2e-account\.txt.*malformed/);
    expect(message).not.toContain('not-an-account-123');
    expect(mock.products.create).not.toHaveBeenCalled();
  });

  it('refuses an unreadable pin file, naming it', async () => {
    fs.mkdirSync(path.join(outDir, 'stripe-e2e-account.txt'));
    const { mock, stripe } = makeStripe();
    await expect(runSetup(base(stripe))).rejects.toThrow(/stripe-e2e-account\.txt.*unreadable/);
    expect(mock.products.create).not.toHaveBeenCalled();
  });
});

describe('hygiene error', () => {
  it('names only the endpoint id and host, never path, query or credentials', async () => {
    const { stripe } = makeStripe({
      endpoints: [
        {
          id: 'we_bad',
          url: 'https://user:hunter2@evil.example.com/hook/path?token=abc123',
          status: 'enabled',
        },
      ],
    });
    const message = await messageOf(assertSandboxHygiene(stripe));
    expect(message).toContain('we_bad -> evil.example.com');
    expect(message).not.toMatch(/hunter2|user|token|abc123|\/hook/);
  });
});
