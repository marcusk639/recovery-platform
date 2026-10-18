/**
 * Move the legacy `guests.balance` (dollars) into `guests.rentOwed` (integer
 * cents) and delete `balance`.
 *
 * Dry run is the DEFAULT — writing requires --apply.
 *
 *   # rehearse against seeded emulator data
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run migrate:balance-cents:dry-run
 *
 *   # report against production without writing (read-only)
 *   npm run migrate:balance-cents:dry-run
 *
 *   # write (only after the dry-run report has been reviewed)
 *   npm run migrate:balance-cents:apply
 *
 * scriptBootstrap picks the target (emulator, or phoenix-cleanhouse with
 * service-key.json / application-default credentials) and logs it, so a run
 * can never land on a project nobody chose.
 *
 * A guest that already has `rentOwed` is REPORTED, never rewritten. rentOwed
 * is the live field; a `balance` left beside it is stale, and replacing the
 * current figure with it would silently change what a resident owes. A balance
 * that is not a finite number is reported for the same reason.
 *
 * Idempotent: a converted guest no longer has `balance`, so a re-run skips it.
 */
import './scriptBootstrap';
import * as admin from 'firebase-admin';

const db = admin.firestore();
const BATCH_LIMIT = 400;

type Verdict =
  | { kind: 'convert'; rentOwed: number }
  | { kind: 'skip'; reason: string }
  | { kind: 'report'; reason: string };

export function classify(data: Record<string, unknown>): Verdict {
  if (!('balance' in data) || data.balance === undefined) {
    return { kind: 'skip', reason: 'no legacy balance' };
  }

  const balance = data.balance;
  if (typeof balance !== 'number' || !Number.isFinite(balance)) {
    return { kind: 'report', reason: 'balance is not a finite number' };
  }
  if (data.rentOwed !== undefined) {
    return { kind: 'report', reason: 'already has rentOwed — would overwrite the live figure' };
  }

  return { kind: 'convert', rentOwed: Math.round(balance * 100) };
}

interface Counts {
  scanned: number;
  converted: number;
  skipped: number;
  reported: number;
}

export async function run(database: FirebaseFirestore.Firestore, apply: boolean): Promise<Counts> {
  console.log(
    `Mode: ${apply ? 'LIVE (writes)' : 'DRY RUN (no writes)'} — guests.balance → rentOwed cents`,
  );

  const snapshot = await database.collection('guests').get();
  const counts: Counts = { scanned: 0, converted: 0, skipped: 0, reported: 0 };
  const reports: string[] = [];

  let batch = database.batch();
  let pending = 0;

  for (const doc of snapshot.docs) {
    counts.scanned++;
    const verdict = classify(doc.data() as Record<string, unknown>);

    if (verdict.kind === 'skip') {
      counts.skipped++;
      continue;
    }
    if (verdict.kind === 'report') {
      counts.reported++;
      // Document ids only. These are resident records — never log names,
      // amounts owed, or any other PII.
      reports.push(`  ${doc.id}: ${verdict.reason}`);
      continue;
    }

    counts.converted++;
    if (!apply) continue;

    batch.update(doc.ref, {
      rentOwed: verdict.rentOwed,
      balance: admin.firestore.FieldValue.delete(),
    });
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
  console.log(`Scanned:                 ${counts.scanned}`);
  console.log(
    `${apply ? 'Converted:              ' : 'Would convert:          '} ${counts.converted}`,
  );
  console.log(`Skipped (no balance):    ${counts.skipped}`);
  console.log(`Needs a human:           ${counts.reported}`);

  if (reports.length > 0) {
    console.log('\nGuests this migration refuses to touch:');
    for (const line of reports) console.log(line);
    process.exitCode = 1;
  }

  if (!apply) {
    console.log('\nNothing was written. Re-run with --apply to commit.');
  }

  return counts;
}

export async function main(
  argv: string[] = process.argv.slice(2),
  database: FirebaseFirestore.Firestore = db,
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
