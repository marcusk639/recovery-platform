/**
 * Backfill house-listings/{houseId}, the public listing of each house
 * (houses/houseListing.ts, EMU-009). onHouseListingSync keeps a listing in
 * step from the next write to its house; this writes one now for every
 * existing house, and removes listings whose house is gone or no longer
 * listed.
 *
 * Dry run is the DEFAULT — writing requires --apply.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node lib/scripts/backfillHouseListings.js
 *   node lib/scripts/backfillHouseListings.js           # report only
 *   node lib/scripts/backfillHouseListings.js --apply   # write
 *
 * Run it after the functions deploy, so the trigger covers every write from
 * then on. Re-running is safe: an unchanged listing is not rewritten.
 * It plans every house from one read, so a house written while it runs can
 * get a listing from before that write: run the dry run again afterwards,
 * and apply again if it reports any change.
 * Logs counts and house ids only.
 */
import './scriptBootstrap';
import * as admin from 'firebase-admin';
import { LISTING_SOURCE_FIELDS, planHouseListing } from '../houses/houseListing';

const BATCH_LIMIT = 400;

export interface Counts {
  houses: number;
  write: number;
  delete: number;
  unchanged: number;
  orphans: number;
}

export async function run(database: FirebaseFirestore.Firestore, apply: boolean): Promise<Counts> {
  console.log(`Mode: ${apply ? 'LIVE (writes)' : 'DRY RUN (no writes)'} — house listings`);
  const [houses, listings] = await Promise.all([
    // Only the listing's source fields. `rooms` is one of them (the listing counts
    // rooms and beds), so room maps with resident ids are read in memory; nothing
    // else about residents is, and none of it is logged.
    database
      .collection('houses')
      .select(...LISTING_SOURCE_FIELDS)
      .get(),
    database.collection('house-listings').get(),
  ]);
  const existing = new Map(listings.docs.map((d) => [d.id, d.data()]));
  const counts: Counts = { houses: 0, write: 0, delete: 0, unchanged: 0, orphans: 0 };
  const changed: string[] = [];

  let batch = database.batch();
  let pending = 0;
  const flush = async (force = false) => {
    if (!apply || pending === 0 || (!force && pending < BATCH_LIMIT)) return;
    await batch.commit();
    batch = database.batch();
    pending = 0;
  };

  for (const doc of houses.docs) {
    counts.houses++;
    const plan = planHouseListing(doc.id, doc.data(), existing.get(doc.id));
    existing.delete(doc.id);
    counts[plan.kind]++;
    if (plan.kind === 'unchanged') continue;
    changed.push(`  ${doc.id}: ${plan.kind}`);
    const ref = database.collection('house-listings').doc(doc.id);
    if (plan.kind === 'write') {
      batch.set(ref, { ...plan.listing, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    } else {
      batch.delete(ref);
    }
    pending++;
    await flush();
  }

  // Listings whose house no longer exists.
  for (const id of existing.keys()) {
    counts.orphans++;
    changed.push(`  ${id}: delete (no house)`);
    batch.delete(database.collection('house-listings').doc(id));
    pending++;
    await flush();
  }
  await flush(true);

  console.log('\n--- Summary ---');
  console.log(`Houses:            ${counts.houses}`);
  console.log(`${apply ? 'Written:          ' : 'Would write:      '} ${counts.write}`);
  console.log(
    `${apply ? 'Removed:          ' : 'Would remove:     '} ${counts.delete + counts.orphans}`,
  );
  console.log(`Unchanged:         ${counts.unchanged}`);
  if (changed.length) console.log(`\n${changed.join('\n')}`);
  if (!apply) console.log('\nNothing was written. Re-run with --apply to commit.');
  return counts;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<Counts> {
  return run(admin.firestore(), argv.includes('--apply'));
}

if (require.main === module) {
  main().then(
    () => process.exit(0),
    (err) => {
      console.error('backfillHouseListings failed:', err);
      process.exit(1);
    },
  );
}
