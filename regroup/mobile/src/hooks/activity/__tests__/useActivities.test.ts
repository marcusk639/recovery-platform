/**
 * useActivities Hook Tests
 *
 * Tests for the useActivities hook that subscribes to Firestore activity data.
 * Firestore onSnapshot is mocked to call its callback synchronously.
 */

import { renderHook, waitFor, act } from '@testing-library/react-native';
import { ActivityType, ActivityStatus } from '../../../entities/ActivityModel';
import { useActivities, useActivityCount } from '../useActivities';

// ── Firestore mock setup ──────────────────────────────────────────────────────

let onSnapshotCallback: ((snapshot: any) => void) | null = null;
let onSnapshotErrorCallback: ((err: Error) => void) | null = null;
const mockUnsubscribe = jest.fn();

const mockQuery = {
  where: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  onSnapshot: jest.fn((success: any, error?: any) => {
    onSnapshotCallback = success;
    onSnapshotErrorCallback = error ?? null;
    return mockUnsubscribe;
  }),
};

jest.mock('../../../../firebase-setup', () => ({
  firestore: {
    collection: jest.fn(() => mockQuery),
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeActivity(overrides: Record<string, any> = {}) {
  return {
    id: 'act1',
    guestId: 'guest123',
    houseId: 'house456',
    type: ActivityType.CHORE,
    status: ActivityStatus.ACTIVE,
    timestamp: { toDate: () => new Date('2024-01-15T10:00:00Z') },
    loggedAt: { toDate: () => new Date('2024-01-15T10:00:00Z') },
    data: { type: 'chore', choreType: 'daily', choreName: 'Kitchen' },
    loggedBy: 'user789',
    verified: false,
    ...overrides,
  };
}

function makeSnapshot(docs: any[]) {
  return {
    docs: docs.map((data) => ({
      id: data.id,
      data: () => data,
    })),
  };
}

function emitSnapshot(docs: any[]) {
  onSnapshotCallback?.(makeSnapshot(docs));
}

function emitError(err: Error) {
  onSnapshotErrorCallback?.(err);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useActivities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    onSnapshotCallback = null;
    onSnapshotErrorCallback = null;
    mockQuery.where.mockReturnThis();
    mockQuery.orderBy.mockReturnThis();
    mockQuery.limit.mockReturnThis();
    mockQuery.onSnapshot.mockImplementation((success: any, error?: any) => {
      onSnapshotCallback = success;
      onSnapshotErrorCallback = error ?? null;
      return mockUnsubscribe;
    });
  });

  describe('initial state', () => {
    it('starts with loading=true and empty activities', () => {
      const { result } = renderHook(() =>
        useActivities({ guestId: 'guest123', houseId: 'house456' })
      );

      expect(result.current.loading).toBe(true);
      expect(result.current.activities).toEqual([]);
      expect(result.current.error).toBeNull();
    });
  });

  describe('successful data load', () => {
    it('returns activities after snapshot fires', async () => {
      const { result } = renderHook(() =>
        useActivities({ guestId: 'guest123', houseId: 'house456' })
      );

      emitSnapshot([makeActivity()]);

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.activities).toHaveLength(1);
      expect(result.current.activities[0].guestId).toBe('guest123');
    });

    it('converts Firestore timestamps to Date objects', async () => {
      const { result } = renderHook(() =>
        useActivities({ guestId: 'guest123' })
      );

      emitSnapshot([makeActivity()]);

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.activities[0].timestamp).toBeInstanceOf(Date);
      expect(result.current.activities[0].loggedAt).toBeInstanceOf(Date);
    });

    it('returns empty array when snapshot has no docs', async () => {
      const { result } = renderHook(() =>
        useActivities({ guestId: 'guest123' })
      );

      emitSnapshot([]);

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.activities).toEqual([]);
    });

    it('returns multiple activities', async () => {
      const { result } = renderHook(() =>
        useActivities({ houseId: 'house456' })
      );

      emitSnapshot([
        makeActivity({ id: 'act1', type: ActivityType.CHORE }),
        makeActivity({ id: 'act2', type: ActivityType.MEETING }),
        makeActivity({ id: 'act3', type: ActivityType.WORK }),
      ]);

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.activities).toHaveLength(3);
    });
  });

  describe('query building', () => {
    it('applies guestId filter when provided', async () => {
      renderHook(() => useActivities({ guestId: 'guest123' }));

      emitSnapshot([]);
      await waitFor(() => expect(mockQuery.where).toHaveBeenCalledWith('guestId', '==', 'guest123'));
    });

    it('applies houseId filter when provided', async () => {
      renderHook(() => useActivities({ houseId: 'house456' }));

      emitSnapshot([]);
      await waitFor(() => expect(mockQuery.where).toHaveBeenCalledWith('houseId', '==', 'house456'));
    });

    it('applies type filter when provided', async () => {
      renderHook(() => useActivities({ guestId: 'guest123', type: ActivityType.MEETING }));

      emitSnapshot([]);
      await waitFor(() =>
        expect(mockQuery.where).toHaveBeenCalledWith('type', '==', ActivityType.MEETING)
      );
    });

    it('applies status filter when provided', async () => {
      renderHook(() =>
        useActivities({ guestId: 'guest123', status: ActivityStatus.DISPUTED })
      );

      emitSnapshot([]);
      await waitFor(() =>
        expect(mockQuery.where).toHaveBeenCalledWith('status', '==', ActivityStatus.DISPUTED)
      );
    });

    it('applies limit to query', async () => {
      renderHook(() => useActivities({ guestId: 'guest123', limit: 25 }));

      emitSnapshot([]);
      await waitFor(() => expect(mockQuery.limit).toHaveBeenCalledWith(25));
    });

    it('uses default limit of 100 when not specified', async () => {
      renderHook(() => useActivities({ guestId: 'guest123' }));

      emitSnapshot([]);
      await waitFor(() => expect(mockQuery.limit).toHaveBeenCalledWith(100));
    });

    it('applies startDate filter when provided', async () => {
      const startDate = '2024-01-15';
      renderHook(() => useActivities({ guestId: 'guest123', startDate }));

      emitSnapshot([]);
      await waitFor(() =>
        expect(mockQuery.where).toHaveBeenCalledWith(
          'timestamp', '>=', expect.any(Date)
        )
      );
    });
  });

  describe('missing required params', () => {
    it('subscribes even without guestId (house-level query)', async () => {
      const { result } = renderHook(() => useActivities({ houseId: 'house456' }));

      emitSnapshot([]);
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.activities).toEqual([]);
    });

    it('subscribes with no filters (returns all)', async () => {
      const { result } = renderHook(() => useActivities());

      emitSnapshot([]);
      await waitFor(() => expect(result.current.loading).toBe(false));
    });
  });

  describe('error handling', () => {
    it('sets error state when Firestore throws', async () => {
      const { result } = renderHook(() =>
        useActivities({ guestId: 'guest123' })
      );

      const testError = new Error('Firestore unavailable');
      emitError(testError);

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.error).toBe(testError);
      expect(result.current.activities).toEqual([]);
    });
  });

  describe('cleanup', () => {
    it('calls unsubscribe on unmount', async () => {
      const { result, unmount } = renderHook(() =>
        useActivities({ guestId: 'guest123' })
      );

      emitSnapshot([]);
      await waitFor(() => expect(result.current.loading).toBe(false));

      unmount();
      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });

  describe('refetch', () => {
    it('exposes a refetch function', async () => {
      const { result } = renderHook(() =>
        useActivities({ guestId: 'guest123' })
      );

      emitSnapshot([]);
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(typeof result.current.refetch).toBe('function');
    });
  });

  describe('Firestore error callback', () => {
    it('does not call console.error when the Firestore subscription fails', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderHook(() =>
        useActivities({ guestId: 'guest123', houseId: 'house456' })
      );

      act(() => {
        onSnapshotErrorCallback?.(new Error('permission-denied'));
      });

      await waitFor(() => expect(result.current.error).not.toBeNull());
      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('does not call console.error when useActivityCount subscription fails', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderHook(() =>
        useActivityCount({ guestId: 'guest123', houseId: 'house456' })
      );

      act(() => {
        onSnapshotErrorCallback?.(new Error('permission-denied'));
      });

      await waitFor(() => expect(result.current.error).not.toBeNull());
      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});
