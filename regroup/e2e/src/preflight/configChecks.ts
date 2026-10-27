import * as fs from 'fs';
import * as path from 'path';
import type Stripe from 'stripe';
import { renderFunctionsEnvFiles } from '../launchConfig';
import { readStagingPrices } from '../stagingPrices';
import { assertSandboxAccount, assertTestKey } from '../stripeSandbox';
import { assertSandboxHygiene } from '../stripeWebhooks';
import { fail, pass, redact, type Check } from './checks';

/**
 * The files the gate reads from ~/.config/regroup-e2e (design §4.6: dir 700, files 600).
 * Required ones are read by committed code, except the two e2e-staging Firebase configs:
 * those are required ahead of PR #143 (the mobile e2e variants, not yet merged), whose
 * e2eStaging / E2EStaging builds copy them in and fail without them. Optional ones are
 * planned inputs no code reads yet, so only their mode is checked when present.
 */
export const KEY_FILES: readonly { name: string; use: string; optional?: true }[] = [
  { name: 'stripe-e2e-sandbox-key.txt', use: 'stripe-sandbox-setup and preflight hygiene' },
  { name: 'stripe-e2e-account.txt', use: 'pinned e2e sandbox account (stripe-sandbox-setup)' },
  { name: 'stripe-e2e-prices.json', use: 'sandbox price ids for .env.regroup-e2e (gen-env)' },
  { name: 'stripe-e2e-webhook-secrets.json', use: 'regroup-e2e webhook signing secrets' },
  {
    name: 'google-services.e2e-staging.json',
    use: 'needed for the mobile e2e staging builds: Android e2eStaging (PR #143)',
  },
  {
    name: 'GoogleService-Info.e2e-staging.plist',
    use: 'needed for the mobile e2e staging builds: iOS E2EStaging (PR #143)',
  },
  {
    name: 'service-account.json',
    use: 'Admin SDK seeding of regroup-e2e (planned)',
    optional: true,
  },
  { name: 'firebase-web-config.json', use: 'web e2e-staging config (planned)', optional: true },
  { name: 'functions.env.regroup-e2e', use: 'regroup-e2e functions env (planned)', optional: true },
];

const modeOf = (stat: fs.Stats): string => (stat.mode & 0o777).toString(8);

// lstat, not stat: a symlinked key file is deliberately rejected (it is not a regular
// file here, so a required one counts as missing), because its target's location and
// permissions are outside this directory's 700/600 guarantee.
function statOrNull(p: string): fs.Stats | null {
  try {
    return fs.lstatSync(p);
  } catch {
    return null;
  }
}

/** File names, types and modes only: this check never opens a file. */
export function keysPresentCheck(configDir: string): Check {
  return {
    name: 'keysPresent',
    async run() {
      const dir = statOrNull(configDir);
      if (!dir || !dir.isDirectory())
        return fail(`${configDir} does not exist or is not a directory`);
      const problems: string[] = [];
      if ((dir.mode & 0o777) !== 0o700)
        problems.push(`directory is mode ${modeOf(dir)} (want 700)`);
      const missing = KEY_FILES.filter(
        (k) => !k.optional && !statOrNull(path.join(configDir, k.name))?.isFile(),
      );
      if (missing.length)
        problems.push(`missing: ${missing.map((k) => `${k.name} (${k.use})`).join(', ')}`);
      for (const name of fs.readdirSync(configDir).sort()) {
        const stat = statOrNull(path.join(configDir, name));
        if (!stat) continue;
        const want = stat.isDirectory() ? 0o700 : 0o600;
        // A file may be stricter than 600 (e.g. 400); nothing may be group- or world-accessible.
        if (stat.mode & 0o077)
          problems.push(`${name} is mode ${modeOf(stat)} (want ${want.toString(8)})`);
      }
      const required = KEY_FILES.filter((k) => !k.optional).length;
      return problems.length
        ? fail(`${configDir}: ${problems.join('; ')}`)
        : pass(
            `${required} required key files present in ${configDir}; dir 700, nothing group/world-readable`,
          );
    },
  };
}

function envKeys(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of text.split('\n')) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (m) map.set(m[1], m[2]);
  }
  return map;
}

/** How `actual` differs from `expected`, by key name only: values are never printed. */
function describeDrift(name: string, expected: string, actual: string): string {
  const want = envKeys(expected);
  const have = envKeys(actual);
  const parts: string[] = [];
  const missing = [...want.keys()].filter((k) => !have.has(k));
  const extra = [...have.keys()].filter((k) => !want.has(k));
  const changed = [...want.keys()].filter((k) => have.has(k) && have.get(k) !== want.get(k));
  if (changed.length) parts.push(`changed: ${changed.join(', ')}`);
  if (missing.length) parts.push(`missing keys: ${missing.join(', ')}`);
  if (extra.length) parts.push(`extra keys: ${extra.join(', ')}`);
  if (!parts.length) parts.push('formatting differs');
  return `${name} is stale (${parts.join('; ')}); run npm run e2e:gen-env`;
}

/** §4.4: the gitignored generated env files equal what launch-config.json + gen-env give now. */
export function launchConfigCheck(functionsDir: string, pricesFile: string): Check {
  return {
    name: 'launchConfigMatchesGeneratedEnv',
    async run() {
      const expected = renderFunctionsEnvFiles(functionsDir, {}, ['e2e-emulator']);
      const problems: string[] = [];
      try {
        const prices = readStagingPrices(pricesFile);
        expected.push(
          ...renderFunctionsEnvFiles(functionsDir, { 'e2e-staging': prices }, ['e2e-staging']),
        );
      } catch (err) {
        // readStagingPrices names the file and keys, never values.
        problems.push(`cannot check .env.regroup-e2e: ${(err as Error).message}`);
      }
      for (const { file, content } of expected) {
        const name = path.basename(file);
        let actual: string;
        try {
          actual = fs.readFileSync(file, 'utf8');
        } catch {
          problems.push(`${name} is missing in ${functionsDir}; run npm run e2e:gen-env`);
          continue;
        }
        if (actual !== content) problems.push(describeDrift(name, content, actual));
      }
      return problems.length
        ? fail(problems.join('; '))
        : pass(
            `${expected.map((e) => path.basename(e.file)).join(' and ')} match launch-config.json`,
          );
    },
  };
}

export type HygieneDeps = {
  /** The sandbox key file's content. Never printed. */
  readKey: () => string;
  /** stripe-e2e-account.txt's content; throws (ENOENT when absent) like fs. Never printed. */
  readPinnedAccount: () => string;
  apiVersion: () => string;
  createStripe: (key: string, apiVersion: string) => Stripe;
};

/**
 * §4.5, read-only: the key is a test key of the pinned e2e sandbox, and no enabled
 * webhook endpoint points outside the e2e allowlist. Reuses the setup script's guards.
 */
export function stripeSandboxHygieneCheck(deps: HygieneDeps): Check {
  return {
    name: 'stripeSandboxHygiene',
    async run() {
      let key: string;
      try {
        key = deps.readKey().trim();
      } catch (err) {
        return fail(
          `cannot read the sandbox key file (${(err as NodeJS.ErrnoException).code ?? 'unknown error'})`,
        );
      }
      try {
        assertTestKey(key);
        const stripe = deps.createStripe(key, deps.apiVersion());
        const accountId = await assertSandboxAccount(stripe, key);
        let pinned: string;
        try {
          pinned = deps.readPinnedAccount();
        } catch (err) {
          const code = (err as NodeJS.ErrnoException).code;
          return fail(
            code === 'ENOENT'
              ? 'the e2e sandbox account is not pinned; run npm run e2e:stripe-setup'
              : `cannot read stripe-e2e-account.txt (${code ?? 'unknown error'})`,
          );
        }
        if (pinned.trim() !== accountId) {
          return fail(
            `account ${accountId} differs from the pinned account (stripe-e2e-account.txt)`,
          );
        }
        await assertSandboxHygiene(stripe);
        return pass(
          `account ${accountId} is the pinned e2e sandbox; no enabled webhook endpoint outside the e2e allowlist`,
        );
      } catch (err) {
        return fail(redact((err as Error)?.message ?? String(err), [key]));
      }
    },
  };
}
