import {
  computeDemocraticCondition,
  computeFinancialCondition,
  computeZeroToleranceCondition,
  computeCharterCompliance,
} from '../charterCompliance';
import { Vote } from '../../../entities/oxford/Vote';
import { BusinessMeeting } from '../../../entities/oxford/BusinessMeeting';
import { DrugTest } from '../../../entities/DrugTest';
import { EESRecord } from '../ees';
import { FinancialRecord } from '../../../entities/oxford/FinancialRecord';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NOW = new Date('2024-06-01T12:00:00Z');

function daysAgo(n: number): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function makeVote(overrides: Partial<Vote> = {}): Vote {
  return {
    id: 'v1',
    houseId: 'h1',
    topic: 'Test Vote',
    description: '',
    type: 'house_rule',
    options: ['yes', 'no'],
    results: { yes: 4, no: 1 },
    individualVotes: { u1: 'yes', u2: 'yes', u3: 'yes', u4: 'yes', u5: 'no' },
    threshold: 0.5,
    isAnonymous: false,
    passed: true,
    closedAt: daysAgo(5),
    createdAt: daysAgo(6),
    ...overrides,
  };
}

function makeEESRecord(paid: boolean): EESRecord & { id: string } {
  return {
    id: `ees-${Math.random()}`,
    guestId: 'g1',
    amount: 100,
    paid,
    weekStart: '2024-05-27',
    houseId: 'h1',
  };
}

function makeFinancialRecord(balance: number): FinancialRecord {
  return {
    id: 'fr1',
    houseId: 'h1',
    period: '2024-05',
    status: 'draft',
    incomeLineItems: [],
    expenseLineItems: [],
    billsDue: [],
    totalIncome: 0,
    totalExpenses: 0,
    netIncome: 0,
    endingCheckingBalance: balance,
    startingCheckingBalance: 0,
    notes: '',
    createdAt: daysAgo(1),
  } as FinancialRecord;
}

function makeDrugTest(
  result: DrugTest['result'],
  guestId = 'g1',
  daysBack = 5,
): DrugTest {
  return {
    id: `dt-${Math.random()}`,
    guestId,
    houseId: 'h1',
    testDate: daysAgo(daysBack),
    result,
    testType: 'urine',
    substancesDetected: result === 'positive' ? ['alcohol'] : [],
    observedBy: 'staff1',
    observerName: 'Staff Person',
    notes: '',
    isRandom: false,
    escalationTriggered: false,
    createdAt: daysAgo(daysBack),
  };
}

// ─── computeDemocraticCondition ───────────────────────────────────────────────

describe('computeDemocraticCondition', () => {
  it('returns insufficient_data when fewer than 3 closed votes in window', () => {
    const votes = [makeVote(), makeVote({ id: 'v2' })];
    const result = computeDemocraticCondition(votes, [], 10, NOW);
    expect(result.status).toBe('insufficient_data');
    expect(result.metric).toBeNull();
  });

  it('returns insufficient_data when no votes in window (all too old)', () => {
    const votes = [
      makeVote({ closedAt: daysAgo(100) }),
      makeVote({ id: 'v2', closedAt: daysAgo(95) }),
      makeVote({ id: 'v3', closedAt: daysAgo(91) }),
    ];
    const result = computeDemocraticCondition(votes, [], 10, NOW);
    expect(result.status).toBe('insufficient_data');
  });

  it('passes when average participation >= 80%', () => {
    // 5/5 = 100% each — 3 votes needed
    const votes = [
      makeVote({ id: 'v1' }),
      makeVote({ id: 'v2' }),
      makeVote({ id: 'v3' }),
    ];
    const result = computeDemocraticCondition(votes, [], 5, NOW);
    expect(result.status).toBe('pass');
    expect(result.metric).toBeCloseTo(1.0);
  });

  it('fails when average participation < 80%', () => {
    // 2 of 10 eligible voted → 20%
    const votes = [
      makeVote({
        id: 'v1',
        results: { yes: 1, no: 1 },
        individualVotes: { u1: 'yes', u2: 'no' },
      }),
      makeVote({
        id: 'v2',
        results: { yes: 1, no: 1 },
        individualVotes: { u3: 'yes', u4: 'no' },
      }),
      makeVote({
        id: 'v3',
        results: { yes: 1, no: 1 },
        individualVotes: { u5: 'yes', u6: 'no' },
      }),
    ];
    const result = computeDemocraticCondition(votes, [], 10, NOW);
    expect(result.status).toBe('fail');
    expect(result.metric).toBeCloseTo(0.2);
  });

  it('uses meeting attendee count as eligible voters when meetingId matches', () => {
    const meeting: BusinessMeeting = {
      id: 'm1',
      houseId: 'h1',
      scheduledDate: daysAgo(5),
      agenda: [],
      attendees: ['g1', 'g2', 'g3', 'g4'],
    } as any;
    // 4 individual votes / 4 attendees = 100%
    const votes = [
      makeVote({ id: 'v1', meetingId: 'm1' }),
      makeVote({ id: 'v2', meetingId: 'm1' }),
      makeVote({ id: 'v3', meetingId: 'm1' }),
    ];
    const result = computeDemocraticCondition(votes, [meeting], 100, NOW);
    expect(result.status).toBe('pass');
  });

  it('handles anonymous votes using results sum', () => {
    const anonVote = makeVote({
      isAnonymous: true,
      results: { yes: 4, no: 4 }, // 8 voters
      individualVotes: {},
    });
    const votes = [
      anonVote,
      { ...anonVote, id: 'v2' },
      { ...anonVote, id: 'v3' },
    ];
    // 8/10 = 80% — exactly at threshold
    const result = computeDemocraticCondition(votes, [], 10, NOW);
    expect(result.status).toBe('pass');
  });
});

// ─── computeFinancialCondition ────────────────────────────────────────────────

describe('computeFinancialCondition', () => {
  it('returns insufficient_data when no EES records and no financial record', () => {
    const result = computeFinancialCondition([], null);
    expect(result.status).toBe('insufficient_data');
  });

  it('passes when EES rate >= 90% and balance >= 0', () => {
    const records = [
      makeEESRecord(true),
      makeEESRecord(true),
      makeEESRecord(true),
      makeEESRecord(true),
      makeEESRecord(true),
      makeEESRecord(true),
      makeEESRecord(true),
      makeEESRecord(true),
      makeEESRecord(true),
      makeEESRecord(false), // 9/10 = 90%
    ];
    const result = computeFinancialCondition(records, makeFinancialRecord(500));
    expect(result.status).toBe('pass');
    expect(result.metric).toBeCloseTo(0.9);
  });

  it('fails when EES rate < 90%', () => {
    const records = [
      makeEESRecord(true),
      makeEESRecord(true),
      makeEESRecord(true),
      makeEESRecord(true),
      makeEESRecord(false),
      makeEESRecord(false), // 4/6 ≈ 67%
    ];
    const result = computeFinancialCondition(records, makeFinancialRecord(100));
    expect(result.status).toBe('fail');
  });

  it('fails when balance is negative', () => {
    const records = Array(9)
      .fill(null)
      .map(() => makeEESRecord(true));
    records.push(makeEESRecord(true)); // 10/10 = 100%
    const result = computeFinancialCondition(records, makeFinancialRecord(-1));
    expect(result.status).toBe('fail');
  });

  it('passes on balance-only check when no EES records but balance >= 0', () => {
    const result = computeFinancialCondition([], makeFinancialRecord(0));
    expect(result.status).toBe('pass');
    expect(result.metric).toBeNull();
  });

  it('fails on balance-only check when balance is negative', () => {
    const result = computeFinancialCondition([], makeFinancialRecord(-100));
    expect(result.status).toBe('fail');
  });
});

// ─── computeZeroToleranceCondition ───────────────────────────────────────────

describe('computeZeroToleranceCondition', () => {
  const inHouse = new Set(['g1', 'g2']);

  it('passes when no positive/refused tests in window', () => {
    const tests = [makeDrugTest('negative')];
    const result = computeZeroToleranceCondition(tests, [], inHouse, NOW);
    expect(result.status).toBe('pass');
    expect(result.metric).toBe(0);
  });

  it('passes when all positive tests have an expulsion vote within grace period', () => {
    const test = makeDrugTest('positive', 'g1', 10);
    const expulsionVote = makeVote({
      id: 'ev1',
      type: 'expulsion',
      createdAt: daysAgo(8), // 2 days after test
      closedAt: daysAgo(7),
    });
    const result = computeZeroToleranceCondition(
      [test],
      [expulsionVote],
      inHouse,
      NOW,
    );
    expect(result.status).toBe('pass');
  });

  it('fails when a positive test has no expulsion vote within grace period', () => {
    const test = makeDrugTest('positive', 'g1', 5);
    const result = computeZeroToleranceCondition([test], [], inHouse, NOW);
    expect(result.status).toBe('fail');
    expect(result.metric).toBe(1);
  });

  it('fails when expulsion vote is outside grace period', () => {
    const test = makeDrugTest('positive', 'g1', 20);
    const lateVote = makeVote({
      id: 'ev2',
      type: 'expulsion',
      createdAt: daysAgo(2), // 18 days after test — exceeds 14-day grace
      closedAt: daysAgo(1),
    });
    const result = computeZeroToleranceCondition(
      [test],
      [lateVote],
      inHouse,
      NOW,
    );
    expect(result.status).toBe('fail');
  });

  it('ignores tests for guests no longer in house', () => {
    const test = makeDrugTest('positive', 'g-discharged', 5);
    const result = computeZeroToleranceCondition([test], [], inHouse, NOW);
    expect(result.status).toBe('pass');
  });

  it('ignores tests outside the 30-day window', () => {
    const oldTest = makeDrugTest('positive', 'g1', 35);
    const result = computeZeroToleranceCondition([oldTest], [], inHouse, NOW);
    expect(result.status).toBe('pass');
  });

  it('handles refused tests as flagged', () => {
    const test = makeDrugTest('refused', 'g1', 5);
    const result = computeZeroToleranceCondition([test], [], inHouse, NOW);
    expect(result.status).toBe('fail');
  });
});

// ─── computeCharterCompliance (aggregator) ────────────────────────────────────

describe('computeCharterCompliance', () => {
  it('returns fail overall when any condition fails', () => {
    const votes = [makeVote(), makeVote({ id: 'v2' }), makeVote({ id: 'v3' })];
    const result = computeCharterCompliance({
      votes,
      meetings: [],
      activeResidentCount: 100, // guaranteed fail — 5/100 = 5%
      recentEesRecords: [],
      latestFinancialRecord: null,
      drugTests: [],
      inHouseGuestIds: new Set(),
      now: NOW,
    });
    expect(result.overall).toBe('fail');
    expect(result.computedAt).toBe(NOW.toISOString());
  });

  it('returns insufficient_data when some conditions lack data but none fail', () => {
    const result = computeCharterCompliance({
      votes: [],
      meetings: [],
      activeResidentCount: 5,
      recentEesRecords: [],
      latestFinancialRecord: null,
      drugTests: [],
      inHouseGuestIds: new Set(),
      now: NOW,
    });
    expect(result.overall).toBe('insufficient_data');
  });
});
