import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type Stripe from 'stripe';
import { assertSandboxAccount, assertTestKey, ensureCatalog } from './stripeSandbox';
import {
  assertSandboxHygiene,
  assertWebhookUrls,
  ensureWebhooks,
  type Kind,
  type SecretStatus,
} from './stripeWebhooks';

const WEBHOOK_SECRET = /^whsec_[A-Za-z0-9]+$/;
export const SECRETS_FILE = 'stripe-e2e-webhook-secrets.json';
const ACCOUNT_ID = /^acct_[A-Za-z0-9]+$/;
const codeOf = (err: unknown): string =>
  (err as NodeJS.ErrnoException | null)?.code ?? 'unknown error';

export type SetupDeps = {
  readKey: () => string;
  createStripe: (key: string, apiVersion: string) => Stripe;
  outDir: string;
  platformUrl: string;
  connectUrl: string;
  /** Pinned Stripe API version for the client and for every webhook endpoint created. */
  apiVersion: string;
  /** Required on the first run; must equal the retrieved account id. */
  confirmAccount?: string;
};

/** A file that exists but cannot be used; its message never contains the file's content. */
class UnusableFileError extends Error {}

/** Temp file created 0600, then renamed over the target. */
function writeSecretFile(file: string, content: string): void {
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(tmp, content, { mode: 0o600, flag: 'wx' });
    fs.renameSync(tmp, file);
  } catch (err) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      // The write error is what the operator needs; a failed cleanup must not replace it.
    }
    throw err;
  }
}

/**
 * {} when the file is absent. Errors name the file only: a JSON.parse message
 * quotes the input, which here holds webhook secrets.
 */
function readJsonObject(file: string): Record<string, string> {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return {};
    throw new UnusableFileError(`cannot read ${file} (${code ?? 'unknown error'})`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new UnusableFileError(`${file} is not valid JSON`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new UnusableFileError(`${file} must be a JSON object`);
  }
  return parsed as Record<string, string>;
}

/**
 * The secrets file could not take the one-time secret: park it in its own 0600
 * file and fail. If even that fails, the secret is gone and the endpoint must be
 * recreated. Messages carry error codes and paths only.
 */
function rescueSecret(
  dir: string,
  entry: Record<string, string>,
  kind: Kind,
  cause: string,
): never {
  const rescue = path.join(dir, `stripe-e2e-webhook-secret-${kind}-${Date.now()}.json`);
  try {
    writeSecretFile(rescue, JSON.stringify(entry, null, 2) + '\n');
  } catch (writeErr) {
    throw new Error(
      `${cause}, and the ${kind} secret could not be saved elsewhere (${codeOf(writeErr)}); ` +
        `delete the new ${kind} webhook endpoint in the Stripe Dashboard and rerun.`,
    );
  }
  console.error(`${cause}; saved the new ${kind} secret to ${rescue}`);
  throw new Error(`${cause}; recover the ${kind} secret from ${rescue}.`);
}

const endpointIdKey = (kind: Kind): string => `${kind}EndpointId`;

/**
 * Merge the secret and the id of the endpoint it belongs to into the secrets file
 * in one write; if the file cannot be read or written, rescue both, then fail.
 */
function persistSecret(dir: string, kind: Kind, secret: string, endpointId: string): void {
  const file = path.join(dir, SECRETS_FILE);
  const entry = { [kind]: secret, [endpointIdKey(kind)]: endpointId };
  let existing: Record<string, string>;
  try {
    existing = readJsonObject(file);
  } catch (err) {
    if (!(err instanceof UnusableFileError)) throw err;
    rescueSecret(dir, entry, kind, `Corrupt or unreadable secrets file (${err.message})`);
  }
  try {
    writeSecretFile(file, JSON.stringify({ ...existing, ...entry }, null, 2) + '\n');
  } catch (err) {
    rescueSecret(dir, entry, kind, `Cannot write ${file} (${codeOf(err)})`);
  }
}

/**
 * 'saved': a whsec_ secret recorded for exactly this endpoint. 'unbound': a whsec_
 * secret with no endpoint id, from a file written before ids were recorded; its
 * endpoint may be live. 'missing': anything else, including a secret recorded for
 * a different (deleted) endpoint.
 */
function secretStatusFor(
  saved: Record<string, string>,
  kind: Kind,
  endpointId: string,
): SecretStatus {
  const secret = saved[kind];
  if (typeof secret !== 'string' || !WEBHOOK_SECRET.test(secret)) return 'missing';
  const recorded = saved[endpointIdKey(kind)];
  if (recorded === undefined) return 'unbound';
  return recorded === endpointId ? 'saved' : 'missing';
}

function pinAccount(accountFile: string, accountId: string, confirm?: string): void {
  if (fs.existsSync(accountFile)) {
    let stored: string;
    try {
      stored = fs.readFileSync(accountFile, 'utf8').trim();
    } catch (err) {
      throw new Error(`${accountFile} is unreadable (${codeOf(err)}); fix or delete it.`);
    }
    if (!ACCOUNT_ID.test(stored)) {
      throw new Error(`${accountFile} is malformed (not an acct_ id); fix or delete it.`);
    }
    if (stored !== accountId) {
      throw new Error(`Account ${accountId} differs from the pinned e2e account ${stored}.`);
    }
    return;
  }
  if (confirm !== accountId) {
    // Never echo the retrieved id: the operator must supply it independently.
    throw new Error(
      'First run needs --confirm-account <the e2e sandbox account id>, copied from the Stripe Dashboard.',
    );
  }
  writeSecretFile(accountFile, `${accountId}\n`);
}

/**
 * Order: URL and key validation (no Stripe); the secrets file must be usable before
 * any Stripe write; account guard (the e2e sandbox only); hygiene; account pin;
 * catalogue and prices file; webhooks (each secret persisted with its endpoint id as
 * it is created; an existing endpoint without a secret saved for it is refused).
 * Never logs secrets.
 */
export async function runSetup(
  deps: SetupDeps,
): Promise<{ pricesFile: string; secretsFile: string }> {
  assertWebhookUrls(deps.platformUrl, deps.connectUrl);
  const key = deps.readKey().trim();
  assertTestKey(key);
  const secretsFile = path.join(deps.outDir, SECRETS_FILE);
  readJsonObject(secretsFile);

  const stripe = deps.createStripe(key, deps.apiVersion);
  const accountId = await assertSandboxAccount(stripe, key);
  await assertSandboxHygiene(stripe);

  fs.mkdirSync(deps.outDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(deps.outDir, 0o700);
  pinAccount(path.join(deps.outDir, 'stripe-e2e-account.txt'), accountId, deps.confirmAccount);

  const prices = await ensureCatalog(stripe);
  const pricesFile = path.join(deps.outDir, 'stripe-e2e-prices.json');
  writeSecretFile(pricesFile, JSON.stringify(prices, null, 2) + '\n');

  await ensureWebhooks(stripe, {
    platformUrl: deps.platformUrl,
    connectUrl: deps.connectUrl,
    apiVersion: deps.apiVersion,
    onSecret: (kind, secret, endpointId) => persistSecret(deps.outDir, kind, secret, endpointId),
    secretStatus: (kind, endpointId) =>
      secretStatusFor(readJsonObject(secretsFile), kind, endpointId),
  });
  return { pricesFile, secretsFile };
}
