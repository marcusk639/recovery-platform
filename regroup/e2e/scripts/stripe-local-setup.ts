/**
 * Prepares the regroup-local sandbox and the emulator's env for the payment suite.
 * Idempotent. Prints file names and ids, never a key. See maestro/README.md.
 */
import * as fs from 'fs';
import * as path from 'path';
import type Stripe from 'stripe';
import { writeFunctionsEnvFiles } from '../src/launchConfig';
import { sweepOldClocks } from '../src/payments/harness/clock';
import { CONFIG_DIR, LOCAL_CONNECT_ACCOUNT_FILE, LOCAL_PRICES_FILE, localStripe } from '../src/payments/harness/guards';
import { assertLocalSandbox, ensureCatalog } from '../src/stripeSandbox';

const connectFile = path.join(CONFIG_DIR, LOCAL_CONNECT_ACCOUNT_FILE);

async function ensureConnectAccount(stripe: Stripe): Promise<string> {
  if (fs.existsSync(connectFile)) return fs.readFileSync(connectFile, 'utf8').trim();
  // Stripe's documented test values verify immediately. No real person or business.
  const account = await stripe.accounts.create({
    type: 'custom',
    country: 'US',
    email: 'connect@rats-e2e.invalid',
    business_type: 'individual',
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    business_profile: { mcc: '6513', url: 'https://regroup-e2e.web.app', product_description: 'Test house' },
    individual: {
      first_name: 'Test',
      last_name: 'Operator',
      email: 'connect@rats-e2e.invalid',
      phone: '+15555550100',
      dob: { day: 1, month: 1, year: 1901 },
      ssn_last_4: '0000',
      id_number: '000000000',
      address: { line1: 'address_full_match', city: 'Austin', state: 'TX', postal_code: '78701', country: 'US' },
    },
    external_account: 'btok_us_verified',
    tos_acceptance: { date: Math.floor(Date.now() / 1000), ip: '127.0.0.1' },
  });
  fs.writeFileSync(connectFile, account.id, { mode: 0o600 });
  return account.id;
}

async function main(): Promise<void> {
  const { stripe, key } = localStripe();
  await assertLocalSandbox(stripe, key);
  if (process.argv.includes('--sweep-clocks')) {
    console.log(`deleted ${await sweepOldClocks(stripe)} old test clocks`);
    return;
  }
  const prices = await ensureCatalog(stripe);
  fs.writeFileSync(path.join(CONFIG_DIR, LOCAL_PRICES_FILE), JSON.stringify(prices, null, 2), { mode: 0o600 });
  const accountId = await ensureConnectAccount(stripe);
  const account = await stripe.accounts.retrieve(accountId);
  console.log(`connect account ${accountId}: charges ${account.charges_enabled}, payouts ${account.payouts_enabled}`);
  const functionsDir = path.resolve(__dirname, '..', '..', 'functions');
  for (const file of writeFunctionsEnvFiles(functionsDir, { 'e2e-emulator': prices }, ['e2e-emulator'])) {
    console.log(`wrote ${file}`);
  }
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
