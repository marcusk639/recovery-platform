/**
 * Tests for ActivityOfflineQueue and isNetworkError.
 *
 * AsyncStorage is mocked so the tests can inspect what the queue persists.
 */

import { ActivityType } from '../../entities/ActivityModel';

// ---------------------------------------------------------------------------
// Mock for AsyncStorage — installed before any module under test is
// require()'d so that offlineQueue.ts's import sees our mock.
// ---------------------------------------------------------------------------

const mockGetItem = jest.fn<Promise<string | null>, [string]>();
const mockSetItem = jest.fn<Promise<void>, [string, string]>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: mockGetItem,
    setItem: mockSetItem,
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeItem = (overrides = {}) => ({
  guestId: 'guest-1',
  houseId: 'house-1',
  type: ActivityType.CHORE,
  data: { type: 'chore' as const, choreType: 'daily', choreName: 'Dishes' },
  loggedBy: 'user-1',
  timestamp: new Date('2026-01-15T10:00:00.000Z'),
  ...overrides,
});

/** Serialise the way offlineQueue.ts does (Date → __DATE__ISO). */
const encodeQueue = (items: object[]) =>
  JSON.stringify(items, (_k, v) => (v instanceof Date ? `__DATE__${v.toISOString()}` : v));

// ---------------------------------------------------------------------------
// Suite 1 — isNetworkError
// ---------------------------------------------------------------------------

describe('isNetworkError', () => {
  // Import once — no module reset needed here.
  const { isNetworkError } = require('../offlineQueue');

  it('returns true for Firestore "unavailable" error code', () => {
    expect(isNetworkError({ code: 'unavailable', message: 'Service unavailable' })).toBe(true);
  });

  it('returns true for Firestore "deadline-exceeded" error code', () => {
    expect(isNetworkError({ code: 'deadline-exceeded', message: 'Deadline exceeded' })).toBe(true);
  });

  it('returns true when error message contains "network error"', () => {
    expect(isNetworkError({ message: 'A Network Error occurred' })).toBe(true);
  });

  it('returns true when error message contains "client is offline"', () => {
    expect(isNetworkError({ message: 'Client is offline' })).toBe(true);
  });

  it('returns false for permission-denied errors', () => {
    expect(isNetworkError({ code: 'permission-denied', message: 'Permission denied' })).toBe(false);
  });

  it('returns false for non-error values', () => {
    expect(isNetworkError(null)).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
    expect(isNetworkError('string error')).toBe(false);
    expect(isNetworkError(42)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — Queue with AsyncStorage available
// ---------------------------------------------------------------------------

describe('ActivityOfflineQueue — with AsyncStorage', () => {
  let offlineQueueModule: typeof import('../offlineQueue');

  beforeEach(() => {
    mockGetItem.mockReset();
    mockSetItem.mockReset();
    mockGetItem.mockResolvedValue(null); // empty queue by default
    mockSetItem.mockResolvedValue(undefined);

    // Re-require and reset internal state so each test starts fresh.
    offlineQueueModule = require('../offlineQueue');
    offlineQueueModule.offlineQueue._resetForTesting();
  });

  // -------------------------------------------------------------------------

  it('enqueue() adds an item and persists it to storage', async () => {
    const id = await offlineQueueModule.offlineQueue.enqueue(makeItem());

    expect(id).toMatch(/^offline_/);
    expect(mockSetItem).toHaveBeenCalledTimes(1);

    const raw = mockSetItem.mock.calls[0][1];
    const parsed = JSON.parse(raw, (_k, v) =>
      typeof v === 'string' && v.startsWith('__DATE__') ? new Date(v.slice(8)) : v,
    );
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe(id);
    expect(parsed[0].retryCount).toBe(0);
    expect(parsed[0].guestId).toBe('guest-1');
  });

  it('enqueue() appends to existing persisted items', async () => {
    const existing = [{ ...makeItem(), id: 'offline_existing_1', queuedAt: 1000, retryCount: 0 }];
    mockGetItem.mockResolvedValue(encodeQueue(existing));

    await offlineQueueModule.offlineQueue.enqueue(makeItem({ guestId: 'guest-2' }));

    const raw = mockSetItem.mock.calls[mockSetItem.mock.calls.length - 1][1];
    const parsed = JSON.parse(raw);
    expect(parsed).toHaveLength(2);
  });

  it('remove() deletes the item with the given id', async () => {
    // Pre-seed one item in mock storage.
    const item = { ...makeItem(), id: 'offline_to_remove', queuedAt: Date.now(), retryCount: 0 };
    mockGetItem.mockResolvedValue(encodeQueue([item]));

    await offlineQueueModule.offlineQueue.remove('offline_to_remove');

    const lastSaveCall = mockSetItem.mock.calls[mockSetItem.mock.calls.length - 1];
    const saved = JSON.parse(lastSaveCall[1]);
    expect(saved.find((i: { id: string }) => i.id === 'offline_to_remove')).toBeUndefined();
  });

  it('getPending() returns items sorted oldest-first by queuedAt', async () => {
    const items = [
      { ...makeItem(), id: 'offline_b', queuedAt: 2000, retryCount: 0 },
      { ...makeItem(), id: 'offline_a', queuedAt: 1000, retryCount: 0 },
      { ...makeItem(), id: 'offline_c', queuedAt: 3000, retryCount: 0 },
    ];
    mockGetItem.mockResolvedValue(encodeQueue(items));

    const pending = await offlineQueueModule.offlineQueue.getPending();
    expect(pending.map((i: { id: string }) => i.id)).toEqual([
      'offline_a',
      'offline_b',
      'offline_c',
    ]);
  });

  // -------------------------------------------------------------------------
  // flush() tests
  // -------------------------------------------------------------------------

  it('flush() calls logFn for each pending item and removes them on success', async () => {
    const items = [
      { ...makeItem(), id: 'offline_1', queuedAt: 1000, retryCount: 0 },
      { ...makeItem({ guestId: 'guest-2' }), id: 'offline_2', queuedAt: 2000, retryCount: 0 },
    ];
    mockGetItem.mockResolvedValue(encodeQueue(items));

    const logFn = jest.fn().mockResolvedValue(undefined);
    const result = await offlineQueueModule.offlineQueue.flush(logFn, 'user-1');

    expect(logFn).toHaveBeenCalledTimes(2);
    expect(result.synced).toBe(2);
    expect(result.failed).toBe(0);

    const lastSave = mockSetItem.mock.calls[mockSetItem.mock.calls.length - 1][1];
    expect(JSON.parse(lastSave)).toHaveLength(0);
  });

  it('flush() handles partial failure — failed items remain with incremented retryCount', async () => {
    const items = [
      { ...makeItem(), id: 'offline_ok', queuedAt: 1000, retryCount: 0 },
      { ...makeItem({ guestId: 'guest-fail' }), id: 'offline_fail', queuedAt: 2000, retryCount: 0 },
    ];
    mockGetItem.mockResolvedValue(encodeQueue(items));

    const logFn = jest.fn().mockImplementation(async (item: { id: string }) => {
      if (item.id === 'offline_fail') {
        throw new Error('Network error');
      }
    });

    const result = await offlineQueueModule.offlineQueue.flush(logFn, 'user-1');

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(1);

    const lastSave = mockSetItem.mock.calls[mockSetItem.mock.calls.length - 1][1];
    const savedQueue = JSON.parse(lastSave);
    expect(savedQueue).toHaveLength(1);
    expect(savedQueue[0].id).toBe('offline_fail');
    expect(savedQueue[0].retryCount).toBe(1);
  });

  it('flush() drops items that have reached MAX_RETRY_COUNT (dead letter)', async () => {
    // retryCount is 2 — one more failure should reach MAX (3) and drop the item.
    const items = [{ ...makeItem(), id: 'offline_dead', queuedAt: 1000, retryCount: 2 }];
    mockGetItem.mockResolvedValue(encodeQueue(items));

    const logFn = jest.fn().mockRejectedValue(new Error('Persistent failure'));
    const result = await offlineQueueModule.offlineQueue.flush(logFn, 'user-1');

    expect(result.synced).toBe(0);
    expect(result.failed).toBe(1);

    const lastSave = mockSetItem.mock.calls[mockSetItem.mock.calls.length - 1][1];
    expect(JSON.parse(lastSave)).toHaveLength(0);
  });

  it('flush() returns { synced: 0, failed: 0 } when queue is empty', async () => {
    mockGetItem.mockResolvedValue(null);
    const logFn = jest.fn();
    const result = await offlineQueueModule.offlineQueue.flush(logFn, 'user-1');

    expect(logFn).not.toHaveBeenCalled();
    expect(result).toEqual({ synced: 0, failed: 0 });
  });

  // -------------------------------------------------------------------------
  // Per-user scoping
  // -------------------------------------------------------------------------

  const twoUserQueue = () => [
    { ...makeItem({ loggedBy: 'u1' }), id: 'offline_u1_a', queuedAt: 1000, retryCount: 0 },
    { ...makeItem({ loggedBy: 'u2' }), id: 'offline_u2_a', queuedAt: 1500, retryCount: 1 },
    { ...makeItem({ loggedBy: 'u1' }), id: 'offline_u1_b', queuedAt: 2000, retryCount: 0 },
  ];

  it("flush(logFn, 'u1') only replays u1's items and leaves u2's untouched", async () => {
    mockGetItem.mockResolvedValue(encodeQueue(twoUserQueue()));
    const logFn = jest.fn().mockResolvedValue(undefined);

    const result = await offlineQueueModule.offlineQueue.flush(logFn, 'u1');

    expect(result).toEqual({ synced: 2, failed: 0 });
    expect(logFn.mock.calls.map((c) => c[0].id)).toEqual(['offline_u1_a', 'offline_u1_b']);
    const saved = JSON.parse(mockSetItem.mock.calls[mockSetItem.mock.calls.length - 1][1]);
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe('offline_u2_a');
    expect(saved[0].retryCount).toBe(1);
  });

  it("flush(logFn, 'u1') does not touch other users' retryCount when u1's items fail", async () => {
    mockGetItem.mockResolvedValue(encodeQueue(twoUserQueue()));
    const logFn = jest.fn().mockRejectedValue(new Error('Network error'));

    const result = await offlineQueueModule.offlineQueue.flush(logFn, 'u1');

    expect(result).toEqual({ synced: 0, failed: 2 });
    const saved = JSON.parse(mockSetItem.mock.calls[mockSetItem.mock.calls.length - 1][1]);
    const byId = Object.fromEntries(saved.map((i: { id: string }) => [i.id, i]));
    expect(byId.offline_u2_a.retryCount).toBe(1);
    expect(byId.offline_u1_a.retryCount).toBe(1);
  });

  it('flush() never calls logFn when the user has no items', async () => {
    mockGetItem.mockResolvedValue(encodeQueue(twoUserQueue()));
    const logFn = jest.fn();

    const result = await offlineQueueModule.offlineQueue.flush(logFn, 'nobody');

    expect(logFn).not.toHaveBeenCalled();
    expect(result).toEqual({ synced: 0, failed: 0 });
  });

  it("clearUser('u1') removes only u1's items", async () => {
    mockGetItem.mockResolvedValue(encodeQueue(twoUserQueue()));

    await offlineQueueModule.offlineQueue.clearUser('u1');

    const saved = JSON.parse(mockSetItem.mock.calls[mockSetItem.mock.calls.length - 1][1]);
    expect(saved.map((i: { id: string }) => i.id)).toEqual(['offline_u2_a']);
  });

  it("getPending('u1') filters to that user's items", async () => {
    mockGetItem.mockResolvedValue(encodeQueue(twoUserQueue()));

    const forU1 = await offlineQueueModule.offlineQueue.getPending('u1');
    const all = await offlineQueueModule.offlineQueue.getPending();

    expect(forU1.map((i) => i.id)).toEqual(['offline_u1_a', 'offline_u1_b']);
    expect(all).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — Queue WITHOUT AsyncStorage (in-memory fallback)
// ---------------------------------------------------------------------------

describe('ActivityOfflineQueue — when AsyncStorage fails (in-memory fallback)', () => {
  let offlineQueueModule: typeof import('../offlineQueue');

  beforeAll(() => {
    // Override the mock so every AsyncStorage call rejects; the queue keeps
    // working from its in-memory copy.
    jest.doMock('@react-native-async-storage/async-storage', () => ({
      __esModule: true,
      default: {
        getItem: () => Promise.reject(new Error('storage unavailable')),
        setItem: () => Promise.reject(new Error('storage unavailable')),
      },
    }));

    // Force a fresh require so offlineQueue.ts imports the failing mock.
    jest.resetModules();

    // Re-register the mock AFTER resetModules.
    jest.doMock('@react-native-async-storage/async-storage', () => ({
      __esModule: true,
      default: {
        getItem: () => Promise.reject(new Error('storage unavailable')),
        setItem: () => Promise.reject(new Error('storage unavailable')),
      },
    }));

    offlineQueueModule = require('../offlineQueue');
    offlineQueueModule.offlineQueue._resetForTesting();
  });

  afterAll(() => {
    // Restore the normal (working) mock and reset module registry so
    // subsequent test files start clean.
    jest.resetModules();
    jest.doMock('@react-native-async-storage/async-storage', () => ({
      __esModule: true,
      default: { getItem: mockGetItem, setItem: mockSetItem },
    }));
  });

  beforeEach(() => {
    offlineQueueModule.offlineQueue._resetForTesting();
  });

  it('enqueue() works and returns a local id', async () => {
    const id = await offlineQueueModule.offlineQueue.enqueue(makeItem());
    expect(id).toMatch(/^offline_/);
  });

  it('getPending() returns enqueued items from memory', async () => {
    await offlineQueueModule.offlineQueue.enqueue(makeItem());
    await offlineQueueModule.offlineQueue.enqueue(makeItem({ guestId: 'guest-2' }));

    const pending = await offlineQueueModule.offlineQueue.getPending();
    expect(pending).toHaveLength(2);
  });

  it('flush() syncs in-memory items and clears them on success', async () => {
    await offlineQueueModule.offlineQueue.enqueue(makeItem());
    await offlineQueueModule.offlineQueue.enqueue(makeItem({ guestId: 'guest-2' }));

    const logFn = jest.fn().mockResolvedValue(undefined);
    const result = await offlineQueueModule.offlineQueue.flush(logFn, 'user-1');

    expect(result.synced).toBe(2);
    expect(result.failed).toBe(0);

    const pending = await offlineQueueModule.offlineQueue.getPending();
    expect(pending).toHaveLength(0);
  });

  it('remove() removes an item from memory', async () => {
    const id = await offlineQueueModule.offlineQueue.enqueue(makeItem());
    await offlineQueueModule.offlineQueue.remove(id);

    const pending = await offlineQueueModule.offlineQueue.getPending();
    expect(pending).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — flush racing clearUser / other writers (stateful fake storage)
// ---------------------------------------------------------------------------

describe('ActivityOfflineQueue — flush concurrency', () => {
  let offlineQueueModule: typeof import('../offlineQueue');
  let store: string | null;

  const stored = (): Array<{ id: string; loggedBy: string; retryCount: number }> =>
    store
      ? JSON.parse(store, (_k, v) =>
          typeof v === 'string' && v.startsWith('__DATE__') ? new Date(v.slice(8)) : v,
        )
      : [];

  const seed = (items: object[]) => {
    store = encodeQueue(items);
  };

  const q = (id: string, loggedBy: string, queuedAt: number, retryCount = 0) => ({
    ...makeItem({ loggedBy }),
    id,
    queuedAt,
    retryCount,
  });

  /** A logFn whose calls stay pending until released one by one. */
  const deferredLogFn = () => {
    const calls: string[] = [];
    const releases: Array<{ resolve: () => void; reject: (e: Error) => void }> = [];
    const fn = jest.fn((activity: { id: string }) => {
      calls.push(activity.id);
      return new Promise<void>((resolve, reject) => releases.push({ resolve, reject }));
    });
    return { fn, calls, releases };
  };

  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

  beforeEach(() => {
    store = null;
    mockGetItem.mockReset();
    mockSetItem.mockReset();
    mockGetItem.mockImplementation(async () => store);
    mockSetItem.mockImplementation(async (_k, v) => {
      store = v;
    });
    offlineQueueModule = require('../offlineQueue');
    offlineQueueModule.offlineQueue._resetForTesting();
  });

  it('clearUser during a pending flush stops further items and does not resurrect cleared ones', async () => {
    const { offlineQueue } = offlineQueueModule;
    seed([q('a1', 'A', 1), q('a2', 'A', 2), q('a3', 'A', 3)]);
    const log = deferredLogFn();

    const flushing = offlineQueue.flush(log.fn, 'A');
    await tick();
    expect(log.calls).toEqual(['a1']);

    await offlineQueue.clearUser('A'); // does not wait for the in-flight logFn
    expect(stored()).toEqual([]);

    log.releases[0].resolve();
    await flushing;

    expect(log.calls).toEqual(['a1']); // a2 / a3 never logged
    expect(stored()).toEqual([]);
  });

  it('clearUser while flush is still reading the queue stops it before any item', async () => {
    const { offlineQueue } = offlineQueueModule;
    seed([q('a1', 'A', 1), q('a2', 'A', 2)]);
    const logFn = jest.fn().mockResolvedValue(undefined);

    // flush is suspended in its first storage read when clearUser runs.
    const flushing = offlineQueue.flush(logFn, 'A');
    await offlineQueue.clearUser('A');
    await flushing;

    expect(logFn).not.toHaveBeenCalled();
    expect(stored()).toEqual([]);
  });

  it('a failing in-flight item after clearUser does not resurrect it either', async () => {
    const { offlineQueue } = offlineQueueModule;
    seed([q('a1', 'A', 1), q('a2', 'A', 2)]);
    const log = deferredLogFn();

    const flushing = offlineQueue.flush(log.fn, 'A');
    await tick();
    await offlineQueue.clearUser('A');
    log.releases[0].reject(new Error('offline'));
    await flushing;

    expect(log.calls).toEqual(['a1']);
    expect(stored()).toEqual([]);
  });

  it("an enqueue by another user during a flush survives the flush's save", async () => {
    const { offlineQueue } = offlineQueueModule;
    seed([q('a1', 'A', 1), q('a2', 'A', 2)]);
    const log = deferredLogFn();

    const flushing = offlineQueue.flush(log.fn, 'A');
    await tick();
    const bId = await offlineQueue.enqueue(makeItem({ loggedBy: 'B' }));

    log.releases[0].resolve();
    await tick();
    log.releases[1].resolve();
    const result = await flushing;

    expect(result).toEqual({ synced: 2, failed: 0 });
    expect(stored().map((i) => i.id)).toEqual([bId]);
  });

  it('clear by A then enqueue by B then old flush ending leaves only B items', async () => {
    const { offlineQueue } = offlineQueueModule;
    seed([q('a1', 'A', 1), q('a2', 'A', 2), q('a3', 'A', 3)]);
    const log = deferredLogFn();

    const flushing = offlineQueue.flush(log.fn, 'A');
    await tick();
    await offlineQueue.clearUser('A');
    const bId = await offlineQueue.enqueue(makeItem({ loggedBy: 'B' }));
    log.releases[0].resolve();
    await flushing;

    expect(log.calls).toEqual(['a1']);
    expect(stored().map((i) => i.id)).toEqual([bId]);
  });

  it('a later flush for the same user works after an earlier clear', async () => {
    const { offlineQueue } = offlineQueueModule;
    await offlineQueue.clearUser('A');
    const id = await offlineQueue.enqueue(makeItem({ loggedBy: 'A' }));
    const logFn = jest.fn().mockResolvedValue(undefined);

    const result = await offlineQueue.flush(logFn, 'A');

    expect(result).toEqual({ synced: 1, failed: 0 });
    expect(logFn).toHaveBeenCalledWith(expect.objectContaining({ id }));
    expect(stored()).toEqual([]);
  });

  it('keeps flush semantics: sync removes, failure bumps retryCount, dead-letter drops, others untouched', async () => {
    const { offlineQueue } = offlineQueueModule;
    seed([q('ok', 'A', 1), q('flaky', 'A', 2, 0), q('dead', 'A', 3, 2), q('other', 'B', 4, 1)]);
    const logFn = jest.fn(async (activity: { id: string }) => {
      if (activity.id !== 'ok') {
        throw new Error('offline');
      }
    });

    const result = await offlineQueue.flush(logFn, 'A');

    expect(result).toEqual({ synced: 1, failed: 2 });
    expect(logFn).toHaveBeenCalledTimes(3);
    expect(stored().map((i) => [i.id, i.retryCount])).toEqual([
      ['flaky', 1],
      ['other', 1],
    ]);
  });

  it('concurrent enqueues do not lose items', async () => {
    const { offlineQueue } = offlineQueueModule;
    const ids = await Promise.all(
      Array.from({ length: 10 }, () => offlineQueue.enqueue(makeItem())),
    );
    expect(
      stored()
        .map((i) => i.id)
        .sort(),
    ).toEqual([...ids].sort());
  });
});
