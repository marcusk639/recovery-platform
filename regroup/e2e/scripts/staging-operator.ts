import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { formatRunResult, runStagingOperator } from '../src/stagingOperator/run';
import { createStagingClient } from '../src/stagingOperator/stagingClient';

// Usage: npm run e2e:staging-operator -- --house-type <traditional|oxford> --tier <tier> [--interval <month|year>]
// Signs up a new operator on regroup-e2e (staging) and subscribes them with a Stripe test card.
runStagingOperator({
  argv: process.argv.slice(2),
  configFile: path.join(os.homedir(), '.config', 'regroup-e2e', 'firebase-web-config.json'),
  readFile: (f) => fs.readFileSync(f, 'utf8'),
  makeClient: (config) => createStagingClient(config, fetch),
  now: () => new Date(),
  random: (n) => crypto.randomBytes(n),
}).then(
  (result) => console.log(formatRunResult(result)),
  (err: Error) => {
    console.error(`staging-operator: ${err.message}`);
    process.exit(1);
  },
);
