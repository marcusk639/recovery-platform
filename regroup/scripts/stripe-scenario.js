#!/usr/bin/env node
/**
 * Drive real Stripe test-mode money flows so their webhooks reach the local
 * emulator through `stripe listen`.
 *
 * `stripe trigger charge.refunded` creates a plain charge with no transfer to a
 * house, so the transfer-reversal code only logs "nothing to reverse". These
 * scenarios create rent the way the app does: a destination charge to a house's
 * Connect account with a platform application fee.
 *
 *   refund       destination charge, then a full refund
 *                → charge.refunded reverses the house's net share
 *   dispute      destination charge with Stripe's dispute test card
 *                → charge.dispute.created reverses the house's net share
 *   dispute-won  as dispute, then submits Stripe's winning test evidence
 *                → charge.dispute.closed (won) returns the share to the house
 *
 * Needs, in the environment or regroup/functions/.secret.local:
 *   STRIPE_SECRET_KEY            an sk_test_ key (refuses anything else)
 *   STRIPE_TEST_HOUSE_ACCOUNT    acct_… of a TEST connected account whose
 *                                transfers capability is active
 * The Stripe CLI running `stripe listen` must be logged into the same account
 * as the key, or the events won't be forwarded.
 *
 * Run from regroup/functions:  npm run stripe:scenario:refund
 */
'use strict';

const fs = require('fs');
const path = require('path');

const scenario = process.argv[2];
if (!['refund', 'dispute', 'dispute-won'].includes(scenario)) {
  console.error('usage: stripe-scenario.js refund|dispute|dispute-won');
  process.exit(1);
}

function fromSecretFile(name) {
  const file = path.resolve(process.cwd(), '.secret.local');
  if (!fs.existsSync(file)) return '';
  const line = fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .find((l) => l.startsWith(`${name}=`));
  return line
    ? line
        .slice(name.length + 1)
        .replace(/^"|"$/g, '')
        .trim()
    : '';
}

const key = process.env.STRIPE_SECRET_KEY || fromSecretFile('STRIPE_SECRET_KEY');
const house = process.env.STRIPE_TEST_HOUSE_ACCOUNT || fromSecretFile('STRIPE_TEST_HOUSE_ACCOUNT');

if (!/^(sk|rk)_test_/.test(key)) {
  console.error('stripe-scenario: refusing to run without a test-mode key (sk_test_/rk_test_).');
  process.exit(1);
}
if (!/^acct_/.test(house)) {
  console.error(
    'stripe-scenario: set STRIPE_TEST_HOUSE_ACCOUNT to a test connected account (acct_…).',
  );
  process.exit(1);
}

// Use the functions package's pinned stripe dependency and API version.
const Stripe = require(require.resolve('stripe', { paths: [process.cwd()] }));
const { STRIPE_API_VERSION } = (() => {
  try {
    return require(path.resolve(process.cwd(), 'lib/util/stripeApiVersion.js'));
  } catch {
    return { STRIPE_API_VERSION: '2026-01-28.clover' };
  }
})();
const stripe = new Stripe(key, { apiVersion: STRIPE_API_VERSION });

const RENT_CENTS = 50000; // $500
const FEE_CENTS = 1500; // $15 platform fee → the house nets $485

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function destinationCharge(paymentMethod) {
  const account = await stripe.accounts.retrieve(house);
  if (account.capabilities?.transfers !== 'active') {
    throw new Error(
      `${house} can't receive transfers yet (transfers: ${account.capabilities?.transfers ?? 'absent'}).`,
    );
  }
  const intent = await stripe.paymentIntents.create({
    amount: RENT_CENTS,
    currency: 'usd',
    payment_method: paymentMethod,
    // Dynamic payment methods; no redirects, since this runs without a browser.
    automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    confirm: true,
    transfer_data: { destination: house },
    application_fee_amount: FEE_CENTS,
    metadata: { scenario, source: 'regroup/scripts/stripe-scenario.js' },
  });
  console.log(`charged $${RENT_CENTS / 100} to ${house}: ${intent.id} (${intent.status})`);
  return intent;
}

async function waitForDispute(chargeId) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data } = await stripe.disputes.list({ charge: chargeId, limit: 1 });
    if (data.length > 0) return data[0];
    await sleep(1500);
  }
  throw new Error(`no dispute appeared for ${chargeId}`);
}

(async () => {
  if (scenario === 'refund') {
    const intent = await destinationCharge('pm_card_visa');
    const refund = await stripe.refunds.create({ payment_intent: intent.id });
    console.log(`refunded: ${refund.id} (${refund.status})`);
    console.log('Expect: charge.refunded → a $485.00 reversal on the transfer (house net share).');
    return;
  }

  const intent = await destinationCharge('pm_card_createDispute');
  const dispute = await waitForDispute(intent.latest_charge);
  console.log(`dispute opened: ${dispute.id} (${dispute.status})`);
  console.log('Expect: charge.dispute.created → a $485.00 reversal on the transfer.');

  if (scenario === 'dispute-won') {
    // Stripe's test-mode evidence text that resolves the dispute in your favour.
    await stripe.disputes.update(dispute.id, {
      evidence: { uncategorized_text: 'winning_evidence' },
      submit: true,
    });
    console.log('submitted winning evidence; Stripe closes it as won within a few minutes.');
    console.log('Expect: charge.dispute.closed (won) → a $485.00 transfer back to the house.');
  }
})().catch((err) => {
  console.error(`stripe-scenario: ${err.message}`);
  process.exit(1);
});
