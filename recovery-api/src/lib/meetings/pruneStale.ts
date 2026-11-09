import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import type { DirectoryMeeting, DirectoryProvider } from '../../entities/DirectoryMeeting';
import { isInsideGrid } from './ingest';

/**
 * Stale-prune horizon. External docs not re-seen within this many days are
 * considered gone-from-source and pruned. Sized to span several full cycles
 * (cycle is ~7 days), so a doc must miss multiple sweeps before deletion.
 */
export const STALE_PRUNE_DAYS = 30;

/** Delete in pages so a large prune cannot exhaust the function's memory. */
export const PRUNE_PAGE_SIZE = 500;

/**
 * Normal turnover is a small share of a provider. Anything larger needs a person
 * to look at it, because a wrong call here deletes listings people rely on.
 */
export const MAX_PRUNE_FRACTION = 0.1;

export interface PruneDeps {
  db: FirebaseFirestore.Firestore;
  /** Injected clock for deterministic tests. Defaults to real time. */
  now?: () => Date;
}

export interface PruneResult {
  /** Number of stale external docs deleted. */
  deleted: number;
  /** Number of candidate docs scanned. */
  scanned: number;
  /** Providers left untouched because too many of their rows would have gone. */
  blocked: DirectoryProvider[];
}

/** Delete one provider's stale rows, page by page, keeping any a sweep can't re-see. */
async function deleteStaleRows(
  database: FirebaseFirestore.Firestore,
  staleQuery: () => FirebaseFirestore.Query,
): Promise<{ deleted: number; scanned: number }> {
  let deleted = 0;
  let scanned = 0;
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;

  for (;;) {
    const page = staleQuery().limit(PRUNE_PAGE_SIZE);
    const { docs } = await (cursor ? page.startAfter(cursor) : page).get();

    const batch = database.batch();
    let pageDeleted = 0;
    for (const doc of docs) {
      scanned++;
      const data = doc.data() as Partial<DirectoryMeeting> | undefined;
      // HARD GUARD: never prune an app-owned doc, even if a query ever returned one.
      if (data?.source === 'app') continue;
      if (!isInsideGrid(data?.location)) continue;

      batch.delete(doc.ref);
      pageDeleted++;
    }
    if (pageDeleted > 0) {
      await batch.commit();
      deleted += pageDeleted;
    }

    if (docs.length < PRUNE_PAGE_SIZE) return { deleted, scanned };
    cursor = docs[docs.length - 1];
  }
}

/**
 * Delete external directory docs of the given providers that have not been
 * re-seen within STALE_PRUNE_DAYS. Callers pass only providers whose source
 * answered for a full sweep (see providersSafeToPrune).
 *
 * That check can't tell a healthy source from one answering for only a few cells,
 * so a provider is skipped when more than MAX_PRUNE_FRACTION of its rows would go.
 * Queries only `source == 'external'`, so app-owned docs are never selected.
 *
 * Needs the (source, provider, lastSeenAt) composite index in
 * firestore.indexes.json.
 */
export async function pruneStale(
  deps: PruneDeps,
  providers: readonly DirectoryProvider[],
): Promise<PruneResult> {
  const { db: database } = deps;
  const now = deps.now ? deps.now() : new Date();
  const cutoffMs = now.getTime() - STALE_PRUNE_DAYS * 24 * 60 * 60 * 1000;
  const cutoff = Timestamp.fromMillis(cutoffMs);

  const result: PruneResult = { deleted: 0, scanned: 0, blocked: [] };

  for (const provider of providers) {
    const rowsQuery = () =>
      database
        .collection('directoryMeetings')
        .where('source', '==', 'external')
        .where('provider', '==', provider);
    const staleQuery = () => rowsQuery().where('lastSeenAt', '<', cutoff);

    const stale = (await staleQuery().count().get()).data().count;
    if (stale === 0) continue;
    const total = (await rowsQuery().count().get()).data().count;

    if (stale / total > MAX_PRUNE_FRACTION) {
      logger.error('refreshDirectory: prune blocked', { provider, stale, total });
      result.blocked.push(provider);
      continue;
    }

    const { deleted, scanned } = await deleteStaleRows(database, staleQuery);
    result.deleted += deleted;
    result.scanned += scanned;
  }

  return result;
}
