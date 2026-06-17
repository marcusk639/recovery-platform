// src/services/__tests__/guest.test.ts
//
// Unit tests for the guest service.
//
// updateGuest uses firestore.runTransaction (not crud.update), so the firestore
// mock must implement runTransaction. The transaction callback receives a mock
// transaction object that supplies .get() and .update().
//
// getGuests calls crud.getByAttribute (returns Guest[]) then passes the array
// through transformGuests (from weeks service) which converts it to a Guests
// key-value map.

// ─── Mocks (hoisted before imports) ─────────────────────────────────────────
//
// NOTE: jest.mock factories are hoisted to the top of the file by Babel/Jest
// before ANY variable declarations execute. Therefore mock factory functions
// must be entirely self-contained — they cannot reference variables declared
// in the module scope. We use jest.fn() inside each factory and retrieve
// references to those mocks via jest.mocked() or by importing the module after
// mocks are set up.

jest.mock('../../../firebase-setup', () => {
  const mockTxGet = jest.fn();
  const mockTxUpdate = jest.fn();
  const mockOnSnapshot = jest.fn();
  const mockDocUpdate = jest.fn().mockResolvedValue(undefined);

  const runTransaction = jest.fn(
    async (callback: (tx: any) => Promise<any>) => {
      return callback({ get: mockTxGet, update: mockTxUpdate });
    },
  );

  const doc = jest.fn(() => ({
    id: 'mock-doc-id',
    onSnapshot: mockOnSnapshot,
    update: mockDocUpdate,
  }));
  const collection = jest.fn(() => ({ doc }));

  const mockBatchUpdate = jest.fn();
  const mockBatchCommit = jest.fn().mockResolvedValue(undefined);
  const batch = jest.fn(() => ({
    update: mockBatchUpdate,
    commit: mockBatchCommit,
  }));

  return {
    firestore: {
      collection,
      runTransaction,
      batch,
      _mockTxGet: mockTxGet,
      _mockTxUpdate: mockTxUpdate,
      _mockOnSnapshot: mockOnSnapshot,
      _mockDocUpdate: mockDocUpdate,
      _mockBatchUpdate: mockBatchUpdate,
      _mockBatchCommit: mockBatchCommit,
    },
  };
});

jest.mock('../crud', () => ({
  get: jest.fn(),
  getByAttribute: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
}));

jest.mock('../house', () => ({
  houseCollection: { doc: jest.fn() },
  getHouse: jest.fn(),
}));

jest.mock('../../util/house', () => ({
  findGuestBed: jest.fn(),
}));

// ─── Imports (after mocks) ───────────────────────────────────────────────────

import { firestore } from '../../../firebase-setup';
import * as crud from '../crud';
import {
  getGuest,
  getGuests,
  getGuestsBlocking,
  updateGuest,
  subscribeToGuest,
  OptimisticLockError,
  dischargeGuest,
  customizePhase,
} from '../guest';
import { Guest } from '../../entities/Guest';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeGuest = (overrides: Partial<Guest> = {}): Guest =>
  ({
    id: 'g1',
    userId: 'u1',
    houseId: 'h1',
    status: 'active',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    version: 0,
    lastUpdated: '2024-01-01T00:00:00.000Z',
    ...overrides,
  } as Guest);

// Convenience accessors for the private tx mocks embedded in the firestore mock
const getTxGet = () => (firestore as any)._mockTxGet as jest.Mock;
const getTxUpdate = () => (firestore as any)._mockTxUpdate as jest.Mock;
const getRunTransaction = () => firestore.runTransaction as jest.Mock;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('guest service', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Restore runTransaction default behaviour after clearAllMocks resets it
    getRunTransaction().mockImplementation(
      async (callback: (tx: any) => Promise<any>) => {
        return callback({ get: getTxGet(), update: getTxUpdate() });
      },
    );
  });

  // ── getGuest ──────────────────────────────────────────────────────────────

  describe('getGuest', () => {
    it('returns the guest returned by crud.get', async () => {
      const guest = makeGuest();
      (crud.get as jest.Mock).mockResolvedValue(guest);

      const result = await getGuest('g1');

      expect(result.id).toBe('g1');
      expect(crud.get).toHaveBeenCalledTimes(1);
      expect(crud.get).toHaveBeenCalledWith(expect.anything(), 'g1');
    });

    it('propagates errors from crud.get', async () => {
      (crud.get as jest.Mock).mockRejectedValue(new Error('Firestore error'));

      await expect(getGuest('g1')).rejects.toThrow('Firestore error');
    });
  });

  // ── getGuests ─────────────────────────────────────────────────────────────

  describe('getGuests', () => {
    it('returns guests as a keyed map when results are found', async () => {
      const guestArray = [makeGuest({ id: 'g1' }), makeGuest({ id: 'g2' })];
      (crud.getByAttribute as jest.Mock).mockResolvedValue(guestArray);

      const result = await getGuests('houseId', 'h1');

      expect(Object.keys(result)).toHaveLength(2);
      expect(result['g1']).toBeDefined();
      expect(result['g2']).toBeDefined();
    });

    it('returns an empty object when no guests are found', async () => {
      (crud.getByAttribute as jest.Mock).mockResolvedValue([]);

      const result = await getGuests('houseId', 'h1');

      expect(result).toEqual({});
    });

    it('calls crud.getByAttribute with the correct attribute, operator, and value', async () => {
      (crud.getByAttribute as jest.Mock).mockResolvedValue([]);

      await getGuests('houseId', 'h1');

      expect(crud.getByAttribute).toHaveBeenCalledWith(
        expect.anything(),
        'houseId',
        '==',
        'h1',
      );
    });
  });

  // ── getGuestsBlocking ─────────────────────────────────────────────────────

  describe('getGuestsBlocking', () => {
    it('returns guests as a keyed map', async () => {
      const guestArray = [makeGuest({ id: 'g1' })];
      (crud.getByAttribute as jest.Mock).mockResolvedValue(guestArray);

      const result = await getGuestsBlocking('houseId', 'h1');

      expect(result['g1']).toBeDefined();
    });

    it('returns an empty object when no guests are found', async () => {
      (crud.getByAttribute as jest.Mock).mockResolvedValue([]);

      const result = await getGuestsBlocking('houseId', 'h1');

      expect(result).toEqual({});
    });
  });

  // ── updateGuest ───────────────────────────────────────────────────────────

  describe('updateGuest', () => {
    it('throws if updatedGuest has no id', async () => {
      await expect(
        updateGuest({ id: 'g1' }, { firstName: 'Jane' }),
      ).rejects.toThrow('Guest must have an id for update');
    });

    it('runs a Firestore transaction', async () => {
      const current = makeGuest({ id: 'g1', version: 2 });
      getTxGet().mockResolvedValue({ exists: true, data: () => current });

      await updateGuest({ id: 'g1' }, { id: 'g1', firstName: 'Jane' });

      expect(getRunTransaction()).toHaveBeenCalledTimes(1);
    });

    it('returns merged guest data from the transaction', async () => {
      const current = makeGuest({ id: 'g1', firstName: 'John', version: 1 });
      getTxGet().mockResolvedValue({ exists: true, data: () => current });

      const result = await updateGuest(
        { id: 'g1' },
        { id: 'g1', firstName: 'Jane' },
      );

      expect((result as Partial<Guest>).firstName).toBe('Jane');
    });

    it('increments the version field', async () => {
      const current = makeGuest({ id: 'g1', version: 5 });
      getTxGet().mockResolvedValue({ exists: true, data: () => current });

      const result = await updateGuest(
        { id: 'g1' },
        { id: 'g1', firstName: 'Jane' },
      );

      expect((result as Partial<Guest>).version).toBe(6);
    });

    it('calls transaction.update with the merged guest', async () => {
      const current = makeGuest({ id: 'g1', version: 0 });
      getTxGet().mockResolvedValue({ exists: true, data: () => current });

      await updateGuest({ id: 'g1' }, { id: 'g1', firstName: 'Jane' });

      expect(getTxUpdate()).toHaveBeenCalledTimes(1);
      expect(getTxUpdate()).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ firstName: 'Jane', id: 'g1' }),
      );
    });

    it('throws if the guest document does not exist', async () => {
      getTxGet().mockResolvedValue({ exists: false, data: () => undefined });

      await expect(
        updateGuest({ id: 'g1' }, { id: 'g1', firstName: 'Jane' }),
      ).rejects.toThrow('Guest g1 not found');
    });

    it('retries on contention errors and eventually rethrows after exhausting attempts', async () => {
      const contentionError: any = new Error('contention detected');
      contentionError.code = 'aborted';

      // Replace the runTransaction mock to always reject with contention
      getRunTransaction().mockRejectedValue(contentionError);

      // With retryCount=2: attempt 0 retries (backoff+continue), attempt 1 exhausts
      // and rethrows the original contention error (not OptimisticLockError —
      // OptimisticLockError is only reached if the loop exits normally without a throw)
      await expect(updateGuest({ id: 'g1' }, { id: 'g1' }, 2)).rejects.toThrow(
        'contention detected',
      );

      // Verify it tried more than once
      expect(getRunTransaction()).toHaveBeenCalledTimes(2);
    });

    it('rethrows non-contention errors immediately', async () => {
      const permissionError: any = new Error('Permission denied');
      permissionError.code = 'permission-denied';

      getRunTransaction().mockRejectedValue(permissionError);

      await expect(updateGuest({ id: 'g1' }, { id: 'g1' }, 3)).rejects.toThrow(
        'Permission denied',
      );
    });
  });

  // ── subscribeToGuest ──────────────────────────────────────────────────────

  describe('subscribeToGuest', () => {
    const getOnSnapshot = () => (firestore as any)._mockOnSnapshot as jest.Mock;

    it('accepts an optional error handler parameter (3rd param)', () => {
      // The function should accept at least 2 declared parameters; with the
      // optional errorHandler added it will have length 2 (optional params
      // do not count toward Function.length in JS), but the signature must
      // accept 3 arguments without TypeScript error.
      expect(subscribeToGuest.length).toBeGreaterThanOrEqual(2);
    });

    it('calls onSnapshot once per subscribeToGuest call', () => {
      const guest = makeGuest({ id: 'g1' });
      const handler = jest.fn();
      getOnSnapshot().mockReturnValue(jest.fn()); // returns an unsubscribe fn

      subscribeToGuest(guest, handler);

      // onSnapshot should have been invoked exactly once for this subscription
      expect(getOnSnapshot()).toHaveBeenCalledTimes(1);
    });

    it('calls the success handler when the snapshot contains a guest', () => {
      const guest = makeGuest({ id: 'g1' });
      const handler = jest.fn();

      // Make onSnapshot immediately invoke the success callback
      getOnSnapshot().mockImplementation((successCb: (snap: any) => void) => {
        successCb({ data: () => guest });
        return jest.fn();
      });

      subscribeToGuest(guest, handler);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(guest);
    });

    it('does not call the success handler when snapshot data is falsy', () => {
      const guest = makeGuest({ id: 'g1' });
      const handler = jest.fn();

      getOnSnapshot().mockImplementation((successCb: (snap: any) => void) => {
        successCb({ data: () => null });
        return jest.fn();
      });

      subscribeToGuest(guest, handler);

      expect(handler).not.toHaveBeenCalled();
    });

    it('calls the provided error handler when onSnapshot fires an error', () => {
      const guest = makeGuest({ id: 'g1' });
      const handler = jest.fn();
      const errorHandler = jest.fn();
      const firestoreError = new Error('Permission denied');

      // onSnapshot receives (successCb, errorCb) — invoke the error callback
      getOnSnapshot().mockImplementation(
        (_successCb: any, errorCb: (err: Error) => void) => {
          errorCb(firestoreError);
          return jest.fn();
        },
      );

      subscribeToGuest(guest, handler, errorHandler);

      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(errorHandler).toHaveBeenCalledWith(firestoreError);
    });

    it('does not throw when no error handler is provided and onSnapshot fires an error', () => {
      const guest = makeGuest({ id: 'g1' });
      const handler = jest.fn();
      const firestoreError = new Error('Network error');

      getOnSnapshot().mockImplementation(
        (_successCb: any, errorCb: (err: Error) => void) => {
          errorCb(firestoreError);
          return jest.fn();
        },
      );

      // Calling without errorHandler must not throw
      expect(() => subscribeToGuest(guest, handler)).not.toThrow();
    });

    it('logs a console.warn on error regardless of whether an error handler is provided', () => {
      const guest = makeGuest({ id: 'g1' });
      const handler = jest.fn();
      const firestoreError = new Error('Snapshot failed');
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      getOnSnapshot().mockImplementation(
        (_successCb: any, errorCb: (err: Error) => void) => {
          errorCb(firestoreError);
          return jest.fn();
        },
      );

      subscribeToGuest(guest, handler);

      expect(warnSpy).toHaveBeenCalledWith(
        '[subscribeToGuest] Subscription error:',
        firestoreError.message,
      );

      warnSpy.mockRestore();
    });

    it('returns the unsubscribe function from onSnapshot', () => {
      const guest = makeGuest({ id: 'g1' });
      const handler = jest.fn();
      const unsubscribe = jest.fn();

      getOnSnapshot().mockReturnValue(unsubscribe);

      const result = subscribeToGuest(guest, handler);

      expect(result).toBe(unsubscribe);
    });
  });

  // ── OptimisticLockError ───────────────────────────────────────────────────

  describe('OptimisticLockError', () => {
    it('is an instance of Error', () => {
      const err = new OptimisticLockError();
      expect(err).toBeInstanceOf(Error);
    });

    it('has the correct name', () => {
      const err = new OptimisticLockError();
      expect(err.name).toBe('OptimisticLockError');
    });

    it('uses the provided message', () => {
      const err = new OptimisticLockError('custom message');
      expect(err.message).toBe('custom message');
    });

    it('has a default message', () => {
      const err = new OptimisticLockError();
      expect(err.message).toBeTruthy();
    });
  });

  // ── dischargeGuest ────────────────────────────────────────────────────────

  describe('dischargeGuest', () => {
    let mockDocUpdate: jest.Mock;

    beforeEach(() => {
      mockDocUpdate = (firestore as any)._mockDocUpdate;
      mockDocUpdate.mockReset();
      mockDocUpdate.mockResolvedValue(undefined);
    });

    it('sets status to discharged and records moveOutDate with server timestamp', async () => {
      await dischargeGuest('guest-1', '2026-05-20', 'admin-note');
      expect(mockDocUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'discharged',
          moveOutDate: '2026-05-20',
          dischargeNotes: 'admin-note',
          updatedAt: expect.anything(),
        }),
      );
    });

    it('omits dischargeNotes when notes is not provided', async () => {
      await dischargeGuest('guest-1', '2026-05-20');
      const call = mockDocUpdate.mock.calls[0][0];
      expect(call).not.toHaveProperty('dischargeNotes');
    });

    it('throws a user-friendly error when Firestore fails', async () => {
      mockDocUpdate.mockRejectedValue(new Error('network'));
      await expect(dischargeGuest('guest-1', '2026-05-20')).rejects.toThrow(
        'Failed to discharge resident',
      );
    });
  });

  describe('customizePhase', () => {
    let mockBatchUpdate: jest.Mock;

    beforeEach(() => {
      mockBatchUpdate = (firestore as any)._mockBatchUpdate;
      mockBatchUpdate.mockReset();
      (firestore as any)._mockBatchCommit.mockClear();
    });

    // Data-loss guard (P0-5): customizePhase must NOT write the whole guest
    // object, or any guest field absent from the in-memory object (userAsGuest
    // is computed, tier/subscription fields, etc.) would be silently dropped.
    it('updates only the guest phase field, never the whole guest object', async () => {
      const guest = makeGuest({
        id: 'g1',
        phase: 'phase-2',
        firstName: 'Jane',
        rentOwed: 12345,
      });
      const house = { id: 'h1', phases: {} } as any;

      await customizePhase(guest, house);

      // First batch.update call is the guest write: (docRef, data).
      const guestUpdateData = mockBatchUpdate.mock.calls[0][1];
      expect(guestUpdateData).toEqual(
        expect.objectContaining({ phase: 'phase-2' }),
      );
      // Must NOT carry unrelated guest fields that would clobber the DB.
      expect(guestUpdateData).not.toHaveProperty('firstName');
      expect(guestUpdateData).not.toHaveProperty('rentOwed');
    });
  });
});
