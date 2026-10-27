/**
 * Recompute week-summaries from activities for a date range.
 *
 * Before the onActivityWritten trigger, summaries were written by the mobile
 * client, and the rules let only admins write them — so every resident-logged
 * activity is missing from its summary, and a week whose summary did not exist
 * yet failed for admins too. This rebuilds every guest-week that has at least
 * one activity in the range, using the trigger's own recompute.
 *
 * Dry run is the DEFAULT — writing requires --apply.
 *
 *   # rehearse against seeded emulator data (demo-* project only)
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-regroup \
 *     npm run backfill:week-summaries:dry-run -- --from 2026-01-01 --to 2026-11-01
 *
 *   # report against production without writing (read-only)
 *   npm run backfill:week-summaries:dry-run -- --from 2026-01-01 --to 2026-11-01
 *
 *   # write (only after the dry-run report has been reviewed)
 *   npm run backfill:week-summaries:apply -- --from 2026-01-01 --to 2026-11-01
 *
 * Options: --from / --to are YYYY-MM-DD, end exclusive, widened by a day on
 * each side so a house-local week is never cut at UTC midnight; every week
 * found is recomputed whole. --house <id> limits the run to one house.
 *
 * Idempotent: the recompute writes absolute values and skips a summary that
 * already matches, so a re-run reports 0 changed. Safe to run while the
 * trigger is live — both compute the same numbers in a transaction.
 *
 * Prints ids and counts only. Activity data is PHI.
 */
import './scriptBootstrap';
import * as admin from 'firebase-admin';
import {
  ACTIVITIES,
  SummaryTarget,
  houseTimeZone,
  recomputeWeekSummary,
} from '../activities/syncWeekSummary';
import { addDays, summaryDocId, toInstant, weekStartFor } from '../activities/weekSummaryMath';

type Firestore = FirebaseFirestore.Firestore;

export interface BackfillOptions {
  from: string;
  to: string;
  houseId?: string;
  apply: boolean;
  pageSize?: number;
}

export interface Counts {
  activitiesScanned: number;
  activitiesSkipped: number;
  summaries: number;
  changed: number;
  unchanged: number;
}

const USAGE =
  'Usage: backfillWeekSummaries --from YYYY-MM-DD --to YYYY-MM-DD [--house <houseId>] [--apply]';
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseArgs(argv: string[]): BackfillOptions {
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

/** Every guest-week with at least one activity in the (widened) range. */
async function collectTargets(
  db: Firestore,
  opts: BackfillOptions,
  counts: Counts,
): Promise<Map<string, SummaryTarget>> {
  const start = new Date(`${addDays(opts.from, -1)}T00:00:00Z`);
  const end = new Date(`${addDays(opts.to, 1)}T00:00:00Z`);
  let base = db.collection(ACTIVITIES).where('timestamp', '>=', start).where('timestamp', '<', end);
  if (opts.houseId) base = base.where('houseId', '==', opts.houseId);
  base = base.orderBy('timestamp', 'desc');

  const zones = new Map<string, Promise<string>>();
  const zoneFor = (houseId: string) => {
    if (!zones.has(houseId)) zones.set(houseId, houseTimeZone(db, houseId));
    return zones.get(houseId)!;
  };

  const targets = new Map<string, SummaryTarget>();
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  const pageSize = opts.pageSize ?? 500;
  for (;;) {
    const page = await (cursor ? base.startAfter(cursor) : base).limit(pageSize).get();
    for (const doc of page.docs) {
      counts.activitiesScanned++;
      const data = doc.data();
      const at = toInstant(data.timestamp);
      if (typeof data.guestId !== 'string' || data.guestId === '' || !at) {
        counts.activitiesSkipped++;
        continue;
      }
      const houseId = typeof data.houseId === 'string' ? data.houseId : '';
      const timeZone = await zoneFor(houseId);
      const weekStart = weekStartFor(at, timeZone);
      const id = summaryDocId(data.guestId, weekStart);
      if (!targets.has(id))
        targets.set(id, { guestId: data.guestId, houseId, weekStart, timeZone });
    }
    if (page.docs.length < pageSize) break;
    cursor = page.docs[page.docs.length - 1];
  }
  return targets;
}

export async function run(db: Firestore, opts: BackfillOptions): Promise<Counts> {
  console.log(
    `Mode: ${opts.apply ? 'LIVE (writes)' : 'DRY RUN (no writes)'} — week-summaries ` +
      `${opts.from} → ${opts.to}${opts.houseId ? ` (house ${opts.houseId})` : ''}`,
  );
  const counts: Counts = {
    activitiesScanned: 0,
    activitiesSkipped: 0,
    summaries: 0,
    changed: 0,
    unchanged: 0,
  };

  const targets = await collectTargets(db, opts, counts);
  const changedIds: string[] = [];
  for (const [id, target] of targets) {
    counts.summaries++;
    const { changed } = await recomputeWeekSummary(db, target, { write: opts.apply });
    if (changed) {
      counts.changed++;
      changedIds.push(id);
    } else {
      counts.unchanged++;
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Activities scanned:        ${counts.activitiesScanned}`);
  console.log(`Skipped (no guest/time):   ${counts.activitiesSkipped}`);
  console.log(`Guest-weeks examined:      ${counts.summaries}`);
  console.log(`${(opts.apply ? 'Rewritten:' : 'Would rewrite:').padEnd(27)}${counts.changed}`);
  console.log(`Already correct:           ${counts.unchanged}`);
  if (changedIds.length > 0) {
    // Summary ids are {guestId}_{weekStart}: ids only, no names or activity data.
    console.log(`\n${opts.apply ? 'Rewritten' : 'Would rewrite'}:`);
    for (const id of changedIds) console.log(`  ${id}`);
  }
  if (!opts.apply) console.log('\nNothing was written. Re-run with --apply to commit.');
  return counts;
}

export async function main(
  argv: string[] = process.argv.slice(2),
  database: Firestore = admin.firestore(),
): Promise<void> {
  await run(database, parseArgs(argv));
}

// Guard against the module being imported by a test runner.
if (require.main === module) {
  main().catch((err) => {
    console.error('Backfill failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
