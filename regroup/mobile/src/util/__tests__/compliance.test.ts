// src/util/__tests__/compliance.test.ts
// Unit tests for src/util/compliance.ts

import {
  checkMedicationCompliance,
  checkPhaseCompliance,
  getComplianceStatus,
  ComplianceResult,
} from '../compliance';
import { WeekSummary } from '../../entities/WeekSummary';
import { PhaseRule } from '../../entities/Phase';
import { Guest } from '../../entities/Guest';
import { House } from '../../entities/House';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeWeekSummary(overrides: Partial<WeekSummary['stats']> = {}): WeekSummary {
  return {
    id: 'guest1_2024-01-01',
    guestId: 'guest1',
    houseId: 'house1',
    startDate: '2024-01-01',
    endDate: '2024-01-07',
    stats: {
      meetingsAttended: 0,
      hoursWorked: 0,
      choresCompleted: 0,
      medicationTaken: 0,
      primarySupporterMet: 0,
      ...overrides,
    },
    dailyStats: {},
    lastUpdated: new Date('2024-01-07'),
    activityCount: 0,
  };
}

function makePhaseRule(overrides: Partial<PhaseRule> = {}): PhaseRule {
  return {
    meetings: 4,
    nightsOutAllowed: 0,
    supporter: true,
    work: 20,
    chore: true,
    medications: false,
    ...overrides,
  };
}

function makeGuest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: 'guest1',
    userId: '',
    houseId: 'house1',
    displayName: 'Test Guest',
    firstName: 'Test',
    lastName: 'Guest',
    email: 'test@example.com',
    sobrietyDate: '2020-01-01',
    drugOfChoice: 'alcohol',
    phase: 'Entry',
    step: 1,
    status: 'active',
    isAdmin: false,
    infoEntered: true,
    hasJob: true,
    rentOwed: 0,
    choreFees: 0,
    dailyHabit: 0,
    supporters: [],
    jobs: [],
    version: 0,
    createdDate: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    ...overrides,
  } as Guest;
}

function makeHouse(phases: House['phases'] = {}): House {
  return {
    id: 'house1',
    phases,
  } as House;
}

// ─── checkMedicationCompliance ────────────────────────────────────────────────

describe('checkMedicationCompliance', () => {
  it('returns true when medication is not required (regardless of actual count)', () => {
    const summary = makeWeekSummary({ medicationTaken: 0 });
    const rule = makePhaseRule({ medications: false });
    expect(checkMedicationCompliance(summary, rule)).toBe(true);
  });

  it('returns true when medication is not required even if medications were taken', () => {
    const summary = makeWeekSummary({ medicationTaken: 5 });
    const rule = makePhaseRule({ medications: false });
    expect(checkMedicationCompliance(summary, rule)).toBe(true);
  });

  it('returns false when medication is required but none were taken', () => {
    const summary = makeWeekSummary({ medicationTaken: 0 });
    const rule = makePhaseRule({ medications: true });
    expect(checkMedicationCompliance(summary, rule)).toBe(false);
  });

  it('returns true when medication is required and at least one was taken', () => {
    const summary = makeWeekSummary({ medicationTaken: 1 });
    const rule = makePhaseRule({ medications: true });
    expect(checkMedicationCompliance(summary, rule)).toBe(true);
  });

  it('returns true when medication is required and multiple were taken', () => {
    const summary = makeWeekSummary({ medicationTaken: 7 });
    const rule = makePhaseRule({ medications: true });
    expect(checkMedicationCompliance(summary, rule)).toBe(true);
  });
});

// ─── checkPhaseCompliance — meetings ─────────────────────────────────────────

describe('checkPhaseCompliance — meetings requirement', () => {
  it('is met when meetings attended equals the requirement', () => {
    const summary = makeWeekSummary({ meetingsAttended: 4 });
    const rule = makePhaseRule({ meetings: 4, work: 0, supporter: false, chore: false });
    const result = checkPhaseCompliance(summary, rule);
    expect(result.requirements.meetings.met).toBe(true);
    expect(result.requirements.meetings.required).toBe(4);
    expect(result.requirements.meetings.actual).toBe(4);
  });

  it('is met when meetings attended exceeds the requirement', () => {
    const summary = makeWeekSummary({ meetingsAttended: 7 });
    const rule = makePhaseRule({ meetings: 4, work: 0, supporter: false, chore: false });
    const result = checkPhaseCompliance(summary, rule);
    expect(result.requirements.meetings.met).toBe(true);
  });

  it('is not met when meetings attended is below the requirement', () => {
    const summary = makeWeekSummary({ meetingsAttended: 3 });
    const rule = makePhaseRule({ meetings: 4, work: 0, supporter: false, chore: false });
    const result = checkPhaseCompliance(summary, rule);
    expect(result.requirements.meetings.met).toBe(false);
  });

  it('is always met when zero meetings are required', () => {
    const summary = makeWeekSummary({ meetingsAttended: 0 });
    const rule = makePhaseRule({ meetings: 0, work: 0, supporter: false, chore: false });
    const result = checkPhaseCompliance(summary, rule);
    expect(result.requirements.meetings.met).toBe(true);
  });
});

// ─── checkPhaseCompliance — hoursWorked ──────────────────────────────────────

describe('checkPhaseCompliance — hoursWorked requirement', () => {
  it('is met when hours worked equals the requirement', () => {
    const summary = makeWeekSummary({ hoursWorked: 20 });
    const rule = makePhaseRule({ meetings: 0, work: 20, supporter: false, chore: false });
    const result = checkPhaseCompliance(summary, rule);
    expect(result.requirements.hoursWorked.met).toBe(true);
    expect(result.requirements.hoursWorked.required).toBe(20);
    expect(result.requirements.hoursWorked.actual).toBe(20);
  });

  it('is met when hours worked exceeds the requirement', () => {
    const summary = makeWeekSummary({ hoursWorked: 40 });
    const rule = makePhaseRule({ meetings: 0, work: 20, supporter: false, chore: false });
    const result = checkPhaseCompliance(summary, rule);
    expect(result.requirements.hoursWorked.met).toBe(true);
  });

  it('is not met when hours worked is below the requirement', () => {
    const summary = makeWeekSummary({ hoursWorked: 15 });
    const rule = makePhaseRule({ meetings: 0, work: 20, supporter: false, chore: false });
    const result = checkPhaseCompliance(summary, rule);
    expect(result.requirements.hoursWorked.met).toBe(false);
  });

  it('is always met when zero hours are required', () => {
    const summary = makeWeekSummary({ hoursWorked: 0 });
    const rule = makePhaseRule({ meetings: 0, work: 0, supporter: false, chore: false });
    const result = checkPhaseCompliance(summary, rule);
    expect(result.requirements.hoursWorked.met).toBe(true);
  });
});

// ─── checkPhaseCompliance — chores ───────────────────────────────────────────

describe('checkPhaseCompliance — choresCompleted requirement', () => {
  it('is met when chore is required and at least one chore was completed', () => {
    const summary = makeWeekSummary({ choresCompleted: 1 });
    const rule = makePhaseRule({ meetings: 0, work: 0, supporter: false, chore: true });
    const result = checkPhaseCompliance(summary, rule);
    expect(result.requirements.choresCompleted.met).toBe(true);
    expect(result.requirements.choresCompleted.required).toBe(1);
  });

  it('is not met when chore is required but none were completed', () => {
    const summary = makeWeekSummary({ choresCompleted: 0 });
    const rule = makePhaseRule({ meetings: 0, work: 0, supporter: false, chore: true });
    const result = checkPhaseCompliance(summary, rule);
    expect(result.requirements.choresCompleted.met).toBe(false);
  });

  it('is always met when chore is not required (even with 0 chores)', () => {
    const summary = makeWeekSummary({ choresCompleted: 0 });
    const rule = makePhaseRule({ meetings: 0, work: 0, supporter: false, chore: false });
    const result = checkPhaseCompliance(summary, rule);
    expect(result.requirements.choresCompleted.met).toBe(true);
    expect(result.requirements.choresCompleted.required).toBe(0);
  });

  it('reflects actual chore count in result', () => {
    const summary = makeWeekSummary({ choresCompleted: 3 });
    const rule = makePhaseRule({ meetings: 0, work: 0, supporter: false, chore: true });
    const result = checkPhaseCompliance(summary, rule);
    expect(result.requirements.choresCompleted.actual).toBe(3);
  });
});

// ─── checkPhaseCompliance — medication ───────────────────────────────────────

describe('checkPhaseCompliance — medicationTaken requirement', () => {
  it('is met when medication is not required and none taken', () => {
    const summary = makeWeekSummary({ medicationTaken: 0 });
    const rule = makePhaseRule({ meetings: 0, work: 0, supporter: false, chore: false, medications: false });
    const result = checkPhaseCompliance(summary, rule);
    expect(result.requirements.medicationTaken.met).toBe(true);
    expect(result.requirements.medicationTaken.required).toBe(false);
    expect(result.requirements.medicationTaken.actual).toBe(false);
  });

  it('is met when medication is required and at least one was taken', () => {
    const summary = makeWeekSummary({ medicationTaken: 1 });
    const rule = makePhaseRule({ meetings: 0, work: 0, supporter: false, chore: false, medications: true });
    const result = checkPhaseCompliance(summary, rule);
    expect(result.requirements.medicationTaken.met).toBe(true);
    expect(result.requirements.medicationTaken.required).toBe(true);
    expect(result.requirements.medicationTaken.actual).toBe(true);
  });

  it('is not met when medication is required but none taken', () => {
    const summary = makeWeekSummary({ medicationTaken: 0 });
    const rule = makePhaseRule({ meetings: 0, work: 0, supporter: false, chore: false, medications: true });
    const result = checkPhaseCompliance(summary, rule);
    expect(result.requirements.medicationTaken.met).toBe(false);
    expect(result.requirements.medicationTaken.actual).toBe(false);
  });

  it('actual is true when multiple medications logged', () => {
    const summary = makeWeekSummary({ medicationTaken: 7 });
    const rule = makePhaseRule({ meetings: 0, work: 0, supporter: false, chore: false, medications: true });
    const result = checkPhaseCompliance(summary, rule);
    expect(result.requirements.medicationTaken.actual).toBe(true);
  });
});

// ─── checkPhaseCompliance — primarySupporterMet ──────────────────────────────

describe('checkPhaseCompliance — primarySupporterMet requirement', () => {
  it('is met when supporter is not required and none met', () => {
    const summary = makeWeekSummary({ primarySupporterMet: 0 });
    const rule = makePhaseRule({ meetings: 0, work: 0, supporter: false, chore: false });
    const result = checkPhaseCompliance(summary, rule);
    expect(result.requirements.primarySupporterMet.met).toBe(true);
    expect(result.requirements.primarySupporterMet.required).toBe(false);
    expect(result.requirements.primarySupporterMet.actual).toBe(false);
  });

  it('is met when supporter is required and at least one meeting happened', () => {
    const summary = makeWeekSummary({ primarySupporterMet: 1 });
    const rule = makePhaseRule({ meetings: 0, work: 0, supporter: true, chore: false });
    const result = checkPhaseCompliance(summary, rule);
    expect(result.requirements.primarySupporterMet.met).toBe(true);
    expect(result.requirements.primarySupporterMet.required).toBe(true);
    expect(result.requirements.primarySupporterMet.actual).toBe(true);
  });

  it('is not met when supporter is required but no meetings occurred', () => {
    const summary = makeWeekSummary({ primarySupporterMet: 0 });
    const rule = makePhaseRule({ meetings: 0, work: 0, supporter: true, chore: false });
    const result = checkPhaseCompliance(summary, rule);
    expect(result.requirements.primarySupporterMet.met).toBe(false);
  });
});

// ─── checkPhaseCompliance — overall compliant flag ───────────────────────────

describe('checkPhaseCompliance — overall compliant flag', () => {
  it('is compliant when all requirements are met', () => {
    const summary = makeWeekSummary({
      meetingsAttended: 4,
      hoursWorked: 20,
      choresCompleted: 1,
      medicationTaken: 1,
      primarySupporterMet: 1,
    });
    const rule = makePhaseRule({
      meetings: 4,
      work: 20,
      supporter: true,
      chore: true,
      medications: true,
    });
    const result = checkPhaseCompliance(summary, rule);
    expect(result.compliant).toBe(true);
  });

  it('is not compliant when any one requirement is not met', () => {
    const summary = makeWeekSummary({
      meetingsAttended: 3, // short by 1
      hoursWorked: 20,
      choresCompleted: 1,
      medicationTaken: 1,
      primarySupporterMet: 1,
    });
    const rule = makePhaseRule({
      meetings: 4,
      work: 20,
      supporter: true,
      chore: true,
      medications: true,
    });
    const result = checkPhaseCompliance(summary, rule);
    expect(result.compliant).toBe(false);
  });

  it('is compliant with all-zero requirements and no activity', () => {
    const summary = makeWeekSummary();
    const rule = makePhaseRule({
      meetings: 0,
      work: 0,
      supporter: false,
      chore: false,
      medications: false,
    });
    const result = checkPhaseCompliance(summary, rule);
    expect(result.compliant).toBe(true);
  });

  it('is not compliant when medication is the only failing requirement', () => {
    const summary = makeWeekSummary({
      meetingsAttended: 4,
      hoursWorked: 20,
      choresCompleted: 1,
      medicationTaken: 0, // failing
      primarySupporterMet: 1,
    });
    const rule = makePhaseRule({
      meetings: 4,
      work: 20,
      supporter: true,
      chore: true,
      medications: true,
    });
    const result = checkPhaseCompliance(summary, rule);
    expect(result.compliant).toBe(false);
    expect(result.requirements.medicationTaken.met).toBe(false);
  });

  it('is not compliant when supporter is the only failing requirement', () => {
    const summary = makeWeekSummary({
      meetingsAttended: 4,
      hoursWorked: 20,
      choresCompleted: 1,
      medicationTaken: 1,
      primarySupporterMet: 0, // failing
    });
    const rule = makePhaseRule({
      meetings: 4,
      work: 20,
      supporter: true,
      chore: true,
      medications: true,
    });
    const result = checkPhaseCompliance(summary, rule);
    expect(result.compliant).toBe(false);
    expect(result.requirements.primarySupporterMet.met).toBe(false);
  });

  it('returns the correct actual values in all requirements', () => {
    const summary = makeWeekSummary({
      meetingsAttended: 5,
      hoursWorked: 25,
      choresCompleted: 2,
      medicationTaken: 3,
      primarySupporterMet: 1,
    });
    const rule = makePhaseRule({
      meetings: 4,
      work: 20,
      supporter: true,
      chore: true,
      medications: true,
    });
    const result = checkPhaseCompliance(summary, rule);
    expect(result.requirements.meetings.actual).toBe(5);
    expect(result.requirements.hoursWorked.actual).toBe(25);
    expect(result.requirements.choresCompleted.actual).toBe(2);
    expect(result.requirements.medicationTaken.actual).toBe(true);
    expect(result.requirements.primarySupporterMet.actual).toBe(true);
  });
});

// ─── getComplianceStatus ─────────────────────────────────────────────────────

describe('getComplianceStatus', () => {
  it('returns "incomplete-data" when weekSummary is null', () => {
    const guest = makeGuest({ phase: 'Entry' });
    const house = makeHouse({
      Entry: { name: 'Entry', order: 1, rules: makePhaseRule() },
    });
    expect(getComplianceStatus(guest, null, house)).toBe('incomplete-data');
  });

  it('returns "incomplete-data" when weekSummary is undefined', () => {
    const guest = makeGuest({ phase: 'Entry' });
    const house = makeHouse({
      Entry: { name: 'Entry', order: 1, rules: makePhaseRule() },
    });
    expect(getComplianceStatus(guest, undefined, house)).toBe('incomplete-data');
  });

  it('returns "incomplete-data" when the guest\'s phase is not found in the house', () => {
    const guest = makeGuest({ phase: 'NonExistentPhase' });
    const house = makeHouse({
      Entry: { name: 'Entry', order: 1, rules: makePhaseRule() },
    });
    const summary = makeWeekSummary();
    expect(getComplianceStatus(guest, summary, house)).toBe('incomplete-data');
  });

  it('returns "incomplete-data" when house has no phases', () => {
    const guest = makeGuest({ phase: 'Entry' });
    const house = makeHouse({});
    const summary = makeWeekSummary();
    expect(getComplianceStatus(guest, summary, house)).toBe('incomplete-data');
  });

  it('returns "compliant" when all requirements are met', () => {
    const guest = makeGuest({ phase: 'Entry' });
    const house = makeHouse({
      Entry: {
        name: 'Entry',
        order: 1,
        rules: makePhaseRule({
          meetings: 4,
          work: 20,
          supporter: true,
          chore: true,
          medications: false,
        }),
      },
    });
    const summary = makeWeekSummary({
      meetingsAttended: 4,
      hoursWorked: 20,
      choresCompleted: 1,
      primarySupporterMet: 1,
    });
    expect(getComplianceStatus(guest, summary, house)).toBe('compliant');
  });

  it('returns "non-compliant" when a requirement is not met', () => {
    const guest = makeGuest({ phase: 'Entry' });
    const house = makeHouse({
      Entry: {
        name: 'Entry',
        order: 1,
        rules: makePhaseRule({
          meetings: 7,
          work: 20,
          supporter: true,
          chore: true,
          medications: false,
        }),
      },
    });
    const summary = makeWeekSummary({
      meetingsAttended: 3, // needs 7
      hoursWorked: 20,
      choresCompleted: 1,
      primarySupporterMet: 1,
    });
    expect(getComplianceStatus(guest, summary, house)).toBe('non-compliant');
  });

  it('handles a numeric phase key stringified to resolve phase', () => {
    // Guest.phase can be a number (e.g., legacy data)
    const guest = makeGuest({ phase: 1 as any });
    const house = makeHouse({
      '1': {
        name: '1',
        order: 1,
        rules: makePhaseRule({ meetings: 0, work: 0, supporter: false, chore: false }),
      },
    });
    const summary = makeWeekSummary();
    // Phase key "1" exists — all requirements are 0/false, so compliant
    expect(getComplianceStatus(guest, summary, house)).toBe('compliant');
  });
});
