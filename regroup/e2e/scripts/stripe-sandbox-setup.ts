import * as os from 'os';
import * as path from 'path';
import Stripe from 'stripe';
import { buildSetupDeps } from '../src/stripeSandboxCli';
import { runSetup } from '../src/stripeSandboxRun';

// Usage: npx ts-node scripts/stripe-sandbox-setup.ts --platform-url <url> --connect-url <url> [--confirm-account acct_...]
const configDir = path.join(os.homedir(), '.config', 'regroup-e2e');

runSetup(buildSetupDeps(process.argv.slice(2), configDir, (key) => new Stripe(key))).then(
  ({ pricesFile }) => console.log(`wrote ${pricesFile}`),
  (err: Error) => {
    console.error(err.message);
    process.exit(1);
  },
);
