/**
 * logActivity replay / offline fallback: error preservation, idempotent doc id,
 * ownerUid capture and the flushOfflineActivities argument mapping.
 */

import { ActivityType } from '../../entities/ActivityModel';

const mockAdd = jest.fn();
const mockSet = jest.fn();
const mockDocGet = jest.fn();
const mockDoc = jest.fn();
const mockCollection = jest.fn();
const mockRunTransaction = jest.fn();

jest.mock('../../../firebase-setup', () => ({
  firestore: {
    collection: (...a: unknown[]) => mockCollection(...a),
    runTransaction: (...a: unknown[]) => mockRunTransaction(...a),
  },
}));

jest.mock('@react-native-firebase/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => 'SERVER_TS',
    increment: (n: number) => ({ __increment: n }),
    delete: () => '__DELETE__',
  },
  Timestamp: { fromDate: (d: Date) => d },
}));

let mockCurrentUser: { uid?: string } | null = { uid: 'signed-in' };
jest.mock('@react-native-firebase/auth', () => ({
  __esModule: true,
  default: () => ({
    get currentUser() {
      return mockCurrentUser;
    },
  }),
}));

const mockLogException = jest.fn();
jest.mock('../../util/logging', () => ({
  logException: (...a: unknown[]) => mockLogException(...a),
}));

const mockEnqueue = jest.fn();
const mockFlush = jest.fn();
jest.mock('../offlineQueue', () => ({
  ...jest.requireActual('../networkError'),
  offlineQueue: {
    enqueue: (...a: unknown[]) => mockEnqueue(...a),
    flush: (...a: unknown[]) => mockFlush(...a),
  },
}));

import { logActivity, logActivityWithOfflineSupport, flushOfflineActivities } from '../activity';

const data = { type: 'chore' as const, choreType: 'daily', choreName: 'Dishes' };
const when = new Date('2026-01-15T10:00:00.000Z');

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser = { uid: 'signed-in' };
  mockAdd.mockResolvedValue({ id: 'auto-id' });
  mockSet.mockResolvedValue(undefined);
  mockDocGet.mockResolvedValue({ exists: false });
  mockDoc.mockReturnValue({ get: mockDocGet, set: mockSet });
  mockCollection.mockReturnValue({ add: mockAdd, doc: mockDoc });
  mockRunTransaction.mockImplementation(async (fn: any) =>
    fn({ get: async () => ({ exists: false }), set: jest.fn(), update: jest.fn() }),
  );
  mockEnqueue.mockResolvedValue('offline_1');
});

describe('logActivity error preservation', () => {
  it('rethrows the original error so its code survives', async () => {
    const original = Object.assign(new Error('boom'), { code: 'firestore/unavailable' });
    mockAdd.mockRejectedValue(original);

    await expect(logActivity('g', 'h', ActivityType.CHORE, data, 'u', when)).rejects.toBe(original);
    expect(mockLogException).toHaveBeenCalledWith(original);
  });
});

describe('logActivity with a docId (idempotent replay)', () => {
  it('creates the doc under the given id instead of add()', async () => {
    const result = await logActivity('g', 'h', ActivityType.CHORE, data, 'u', when, {
      docId: 'offline_42',
    });

    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockDoc).toHaveBeenCalledWith('offline_42');
    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('offline_42');
  });

  it('does not write the activity again when the doc already exists, but still applies the week summary', async () => {
    mockDocGet.mockResolvedValue({ exists: true });

    await logActivity('g', 'h', ActivityType.CHORE, data, 'u', when, { docId: 'offline_42' });

    expect(mockSet).not.toHaveBeenCalled();
    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
  });
});

describe('logActivityWithOfflineSupport', () => {
  it('queues an add() that rejects with a namespaced firestore/unavailable code', async () => {
    mockAdd.mockRejectedValue({ code: 'firestore/unavailable', message: 'x' });

    const result = await logActivityWithOfflineSupport(
      'g',
      'h',
      ActivityType.CHORE,
      data,
      'u',
      when,
    );

    expect(result).toEqual({ success: false, queued: true, activityId: 'offline_1' });
    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        guestId: 'g',
        loggedBy: 'u',
        ownerUid: 'signed-in',
        timestamp: when,
      }),
    );
  });

  it('rethrows the original network error without queueing when nobody is signed in', async () => {
    mockCurrentUser = null;
    const original = { code: 'firestore/unavailable', message: 'x' };
    mockAdd.mockRejectedValue(original);

    await expect(
      logActivityWithOfflineSupport('g', 'h', ActivityType.CHORE, data, 'u', when),
    ).rejects.toBe(original);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('rethrows the original error when the queue cannot persist the item', async () => {
    const original = { code: 'firestore/unavailable', message: 'x' };
    mockAdd.mockRejectedValue(original);
    mockEnqueue.mockRejectedValue(new Error('disk full'));

    await expect(
      logActivityWithOfflineSupport('g', 'h', ActivityType.CHORE, data, 'u', when),
    ).rejects.toBe(original);
  });

  it('does not queue non-network errors', async () => {
    const denied = { code: 'firestore/permission-denied', message: 'no' };
    mockAdd.mockRejectedValue(denied);

    await expect(
      logActivityWithOfflineSupport('g', 'h', ActivityType.CHORE, data, 'u', when),
    ).rejects.toBe(denied);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});

describe('flushOfflineActivities', () => {
  it('passes the userId to flush and returns its FlushResult', async () => {
    mockFlush.mockResolvedValue({ synced: 1, retrying: 2, dropped: 3 });

    await expect(flushOfflineActivities('uid-9')).resolves.toEqual({
      synced: 1,
      retrying: 2,
      dropped: 3,
    });
    expect(mockFlush).toHaveBeenCalledWith(expect.any(Function), 'uid-9');
  });

  it('replays each item with the right argument order, a Date timestamp and the item id as doc id', async () => {
    mockFlush.mockResolvedValue({ synced: 0, retrying: 0, dropped: 0 });
    await flushOfflineActivities('uid-9');
    const logFn = mockFlush.mock.calls[0][0];

    await logFn({
      id: 'offline_7',
      guestId: 'guest-A',
      houseId: 'house-B',
      type: ActivityType.CHORE,
      data,
      loggedBy: 'logger-C',
      ownerUid: 'uid-9',
      timestamp: when,
      queuedAt: 1,
      retryCount: 0,
    });

    expect(mockDoc).toHaveBeenCalledWith('offline_7');
    const written = mockSet.mock.calls[0][0];
    expect(written).toMatchObject({
      guestId: 'guest-A',
      houseId: 'house-B',
      type: ActivityType.CHORE,
      data,
      loggedBy: 'logger-C',
    });
    expect(written.timestamp).toBeInstanceOf(Date);
    expect(written.timestamp.toISOString()).toBe(when.toISOString());
  });
});
