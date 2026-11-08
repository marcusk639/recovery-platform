import * as fs from 'fs';
import * as path from 'path';
import type Stripe from 'stripe';
import { adminDb, seedOperator, SeededOperator, uniqueId } from './fixtures';
import { CONFIG_DIR, LOCAL_PRICES_FILE } from './guards';
import { waitFor } from './waitFor';

const openClocks = new Set<string>();
const DAY_S = 86400;

export const CLOCK_PREFIX = 'e2e-';

async function createClock(stripe: Stripe): Promise<Stripe.TestHelpers.TestClock> {
  const clock = await stripe.testHelpers.testClocks.create({
    frozen_time: Math.floor(Date.now() / 1000),
    name: `${CLOCK_PREFIX}${uniqueId('clock')}`,
  });
  openClocks.add(clock.id);
  return clock;
}

/** Moves Stripe's time only: functions and the app keep reading Date.now(). */
export async function advance(stripe: Stripe, clockId: string, toEpoch: number): Promise<void> {
  await stripe.testHelpers.testClocks.advance(clockId, { frozen_time: toEpoch });
  await waitFor(
    () => stripe.testHelpers.testClocks.retrieve(clockId),
    (clock) => clock.status === 'ready',
    120000,
  );
}

export async function deleteOpenClocks(stripe: Stripe): Promise<void> {
  for (const id of openClocks) {
    await stripe.testHelpers.testClocks.del(id).catch(() => undefined);
    openClocks.delete(id);
  }
}

/** Deletes clocks left by crashed runs, since Stripe limits clocks per account. */
export async function sweepOldClocks(stripe: Stripe, olderThanS = 3600): Promise<number> {
  const clocks = await stripe.testHelpers.testClocks.list({ limit: 100 });
  const cutoff = Math.floor(Date.now() / 1000) - olderThanS;
  const stale = clocks.data.filter((c) => c.name?.startsWith(CLOCK_PREFIX) && c.created < cutoff);
  for (const clock of stale) await stripe.testHelpers.testClocks.del(clock.id);
  return stale.length;
}

export type ClockedOperator = SeededOperator & {
  subscriptionId: string;
  customerId: string;
  clockId: string;
  frozenTime: number;
};

const prices = (): Record<string, string> =>
  JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, LOCAL_PRICES_FILE), 'utf8'));

/**
 * createOperatorSubscription creates its own customer, so no clock can be attached
 * to it. This builds the same subscription, metadata and subscriptions doc on a
 * clocked customer. SUB-002 proves the two stay the same.
 */
export async function clockedOperator(
  stripe: Stripe,
  opts: { priceEnvVar?: string; houseType?: string; tier?: string; failingCard?: boolean; trialDays?: number } = {},
): Promise<ClockedOperator> {
  const { priceEnvVar = 'STRIPE_PRICE_TRAD_STARTER', houseType = 'traditional', tier = 'starter', trialDays = 7 } = opts;
  const clock = await createClock(stripe);
  const operator = await seedOperator({ status: trialDays > 0 ? 'trialing' : 'active' });
  const customer = await stripe.customers.create({
    test_clock: clock.id,
    email: operator.email,
    metadata: { e2eRun: operator.uid },
  });
  const paymentMethod = await stripe.paymentMethods.attach(
    opts.failingCard ? 'pm_card_chargeCustomerFail' : 'pm_card_visa',
    { customer: customer.id },
  );
  await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: paymentMethod.id } });
  const price = prices()[priceEnvVar];
  if (!price) throw new Error(`${priceEnvVar} is not in ${LOCAL_PRICES_FILE}: run npm run payments:setup`);
  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price, quantity: 1 }],
    ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
    metadata: { userId: operator.uid, houseType, tier, billingInterval: 'month', e2eRun: operator.uid },
  });
  const periodEndS = subscription.items.data[0]?.current_period_end ?? clock.frozen_time + 30 * DAY_S;
  const db = adminDb();
  await db.doc(`subscriptions/${subscription.id}`).set({
    id: subscription.id,
    houseId: '',
    stripeCustomerId: customer.id,
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    currentPeriodEnd: new Date(periodEndS * 1000).toISOString(),
    planId: price,
    guestCount: 0,
    userId: operator.uid,
  });
  await db.doc(`users/${operator.uid}`).update({
    'subscriptionMetadata.status': subscription.status,
    'subscriptionMetadata.subscriptionId': subscription.id,
    'subscriptionMetadata.customerId': customer.id,
    'subscriptionMetadata.houseType': houseType,
    'subscriptionMetadata.tier': tier,
  });
  return { ...operator, subscriptionId: subscription.id, customerId: customer.id, clockId: clock.id, frozenTime: clock.frozen_time };
}
