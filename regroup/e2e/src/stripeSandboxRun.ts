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

/** Merge into the secrets file; if it is corrupt, park the one-time secret elsewhere, then fail. */
function persistSecret(dir: string, kind: string, secret: string): void {
  const file = path.join(dir, 'stripe-e2e-webhook-secrets.json');
  let existing: Record<string, string>;
  try {
    existing = readJsonObject(file);
  } catch {
    const rescue = path.join(dir, `stripe-e2e-webhook-secret-${kind}-${Date.now()}.json`);
    writeSecretFile(rescue, JSON.stringify({ [kind]: secret }, null, 2) + '\n');
    console.error(`Existing secrets file is corrupt; saved the new ${kind} secret to ${rescue}`);
    throw new Error(`Corrupt ${file}; recover the ${kind} secret from ${rescue}.`);
  }
  writeSecretFile(file, JSON.stringify({ ...existing, [kind]: secret }, null, 2) + '\n');
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

  await ensureWebhooks(stripe, {
    platformUrl: deps.platformUrl,
    connectUrl: deps.connectUrl,
    onSecret: (kind, secret) => persistSecret(deps.outDir, kind, secret),
  });

  const pricesFile = path.join(deps.outDir, 'stripe-e2e-prices.json');
  writeSecretFile(pricesFile, JSON.stringify(prices, null, 2) + '\n');
  return { pricesFile };
}
