import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { formatReport, runChecks } from '../preflight/checks';
import {
  KEY_FILES,
  keysPresentCheck,
  launchConfigCheck,
  stripeSandboxHygieneCheck,
} from '../preflight/configChecks';
import { writeFunctionsEnvFiles } from '../launchConfig';
import { E2E_SANDBOX_ACCOUNT_ID, PRICE_ENV_VARS } from '../stripeSandbox';
import { makeStripe } from './helpers/mockStripe';

// Recognisable content that must never reach any check's output.
const CANARY = 'CANARY7f3a9notforoutput';
const KEY = `sk_test_${CANARY}`;
const tmp = (prefix = 'preflight-') => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

/** A config dir holding every key file (content: the canary), dir 700, files 600. */
function keyDir(): string {
  const dir = tmp('keys-');
  fs.chmodSync(dir, 0o700);
  for (const { name } of KEY_FILES) {
    fs.writeFileSync(path.join(dir, name), `${CANARY}\n`, { mode: 0o600 });
  }
  return dir;
}

const prices = () => Object.fromEntries(PRICE_ENV_VARS.map((n, i) => [n, `price_${CANARY}${i}`]));
function writePrices(dir: string, values: Record<string, string> = prices()): string {
  const file = path.join(dir, 'stripe-e2e-prices.json');
  fs.writeFileSync(file, JSON.stringify(values), { mode: 0o600 });
  return file;
}

describe('keysPresentCheck', () => {
  it('passes when every required file exists, files 600, dir 700', async () => {
    const r = await keysPresentCheck(keyDir()).run();
    expect(r.ok).toBe(true);
  });

  it('fails naming missing files and loose permissions, never contents', async () => {
    const dir = keyDir();
    const required = KEY_FILES.filter((k) => !k.optional);
    fs.rmSync(path.join(dir, required[0].name));
    fs.chmodSync(path.join(dir, required[1].name), 0o644);
    fs.chmodSync(dir, 0o755);
    const r = await keysPresentCheck(dir).run();
    expect(r.ok).toBe(false);
    expect(r.detail).toContain(`missing: ${required[0].name}`);
    expect(r.detail).toMatch(new RegExp(`${required[1].name.replace(/\./g, '\\.')} is mode 644`));
    expect(r.detail).toMatch(/directory is mode 755/);
    expect(r.detail).not.toContain(CANARY);
  });

  it('does not fail on a missing optional file, but checks its mode when present', async () => {
    const dir = keyDir();
    const optional = KEY_FILES.filter((k) => k.optional);
    expect(optional.length).toBeGreaterThan(0);
    fs.rmSync(path.join(dir, optional[0].name));
    expect((await keysPresentCheck(dir).run()).ok).toBe(true);
    fs.writeFileSync(path.join(dir, 'stray.txt'), CANARY, { mode: 0o640 });
    const loose = await keysPresentCheck(dir).run();
    expect(loose.ok).toBe(false);
    expect(loose.detail).toMatch(/stray\.txt is mode 640/);
  });

  it('fails clearly when the directory does not exist', async () => {
    const r = await keysPresentCheck(path.join(tmp(), 'nope')).run();
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/does not exist/);
  });
});

describe('launchConfigCheck', () => {
  it('passes when both generated files match what gen-env would write now', async () => {
    const functionsDir = tmp('fn-');
    const pricesFile = writePrices(tmp());
    writeFunctionsEnvFiles(functionsDir, { 'e2e-staging': prices() });
    expect((await launchConfigCheck(functionsDir, pricesFile).run()).ok).toBe(true);
  });

  it('fails naming each missing file, and the changed keys of a stale one (names only)', async () => {
    const functionsDir = tmp('fn-');
    const pricesFile = writePrices(tmp());
    writeFunctionsEnvFiles(functionsDir, { 'e2e-staging': prices() }, ['e2e-staging']);
    const staging = path.join(functionsDir, '.env.regroup-e2e');
    const stale = fs
      .readFileSync(staging, 'utf8')
      .replace(/^STRIPE_PRICE_TRAD_STARTER=.*$/m, `STRIPE_PRICE_TRAD_STARTER=price_old${CANARY}`)
      .replace(/^CONNECT_ACCOUNTS_API=.*\n/m, '')
      .concat(`EXTRA_KEY=${CANARY}\n`);
    fs.writeFileSync(staging, stale);
    const r = await launchConfigCheck(functionsDir, pricesFile).run();
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/\.env\.demo-regroup-e2e is missing.*e2e:gen-env/);
    expect(r.detail).toMatch(/\.env\.regroup-e2e.*changed: STRIPE_PRICE_TRAD_STARTER/);
    expect(r.detail).toMatch(/missing keys: CONNECT_ACCOUNTS_API/);
    expect(r.detail).toMatch(/extra keys: EXTRA_KEY/);
    expect(r.detail).not.toContain(CANARY);
  });

  it('reports why staging cannot be checked when the prices file is unusable', async () => {
    const functionsDir = tmp('fn-');
    writeFunctionsEnvFiles(functionsDir, {}, ['e2e-emulator']);
    const pricesFile = path.join(tmp(), 'stripe-e2e-prices.json');
    fs.writeFileSync(pricesFile, `{"oops": "${CANARY}"`);
    const r = await launchConfigCheck(functionsDir, pricesFile).run();
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/cannot check \.env\.regroup-e2e.*not valid JSON/);
    expect(r.detail).not.toContain(CANARY);
  });
});

describe('stripeSandboxHygieneCheck', () => {
  const E2E_URL = 'https://us-central1-regroup-e2e.cloudfunctions.net/stripeEvents';
  const deps = (over: Partial<Parameters<typeof stripeSandboxHygieneCheck>[0]> = {}) => ({
    readKey: () => `${KEY}\n`,
    readPinnedAccount: () => `${E2E_SANDBOX_ACCOUNT_ID}\n`,
    apiVersion: () => '2026-01-28.clover',
    createStripe: () =>
      makeStripe({ endpoints: [{ id: 'we_1', status: 'enabled', url: E2E_URL }] }).stripe,
    ...over,
  });

  it('passes for the pinned e2e sandbox with only allowlisted endpoints', async () => {
    const r = await stripeSandboxHygieneCheck(deps()).run();
    expect(r.ok).toBe(true);
    expect(r.detail).toContain(E2E_SANDBOX_ACCOUNT_ID);
  });

  it('fails on an endpoint outside the allowlist, naming its host only', async () => {
    const createStripe = () =>
      makeStripe({
        endpoints: [{ id: 'we_2', status: 'enabled', url: 'https://evil.example/hook?t=x' }],
      }).stripe;
    const r = await stripeSandboxHygieneCheck(deps({ createStripe })).run();
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/we_2 -> evil\.example/);
  });

  it('fails on another account, an unpinned or differently pinned account, or a missing key', async () => {
    const other = await stripeSandboxHygieneCheck(
      deps({ createStripe: () => makeStripe({ accountId: 'acct_other' }).stripe }),
    ).run();
    expect(other.detail).toMatch(/only the e2e sandbox/);
    const differs = await stripeSandboxHygieneCheck(
      deps({ readPinnedAccount: () => `acct_${CANARY}` }),
    ).run();
    expect(differs.ok).toBe(false);
    expect(differs.detail).toMatch(/differs from the pinned account/);
    const unpinned = await stripeSandboxHygieneCheck(deps({ readPinnedAccount: () => null })).run();
    expect(unpinned.detail).toMatch(/not pinned.*e2e:stripe-setup/);
    const noKey = await stripeSandboxHygieneCheck(
      deps({
        readKey: () => {
          throw Object.assign(new Error(`ENOENT ${CANARY}`), { code: 'ENOENT' });
        },
      }),
    ).run();
    expect(noKey.ok).toBe(false);
    expect(noKey.detail).toMatch(/cannot read the sandbox key file \(ENOENT\)/);
    const liveKey = await stripeSandboxHygieneCheck(
      deps({ readKey: () => `sk_live_${CANARY}` }),
    ).run();
    expect(liveKey.detail).toMatch(/live-mode/);
  });

  it('never echoes the key, even when Stripe quotes it back in an error', async () => {
    const { mock, stripe } = makeStripe();
    mock.accounts.retrieve.mockRejectedValueOnce(new Error(`Invalid API Key provided: ${KEY}`));
    const r = await stripeSandboxHygieneCheck(deps({ createStripe: () => stripe })).run();
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/Invalid API Key/);
    expect(r.detail).not.toContain(CANARY);
  });
});

describe('no check prints a key file', () => {
  it('the full report over a fixture key dir never contains its contents', async () => {
    const dir = keyDir();
    fs.chmodSync(path.join(dir, KEY_FILES[0].name), 0o644);
    const { mock, stripe } = makeStripe();
    mock.accounts.retrieve.mockRejectedValue(new Error(`bad key ${KEY} ${CANARY}`));
    const result = await runChecks([
      keysPresentCheck(dir),
      launchConfigCheck(tmp('fn-'), path.join(dir, 'stripe-e2e-prices.json')),
      stripeSandboxHygieneCheck({
        readKey: () => fs.readFileSync(path.join(dir, 'stripe-e2e-sandbox-key.txt'), 'utf8'),
        readPinnedAccount: () => fs.readFileSync(path.join(dir, 'stripe-e2e-account.txt'), 'utf8'),
        apiVersion: () => '2026-01-28.clover',
        createStripe: () => stripe,
      }),
    ]);
    const report = formatReport(result);
    expect(result.ok).toBe(false);
    expect(report).not.toContain(CANARY);
  });
});
