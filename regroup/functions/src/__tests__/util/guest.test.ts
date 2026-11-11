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

import {
  advanceGuestWeek,
  getFailedHouses,
  getFailedTransfers,
  transferStats,
} from '../../util/guest';
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

  it('catches a resident who missed weeks up to the current week', async () => {
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

    // A resident whose week didn't advance (a failed run, which isn't retried) is
    // caught up to the current week, not moved one week and left behind for good.
    expect(result.currentWeekStartDate).toBe(getCurrentWeekStart());
    expect(mockTxUpdate).toHaveBeenCalledWith(
      guestRef,
      expect.objectContaining({
        currentWeekStartDate: getCurrentWeekStart(),
        currentWeekId: `guest-2_${getCurrentWeekStart()}`,
      }),
    );
  });

  it('moves a resident with no week date to the current week, not the next one', async () => {
    const guestRef = {} as any;
    const guest = { id: 'guest-5', houseId: 'house-1' } as any;
    const mockTxUpdate = jest.fn();
    mockRunTransaction.mockImplementation(async (fn: Function) =>
      fn({
        get: jest.fn().mockResolvedValue({ exists: true, data: () => ({ ...guest }) }),
        update: mockTxUpdate,
        set: jest.fn(),
      }),
    );

    const result = await advanceGuestWeek(guestRef, guest);

    expect(result.currentWeekStartDate).toBe(getCurrentWeekStart());
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
      `Guest ${guest.id} no longer exists`,
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
    // The guest exists; the next week's summary does not yet.
    const mockTxGet = jest.fn(async (ref: unknown) =>
      ref === guestRef
        ? { exists: true, data: () => ({ ...guest }) }
        : { exists: false, data: () => undefined },
    );

    mockRunTransaction.mockImplementation(async (fn: Function) => {
      const tx = { get: mockTxGet, update: mockTxUpdate, set: mockTxSet };
      return fn(tx);
    });

    await advanceGuestWeek(guestRef, guest);

    // transaction.set should be called once to pre-create the week summary,
    // as a plain create (no merge) of a zeroed doc.
    expect(mockTxSet).toHaveBeenCalledTimes(1);
    expect(mockTxSet.mock.calls[0]).toHaveLength(2);
    expect(mockTxSet.mock.calls[0][1]).toMatchObject({ activityCount: 0, guestId: 'guest-4' });
  });

  it('does not overwrite a summary the trigger already filled (activity logged before the advance)', async () => {
    const guestRef = {} as any;
    const guest = {
      id: 'guest-5',
      houseId: 'house-2',
      currentWeekStartDate: '2020-01-06',
    } as any;
    const filled = {
      exists: true,
      data: () => ({ stats: { choresCompleted: 3 }, activityCount: 3 }),
    };

    const mockTxUpdate = jest.fn();
    const mockTxSet = jest.fn();
    const mockTxGet = jest.fn(async (ref: unknown) =>
      ref === guestRef ? { exists: true, data: () => ({ ...guest }) } : filled,
    );
    mockRunTransaction.mockImplementation(async (fn: Function) =>
      fn({ get: mockTxGet, update: mockTxUpdate, set: mockTxSet }),
    );

    await advanceGuestWeek(guestRef, guest);

    // The guest still advances, but the summary (and its stats) is untouched.
    expect(mockTxUpdate).toHaveBeenCalled();
    expect(mockTxSet).not.toHaveBeenCalled();
  });

  it('reads the summary before writing anything in the transaction', async () => {
    const guestRef = {} as any;
    const guest = { id: 'guest-6', houseId: 'house-2', currentWeekStartDate: '2020-01-06' } as any;
    const order: string[] = [];
    mockRunTransaction.mockImplementation(async (fn: Function) =>
      fn({
        get: jest.fn(async (ref: unknown) => {
          order.push('get');
          return ref === guestRef
            ? { exists: true, data: () => ({ ...guest }) }
            : { exists: false, data: () => undefined };
        }),
        update: jest.fn(() => order.push('update')),
        set: jest.fn(() => order.push('set')),
      }),
    );

    await advanceGuestWeek(guestRef, guest);

    expect(order).toEqual(['get', 'get', 'update', 'set']);
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

  describe('logging carries ids only (no house name)', () => {
    const HOUSE_NAME = 'Sunrise Recovery House';

    const loggedText = () => {
      const { logger } = require('firebase-functions');
      return JSON.stringify([
        ...logger.info.mock.calls,
        ...logger.warn.mock.calls,
        ...logger.error.mock.calls,
      ]);
    };

    const runWithHouse = async () => {
      const { houseCollection } = require('../../api/firestore');
      houseCollection.get.mockResolvedValue({
        size: 1,
        docs: [
          {
            data: () => ({ id: 'house-9', name: HOUSE_NAME }),
            ref: { update: jest.fn().mockResolvedValue(undefined) },
          },
        ],
      });
      await transferStats(null);
    };

    it('does not log the house name on the happy path', async () => {
      await runWithHouse();
      expect(loggedText()).toContain('house-9');
      expect(loggedText()).not.toContain(HOUSE_NAME);
    });

    it('does not log the house name when the health update fails', async () => {
      const { calculateWeeklyHealth } = require('../../util/house');
      calculateWeeklyHealth.mockRejectedValueOnce(new Error('boom'));
      await runWithHouse();
      const { logger } = require('firebase-functions');
      expect(logger.warn).toHaveBeenCalled();
      expect(loggedText()).not.toContain(HOUSE_NAME);
    });

    it('does not log the house name when processing the house throws', async () => {
      const { guestCollection } = require('../../api/firestore');
      const originalWhere = guestCollection.where;
      guestCollection.where = jest.fn(() => {
        throw new Error('query failed');
      });
      try {
        await runWithHouse();
      } finally {
        guestCollection.where = originalWhere;
      }
      const { logger } = require('firebase-functions');
      expect(logger.error).toHaveBeenCalled();
      expect(loggedText()).not.toContain(HOUSE_NAME);
    });
  });

  // The house error is caught so the other houses still roll over; the scheduled
  // run reads getFailedHouses to fail the run (scheduled/weeklyTransfers).
  it('records a house that fails to process, and clears it at the next run', async () => {
    const { houseCollection, guestCollection } = require('../../api/firestore');
    houseCollection.get.mockResolvedValue({
      size: 1,
      docs: [{ data: () => ({ id: 'house-7' }), ref: { update: jest.fn() } }],
    });
    const originalWhere = guestCollection.where;
    guestCollection.where = jest.fn(() => {
      throw new Error('query failed');
    });
    try {
      await transferStats(null);
    } finally {
      guestCollection.where = originalWhere;
    }
    expect(getFailedHouses()).toEqual(['house-7']);

    houseCollection.get.mockResolvedValue({ docs: [], size: 0 });
    await transferStats(null);
    expect(getFailedHouses()).toEqual([]);
  });

  describe('with residents', () => {
    const { guestCollection } = require('../../api/firestore');
    const originalWhere = guestCollection.where;
    const resident = (id: string) => ({
      ref: { id },
      data: () => ({ id, houseId: 'house-1', currentWeekStartDate: '2020-01-06' }),
    });
    const withResidents = (docs: unknown[]) => {
      guestCollection.where = jest.fn(() => ({
        where: jest.fn(() => ({ get: jest.fn().mockResolvedValue({ docs, size: docs.length }) })),
      }));
    };
    const house = (data: Record<string, unknown>) => ({
      data: () => data,
      ref: { update: jest.fn().mockResolvedValue(undefined) },
    });
    // Each resident's transaction reads their own doc, so it sees that resident.
    const advanceAll = (failFor?: string) =>
      mockRunTransaction.mockImplementation(async (fn: Function) => {
        let current: any;
        return fn({
          get: jest.fn(async (ref: { id?: string }) => {
            if (ref?.id) {
              if (ref.id === failFor) {
                throw Object.assign(new Error('denied'), { code: 'permission-denied' });
              }
              current = { id: ref.id, houseId: 'house-1', currentWeekStartDate: '2020-01-06' };
              return { exists: true, data: () => current };
            }
            return { exists: false };
          }),
          update: jest.fn(),
          set: jest.fn(),
        });
      });

    afterEach(() => {
      guestCollection.where = originalWhere;
    });

    // The scheduled run reads getFailedTransfers after each pass to fail the run.
    it('records a resident whose week fails to advance, keeps going, and clears it next run', async () => {
      const { houseCollection } = require('../../api/firestore');
      houseCollection.get.mockResolvedValue({ size: 1, docs: [house({ id: 'house-1' })] });
      withResidents([resident('g-bad'), resident('g-ok')]);
      advanceAll('g-bad');

      const moved = await transferStats(null);

      expect(getFailedTransfers()).toEqual([
        expect.objectContaining({ guestId: 'g-bad', houseId: 'house-1' }),
      ]);
      expect(Object.keys(moved)).toEqual(['g-ok']);

      advanceAll();
      await transferStats(null);
      expect(getFailedTransfers()).toEqual([]);
    });

    // A house whose timezone has no pass of its own would otherwise match no pass and
    // never roll over: the timezone passes skip it, and so did the fallback pass.
    it('rolls over a house in an unlisted timezone in the fallback pass', async () => {
      const { houseCollection } = require('../../api/firestore');
      houseCollection.get.mockResolvedValue({
        size: 3,
        docs: [
          house({ id: 'house-phx', timezone: 'America/Phoenix' }),
          house({ id: 'house-nyc', timezone: 'America/New_York' }),
          house({ id: 'house-none' }),
        ],
      });
      withResidents([resident('g1')]);
      advanceAll();

      await transferStats(null, null);

      const houseIds = (guestCollection.where as jest.Mock).mock.calls.map((c) => c[2]);
      expect(houseIds).toEqual(['house-phx', 'house-none']);
    });
  });
});
