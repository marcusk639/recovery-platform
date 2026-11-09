import { FieldValue } from 'firebase-admin/firestore';
import type { DirectoryMeeting } from '../../entities/DirectoryMeeting';
import { BATCH_SIZE } from './ingest';
import type { SweepResult } from './meetingSweep';
import { pruneStale, STALE_PRUNE_DAYS, type PruneResult } from './pruneStale';
import { mapMeetingGuideMeeting, type MeetingGuideMeeting } from './sources/meetingGuide';
import { providersSafeToPrune } from './sweepHealth';

/**
 * Writes one Meeting Guide sweep into `directoryMeetings`. It compares against the
 * whole directory at once, which a per-cell upsert can't do, so it can:
 *  - write only what changed, rather than rewriting a row once per overlapping cell;
 *  - replace a row when its name, day, time or address changes. Those are hashed into
 *    the document id, so an edited meeting gets a new id, and the old document would
 *    otherwise live on as a duplicate until pruned.
 */

/** Well inside the prune horizon, so a late or skipped run can't cost a live meeting. */
export const RESTAMP_AFTER_DAYS = 14;

const TIMESTAMP_FIELDS = new Set(['createdAt', 'updatedAt', 'lastSeenAt', 'lastRefreshedAt']);
const DIRECTORY = 'directoryMeetings';

export interface ReconcileDeps {
  db: FirebaseFirestore.Firestore;
  now: () => Date;
  /** False reports what would happen and writes nothing. */
  apply: boolean;
}

export interface ReconcileResult {
  created: number;
  updated: number;
  /** Old documents removed because their meeting now lives under a new id. */
  replaced: number;
  restamped: number;
  unchanged: number;
  /** Upstream listings that are the same meeting as another listing. */
  collapsedDuplicates: number;
  unmappable: number;
  skippedAppOwned: number;
}

type Doc = FirebaseFirestore.QueryDocumentSnapshot;

async function readAll(query: () => FirebaseFirestore.Query): Promise<Doc[]> {
  const docs: Doc[] = [];
  let last: Doc | undefined;
  for (;;) {
    const page = query().limit(BATCH_SIZE);
    const snap = await (last ? page.startAfter(last) : page).get();
    docs.push(...snap.docs);
    if (snap.docs.length < BATCH_SIZE) return docs;
    last = snap.docs[snap.docs.length - 1];
  }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((out, key) => {
        out[key] = canonical((value as Record<string, unknown>)[key]);
        return out;
      }, {});
  }
  return value;
}

function contentOf(data: Record<string, unknown>): string {
  const content = Object.fromEntries(
    Object.entries(data).filter(
      ([key, value]) => !TIMESTAMP_FIELDS.has(key) && value !== undefined,
    ),
  );
  return JSON.stringify(canonical(content));
}

function payloadOf(meeting: DirectoryMeeting): Record<string, unknown> {
  const { id: _id, ...rest } = meeting;
  // A live source just confirmed this row, so it is no longer a frozen snapshot.
  return { ...rest, source: 'external', dataAsOf: null };
}

export async function reconcileMeetings(
  rows: readonly MeetingGuideMeeting[],
  deps: ReconcileDeps,
): Promise<ReconcileResult> {
  const { db, apply } = deps;
  const collection = db.collection(DIRECTORY);
  const result: ReconcileResult = {
    created: 0,
    updated: 0,
    replaced: 0,
    restamped: 0,
    unchanged: 0,
    collapsedDuplicates: 0,
    unmappable: 0,
    skippedAppOwned: 0,
  };

  // Lowest upstream id wins a collapse, so the choice doesn't flip with response order.
  const desired = new Map<string, DirectoryMeeting>();
  const docIdByUpstream = new Map<string, string>();
  for (const row of [...rows].sort((a, b) => a.id - b.id)) {
    const meeting = mapMeetingGuideMeeting(row);
    if (!meeting) {
      result.unmappable++;
      continue;
    }
    docIdByUpstream.set(String(row.id), meeting.id);
    if (desired.has(meeting.id)) result.collapsedDuplicates++;
    else desired.set(meeting.id, meeting);
  }

  const external = await readAll(() =>
    db.collection(DIRECTORY).where('source', '==', 'external').where('provider', '==', 'AA'),
  );
  const appOwned = new Set(
    (await readAll(() => db.collection(DIRECTORY).where('source', '==', 'app'))).map((d) => d.id),
  );
  const existingById = new Map(external.map((doc) => [doc.id, doc]));

  // Anything superseded hands its createdAt to the document that replaces it.
  const superseded: Doc[] = [];
  const inheritedCreatedAt = new Map<string, unknown>();
  for (const doc of external) {
    const data = doc.data();
    const target = docIdByUpstream.get(String(data.externalId));
    if (!target || target === doc.id || desired.has(doc.id)) continue;
    superseded.push(doc);
    if (data.createdAt && !inheritedCreatedAt.has(target)) {
      inheritedCreatedAt.set(target, data.createdAt);
    }
  }

  let batch = db.batch();
  let ops = 0;
  async function flushIfFull(): Promise<void> {
    if (++ops < BATCH_SIZE) return;
    await batch.commit();
    batch = db.batch();
    ops = 0;
  }

  const restampBefore = deps.now().getTime() - RESTAMP_AFTER_DAYS * 86_400_000;
  const stamp = FieldValue.serverTimestamp();

  for (const [id, meeting] of desired) {
    if (appOwned.has(id)) {
      result.skippedAppOwned++;
      continue;
    }
    const payload = payloadOf(meeting);
    const current = existingById.get(id)?.data();

    if (current && contentOf(current) === contentOf(payload)) {
      const seenAt = (current.lastSeenAt as { toMillis?: () => number } | undefined)?.toMillis?.();
      if (seenAt !== undefined && seenAt >= restampBefore) {
        result.unchanged++;
        continue;
      }
      result.restamped++;
      if (apply) {
        batch.set(
          collection.doc(id),
          { lastSeenAt: stamp, lastRefreshedAt: stamp },
          { merge: true },
        );
        await flushIfFull();
      }
      continue;
    }

    if (current) result.updated++;
    else result.created++;
    if (apply) {
      // A full replace, not a merge, so a field the source dropped doesn't linger.
      batch.set(collection.doc(id), {
        ...payload,
        createdAt: current?.createdAt ?? inheritedCreatedAt.get(id) ?? stamp,
        updatedAt: stamp,
        lastSeenAt: stamp,
        lastRefreshedAt: stamp,
      });
      await flushIfFull();
    }
  }

  // Deletes run last: a failed run can leave a duplicate, but never lose a meeting.
  for (const doc of superseded) {
    result.replaced++;
    if (apply) {
      batch.delete(doc.ref);
      await flushIfFull();
    }
  }

  if (apply && ops > 0) await batch.commit();
  return result;
}

export interface MeetingSyncDeps extends ReconcileDeps {
  sweep: () => Promise<SweepResult>;
}

export interface MeetingSyncResult {
  sweep: Omit<SweepResult, 'meetings'> & { meetings: number };
  reconcile: ReconcileResult;
  /** Set when this run pruned. Absent means the sweep wasn't healthy enough, or a dry run. */
  prune?: PruneResult;
  staleAfterDays: number;
}

export async function runMeetingSync(deps: MeetingSyncDeps): Promise<MeetingSyncResult> {
  const sweepStartedAt = deps.now().getTime();
  const sweep = await deps.sweep();
  if (sweep.aborted === 'unauthorized') {
    throw new Error('Meeting Guide rejected the API key; the directory was not changed');
  }

  if (sweep.aborted === 'budget') {
    throw new Error(
      `Sweep hit its request budget after ${sweep.requests} requests; the directory was not changed`,
    );
  }

  const reconcile = await reconcileMeetings(sweep.meetings, deps);
  const tally = {
    AA: {
      attempted: sweep.baseCells,
      failed: sweep.failedBaseCells,
      records: sweep.meetings.length,
    },
  };
  const safe = providersSafeToPrune(tally, sweep.baseCells).includes('AA');

  const { meetings, ...summary } = sweep;
  return {
    sweep: { ...summary, meetings: meetings.length },
    reconcile,
    prune: deps.apply && safe ? await pruneStale(deps, ['AA'], sweepStartedAt) : undefined,
    staleAfterDays: STALE_PRUNE_DAYS,
  };
}
