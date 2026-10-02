#!/usr/bin/env node
/**
 * Backfill `house.subscriptionStatus` from the OPERATOR's subscription.
 *
 * Rewritten 2026-10-02. The previous version derived status from
 * `house.stripeSubscriptionId` — a field that does not exist on either House
 * entity. Houses carry only Stripe *Connect* fields (stripeAccountId,
 * stripeStatus, stripeConnectedAt), which are about receiving rent payouts, not
 * about the operator's subscription. So that branch could never fire: every
 * house fell through to "canceled" while the script demanded a Stripe key and
 * built a client it never meaningfully used. It also SKIPPED houses that already
 * had a real status, which is exactly the set holding a stale value after a mass
 * cancellation — so it could not fix the case it was most needed for.
 *
 * The subscription actually lives on the operator's user document
 * (`user.subscriptionMetadata`), reachable from the house via superAdminId or
 * ownerId. This version resolves that and maps it through the same
 * `operatorStatusToHouseStatus` used by setHouseSubscriptionStatusOnCreate, so
 * new houses and backfilled houses cannot disagree about what an operator state
 * means for access.
 *
 * Re-derives by default (the point of a relaunch backfill). Pass
 * --skip-existing for the old idempotent behaviour.
 *
 * --verify-stripe additionally retrieves each subscription from Stripe and
 * prefers Stripe's own status, reporting every divergence from the stored value.
 * Divergences are how you detect that webhook propagation has been failing, so
 * running with this flag first is strongly recommended.
 *
 * Usage (from functions/, after `npm run build`):
 *   node lib/scripts/migrateHouseSubscriptionStatus.js --dry-run
 *   node lib/scripts/migrateHouseSubscriptionStatus.js --dry-run --verify-stripe
 *   node lib/scripts/migrateHouseSubscriptionStatus.js --limit 5
 *   node lib/scripts/migrateHouseSubscriptionStatus.js
 *
 * --verify-stripe needs STRIPE_SECRET_KEY. Firebase credentials come from
 * GOOGLE_APPLICATION_CREDENTIALS or gcloud ADC.
 *
 * Never logs PII: house ids and operator uids only, never names or addresses.
 */

import './scriptBootstrap';
import Stripe from 'stripe';
import { houseCollection, getUser } from '../api/firestore';
import { operatorStatusToHouseStatus, type HouseSubscriptionStatus } from '../util/entitlement';

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SKIP_EXISTING = args.includes('--skip-existing');
const VERIFY_STRIPE = args.includes('--verify-stripe');
const LIMIT_IDX = args.indexOf('--limit');
const LIMIT = LIMIT_IDX !== -1 ? parseInt(args[LIMIT_IDX + 1], 10) : Infinity;

if (LIMIT_IDX !== -1 && (Number.isNaN(LIMIT) || LIMIT <= 0)) {
  console.error('Error: --limit must be a positive integer');
  process.exit(1);
}

const REAL_STATUSES = new Set<string>(['active', 'trialing', 'past_due', 'canceled', 'unpaid']);

/** Stripe's own status, mapped onto a house status. */
function stripeStatusToHouseStatus(stripeStatus: string): HouseSubscriptionStatus {
  switch (stripeStatus) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due':
      return 'past_due';
    case 'unpaid':
      return 'unpaid';
    // incomplete, incomplete_expired, paused, canceled → no access.
    default:
      return 'canceled';
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  let stripe: Stripe | undefined;
  if (VERIFY_STRIPE) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      console.error(
        '--verify-stripe requires STRIPE_SECRET_KEY. Example:\n' +
          '  STRIPE_SECRET_KEY=sk_live_... node lib/scripts/migrateHouseSubscriptionStatus.js --dry-run --verify-stripe',
      );
      process.exit(1);
    }
    stripe = new Stripe(key, {
      apiVersion: '2026-01-28.clover' as Stripe.LatestApiVersion,
    });
  }

  console.log(
    `Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'} | ` +
      `${SKIP_EXISTING ? 'skip-existing' : 're-derive all'} | ` +
      `${VERIFY_STRIPE ? 'verifying against Stripe' : 'stored status only'} | ` +
      `limit: ${LIMIT}`,
  );

  const snapshot = await houseCollection.get();
  const docs = snapshot.docs.slice(0, LIMIT);
  console.log(`Found ${snapshot.docs.length} houses, processing ${docs.length}`);

  let updated = 0;
  let unchanged = 0;
  let skipped = 0;
  let noOperator = 0;
  let noSubscription = 0;
  let errors = 0;
  const divergences: string[] = [];

  for (const houseDoc of docs) {
    const houseId = houseDoc.id;
    const data = houseDoc.data() as Record<string, unknown>;
    const current = data.subscriptionStatus as string | undefined;

    if (SKIP_EXISTING && current && REAL_STATUSES.has(current)) {
      console.log(`  [SKIP] ${houseId} — already ${current}`);
      skipped++;
      continue;
    }

    const operatorId = (data.superAdminId || data.ownerId) as string | undefined;
    if (!operatorId) {
      // An unattributable house cannot be billed and its operator cannot even be
      // contacted, so leaving it indefinitely `active` is exactly the hole the
      // paywall exists to close. Revoke.
      //
      // Measured on phoenix-cleanhouse 2026-10-02: 92 of 180 houses had neither
      // superAdminId nor ownerId, and 89 of those were `active`. 71 were provably
      // test data (39 with "test" in the name, 20 "demo", 12 unnamed) and 90 of
      // 92 had no capacity at all, so these are seeded or abandoned records
      // rather than operating houses.
      noOperator++;
      if (current === 'canceled') {
        unchanged++;
        continue;
      }
      console.log(
        `  [${DRY_RUN ? 'WOULD SET' : 'SET'}] ${houseId}: ${current ?? 'unset'} -> canceled (no operator)`,
      );
      if (!DRY_RUN) {
        await houseDoc.ref.update({ subscriptionStatus: 'canceled' });
      }
      updated++;
      continue;
    }

    try {
      const operator = await getUser(operatorId);
      const storedStatus = operator?.subscriptionMetadata?.status;
      let target = operatorStatusToHouseStatus(storedStatus);

      if (VERIFY_STRIPE && stripe) {
        const subscriptionId = operator?.subscriptionMetadata?.subscriptionId;
        if (subscriptionId) {
          try {
            const sub = await stripe.subscriptions.retrieve(subscriptionId);
            const fromStripe = stripeStatusToHouseStatus(sub.status);
            if (fromStripe !== target) {
              // Stripe is authoritative. A divergence means the stored status
              // drifted — usually because webhook delivery failed.
              divergences.push(
                `${houseId} (operator ${operatorId}): stored ${
                  storedStatus ?? 'unset'
                } -> house ${target ?? 'deny'}, Stripe ${sub.status} -> house ${fromStripe}`,
              );
            }
            target = fromStripe;
          } catch (err) {
            console.warn(`  [STRIPE ERROR] ${houseId} — ${(err as Error).message}`);
            errors++;
          }
        }
      }

      if (!target) {
        // The operator has no usable subscription. Deny: a house should only
        // exist once its operator has one, so this is also worth noticing.
        console.warn(`  [NO SUBSCRIPTION] ${houseId} (operator ${operatorId}) — setting canceled`);
        noSubscription++;
        target = 'canceled';
      }

      if (current === target) {
        unchanged++;
        continue;
      }

      console.log(
        `  [${DRY_RUN ? 'WOULD SET' : 'SET'}] ${houseId}: ${current ?? 'unset'} -> ${target}`,
      );
      if (!DRY_RUN) {
        await houseDoc.ref.update({ subscriptionStatus: target });
      }
      updated++;
    } catch (err) {
      console.error(`  [ERROR] ${houseId} — ${(err as Error).message}`);
      errors++;
    }
  }

  console.log('\n--- Summary ---');
  console.log(`${DRY_RUN ? 'Would update' : 'Updated'}: ${updated}`);
  console.log(`Already correct:  ${unchanged}`);
  if (SKIP_EXISTING) console.log(`Skipped:          ${skipped}`);
  console.log(`No operator:      ${noOperator}`);
  console.log(`No subscription:  ${noSubscription}`);
  console.log(`Errors:           ${errors}`);

  if (divergences.length) {
    console.log(
      `\n--- ${divergences.length} STORED/STRIPE DIVERGENCES ---\n` +
        'Each of these is a house whose stored status disagreed with Stripe,\n' +
        'which usually means webhook propagation failed. Worth investigating\n' +
        'before trusting subscription state anywhere else.',
    );
    for (const d of divergences) console.log(`  ${d}`);
  } else if (VERIFY_STRIPE) {
    console.log('\nNo stored/Stripe divergences found.');
  }

  if (errors > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
