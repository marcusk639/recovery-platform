import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Stripe from 'stripe';
import { runSetup } from '../src/stripeSandboxRun';

// Usage: npx ts-node scripts/stripe-sandbox-setup.ts --platform-url <url> --connect-url <url> [--confirm-account acct_...]
const configDir = path.join(os.homedir(), '.config', 'regroup-e2e');
const optionalArg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const arg = (name: string): string => {
  const value = optionalArg(name);
  if (!value) throw new Error(`Missing --${name}`);
  return value;
};

runSetup({
  readKey: () => fs.readFileSync(path.join(configDir, 'stripe-e2e-sandbox-key.txt'), 'utf8'),
  createStripe: (key) => new Stripe(key),
  outDir: configDir,
  platformUrl: arg('platform-url'),
  connectUrl: arg('connect-url'),
}).then(
  ({ pricesFile }) => console.log(`wrote ${pricesFile}`),
  (err: Error) => {
    console.error(err.message);
    process.exit(1);
  },
);
