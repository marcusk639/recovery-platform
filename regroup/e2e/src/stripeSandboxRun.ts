import * as fs from 'fs';
import * as path from 'path';
import type Stripe from 'stripe';
import {
  assertSandboxAccount,
  assertSandboxHygiene,
  assertTestKey,
  assertWebhookUrls,
  ensureCatalog,
  ensureWebhooks,
  WEBHOOK_SECRET_NAMES,
  type EnsuredWebhooks,
  type WebhookKind,
  type WebhookSecretName,
} from './stripeSandbox';

export type SetupDeps = {
  readKey: () => string;
  createStripe: (key: string) => Stripe;
  outDir: string;
  platformUrl: string;
  connectUrl: string;
  /** Required on the first run; must equal the retrieved account id. */
  confirmAccount?: string;
};

/** Temp file created 0600, then renamed over the target. */
function writeSecretFile(file: string, content: string): void {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content, { mode: 0o600, flag: 'wx' });
  fs.renameSync(tmp, file);
}

function readJsonObject(file: string): Record<string, string> {
  if (!fs.existsSync(file)) return {};
  const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('not an object');
  }
  return parsed as Record<string, string>;
}

export const SECRETS_FILE_NAME = 'stripe-e2e-webhook-secrets.json';

/** Keys written before the file was keyed by the functions' secret names. */
const LEGACY_SECRET_KEYS: Record<string, WebhookSecretName> = {
  platform: WEBHOOK_SECRET_NAMES.platform,
  connect: WEBHOOK_SECRET_NAMES.connect,
};

/** Renames legacy keys in memory. Never puts a value in an error. */
function migrateLegacyKeys(raw: Record<string, string>): {
  secrets: Record<string, string>;
  migrated: boolean;
} {
  const secrets = { ...raw };
  let migrated = false;
  for (const [legacy, name] of Object.entries(LEGACY_SECRET_KEYS)) {
    if (!(legacy in secrets)) continue;
    if (name in secrets && secrets[name] !== secrets[legacy]) {
      throw new Error(
        `Secrets file has both legacy key "${legacy}" and ${name} with different values; ` +
          `delete the wrong one by hand and rerun.`,
      );
    }
    secrets[name] = secrets[legacy];
    delete secrets[legacy];
    migrated = true;
  }
  return { secrets, migrated };
}

/** Read with legacy keys migrated; a corrupt file throws "Corrupt ...". */
function readSecrets(file: string): { secrets: Record<string, string>; migrated: boolean } {
  let raw: Record<string, string>;
  try {
    raw = readJsonObject(file);
  } catch {
    throw new Error(`Corrupt ${file}; fix or move it aside and rerun.`);
  }
  return migrateLegacyKeys(raw);
}

/** Rewrites the file once under the new key names, so later runs see only those. */
function migrateSecretsFile(file: string): void {
  const { secrets, migrated } = readSecrets(file);
  if (migrated) writeSecretFile(file, JSON.stringify(secrets, null, 2) + '\n');
}

/** Merge into the secrets file; if it is corrupt, park the one-time secret elsewhere, then fail. */
function persistSecret(dir: string, name: WebhookSecretName, secret: string): void {
  const file = path.join(dir, SECRETS_FILE_NAME);
  let existing: Record<string, string>;
  try {
    existing = readSecrets(file).secrets;
  } catch {
    const rescue = path.join(dir, `stripe-e2e-webhook-secret-${name}-${Date.now()}.json`);
    writeSecretFile(rescue, JSON.stringify({ [name]: secret }, null, 2) + '\n');
    console.error(`Existing secrets file is unreadable; saved the new ${name} to ${rescue}`);
    throw new Error(`Corrupt ${file}; recover ${name} from ${rescue}.`);
  }
  writeSecretFile(file, JSON.stringify({ ...existing, [name]: secret }, null, 2) + '\n');
}

/**
 * Stripe shows a signing secret once, at creation. An endpoint that exists
 * without its secret on disk cannot be repaired by rerunning; say how to fix it.
 */
function assertSecretsSaved(file: string, webhooks: EnsuredWebhooks): void {
  const { secrets } = readSecrets(file);
  const problems = (Object.keys(webhooks) as WebhookKind[])
    .filter((kind) => !secrets[WEBHOOK_SECRET_NAMES[kind]])
    .map((kind) => {
      const { id, url } = webhooks[kind];
      const name = WEBHOOK_SECRET_NAMES[kind];
      return (
        `endpoint ${id} (${url}) exists but ${name} is not in ${file}: ` +
        `roll the signing secret for ${id} in the Stripe Dashboard, then save it as ${name} ` +
        `in that file (or delete the endpoint and rerun)`
      );
    });
  if (problems.length > 0) throw new Error(`Missing webhook secrets: ${problems.join('; ')}.`);
}

function pinAccount(accountFile: string, accountId: string, confirm?: string): void {
  if (fs.existsSync(accountFile)) {
    const stored = fs.readFileSync(accountFile, 'utf8').trim();
    if (stored !== accountId) {
      throw new Error(`Account ${accountId} differs from the pinned e2e account ${stored}.`);
    }
    return;
  }
  if (confirm !== accountId) {
    throw new Error(
      `First run needs --confirm-account ${accountId} (retrieved id must be confirmed).`,
    );
  }
  writeSecretFile(accountFile, `${accountId}\n`);
}

/**
 * Order: URL and key validation (no Stripe), account guard and pin, hygiene,
 * catalogue, webhooks (each secret persisted as it is created). Never logs secrets.
 */
export async function runSetup(deps: SetupDeps): Promise<{ pricesFile: string }> {
  assertWebhookUrls(deps.platformUrl, deps.connectUrl);
  const key = deps.readKey().trim();
  assertTestKey(key);
  const stripe = deps.createStripe(key);
  const accountId = await assertSandboxAccount(stripe, key);

  fs.mkdirSync(deps.outDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(deps.outDir, 0o700);
  pinAccount(path.join(deps.outDir, 'stripe-e2e-account.txt'), accountId, deps.confirmAccount);

  await assertSandboxHygiene(stripe);
  const prices = await ensureCatalog(stripe);

  const secretsFile = path.join(deps.outDir, SECRETS_FILE_NAME);
  migrateSecretsFile(secretsFile);
  const webhooks = await ensureWebhooks(stripe, {
    platformUrl: deps.platformUrl,
    connectUrl: deps.connectUrl,
    onSecret: (name, secret) => persistSecret(deps.outDir, name, secret),
  });
  assertSecretsSaved(secretsFile, webhooks);

  const pricesFile = path.join(deps.outDir, 'stripe-e2e-prices.json');
  writeSecretFile(pricesFile, JSON.stringify(prices, null, 2) + '\n');
  return { pricesFile };
}
