import * as fs from 'fs';
import * as path from 'path';
import type Stripe from 'stripe';
import { pinnedStripeApiVersion } from './launchConfig';
import type { SetupDeps } from './stripeSandboxRun';

export const KEY_FILE_NAME = 'stripe-e2e-sandbox-key.txt';
const FLAGS = ['platform-url', 'connect-url', 'confirm-account'] as const;
type Flag = (typeof FLAGS)[number];

/** Strict: unknown flags, stray words, missing values and repeated flags are errors. */
export function parseFlags(argv: string[]): Partial<Record<Flag, string>> {
  const out: Partial<Record<Flag, string>> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const arg = argv[i];
    const name = arg.startsWith('--') ? arg.slice(2) : '';
    if (!(FLAGS as readonly string[]).includes(name)) {
      throw new Error(`Unknown argument ${JSON.stringify(arg)} (expected --${FLAGS.join(', --')})`);
    }
    const flag = name as Flag;
    if (flag in out) throw new Error(`--${flag} given more than once`);
    const value = argv[i + 1];
    if (value === undefined || value === '' || value.startsWith('--')) {
      throw new Error(`--${flag} needs a value`);
    }
    out[flag] = value;
  }
  return out;
}

/** Reads the key; warns (never fails, never echoes it) when group or others can read the file. */
function readKeyFile(file: string): string {
  const mode = fs.statSync(file).mode & 0o777;
  if (mode & 0o077) {
    console.warn(
      `Warning: ${file} is mode ${mode.toString(8)} (readable by others); run: chmod 600 ${file}`,
    );
  }
  return fs.readFileSync(file, 'utf8');
}

/** Maps CLI args to runSetup deps; kept out of the script so the wiring is testable. */
export function buildSetupDeps(
  argv: string[],
  configDir: string,
  createStripe: (key: string, apiVersion: string) => Stripe,
): SetupDeps {
  const flags = parseFlags(argv);
  const required = (name: Flag): string => {
    const value = flags[name];
    if (!value) throw new Error(`Missing --${name}`);
    return value;
  };
  return {
    readKey: () => readKeyFile(path.join(configDir, KEY_FILE_NAME)),
    createStripe,
    outDir: configDir,
    platformUrl: required('platform-url'),
    connectUrl: required('connect-url'),
    confirmAccount: flags['confirm-account'],
    apiVersion: pinnedStripeApiVersion(),
  };
}

const shQuote = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;

/**
 * Operator follow-ups after a run. Names and paths only: each value is piped from
 * its file into `secrets:set --data-file -`, so none reaches the terminal.
 */
export function formatNextSteps(files: { secretsFile: string; keyFile: string }): string {
  const set = (name: string) =>
    `firebase functions:secrets:set ${name} --project regroup-e2e --data-file -`;
  const fromJson = (field: string) =>
    `node -e 'process.stdout.write(require(process.argv[1]).${field})' ${shQuote(files.secretsFile)}`;
  const key = `node -e 'process.stdout.write(require("fs").readFileSync(process.argv[1], "utf8").trim())' ${shQuote(files.keyFile)}`;
  return [
    'Next steps for regroup-e2e (no secret values are printed):',
    '1. Only if a webhook endpoint was created this run, store its signing secret:',
    `   ${fromJson('platform')} | ${set('STRIPE_TEST_WEBHOOK_SECRET')}`,
    `   ${fromJson('connect')} | ${set('STRIPE_CONNECT_TEST_WEBHOOK_SECRET')}`,
    '2. STRIPE_SECRET_KEY must hold this sandbox test key:',
    `   ${key} | ${set('STRIPE_SECRET_KEY')}`,
    '3. Regenerate the staging env with the price ids: npm run e2e:gen-env',
    '4. Redeploy the regroup-e2e functions so they pick up new secrets and config.',
  ].join('\n');
}
