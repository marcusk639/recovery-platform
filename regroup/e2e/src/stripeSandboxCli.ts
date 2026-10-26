import * as fs from 'fs';
import * as path from 'path';
import type Stripe from 'stripe';
import { WEBHOOK_SECRET_NAMES } from './stripeSandbox';
import type { SetupDeps } from './stripeSandboxRun';

const optionalArg = (argv: string[], name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const value = argv[i + 1];
  if (value === undefined || value === '' || value.startsWith('--')) {
    throw new Error(`--${name} needs a value`);
  }
  return value;
};

export const KEY_FILE_NAME = 'stripe-e2e-sandbox-key.txt';

/** Reads the key; warns (never fails, never echoes it) when group/world can read the file. */
function readKeyFile(file: string): string {
  const mode = fs.statSync(file).mode & 0o777;
  if (mode & 0o077) {
    console.warn(
      `Warning: ${file} is mode ${mode.toString(8)} (group/world readable); run: chmod 600 ${file}`,
    );
  }
  return fs.readFileSync(file, 'utf8');
}

/** Maps CLI args to runSetup deps; kept out of the script so the wiring is testable. */
export function buildSetupDeps(
  argv: string[],
  configDir: string,
  createStripe: (key: string) => Stripe,
): SetupDeps {
  const required = (name: string): string => {
    const value = optionalArg(argv, name);
    if (!value) throw new Error(`Missing --${name}`);
    return value;
  };
  return {
    readKey: () => readKeyFile(path.join(configDir, KEY_FILE_NAME)),
    createStripe,
    outDir: configDir,
    platformUrl: required('platform-url'),
    connectUrl: required('connect-url'),
    confirmAccount: optionalArg(argv, 'confirm-account'),
  };
}

const shQuote = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;

/**
 * Operator follow-ups after a run. Names and paths only: each secret is piped
 * from its file into `secrets:set --data-file -`, so no value reaches the terminal.
 */
export function formatNextSteps(files: {
  secretsFile: string;
  pricesEnvFile: string;
  keyFile: string;
}): string {
  const fromJson = (name: string) =>
    `node -e 'process.stdout.write(require(process.argv[1]).${name})' ${shQuote(files.secretsFile)}`;
  const set = (name: string) => `firebase functions:secrets:set ${name} --project regroup-e2e --data-file -`;
  const key = `node -e 'process.stdout.write(require("fs").readFileSync(process.argv[1], "utf8").trim())' ${shQuote(files.keyFile)}`;
  return [
    'Next steps for regroup-e2e (no secret values are printed):',
    '1. Webhook signing secrets (staging runs on a test key, so the TEST names):',
    ...Object.values(WEBHOOK_SECRET_NAMES).map((name) => `   ${fromJson(name)} | ${set(name)}`),
    '2. STRIPE_SECRET_KEY must hold this sandbox test key in regroup-e2e Secret Manager:',
    `   ${key} | ${set('STRIPE_SECRET_KEY')}`,
    '3. Price ids and STRIPE_API_VERSION into functions/.env.regroup-e2e:',
    `   npm run e2e:gen-env -- --staging-env ${shQuote(files.pricesEnvFile)}`,
    '4. Redeploy the functions afterwards (to regroup-e2e) so they pick up the new secrets and config.',
  ].join('\n');
}
