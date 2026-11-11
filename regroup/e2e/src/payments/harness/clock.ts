import * as fs from 'fs';
import * as path from 'path';
import type Stripe from 'stripe';
import { adminDb, seedOperator, SeededOperator, uniqueId } from './fixtures';
import { CONFIG_DIR, LOCAL_PRICES_FILE } from './guards';
import { waitFor } from './waitFor';

const openClocks = new Set<string>();

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
  const failed: string[] = [];
  for (const id of openClocks) {
    try {
      await stripe.testHelpers.testClocks.del(id);
    } catch (err) {
      // Already gone is fine; anything else leaves a clock behind for the sweep.
      if ((err as { code?: string }).code !== 'resource_missing') failed.push(id);
    }
    openClocks.delete(id);
  }
  if (failed.length > 0) console.warn(`could not delete test clocks ${failed.join(', ')}; the next run sweeps them`);
}

/** Deletes clocks left by crashed runs, since Stripe limits clocks per account. */
export async function sweepOldClocks(stripe: Stripe, olderThanS = 3600): Promise<number> {
  const cutoff = Math.floor(Date.now() / 1000) - olderThanS;
  const stale: Stripe.TestHelpers.TestClock[] = [];
  for await (const c of stripe.testHelpers.testClocks.list({ limit: 100 })) {
    if (c.name?.startsWith(CLOCK_PREFIX) && c.created < cutoff) stale.push(c);
  }
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
 * to it. This builds the same Stripe subscription (price, trial, metadata) and a
 * subscriptions doc with the same keys on a clocked customer, which SUB-002 checks.
 * It doesn't write everything the callable writes to the user's subscriptionMetadata:
 * maxResidents and maxProperties are absent, so an operator made here has no limits.
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
  if (!price) throw new Error(`${priceEnvVar} is not in ${LOCAL_PRICES_FILE}: run npm run test:payments, whose setup writes it`);
  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price, quantity: 1 }],
    ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
    metadata: { userId: operator.uid, houseType, tier, billingInterval: 'month', e2eRun: operator.uid },
  });
  const item = subscription.items.data[0];
  if (!item?.current_period_end) {
    throw new Error(`subscription ${subscription.id} has no item period end; the Stripe API shape changed`);
  }
  const periodEndS = item.current_period_end;
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
    'subscriptionMetadata.subscriptionItemId': item.id,
    'subscriptionMetadata.houseType': houseType,
    'subscriptionMetadata.tier': tier,
  });
  return { ...operator, subscriptionId: subscription.id, customerId: customer.id, clockId: clock.id, frozenTime: clock.frozen_time };
}
