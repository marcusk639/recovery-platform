/**
 * Backfill for the dispute owner rule and REOPEN, on activities written
 * before the onActivityWritten trigger did both:
 *
 *   1. residentUid: stamps each activity that has none, or a null one while
 *      the guest now has an account, with its guest's account
 *      (guests.userId, null for a guest with no app account). The rules use
 *      it to keep residents from disputing, resolving or reopening their own
 *      activity; until it is stamped they fall back to the live guest doc,
 *      which a resident or a peer-leader admin can edit or delete. An
 *      activity whose guest doc is gone is left unstamped (reported): the
 *      rules then refuse it to everyone but the house owner.
 *   2. The decision log: records decided_{disputeResolvedAt ms} in
 *      activities/{id}/dispute-decisions for each decided dispute (resolved,
 *      or an old build's "delete") that has none. The rules let an admin undo
 *      a decision (REOPEN) only once it is logged. A decision with no
 *      disputeResolvedAt cannot be logged or reopened (reported).
 *   3. The live dispute list: seeds house-disputes/{houseId} with each open
 *      dispute (the app reads that list; older entries are only in the
 *      legacy houses/{id}.disputes mirror).
 *
 * Dry run is the DEFAULT — writing requires --apply.
 *
 *   # rehearse against seeded emulator data (demo-* project only)
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-regroup \
 *     npm run backfill:dispute-identity:dry-run
 *
 *   # report against production without writing
 *   npm run backfill:dispute-identity:dry-run
 *
 *   # write (only after the dry-run report has been reviewed)
 *   npm run backfill:dispute-identity:apply
 *
 * --house <id> limits the run to one house. Idempotent: a re-run stamps and
 * logs nothing more. A stamp is not a week-summary input, so stamping
 * triggers no summary recompute. Each stamp is a transaction that re-reads the activity,
 * so a live write is never overwritten. Prints ids and counts only.
 */
import './scriptBootstrap';
import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { fillStamp, residentUidFrom } from '../activities/residentStamp';
import { DECISIONS, disputeStamp, millisOf, outcomeOf } from '../activities/disputeDecisions';
import { mirrorHouseDispute } from '../activities/houseDisputeMirror';

type Firestore = FirebaseFirestore.Firestore;
type Data = Record<string, unknown>;

export interface Options {
  apply: boolean;
  houseId?: string;
  pageSize?: number;
}

export interface Counts {
  scanned: number;
  stamped: number;
  alreadyStamped: number;
  guestMissing: number;
  decisionsLogged: number;
  decisionsPresent: number;
  decisionsUndated: number;
  openDisputes: number;
}

const USAGE = 'Usage: backfillDisputeIdentity [--house <houseId>] [--apply]';
const ALREADY_EXISTS = 6;

export function parseArgs(argv: string[]): Options {
  const known = new Set(['--house', '--apply']);
  argv.forEach((a, i) => {
    if (a.startsWith('--') && !known.has(a)) throw new Error(`Unknown flag ${a}. ${USAGE}`);
    if (!a.startsWith('--') && argv[i - 1] !== '--house')
      throw new Error(`Unexpected ${a}. ${USAGE}`);
  });
  const i = argv.indexOf('--house');
  const houseId = i === -1 ? undefined : argv[i + 1];
  if (i !== -1 && (!houseId || houseId.startsWith('--')))
    throw new Error(`--house needs a value. ${USAGE}`);
  return { apply: argv.includes('--apply'), ...(houseId ? { houseId } : {}) };
}

const has = (d: Data, k: string) => Object.prototype.hasOwnProperty.call(d, k);

/** An old build's "delete" resolution: deleted, resolved at loggedAt. */
export function isLegacyUpheld(a: Data): boolean {
  const at = millisOf(a.disputeResolvedAt);
  return (
    a.status === 'deleted' &&
    at !== null &&
    at === millisOf(a.loggedAt) &&
    a.disputed == null &&
    a.incomplete !== true
  );
}

async function stamp(
  db: Firestore,
  id: string,
  data: Data,
  guests: Map<string, Data | null>,
  opts: Options,
  counts: Counts,
  changed: string[],
) {
  // A null stamp is no stamp: re-stamp it once the guest has an account.
  const stamped = () => has(data, 'residentUid') && data.residentUid !== null;
  if (stamped()) {
    counts.alreadyStamped++;
    return;
  }
  const guestId = typeof data.guestId === 'string' ? data.guestId : '';
  if (!guests.has(guestId)) {
    const snap = guestId ? await db.collection('guests').doc(guestId).get() : undefined;
    guests.set(guestId, snap?.exists ? ((snap.data() ?? {}) as Data) : null);
  }
  const guest = guests.get(guestId);
  if (!guest) {
    counts.guestMissing++;
    return;
  }
  const residentUid = residentUidFrom(guest);
  if (has(data, 'residentUid') && residentUid === null) {
    counts.alreadyStamped++;
    return;
  }
  if (opts.apply) {
    const ref = db.collection('activities').doc(id);
    const wrote = await db.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      const now = current.exists ? (current.data() as Data) : undefined;
      if (
        !now ||
        (has(now, 'residentUid') && now.residentUid !== null) ||
        now.guestId !== guestId
      ) {
        return false;
      }
      tx.update(ref, residentUid ? fillStamp(residentUid) : { residentUid });
      return true;
    });
    if (!wrote) return;
  }
  counts.stamped++;
  changed.push(id);
}

async function logDecision(db: Firestore, id: string, data: Data, opts: Options, counts: Counts) {
  if (data.status !== 'resolved' && !isLegacyUpheld(data)) return;
  const at = millisOf(data.disputeResolvedAt);
  if (at === null) {
    counts.decisionsUndated++;
    return;
  }
  const ref = db.collection('activities').doc(id).collection(DECISIONS).doc(`decided_${at}`);
  if ((await ref.get()).exists) {
    counts.decisionsPresent++;
    return;
  }
  if (opts.apply) {
    try {
      await ref.create({
        event: outcomeOf(data),
        by: typeof data.disputeResolvedBy === 'string' ? data.disputeResolvedBy : null,
        at: Timestamp.fromMillis(at),
        previousOutcome: null,
        disputeStamp: disputeStamp(data),
        disputedBy: typeof data.disputedBy === 'string' ? data.disputedBy : null,
        activityId: id,
        houseId: typeof data.houseId === 'string' ? data.houseId : null,
        backfilled: true,
      });
    } catch (err) {
      if ((err as { code?: unknown })?.code !== ALREADY_EXISTS) throw err;
      counts.decisionsPresent++;
      return;
    }
  }
  counts.decisionsLogged++;
}

export async function run(db: Firestore, opts: Options): Promise<Counts> {
  console.log(
    `Mode: ${opts.apply ? 'LIVE (writes)' : 'DRY RUN (no writes)'} — residentUid and dispute decisions` +
      `${opts.houseId ? ` (house ${opts.houseId})` : ''}`,
  );
  const counts: Counts = {
    scanned: 0,
    stamped: 0,
    alreadyStamped: 0,
    guestMissing: 0,
    decisionsLogged: 0,
    decisionsPresent: 0,
    decisionsUndated: 0,
    openDisputes: 0,
  };
  const guests = new Map<string, Data | null>();
  const changed: string[] = [];
  let base: FirebaseFirestore.Query = db.collection('activities');
  if (opts.houseId) base = base.where('houseId', '==', opts.houseId);
  base = base.orderBy('__name__');
  let last: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    const page = await (last ? base.startAfter(last) : base).limit(opts.pageSize ?? 300).get();
    for (const doc of page.docs) {
      counts.scanned++;
      const data = doc.data() as Data;
      await stamp(db, doc.id, data, guests, opts, counts, changed);
      await logDecision(db, doc.id, data, opts, counts);
      if (data.status === 'disputed') {
        // Seeds the live list (house-disputes/{houseId}) with disputes opened
        // before it existed; the mirror reconciles from current state.
        counts.openDisputes++;
        if (opts.apply) await mirrorHouseDispute(db, doc.id, { ...data, status: 'active' }, data);
      }
    }
    if (page.docs.length < (opts.pageSize ?? 300)) break;
    last = page.docs[page.docs.length - 1];
  }
  console.log(
    `${opts.apply ? 'Stamped' : 'Would stamp'} residentUid on: ${changed.join(', ') || '(none)'}`,
  );
  console.log(JSON.stringify(counts));
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
