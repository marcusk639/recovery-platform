import * as fs from 'fs';
import * as path from 'path';
import type Stripe from 'stripe';
import type { SetupDeps } from './stripeSandboxRun';

const optionalArg = (argv: string[], name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

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
    readKey: () => fs.readFileSync(path.join(configDir, 'stripe-e2e-sandbox-key.txt'), 'utf8'),
    createStripe,
    outDir: configDir,
    platformUrl: required('platform-url'),
    connectUrl: required('connect-url'),
    confirmAccount: optionalArg(argv, 'confirm-account'),
  };
}
