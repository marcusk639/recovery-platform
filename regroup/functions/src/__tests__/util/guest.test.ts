// src/__tests__/util/guest.test.ts

jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockRunTransaction = jest.fn();
const mockWeekSummariesDoc = jest.fn();
const mockWeekSummariesSet = jest.fn();

jest.mock('../../api/firestore', () => ({
  ratsFirestore: { runTransaction: mockRunTransaction },
  houseCollection: {
    where: jest.fn(() => ({ get: jest.fn().mockResolvedValue({ docs: [], size: 0 }) })),
    get: jest.fn().mockResolvedValue({ docs: [], size: 0 }),
  },
  guestCollection: {
    where: jest.fn(() => ({
      where: jest.fn(() => ({ get: jest.fn().mockResolvedValue({ docs: [], size: 0 }) })),
    })),
  },
  weekSummariesCollection: {
    doc: jest.fn(() => ({ set: mockWeekSummariesSet })),
  },
  reportCollection: {},
  app: {},
}));

jest.mock('../../util/house', () => ({
  calculateWeeklyHealth: jest.fn(),
}));

import { advanceGuestWeek, getFailedTransfers, transferStats } from '../../util/guest';
import { getCurrentWeekStart } from '../../util/week';

beforeEach(() => {
  jest.clearAllMocks();
  mockWeekSummariesDoc.mockReturnValue({ set: mockWeekSummariesSet });
});

// ---------------------------------------------------------------------------
// advanceGuestWeek
// ---------------------------------------------------------------------------

describe('advanceGuestWeek', () => {
  it('advances the guest week when the current week has ended', async () => {
    const guestRef = {} as any;
    const guest = {
      id: 'guest-1',
      firstName: 'John',
      lastName: 'Doe',
      houseId: 'house-1',
      currentWeekStartDate: '2020-01-06',
    } as any;

    const mockTxUpdate = jest.fn();
    const mockTxSet = jest.fn();
    const mockTxGet = jest.fn().mockResolvedValue({
      exists: true,
      data: () => ({ ...guest }),
    });

    mockRunTransaction.mockImplementation(async (fn: Function) => {
      const tx = { get: mockTxGet, update: mockTxUpdate, set: mockTxSet };
      return fn(tx);
    });

    const result = await advanceGuestWeek(guestRef, guest);

    expect(mockTxUpdate).toHaveBeenCalled();
    expect(result.currentWeekStartDate).not.toBe('2020-01-06');
  });

  it('sets the next week start date correctly when advancing', async () => {
    const guestRef = {} as any;
    const pastMonday = '2020-01-06'; // a past Monday
    const guest = {
      id: 'guest-2',
      firstName: 'Alice',
      lastName: 'Smith',
      houseId: 'house-1',
      currentWeekStartDate: pastMonday,
    } as any;

    const mockTxUpdate = jest.fn();
    const mockTxSet = jest.fn();
    const mockTxGet = jest.fn().mockResolvedValue({
      exists: true,
      data: () => ({ ...guest }),
    });

    mockRunTransaction.mockImplementation(async (fn: Function) => {
      const tx = { get: mockTxGet, update: mockTxUpdate, set: mockTxSet };
      return fn(tx);
    });

    const result = await advanceGuestWeek(guestRef, guest);

    // Next week after 2020-01-06 (Monday) is 2020-01-13
    expect(result.currentWeekStartDate).toBe('2020-01-13');
  });

  it('skips advance when guest week is already current', async () => {
    const currentMonday = getCurrentWeekStart();

    const guestRef = {} as any;
    const guest = {
      id: 'guest-3',
      firstName: 'Jane',
      lastName: 'Doe',
      houseId: 'house-1',
      currentWeekStartDate: currentMonday,
    } as any;

    const mockTxUpdate = jest.fn();
    const mockTxGet = jest.fn().mockResolvedValue({
      exists: true,
      data: () => ({ ...guest }),
    });

    mockRunTransaction.mockImplementation(async (fn: Function) => {
      const tx = { get: mockTxGet, update: mockTxUpdate, set: jest.fn() };
      return fn(tx);
    });

    const result = await advanceGuestWeek(guestRef, guest);

    expect(mockTxUpdate).not.toHaveBeenCalled();
    expect(result.currentWeekStartDate).toBe(currentMonday);
  });

  it('throws when the guest document no longer exists', async () => {
    const guestRef = {} as any;
    const guest = {
      id: 'ghost-guest',
      firstName: 'Ghost',
      lastName: 'User',
      houseId: 'house-1',
      currentWeekStartDate: '2020-01-06',
    } as any;

    mockRunTransaction.mockImplementation(async (fn: Function) => {
      const tx = {
        get: jest.fn().mockResolvedValue({ exists: false }),
        update: jest.fn(),
        set: jest.fn(),
      };
      return fn(tx);
    });

    await expect(advanceGuestWeek(guestRef, guest)).rejects.toThrow(
      `Guest ${guest.id} no longer exists`
    );
  });

  it('calls transaction.set to pre-create the week summary document', async () => {
    const guestRef = {} as any;
    const guest = {
      id: 'guest-4',
      firstName: 'Bob',
      lastName: 'Builder',
      houseId: 'house-2',
      currentWeekStartDate: '2020-01-06',
    } as any;

    const mockTxUpdate = jest.fn();
    const mockTxSet = jest.fn();
    const mockTxGet = jest.fn().mockResolvedValue({
      exists: true,
      data: () => ({ ...guest }),
    });

    mockRunTransaction.mockImplementation(async (fn: Function) => {
      const tx = { get: mockTxGet, update: mockTxUpdate, set: mockTxSet };
      return fn(tx);
    });

    await advanceGuestWeek(guestRef, guest);

    // transaction.set should be called once to pre-create the week summary
    expect(mockTxSet).toHaveBeenCalledTimes(1);
  });

  it('propagates transaction errors to the caller', async () => {
    const guestRef = {} as any;
    const guest = {
      id: 'guest-5',
      firstName: 'Error',
      lastName: 'Prone',
      houseId: 'house-1',
      currentWeekStartDate: '2020-01-06',
    } as any;

    mockRunTransaction.mockRejectedValue(new Error('Firestore contention error'));

    await expect(advanceGuestWeek(guestRef, guest)).rejects.toThrow('Firestore contention error');
  });
});

// ---------------------------------------------------------------------------
// getFailedTransfers
// ---------------------------------------------------------------------------

describe('getFailedTransfers', () => {
  it('returns an array', () => {
    expect(Array.isArray(getFailedTransfers())).toBe(true);
  });

  it('returns an empty array when no transfers have failed', () => {
    const transfers = getFailedTransfers();
    expect(transfers).toHaveLength(0);
  });

  it('returns a copy of the internal array, not the same reference', () => {
    const first = getFailedTransfers();
    const second = getFailedTransfers();
    expect(first).not.toBe(second);
  });
});

// ---------------------------------------------------------------------------
// transferStats
// ---------------------------------------------------------------------------

describe('transferStats', () => {
  it('returns an empty guest map when there are no houses', async () => {
    const { houseCollection } = require('../../api/firestore');
    houseCollection.get.mockResolvedValue({ docs: [], size: 0 });

    const result = await transferStats(null);
    expect(result).toEqual({});
  });

  it('resets failed transfers at the start of each run', async () => {
    const { houseCollection } = require('../../api/firestore');
    houseCollection.get.mockResolvedValue({ docs: [], size: 0 });

    // Run once, then verify getFailedTransfers is empty afterward
    await transferStats(null);
    expect(getFailedTransfers()).toHaveLength(0);
  });

  it('filters houses by houseId when provided', async () => {
    const { houseCollection } = require('../../api/firestore');
    const mockWhere = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({ docs: [], size: 0 }),
    });
    houseCollection.where = mockWhere;

    await transferStats(null, null, 'house-abc');

    expect(mockWhere).toHaveBeenCalledWith('id', '==', 'house-abc');
  });

  it('filters houses by timezone when provided', async () => {
    const { houseCollection } = require('../../api/firestore');
    const mockWhere = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({ docs: [], size: 0 }),
    });
    houseCollection.where = mockWhere;

    await transferStats(null, 'America/New_York');

    expect(mockWhere).toHaveBeenCalledWith('timezone', '==', 'America/New_York');
  });
});
