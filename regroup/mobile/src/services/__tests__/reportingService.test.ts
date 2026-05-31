/**
 * Reporting Service Tests
 *
 * Tests for getOccupancyReport, getComplianceTrend, getDischargeReport,
 * and the getSundayAnchoredWeekStart utility.
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
  getSundayAnchoredWeekStart,
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
  } as Guest;
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
// getSundayAnchoredWeekStart
// ---------------------------------------------------------------------------

describe('getSundayAnchoredWeekStart', () => {
  it('returns the Sunday of the week for a Wednesday', () => {
    // 2026-05-20 is a Wednesday; the Sunday prior is 2026-05-17
    // Use local-time constructor to avoid UTC midnight shifting in negative-offset zones
    const result = getSundayAnchoredWeekStart(new Date(2026, 4, 20)); // month 4 = May
    expect(result).toBe('2026-05-17');
  });

  it('returns the same Sunday when given a Sunday', () => {
    // 2026-05-17 is itself a Sunday; use local-time constructor to avoid UTC
    // midnight shifting the date to Saturday in negative-offset time zones
    const result = getSundayAnchoredWeekStart(new Date(2026, 4, 17)); // month 4 = May
    expect(result).toBe('2026-05-17');
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

    // Simulate one doc returned: choresCompleted=2, meetingsAttended=3
    const doc1 = makeWeekSummary({
      guestId: 'g1',
      startDate: '2026-05-17',
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
    const result = await getComplianceTrend('house-1', ['g1'], 1);
    expect(result.weeks).toHaveLength(1);
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
