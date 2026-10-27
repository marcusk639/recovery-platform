import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Stripe from 'stripe';
import { pinnedStripeApiVersion } from '../launchConfig';
import { KEY_FILE_NAME } from '../stripeSandboxCli';
import {
  androidSdkCheck,
  formatReport,
  javaVersionCheck,
  jdk17Check,
  playwrightCheck,
  runChecks,
  toolCheck,
  TOOLS,
  type Check,
  type Exec,
} from './checks';
import { keysPresentCheck, launchConfigCheck, stripeSandboxHygieneCheck } from './configChecks';
import { demoProjectIdCheck, simulatorsCheck, yogaPatchCheck } from './repoChecks';

// Usage: npm run e2e:preflight. Read-only; exits 1 when any check fails.
const e2eDir = path.resolve(__dirname, '..', '..');
const regroupDir = path.resolve(e2eDir, '..');
const configDir = path.join(os.homedir(), '.config', 'regroup-e2e');

const exec: Exec = (cmd, args) =>
  new Promise((resolve) => {
    execFile(
      cmd,
      [...args],
      { timeout: 120_000, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const code = (err as NodeJS.ErrnoException | null)?.code;
        resolve({
          code: !err ? 0 : code === 'ENOENT' ? 127 : typeof code === 'number' ? code : 1,
          stdout: String(stdout),
          stderr: String(stderr),
        });
      },
    );
  });

const readOrNull = (file: string): string | null => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
};

const checks: Check[] = [
  ...TOOLS.map((spec) => toolCheck(exec, spec)),
  playwrightCheck(exec, fs.existsSync, [e2eDir, path.join(regroupDir, 'web')]),
  androidSdkCheck(exec, fs.existsSync, process.env),
  javaVersionCheck(exec, 21),
  jdk17Check(exec),
  yogaPatchCheck(path.join(regroupDir, 'mobile')),
  keysPresentCheck(configDir),
  launchConfigCheck(
    path.join(regroupDir, 'functions'),
    path.join(configDir, 'stripe-e2e-prices.json'),
  ),
  stripeSandboxHygieneCheck({
    readKey: () => fs.readFileSync(path.join(configDir, KEY_FILE_NAME), 'utf8'),
    readPinnedAccount: () => readOrNull(path.join(configDir, 'stripe-e2e-account.txt')),
    apiVersion: pinnedStripeApiVersion,
    createStripe: (key, apiVersion) =>
      new Stripe(key, {
        apiVersion: apiVersion as Stripe.LatestApiVersion,
        timeout: 20_000,
        maxNetworkRetries: 1,
      }),
  }),
  demoProjectIdCheck(regroupDir),
  simulatorsCheck(exec, process.env.ANDROID_AVD_HOME || path.join(os.homedir(), '.android', 'avd')),
];

runChecks(checks).then(
  (report) => {
    console.log(formatReport(report));
    process.exit(report.ok ? 0 : 1);
  },
  (err: Error) => {
    console.error(`preflight crashed: ${err.message}`);
    process.exit(1);
  },
);
