/**
 * Tests for ActivityOfflineQueue and isNetworkError.
 *
 * Because @react-native-async-storage/async-storage is NOT installed in this
 * project, all mocks are declared as virtual mocks so Jest doesn't try to
 * resolve the real package from node_modules.
 */

import { ActivityType } from '../../entities/ActivityModel';

// ---------------------------------------------------------------------------
// Virtual mock for AsyncStorage — installed before any module under test is
// require()'d so that offlineQueue.ts's lazy require() sees our mock.
// ---------------------------------------------------------------------------

const mockGetItem = jest.fn<Promise<string | null>, [string]>();
const mockSetItem = jest.fn<Promise<void>, [string, string]>();

// `{ virtual: true }` tells Jest to create a stand-in module even though the
// real package is absent from node_modules.
jest.mock(
  '@react-native-async-storage/async-storage',
  () => ({
    __esModule: true,
    default: {
      getItem: mockGetItem,
      setItem: mockSetItem,
    },
  }),
  { virtual: true },
);

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
  JSON.stringify(items, (_k, v) =>
    v instanceof Date ? `__DATE__${v.toISOString()}` : v,
  );

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
    const existing = [
      { ...makeItem(), id: 'offline_existing_1', queuedAt: 1000, retryCount: 0 },
    ];
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
    const result = await offlineQueueModule.offlineQueue.flush(logFn);

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

    const result = await offlineQueueModule.offlineQueue.flush(logFn);

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
    const items = [
      { ...makeItem(), id: 'offline_dead', queuedAt: 1000, retryCount: 2 },
    ];
    mockGetItem.mockResolvedValue(encodeQueue(items));

    const logFn = jest.fn().mockRejectedValue(new Error('Persistent failure'));
    const result = await offlineQueueModule.offlineQueue.flush(logFn);

    expect(result.synced).toBe(0);
    expect(result.failed).toBe(1);

    const lastSave = mockSetItem.mock.calls[mockSetItem.mock.calls.length - 1][1];
    expect(JSON.parse(lastSave)).toHaveLength(0);
  });

  it('flush() returns { synced: 0, failed: 0 } when queue is empty', async () => {
    mockGetItem.mockResolvedValue(null);
    const logFn = jest.fn();
    const result = await offlineQueueModule.offlineQueue.flush(logFn);

    expect(logFn).not.toHaveBeenCalled();
    expect(result).toEqual({ synced: 0, failed: 0 });
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — Queue WITHOUT AsyncStorage (in-memory fallback)
// ---------------------------------------------------------------------------

describe('ActivityOfflineQueue — without AsyncStorage (in-memory fallback)', () => {
  let offlineQueueModule: typeof import('../offlineQueue');

  beforeAll(() => {
    // Override the virtual mock so that require() of async-storage throws,
    // simulating the package being absent.
    jest.doMock(
      '@react-native-async-storage/async-storage',
      () => {
        throw new Error('Module not found');
      },
      { virtual: true },
    );

    // Force a fresh require so offlineQueue.ts re-runs its lazy storage check.
    jest.resetModules();

    // Re-register the virtual mock AFTER resetModules.
    jest.doMock(
      '@react-native-async-storage/async-storage',
      () => {
        throw new Error('Module not found');
      },
      { virtual: true },
    );

    offlineQueueModule = require('../offlineQueue');
    offlineQueueModule.offlineQueue._resetForTesting();
  });

  afterAll(() => {
    // Restore the normal (working) virtual mock and reset module registry so
    // subsequent test files start clean.
    jest.resetModules();
    jest.doMock(
      '@react-native-async-storage/async-storage',
      () => ({
        __esModule: true,
        default: { getItem: mockGetItem, setItem: mockSetItem },
      }),
      { virtual: true },
    );
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
    const result = await offlineQueueModule.offlineQueue.flush(logFn);

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
