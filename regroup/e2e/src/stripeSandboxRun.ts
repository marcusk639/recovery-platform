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
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>;
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

  const secretsFile = path.join(deps.outDir, 'stripe-e2e-webhook-secrets.json');
  await ensureWebhooks(stripe, {
    platformUrl: deps.platformUrl,
    connectUrl: deps.connectUrl,
    onSecret: (kind, secret) => {
      const merged = { ...readJsonObject(secretsFile), [kind]: secret };
      writeSecretFile(secretsFile, JSON.stringify(merged, null, 2) + '\n');
    },
  });

  const pricesFile = path.join(deps.outDir, 'stripe-e2e-prices.json');
  writeSecretFile(pricesFile, JSON.stringify(prices, null, 2) + '\n');
  return { pricesFile };
}
