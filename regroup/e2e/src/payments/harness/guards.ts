import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import Stripe from "stripe";
import { pinnedStripeApiVersion } from "../../launchConfig";
import { assertLocalSandbox } from "../../stripeSandbox";

/**
 * The payment suite's own emulator project. Separate from the manual-testing emulators'
 * demo-regroup-e2e, so the suite's env file (.env.demo-regroup-payments) never touches the
 * one Maestro and e2e:preflight use.
 */
export const PAYMENTS_PROJECT = "demo-regroup-payments";
/** The manual-testing emulators (scripts/test-prep.sh). Only the new-house journey runs there. */
export const MANUAL_PROJECT = "demo-regroup-e2e";
const DEMO_PROJECTS = [PAYMENTS_PROJECT, MANUAL_PROJECT];

/** The emulator project this run talks to: the payment suite's unless GCLOUD_PROJECT names the other. */
export function currentProject(env: NodeJS.ProcessEnv = process.env): string {
  return env.GCLOUD_PROJECT === MANUAL_PROJECT
    ? MANUAL_PROJECT
    : PAYMENTS_PROJECT;
}
export const PROJECT = currentProject();

export const PAYMENTS_FUNCTIONS_BASE = `http://127.0.0.1:5101/${PAYMENTS_PROJECT}/us-central1`;

/** The payment suite's emulator, or another local one (E2E_FUNCTIONS_BASE). Never a deployed project. */
export function functionsBase(env: NodeJS.ProcessEnv = process.env): string {
  const project = currentProject(env);
  const base = env.E2E_FUNCTIONS_BASE ?? PAYMENTS_FUNCTIONS_BASE;
  if (
    !new RegExp(`^http://127\\.0\\.0\\.1:\\d+/${project}/us-central1$`).test(
      base,
    )
  ) {
    throw new Error(
      `Refusing to run: ${base} is not a local ${project} emulator.`,
    );
  }
  return base;
}
export const FUNCTIONS_BASE = functionsBase();
export const CONFIG_DIR = path.join(os.homedir(), ".config", "regroup-e2e");
export const LOCAL_KEY_FILE = "stripe-local-secret-key.txt";
export const LOCAL_WEBHOOK_SECRET_FILE = "stripe-local-webhook-secret.txt";
export const LOCAL_CONNECT_ACCOUNT_FILE = "stripe-local-connect-account.txt";
export const LOCAL_PRICES_FILE = "stripe-local-prices.json";
/** The functions emulator reads its Stripe secrets from here, not from CONFIG_DIR. */
export const EMULATOR_SECRET_FILE = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "functions",
  ".secret.local",
);

/** Reads a local config file. Its value is never logged; errors name only the file. */
export function readConfigFile(
  name: string,
  configDir: string = CONFIG_DIR,
): string {
  const file = path.join(configDir, name);
  if (!fs.existsSync(file))
    throw new Error(
      `missing ${file}: see the payment suite section of maestro/README.md`,
    );
  const value = fs.readFileSync(file, "utf8").trim();
  if (!value)
    throw new Error(
      `${file} is empty: see the payment suite section of maestro/README.md`,
    );
  return value;
}

/**
 * Refuses unless the emulator is a demo project on emulators. The Stripe suites allow only
 * the payment suite's project; the new-house journey may also run on the manual emulators.
 */
export function assertEmulatorEnv(
  env: NodeJS.ProcessEnv = process.env,
  allowed: readonly string[] = [PAYMENTS_PROJECT],
): void {
  if (
    !allowed.includes(env.GCLOUD_PROJECT ?? "") ||
    !DEMO_PROJECTS.includes(env.GCLOUD_PROJECT ?? "")
  ) {
    throw new Error(
      `Refusing to run: the project must be ${allowed.join(" or ")}, not ${env.GCLOUD_PROJECT}.`,
    );
  }
  for (const name of [
    "FIRESTORE_EMULATOR_HOST",
    "FIREBASE_AUTH_EMULATOR_HOST",
  ]) {
    if (!env[name])
      throw new Error(
        `Refusing to run: ${name} is not set, so this isn't an emulator run.`,
      );
  }
}

/** One value per name, quotes stripped. A repeated name is refused: which one the emulator uses isn't defined here. */
function parseSecretFile(file: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=(.*)$/.exec(line);
    if (!match) continue;
    const [, name, raw] = match;
    if (values.has(name))
      throw new Error(`${file} sets ${name} more than once; keep one line`);
    values.set(name, raw.trim().replace(/^(['"])(.*)\1$/, "$2"));
  }
  return values;
}

/**
 * The functions emulator charges with .secret.local, not with the harness's key files.
 * Maestro testing puts the e2e sandbox's values there, and that sandbox's webhooks write
 * to staging, so every Stripe suite checks the file holds the regroup-local values.
 * Compares without printing any value.
 */
export function assertEmulatorSecrets(
  secretFile: string = EMULATOR_SECRET_FILE,
  configDir: string = CONFIG_DIR,
): void {
  if (!fs.existsSync(secretFile))
    throw new Error(`missing ${secretFile}: set it as in maestro/README.md`);
  const values = parseSecretFile(secretFile);
  const expected: Record<string, string> = {
    STRIPE_SECRET_KEY: readConfigFile(LOCAL_KEY_FILE, configDir),
    STRIPE_TEST_WEBHOOK_SECRET: readConfigFile(
      LOCAL_WEBHOOK_SECRET_FILE,
      configDir,
    ),
    STRIPE_CONNECT_TEST_WEBHOOK_SECRET: readConfigFile(
      LOCAL_WEBHOOK_SECRET_FILE,
      configDir,
    ),
  };
  for (const [name, want] of Object.entries(expected)) {
    const have = values.get(name);
    if (!have)
      throw new Error(
        `${secretFile} has no ${name}; set it as in maestro/README.md`,
      );
    if (have !== want) {
      throw new Error(
        `${secretFile} ${name} is not the regroup-local value; set it as in maestro/README.md`,
      );
    }
  }
  for (const [name, value] of values) {
    if (/^SG\./.test(value))
      throw new Error(
        `${secretFile} ${name} holds a real SendGrid key; remove it so tests can't send email`,
      );
  }
}

export function localStripe(): { stripe: Stripe; key: string } {
  const key = readConfigFile(LOCAL_KEY_FILE);
  return {
    key,
    stripe: new Stripe(key, { apiVersion: pinnedStripeApiVersion() as never }),
  };
}

/**
 * Every Stripe suite starts here: the payment suite's own emulator, whose secrets are the
 * regroup-local ones, and the local sandbox only.
 */
export async function assertSafeTarget(
  env: NodeJS.ProcessEnv = process.env,
): Promise<Stripe> {
  assertEmulatorEnv(env);
  if (functionsBase(env) !== PAYMENTS_FUNCTIONS_BASE) {
    throw new Error(
      `Refusing to run: Stripe suites use only the payment suite emulator (${PAYMENTS_FUNCTIONS_BASE}).`,
    );
  }
  assertEmulatorSecrets();
  const { stripe, key } = localStripe();
  await assertLocalSandbox(stripe, key);
  return stripe;
}
