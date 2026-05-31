// src/util/__tests__/houseUtil.test.ts
// Unit tests for src/util/house.tsx

// ─── Mocks ───────────────────────────────────────────────────────────────────

// guest.tsx has react-native transitive deps — mock the functions we need
jest.mock('../../util/guest', () => ({
  getOverallPercentage: jest.fn(() => 80),
}));

// display.tsx also has transitive deps
jest.mock('../../util/display', () => ({
  getTodaysDate: jest.fn(() => '2024-01-10'),
}));

// Beds management hook — only imported for SelectedBed type
jest.mock('../../screens/Beds/hooks/useBedsManagement', () => ({}));

// Chore entity — only imported for Chores type
jest.mock('../../entities/Chore', () => ({
  defaultChores: {},
  Chores: {},
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import {
  getChallengesFromDisputes,
  countBeds,
  calculateHouseHealth,
  countOpenDisputes,
  getFirstPhase,
  sortPhases,
  houseAdminsAreCached,
  houseGuestsAreCached,
  countOpenIssues,
  getHousePercentage,
  filterHouseAdmins,
  countOpenItems,
  getGuestDisputes,
} from '../house';

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── getChallengesFromDisputes ────────────────────────────────────────────────

describe('getChallengesFromDisputes', () => {
  it('returns all challenges from all disputes', () => {
    const disputes: any[] = [
      { challenges: [{ challenger: 'Alice', message: 'msg1' }] },
      { challenges: [{ challenger: 'Bob', message: 'msg2' }, { challenger: 'Charlie', message: 'msg3' }] },
    ];
    const result = getChallengesFromDisputes(disputes);
    expect(result).toHaveLength(3);
    expect(result[0].challenger).toBe('Alice');
  });

  it('skips disputes without challenges', () => {
    const disputes: any[] = [
      { challenges: [] },
      { challenges: [{ challenger: 'Alice', message: 'msg' }] },
    ];
    const result = getChallengesFromDisputes(disputes);
    expect(result).toHaveLength(1);
  });

  it('returns empty array for null/undefined disputes', () => {
    expect(getChallengesFromDisputes(null as any)).toEqual([]);
  });

  it('returns empty array for an empty disputes array', () => {
    expect(getChallengesFromDisputes([])).toEqual([]);
  });

  it('skips disputes that have no challenges property', () => {
    const disputes: any[] = [{ status: 'pending' }];
    expect(getChallengesFromDisputes(disputes)).toEqual([]);
  });
});

// ─── countBeds ───────────────────────────────────────────────────────────────

describe('countBeds', () => {
  it('counts max and used beds correctly', () => {
    const rooms: any = {
      room1: {
        beds: {
          bed1: { guestId: 'guest-1' },
          bed2: { guestId: null },
        },
      },
      room2: {
        beds: {
          bed3: { guestId: 'guest-2' },
        },
      },
    };
    const result = countBeds(rooms);
    expect(result.max).toBe(3);
    expect(result.used).toBe(2);
  });

  it('returns max=0, used=0 for empty rooms', () => {
    const result = countBeds({} as any);
    expect(result.max).toBe(0);
    expect(result.used).toBe(0);
  });

  it('returns used=0 when no beds have guests', () => {
    const rooms: any = {
      room1: {
        beds: {
          bed1: { guestId: null },
          bed2: { guestId: null },
        },
      },
    };
    const result = countBeds(rooms);
    expect(result.max).toBe(2);
    expect(result.used).toBe(0);
  });
});

// ─── calculateHouseHealth ────────────────────────────────────────────────────

describe('calculateHouseHealth', () => {
  it('returns the average of all health scores, rounded up', () => {
    const health: any = {
      '2024-01-07': 80,
      '2024-01-14': 90,
      '2024-01-21': 70,
    };
    // avg = (80+90+70)/3 = 240/3 = 80
    expect(calculateHouseHealth(health)).toBe(80);
  });

  it('uses Math.ceil for fractional averages', () => {
    // (80 + 81) / 2 = 80.5 → ceil → 81
    const health: any = { w1: 80, w2: 81 };
    expect(calculateHouseHealth(health)).toBe(81);
  });

  it('returns 0 for an empty health object', () => {
    expect(calculateHouseHealth({} as any)).toBe(0);
  });

  it('returns the single value when only one week exists', () => {
    expect(calculateHouseHealth({ '2024-01-07': 75 } as any)).toBe(75);
  });
});

// ─── countOpenDisputes ───────────────────────────────────────────────────────

describe('countOpenDisputes', () => {
  it('counts disputes with status "pending"', () => {
    const house: any = {
      disputes: {
        d1: { status: 'pending' },
        d2: { status: 'resolved' },
        d3: { status: 'pending' },
      },
    };
    expect(countOpenDisputes(house)).toBe(2);
  });

  it('counts disputes with legacy active===true field', () => {
    const house: any = {
      disputes: {
        d1: { active: true },
        d2: { active: false },
      },
    };
    expect(countOpenDisputes(house)).toBe(1);
  });

  it('returns 0 when disputes object is empty', () => {
    const house: any = { disputes: {} };
    expect(countOpenDisputes(house)).toBe(0);
  });

  it('counts both pending and active disputes together', () => {
    const house: any = {
      disputes: {
        d1: { status: 'pending' },
        d2: { active: true },
        d3: { status: 'resolved' },
      },
    };
    expect(countOpenDisputes(house)).toBe(2);
  });
});

// ─── getFirstPhase ───────────────────────────────────────────────────────────

describe('getFirstPhase', () => {
  it('returns the phase with the lowest order', () => {
    const phases: any = {
      Senior: { name: 'Senior', order: 3 },
      Entry: { name: 'Entry', order: 1 },
      Normal: { name: 'Normal', order: 2 },
    };
    const result = getFirstPhase(phases);
    expect(result?.name).toBe('Entry');
    expect(result?.order).toBe(1);
  });

  it('returns the single phase when there is only one', () => {
    const phases: any = {
      Basic: { name: 'Basic', order: 1 },
    };
    expect(getFirstPhase(phases)?.name).toBe('Basic');
  });

  it('returns null for an empty phases object', () => {
    expect(getFirstPhase({} as any)).toBeNull();
  });
});

// ─── sortPhases ──────────────────────────────────────────────────────────────

describe('sortPhases', () => {
  it('returns phases sorted by order ascending', () => {
    const phases: any = {
      Senior: { name: 'Senior', order: 3 },
      Entry: { name: 'Entry', order: 1 },
      Normal: { name: 'Normal', order: 2 },
    };
    const sorted = sortPhases(phases);
    expect(sorted[0].name).toBe('Entry');
    expect(sorted[1].name).toBe('Normal');
    expect(sorted[2].name).toBe('Senior');
  });

  it('returns a single-element array for a single phase', () => {
    const phases: any = { Basic: { name: 'Basic', order: 1 } };
    const sorted = sortPhases(phases);
    expect(sorted).toHaveLength(1);
    expect(sorted[0].name).toBe('Basic');
  });

  it('returns an empty array for empty phases', () => {
    expect(sortPhases({} as any)).toEqual([]);
  });
});

// ─── houseAdminsAreCached ────────────────────────────────────────────────────

describe('houseAdminsAreCached', () => {
  it('returns true when all admin IDs are cached', () => {
    const house: any = {
      id: 'house-1',
      adminIds: ['admin-1', 'admin-2'],
    };
    const admins: any = {
      'admin-1': { id: 'admin-1' },
      'admin-2': { id: 'admin-2' },
    };
    expect(houseAdminsAreCached(house, admins)).toBe(true);
  });

  it('returns false when an admin ID is not in the cached admins', () => {
    const house: any = {
      id: 'house-1',
      adminIds: ['admin-1', 'admin-999'],
    };
    const admins: any = {
      'admin-1': { id: 'admin-1' },
    };
    expect(houseAdminsAreCached(house, admins)).toBe(false);
  });

  it('returns false when house has no id', () => {
    const house: any = { adminIds: ['admin-1'] };
    const admins: any = { 'admin-1': { id: 'admin-1' } };
    expect(houseAdminsAreCached(house, admins)).toBe(false);
  });

  it('returns true when adminIds is empty (vacuously true)', () => {
    const house: any = { id: 'house-1', adminIds: [] };
    expect(houseAdminsAreCached(house, {})).toBe(true);
  });
});

// ─── houseGuestsAreCached ────────────────────────────────────────────────────

describe('houseGuestsAreCached', () => {
  it('returns true when another guest with the same houseId is already cached', () => {
    const house: any = { id: 'house-1' };
    const guests: any = {
      'g1': { id: 'g1', houseId: 'house-1' },
      'g2': { id: 'g2', houseId: 'house-1' },
    };
    expect(houseGuestsAreCached(house, guests, 'g1')).toBe(true);
  });

  it('returns false when the only matching guest is the current user', () => {
    const house: any = { id: 'house-1' };
    const guests: any = {
      'g1': { id: 'g1', houseId: 'house-1' },
    };
    expect(houseGuestsAreCached(house, guests, 'g1')).toBe(false);
  });

  it('returns false when no guests belong to the house', () => {
    const house: any = { id: 'house-1' };
    const guests: any = {
      'g1': { id: 'g1', houseId: 'house-2' },
    };
    expect(houseGuestsAreCached(house, guests, 'g1')).toBe(false);
  });
});

// ─── countOpenIssues ─────────────────────────────────────────────────────────

describe('countOpenIssues', () => {
  it('counts issues that have no resolution and are not invalid', () => {
    const house: any = {
      issues: {
        i1: { resolution: null, invalid: false },
        i2: { resolution: 'fixed', invalid: false },
        i3: { resolution: null, invalid: true },
        i4: { resolution: null, invalid: false },
      },
    };
    expect(countOpenIssues(house)).toBe(2);
  });

  it('returns 0 when all issues are resolved', () => {
    const house: any = {
      issues: {
        i1: { resolution: 'fixed', invalid: false },
      },
    };
    expect(countOpenIssues(house)).toBe(0);
  });

  it('returns 0 for empty issues', () => {
    const house: any = { issues: {} };
    expect(countOpenIssues(house)).toBe(0);
  });
});

// ─── filterHouseAdmins ────────────────────────────────────────────────────────

describe('filterHouseAdmins', () => {
  it('returns only admins whose id is in house.adminIds', () => {
    const house: any = { adminIds: ['admin-1'] };
    const admins: any = {
      'admin-1': { id: 'admin-1', firstName: 'Alice' },
      'admin-2': { id: 'admin-2', firstName: 'Bob' },
    };
    const result = filterHouseAdmins(house, admins);
    expect(Object.keys(result)).toHaveLength(1);
    expect(result['admin-1']).toBeDefined();
    expect(result['admin-2']).toBeUndefined();
  });

  it('returns empty object when no admins match', () => {
    const house: any = { adminIds: ['admin-999'] };
    const admins: any = { 'admin-1': { id: 'admin-1' } };
    const result = filterHouseAdmins(house, admins);
    expect(Object.keys(result)).toHaveLength(0);
  });
});

// ─── countOpenItems ──────────────────────────────────────────────────────────

describe('countOpenItems', () => {
  it('counts items that have no resolution and no reply', () => {
    const items: any = {
      i1: { resolution: null, reply: null },
      i2: { resolution: 'done', reply: null },
      i3: { resolution: null, reply: 'noted' },
      i4: { resolution: null, reply: null },
    };
    expect(countOpenItems(items)).toBe(2);
  });

  it('returns 0 when all items have resolution or reply', () => {
    const items: any = {
      i1: { resolution: 'fixed', reply: null },
      i2: { resolution: null, reply: 'seen' },
    };
    expect(countOpenItems(items)).toBe(0);
  });

  it('returns 0 for an empty items object', () => {
    expect(countOpenItems({})).toBe(0);
  });
});

// ─── getHousePercentage ──────────────────────────────────────────────────────

describe('getHousePercentage', () => {
  it('returns 0 when there are no guests', () => {
    const house: any = { phases: {} };
    const result = getHousePercentage(house, {});
    expect(result).toBe(0);
  });

  it('returns the mocked overall percentage (80) for a single guest', () => {
    const house: any = { phases: {} };
    const guests: any = { 'g1': { id: 'g1' } };
    const result = getHousePercentage(house, guests);
    expect(result).toBe(80);
  });

  it('returns the average across multiple guests', () => {
    // getOverallPercentage is mocked to always return 80
    // avg of [80, 80] = 80 → ceil(80) = 80
    const house: any = { phases: {} };
    const guests: any = {
      'g1': { id: 'g1' },
      'g2': { id: 'g2' },
    };
    const result = getHousePercentage(house, guests);
    expect(result).toBe(80);
  });
});

// ─── getGuestDisputes ────────────────────────────────────────────────────────

describe('getGuestDisputes', () => {
  it('returns disputes where the guest is the disputer', () => {
    const disputes: any = {
      d1: { disputerId: 'guest-1', victimId: 'guest-2' },
      d2: { disputerId: 'guest-2', victimId: 'guest-1' },
    };
    const result = getGuestDisputes('guest-1', disputes, 'disputer');
    expect(result).toHaveLength(1);
  });

  it('returns disputes where the guest is the victim', () => {
    const disputes: any = {
      d1: { disputerId: 'guest-2', victimId: 'guest-1' },
      d2: { disputerId: 'guest-1', victimId: 'guest-2' },
    };
    const result = getGuestDisputes('guest-1', disputes, 'victim');
    expect(result).toHaveLength(1);
  });

  it('returns empty array when no disputes match', () => {
    const disputes: any = {
      d1: { disputerId: 'guest-2', victimId: 'guest-3' },
    };
    const result = getGuestDisputes('guest-1', disputes, 'disputer');
    expect(result).toHaveLength(0);
  });
});
