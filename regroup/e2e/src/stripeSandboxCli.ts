import * as fs from 'fs';
import * as path from 'path';
import type Stripe from 'stripe';
import { pinnedStripeApiVersion } from './launchConfig';
import type { SetupDeps } from './stripeSandboxRun';
import type { Kind, SecretsFile } from './stripeWebhooks';

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

const SECRET_NAMES: Record<Kind, string> = {
  platform: 'STRIPE_TEST_WEBHOOK_SECRET',
  connect: 'STRIPE_CONNECT_TEST_WEBHOOK_SECRET',
};

// Each snippet prints only a value of the expected shape and exits 1 otherwise (missing,
// junk or unreadable). The printed command runs it once with output discarded and only
// then pipes it into `secrets:set` (`check && produce | set`): pipefail alone would still
// run `secrets:set` on empty stdin and store an empty version.
const JSON_FIELD_SNIPPET =
  'let v;try{v=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))[process.argv[2]]}catch{process.exit(1)}' +
  'if(typeof v!=="string"||!/^whsec_[A-Za-z0-9]+$/.test(v))process.exit(1);process.stdout.write(v)';
const KEY_SNIPPET =
  'let k;try{k=require("fs").readFileSync(process.argv[1],"utf8").trim()}catch{process.exit(1)}' +
  'if(!/^sk_test_[A-Za-z0-9]+$/.test(k))process.exit(1);process.stdout.write(k)';

/**
 * Operator follow-ups after a run. Names and paths only: each value is piped from
 * its file into `secrets:set --data-file -`, so none reaches the terminal. Webhook
 * secrets are listed only for the endpoints this run created.
 */
export function formatNextSteps(files: {
  secretsFile: string;
  keyFile: string;
  createdKinds: readonly Kind[];
}): string {
  const set = (name: string) =>
    `firebase functions:secrets:set ${name} --project regroup-e2e --data-file -`;
  // Validate (output discarded), then produce and pipe: secrets:set runs only for a good value.
  const store = (producer: string, name: string) =>
    `${producer} >/dev/null && ${producer} | ${set(name)}`;
  const fromJson = (field: keyof SecretsFile) =>
    `node -e '${JSON_FIELD_SNIPPET}' ${shQuote(files.secretsFile)} ${field}`;
  const key = `node -e '${KEY_SNIPPET}' ${shQuote(files.keyFile)}`;
  const webhookLines = files.createdKinds.length
    ? [
        '1. Store the signing secret of each webhook endpoint created this run:',
        ...files.createdKinds.map((kind) => `   ${store(fromJson(kind), SECRET_NAMES[kind])}`),
      ]
    : ['1. No webhook endpoint was created; webhook secrets are unchanged.'];
  return [
    'Next steps for regroup-e2e (no secret values are printed):',
    ...webhookLines,
    '2. STRIPE_SECRET_KEY must hold this sandbox test key:',
    `   ${store(key, 'STRIPE_SECRET_KEY')}`,
    '3. Regenerate the staging env with the price ids: npm run e2e:gen-env',
    '4. Redeploy the regroup-e2e functions so they pick up new secrets and config.',
  ].join('\n');
}
