/**
 * Convert `payments.createdAt` from an ISO string to a Firestore Timestamp.
 *
 * The webhook writes createdAt as a Timestamp; mobile's recordManualPayment
 * wrote an ISO string until the change that shipped with this script.
 * Firestore orders values by type before value, so the resident history query
 * (orderBy createdAt desc) listed every string-dated payment above every
 * card payment, whatever their dates. Converting the strings puts every record
 * on one type.
 *
 * Dry run is the DEFAULT — writing requires --apply.
 *
 *   # rehearse against seeded emulator data
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node lib/scripts/migratePaymentCreatedAtToTimestamp.js
 *
 *   # report against production without writing (read-only)
 *   node lib/scripts/migratePaymentCreatedAtToTimestamp.js
 *
 *   # write (only after the dry-run report has been reviewed)
 *   node lib/scripts/migratePaymentCreatedAtToTimestamp.js --apply
 *
 * Run it AFTER the mobile release that writes Timestamps is the one in use, so
 * no old client is still creating string-dated records. Re-running is safe: a
 * Timestamp is never touched. Each converted value is the same instant the
 * string named. A missing or unparseable createdAt, or a string with no time
 * zone, is reported and left alone, never guessed.
 *
 * Logs counts and document ids only — never names, amounts or uids.
 */
import './scriptBootstrap';
import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

const BATCH_LIMIT = 400;

/** Ends in Z or ±hh:mm. Without a zone, Date.parse uses this host's local time. */
const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;

export type Verdict =
  | { kind: 'timestamp' }
  | { kind: 'missing' }
  | { kind: 'unusable' }
  | { kind: 'convert'; millis: number };

/** Decide what to do with one payment document's createdAt. */
export function classify(payment: Record<string, unknown>): Verdict {
  const value = payment.createdAt;
  if (value === undefined || value === null) return { kind: 'missing' };
  if (value instanceof Timestamp) return { kind: 'timestamp' };
  if (typeof value === 'string') {
    if (!HAS_ZONE.test(value.trim())) return { kind: 'unusable' };
    const millis = Date.parse(value);
    return Number.isNaN(millis) ? { kind: 'unusable' } : { kind: 'convert', millis };
  }
  return { kind: 'unusable' };
}

export interface Counts {
  scanned: number;
  alreadyTimestamp: number;
  converted: number;
  missing: number;
  unusable: number;
}

export async function run(database: FirebaseFirestore.Firestore, apply: boolean): Promise<Counts> {
  console.log(
    `Mode: ${apply ? 'LIVE (writes)' : 'DRY RUN (no writes)'} — payments.createdAt to Timestamp`,
  );

  const snapshot = await database.collection('payments').get();
  const counts: Counts = { scanned: 0, alreadyTimestamp: 0, converted: 0, missing: 0, unusable: 0 };
  const leftAlone: string[] = [];

  let batch = database.batch();
  let pending = 0;

  for (const doc of snapshot.docs) {
    counts.scanned++;
    const verdict = classify(doc.data() as Record<string, unknown>);

    switch (verdict.kind) {
      case 'timestamp':
        counts.alreadyTimestamp++;
        continue;
      case 'missing':
        counts.missing++;
        leftAlone.push(`  ${doc.id}: no createdAt`);
        continue;
      case 'unusable':
        counts.unusable++;
        leftAlone.push(`  ${doc.id}: createdAt is unparseable or has no time zone`);
        continue;
      case 'convert':
        counts.converted++;
    }

    if (!apply) continue;

    batch.update(doc.ref, { createdAt: Timestamp.fromMillis(verdict.millis) });
    pending++;
    if (pending >= BATCH_LIMIT) {
      await batch.commit();
      console.log(`  committed ${pending} documents`);
      batch = database.batch();
      pending = 0;
    }
  }

  if (apply && pending > 0) {
    await batch.commit();
    console.log(`  committed ${pending} documents`);
  }

  console.log('\n--- Summary ---');
  console.log(`Scanned:                   ${counts.scanned}`);
  console.log(`Already a Timestamp:       ${counts.alreadyTimestamp}`);
  console.log(
    `${apply ? 'Converted:                ' : 'Would convert:            '} ${counts.converted}`,
  );
  console.log(`No createdAt (left):       ${counts.missing}`);
  console.log(`Unusable value (left):     ${counts.unusable}`);

  if (leftAlone.length > 0) {
    // Ids only; the values are not logged.
    console.log('\nDocuments left as they are:');
    for (const line of leftAlone) console.log(line);
  }

  if (!apply) {
    console.log('\nNothing was written. Re-run with --apply to commit.');
  }

  return counts;
}

export async function main(
  argv: string[] = process.argv.slice(2),
  database: FirebaseFirestore.Firestore = admin.firestore(),
): Promise<void> {
  await run(database, argv.includes('--apply'));
}

// Guard against the module being imported by a test runner.
if (require.main === module) {
  main().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}
