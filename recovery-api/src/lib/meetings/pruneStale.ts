import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import type { DirectoryMeeting, DirectoryProvider } from '../../entities/DirectoryMeeting';
import { isInsideGrid } from './ingest';
import type { PrunableProvider } from './sweepHealth';

/**
 * Stale-prune horizon. External docs not re-seen within this many days are candidates
 * for deletion. Sweeps run by hand can be further apart than this, so it doesn't by
 * itself mean a doc was missed more than once: see runMeetingSync for that guard.
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

export type CanJudgeRow = (location?: { lat?: number; lng?: number }) => boolean;

/** Delete one provider's stale rows, page by page, keeping any a sweep can't re-see. */
async function deleteStaleRows(
  database: FirebaseFirestore.Firestore,
  staleQuery: () => FirebaseFirestore.Query,
  canJudge: CanJudgeRow,
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
      if (!canJudge(data?.location)) continue;

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
 * `latestCutoffMs` also bounds the cutoff. A slow sweep can outlast STALE_PRUNE_DAYS, so
 * callers pass at most its start: a row it saw was seen after it began, however long ago.
 * `canJudge` says whether a row's absence from the sweep means anything at all.
 *
 * Needs the (source, provider, lastSeenAt) composite index in
 * firestore.indexes.json.
 */
export async function pruneStale(
  deps: PruneDeps,
  providers: readonly PrunableProvider[],
  latestCutoffMs: number,
  canJudge: CanJudgeRow = isInsideGrid,
): Promise<PruneResult> {
  const { db: database } = deps;
  const now = deps.now ? deps.now() : new Date();
  const horizonMs = now.getTime() - STALE_PRUNE_DAYS * 24 * 60 * 60 * 1000;
  const cutoff = Timestamp.fromMillis(Math.min(horizonMs, latestCutoffMs));

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

    const { deleted, scanned } = await deleteStaleRows(database, staleQuery, canJudge);
    result.deleted += deleted;
    result.scanned += scanned;
  }

  return result;
}
