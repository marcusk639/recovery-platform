/**
 * Recompute week-summaries from activities for a date range.
 *
 * Before the onActivityWritten trigger, summaries were written by the mobile
 * client, and the rules let only admins write them — so resident-logged
 * activities are missing from their summaries. This rebuilds every guest-week
 * with at least one activity in the range, using the trigger's own recompute
 * (trusted activities only: logged by the resident or a house admin, in the
 * guest's own house).
 *
 * Dry run is the DEFAULT — writing requires --apply. Both --from and --to are
 * required: there is no default range.
 *
 *   # rehearse against seeded emulator data (demo-* project only)
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-regroup \
 *     npm run backfill:week-summaries:dry-run -- --from 2026-01-01 --to 2026-11-01
 *
 *   # report against production without writing (read-only transactions)
 *   npm run backfill:week-summaries:dry-run -- --from 2026-01-01 --to 2026-11-01
 *
 *   # write (only after the dry-run report has been reviewed)
 *   npm run backfill:week-summaries:apply -- --from 2026-01-01 --to 2026-11-01
 *
 * Decide before --apply (the dry run reports both, ids and counts only):
 *   - Suspected duplicates: the bug made residents retry saved activities.
 *     They ARE counted; this script never deletes or changes activities.
 *   - Closed weeks: rewriting a past week changes numbers people may already
 *     have seen or exported. Narrow --from to avoid them.
 *
 * Re-run after the old app versions are retired: they keep writing summaries
 * (see activities/syncWeekSummary.ts) and resident builds keep creating
 * duplicates until then. This re-run is mandatory.
 *
 * --from / --to are YYYY-MM-DD, end exclusive, widened by a day on each side so
 * a house-local week is never cut at UTC midnight; every week found is
 * recomputed whole. --house <id> limits the run to one house. Idempotent: a
 * re-run reports 0 changed.
 *
 * Prints ids and counts only. Activity data is PHI.
 */
import './scriptBootstrap';
import * as admin from 'firebase-admin';
import { ACTIVITIES, SummaryTarget, recomputeWeekSummary } from '../activities/syncWeekSummary';
import {
  GuestContext,
  HouseAdminCheck,
  claimsHouseAdminCheck,
  loadGuestContext,
} from '../activities/activityTrust';
import {
  DUPLICATE_WINDOW_MINUTES,
  findSuspectedDuplicates,
} from '../activities/duplicateActivities';
import { addDays, summaryDocId, toInstant, weekStartFor } from '../activities/weekSummaryMath';

type Firestore = FirebaseFirestore.Firestore;

export interface BackfillOptions {
  from: string;
  to: string;
  houseId?: string;
  apply: boolean;
  pageSize?: number;
  isHouseAdmin?: HouseAdminCheck;
  now?: Date;
}

export interface Counts {
  activitiesScanned: number;
  activitiesSkipped: number;
  activitiesGuestMissing: number;
  summaries: number;
  changed: number;
  changedClosedWeeks: number;
  unchanged: number;
  excludedOtherHouse: number;
  excludedUntrustedLogger: number;
  nonNumericHours: number;
  suspectedDuplicates: number;
}

const USAGE =
  'Usage: backfillWeekSummaries --from YYYY-MM-DD --to YYYY-MM-DD [--house <houseId>] [--apply]';
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseArgs(
  argv: string[],
): Pick<BackfillOptions, 'from' | 'to' | 'houseId' | 'apply'> {
  const value = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    if (i === -1) return undefined;
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) throw new Error(`${flag} needs a value. ${USAGE}`);
    return v;
  };
  const from = value('--from');
  const to = value('--to');
  const houseId = value('--house');
  if (!from || !to || !DATE.test(from) || !DATE.test(to) || Number.isNaN(Date.parse(from))) {
    throw new Error(USAGE);
  }
  if (from >= to) throw new Error(`--from must be before --to. ${USAGE}`);
  return { from, to, ...(houseId ? { houseId } : {}), apply: argv.includes('--apply') };
}

const emptyCounts = (): Counts => ({
  activitiesScanned: 0,
  activitiesSkipped: 0,
  activitiesGuestMissing: 0,
  summaries: 0,
  changed: 0,
  changedClosedWeeks: 0,
  unchanged: 0,
  excludedOtherHouse: 0,
  excludedUntrustedLogger: 0,
  nonNumericHours: 0,
  suspectedDuplicates: 0,
});

/** Every guest-week with at least one activity in the (widened) range. */
async function scan(db: Firestore, opts: BackfillOptions, counts: Counts) {
  const start = new Date(`${addDays(opts.from, -1)}T00:00:00Z`);
  const end = new Date(`${addDays(opts.to, 1)}T00:00:00Z`);
  let base = db.collection(ACTIVITIES).where('timestamp', '>=', start).where('timestamp', '<', end);
  if (opts.houseId) base = base.where('houseId', '==', opts.houseId);
  base = base.orderBy('timestamp', 'desc');

  const guests = new Map<string, Promise<GuestContext | null>>();
  const targets = new Map<string, SummaryTarget>();
  const scanned: Array<{ id: string; data: Record<string, unknown> }> = [];
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  const pageSize = opts.pageSize ?? 500;
  for (;;) {
    const page = await (cursor ? base.startAfter(cursor) : base).limit(pageSize).get();
    for (const doc of page.docs) {
      counts.activitiesScanned++;
      const data = doc.data();
      scanned.push({ id: doc.id, data });
      const at = toInstant(data.timestamp);
      if (typeof data.guestId !== 'string' || data.guestId === '' || !at) {
        counts.activitiesSkipped++;
        continue;
      }
      if (!guests.has(data.guestId)) guests.set(data.guestId, loadGuestContext(db, data.guestId));
      const guest = await guests.get(data.guestId)!;
      if (!guest) {
        counts.activitiesGuestMissing++;
        continue;
      }
      const weekStart = weekStartFor(at, guest.timeZone);
      const id = summaryDocId(data.guestId, weekStart);
      if (!targets.has(id))
        targets.set(id, { guestId: data.guestId, weekStart, timeZone: guest.timeZone });
    }
    if (page.docs.length < pageSize) break;
    cursor = page.docs[page.docs.length - 1];
  }
  return { targets, scanned };
}

const pad = (label: string) => label.padEnd(36);

export async function run(db: Firestore, opts: BackfillOptions): Promise<Counts> {
  console.log(
    `Mode: ${opts.apply ? 'LIVE (writes)' : 'DRY RUN (no writes, read-only transactions)'} — ` +
      `week-summaries ${opts.from} → ${opts.to}${opts.houseId ? ` (house ${opts.houseId})` : ''}`,
  );
  const counts = emptyCounts();
  const isHouseAdmin = opts.isHouseAdmin ?? claimsHouseAdminCheck();
  const today = (opts.now ?? new Date()).toISOString().slice(0, 10);

  const { targets, scanned } = await scan(db, opts, counts);
  const changedIds: string[] = [];
  for (const [id, target] of targets) {
    counts.summaries++;
    const r = await recomputeWeekSummary(db, target, { write: opts.apply, isHouseAdmin });
    counts.excludedOtherHouse += r.excluded.otherHouse;
    counts.excludedUntrustedLogger += r.excluded.untrustedLogger;
    counts.nonNumericHours += r.nonNumericHours;
    if (r.skipped || !r.changed) {
      counts.unchanged++;
      continue;
    }
    counts.changed++;
    if (addDays(target.weekStart, 7) <= today) counts.changedClosedWeeks++;
    changedIds.push(id);
  }
  const duplicates = findSuspectedDuplicates(scanned);
  counts.suspectedDuplicates = duplicates.length;

  console.log('\n--- Summary ---');
  console.log(`${pad('Activities scanned:')}${counts.activitiesScanned}`);
  console.log(`${pad('Skipped (no guest id / time):')}${counts.activitiesSkipped}`);
  console.log(`${pad('Skipped (guest doc missing):')}${counts.activitiesGuestMissing}`);
  console.log(`${pad('Guest-weeks examined:')}${counts.summaries}`);
  console.log(`${pad(opts.apply ? 'Rewritten:' : 'Would rewrite:')}${counts.changed}`);
  console.log(`${pad('  of which closed (past) weeks:')}${counts.changedClosedWeeks}`);
  console.log(`${pad('Already correct:')}${counts.unchanged}`);
  console.log(`${pad('Not counted: other house:')}${counts.excludedOtherHouse}`);
  console.log(`${pad('Not counted: not resident/admin:')}${counts.excludedUntrustedLogger}`);
  console.log(`${pad('Work with non-numeric hours (=0):')}${counts.nonNumericHours}`);
  console.log(
    `${pad(`Suspected duplicates (<=${DUPLICATE_WINDOW_MINUTES} min):`)}${counts.suspectedDuplicates}` +
      ' (counted; not removed)',
  );
  if (changedIds.length > 0) {
    // Summary ids are {guestId}_{weekStart}: ids only, no names or activity data.
    console.log(`\n${opts.apply ? 'Rewritten' : 'Would rewrite'}:`);
    for (const id of changedIds) console.log(`  ${id}`);
  }
  if (duplicates.length > 0) {
    console.log('\nSuspected duplicate activities (activity ids):');
    for (const d of duplicates) console.log(`  ${d.id} repeats ${d.duplicateOf}`);
  }
  if (!opts.apply) console.log('\nNothing was written. Re-run with --apply to commit.');
  return counts;
}

export async function main(
  argv: string[] = process.argv.slice(2),
  database: Firestore = admin.firestore(),
  extra: Pick<BackfillOptions, 'isHouseAdmin' | 'now'> = {},
): Promise<void> {
  await run(database, { ...parseArgs(argv), ...extra });
}

// Guard against the module being imported by a test runner.
if (require.main === module) {
  main().catch((err) => {
    console.error('Backfill failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
