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
const mockRemoveItem = jest.fn<Promise<void>, [string]>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (...args: [string]) => mockGetItem(...args),
    setItem: (...args: [string, string]) => mockSetItem(...args),
    removeItem: (...args: [string]) => mockRemoveItem(...args),
  },
}));

const mockLogException = jest.fn();
jest.mock('../../util/logging', () => ({
  logException: (...args: unknown[]) => mockLogException(...args),
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
  ownerUid: 'user-1',
  timestamp: new Date('2026-01-15T10:00:00.000Z'),
  ...overrides,
});

/** Serialise the way offlineQueue.ts does (Date → __DATE__ISO). */
const encodeQueue = (items: unknown[]) =>
  JSON.stringify(items, (_k, v) => (v instanceof Date ? `__DATE__${v.toISOString()}` : v));

const decodeQueue = (raw: string) =>
  JSON.parse(raw, (_k, v) =>
    typeof v === 'string' && v.startsWith('__DATE__') ? new Date(v.slice(8)) : v,
  );

const lastSaved = () => decodeQueue(mockSetItem.mock.calls[mockSetItem.mock.calls.length - 1][1]);

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

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

  it('returns true for the React Native Firebase namespaced "firestore/unavailable" code', () => {
    expect(isNetworkError({ code: 'firestore/unavailable', message: 'x' })).toBe(true);
  });

  it('returns true for the React Native Firebase namespaced "firestore/deadline-exceeded" code', () => {
    expect(isNetworkError({ code: 'firestore/deadline-exceeded', message: 'x' })).toBe(true);
  });

  it('looks through `cause` for the network code', () => {
    const wrapped = new Error('Failed to do a thing', {
      cause: { code: 'firestore/unavailable' },
    });
    expect(isNetworkError(wrapped)).toBe(true);
    expect(isNetworkError(new Error('x', { cause: { code: 'permission-denied' } }))).toBe(false);
  });

  it('returns false for namespaced permission errors', () => {
    expect(isNetworkError({ code: 'firestore/permission-denied', message: 'denied' })).toBe(false);
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

  beforeEach(async () => {
    mockGetItem.mockReset();
    mockSetItem.mockReset();
    mockRemoveItem.mockReset();
    mockLogException.mockReset();
    mockGetItem.mockResolvedValue(null); // empty queue by default
    mockSetItem.mockResolvedValue(undefined);
    mockRemoveItem.mockResolvedValue(undefined);

    offlineQueueModule = require('../offlineQueue');
    await offlineQueueModule.offlineQueue._resetForTesting();
  });

  // -------------------------------------------------------------------------

  it('enqueue() adds an item and persists it to storage', async () => {
    const id = await offlineQueueModule.offlineQueue.enqueue(makeItem());

    expect(id).toMatch(/^offline_/);
    expect(mockSetItem).toHaveBeenCalledTimes(1);

    const parsed = lastSaved();
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe(id);
    expect(parsed[0].retryCount).toBe(0);
    expect(parsed[0].guestId).toBe('guest-1');
    expect(parsed[0].ownerUid).toBe('user-1');
  });

  it('enqueue() appends to existing persisted items', async () => {
    const existing = [{ ...makeItem(), id: 'offline_existing_1', queuedAt: 1000, retryCount: 0 }];
    mockGetItem.mockResolvedValue(encodeQueue(existing));

    await offlineQueueModule.offlineQueue.enqueue(makeItem({ guestId: 'guest-2' }));

    expect(lastSaved()).toHaveLength(2);
  });

  it('remove() deletes the item with the given id', async () => {
    const item = { ...makeItem(), id: 'offline_to_remove', queuedAt: Date.now(), retryCount: 0 };
    mockGetItem.mockResolvedValue(encodeQueue([item]));

    await offlineQueueModule.offlineQueue.remove('offline_to_remove');

    expect(lastSaved().find((i: { id: string }) => i.id === 'offline_to_remove')).toBeUndefined();
  });

  it('getPending() returns items sorted oldest-first by queuedAt', async () => {
    const items = [
      { ...makeItem(), id: 'offline_b', queuedAt: 2000, retryCount: 0 },
      { ...makeItem(), id: 'offline_a', queuedAt: 1000, retryCount: 0 },
      { ...makeItem(), id: 'offline_c', queuedAt: 3000, retryCount: 0 },
    ];
    mockGetItem.mockResolvedValue(encodeQueue(items));

    const pending = await offlineQueueModule.offlineQueue.getPending('user-1');
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
    expect(result).toEqual({ synced: 2, retrying: 0, dropped: 0 });
    expect(lastSaved()).toHaveLength(0);
  });

  it('flush() handles partial failure — failed items remain with incremented retryCount', async () => {
    const items = [
      { ...makeItem(), id: 'offline_ok', queuedAt: 1000, retryCount: 0 },
      { ...makeItem({ guestId: 'guest-fail' }), id: 'offline_fail', queuedAt: 2000, retryCount: 0 },
    ];
    mockGetItem.mockResolvedValue(encodeQueue(items));

    const logFn = jest.fn().mockImplementation(async (item: { id: string }) => {
      if (item.id === 'offline_fail') {
        throw Object.assign(new Error('write rejected'), { code: 'aborted' });
      }
    });

    const result = await offlineQueueModule.offlineQueue.flush(logFn, 'user-1');

    expect(result).toEqual({ synced: 1, retrying: 1, dropped: 0 });
    const savedQueue = lastSaved();
    expect(savedQueue).toHaveLength(1);
    expect(savedQueue[0].id).toBe('offline_fail');
    expect(savedQueue[0].retryCount).toBe(1);
  });

  it('flush() does not spend retry budget on network errors', async () => {
    const items = [{ ...makeItem(), id: 'offline_net', queuedAt: 1000, retryCount: 2 }];
    mockGetItem.mockResolvedValue(encodeQueue(items));

    const logFn = jest
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('unavailable'), { code: 'firestore/unavailable' }),
      );
    const result = await offlineQueueModule.offlineQueue.flush(logFn, 'user-1');

    expect(result).toEqual({ synced: 0, retrying: 1, dropped: 0 });
    const saved = lastSaved();
    expect(saved).toHaveLength(1);
    expect(saved[0].retryCount).toBe(2);
  });

  it('flush() drops items that have reached MAX_RETRY_COUNT (dead letter) and reports id and type only', async () => {
    // retryCount is 2 — one more failure should reach MAX (3) and drop the item.
    const items = [{ ...makeItem(), id: 'offline_dead', queuedAt: 1000, retryCount: 2 }];
    mockGetItem.mockResolvedValue(encodeQueue(items));

    const logFn = jest.fn().mockRejectedValue(new Error('Persistent failure'));
    const result = await offlineQueueModule.offlineQueue.flush(logFn, 'user-1');

    expect(result).toEqual({ synced: 0, retrying: 0, dropped: 1 });
    expect(lastSaved()).toHaveLength(0);

    expect(mockLogException).toHaveBeenCalledTimes(1);
    const [reported, message] = mockLogException.mock.calls[0];
    expect(reported).toBeInstanceOf(Error);
    const text = `${reported.message} ${message}`;
    expect(text).toContain('offline_dead');
    expect(text).toContain(ActivityType.CHORE);
    expect(text).not.toContain('Dishes');
    expect(text).not.toContain('guest-1');
    expect(text).not.toContain('Persistent failure');
  });

  it('flush() returns zero counts when queue is empty', async () => {
    mockGetItem.mockResolvedValue(null);
    const logFn = jest.fn();
    const result = await offlineQueueModule.offlineQueue.flush(logFn, 'user-1');

    expect(logFn).not.toHaveBeenCalled();
    expect(result).toEqual({ synced: 0, retrying: 0, dropped: 0 });
  });

  // -------------------------------------------------------------------------
  // Per-user scoping
  // -------------------------------------------------------------------------

  const twoUserQueue = () => [
    {
      ...makeItem({ loggedBy: 'u1', ownerUid: 'u1' }),
      id: 'offline_u1_a',
      queuedAt: 1000,
      retryCount: 0,
    },
    {
      ...makeItem({ loggedBy: 'u2', ownerUid: 'u2' }),
      id: 'offline_u2_a',
      queuedAt: 1500,
      retryCount: 1,
    },
    {
      ...makeItem({ loggedBy: 'u1', ownerUid: 'u1' }),
      id: 'offline_u1_b',
      queuedAt: 2000,
      retryCount: 0,
    },
  ];

  it("flush(logFn, 'u1') only replays u1's items and leaves u2's untouched", async () => {
    mockGetItem.mockResolvedValue(encodeQueue(twoUserQueue()));
    const logFn = jest.fn().mockResolvedValue(undefined);

    const result = await offlineQueueModule.offlineQueue.flush(logFn, 'u1');

    expect(result).toEqual({ synced: 2, retrying: 0, dropped: 0 });
    expect(logFn.mock.calls.map((c) => c[0].id)).toEqual(['offline_u1_a', 'offline_u1_b']);
    const saved = lastSaved();
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe('offline_u2_a');
    expect(saved[0].retryCount).toBe(1);
  });

  it("flush(logFn, 'u1') does not touch other users' retryCount when u1's items fail", async () => {
    mockGetItem.mockResolvedValue(encodeQueue(twoUserQueue()));
    const logFn = jest.fn().mockRejectedValue(new Error('write rejected'));

    const result = await offlineQueueModule.offlineQueue.flush(logFn, 'u1');

    expect(result).toEqual({ synced: 0, retrying: 2, dropped: 0 });
    const byId = Object.fromEntries(lastSaved().map((i: { id: string }) => [i.id, i]));
    expect(byId.offline_u2_a.retryCount).toBe(1);
    expect(byId.offline_u1_a.retryCount).toBe(1);
  });

  it('flush() never calls logFn when the user has no items', async () => {
    mockGetItem.mockResolvedValue(encodeQueue(twoUserQueue()));
    const logFn = jest.fn();

    const result = await offlineQueueModule.offlineQueue.flush(logFn, 'nobody');

    expect(logFn).not.toHaveBeenCalled();
    expect(result).toEqual({ synced: 0, retrying: 0, dropped: 0 });
  });

  it("clearUser('u1') removes only u1's items", async () => {
    mockGetItem.mockResolvedValue(encodeQueue(twoUserQueue()));

    await offlineQueueModule.offlineQueue.clearUser('u1');

    expect(lastSaved().map((i: { id: string }) => i.id)).toEqual(['offline_u2_a']);
  });

  it("getPending('u1') filters to that user's items", async () => {
    mockGetItem.mockResolvedValue(encodeQueue(twoUserQueue()));

    const forU1 = await offlineQueueModule.offlineQueue.getPending('u1');

    expect(forU1.map((i) => i.id)).toEqual(['offline_u1_a', 'offline_u1_b']);
  });

  it("pendingCountFor('u1') counts only that user's items", async () => {
    mockGetItem.mockResolvedValue(encodeQueue(twoUserQueue()));

    expect(await offlineQueueModule.offlineQueue.pendingCountFor('u1')).toBe(2);
    expect(await offlineQueueModule.offlineQueue.pendingCountFor('nobody')).toBe(0);
  });

  it('ownership follows ownerUid, not loggedBy', async () => {
    const items = [
      {
        ...makeItem({ loggedBy: 'someone-else', ownerUid: 'u1' }),
        id: 'offline_owned',
        queuedAt: 1,
        retryCount: 0,
      },
    ];
    mockGetItem.mockResolvedValue(encodeQueue(items));
    const { offlineQueue } = offlineQueueModule;

    expect(await offlineQueue.getPending('someone-else')).toEqual([]);
    expect((await offlineQueue.getPending('u1')).map((i) => i.id)).toEqual(['offline_owned']);

    const logFn = jest.fn().mockResolvedValue(undefined);
    await offlineQueue.flush(logFn, 'someone-else');
    expect(logFn).not.toHaveBeenCalled();
    await offlineQueue.flush(logFn, 'u1');
    expect(logFn).toHaveBeenCalledTimes(1);
  });

  it('items persisted before ownerUid existed fall back to loggedBy', async () => {
    const legacy = { ...makeItem({ loggedBy: 'u1' }), id: 'offline_legacy', queuedAt: 1 };
    delete (legacy as { ownerUid?: string }).ownerUid;
    mockGetItem.mockResolvedValue(encodeQueue([{ ...legacy, retryCount: 0 }]));
    const { offlineQueue } = offlineQueueModule;

    expect((await offlineQueue.getPending('u1')).map((i) => i.id)).toEqual(['offline_legacy']);
    await offlineQueue.clearUser('u1');
    expect(lastSaved()).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Deserialisation
  // -------------------------------------------------------------------------

  it('treats a persisted payload that is not an array as an empty queue', async () => {
    mockGetItem.mockResolvedValue('{"not":"an array"}');
    const { offlineQueue } = offlineQueueModule;

    expect(await offlineQueue.getPending('user-1')).toEqual([]);
    await expect(offlineQueue.enqueue(makeItem())).resolves.toMatch(/^offline_/);
  });

  it('reports an unparseable payload without leaking its content', async () => {
    mockGetItem.mockResolvedValue('{"guestId":"Jane Doe medication: oxycodone');
    const { offlineQueue } = offlineQueueModule;

    expect(await offlineQueue.getPending('user-1')).toEqual([]);

    expect(mockLogException).toHaveBeenCalled();
    const serialisedCalls = JSON.stringify(
      mockLogException.mock.calls.map(([err, msg]) => [String(err && err.message), msg]),
    );
    expect(serialisedCalls).not.toContain('Jane');
    expect(serialisedCalls).not.toContain('oxycodone');
  });

  it('ignores array entries that are not objects', async () => {
    const good = { ...makeItem(), id: 'offline_good', queuedAt: 1, retryCount: 0 };
    mockGetItem.mockResolvedValue(encodeQueue([null, 'junk', 7, good]));

    const pending = await offlineQueueModule.offlineQueue.getPending('user-1');

    expect(pending.map((i) => i.id)).toEqual(['offline_good']);
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — AsyncStorage failures: reads and writes fail loudly, never silently
// ---------------------------------------------------------------------------

describe('ActivityOfflineQueue — when AsyncStorage fails', () => {
  let offlineQueueModule: typeof import('../offlineQueue');
  let store: string | null;

  const q = (id: string, ownerUid: string, queuedAt: number) => ({
    ...makeItem({ loggedBy: ownerUid, ownerUid }),
    id,
    queuedAt,
    retryCount: 0,
  });

  beforeEach(async () => {
    store = null;
    mockGetItem.mockReset();
    mockSetItem.mockReset();
    mockRemoveItem.mockReset();
    mockLogException.mockReset();
    mockGetItem.mockImplementation(async () => store);
    mockSetItem.mockImplementation(async (_k, v) => {
      store = v;
    });
    mockRemoveItem.mockImplementation(async () => {
      store = null;
    });
    offlineQueueModule = require('../offlineQueue');
    await offlineQueueModule.offlineQueue._resetForTesting();
  });

  it('enqueue() rejects when the write fails, reports it, and leaves nothing queued', async () => {
    const { offlineQueue } = offlineQueueModule;
    mockSetItem.mockRejectedValue(new Error('disk full'));

    await expect(offlineQueue.enqueue(makeItem())).rejects.toThrow('disk full');
    expect(mockLogException).toHaveBeenCalled();

    // Storage recovers: the item that was never persisted must not reappear
    // from an in-memory copy.
    mockSetItem.mockImplementation(async (_k, v) => {
      store = v;
    });
    expect(await offlineQueue.getPending('user-1')).toEqual([]);
  });

  it('enqueue() aborts without writing when the existing queue cannot be read', async () => {
    const { offlineQueue } = offlineQueueModule;
    store = encodeQueue([q('keep', 'user-1', 1)]);
    mockGetItem.mockRejectedValueOnce(new Error('read failed'));

    await expect(offlineQueue.enqueue(makeItem())).rejects.toThrow('read failed');

    expect(mockSetItem).not.toHaveBeenCalled();
    expect(decodeQueue(store!).map((i: { id: string }) => i.id)).toEqual(['keep']);
  });

  it('remove() aborts without writing when the queue cannot be read', async () => {
    const { offlineQueue } = offlineQueueModule;
    store = encodeQueue([q('keep', 'user-1', 1)]);
    mockGetItem.mockRejectedValueOnce(new Error('read failed'));

    await expect(offlineQueue.remove('keep')).rejects.toThrow('read failed');
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  it('clearUser() removes the storage key when the write fails and nothing else is queued', async () => {
    const { offlineQueue } = offlineQueueModule;
    store = encodeQueue([q('a1', 'A', 1)]);
    mockSetItem.mockRejectedValue(new Error('disk full'));

    await expect(offlineQueue.clearUser('A')).resolves.toBeUndefined();

    expect(mockRemoveItem).toHaveBeenCalledTimes(1);
    expect(store).toBeNull();
    // A fresh load must not bring the cleared data back.
    expect(await offlineQueue.getPending('A')).toEqual([]);
  });

  it('clearUser() rejects when the write fails and other users still have items', async () => {
    const { offlineQueue } = offlineQueueModule;
    store = encodeQueue([q('a1', 'A', 1), q('b1', 'B', 2)]);
    mockSetItem.mockRejectedValue(new Error('disk full'));

    await expect(offlineQueue.clearUser('A')).rejects.toThrow('disk full');

    expect(mockRemoveItem).not.toHaveBeenCalled();
  });

  it('clearUser() rejects when both the write and the key removal fail', async () => {
    const { offlineQueue } = offlineQueueModule;
    store = encodeQueue([q('a1', 'A', 1)]);
    mockSetItem.mockRejectedValue(new Error('disk full'));
    mockRemoveItem.mockRejectedValue(new Error('remove failed'));

    await expect(offlineQueue.clearUser('A')).rejects.toThrow();
  });

  it('clearUser() aborts without writing when the queue cannot be read', async () => {
    const { offlineQueue } = offlineQueueModule;
    store = encodeQueue([q('a1', 'A', 1), q('b1', 'B', 2)]);
    mockGetItem.mockRejectedValueOnce(new Error('read failed'));

    await expect(offlineQueue.clearUser('A')).rejects.toThrow('read failed');

    expect(mockSetItem).not.toHaveBeenCalled();
    expect(mockRemoveItem).not.toHaveBeenCalled();
    expect(decodeQueue(store!)).toHaveLength(2);
  });

  it('getPending() falls back to the last known queue when the read fails, and reports it', async () => {
    const { offlineQueue } = offlineQueueModule;
    await offlineQueue.enqueue(makeItem());
    mockGetItem.mockRejectedValue(new Error('read failed'));

    const pending = await offlineQueue.getPending('user-1');

    expect(pending).toHaveLength(1);
    expect(mockLogException).toHaveBeenCalled();
  });

  it('flush() rejects without replaying anything when the queue cannot be read', async () => {
    const { offlineQueue } = offlineQueueModule;
    await offlineQueue.enqueue(makeItem());
    mockGetItem.mockRejectedValue(new Error('read failed'));
    const logFn = jest.fn();

    await expect(offlineQueue.flush(logFn, 'user-1')).rejects.toThrow('read failed');
    expect(logFn).not.toHaveBeenCalled();
  });

  it('flush() rejects (and reports) when the final write fails', async () => {
    const { offlineQueue } = offlineQueueModule;
    store = encodeQueue([q('a1', 'A', 1)]);
    mockSetItem.mockRejectedValue(new Error('disk full'));
    const logFn = jest.fn().mockResolvedValue(undefined);

    await expect(offlineQueue.flush(logFn, 'A')).rejects.toThrow('disk full');

    expect(logFn).toHaveBeenCalledTimes(1);
    expect(mockLogException).toHaveBeenCalled();
  });

  it('emergencyWipe() removes the storage key without taking the lock', async () => {
    const { offlineQueue } = offlineQueueModule;
    store = encodeQueue([q('a1', 'A', 1)]);

    await offlineQueue.emergencyWipe();

    expect(mockRemoveItem).toHaveBeenCalledTimes(1);
    expect(store).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — flush racing clearUser / other writers (stateful fake storage)
// ---------------------------------------------------------------------------

describe('ActivityOfflineQueue — flush concurrency', () => {
  let offlineQueueModule: typeof import('../offlineQueue');
  let store: string | null;

  const stored = (): Array<{ id: string; ownerUid: string; retryCount: number }> =>
    store ? decodeQueue(store) : [];

  const seed = (items: object[]) => {
    store = encodeQueue(items);
  };

  const q = (id: string, ownerUid: string, queuedAt: number, retryCount = 0) => ({
    ...makeItem({ loggedBy: ownerUid, ownerUid }),
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

  beforeEach(async () => {
    store = null;
    mockGetItem.mockReset();
    mockSetItem.mockReset();
    mockRemoveItem.mockReset();
    mockLogException.mockReset();
    mockGetItem.mockImplementation(async () => store);
    mockSetItem.mockImplementation(async (_k, v) => {
      store = v;
    });
    mockRemoveItem.mockResolvedValue(undefined);
    offlineQueueModule = require('../offlineQueue');
    await offlineQueueModule.offlineQueue._resetForTesting();
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
    log.releases[0].reject(new Error('write rejected'));
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
    const bId = await offlineQueue.enqueue(makeItem({ loggedBy: 'B', ownerUid: 'B' }));

    log.releases[0].resolve();
    await tick();
    log.releases[1].resolve();
    const result = await flushing;

    expect(result).toEqual({ synced: 2, retrying: 0, dropped: 0 });
    expect(stored().map((i) => i.id)).toEqual([bId]);
  });

  it('clear by A then enqueue by B then old flush ending leaves only B items', async () => {
    const { offlineQueue } = offlineQueueModule;
    seed([q('a1', 'A', 1), q('a2', 'A', 2), q('a3', 'A', 3)]);
    const log = deferredLogFn();

    const flushing = offlineQueue.flush(log.fn, 'A');
    await tick();
    await offlineQueue.clearUser('A');
    const bId = await offlineQueue.enqueue(makeItem({ loggedBy: 'B', ownerUid: 'B' }));
    log.releases[0].resolve();
    await flushing;

    expect(log.calls).toEqual(['a1']);
    expect(stored().map((i) => i.id)).toEqual([bId]);
  });

  it('a later flush for the same user works after an earlier clear', async () => {
    const { offlineQueue } = offlineQueueModule;
    await offlineQueue.clearUser('A');
    const id = await offlineQueue.enqueue(makeItem({ loggedBy: 'A', ownerUid: 'A' }));
    const logFn = jest.fn().mockResolvedValue(undefined);

    const result = await offlineQueue.flush(logFn, 'A');

    expect(result).toEqual({ synced: 1, retrying: 0, dropped: 0 });
    expect(logFn).toHaveBeenCalledWith(expect.objectContaining({ id }));
    expect(stored()).toEqual([]);
  });

  it('keeps flush semantics: sync removes, failure bumps retryCount, dead-letter drops, others untouched', async () => {
    const { offlineQueue } = offlineQueueModule;
    seed([q('ok', 'A', 1), q('flaky', 'A', 2, 0), q('dead', 'A', 3, 2), q('other', 'B', 4, 1)]);
    const logFn = jest.fn(async (activity: { id: string }) => {
      if (activity.id !== 'ok') {
        throw new Error('write rejected');
      }
    });

    const result = await offlineQueue.flush(logFn, 'A');

    expect(result).toEqual({ synced: 1, retrying: 1, dropped: 1 });
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

  // -------------------------------------------------------------------------
  // Single-flight per user
  // -------------------------------------------------------------------------

  it('two concurrent flushes for one user replay each item exactly once', async () => {
    const { offlineQueue } = offlineQueueModule;
    seed([q('a1', 'A', 1), q('a2', 'A', 2)]);
    const log = deferredLogFn();

    const first = offlineQueue.flush(log.fn, 'A');
    const second = offlineQueue.flush(log.fn, 'A');
    await tick();
    log.releases[0].resolve();
    await tick();
    log.releases[1].resolve();
    const [r1, r2] = await Promise.all([first, second]);

    expect(log.calls).toEqual(['a1', 'a2']);
    expect(r1).toEqual({ synced: 2, retrying: 0, dropped: 0 });
    expect(r2).toEqual(r1);
    expect(stored()).toEqual([]);
  });

  it('flushes for different users do not wait for each other', async () => {
    const { offlineQueue } = offlineQueueModule;
    seed([q('a1', 'A', 1), q('b1', 'B', 2)]);
    const log = deferredLogFn();

    const a = offlineQueue.flush(log.fn, 'A');
    const b = offlineQueue.flush(log.fn, 'B');
    await tick();
    expect(log.calls.sort()).toEqual(['a1', 'b1']);
    log.releases.forEach((r) => r.resolve());
    await Promise.all([a, b]);
  });

  it('a new flush starts normally once the previous one has finished', async () => {
    const { offlineQueue } = offlineQueueModule;
    seed([q('a1', 'A', 1)]);
    const failing = jest.fn().mockRejectedValue(new Error('write rejected'));
    await offlineQueue.flush(failing, 'A');

    const ok = jest.fn().mockResolvedValue(undefined);
    const result = await offlineQueue.flush(ok, 'A');

    expect(ok).toHaveBeenCalledTimes(1);
    expect(result.synced).toBe(1);
  });

  it('_resetForTesting() waits for a running locked section so it cannot write into the next test', async () => {
    const { offlineQueue } = offlineQueueModule;
    let releaseWrite!: () => void;
    mockSetItem.mockImplementation(
      (_k, v) =>
        new Promise<void>((resolve) => {
          releaseWrite = () => {
            store = v;
            resolve();
          };
        }),
    );

    const enqueuing = offlineQueue.enqueue(makeItem());
    await tick();
    const resetting = offlineQueue._resetForTesting();
    releaseWrite();
    await resetting;

    // The write landed before the reset completed, not after it.
    await expect(enqueuing).resolves.toMatch(/^offline_/);
    expect(stored()).toHaveLength(1);
  });
});
