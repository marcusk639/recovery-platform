#!/usr/bin/env node
/**
 * Data migration: backfill subscriptionStatus on all house documents.
 *
 * Problem: House docs created before the paywall have no subscriptionStatus
 * field. The TypeScript class default 'active' only applies to in-memory
 * objects — Firestore never stored it. Without this field, the paywall gate
 * reads undefined and behaves as if the house has no subscription.
 *
 * Behavior:
 *   - Houses already having subscriptionStatus set are SKIPPED (idempotent).
 *   - Houses with a stripeSubscriptionId: fetch Stripe subscription, use real status.
 *   - Houses without a stripeSubscriptionId: set 'canceled' (no subscription = no access).
 *
 * Usage (from functions/):
 *   npm run build
 *   STRIPE_SECRET_KEY=sk_live_... node lib/scripts/migrateHouseSubscriptionStatus.js --dry-run
 *   STRIPE_SECRET_KEY=sk_live_... node lib/scripts/migrateHouseSubscriptionStatus.js
 *   STRIPE_SECRET_KEY=sk_live_... node lib/scripts/migrateHouseSubscriptionStatus.js --limit 5
 *
 * Requires Firebase credentials (GOOGLE_APPLICATION_CREDENTIALS or gcloud ADC).
 */

import "./scriptBootstrap";
import Stripe from "stripe";
import { houseCollection } from "../api/firestore";

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const LIMIT_IDX = args.indexOf("--limit");
const LIMIT = LIMIT_IDX !== -1 ? parseInt(args[LIMIT_IDX + 1], 10) : Infinity;

if (LIMIT_IDX !== -1 && (Number.isNaN(LIMIT) || LIMIT <= 0)) {
  console.error("Error: --limit must be a positive integer");
  process.exit(1);
}

type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "";

const VALID_STRIPE_STATUSES = new Set<string>([
  "active",
  "trialing",
  "past_due",
  "canceled",
  "unpaid",
  "incomplete",
  "incomplete_expired",
  "paused",
]);

const REAL_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "canceled",
  "unpaid",
]);

function stripeStatusToAppStatus(stripeStatus: string): SubscriptionStatus {
  switch (stripeStatus) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "unpaid":
      return "unpaid";
    default:
      return "canceled";
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    console.error(
      "STRIPE_SECRET_KEY is required. Example:\n" +
        "  STRIPE_SECRET_KEY=sk_live_... node lib/scripts/migrateHouseSubscriptionStatus.js --dry-run",
    );
    process.exit(1);
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2026-01-28.clover" as Stripe.LatestApiVersion,
  });

  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"} | Limit: ${LIMIT}`);

  const snapshot = await houseCollection.get();
  const docs = snapshot.docs.slice(0, LIMIT);
  console.log(
    `Found ${snapshot.docs.length} houses total, processing ${docs.length}`,
  );

  let skipped = 0;
  let updated = 0;
  let errors = 0;

  for (const houseDoc of docs) {
    const data = houseDoc.data() as Record<string, any>;
    const houseId = houseDoc.id;

    // Already has a real status — skip
    if (REAL_STATUSES.has(data.subscriptionStatus)) {
      console.log(
        `  [SKIP] ${houseId} — already has status: ${data.subscriptionStatus}`,
      );
      skipped++;
      continue;
    }

    const stripeSubscriptionId = data.stripeSubscriptionId as
      | string
      | undefined;
    let newStatus: SubscriptionStatus;

    if (stripeSubscriptionId) {
      try {
        const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
        newStatus = VALID_STRIPE_STATUSES.has(sub.status)
          ? stripeStatusToAppStatus(sub.status)
          : "canceled";
        console.log(
          `  [UPDATE] ${houseId} — Stripe status: ${sub.status} → ${newStatus}`,
        );
      } catch (err: any) {
        // Stripe 404 = subscription deleted
        if (err?.statusCode === 404) {
          newStatus = "canceled";
          console.log(`  [UPDATE] ${houseId} — Stripe 404 → canceled`);
        } else {
          console.error(
            `  [ERROR] ${houseId} — Stripe lookup failed: ${err?.message}`,
          );
          errors++;
          continue;
        }
      }
    } else {
      newStatus = "canceled";
      console.log(`  [UPDATE] ${houseId} — no stripeSubscriptionId → canceled`);
    }

    if (!DRY_RUN) {
      await houseDoc.ref.update({ subscriptionStatus: newStatus });
    }
    updated++;
  }

  console.log(
    `\nDone. Skipped: ${skipped} | Updated: ${updated} | Errors: ${errors}`,
  );
  if (errors > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
