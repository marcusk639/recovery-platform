import * as os from 'os';
import * as path from 'path';
import { generateEnvFiles } from '../src/genEnv';

const functionsDir = path.resolve(__dirname, '..', '..', 'functions');
// Written by scripts/stripe-sandbox-setup.ts; staging gets the e2e sandbox prices.
const pricesFile = path.join(os.homedir(), '.config', 'regroup-e2e', 'stripe-e2e-prices.json');

try {
  const { written, stagingError } = generateEnvFiles(functionsDir, pricesFile);
  for (const file of written) console.log(`wrote ${file}`);
  if (stagingError) {
    console.error(stagingError);
    console.error('.env.regroup-e2e was NOT written (staging needs the sandbox prices).');
    process.exit(1);
  }
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
