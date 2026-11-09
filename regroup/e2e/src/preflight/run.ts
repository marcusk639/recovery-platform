import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Stripe from 'stripe';
import { pinnedStripeApiVersion, REAL_MEETING_DIRECTORY_URL } from '../launchConfig';
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
import { stagingDirectoryKeyCheck } from './directoryCheck';
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
    readPinnedAccount: () =>
      fs.readFileSync(path.join(configDir, 'stripe-e2e-account.txt'), 'utf8'),
    apiVersion: pinnedStripeApiVersion,
    createStripe: (key, apiVersion) =>
      new Stripe(key, {
        apiVersion: apiVersion as Stripe.LatestApiVersion,
        timeout: 20_000,
        maxNetworkRetries: 1,
      }),
  }),
  stagingDirectoryKeyCheck({
    readKey: async () => {
      const res = await exec('firebase', [
        'functions:secrets:access',
        'RECOVERY_PLATFORM_API_KEY',
        '--project',
        'regroup-e2e',
      ]);
      if (res.code !== 0) throw new Error('firebase functions:secrets:access failed');
      return res.stdout;
    },
    probe: async (key) => {
      const res = await fetch(`${REAL_MEETING_DIRECTORY_URL}/findMeetings`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-service-key': key,
          'x-app-id': 'regroup',
          'x-user-uid': 'preflight',
        },
        body: JSON.stringify({ data: {} }),
        signal: AbortSignal.timeout(20_000),
      });
      return res.status;
    },
  }),
  demoProjectIdCheck(regroupDir),
  simulatorsCheck(exec, process.env.ANDROID_AVD_HOME || path.join(os.homedir(), '.android', 'avd')),
];

runChecks(checks).then(
  (report) => {
    console.log(formatReport(report));
    process.exitCode = report.ok ? 0 : 1;
  },
  (err: Error) => {
    console.error(`preflight crashed: ${err.message}`);
    process.exitCode = 1;
  },
);
