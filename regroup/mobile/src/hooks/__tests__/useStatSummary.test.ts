/**
 * useStatSummary Hook Tests
 *
 * Verifies that:
 * 1. Current-week stat values are sourced from WeekSummary ('week-summaries' collection)
 * 2. Bar graph data is sourced from useWeekSummaryHistory ('week-summaries' collection)
 * 3. No reads from the legacy 'guest-reports' Firestore collection occur
 *
 * Strategy: mock the activity hooks directly (useWeekSummary, useWeekSummaryHistory,
 * useActivityCount, useCurrentWeek) rather than Firestore internals, which avoids
 * jest.mock hoisting / temporal dead zone issues with const declarations.
 */

// ─── useSelectedHouse / useSelectedGuest mocks ───────────────────────────────
const mockUseSelectedHouse = jest.fn();
const mockUseSelectedGuest = jest.fn();

jest.mock('../useSelectedHouse', () => ({
  useSelectedHouse: () => mockUseSelectedHouse(),
}));
jest.mock('../useSelectedGuest', () => ({
  useSelectedGuest: () => mockUseSelectedGuest(),
}));

import { renderHook } from '@testing-library/react-native';
import { WeekSummary } from '../../entities/WeekSummary';
import { ActivityStatus } from '../../entities/ActivityModel';

// ── Redux mock ────────────────────────────────────────────────────────────────

const mockGuest = {
  id: 'guest123',
  userId: 'user-abc',
  phase: 1,
  step: 3,
  firstName: 'Test',
  lastName: 'Guest',
  currentChore: 'Kitchen',
};

const mockHouse = {
  id: 'house456',
  phases: {
    '1': {
      rules: {
        meeting: 3,
        hoursWorked: 20,
        choreCompleted: 1,
        medication: 7,
        metPrimarySupporter: 1,
      },
    },
  },
};

const mockUser = { id: 'user-abc', isAdmin: false };

jest.mock('../../state/store', () => ({
  useAppSelector: jest.fn(),
  useAppDispatch: () => jest.fn(),
}));

// ── Activity hook mocks ───────────────────────────────────────────────────────
// Mock the hooks useStatSummary depends on. This avoids low-level Firestore
// hoisting issues and tests the hook's data-mapping logic cleanly.

const mockUseWeekSummary = jest.fn();
const mockUseWeekSummaryHistory = jest.fn();
const mockUseActivityCount = jest.fn();
const mockUseCurrentWeek = jest.fn();

jest.mock('../activity', () => ({
  useWeekSummary: (...args: unknown[]) => mockUseWeekSummary(...args),
  useWeekSummaryHistory: (...args: unknown[]) =>
    mockUseWeekSummaryHistory(...args),
  useActivityCount: (...args: unknown[]) => mockUseActivityCount(...args),
  useCurrentWeek: (...args: unknown[]) => mockUseCurrentWeek(...args),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWeekSummary(
  overrides: Partial<WeekSummary['stats']> = {},
): WeekSummary {
  return {
    id: 'guest123_2024-01-15',
    guestId: 'guest123',
    houseId: 'house456',
    startDate: '2024-01-15',
    endDate: '2024-01-21',
    stats: {
      choresCompleted: 1,
      meetingsAttended: 2,
      hoursWorked: 16,
      medicationTaken: 7,
      primarySupporterMet: 1,
      ...overrides,
    },
    dailyStats: {},
    lastUpdated: new Date('2024-01-21T00:00:00Z'),
    activityCount: 5,
  };
}

function makeHistorySummaries(
  entries: Array<{ startDate: string; stats: Partial<WeekSummary['stats']> }>,
): WeekSummary[] {
  return entries.map(e => ({
    ...makeWeekSummary(e.stats),
    startDate: e.startDate,
  }));
}

// ── Setup ─────────────────────────────────────────────────────────────────────

const { useAppSelector } = require('../../state/store');

beforeEach(() => {
  jest.clearAllMocks();

  useAppSelector.mockImplementation((selector: any) => {
    const state = {
      guests: { selectedGuest: mockGuest },
      houses: { selectedHouse: mockHouse },
      user: { user: mockUser },
    };
    return selector(state);
  });

  mockUseSelectedHouse.mockReturnValue({
    house: mockHouse,
    houseId: mockHouse.id,
    isLoading: false,
  });
  mockUseSelectedGuest.mockReturnValue({
    guest: mockGuest,
    guestId: mockGuest.id,
    isLoading: false,
  });

  mockUseCurrentWeek.mockReturnValue({
    startDate: '2024-01-15',
    endDate: '2024-01-21',
  });

  // Default: no data, not loading
  mockUseWeekSummary.mockReturnValue({
    summary: null,
    loading: false,
    error: null,
    refetch: jest.fn(),
  });
  mockUseWeekSummaryHistory.mockReturnValue({
    summaries: [],
    loading: false,
    error: null,
  });
  mockUseActivityCount.mockReturnValue({ count: 0, loading: false });
});

// ── Import hook after all mocks are in place ──────────────────────────────────
import { useStatSummary } from '../useStatSummary';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useStatSummary', () => {
  describe('current week stat values sourced from week-summaries collection', () => {
    it('returns meetingsAttended from WeekSummary for the "meeting" stat', () => {
      mockUseWeekSummary.mockReturnValue({
        summary: makeWeekSummary({ meetingsAttended: 3 }),
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useStatSummary('meeting'));
      expect(result.current.statSum).toBe(3);
    });

    it('returns hoursWorked from WeekSummary for the "hoursWorked" stat', () => {
      mockUseWeekSummary.mockReturnValue({
        summary: makeWeekSummary({ hoursWorked: 24 }),
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useStatSummary('hoursWorked'));
      expect(result.current.statSum).toBe(24);
    });

    it('returns choresCompleted from WeekSummary for the "choreCompleted" stat', () => {
      mockUseWeekSummary.mockReturnValue({
        summary: makeWeekSummary({ choresCompleted: 5 }),
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useStatSummary('choreCompleted'));
      expect(result.current.statSum).toBe(5);
    });

    it('returns medicationTaken from WeekSummary for the "medication" stat', () => {
      mockUseWeekSummary.mockReturnValue({
        summary: makeWeekSummary({ medicationTaken: 7 }),
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useStatSummary('medication'));
      expect(result.current.statSum).toBe(7);
    });

    it('returns primarySupporterMet from WeekSummary for the "metPrimarySupporter" stat', () => {
      mockUseWeekSummary.mockReturnValue({
        summary: makeWeekSummary({ primarySupporterMet: 1 }),
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      const { result } = renderHook(() =>
        useStatSummary('metPrimarySupporter'),
      );
      expect(result.current.statSum).toBe(1);
    });

    it('returns 0 when WeekSummary does not exist yet', () => {
      mockUseWeekSummary.mockReturnValue({
        summary: null,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useStatSummary('meeting'));
      expect(result.current.statSum).toBe(0);
    });

    it('is loading while weekSummary is loading', () => {
      mockUseWeekSummary.mockReturnValue({
        summary: null,
        loading: true,
        error: null,
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useStatSummary('meeting'));
      expect(result.current.isLoading).toBe(true);
    });
  });

  describe('bar graph data sourced from week-summaries collection (useWeekSummaryHistory)', () => {
    it('builds graphData from historical WeekSummary documents in oldest-first order', () => {
      // History comes back newest-first (desc); hook reverses them for the chart
      mockUseWeekSummaryHistory.mockReturnValue({
        summaries: makeHistorySummaries([
          { startDate: '2024-01-15', stats: { meetingsAttended: 3 } }, // newest
          { startDate: '2024-01-08', stats: { meetingsAttended: 2 } },
          { startDate: '2024-01-01', stats: { meetingsAttended: 1 } }, // oldest
        ]),
        loading: false,
        error: null,
      });

      const { result } = renderHook(() => useStatSummary('meeting'));

      expect(result.current.graphData).toHaveLength(3);
      expect(result.current.graphData[0].y).toBe(1); // oldest week first in chart
      expect(result.current.graphData[2].y).toBe(3); // newest week last in chart
    });

    it('includes the x-axis label from startDate formatted as MM/DD', () => {
      mockUseWeekSummaryHistory.mockReturnValue({
        summaries: makeHistorySummaries([
          { startDate: '2024-01-15', stats: { choresCompleted: 2 } },
        ]),
        loading: false,
        error: null,
      });

      const { result } = renderHook(() => useStatSummary('choreCompleted'));
      expect(result.current.graphData[0].x).toBe('01/15');
    });

    it('returns empty graphData when no historical summaries exist', () => {
      mockUseWeekSummaryHistory.mockReturnValue({
        summaries: [],
        loading: false,
        error: null,
      });

      const { result } = renderHook(() => useStatSummary('meeting'));
      expect(result.current.graphData).toHaveLength(0);
    });

    it('uses correct stat field from WeekSummary for hoursWorked graph data', () => {
      mockUseWeekSummaryHistory.mockReturnValue({
        summaries: makeHistorySummaries([
          { startDate: '2024-01-15', stats: { hoursWorked: 32 } },
        ]),
        loading: false,
        error: null,
      });

      const { result } = renderHook(() => useStatSummary('hoursWorked'));
      expect(result.current.graphData[0].y).toBe(32);
    });
  });

  describe('legacy guest-reports collection is NOT read', () => {
    it('does not call useWeekSummary with "guest-reports" collection', () => {
      renderHook(() => useStatSummary('meeting'));
      // useWeekSummary reads 'week-summaries', not 'guest-reports'
      // Verify it was called with guestId + startDate (new model params)
      expect(mockUseWeekSummary).toHaveBeenCalledWith(
        'guest123',
        'house456',
        '2024-01-15',
      );
    });

    it('does not call useWeekSummaryHistory with guest-reports params', () => {
      renderHook(() => useStatSummary('meeting'));
      expect(mockUseWeekSummaryHistory).toHaveBeenCalledWith(
        'guest123',
        'house456',
        8,
      );
    });
  });

  describe('disputes sourced from activities collection', () => {
    it('returns disputed activity count from activities collection', () => {
      mockUseActivityCount.mockReturnValue({ count: 2, loading: false });

      const { result } = renderHook(() => useStatSummary('meeting'));
      expect(result.current.disputes).toBe(2);
    });

    it('passes correct status filter to useActivityCount', () => {
      renderHook(() => useStatSummary('meeting'));
      expect(mockUseActivityCount).toHaveBeenCalledWith(
        expect.objectContaining({ status: ActivityStatus.DISPUTED }),
      );
    });

    it('is loading while disputes are loading', () => {
      mockUseActivityCount.mockReturnValue({ count: 0, loading: true });

      const { result } = renderHook(() => useStatSummary('meeting'));
      expect(result.current.isLoading).toBe(true);
    });
  });

  describe('percentage calculation', () => {
    it('returns a numeric percentage value', () => {
      mockUseWeekSummary.mockReturnValue({
        summary: makeWeekSummary({ meetingsAttended: 3 }),
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useStatSummary('meeting'));
      expect(typeof result.current.percentage).toBe('number');
      expect(result.current.percentage).toBeGreaterThanOrEqual(0);
    });
  });

  describe('isError flag', () => {
    it('returns isError=true when useWeekSummary reports an error', () => {
      mockUseWeekSummary.mockReturnValue({
        summary: null,
        loading: false,
        error: new Error('Firestore permission denied'),
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useStatSummary('meeting'));
      expect(result.current.isError).toBe(true);
    });

    it('returns isError=true when useWeekSummaryHistory reports an error', () => {
      mockUseWeekSummaryHistory.mockReturnValue({
        summaries: [],
        loading: false,
        error: new Error('network timeout'),
      });

      const { result } = renderHook(() => useStatSummary('meeting'));
      expect(result.current.isError).toBe(true);
    });

    it('returns isError=false when no hook has an error', () => {
      const { result } = renderHook(() => useStatSummary('meeting'));
      expect(result.current.isError).toBe(false);
    });
  });
});
