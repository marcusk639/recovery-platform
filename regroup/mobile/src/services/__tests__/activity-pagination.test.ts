/**
 * Activity Pagination Tests
 *
 * Tests for getActivitiesPage() — the cursor-based pagination helper added
 * to activity.ts. Validates first-page, subsequent-page, last-page, and
 * empty-page behaviour as well as optional type filtering.
 */

import {
  Activity,
  ActivityType,
  ActivityStatus,
  ActivityDataFactory,
} from '../../entities/ActivityModel';

// Mock Firebase before importing the service
jest.mock('../../../firebase-setup', () => ({
  firestore: {
    collection: jest.fn(),
  },
}));

jest.mock('@react-native-firebase/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => new Date('2024-01-15T10:00:00Z'),
    delete: () => '__DELETE__',
  },
  Timestamp: {
    fromDate: (date: Date) => date,
  },
}));

jest.mock('../../util/logging', () => ({
  logException: jest.fn(),
}));

import { firestore } from '../../../firebase-setup';
import { getActivitiesPage } from '../activity';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Firestore document snapshot stub */
function makeDocStub(activity: Activity) {
  return {
    id: activity.id,
    data: () => ({
      ...activity,
      timestamp: { toDate: () => new Date(activity.timestamp as string) },
      loggedAt: { toDate: () => new Date(activity.loggedAt as string) },
    }),
  };
}

/** Build a minimal Firestore DocumentSnapshot that can act as a cursor */
function makeCursorStub(id: string) {
  return { id, _isCursor: true };
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const GUEST_ID = 'guest_pag_test';
const HOUSE_ID = 'house_pag_test';
const START_DATE = new Date('2024-02-01T00:00:00Z');
const END_DATE = new Date('2024-02-08T00:00:00Z');

function makeActivity(id: string, type: ActivityType = ActivityType.CHORE): Activity {
  return {
    id,
    guestId: GUEST_ID,
    houseId: HOUSE_ID,
    type,
    timestamp: new Date('2024-02-05T10:00:00Z'),
    data: ActivityDataFactory.chore('daily', 'Kitchen'),
    loggedBy: 'user_test',
    loggedAt: new Date('2024-02-05T10:01:00Z'),
    verified: false,
    status: ActivityStatus.ACTIVE,
  };
}

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------

/**
 * Build a mock Firestore collection whose .get() returns `docs`.
 *
 * The mock tracks whether `.startAfter()` and `.limit()` were called so
 * individual tests can assert correct query construction.
 */
function buildMockCollection(docs: ReturnType<typeof makeDocStub>[]) {
  const mock: any = {
    _startAfterArg: undefined as any,
    _limitArg: undefined as number | undefined,
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    startAfter: jest.fn(function (cursor: any) {
      mock._startAfterArg = cursor;
      return mock;
    }),
    limit: jest.fn(function (n: number) {
      mock._limitArg = n;
      return mock;
    }),
    get: jest.fn(async () => ({ docs })),
  };
  return mock;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getActivitiesPage', () => {
  let mockCollection: ReturnType<typeof buildMockCollection>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // First page — no cursor, full page available
  // -------------------------------------------------------------------------

  describe('first page (no cursor)', () => {
    beforeEach(() => {
      // Simulate 20 real docs + 1 overflow doc → hasMore should be true
      const twentyOneDocs = Array.from({ length: 21 }, (_, i) =>
        makeDocStub(makeActivity(`act_${i + 1}`)),
      );
      mockCollection = buildMockCollection(twentyOneDocs);
      (firestore.collection as jest.Mock).mockReturnValue(mockCollection);
    });

    it('returns exactly pageSize activities', async () => {
      const page = await getActivitiesPage(GUEST_ID, START_DATE, END_DATE, 20);
      expect(page.activities).toHaveLength(20);
    });

    it('sets hasMore to true when an extra doc is present', async () => {
      const page = await getActivitiesPage(GUEST_ID, START_DATE, END_DATE, 20);
      expect(page.hasMore).toBe(true);
    });

    it('returns a non-null nextCursor pointing to the last returned doc', async () => {
      const page = await getActivitiesPage(GUEST_ID, START_DATE, END_DATE, 20);
      expect(page.nextCursor).not.toBeNull();
      // The cursor should be the 20th (last kept) document stub
      expect((page.nextCursor as any).id).toBe('act_20');
    });

    it('does NOT call startAfter on the first page', async () => {
      await getActivitiesPage(GUEST_ID, START_DATE, END_DATE, 20);
      expect(mockCollection.startAfter).not.toHaveBeenCalled();
    });

    it('calls .limit() with pageSize + 1', async () => {
      await getActivitiesPage(GUEST_ID, START_DATE, END_DATE, 20);
      expect(mockCollection.limit).toHaveBeenCalledWith(21);
    });

    it('uses a custom pageSize', async () => {
      // Override with only 6 docs so first 5 are returned and hasMore = true
      const sixDocs = Array.from({ length: 6 }, (_, i) =>
        makeDocStub(makeActivity(`act_${i + 1}`)),
      );
      mockCollection = buildMockCollection(sixDocs);
      (firestore.collection as jest.Mock).mockReturnValue(mockCollection);

      const page = await getActivitiesPage(GUEST_ID, START_DATE, END_DATE, 5);
      expect(page.activities).toHaveLength(5);
      expect(page.hasMore).toBe(true);
      expect(mockCollection.limit).toHaveBeenCalledWith(6);
    });
  });

  // -------------------------------------------------------------------------
  // Second page — cursor provided
  // -------------------------------------------------------------------------

  describe('second page (with cursor)', () => {
    const cursor = makeCursorStub('act_20');

    beforeEach(() => {
      // 15 more docs — less than a full page → last page
      const fifteenDocs = Array.from({ length: 15 }, (_, i) =>
        makeDocStub(makeActivity(`act_${21 + i}`)),
      );
      mockCollection = buildMockCollection(fifteenDocs);
      (firestore.collection as jest.Mock).mockReturnValue(mockCollection);
    });

    it('calls .startAfter() with the provided cursor', async () => {
      await getActivitiesPage(GUEST_ID, START_DATE, END_DATE, 20, cursor as any);
      expect(mockCollection.startAfter).toHaveBeenCalledWith(cursor);
    });

    it('returns the correct activities from the second page', async () => {
      const page = await getActivitiesPage(GUEST_ID, START_DATE, END_DATE, 20, cursor as any);
      expect(page.activities).toHaveLength(15);
      expect(page.activities[0].id).toBe('act_21');
    });

    it('sets hasMore to false when fewer than pageSize docs are returned', async () => {
      const page = await getActivitiesPage(GUEST_ID, START_DATE, END_DATE, 20, cursor as any);
      expect(page.hasMore).toBe(false);
    });

    it('sets nextCursor to null on the last page', async () => {
      const page = await getActivitiesPage(GUEST_ID, START_DATE, END_DATE, 20, cursor as any);
      expect(page.nextCursor).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Last page — exactly pageSize docs (no overflow)
  // -------------------------------------------------------------------------

  describe('last page — exactly pageSize docs returned', () => {
    beforeEach(() => {
      // Exactly 20 docs — Firestore never sends an overflow doc
      const twentyDocs = Array.from({ length: 20 }, (_, i) =>
        makeDocStub(makeActivity(`act_${i + 1}`)),
      );
      mockCollection = buildMockCollection(twentyDocs);
      (firestore.collection as jest.Mock).mockReturnValue(mockCollection);
    });

    it('sets hasMore to false', async () => {
      const page = await getActivitiesPage(GUEST_ID, START_DATE, END_DATE, 20);
      expect(page.hasMore).toBe(false);
    });

    it('sets nextCursor to null', async () => {
      const page = await getActivitiesPage(GUEST_ID, START_DATE, END_DATE, 20);
      expect(page.nextCursor).toBeNull();
    });

    it('returns all 20 activities', async () => {
      const page = await getActivitiesPage(GUEST_ID, START_DATE, END_DATE, 20);
      expect(page.activities).toHaveLength(20);
    });
  });

  // -------------------------------------------------------------------------
  // Empty result
  // -------------------------------------------------------------------------

  describe('empty result', () => {
    beforeEach(() => {
      mockCollection = buildMockCollection([]);
      (firestore.collection as jest.Mock).mockReturnValue(mockCollection);
    });

    it('returns an empty activities array', async () => {
      const page = await getActivitiesPage(GUEST_ID, START_DATE, END_DATE, 20);
      expect(page.activities).toHaveLength(0);
    });

    it('sets hasMore to false', async () => {
      const page = await getActivitiesPage(GUEST_ID, START_DATE, END_DATE, 20);
      expect(page.hasMore).toBe(false);
    });

    it('sets nextCursor to null', async () => {
      const page = await getActivitiesPage(GUEST_ID, START_DATE, END_DATE, 20);
      expect(page.nextCursor).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Type filter
  // -------------------------------------------------------------------------

  describe('type filter', () => {
    beforeEach(() => {
      const docs = [
        makeDocStub(makeActivity('meet_1', ActivityType.MEETING)),
        makeDocStub(makeActivity('meet_2', ActivityType.MEETING)),
      ];
      mockCollection = buildMockCollection(docs);
      (firestore.collection as jest.Mock).mockReturnValue(mockCollection);
    });

    it('applies the type filter to the Firestore query', async () => {
      await getActivitiesPage(GUEST_ID, START_DATE, END_DATE, 20, undefined, ActivityType.MEETING);
      // The .where() calls include type filter — verify 'type' was passed
      const whereCalls: [string, string, any][] = mockCollection.where.mock.calls;
      const typeCall = whereCalls.find(([field]) => field === 'type');
      expect(typeCall).toBeDefined();
      expect(typeCall![2]).toBe(ActivityType.MEETING);
    });

    it('returns activities with the filtered type', async () => {
      const page = await getActivitiesPage(
        GUEST_ID,
        START_DATE,
        END_DATE,
        20,
        undefined,
        ActivityType.MEETING,
      );
      expect(page.activities).toHaveLength(2);
      expect(page.activities.every(a => a.type === ActivityType.MEETING)).toBe(true);
    });

    it('does NOT add type filter to query when type is undefined', async () => {
      await getActivitiesPage(GUEST_ID, START_DATE, END_DATE, 20, undefined, undefined);
      const whereCalls: [string, string, any][] = mockCollection.where.mock.calls;
      const typeCall = whereCalls.find(([field]) => field === 'type');
      expect(typeCall).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('throws a descriptive error when Firestore fails', async () => {
      const brokenCollection = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockRejectedValue(new Error('Firestore unavailable')),
      };
      (firestore.collection as jest.Mock).mockReturnValue(brokenCollection);

      await expect(
        getActivitiesPage(GUEST_ID, START_DATE, END_DATE, 20),
      ).rejects.toThrow('Failed to get activities page');
    });
  });
});
