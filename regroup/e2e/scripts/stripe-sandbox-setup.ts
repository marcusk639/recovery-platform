import * as os from 'os';
import * as path from 'path';
import Stripe from 'stripe';
import { buildSetupDeps } from '../src/stripeSandboxCli';
import { runSetup } from '../src/stripeSandboxRun';

// Usage: npx ts-node scripts/stripe-sandbox-setup.ts --platform-url <url> --connect-url <url> [--confirm-account acct_...]
// Reads the sandbox key from ~/.config/regroup-e2e/stripe-e2e-sandbox-key.txt and writes
// stripe-e2e-account.txt, stripe-e2e-prices.json and stripe-e2e-webhook-secrets.json there (0600).
const configDir = path.join(os.homedir(), '.config', 'regroup-e2e');

Promise.resolve()
  .then(() =>
    runSetup(
      buildSetupDeps(
        process.argv.slice(2),
        configDir,
        (key, apiVersion) => new Stripe(key, { apiVersion: apiVersion as Stripe.LatestApiVersion }),
      ),
    ),
  )
  .then(
    ({ pricesFile }) => console.log(`wrote ${pricesFile}`),
    (err: Error) => {
      console.error(err.message);
      process.exit(1);
    },
  );
