import * as fs from 'fs';
import * as path from 'path';
import type Stripe from 'stripe';
import type { SetupDeps } from './stripeSandboxRun';

const optionalArg = (argv: string[], name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const value = argv[i + 1];
  if (value === undefined || value === '' || value.startsWith('--')) {
    throw new Error(`--${name} needs a value`);
  }
  return value;
};

export const KEY_FILE_NAME = 'stripe-e2e-sandbox-key.txt';

/** Reads the key; warns (never fails, never echoes it) when group/world can read the file. */
function readKeyFile(file: string): string {
  const mode = fs.statSync(file).mode & 0o777;
  if (mode & 0o077) {
    console.warn(
      `Warning: ${file} is mode ${mode.toString(8)} (group/world readable); run: chmod 600 ${file}`,
    );
  }
  return fs.readFileSync(file, 'utf8');
}

/** Maps CLI args to runSetup deps; kept out of the script so the wiring is testable. */
export function buildSetupDeps(
  argv: string[],
  configDir: string,
  createStripe: (key: string) => Stripe,
): SetupDeps {
  const required = (name: string): string => {
    const value = optionalArg(argv, name);
    if (!value) throw new Error(`Missing --${name}`);
    return value;
  };
  return {
    readKey: () => readKeyFile(path.join(configDir, KEY_FILE_NAME)),
    createStripe,
    outDir: configDir,
    platformUrl: required('platform-url'),
    connectUrl: required('connect-url'),
    confirmAccount: optionalArg(argv, 'confirm-account'),
  };
}
