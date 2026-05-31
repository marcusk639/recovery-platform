// src/__tests__/util/disputes.test.ts

jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockUpdateDispute = jest.fn();
const mockRunTransaction = jest.fn();
const mockGuestWhere = jest.fn();

jest.mock('../../api/firestore', () => ({
  updateDispute: mockUpdateDispute,
  ratsFirestore: { runTransaction: mockRunTransaction },
  guestCollection: { where: mockGuestWhere },
  app: {},
}));

import { disputeResult, determineDisputeResult, runDisputeTransaction } from '../../util/disputes';

beforeEach(() => jest.clearAllMocks());

const makeDispute = (overrides: any = {}) => ({
  id: 'dispute-1',
  initiatedDate: '2020-01-01',
  active: true,
  challenges: [],
  activityId: 'activity-1',
  type: 'chore_completed',
  disputeDate: '2024-01-10',
  victimId: 'guest-1',
  ...overrides,
});

const makeActivity = (underDispute = 0) => ({
  id: 'activity-1',
  underDispute,
} as any);

describe('disputeResult', () => {
  it('returns "success" when dispute is old with no challenges', () => {
    const dispute = makeDispute({ initiatedDate: '2020-01-01' });
    expect(disputeResult(dispute, makeActivity(0))).toBe('success');
  });

  it('returns "none" when dispute is less than 2 days old', () => {
    const today = new Date().toISOString().split('T')[0];
    const dispute = makeDispute({ initiatedDate: today });
    expect(disputeResult(dispute, makeActivity(0))).toBe('none');
  });

  it('returns "fail" when enough challenges exist', () => {
    const dispute = makeDispute({
      initiatedDate: '2020-01-01',
      challenges: ['challenge-1'],
    });
    expect(disputeResult(dispute, makeActivity(1))).toBe('fail');
  });

  it('returns "none" when dispute is not active', () => {
    const dispute = makeDispute({ initiatedDate: '2020-01-01', active: false });
    expect(disputeResult(dispute, makeActivity(0))).toBe('none');
  });

  it('returns "none" when exactly 1 day old (boundary below threshold)', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const dispute = makeDispute({ initiatedDate: yesterdayStr });
    expect(disputeResult(dispute, makeActivity(0))).toBe('none');
  });

  it('supports createdDate as fallback for initiatedDate', () => {
    const dispute = { ...makeDispute({ initiatedDate: undefined }), createdDate: '2020-01-01' };
    expect(disputeResult(dispute as any, makeActivity(0))).toBe('success');
  });

  it('supports status "pending" as fallback for active field', () => {
    const dispute = { ...makeDispute({ active: undefined }), status: 'pending', initiatedDate: '2020-01-01' };
    expect(disputeResult(dispute as any, makeActivity(0))).toBe('success');
  });

  it('returns "none" when status is not "pending" and active is undefined', () => {
    const dispute = { ...makeDispute({ active: undefined }), status: 'resolved', initiatedDate: '2020-01-01' };
    expect(disputeResult(dispute as any, makeActivity(0))).toBe('none');
  });
});

describe('runDisputeTransaction', () => {
  it('calls ratsFirestore.runTransaction', () => {
    mockRunTransaction.mockResolvedValue(undefined);
    const house = { id: 'h1', name: 'Test House', disputes: {} } as any;
    const dispute = makeDispute();
    runDisputeTransaction(house, dispute);
    expect(mockRunTransaction).toHaveBeenCalled();
  });

  it('returns the promise from runTransaction', () => {
    const expectedResult = Promise.resolve('done');
    mockRunTransaction.mockReturnValue(expectedResult);
    const house = { id: 'h1', name: 'Test House', disputes: {} } as any;
    const dispute = makeDispute();
    const result = runDisputeTransaction(house, dispute);
    expect(result).toBe(expectedResult);
  });
});

describe('determineDisputeResult', () => {
  const makeTransaction = (guestData: any) => ({
    get: jest.fn().mockResolvedValue({
      empty: !guestData,
      docs: guestData ? [{ data: () => guestData }] : [],
    }),
  } as any);

  const makeGuest = (overrides: any = {}) => ({
    id: 'guest-1',
    firstName: 'John',
    lastName: 'Doe',
    currentWeek: {
      startDate: '2024-01-07',
      endDate: '2024-01-13',
      activities: [makeActivity(0)],
      days: {},
    },
    ...overrides,
  });

  beforeEach(() => {
    mockGuestWhere.mockReturnValue({ where: jest.fn().mockReturnThis(), get: jest.fn() });
  });

  it('returns early when guest query is empty', async () => {
    const transaction = {
      get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
    } as any;

    mockGuestWhere.mockReturnValue({});

    const house = { id: 'h1', name: 'Test House', disputes: {} } as any;
    const dispute = makeDispute({ initiatedDate: '2020-01-01' });

    await determineDisputeResult(house, dispute, transaction);
    expect(mockUpdateDispute).not.toHaveBeenCalled();
  });

  it('returns early when dispute has no victimId or guestId', async () => {
    const transaction = makeTransaction(makeGuest());
    mockGuestWhere.mockReturnValue({});

    const house = { id: 'h1', name: 'Test House', disputes: {} } as any;
    const dispute = makeDispute({ victimId: undefined });

    await determineDisputeResult(house, dispute, transaction);
    expect(mockUpdateDispute).not.toHaveBeenCalled();
  });

  it('returns early when guest has no currentWeek', async () => {
    const guestWithoutWeek = { id: 'guest-1', firstName: 'John', lastName: 'Doe' };
    const transaction = makeTransaction(guestWithoutWeek);
    mockGuestWhere.mockReturnValue({});

    const house = { id: 'h1', name: 'Test House', disputes: {} } as any;
    const dispute = makeDispute({ initiatedDate: '2020-01-01' });

    await determineDisputeResult(house, dispute, transaction);
    expect(mockUpdateDispute).not.toHaveBeenCalled();
  });
});
