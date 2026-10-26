import * as os from 'os';
import * as path from 'path';
import Stripe from 'stripe';
import { buildSetupDeps, formatNextSteps, KEY_FILE_NAME } from '../src/stripeSandboxCli';
import { runSetup } from '../src/stripeSandboxRun';

// Usage: npm run e2e:stripe-sandbox-setup -- --platform-url <url> --connect-url <url> [--confirm-account acct_...]
const configDir = path.join(os.homedir(), '.config', 'regroup-e2e');

runSetup(buildSetupDeps(process.argv.slice(2), configDir, (key) => new Stripe(key))).then(
  ({ pricesFile, pricesEnvFile, secretsFile }) => {
    console.log(`wrote ${pricesFile}\nwrote ${pricesEnvFile}`);
    console.log(
      formatNextSteps({ secretsFile, pricesEnvFile, keyFile: path.join(configDir, KEY_FILE_NAME) }),
    );
  },
  (err: Error) => {
    console.error(err.message);
    process.exit(1);
  },
);
