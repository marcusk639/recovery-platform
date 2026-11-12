/**
 * Launch step (spec §4.1 item 4, §6.1): cancel the live legacy subscriptions,
 * marked so the webhook sends no "canceled" push. Cancellation can't be undone,
 * so this is dry-run first, cancels only IDs the owner confirmed, and writes a
 * record of each subscription outside the repo before touching Stripe.
 *
 *   npm run legacy:cancel                      list: legacy, and everything not touched
 *   npm run legacy:cancel -- --apply --ids=sub_a,sub_b --record=/path/outside/repo.json
 *
 * STRIPE_SECRET_KEY: for the live run a restricted key (rk_live_) with read and
 * write on Subscriptions only, revoked afterwards. A full sk_live_ key is
 * refused unless --allow-full-key is passed. Prints IDs and counts only.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import Stripe from 'stripe';
import { STRIPE_API_VERSION } from '../util/stripeApiVersion';
import { tierForPriceId } from '../util/tierPricing';
import { LAUNCH_CANCEL_METADATA_KEY } from '../webhooks/subscriptionNotices';

/** The live legacy prices: $10 Home and $1 Resident (spec §3.2 item 6). */
export const LEGACY_PRICE_IDS = ['plan_HFkfwM5lQx6oud', 'plan_HFkh7QvRnNjMy8'];

const LIVE_STATUSES = ['active', 'trialing', 'past_due', 'unpaid'];

export interface LegacyRecord {
  id: string;
  customer: string;
  status: string;
  items: { price: string; quantity: number }[];
  metadata: Record<string, string>;
}

async function liveSubscriptions(stripe: Stripe): Promise<Stripe.Subscription[]> {
  const subs: Stripe.Subscription[] = [];
  for await (const sub of stripe.subscriptions.list({ limit: 100 })) {
    if (LIVE_STATUSES.includes(sub.status)) subs.push(sub);
  }
  return subs;
}

const pricesOf = (sub: Stripe.Subscription) => sub.items.data.map((i) => i.price.id);
const isLegacy = (sub: Stripe.Subscription) =>
  pricesOf(sub).length > 0 && pricesOf(sub).every((p) => LEGACY_PRICE_IDS.includes(p));
const isTier = (sub: Stripe.Subscription) => pricesOf(sub).some((p) => tierForPriceId(p));

export async function listLegacySubscriptions(stripe: Stripe): Promise<LegacyRecord[]> {
  return (await liveSubscriptions(stripe)).filter(isLegacy).map((sub) => ({
    id: sub.id,
    customer: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    status: sub.status,
    items: sub.items.data.map((i) => ({ price: i.price.id, quantity: i.quantity ?? 1 })),
    metadata: { ...sub.metadata },
  }));
}

/** Live subscriptions that are neither tier nor legacy: shown, never touched. */
export async function listUnmatched(stripe: Stripe): Promise<string[]> {
  return (await liveSubscriptions(stripe))
    .filter((sub) => !isLegacy(sub) && !isTier(sub))
    .map((sub) => sub.id);
}

function repoRoot(): string {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: __dirname,
    encoding: 'utf8',
  }).trim();
}

export async function cancelListed(
  stripe: Stripe,
  records: LegacyRecord[],
  ids: string[],
  recordPath: string,
): Promise<string[]> {
  const chosen = ids.map((id) => records.find((r) => r.id === id));
  const unknown = ids.filter((_, i) => !chosen[i]);
  if (unknown.length > 0) {
    throw new Error(`Not listed as legacy, refusing: ${unknown.join(', ')}`);
  }
  const target = path.resolve(recordPath);
  const root = repoRoot();
  if (target === root || target.startsWith(root + path.sep)) {
    throw new Error(`The record must be written outside the repository (${root})`);
  }
  // Before any Stripe write: a canceled subscription can't be reactivated.
  fs.writeFileSync(target, JSON.stringify(chosen, null, 2), { mode: 0o600, flag: 'wx' });

  const canceled: string[] = [];
  for (const id of ids) {
    await stripe.subscriptions.update(id, { metadata: { [LAUNCH_CANCEL_METADATA_KEY]: 'true' } });
    await stripe.subscriptions.cancel(id);
    canceled.push(id);
  }
  return canceled;
}

const arg = (argv: string[], name: string): string | undefined =>
  argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

export async function main(
  argv: string[] = process.argv.slice(2),
  deps: {
    env?: NodeJS.ProcessEnv;
    makeStripe?: (key: string) => Stripe;
    log?: (...parts: unknown[]) => void;
  } = {},
): Promise<void> {
  const env = deps.env ?? process.env;
  const log = deps.log ?? console.log;
  const key = env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is required');
  if (key.startsWith('sk_live_') && !argv.includes('--allow-full-key')) {
    throw new Error(
      'Use a restricted live key (rk_live_) with Subscriptions read and write only, or pass --allow-full-key',
    );
  }
  const mode = key.startsWith('sk_live_') || key.startsWith('rk_live_') ? 'live' : 'test';
  const stripe = (
    deps.makeStripe ?? ((k) => new Stripe(k, { apiVersion: STRIPE_API_VERSION as never }))
  )(key);
  log(`Stripe mode: ${mode}`);

  const records = await listLegacySubscriptions(stripe);
  log(`Legacy subscriptions (${records.length}): ${records.map((r) => r.id).join(', ') || 'none'}`);
  const others = await listUnmatched(stripe);
  log(`Not touched (${others.length}): ${others.join(', ') || 'none'}`);

  if (!argv.includes('--apply')) {
    log(
      'Dry run: nothing canceled. Confirm the IDs, then re-run with --apply --ids=... --record=...',
    );
    return;
  }
  const ids = (arg(argv, 'ids') ?? '').split(',').filter(Boolean);
  const recordPath = arg(argv, 'record');
  if (ids.length === 0 || !recordPath) {
    throw new Error('--apply needs --ids=sub_a,sub_b and --record=<path outside the repo>');
  }
  const canceled = await cancelListed(stripe, records, ids, recordPath);
  log(`Canceled (${canceled.length}): ${canceled.join(', ')}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
