import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Stripe from 'stripe';
import { pinnedStripeApiVersion } from '../../launchConfig';
import { assertLocalSandbox } from '../../stripeSandbox';

export const PROJECT = 'demo-regroup-e2e';
export const FUNCTIONS_BASE = `http://127.0.0.1:5101/${PROJECT}/us-central1`;
export const CONFIG_DIR = path.join(os.homedir(), '.config', 'regroup-e2e');
export const LOCAL_KEY_FILE = 'stripe-local-secret-key.txt';
export const LOCAL_WEBHOOK_SECRET_FILE = 'stripe-local-webhook-secret.txt';
export const LOCAL_CONNECT_ACCOUNT_FILE = 'stripe-local-connect-account.txt';
export const LOCAL_PRICES_FILE = 'stripe-local-prices.json';

/** Reads a local config file. Its value is never logged; errors name only the file. */
export function readConfigFile(name: string): string {
  const file = path.join(CONFIG_DIR, name);
  if (!fs.existsSync(file)) throw new Error(`missing ${file}: see the payment suite section of maestro/README.md`);
  return fs.readFileSync(file, 'utf8').trim();
}

export function assertEmulatorEnv(env: NodeJS.ProcessEnv = process.env): void {
  if (env.GCLOUD_PROJECT !== PROJECT) {
    throw new Error(`Refusing to run: the project must be ${PROJECT}, not ${env.GCLOUD_PROJECT}.`);
  }
  for (const name of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
    if (!env[name]) throw new Error(`Refusing to run: ${name} is not set, so this isn't an emulator run.`);
  }
}

export function localStripe(): { stripe: Stripe; key: string } {
  const key = readConfigFile(LOCAL_KEY_FILE);
  return { key, stripe: new Stripe(key, { apiVersion: pinnedStripeApiVersion() as never }) };
}

/** Every server test starts here: emulators only, and the local sandbox only. */
export async function assertSafeTarget(): Promise<Stripe> {
  assertEmulatorEnv();
  const { stripe, key } = localStripe();
  await assertLocalSandbox(stripe, key);
  return stripe;
}
