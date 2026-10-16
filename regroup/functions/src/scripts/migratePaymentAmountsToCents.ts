/**
 * Normalise `payments.amount` to integer CENTS (#82).
 *
 * UNRUN. This script has never been executed against any Firestore project.
 * It needs human sign-off and an emulator rehearsal before it touches
 * phoenix-cleanhouse. Dry run is the DEFAULT — writing requires --apply.
 *
 *   # rehearse against seeded emulator data
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *     node lib/scripts/migratePaymentAmountsToCents.js
 *
 *   # report against production without writing (read-only)
 *   node lib/scripts/migratePaymentAmountsToCents.js
 *
 *   # write (only after the dry-run report has been reviewed)
 *   node lib/scripts/migratePaymentAmountsToCents.js --apply
 *
 * WHY A MIGRATION IS NEEDED
 * Before #82 the Stripe webhook wrote `amount` in dollars while mobile's
 * recordManualPayment and recordRentPayment wrote cents. Stored documents are
 * therefore a mix of both units with no unit field.
 *
 * HOW A STORED DOCUMENT'S UNIT IS TOLD APART
 * In order of confidence:
 *
 *  1. `rentAppliedAmountCents` — written by the webhook's rentOwed transaction
 *     as an independent integer-cents copy of the same figure. Where it
 *     exists it IS the answer; no arithmetic on `amount` is needed. If it
 *     agrees with neither `amount` nor `amount * 100`, the document is
 *     ambiguous and is reported, never rewritten.
 *
 *  2. `stripePaymentIntentId` plus a terminal status. Both the webhook and
 *     mobile's recordRentPayment set this id, so the id ALONE does not
 *     identify the writer. But recordRentPayment only ever writes
 *     `status: "pending"` and refuses to downgrade a doc the webhook has
 *     already moved past pending, so on a succeeded/failed/resolved_offline
 *     doc the webhook wrote `amount` last — dollars.
 *
 *  3. Absence of `stripePaymentIntentId` — only recordManualPayment writes
 *     such a document (auto id, cash/check/Venmo/Zelle). Cents already.
 *
 * `Number.isInteger(amount)` is used only as a corroborating check: cents are
 * always integers, so a fractional value cannot be cents. Where it contradicts
 * the structural rule the document is reported as a conflict, not rewritten.
 *
 * KNOWN HOLE — non-USD quarantine documents. The unsupported-currency branch
 * writes `amountMinorUnits` and never `amount`, so any `amount` on such a doc
 * was left there by mobile in cents, while the doc still carries a
 * PaymentIntent id and a succeeded status. Rule 2 would misclassify it. These
 * are excluded and reported for manual handling; they are already flagged
 * `needsManualReconciliation`.
 *
 * Idempotent: a migrated document carries `amountMigratedToCentsAt` and is
 * skipped on a re-run. That field is migration bookkeeping, not part of the
 * payments contract — no reader looks at it.
 */
import './scriptBootstrap';
import * as admin from 'firebase-admin';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');

const db = admin.firestore();
const BATCH_LIMIT = 400;

/** Statuses that prove the webhook, not recordRentPayment, wrote `amount` last. */
const WEBHOOK_TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'resolved_offline']);

type Verdict =
  | { kind: 'cents' } // already correct, mark only
  | { kind: 'dollars'; cents: number } // rewrite to `cents`
  | { kind: 'skip'; reason: string } // nothing to do
  | { kind: 'report'; reason: string }; // needs a human

export function classify(data: Record<string, unknown>): Verdict {
  if (data.amountMigratedToCentsAt !== undefined) {
    return { kind: 'skip', reason: 'already migrated' };
  }

  const amount = data.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    return { kind: 'skip', reason: 'no numeric amount' };
  }

  if (data.refusedReason === 'unsupported_currency' || data.amountMinorUnits !== undefined) {
    return { kind: 'report', reason: 'non-USD quarantine — handle by hand' };
  }
  if (data.currency !== undefined && data.currency !== 'usd') {
    return { kind: 'report', reason: `currency ${String(data.currency)}` };
  }

  const integral = Number.isInteger(amount);

  // 1. rentAppliedAmountCents is an independent witness in known cents.
  const applied = data.rentAppliedAmountCents;
  if (typeof applied === 'number' && Number.isFinite(applied)) {
    if (applied === amount) return { kind: 'cents' };
    if (Math.round(amount * 100) === applied) {
      return { kind: 'dollars', cents: applied };
    }
    return {
      kind: 'report',
      reason: 'rentAppliedAmountCents matches neither amount nor amount*100',
    };
  }

  // 2/3. Writer inferred from the id + status shape.
  const hasIntentId = typeof data.stripePaymentIntentId === 'string';
  const status = typeof data.status === 'string' ? data.status : '';
  const webhookWrote = hasIntentId && WEBHOOK_TERMINAL_STATUSES.has(status);

  if (webhookWrote) {
    // Corroboration: a webhook-written dollars value may legitimately be
    // integral ($500 → 500), so only the reverse direction is informative.
    return { kind: 'dollars', cents: Math.round(amount * 100) };
  }

  if (!integral) {
    return {
      kind: 'report',
      reason: 'fractional amount on a doc that should hold cents',
    };
  }
  return { kind: 'cents' };
}

interface Counts {
  scanned: number;
  dollarsConverted: number;
  alreadyCents: number;
  skipped: number;
  reported: number;
}

async function main(): Promise<void> {
  console.log(
    `Mode: ${APPLY ? 'LIVE (writes)' : 'DRY RUN (no writes)'} — payments.amount → cents (#82)`,
  );

  const snapshot = await db.collection('payments').get();
  const counts: Counts = {
    scanned: 0,
    dollarsConverted: 0,
    alreadyCents: 0,
    skipped: 0,
    reported: 0,
  };
  const reports: string[] = [];

  let batch = db.batch();
  let pending = 0;

  for (const doc of snapshot.docs) {
    counts.scanned++;
    const data = doc.data() as Record<string, unknown>;
    const verdict = classify(data);

    if (verdict.kind === 'skip') {
      counts.skipped++;
      continue;
    }
    if (verdict.kind === 'report') {
      counts.reported++;
      // Document ids only. These are payment records — never log resident
      // names, amounts per resident, or any other PII.
      reports.push(`  ${doc.id}: ${verdict.reason}`);
      continue;
    }

    const update: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> =
      {
        amountMigratedToCentsAt: admin.firestore.FieldValue.serverTimestamp(),
      };
    if (verdict.kind === 'dollars') {
      counts.dollarsConverted++;
      update.amount = verdict.cents;
    } else {
      counts.alreadyCents++;
    }

    if (!APPLY) continue;

    batch.update(doc.ref, update);
    pending++;
    if (pending >= BATCH_LIMIT) {
      await batch.commit();
      console.log(`  committed ${pending} documents`);
      batch = db.batch();
      pending = 0;
    }
  }

  if (APPLY && pending > 0) {
    await batch.commit();
    console.log(`  committed ${pending} documents`);
  }

  console.log('\n--- Summary ---');
  console.log(`Scanned:                 ${counts.scanned}`);
  console.log(
    `${APPLY ? 'Converted dollars→cents:' : 'Would convert d→c:      '} ${counts.dollarsConverted}`,
  );
  console.log(`Already cents (marked):  ${counts.alreadyCents}`);
  console.log(`Skipped:                 ${counts.skipped}`);
  console.log(`Needs a human:           ${counts.reported}`);

  if (reports.length > 0) {
    console.log('\nDocuments this migration refuses to touch:');
    for (const line of reports) console.log(line);
    process.exitCode = 1;
  }

  if (!APPLY) {
    console.log('\nNothing was written. Re-run with --apply to commit.');
  }
}

// Guard against the module being imported by a test runner.
if (require.main === module) {
  main().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}
