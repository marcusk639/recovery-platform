/**
 * Offline Activity Queue
 *
 * Queues activities that fail to write to Firestore because the network is
 * unavailable, so they can be replayed later by flush(). Nothing here watches
 * connectivity: callers (useOfflineSync) flush when it returns.
 *
 * Storage strategy:
 *   - AsyncStorage is the single source of truth, so queued activities survive
 *     an app restart.
 *   - Every change is read-modify-write under one lock. A failed read aborts the
 *     write (rejects) so a read error can never overwrite the persisted queue;
 *     a failed write rejects too (after being reported). enqueue() therefore
 *     rejects when the item could not be persisted and the caller knows it was
 *     NOT queued.
 *   - An in-memory copy of the last successfully read or written queue exists
 *     only so getPending() (the read-only badge count) can answer when a read
 *     fails. It is never written back.
 *
 * Ownership: every item carries ownerUid, the signed-in user who queued it.
 * flush, clearUser and getPending only touch that user's items.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityType, ActivityData } from '../entities/ActivityModel';
import { logException } from '../util/logging';
import { deserialize, serialize } from './offlineQueueCodec';
import { isNetworkError } from './networkError';

export { isNetworkError };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QueuedActivity {
  /** Local temporary ID for deduplication and removal; reused as the Firestore doc id on replay. */
  id: string;
  guestId: string;
  houseId: string;
  type: ActivityType;
  data: ActivityData;
  loggedBy: string;
  /** Signed-in user that queued the item; the only user it may be replayed or cleared for. */
  ownerUid: string;
  timestamp: Date;
  /** Date.now() when the item was enqueued — used for ordering. */
  queuedAt: number;
  /** How many non-network sync failures so far. */
  retryCount: number;
}

/** Outcome of one flush. */
export type FlushResult = {
  /** Items written to Firestore and removed from the queue. */
  synced: number;
  /** Items that failed and stay queued for a later flush. */
  retrying: number;
  /** Items dropped for good after MAX_RETRY_COUNT failed attempts. */
  dropped: number;
};

/** Maximum failed attempts before an item is treated as a dead letter. */
const MAX_RETRY_COUNT = 3;

const STORAGE_KEY = '@rats_offline_activity_queue';

function generateId(): string {
  return `offline_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

const EMPTY_RESULT = (): FlushResult => ({ synced: 0, retrying: 0, dropped: 0 });

// ---------------------------------------------------------------------------
// Queue class
// ---------------------------------------------------------------------------

class ActivityOfflineQueue {
  /** Last queue seen in storage; only a fallback for the read-only getPending(). */
  private memoryQueue: QueuedActivity[] = [];

  private corruptionReported = false;

  /**
   * Tail of the promise chain that serialises load-modify-save sections.
   * Offline Firestore writes can hang, so never hold this across a logFn await.
   */
  private lockTail: Promise<unknown> = Promise.resolve();

  /** Per-user counter bumped by clearUser; lets an in-flight flush notice a clear. */
  private clearGeneration = new Map<string, number>();

  /** Running flush per user, so concurrent callers share it instead of replaying twice. */
  private inFlight = new Map<string, { generation: number; promise: Promise<FlushResult> }>();

  /** Run fn after every earlier locked section has finished. */
  private withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lockTail.then(fn, fn);
    this.lockTail = run.catch(() => undefined);
    return run;
  }

  private generationOf(userId: string): number {
    return this.clearGeneration.get(userId) ?? 0;
  }

  /** Read the persisted queue. Rejects if storage cannot be read. */
  private async load(): Promise<QueuedActivity[]> {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      this.memoryQueue = [];
      return [];
    }
    const parsed = deserialize(raw, () => {
      if (this.corruptionReported) {
        return;
      }
      this.corruptionReported = true;
      logException(new Error('Offline queue payload unreadable'), 'offline queue deserialize');
    });
    this.memoryQueue = parsed;
    return [...parsed];
  }

  /** Persist the queue. Reports and rejects if the write fails. */
  private async save(queue: QueuedActivity[]): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, serialize(queue));
    } catch (err) {
      logException(err, 'Offline queue write failed');
      throw err;
    }
    this.memoryQueue = [...queue];
  }

  /**
   * Add an activity to the queue and persist.
   * Rejects if it could not be persisted (the item is then NOT queued).
   * @returns The local ID assigned to the queued item.
   */
  async enqueue(activity: Omit<QueuedActivity, 'id' | 'queuedAt' | 'retryCount'>): Promise<string> {
    const id = generateId();
    const item: QueuedActivity = {
      ...activity,
      id,
      queuedAt: Date.now(),
      retryCount: 0,
    };
    await this.withLock(async () => {
      const queue = await this.load();
      queue.push(item);
      await this.save(queue);
    });
    return id;
  }

  /** Remove an item from the queue. */
  async remove(id: string): Promise<void> {
    await this.withLock(async () => {
      const queue = await this.load();
      await this.save(queue.filter((item) => item.id !== id));
    });
  }

  /**
   * The user's pending items, oldest first. Read-only: if storage cannot be
   * read it reports that and answers from the last queue seen.
   */
  async getPending(userId: string): Promise<QueuedActivity[]> {
    let queue: QueuedActivity[];
    try {
      queue = await this.load();
    } catch (err) {
      logException(err, 'Offline queue read failed; using last known queue');
      queue = [...this.memoryQueue];
    }
    return queue.filter((i) => i.ownerUid === userId).sort((a, b) => a.queuedAt - b.queuedAt);
  }

  /**
   * How many items userId has queued (e.g. to warn before sign-out discards
   * them). Read-only, with the same fallback as getPending().
   */
  async pendingCountFor(userId: string): Promise<number> {
    return (await this.getPending(userId)).length;
  }

  /**
   * Remove every item owned by userId (sign-out / account deletion). Queued
   * items can hold residents' medication data, so they must not outlive the
   * session on a shared device. This clears this queue only; Firestore's own
   * on-device cache of pending writes is not touched.
   *
   * If the write fails and nothing else is queued, the storage key is removed
   * instead; otherwise this rejects so the caller can report it.
   */
  async clearUser(userId: string): Promise<void> {
    // Bump synchronously so an in-flight flush stops before its next item, even
    // while this call is still waiting for the lock.
    this.clearGeneration.set(userId, this.generationOf(userId) + 1);
    await this.withLock(async () => {
      const remaining = (await this.load()).filter((item) => item.ownerUid !== userId);
      try {
        await this.save(remaining);
      } catch (writeErr) {
        if (remaining.length > 0) {
          throw writeErr;
        }
        await AsyncStorage.removeItem(STORAGE_KEY).catch((removeErr) => {
          logException(removeErr, 'Offline queue key removal failed');
          throw writeErr;
        });
        this.memoryQueue = [];
      }
    });
  }

  /**
   * Last resort for a sign-out whose clearUser hung or failed: drop the whole
   * persisted queue (every user's) without waiting for the lock. Rejects if
   * storage refuses.
   */
  async emergencyWipe(): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_KEY);
    this.memoryQueue = [];
  }

  /**
   * Replay the given user's pending items using logFn. Other users' items are
   * neither replayed nor modified. Only one flush per user runs at a time: a
   * call made while one is running returns that flush's result (its logFn is
   * not used).
   *
   * - Synced items are removed from the queue.
   * - A network error keeps the item and does not spend retry budget.
   * - Any other error increments retryCount; at MAX_RETRY_COUNT the item is
   *   dropped as a dead letter and reported (id and type only).
   *
   * Rejects, without replaying anything, if the queue cannot be read, and
   * rejects (after replaying) if the final write fails.
   */
  flush(logFn: (activity: QueuedActivity) => Promise<void>, userId: string): Promise<FlushResult> {
    const generation = this.generationOf(userId);
    const running = this.inFlight.get(userId);
    if (running && running.generation === generation) {
      return running.promise;
    }
    const entry = { generation, promise: this.runFlush(logFn, userId, generation) };
    this.inFlight.set(userId, entry);
    const clear = () => {
      if (this.inFlight.get(userId) === entry) {
        this.inFlight.delete(userId);
      }
    };
    entry.promise.then(clear, clear);
    return entry.promise;
  }

  private async runFlush(
    logFn: (activity: QueuedActivity) => Promise<void>,
    userId: string,
    generation: number,
  ): Promise<FlushResult> {
    const pending = (await this.load())
      .filter((i) => i.ownerUid === userId)
      .sort((a, b) => a.queuedAt - b.queuedAt);
    if (this.generationOf(userId) !== generation || pending.length === 0) {
      return EMPTY_RESULT();
    }

    const result = EMPTY_RESULT();
    // Delta against the queue as it is when we finish, not the snapshot we started with.
    const doneIds = new Set<string>(); // synced or dead-lettered
    const retryCounts = new Map<string, number>();

    for (const item of pending) {
      // clearUser ran (sign-out): stop, so nothing is replayed under another account.
      if (this.generationOf(userId) !== generation) {
        break;
      }

      try {
        await logFn(item);
        doneIds.add(item.id);
        result.synced++;
      } catch (err) {
        if (isNetworkError(err)) {
          result.retrying++;
          continue;
        }
        const newRetryCount = item.retryCount + 1;
        if (newRetryCount >= MAX_RETRY_COUNT) {
          logException(
            new Error('Offline activity dropped after max retries'),
            `offline queue dead letter id=${item.id} type=${item.type}`,
          );
          doneIds.add(item.id);
          result.dropped++;
        } else {
          retryCounts.set(item.id, newRetryCount);
          result.retrying++;
        }
      }
    }

    // Re-read under the lock and touch only our own items that are still present;
    // an id that is gone (cleared or removed meanwhile) is never re-added.
    await this.withLock(async () => {
      const current = await this.load();
      await this.save(
        current
          .filter((q) => !doneIds.has(q.id))
          .map((q) => (retryCounts.has(q.id) ? { ...q, retryCount: retryCounts.get(q.id)! } : q)),
      );
    });
    return result;
  }

  /**
   * Reset all in-memory state between tests. Waits for any running locked
   * section first so it cannot write into the next test.
   * @internal
   */
  async _resetForTesting(): Promise<void> {
    await this.lockTail;
    this.memoryQueue = [];
    this.corruptionReported = false;
    this.lockTail = Promise.resolve();
    this.clearGeneration.clear();
    this.inFlight.clear();
  }
}

export const offlineQueue = new ActivityOfflineQueue();
