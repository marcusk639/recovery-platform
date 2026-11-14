/**
 * Reporting Service Tests
 *
 * Tests for getOccupancyReport, getComplianceTrend, getDischargeReport,
 * and the getComplianceWeekStart utility.
 */

// Mock Firebase before importing the service.
// IMPORTANT: All mock variables must be declared INSIDE the factory to avoid
// hoisting-related "Cannot access before initialization" errors.
jest.mock('../../../firebase-setup', () => {
  const mockGet = jest.fn();
  const chainObj: any = {
    where: jest.fn(),
    get: mockGet,
  };
  // Each .where() call returns the same chainable object
  chainObj.where.mockReturnValue(chainObj);

  return {
    firestore: {
      collection: jest.fn(() => chainObj),
    },
    auth: { currentUser: { uid: 'user-1' } },
    __mockGet: mockGet,
    __chainObj: chainObj,
  };
});

jest.mock('../../util/logging', () => ({
  logException: jest.fn(),
}));

import {
  getComplianceWeekStart,
  getOccupancyReport,
  getComplianceTrend,
  getDischargeReport,
} from '../reportingService';
import { Guest } from '../../entities/Guest';
import { WeekSummary } from '../../entities/WeekSummary';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGuest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: 'guest-1',
    userId: 'user-1',
    houseId: 'house-1',
    displayName: 'Test Guest',
    firstName: 'Test',
    lastName: 'Guest',
    email: 'test@example.com',
    sobrietyDate: '2024-01-01',
    drugOfChoice: 'alcohol',
    phase: 1,
    step: 1,
    status: 'active',
    isAdmin: false,
    infoEntered: true,
    hasJob: false,
    rentOwed: 0,
    choreFees: 0,
    dailyHabit: 0,
    supporters: [],
    version: 0,
    createdDate: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    jobs: [],
    ...overrides,
  } as unknown as Guest;
}

function makeWeekSummary(overrides: Partial<WeekSummary> = {}): WeekSummary {
  return {
    id: 'guest-1_2026-05-10',
    guestId: 'guest-1',
    houseId: 'house-1',
    startDate: '2026-05-10',
    endDate: '2026-05-16',
    stats: {
      choresCompleted: 1,
      meetingsAttended: 3,
      hoursWorked: 0,
      medicationTaken: 0,
      primarySupporterMet: 0,
    },
    dailyStats: {},
    lastUpdated: new Date(),
    activityCount: 0,
    ...overrides,
  } as WeekSummary;
}

// ---------------------------------------------------------------------------
// getComplianceWeekStart
// ---------------------------------------------------------------------------

// Summaries are keyed by the server's weekStartFor: the Monday of the
// house-local week (functions/src/activities/weekSummaryMath.ts), #249.
describe('getComplianceWeekStart', () => {
  it('returns the house-local Monday for a Wednesday', () => {
    // 2026-05-20 is a Wednesday; its week starts Monday 2026-05-18
    expect(getComplianceWeekStart(new Date('2026-05-20T16:00:00Z'), 'America/New_York')).toBe(
      '2026-05-18',
    );
  });

  it('returns the previous Monday for a Sunday, which ends the week', () => {
    // 2026-05-17 is a Sunday, the last day of the week that began 2026-05-11
    expect(getComplianceWeekStart(new Date('2026-05-17T16:00:00Z'), 'America/New_York')).toBe(
      '2026-05-11',
    );
  });

  it("uses the house's zone, not the device's, near midnight", () => {
    // 03:30 UTC on Monday 2026-11-16 is still Sunday evening in New York
    const at = new Date('2026-11-16T03:30:00Z');
    expect(getComplianceWeekStart(at, 'America/New_York')).toBe('2026-11-09');
    expect(getComplianceWeekStart(at, 'Europe/London')).toBe('2026-11-16');
  });

  it('defaults to America/New_York, as the server does', () => {
    const at = new Date('2026-11-16T03:30:00Z');
    expect(getComplianceWeekStart(at)).toBe('2026-11-09');
    expect(getComplianceWeekStart(at, 'Not/AZone')).toBe('2026-11-09');
  });
});

// ---------------------------------------------------------------------------
// getOccupancyReport
// ---------------------------------------------------------------------------

describe('getOccupancyReport', () => {
  it('returns correct activeCount and occupancyPct for 3 active guests with capacity 8', async () => {
    const guests = [
      makeGuest({ id: 'g1', status: 'active' }),
      makeGuest({ id: 'g2', status: 'active' }),
      makeGuest({ id: 'g3', status: 'active' }),
    ];
    const result = await getOccupancyReport('house-1', guests, 8);
    expect(result.activeCount).toBe(3);
    expect(result.capacity).toBe(8);
    expect(result.occupancyPct).toBe(38); // Math.round(3/8 * 100) = 38
  });

  it('excludes guests from other houses', async () => {
    const guests = [
      makeGuest({ id: 'g1', houseId: 'house-1', status: 'active' }),
      makeGuest({ id: 'g2', houseId: 'house-2', status: 'active' }),
      makeGuest({ id: 'g3', houseId: 'house-2', status: 'active' }),
    ];
    const result = await getOccupancyReport('house-1', guests, 10);
    expect(result.activeCount).toBe(1);
  });

  it('uses 1 as denominator when capacity is zero to avoid division by zero', async () => {
    const guests = [makeGuest({ status: 'active' })];
    const result = await getOccupancyReport('house-1', guests, 0);
    expect(result.capacity).toBe(1);
    expect(result.occupancyPct).toBe(100);
  });

  it('throws when houseId is empty', async () => {
    await expect(getOccupancyReport('', [], 10)).rejects.toThrow(
      'getOccupancyReport: houseId is required',
    );
  });
});

// ---------------------------------------------------------------------------
// getComplianceTrend
// ---------------------------------------------------------------------------

describe('getComplianceTrend', () => {
  beforeEach(() => {
    const { __mockGet } = require('../../../firebase-setup');
    __mockGet.mockReset();
  });

  it('returns empty weeks array when guestIds is empty', async () => {
    const result = await getComplianceTrend('house-1', []);
    expect(result.weeks).toEqual([]);
  });

  it('computes chore and meeting rates from returned Firestore docs', async () => {
    const { __mockGet } = require('../../../firebase-setup');

    // Simulate one doc returned: choresCompleted=2, meetingsAttended=3, keyed
    // the way the server keys it: this week's Monday (#249). The clock is fixed
    // to a Wednesday so the literal key can't go stale.
    jest.useFakeTimers({ now: new Date('2026-11-11T17:00:00Z') });
    const doc1 = makeWeekSummary({
      guestId: 'g1',
      startDate: '2026-11-09',
      stats: {
        choresCompleted: 2,
        meetingsAttended: 3,
        hoursWorked: 0,
        medicationTaken: 0,
        primarySupporterMet: 0,
      },
    });

    __mockGet.mockResolvedValue({
      docs: [{ data: () => doc1 }],
    });

    // Use weeksBack=1 so we only build one week slice
    const result = await getComplianceTrend('house-1', ['g1'], 1, 'America/New_York');
    jest.useRealTimers();
    expect(result.weeks).toHaveLength(1);
    expect(result.weeks[0].weekStart).toBe('2026-11-09');
    // 1 doc met chore threshold out of 1 guest → 100%
    expect(result.weeks[0].choreRate).toBe(1);
    // 1 doc met meeting threshold (≥3) out of 1 guest → 100%
    expect(result.weeks[0].meetingRate).toBe(1);
    expect(result.weeks[0].guestCount).toBe(1);
  });

  it('returns zero rates when no docs are returned', async () => {
    const { __mockGet } = require('../../../firebase-setup');
    __mockGet.mockResolvedValue({ docs: [] });

    const result = await getComplianceTrend('house-1', ['g1', 'g2'], 2);
    expect(result.weeks).toHaveLength(2);
    for (const week of result.weeks) {
      expect(week.choreRate).toBe(0);
      expect(week.meetingRate).toBe(0);
    }
  });

  it('excludes docs whose startDate falls outside the requested week window (client-side filter)', async () => {
    const { __mockGet } = require('../../../firebase-setup');

    // Firestore returns a doc from an old week not in the weeksBack=1 window
    const oldDoc = makeWeekSummary({
      guestId: 'g1',
      startDate: '2025-01-05', // far in the past — outside any weeksBack=1 window
      stats: {
        choresCompleted: 5,
        meetingsAttended: 5,
        hoursWorked: 0,
        medicationTaken: 0,
        primarySupporterMet: 0,
      },
    });

    __mockGet.mockResolvedValue({ docs: [{ data: () => oldDoc }] });

    const result = await getComplianceTrend('house-1', ['g1'], 1);
    // The doc should be filtered out client-side; rates should be 0
    expect(result.weeks).toHaveLength(1);
    expect(result.weeks[0].choreRate).toBe(0);
    expect(result.weeks[0].meetingRate).toBe(0);
  });

  describe('weeks keyed like the server (#249)', () => {
    afterEach(() => jest.useRealTimers());

    const summary = (startDate: string) =>
      makeWeekSummary({
        guestId: 'g1',
        startDate,
        stats: {
          choresCompleted: 1,
          meetingsAttended: 3,
          hoursWorked: 0,
          medicationTaken: 0,
          primarySupporterMet: 0,
        },
      });

    it('labels the four weeks by their Mondays and counts each Monday-keyed summary', async () => {
      const { __mockGet } = require('../../../firebase-setup');
      jest.useFakeTimers({ now: new Date('2026-11-11T17:00:00Z') }); // Wednesday
      __mockGet.mockResolvedValue({
        docs: [summary('2026-10-26'), summary('2026-11-09')].map(doc => ({ data: () => doc })),
      });

      const result = await getComplianceTrend('house-1', ['g1'], 4, 'America/New_York');

      expect(result.weeks.map(w => w.weekStart)).toEqual([
        '2026-10-19',
        '2026-10-26',
        '2026-11-02',
        '2026-11-09',
      ]);
      expect(result.weeks.map(w => w.choreRate)).toEqual([0, 1, 0, 1]);
      expect(result.weeks.map(w => w.meetingRate)).toEqual([0, 1, 0, 1]);
    });

    it("picks the week by the house's zone on Sunday night", async () => {
      const { __mockGet } = require('../../../firebase-setup');
      // Monday 03:30 UTC is still Sunday 2026-11-15 in New York: the week of the 9th
      jest.useFakeTimers({ now: new Date('2026-11-16T03:30:00Z') });
      __mockGet.mockResolvedValue({ docs: [{ data: () => summary('2026-11-09') }] });

      const result = await getComplianceTrend('house-1', ['g1'], 1, 'America/New_York');

      expect(result.weeks).toEqual([
        { weekStart: '2026-11-09', choreRate: 1, meetingRate: 1, guestCount: 1 },
      ]);
    });
  });
});

// ---------------------------------------------------------------------------
// getDischargeReport
// ---------------------------------------------------------------------------

describe('getDischargeReport', () => {
  it('returns discharged guests within period; excludes old, other-house, and active guests', async () => {
    const now = new Date();
    const recentDate = new Date(now);
    recentDate.setDate(now.getDate() - 10); // 10 days ago — within 30-day window

    const oldDate = new Date(now);
    oldDate.setDate(now.getDate() - 45); // 45 days ago — outside 30-day window

    const guests = [
      // Should be included: discharged, correct house, within period
      makeGuest({
        id: 'g1',
        houseId: 'house-1',
        status: 'discharged',
        moveOutDate: recentDate.toISOString().split('T')[0],
        displayName: 'Recent Discharge',
      }),
      // Should be excluded: discharged but too old
      makeGuest({
        id: 'g2',
        houseId: 'house-1',
        status: 'discharged',
        moveOutDate: oldDate.toISOString().split('T')[0],
        displayName: 'Old Discharge',
      }),
      // Should be excluded: different house
      makeGuest({
        id: 'g3',
        houseId: 'house-2',
        status: 'discharged',
        moveOutDate: recentDate.toISOString().split('T')[0],
        displayName: 'Other House',
      }),
      // Should be excluded: active status
      makeGuest({
        id: 'g4',
        houseId: 'house-1',
        status: 'active',
        displayName: 'Active Guest',
      }),
    ];

    const result = await getDischargeReport('house-1', guests, 30);
    expect(result.count).toBe(1);
    expect(result.residents[0].id).toBe('g1');
    expect(result.residents[0].displayName).toBe('Recent Discharge');
    expect(result.period).toBe(30);
  });
});
