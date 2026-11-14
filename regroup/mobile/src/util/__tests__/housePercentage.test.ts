// getHousePercentage with the real getOverallPercentage (#208). houseUtil.test.ts
// mocks util/guest, so it can't show what the house score really is.
import { getHousePercentage } from '../house';

// Phase 1 requires 2 meetings; met-sponsor is required whenever a phase has rules.
const house: any = {
  id: 'house-1',
  phases: { 1: { rules: { meetings: 2 } }, 2: {} },
};

const guest = (id: string, extra: Record<string, unknown> = {}): any => ({
  id,
  houseId: 'house-1',
  phase: 1,
  status: 'active',
  ...extra,
});

const stats = (meetingsAttended: number, primarySupporterMet: number) => ({
  meetingsAttended,
  primarySupporterMet,
  choresCompleted: 0,
  hoursWorked: 0,
  medicationTaken: 0,
});

describe('getHousePercentage (#208)', () => {
  const guests: any = {
    full: guest('full'),
    half: guest('half'),
    none: guest('none'),
  };
  const weekStats = { full: stats(2, 1), half: stats(1, 0) };

  it('averages each resident from their week summary', () => {
    // full 100, half (50 + 0) / 2 = 25, none has no summary yet = 0
    expect(getHousePercentage(house, guests, weekStats)).toBe(42);
  });

  it('leaves out discharged and archived residents', () => {
    const withLeavers = {
      ...guests,
      gone: guest('gone', { status: 'discharged' }),
      old: guest('old', { status: 'archived' }),
    };
    expect(
      getHousePercentage(house, withLeavers, {
        ...weekStats,
        gone: stats(0, 0),
        old: stats(0, 0),
      }),
    ).toBe(42);
  });

  it('leaves out residents whose phase has no rules', () => {
    const withUnruled = { ...guests, free: guest('free', { phase: 2 }) };
    expect(getHousePercentage(house, withUnruled, weekStats)).toBe(42);
  });

  it('is 0 when nobody can be scored', () => {
    expect(getHousePercentage(house, {}, {})).toBe(0);
  });
});
