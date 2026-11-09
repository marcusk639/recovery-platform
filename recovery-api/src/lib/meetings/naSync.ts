import { FieldValue } from 'firebase-admin/firestore';
import type { DirectoryMeeting } from '../../entities/DirectoryMeeting';
import {
  parseImportTime,
  sweepBmlt,
  type NaSweepDeps,
  type RegionProblem,
  type RegionSweep,
} from './naSweep';
import { chooseDeletes, type NaReconcileResult } from './naDeletes';
import { isServiceMeeting, mapBmltMeeting, type BmltRegion } from './sources/bmlt';

export type { NaReconcileResult } from './naDeletes';

/**
 * Brings the NA rows in `directoryMeetings` in line with a BMLT sweep. This runs
 * only from the hand-run `npm run sync:na`, so it must not import firebase-functions.
 *
 * It compares against every existing NA row at once, so it can write only what
 * changed and can tell a meeting that is gone from one that a region failed to
 * report. Deletes run last: a run that dies partway can leave a duplicate but can't
 * lose a meeting, and repeating it picks up where it stopped.
 */

/** Firestore's limit for one batch. */
const BATCH_SIZE = 500;
const DIRECTORY = 'directoryMeetings';
const REFRESH_STATE = 'refreshState';
export const NA_SYNC_STATE_DOC_ID = 'naSync';

const VOLATILE_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'lastSeenAt',
  'lastRefreshedAt',
  'dataAsOf',
]);

export interface NaReconcileDeps {
  db: FirebaseFirestore.Firestore;
  /** False reports what would happen and writes nothing. */
  apply: boolean;
  now: () => Date;
  /** Region `sourceId`s a person has cleared for deletes above the cap. */
  allowDeletes?: readonly string[];
}

type Doc = FirebaseFirestore.QueryDocumentSnapshot;
type Row = Record<string, unknown>;

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
    const source = value as Row;
    return Object.keys(source)
      .sort()
      .reduce<Row>((out, key) => {
        out[key] = canonical(source[key]);
        return out;
      }, {});
  }
  return value;
}

function contentOf(data: Row): string {
  return JSON.stringify(
    canonical(
      Object.fromEntries(Object.entries(data).filter(([key]) => !VOLATILE_FIELDS.has(key))),
    ),
  );
}

function confirmedOn(region: BmltRegion, now: Date): string {
  return (parseImportTime(region.lastSuccessfulImport) ?? now).toISOString().slice(0, 10);
}

interface Wanted {
  meeting: DirectoryMeeting;
  dataAsOf: string;
}

function collectWanted(
  sweeps: readonly RegionSweep[],
  now: Date,
  result: NaReconcileResult,
): Map<string, Wanted> {
  const wanted = new Map<string, Wanted>();
  const ordered = [...sweeps].sort((a, b) => a.region.sourceId - b.region.sourceId);
  for (const { region, rows } of ordered) {
    const sorted = [...rows].sort((a, b) => Number(a.source_id) - Number(b.source_id));
    for (const row of sorted) {
      if (isServiceMeeting(row)) {
        result.excludedService++;
        continue;
      }
      const meeting = mapBmltMeeting(row, region);
      if (!meeting) {
        result.unmappable++;
      } else if (wanted.has(meeting.id)) {
        result.collapsedDuplicates++;
      } else {
        wanted.set(meeting.id, { meeting, dataAsOf: confirmedOn(region, now) });
      }
    }
  }
  return wanted;
}

/** Commits in batches. In a dry run it does nothing. */
function makeWriter(db: FirebaseFirestore.Firestore, apply: boolean) {
  let batch = db.batch();
  let ops = 0;
  const step = async (add: (b: FirebaseFirestore.WriteBatch) => void): Promise<void> => {
    if (!apply) return;
    add(batch);
    if (++ops >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  };
  const flush = async (): Promise<void> => {
    if (apply && ops > 0) await batch.commit();
  };
  return { step, flush };
}

export async function reconcileNaMeetings(
  sweeps: readonly RegionSweep[],
  deps: NaReconcileDeps,
): Promise<NaReconcileResult> {
  const { db, apply } = deps;
  const result: NaReconcileResult = {
    created: 0,
    updated: 0,
    redated: 0,
    deleted: 0,
    unchanged: 0,
    unmappable: 0,
    excludedService: 0,
    collapsedDuplicates: 0,
    skippedAppOwned: 0,
    keptUnhealthy: 0,
    legacyRows: 0,
    blockedRegions: [],
  };

  const wanted = collectWanted(sweeps, deps.now(), result);
  const existing = await readAll(() =>
    db.collection(DIRECTORY).where('source', '==', 'external').where('provider', '==', 'NA'),
  );
  const appOwned = new Set(
    (await readAll(() => db.collection(DIRECTORY).where('source', '==', 'app'))).map((d) => d.id),
  );
  const existingById = new Map(existing.map((doc) => [doc.id, doc]));

  const collection = db.collection(DIRECTORY);
  const writer = makeWriter(db, apply);
  const stamp = FieldValue.serverTimestamp();

  for (const [id, { meeting, dataAsOf }] of wanted) {
    if (appOwned.has(id)) {
      result.skippedAppOwned++;
      continue;
    }
    const { id: _id, ...payload } = meeting;
    const ref = collection.doc(id);
    const current = existingById.get(id)?.data();

    if (current && contentOf(current) === contentOf(payload)) {
      if (current.dataAsOf === dataAsOf) {
        result.unchanged++;
        continue;
      }
      result.redated++;
      await writer.step((b) =>
        b.set(ref, { dataAsOf, lastSeenAt: stamp, lastRefreshedAt: stamp }, { merge: true }),
      );
      continue;
    }

    if (current) result.updated++;
    else result.created++;
    // A full replace, not a merge, so a field the source dropped doesn't linger.
    await writer.step((b) =>
      b.set(ref, {
        ...payload,
        dataAsOf,
        createdAt: current?.createdAt ?? stamp,
        updatedAt: stamp,
        lastSeenAt: stamp,
        lastRefreshedAt: stamp,
      }),
    );
  }

  const deletes = chooseDeletes(existing, wanted, sweeps, deps.allowDeletes ?? [], result);
  for (const doc of deletes) {
    result.deleted++;
    await writer.step((b) => b.delete(doc.ref));
  }

  await writer.flush();
  return result;
}

export interface NaSyncSummary {
  regions: number;
  unhealthy: Array<{ sourceId: number; problem: RegionProblem }>;
  result: NaReconcileResult;
}

export async function runNaSync(deps: NaReconcileDeps & NaSweepDeps): Promise<NaSyncSummary> {
  const sweeps = await sweepBmlt(deps);
  if (sweeps.every((sweep) => sweep.rows.length === 0)) {
    throw new Error('BMLT returned no meetings for any region; the directory was not changed');
  }

  const result = await reconcileNaMeetings(sweeps, deps);
  const unhealthy = sweeps.flatMap(({ region, problem }) =>
    problem ? [{ sourceId: region.sourceId, problem }] : [],
  );
  const summary = { regions: sweeps.length, unhealthy, result };

  // Nothing runs this on a schedule, so this is how anyone can tell how old the data is.
  if (deps.apply) {
    await deps.db
      .collection(REFRESH_STATE)
      .doc(NA_SYNC_STATE_DOC_ID)
      .set({
        lastRunAt: deps.now().toISOString(),
        scope: deps.onlyRegion ?? 'all',
        ...summary,
      });
  }
  return summary;
}

/** The undo: removes every NA row this sync created, and nothing else. */
export async function purgeNaMeetings(deps: NaReconcileDeps): Promise<{ deleted: number }> {
  const { db, apply } = deps;
  const existing = await readAll(() =>
    db.collection(DIRECTORY).where('source', '==', 'external').where('provider', '==', 'NA'),
  );
  const writer = makeWriter(db, apply);
  let deleted = 0;
  for (const doc of existing) {
    if (!(doc.data() as Partial<DirectoryMeeting>).sourceRegion) continue;
    deleted++;
    await writer.step((b) => b.delete(doc.ref));
  }
  await writer.flush();
  return { deleted };
}
