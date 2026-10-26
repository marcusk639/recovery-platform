import * as os from 'os';
import * as path from 'path';
import { writeFunctionsEnvFiles } from '../src/launchConfig';
import { readStagingPrices } from '../src/stagingPrices';

const functionsDir = path.resolve(__dirname, '..', '..', 'functions');
// Written by scripts/stripe-sandbox-setup.ts; staging gets the e2e sandbox prices.
const pricesFile = path.join(os.homedir(), '.config', 'regroup-e2e', 'stripe-e2e-prices.json');

try {
  const files = writeFunctionsEnvFiles(functionsDir, {
    'e2e-staging': readStagingPrices(pricesFile),
  });
  for (const file of files) console.log(`wrote ${file}`);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
