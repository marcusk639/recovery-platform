/**
 * Read-only check of what a production deploy will bind, before it ships:
 * the latest STRIPE_SECRET_KEY must belong to Regroup's Stripe account, and
 * every tier price in functions/.env.<project> must be live, active, and at the
 * amount and interval SUBSCRIPTION_TIERS sells (annual = monthly x 10).
 *
 *   npm run stripe:verify-live -- --project phoenix-cleanhouse
 *
 * The key is read from Secret Manager with gcloud into this process only and
 * never printed. Only retrieve calls are made. On 2026-11-22 production's key
 * was found to belong to another Stripe account; this would have caught it.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import Stripe from 'stripe';

import { SUBSCRIPTION_TIERS } from '../config';
import { parseEnvText } from './writeFunctionsEnv';

export const EXPECTED_ACCOUNT: Record<string, string> = {
  'phoenix-cleanhouse': 'acct_1GfryQKsstp3aqoP',
};

/** Launch design §4.1 item 3: annual prices are monthly x 10. */
const ANNUAL_MULTIPLIER = 10;

type Expected = Record<string, { amount: number; interval: 'month' | 'year' }>;

export function assertLiveKey(key: string): void {
  if (!/^(sk|rk)_live_/.test(key)) throw new Error('refusing: the key is not a live Stripe key');
}

export function expectedPrices(): Expected {
  const out: Expected = {};
  for (const catalog of Object.values(SUBSCRIPTION_TIERS)) {
    for (const tier of Object.values(catalog) as Array<{
      priceEnvVar: string;
      annualPriceEnvVar?: string;
      amountCents: number;
    }>) {
      out[tier.priceEnvVar] = { amount: tier.amountCents, interval: 'month' };
      if (tier.annualPriceEnvVar) {
        out[tier.annualPriceEnvVar] = {
          amount: tier.amountCents * ANNUAL_MULTIPLIER,
          interval: 'year',
        };
      }
    }
  }
  return out;
}

type StripeReader = {
  accounts: { retrieve: () => Promise<{ id: string }> };
  prices: { retrieve: (id: string) => Promise<Stripe.Price> };
};

export async function verifyLive(
  stripe: StripeReader,
  expectedAccount: string,
  env: Record<string, string>,
  expected: Expected,
): Promise<{ ok: boolean; lines: string[] }> {
  const lines: string[] = [];
  const account = await stripe.accounts.retrieve();
  if (account.id !== expectedAccount) {
    return {
      ok: false,
      lines: [`✗ the key belongs to ${account.id}, expected ${expectedAccount}`],
    };
  }
  lines.push(`✓ account ${account.id} OK`);
  let ok = true;
  for (const [name, want] of Object.entries(expected)) {
    const id = env[name];
    if (!id) {
      lines.push(`✗ ${name}: unset`);
      ok = false;
      continue;
    }
    try {
      const p = await stripe.prices.retrieve(id);
      const problems = [
        !p.livemode && 'not live',
        !p.active && 'archived',
        p.unit_amount !== want.amount && `amount ${p.unit_amount}, expected ${want.amount}`,
        p.recurring?.interval !== want.interval &&
          `interval ${p.recurring?.interval}, expected ${want.interval}`,
      ].filter(Boolean);
      if (problems.length) ok = false;
      lines.push(
        `${problems.length ? '✗' : '✓'} ${name} ${id}${problems.length ? `: ${problems.join(', ')}` : ''}`,
      );
    } catch (err) {
      ok = false;
      lines.push(`✗ ${name} ${id}: ${(err as Error).message}`);
    }
  }
  return { ok, lines };
}

async function main(argv: string[] = process.argv.slice(2)): Promise<boolean> {
  const i = argv.indexOf('--project');
  const project = i !== -1 ? argv[i + 1] : argv.find((a) => a.startsWith('--project='))?.slice(10);
  const expectedAccount = project && EXPECTED_ACCOUNT[project];
  if (!project || !expectedAccount) {
    throw new Error(
      `usage: npm run stripe:verify-live -- --project ${Object.keys(EXPECTED_ACCOUNT).join('|')}`,
    );
  }
  const envFile = path.resolve(__dirname, '../..', `.env.${project}`);
  if (!fs.existsSync(envFile))
    throw new Error(
      `no functions/.env.${project}: run npm run env:write -- --project ${project} first`,
    );
  const env = parseEnvText(fs.readFileSync(envFile, 'utf8'));
  const key = execFileSync(
    'gcloud',
    [
      'secrets',
      'versions',
      'access',
      'latest',
      '--secret=STRIPE_SECRET_KEY',
      `--project=${project}`,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  ).trim();
  assertLiveKey(key);
  const stripe = new Stripe(key, { apiVersion: env.STRIPE_API_VERSION as Stripe.LatestApiVersion });
  const { ok, lines } = await verifyLive(stripe, expectedAccount, env, expectedPrices());
  console.log(lines.join('\n'));
  return ok;
}

if (require.main === module) {
  main()
    .then((ok) => process.exit(ok ? 0 : 1))
    .catch((err) => {
      console.error((err as Error).message);
      process.exit(1);
    });
}
