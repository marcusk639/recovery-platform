import * as fs from 'fs';
import * as path from 'path';
import type Stripe from 'stripe';
import {
  assertSandboxAccount,
  assertSandboxHygiene,
  ensureCatalog,
  ensureWebhooks,
} from './stripeSandbox';

export type SetupDeps = {
  readKey: () => string;
  createStripe: (key: string) => Stripe;
  outDir: string;
  platformUrl: string;
  connectUrl: string;
};

function writeSecretFile(file: string, data: unknown): void {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

/** Guards, then catalogue, webhooks, hygiene; writes mode-600 outputs. Never logs secrets. */
export async function runSetup(deps: SetupDeps): Promise<{ pricesFile: string }> {
  const key = deps.readKey().trim();
  if (/^(sk|rk)_live_/.test(key)) throw new Error('Refusing to run with a live-mode Stripe key.');
  const stripe = deps.createStripe(key);
  await assertSandboxAccount(stripe, key);

  const secrets: Record<string, string> = {};
  const prices = await ensureCatalog(stripe);
  await ensureWebhooks(stripe, {
    platformUrl: deps.platformUrl,
    connectUrl: deps.connectUrl,
    onSecret: (kind, secret) => {
      secrets[kind] = secret;
    },
  });
  const origins = [deps.platformUrl, deps.connectUrl].map((u) => `${new URL(u).origin}/`);
  await assertSandboxHygiene(stripe, origins);

  fs.mkdirSync(deps.outDir, { recursive: true, mode: 0o700 });
  const pricesFile = path.join(deps.outDir, 'stripe-e2e-prices.json');
  writeSecretFile(pricesFile, prices);
  if (Object.keys(secrets).length > 0) {
    writeSecretFile(path.join(deps.outDir, 'stripe-e2e-webhook-secrets.json'), secrets);
  }
  return { pricesFile };
}
