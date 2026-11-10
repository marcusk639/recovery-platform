import type Stripe from 'stripe';
import { TIERS } from '../../stripeSandbox';
import { callAs } from '../harness/callables';
import { clockedOperator, deleteOpenClocks } from '../harness/clock';
import { DAY_S, docData, nowS, operatorMeta } from '../harness/flows';
import { seedOperator, SeededOperator } from '../harness/fixtures';
import { assertSafeTarget, LOCAL_KEY_FILE, LOCAL_PRICES_FILE, CONFIG_DIR, PROJECT, readConfigFile } from '../harness/guards';
import * as fs from 'fs';
import * as path from 'path';

let stripe: Stripe;
const prices: Record<string, string> = {};

beforeAll(async () => {
  stripe = await assertSafeTarget();
  Object.assign(prices, JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, LOCAL_PRICES_FILE), 'utf8')));
});
afterAll(() => deleteOpenClocks(stripe));

const checkout = (op: SeededOperator, houseType: string, tier: string, billingInterval = 'month') => ({
  user: { id: op.uid, email: op.email, subscriptionMetadata: { status: '' } },
  paymentMethod: 'pm_card_visa',
  houseType,
  tier,
  billingInterval,
});

const subscriptionsOf = async (email: string) => {
  const customers = await stripe.customers.list({ email, limit: 10 });
  const lists = await Promise.all(customers.data.map((c) => stripe.subscriptions.list({ customer: c.id, status: 'all' })));
  return lists.flatMap((l) => l.data);
};

// Oxford Network is held back from sale until a chapter signs (P-8); SUB-004 covers the refusal.
const CASES = TIERS.filter((t) => t.key !== 'oxford_network').flatMap((t) => {
  const [prefix, tier] = t.key.split('_');
  const houseType = prefix === 'trad' ? 'traditional' : 'oxford';
  return [
    { houseType, tier, interval: 'month', envVar: t.envVar },
    { houseType, tier, interval: 'year', envVar: t.annualEnvVar },
  ];
});

test.each(CASES)('SUB-001: subscribes to $houseType $tier, $interval', async ({ houseType, tier, interval, envVar }) => {
  const op = await seedOperator({ status: '' });
  const res = await callAs(op.uid, 'createOperatorSubscription', checkout(op, houseType, tier, interval));
  expect(res.errorMessage).toBeUndefined();

  const [subscription] = await subscriptionsOf(op.email);
  expect(subscription.status).toBe('trialing');
  expect(subscription.items.data[0].price.id).toBe(prices[envVar]);
  expect(Math.abs((subscription.trial_end as number) - (nowS() + 7 * DAY_S))).toBeLessThan(120);

  const meta = await operatorMeta(op.uid);
  expect(meta).toMatchObject({ status: 'trialing', subscriptionId: subscription.id, customerId: subscription.customer, tier, houseType });
  expect(meta.currentPeriodEnd).toBeTruthy();
});

test('SUB-002: the clocked helper builds what the real callable builds', async () => {
  const real = await seedOperator({ status: '' });
  expect((await callAs(real.uid, 'createOperatorSubscription', checkout(real, 'traditional', 'starter'))).errorMessage).toBeUndefined();
  const [realSub] = await subscriptionsOf(real.email);
  const clocked = await clockedOperator(stripe);
  const clockedSub = await stripe.subscriptions.retrieve(clocked.subscriptionId);

  const { e2eRun: _ignored, ...clockedMetadata } = clockedSub.metadata;
  expect(Object.keys(clockedMetadata).sort()).toEqual(Object.keys(realSub.metadata).sort());
  expect(clockedMetadata).toEqual({ ...realSub.metadata, userId: clocked.uid });
  expect(clockedSub.items.data[0].price.id).toBe(realSub.items.data[0].price.id);
  expect((clockedSub.trial_end as number) - (clockedSub.trial_start as number)).toBe(7 * DAY_S);

  const realDoc = await docData(`subscriptions/${realSub.id}`);
  const clockedDoc = await docData(`subscriptions/${clockedSub.id}`);
  for (const key of ['stripeCustomerId', 'stripeSubscriptionId', 'status', 'planId', 'userId', 'houseId', 'guestCount']) {
    expect(Object.keys(clockedDoc)).toContain(key);
    expect(Object.keys(realDoc)).toContain(key);
  }
});

/** Runs the callable in this process, because its env can't change per test in the emulator. */
async function runWithEnv(env: Record<string, string>, op: SeededOperator, data: object): Promise<unknown> {
  const saved = { ...process.env };
  Object.assign(process.env, { STRIPE_SECRET_KEY: readConfigFile(LOCAL_KEY_FILE), ...prices, ...env });
  try {
    // The functions' own firebase-admin, pointed at the same emulators.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const functionsAdmin = require('../../../../functions/node_modules/firebase-admin');
    if (functionsAdmin.apps.length === 0) functionsAdmin.initializeApp({ projectId: PROJECT });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createOperatorSubscription } = require('../../../../functions/lib/callable/subscriptions');
    return await createOperatorSubscription.run({ auth: { uid: op.uid, token: {} }, data });
  } finally {
    process.env = saved;
  }
}

test('SUB-003: billing off refuses checkout, with no silent fallback to the legacy shape', async () => {
  const op = await seedOperator({ status: '' });
  await expect(runWithEnv({ TIER_BILLING_ENABLED: 'false' }, op, checkout(op, 'traditional', 'starter'))).rejects.toThrow(/billing|not enabled|unavailable/i);
  expect(await subscriptionsOf(op.email)).toHaveLength(0);
});

test('SUB-004: a tier not in the catalog is refused, leaving no subscription', async () => {
  const op = await seedOperator({ status: '' });
  expect((await callAs(op.uid, 'createOperatorSubscription', checkout(op, 'traditional', 'platinum'))).errorCode).toBeTruthy();
  expect(await subscriptionsOf(op.email)).toHaveLength(0);
});

test('SUB-004: a tier held back from sale is refused, leaving no subscription', async () => {
  const op = await seedOperator({ status: '' });
  expect((await callAs(op.uid, 'createOperatorSubscription', checkout(op, 'oxford', 'network'))).errorCode).toBe('failed-precondition');
  expect(await subscriptionsOf(op.email)).toHaveLength(0);
});

test('SUB-004: a price that isn’t configured is refused, leaving no subscription', async () => {
  const op = await seedOperator({ status: '' });
  await expect(runWithEnv({ TIER_BILLING_ENABLED: 'true', STRIPE_PRICE_TRAD_STARTER: '' }, op, checkout(op, 'traditional', 'starter'))).rejects.toThrow(/Price ID not configured/);
  expect(await subscriptionsOf(op.email)).toHaveLength(0);
});

test('SUB-010: the same checkout submitted twice makes one subscription and one customer', async () => {
  const op = await seedOperator({ status: '' });
  await callAs(op.uid, 'createOperatorSubscription', checkout(op, 'traditional', 'starter'));
  await callAs(op.uid, 'createOperatorSubscription', checkout(op, 'traditional', 'starter'));
  expect(await subscriptionsOf(op.email)).toHaveLength(1);
  expect((await stripe.customers.list({ email: op.email })).data).toHaveLength(1);
});

test('SUB-010: submitted concurrently, as in two tabs, it still makes one', async () => {
  const op = await seedOperator({ status: '' });
  await Promise.all([1, 2].map(() => callAs(op.uid, 'createOperatorSubscription', checkout(op, 'traditional', 'starter'))));
  expect(await subscriptionsOf(op.email)).toHaveLength(1);
});
