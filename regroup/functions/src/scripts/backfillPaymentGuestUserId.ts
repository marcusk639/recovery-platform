/**
 * Backfill `payments.guestUserId` from `guests/{guestId}.userId`.
 *
 * The payments read rule admits a resident only when resource.data.guestUserId
 * is their Firebase uid, and RentPaymentScreen's history query filters on it.
 * No writer set the field until the webhook / createPaymentIntent /
 * scheduledRentCollection / recordManualPayment change that shipped with this
 * script, so every record written before it is invisible to its resident.
 *
 * Dry run is the DEFAULT — writing requires --apply.
 *
 *   # rehearse against seeded emulator data
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node lib/scripts/backfillPaymentGuestUserId.js
 *
 *   # report against production without writing (read-only)
 *   node lib/scripts/backfillPaymentGuestUserId.js
 *
 *   # write (only after the dry-run report has been reviewed)
 *   node lib/scripts/backfillPaymentGuestUserId.js --apply
 *
 * Run it AFTER the functions deploy, so no pre-change writer is still creating
 * records without the field. Re-running is safe: a document that already has a
 * guestUserId is never touched, so the script only ever fills a missing field
 * and never overwrites one. guests.userId is immutable once set (rules), so the
 * value it copies cannot be stale.
 *
 * Logs counts and document ids only — never names, emails, amounts or uids.
 */
import './scriptBootstrap';
import * as admin from 'firebase-admin';

const BATCH_LIMIT = 400;

export type Verdict =
  | { kind: 'has-uid' }
  | { kind: 'no-guest-id' }
  | { kind: 'guest-missing' }
  | { kind: 'guest-no-user' }
  | { kind: 'set'; guestUserId: string };

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/**
 * Decide what to do with one payment document.
 *
 * @param guestUserIdFor - the guest doc's userId: `null` when the guest doc does
 *   not exist, `undefined`/'' when it exists with no linked account.
 */
export function classify(
  payment: Record<string, unknown>,
  guestUserIdFor: (guestId: string) => string | null | undefined,
): Verdict {
  if (nonEmpty(payment.guestUserId)) return { kind: 'has-uid' };
  if (!nonEmpty(payment.guestId)) return { kind: 'no-guest-id' };
  const uid = guestUserIdFor(payment.guestId);
  if (uid === null) return { kind: 'guest-missing' };
  if (!nonEmpty(uid)) return { kind: 'guest-no-user' };
  return { kind: 'set', guestUserId: uid };
}

export interface Counts {
  scanned: number;
  alreadySet: number;
  set: number;
  noGuestId: number;
  guestMissing: number;
  guestNoUser: number;
}

/** guests/{id}.userId for every id, one read per distinct guest. */
async function loadGuestUserIds(
  database: FirebaseFirestore.Firestore,
  guestIds: Iterable<string>,
): Promise<Map<string, string | null | undefined>> {
  const result = new Map<string, string | null | undefined>();
  for (const id of guestIds) {
    const snap = await database.collection('guests').doc(id).get();
    result.set(id, snap.exists ? (snap.data()?.userId as string | undefined) : null);
  }
  return result;
}

export async function run(database: FirebaseFirestore.Firestore, apply: boolean): Promise<Counts> {
  console.log(
    `Mode: ${apply ? 'LIVE (writes)' : 'DRY RUN (no writes)'} — payments.guestUserId backfill`,
  );

  const snapshot = await database.collection('payments').get();

  const needLookup = new Set<string>();
  for (const doc of snapshot.docs) {
    const data = doc.data() as Record<string, unknown>;
    if (!nonEmpty(data.guestUserId) && nonEmpty(data.guestId)) needLookup.add(data.guestId);
  }
  const guestUserIds = await loadGuestUserIds(database, needLookup);

  const counts: Counts = {
    scanned: 0,
    alreadySet: 0,
    set: 0,
    noGuestId: 0,
    guestMissing: 0,
    guestNoUser: 0,
  };
  const unresolved: string[] = [];

  let batch = database.batch();
  let pending = 0;

  for (const doc of snapshot.docs) {
    counts.scanned++;
    const verdict = classify(doc.data() as Record<string, unknown>, (id) => guestUserIds.get(id));

    switch (verdict.kind) {
      case 'has-uid':
        counts.alreadySet++;
        continue;
      case 'no-guest-id':
        counts.noGuestId++;
        unresolved.push(`  ${doc.id}: no guestId`);
        continue;
      case 'guest-missing':
        counts.guestMissing++;
        unresolved.push(`  ${doc.id}: guest doc missing`);
        continue;
      case 'guest-no-user':
        counts.guestNoUser++;
        unresolved.push(`  ${doc.id}: guest has no linked account`);
        continue;
      case 'set':
        counts.set++;
    }

    if (!apply) continue;

    batch.update(doc.ref, { guestUserId: verdict.guestUserId });
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
  console.log(`Scanned:                     ${counts.scanned}`);
  console.log(`Already had guestUserId:     ${counts.alreadySet}`);
  console.log(
    `${apply ? 'Set:                        ' : 'Would set:                  '} ${counts.set}`,
  );
  console.log(`No guestId (left alone):     ${counts.noGuestId}`);
  console.log(`Guest doc missing (left):    ${counts.guestMissing}`);
  console.log(`Guest has no account (left): ${counts.guestNoUser}`);

  if (unresolved.length > 0) {
    // Ids only. These stay invisible to residents (house admins still see them).
    console.log('\nDocuments left without guestUserId:');
    for (const line of unresolved) console.log(line);
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
    console.error('Backfill failed:', err);
    process.exit(1);
  });
}
