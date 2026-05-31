/**
 * useWeekSummary Hook Tests
 *
 * Tests for the useWeekSummary hook that subscribes to a Firestore
 * week-summary document and provides pre-aggregated stats.
 */

import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useWeekSummary, getWeekSummaryOnce, useWeekSummaryHistory } from '../useWeekSummary';
import { WeekSummary } from '../../../entities/WeekSummary';

// ── Firestore mock setup ──────────────────────────────────────────────────────

let onSnapshotCallback: ((snapshot: any) => void) | null = null;
let onSnapshotErrorCallback: ((err: Error) => void) | null = null;
const mockUnsubscribe = jest.fn();

// Separate capture for the collection query (useWeekSummaryHistory)
let onQuerySnapshotCallback: ((snapshot: any) => void) | null = null;
let onQuerySnapshotErrorCallback: ((err: Error) => void) | null = null;
const mockQueryUnsubscribe = jest.fn();

// Mock .get() resolver — replaced per test for getWeekSummaryOnce
let mockGetImpl: () => Promise<any> = () => Promise.resolve({ exists: false, data: () => undefined });

const mockDocRef = {
  onSnapshot: jest.fn((success: any, error?: any) => {
    onSnapshotCallback = success;
    onSnapshotErrorCallback = error ?? null;
    return mockUnsubscribe;
  }),
  get: jest.fn(() => mockGetImpl()),
};

// Chained query builder returned by .where() / .orderBy() / .limit()
interface MockQueryRef {
  where: jest.Mock<MockQueryRef>;
  orderBy: jest.Mock<MockQueryRef>;
  limit: jest.Mock<MockQueryRef>;
  onSnapshot: jest.Mock<() => void>;
}

const mockQueryRef: MockQueryRef = {
  where: jest.fn(function () { return mockQueryRef; }),
  orderBy: jest.fn(function () { return mockQueryRef; }),
  limit: jest.fn(function () { return mockQueryRef; }),
  onSnapshot: jest.fn((success: any, error?: any) => {
    onQuerySnapshotCallback = success;
    onQuerySnapshotErrorCallback = error ?? null;
    return mockQueryUnsubscribe;
  }),
};

const mockCollection = {
  doc: jest.fn(() => mockDocRef),
  where: jest.fn(function () { return mockQueryRef; }),
};

jest.mock('../../../../firebase-setup', () => ({
  firestore: {
    collection: jest.fn(() => mockCollection),
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSummary(overrides: Partial<WeekSummary> = {}): WeekSummary {
  return {
    id: 'guest123_2024-01-15',
    guestId: 'guest123',
    houseId: 'house456',
    startDate: '2024-01-15',
    endDate: '2024-01-21',
    stats: {
      choresCompleted: 3,
      meetingsAttended: 2,
      hoursWorked: 16,
      medicationTaken: 7,
      primarySupporterMet: 1,
    },
    dailyStats: {},
    lastUpdated: new Date('2024-01-21T00:00:00Z'),
    activityCount: 13,
    ...overrides,
  };
}

function emitExistingDoc(summary: WeekSummary) {
  onSnapshotCallback?.({
    exists: true,
    data: () => ({
      ...summary,
      lastUpdated: { toDate: () => summary.lastUpdated },
    }),
  });
}

function emitMissingDoc() {
  onSnapshotCallback?.({ exists: false, data: () => undefined });
}

function emitError(err: Error) {
  onSnapshotErrorCallback?.(err);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useWeekSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    onSnapshotCallback = null;
    onSnapshotErrorCallback = null;
    onQuerySnapshotCallback = null;
    onQuerySnapshotErrorCallback = null;
    mockGetImpl = () => Promise.resolve({ exists: false, data: () => undefined });

    mockDocRef.onSnapshot.mockImplementation((success: any, error?: any) => {
      onSnapshotCallback = success;
      onSnapshotErrorCallback = error ?? null;
      return mockUnsubscribe;
    });
    mockDocRef.get.mockImplementation(() => mockGetImpl());

    mockQueryRef.where.mockImplementation(function () { return mockQueryRef; });
    mockQueryRef.orderBy.mockImplementation(function () { return mockQueryRef; });
    mockQueryRef.limit.mockImplementation(function () { return mockQueryRef; });
    mockQueryRef.onSnapshot.mockImplementation((success: any, error?: any) => {
      onQuerySnapshotCallback = success;
      onQuerySnapshotErrorCallback = error ?? null;
      return mockQueryUnsubscribe;
    });

    mockCollection.where.mockImplementation(function () { return mockQueryRef; });
  });

  describe('missing required params', () => {
    it('returns null and loading=false when guestId is missing', async () => {
      const { result } = renderHook(() =>
        useWeekSummary(undefined, 'house456', '2024-01-15')
      );

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.summary).toBeNull();
    });

    it('returns null and loading=false when houseId is missing', async () => {
      const { result } = renderHook(() =>
        useWeekSummary('guest123', undefined, '2024-01-15')
      );

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.summary).toBeNull();
    });

    it('returns null and loading=false when weekStart is empty string', async () => {
      const { result } = renderHook(() =>
        useWeekSummary('guest123', 'house456', '')
      );

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.summary).toBeNull();
    });

    it('does not subscribe to Firestore when params are missing', async () => {
      renderHook(() => useWeekSummary(undefined, 'house456', '2024-01-15'));

      await waitFor(() => expect(mockDocRef.onSnapshot).not.toHaveBeenCalled());
    });
  });

  describe('initial state', () => {
    it('starts with loading=true and summary=null', () => {
      const { result } = renderHook(() =>
        useWeekSummary('guest123', 'house456', '2024-01-15')
      );

      expect(result.current.loading).toBe(true);
      expect(result.current.summary).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  describe('document lookup', () => {
    it('queries the correct document ID: {guestId}_{weekStart}', async () => {
      renderHook(() =>
        useWeekSummary('guest123', 'house456', '2024-01-15')
      );

      emitMissingDoc();
      await waitFor(() =>
        expect(mockCollection.doc).toHaveBeenCalledWith('guest123_2024-01-15')
      );
    });
  });

  describe('successful data load', () => {
    it('returns summary when document exists', async () => {
      const { result } = renderHook(() =>
        useWeekSummary('guest123', 'house456', '2024-01-15')
      );

      emitExistingDoc(makeSummary());

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.summary).not.toBeNull();
      expect(result.current.summary?.guestId).toBe('guest123');
    });

    it('returns null when document does not exist', async () => {
      const { result } = renderHook(() =>
        useWeekSummary('guest123', 'house456', '2024-01-15')
      );

      emitMissingDoc();

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.summary).toBeNull();
    });

    it('returns correct stats from summary', async () => {
      const { result } = renderHook(() =>
        useWeekSummary('guest123', 'house456', '2024-01-15')
      );

      emitExistingDoc(makeSummary({
        stats: {
          choresCompleted: 5,
          meetingsAttended: 3,
          hoursWorked: 40,
          medicationTaken: 7,
          primarySupporterMet: 1,
        },
      }));

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.summary?.stats.choresCompleted).toBe(5);
      expect(result.current.summary?.stats.meetingsAttended).toBe(3);
      expect(result.current.summary?.stats.hoursWorked).toBe(40);
    });

    it('converts Firestore lastUpdated timestamp to Date', async () => {
      const { result } = renderHook(() =>
        useWeekSummary('guest123', 'house456', '2024-01-15')
      );

      emitExistingDoc(makeSummary());

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.summary?.lastUpdated).toBeInstanceOf(Date);
    });

    it('updates summary when snapshot changes (real-time)', async () => {
      const { result } = renderHook(() =>
        useWeekSummary('guest123', 'house456', '2024-01-15')
      );

      emitExistingDoc(makeSummary({
        stats: {
          choresCompleted: 1,
          meetingsAttended: 0,
          hoursWorked: 0,
          medicationTaken: 0,
          primarySupporterMet: 0,
        },
      }));
      await waitFor(() => expect(result.current.summary?.stats.choresCompleted).toBe(1));

      // Simulate real-time update
      emitExistingDoc(makeSummary({
        stats: {
          choresCompleted: 2,
          meetingsAttended: 1,
          hoursWorked: 8,
          medicationTaken: 0,
          primarySupporterMet: 0,
        },
      }));
      await waitFor(() => expect(result.current.summary?.stats.choresCompleted).toBe(2));
      expect(result.current.summary?.stats.meetingsAttended).toBe(1);
    });
  });

  describe('error handling', () => {
    it('sets error state when Firestore throws', async () => {
      const { result } = renderHook(() =>
        useWeekSummary('guest123', 'house456', '2024-01-15')
      );

      const testError = new Error('Permission denied');
      emitError(testError);

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.error).toBe(testError);
      expect(result.current.summary).toBeNull();
    });

    it('does not call console.error when Firestore subscription fails', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderHook(() =>
        useWeekSummary('guest123', 'house456', '2024-01-15')
      );

      act(() => {
        onSnapshotErrorCallback?.(new Error('permission-denied'));
      });

      await waitFor(() => expect(result.current.error).not.toBeNull());
      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('cleanup', () => {
    it('calls unsubscribe on unmount', async () => {
      const { result, unmount } = renderHook(() =>
        useWeekSummary('guest123', 'house456', '2024-01-15')
      );

      emitExistingDoc(makeSummary());
      await waitFor(() => expect(result.current.loading).toBe(false));

      unmount();
      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });

  describe('refetch', () => {
    it('exposes a refetch function', async () => {
      const { result } = renderHook(() =>
        useWeekSummary('guest123', 'house456', '2024-01-15')
      );

      emitMissingDoc();
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(typeof result.current.refetch).toBe('function');
    });
  });

  describe('Timestamp conversion', () => {
    it('sets lastUpdated to null when toDate() returns null', async () => {
      const { result } = renderHook(() =>
        useWeekSummary('guest123', 'house456', '2024-01-15')
      );

      act(() => {
        onSnapshotCallback?.({
          exists: true,
          data: () => ({
            ...makeSummary(),
            lastUpdated: { toDate: () => null },
          }),
        });
      });

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.summary?.lastUpdated).toBeNull();
    });

    it('leaves lastUpdated as-is when it is already a string', async () => {
      const { result } = renderHook(() =>
        useWeekSummary('guest123', 'house456', '2024-01-15')
      );

      act(() => {
        onSnapshotCallback?.({
          exists: true,
          data: () => ({
            ...makeSummary(),
            lastUpdated: '2024-01-21T00:00:00.000Z',
          }),
        });
      });

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.summary?.lastUpdated).toBe('2024-01-21T00:00:00.000Z');
    });
  });
});

// ── getWeekSummaryOnce tests ───────────────────────────────────────────────────

describe('getWeekSummaryOnce', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetImpl = () => Promise.resolve({ exists: false, data: () => undefined });
    mockDocRef.get.mockImplementation(() => mockGetImpl());
    mockDocRef.onSnapshot.mockImplementation((success: any, error?: any) => {
      onSnapshotCallback = success;
      onSnapshotErrorCallback = error ?? null;
      return mockUnsubscribe;
    });
    mockQueryRef.where.mockImplementation(function () { return mockQueryRef; });
    mockQueryRef.orderBy.mockImplementation(function () { return mockQueryRef; });
    mockQueryRef.limit.mockImplementation(function () { return mockQueryRef; });
    mockQueryRef.onSnapshot.mockImplementation((success: any, error?: any) => {
      onQuerySnapshotCallback = success;
      onQuerySnapshotErrorCallback = error ?? null;
      return mockQueryUnsubscribe;
    });
    mockCollection.where.mockImplementation(function () { return mockQueryRef; });
  });

  describe('Timestamp conversion - getWeekSummaryOnce', () => {
    it('returns the converted Date when toDate() returns a valid Date', async () => {
      const expectedDate = new Date('2024-01-21T00:00:00Z');
      mockGetImpl = () =>
        Promise.resolve({
          exists: true,
          data: () => ({
            ...makeSummary({ lastUpdated: expectedDate }),
            lastUpdated: { toDate: () => expectedDate },
          }),
        });
      mockDocRef.get.mockImplementation(() => mockGetImpl());

      const result = await getWeekSummaryOnce('guest123', 'house456', '2024-01-15');

      expect(result).not.toBeNull();
      expect(result?.lastUpdated).toBeInstanceOf(Date);
      expect(result?.lastUpdated).toEqual(expectedDate);
    });

    it('sets lastUpdated to null when toDate() returns null', async () => {
      mockGetImpl = () =>
        Promise.resolve({
          exists: true,
          data: () => ({
            ...makeSummary(),
            lastUpdated: { toDate: () => null },
          }),
        });
      mockDocRef.get.mockImplementation(() => mockGetImpl());

      const result = await getWeekSummaryOnce('guest123', 'house456', '2024-01-15');

      expect(result).not.toBeNull();
      expect(result?.lastUpdated).toBeNull();
    });

    it('sets lastUpdated to null when toDate() returns an invalid Date', async () => {
      mockGetImpl = () =>
        Promise.resolve({
          exists: true,
          data: () => ({
            ...makeSummary(),
            lastUpdated: { toDate: () => new Date('not-a-date') },
          }),
        });
      mockDocRef.get.mockImplementation(() => mockGetImpl());

      const result = await getWeekSummaryOnce('guest123', 'house456', '2024-01-15');

      expect(result).not.toBeNull();
      expect(result?.lastUpdated).toBeNull();
    });

    it('leaves lastUpdated as-is when it is already a string', async () => {
      const dateString = '2024-01-21T00:00:00.000Z';
      mockGetImpl = () =>
        Promise.resolve({
          exists: true,
          data: () => ({
            ...makeSummary(),
            lastUpdated: dateString,
          }),
        });
      mockDocRef.get.mockImplementation(() => mockGetImpl());

      const result = await getWeekSummaryOnce('guest123', 'house456', '2024-01-15');

      expect(result).not.toBeNull();
      expect(result?.lastUpdated).toBe(dateString);
    });

    it('returns null when the document does not exist', async () => {
      mockGetImpl = () =>
        Promise.resolve({ exists: false, data: () => undefined });
      mockDocRef.get.mockImplementation(() => mockGetImpl());

      const result = await getWeekSummaryOnce('guest123', 'house456', '2024-01-15');

      expect(result).toBeNull();
    });
  });
});

// ── useWeekSummaryHistory tests ───────────────────────────────────────────────

describe('useWeekSummaryHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    onSnapshotCallback = null;
    onSnapshotErrorCallback = null;
    onQuerySnapshotCallback = null;
    onQuerySnapshotErrorCallback = null;
    mockGetImpl = () => Promise.resolve({ exists: false, data: () => undefined });

    mockDocRef.onSnapshot.mockImplementation((success: any, error?: any) => {
      onSnapshotCallback = success;
      onSnapshotErrorCallback = error ?? null;
      return mockUnsubscribe;
    });
    mockDocRef.get.mockImplementation(() => mockGetImpl());

    mockQueryRef.where.mockImplementation(function () { return mockQueryRef; });
    mockQueryRef.orderBy.mockImplementation(function () { return mockQueryRef; });
    mockQueryRef.limit.mockImplementation(function () { return mockQueryRef; });
    mockQueryRef.onSnapshot.mockImplementation((success: any, error?: any) => {
      onQuerySnapshotCallback = success;
      onQuerySnapshotErrorCallback = error ?? null;
      return mockQueryUnsubscribe;
    });

    mockCollection.where.mockImplementation(function () { return mockQueryRef; });
  });

  describe('Timestamp conversion - useWeekSummaryHistory', () => {
    it('converts valid Firestore Timestamps to Date objects across all docs', async () => {
      const expectedDate = new Date('2024-01-21T00:00:00Z');

      const { result } = renderHook(() =>
        useWeekSummaryHistory('guest123', 'house456')
      );

      act(() => {
        onQuerySnapshotCallback?.({
          docs: [
            {
              data: () => ({
                ...makeSummary(),
                lastUpdated: { toDate: () => expectedDate },
              }),
            },
          ],
        });
      });

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.summaries[0].lastUpdated).toBeInstanceOf(Date);
      expect(result.current.summaries[0].lastUpdated).toEqual(expectedDate);
    });

    it('sets lastUpdated to null when toDate() returns null', async () => {
      const { result } = renderHook(() =>
        useWeekSummaryHistory('guest123', 'house456')
      );

      act(() => {
        onQuerySnapshotCallback?.({
          docs: [
            {
              data: () => ({
                ...makeSummary(),
                lastUpdated: { toDate: () => null },
              }),
            },
          ],
        });
      });

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.summaries[0].lastUpdated).toBeNull();
    });

    it('sets lastUpdated to null when toDate() returns an invalid Date', async () => {
      const { result } = renderHook(() =>
        useWeekSummaryHistory('guest123', 'house456')
      );

      act(() => {
        onQuerySnapshotCallback?.({
          docs: [
            {
              data: () => ({
                ...makeSummary(),
                lastUpdated: { toDate: () => new Date('not-a-date') },
              }),
            },
          ],
        });
      });

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.summaries[0].lastUpdated).toBeNull();
    });

    it('leaves lastUpdated as-is when it is already a string', async () => {
      const dateString = '2024-01-21T00:00:00.000Z';

      const { result } = renderHook(() =>
        useWeekSummaryHistory('guest123', 'house456')
      );

      act(() => {
        onQuerySnapshotCallback?.({
          docs: [
            {
              data: () => ({
                ...makeSummary(),
                lastUpdated: dateString,
              }),
            },
          ],
        });
      });

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.summaries[0].lastUpdated).toBe(dateString);
    });

    it('handles multiple docs with mixed Timestamp states', async () => {
      const validDate = new Date('2024-01-21T00:00:00Z');

      const { result } = renderHook(() =>
        useWeekSummaryHistory('guest123', 'house456')
      );

      act(() => {
        onQuerySnapshotCallback?.({
          docs: [
            {
              data: () => ({
                ...makeSummary({ startDate: '2024-01-15' }),
                lastUpdated: { toDate: () => validDate },
              }),
            },
            {
              data: () => ({
                ...makeSummary({ startDate: '2024-01-08' }),
                lastUpdated: { toDate: () => null },
              }),
            },
            {
              data: () => ({
                ...makeSummary({ startDate: '2024-01-01' }),
                lastUpdated: { toDate: () => new Date('bad') },
              }),
            },
          ],
        });
      });

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.summaries).toHaveLength(3);
      expect(result.current.summaries[0].lastUpdated).toEqual(validDate);
      expect(result.current.summaries[1].lastUpdated).toBeNull();
      expect(result.current.summaries[2].lastUpdated).toBeNull();
    });

    it('returns empty array and loading=false when guestId is missing', async () => {
      const { result } = renderHook(() =>
        useWeekSummaryHistory(undefined, 'house456')
      );

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.summaries).toEqual([]);
    });

    it('returns empty array and loading=false when houseId is missing', async () => {
      const { result } = renderHook(() =>
        useWeekSummaryHistory('guest123', undefined)
      );

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.summaries).toEqual([]);
    });
  });
});
