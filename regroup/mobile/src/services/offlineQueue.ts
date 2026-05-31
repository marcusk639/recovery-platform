/**
 * Offline Activity Queue
 *
 * Queues activities that fail to write to Firestore due to network unavailability,
 * then retries them when connectivity returns.
 *
 * Storage strategy:
 *   - Uses AsyncStorage if @react-native-async-storage/async-storage is installed.
 *   - Falls back to an in-memory array if AsyncStorage is not available.
 *
 * Connectivity strategy:
 *   - Does not require @react-native-community/netinfo.
 *   - Detects offline errors by inspecting the Firestore error code/message.
 */

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
// AsyncStorage — loaded lazily so the module does not crash if the package is
// absent from node_modules.
// ---------------------------------------------------------------------------

type AsyncStorageLike = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

function tryGetAsyncStorage(): AsyncStorageLike | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@react-native-async-storage/async-storage');
    const impl = mod?.default ?? mod;
    if (impl && typeof impl.getItem === 'function' && typeof impl.setItem === 'function') {
      return impl as AsyncStorageLike;
    }
    return null;
  } catch {
    return null;
  }
}

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
  private storage: AsyncStorageLike | null = null;
  private storageChecked = false;

  // Lazy-initialize so tests can mock require before instantiation.
  private getStorage(): AsyncStorageLike | null {
    if (!this.storageChecked) {
      this.storage = tryGetAsyncStorage();
      this.storageChecked = true;
      if (!this.storage) {
        console.warn(
          '[OfflineQueue] @react-native-async-storage/async-storage is not available. ' +
          'Queued activities will be stored in memory only and will not survive app restarts.',
        );
      }
    }
    return this.storage;
  }

  /**
   * Load the persisted queue from AsyncStorage (or return the in-memory queue).
   */
  async load(): Promise<QueuedActivity[]> {
    const storage = this.getStorage();
    if (!storage) {
      return [...this.memoryQueue];
    }
    try {
      const raw = await storage.getItem(STORAGE_KEY);
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
   * Persist the supplied queue to AsyncStorage (or update the in-memory queue).
   */
  async save(queue: QueuedActivity[]): Promise<void> {
    this.memoryQueue = [...queue];
    const storage = this.getStorage();
    if (!storage) return;
    try {
      await storage.setItem(STORAGE_KEY, serialize(queue));
    } catch (err) {
      console.warn('[OfflineQueue] Failed to save queue to storage:', err);
    }
  }

  /**
   * Add an activity to the queue and persist.
   * @returns The local ID assigned to the queued item.
   */
  async enqueue(
    activity: Omit<QueuedActivity, 'id' | 'queuedAt' | 'retryCount'>,
  ): Promise<string> {
    const queue = await this.load();
    const id = generateId();
    const item: QueuedActivity = {
      ...activity,
      id,
      queuedAt: Date.now(),
      retryCount: 0,
    };
    queue.push(item);
    await this.save(queue);
    return id;
  }

  /**
   * Remove a successfully synced item from the queue.
   */
  async remove(id: string): Promise<void> {
    const queue = await this.load();
    const filtered = queue.filter(item => item.id !== id);
    await this.save(filtered);
  }

  /**
   * Return all pending items in the queue, sorted by queuedAt (oldest first).
   */
  async getPending(): Promise<QueuedActivity[]> {
    const queue = await this.load();
    return [...queue].sort((a, b) => a.queuedAt - b.queuedAt);
  }

  /**
   * Attempt to flush all pending items to Firestore using the supplied logFn.
   *
   * - Items that sync successfully are removed from the queue.
   * - Items that fail have their retryCount incremented and are kept in the queue.
   * - Items whose retryCount has reached MAX_RETRY_COUNT are dropped (dead letter).
   *
   * @param logFn - Async function that writes one queued activity to Firestore.
   * @returns Counts of successfully synced and permanently failed items.
   */
  async flush(
    logFn: (activity: QueuedActivity) => Promise<void>,
  ): Promise<{ synced: number; failed: number }> {
    const pending = await this.getPending();
    if (pending.length === 0) {
      return { synced: 0, failed: 0 };
    }

    let synced = 0;
    let failed = 0;

    // Load the full queue once so we can mutate it.
    const queue = await this.load();

    for (const item of pending) {
      const idx = queue.findIndex(q => q.id === item.id);
      if (idx === -1) continue; // Removed by another concurrent flush (unlikely).

      try {
        await logFn(item);
        // Success — remove from queue.
        queue.splice(idx, 1);
        synced++;
      } catch {
        const newRetryCount = item.retryCount + 1;
        if (newRetryCount >= MAX_RETRY_COUNT) {
          // Dead letter — drop the item.
          console.warn(
            `[OfflineQueue] Dropping activity ${item.id} after ${MAX_RETRY_COUNT} failed attempts.`,
          );
          queue.splice(idx, 1);
          failed++;
        } else {
          // Keep in queue with incremented retryCount.
          queue[idx] = { ...queue[idx], retryCount: newRetryCount };
          failed++;
        }
      }
    }

    await this.save(queue);
    return { synced, failed };
  }

  /**
   * Reset the internal storage-check state. Useful in tests when mocking
   * changes between tests.
   * @internal
   */
  _resetForTesting(): void {
    this.storageChecked = false;
    this.storage = null;
    this.memoryQueue = [];
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
  'unavailable',       // Firestore SDK: service is currently unavailable
  'deadline-exceeded', // Request deadline exceeded — likely network issue
]);

const OFFLINE_ERROR_MESSAGES = [
  'network error',
  'failed to get',
  'client is offline',
  'could not reach cloud firestore',
  'backend didn\'t respond',
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
  return OFFLINE_ERROR_MESSAGES.some(fragment => message.includes(fragment));
}
