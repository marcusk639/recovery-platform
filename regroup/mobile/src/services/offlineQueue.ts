/**
 * Offline Activity Queue
 *
 * Queues activities that fail to write to Firestore due to network unavailability,
 * then retries them when connectivity returns.
 *
 * Storage strategy:
 *   - Persists to AsyncStorage so queued activities survive an app restart.
 *   - Keeps an in-memory copy, used when an AsyncStorage read or write fails.
 *
 * Connectivity strategy:
 *   - Does not require @react-native-community/netinfo.
 *   - Detects offline errors by inspecting the Firestore error code/message.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityType, ActivityData } from '../entities/ActivityModel';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QueuedActivity {
  /** Local temporary ID for deduplication and removal. */
  id: string;
  guestId: string;
  houseId: string;
  type: ActivityType;
  data: ActivityData;
  loggedBy: string;
  timestamp: Date;
  /** Date.now() when the item was enqueued — used for ordering. */
  queuedAt: number;
  /** How many sync attempts have failed so far. */
  retryCount: number;
}

/** Maximum retry attempts before an item is treated as a dead letter. */
const MAX_RETRY_COUNT = 3;

const STORAGE_KEY = '@rats_offline_activity_queue';

// ---------------------------------------------------------------------------
// Simple UUID generation (no external dependency)
// ---------------------------------------------------------------------------

function generateId(): string {
  return `offline_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ---------------------------------------------------------------------------
// Serialisation helpers
// ---------------------------------------------------------------------------

/**
 * JSON.stringify replacer that converts Date instances to ISO strings tagged
 * with a prefix so the reviver can restore them.
 */
function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Date) {
    return `__DATE__${value.toISOString()}`;
  }
  return value;
}

/**
 * JSON.parse reviver that converts tagged ISO strings back to Date instances.
 */
function reviver(_key: string, value: unknown): unknown {
  if (typeof value === 'string' && value.startsWith('__DATE__')) {
    return new Date(value.slice(8));
  }
  return value;
}

function serialize(queue: QueuedActivity[]): string {
  return JSON.stringify(queue, replacer);
}

function deserialize(raw: string): QueuedActivity[] {
  try {
    return JSON.parse(raw, reviver) as QueuedActivity[];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Queue class
// ---------------------------------------------------------------------------

class ActivityOfflineQueue {
  private memoryQueue: QueuedActivity[] = [];

  /** Tail of the promise chain that serialises load-modify-save sections. */
  private lockTail: Promise<unknown> = Promise.resolve();

  /** Per-user counter bumped by clearUser; lets an in-flight flush notice a clear. */
  private clearGeneration = new Map<string, number>();

  /**
   * Run fn after every earlier locked section has finished. Only wrap short
   * load-modify-save sections in this — never a logFn network await.
   */
  private withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lockTail.then(fn, fn);
    this.lockTail = run.catch(() => undefined);
    return run;
  }

  private generationOf(userId: string): number {
    return this.clearGeneration.get(userId) ?? 0;
  }

  /**
   * Load the persisted queue from AsyncStorage (or the in-memory copy if the read fails).
   */
  async load(): Promise<QueuedActivity[]> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = deserialize(raw);
      this.memoryQueue = parsed;
      return [...parsed];
    } catch (err) {
      console.warn('[OfflineQueue] Failed to load queue from storage:', err);
      return [...this.memoryQueue];
    }
  }

  /**
   * Persist the supplied queue to AsyncStorage, keeping an in-memory copy.
   */
  async save(queue: QueuedActivity[]): Promise<void> {
    this.memoryQueue = [...queue];
    try {
      await AsyncStorage.setItem(STORAGE_KEY, serialize(queue));
    } catch (err) {
      console.warn('[OfflineQueue] Failed to save queue to storage:', err);
    }
  }

  /**
   * Add an activity to the queue and persist.
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

  /**
   * Remove a successfully synced item from the queue.
   */
  async remove(id: string): Promise<void> {
    await this.withLock(async () => {
      const queue = await this.load();
      await this.save(queue.filter((item) => item.id !== id));
    });
  }

  /**
   * Return pending items sorted by queuedAt (oldest first). When userId is
   * given, only that user's items (loggedBy === userId) are returned.
   */
  async getPending(userId?: string): Promise<QueuedActivity[]> {
    const queue = await this.load();
    const scoped = userId === undefined ? queue : queue.filter((i) => i.loggedBy === userId);
    return [...scoped].sort((a, b) => a.queuedAt - b.queuedAt);
  }

  /**
   * Remove every queued item logged by userId (sign-out / account deletion).
   * Queued items can hold residents' medication data, so they must not outlive
   * the session on a shared device.
   */
  async clearUser(userId: string): Promise<void> {
    // Bump synchronously so an in-flight flush stops before its next item, even
    // while this call is still waiting for the lock.
    this.clearGeneration.set(userId, this.generationOf(userId) + 1);
    await this.withLock(async () => {
      const queue = await this.load();
      await this.save(queue.filter((item) => item.loggedBy !== userId));
    });
  }

  /**
   * Attempt to flush the given user's pending items to Firestore using logFn.
   * Items logged by other users are neither replayed nor modified.
   *
   * - Items that sync successfully are removed from the queue.
   * - Items that fail have their retryCount incremented and are kept in the queue.
   * - Items whose retryCount has reached MAX_RETRY_COUNT are dropped (dead letter).
   *
   * @param logFn - Async function that writes one queued activity to Firestore.
   * @param userId - Only items with loggedBy === userId are processed.
   * @returns Counts of successfully synced and permanently failed items.
   */
  async flush(
    logFn: (activity: QueuedActivity) => Promise<void>,
    userId: string,
  ): Promise<{ synced: number; failed: number }> {
    // Before the first await, so a clearUser that lands during the read is seen.
    const generation = this.generationOf(userId);
    const pending = await this.getPending(userId);
    if (this.generationOf(userId) !== generation) {
      return { synced: 0, failed: 0 };
    }
    if (pending.length === 0) {
      return { synced: 0, failed: 0 };
    }

    let synced = 0;
    let failed = 0;
    // Delta against the queue as it is when we finish, not the snapshot we started with.
    const doneIds = new Set<string>(); // synced or dead-lettered
    const retryCounts = new Map<string, number>();

    for (const item of pending) {
      // clearUser ran (sign-out): stop, so nothing is replayed under another account.
      if (this.generationOf(userId) !== generation) break;

      try {
        await logFn(item);
        doneIds.add(item.id);
        synced++;
      } catch {
        const newRetryCount = item.retryCount + 1;
        if (newRetryCount >= MAX_RETRY_COUNT) {
          // Dead letter — drop the item.
          console.warn(
            `[OfflineQueue] Dropping activity ${item.id} after ${MAX_RETRY_COUNT} failed attempts.`,
          );
          doneIds.add(item.id);
        } else {
          retryCounts.set(item.id, newRetryCount);
        }
        failed++;
      }
    }

    // Re-read under the lock and touch only our own items that are still present;
    // an id that is gone (cleared or removed meanwhile) is never re-added.
    await this.withLock(async () => {
      const current = await this.load();
      const next = current
        .filter((q) => !doneIds.has(q.id))
        .map((q) => (retryCounts.has(q.id) ? { ...q, retryCount: retryCounts.get(q.id)! } : q));
      await this.save(next);
    });
    return { synced, failed };
  }

  /**
   * Reset the internal storage-check state. Useful in tests when mocking
   * changes between tests.
   * @internal
   */
  _resetForTesting(): void {
    this.memoryQueue = [];
    this.lockTail = Promise.resolve();
    this.clearGeneration.clear();
  }
}

export const offlineQueue = new ActivityOfflineQueue();

// ---------------------------------------------------------------------------
// Network-error detection helpers (exported for use in activity.ts)
// ---------------------------------------------------------------------------

/**
 * Firestore error codes that indicate the client is offline.
 * See https://firebase.google.com/docs/reference/js/firestore_.firestoreerrorcode
 */
const OFFLINE_ERROR_CODES = new Set([
  'unavailable', // Firestore SDK: service is currently unavailable
  'deadline-exceeded', // Request deadline exceeded — likely network issue
]);

const OFFLINE_ERROR_MESSAGES = [
  'network error',
  'failed to get',
  'client is offline',
  'could not reach cloud firestore',
  "backend didn't respond",
  'transport errored',
];

/**
 * Returns true when the caught error looks like a transient network outage
 * rather than a permanent logical error (permission denied, not found, etc.).
 */
export function isNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as Record<string, unknown>;

  // Firestore SDK attaches a `code` property.
  if (typeof err.code === 'string' && OFFLINE_ERROR_CODES.has(err.code)) {
    return true;
  }

  // Fall back to message inspection.
  const message = typeof err.message === 'string' ? err.message.toLowerCase() : '';
  return OFFLINE_ERROR_MESSAGES.some((fragment) => message.includes(fragment));
}
