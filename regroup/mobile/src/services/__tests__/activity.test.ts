/**
 * Activity Service Integration Tests
 *
 * Comprehensive tests for activity.ts service with mocked Firestore.
 * Tests CRUD operations, summary generation, and edge cases.
 */

import {
  Activity,
  ActivityType,
  ActivityStatus,
  ActivityDataFactory,
  countsTowardStats,
} from '../../entities/ActivityModel';
import { WeekSummary } from '../../entities/WeekSummary';

// Mock Firebase before importing the service.
//
// week-summaries are owned by the onActivityWritten Cloud Function, so the
// service must never touch them. runTransaction and the week-summaries
// collection stay mocked so the tests below can prove that: they record
// calls, and denySummaryWrites() makes them reject like the production rules
// do for a resident.
jest.mock('../../../firebase-setup', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { firestore: _unused } = { firestore: {} };
  return {
    firestore: {
      collection: jest.fn(),
      // runTransaction is wired per-test in beforeEach to delegate to the
      // mockWeekSummaryCollection's `.doc().get()` / `.set()`. The default
      // implementation simply invokes the callback with stub tx methods —
      // tests that exercise the increment path override this in beforeEach.
      runTransaction: jest.fn(async (fn: any) => {
        const stubTx = {
          get: jest.fn(async () => ({ exists: false, data: () => undefined })),
          set: jest.fn(),
        };
        return fn(stubTx);
      }),
    },
  };
});

jest.mock('@react-native-firebase/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => new Date('2024-01-15T10:00:00Z'),
    delete: () => '__DELETE__',
    // increment returns a sentinel object the test can recognize. The
    // mockWeekSummaryCollection.set handler resolves these into numeric
    // additions when merging.
    increment: (n: number) => ({ __increment: n }),
  },
  Timestamp: {
    fromDate: (date: Date) => date,
  },
}));

// Mock logging utility
jest.mock('../../util/logging', () => ({
  logException: jest.fn(),
}));

// Import firestore mock reference (resolves to mocked version after hoisting)
import { firestore } from '../../../firebase-setup';

// Import after mocks are set up
import * as activityService from '../activity';
import {
  logActivity,
  getActivities,
  getHouseActivities,
  getWeekSummary,
  updateActivity,
  deleteActivity,
  disputeActivity,
  resolveDispute,
  verifyActivity,
  DISPUTED_NOT_DELETABLE,
} from '../activity';

const permissionDenied = () =>
  Object.assign(new Error('Missing or insufficient permissions.'), {
    code: 'firestore/permission-denied',
  });

/** Did the service open the week-summaries collection at all? */
const touchedWeekSummaries = () =>
  (firestore.collection as jest.Mock).mock.calls.some(
    ([name]) => name === 'week-summaries',
  );

/** The working runTransaction installed in beforeEach (resolveDispute uses one). */
let workingRunTransaction: jest.Mock;

describe('Activity Service', () => {
  let mockActivityCollection: any;
  let mockWeekSummaryCollection: any;
  let mockActivities: Activity[] = [];
  let mockSummaries: Map<string, WeekSummary> = new Map();

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    mockActivities = [];
    mockSummaries = new Map();

    // Track WHERE clause filters for this test's query chain
    const capturedFilters: { field: string; op: string; value: any }[] = [];

    // Helper to apply captured WHERE filters to mockActivities
    const applyFilters = (items: Activity[]) =>
      items.filter(a =>
        capturedFilters.every(f => {
          const val = (a as any)[f.field];
          if (f.op === '==') return val === f.value;
          if (f.op === 'in') return (f.value as unknown[]).includes(val);
          const av = val instanceof Date ? val : new Date(val);
          const fv = f.value instanceof Date ? f.value : new Date(f.value);
          if (f.op === '>=') return av >= fv;
          if (f.op === '<') return av < fv;
          return true;
        }),
      );

    // Setup mock activity collection
    mockActivityCollection = {
      add: jest.fn(async (data: Omit<Activity, 'id'>) => {
        const newActivity: Activity = {
          id: `activity_${mockActivities.length + 1}`,
          ...data,
          loggedAt: new Date('2024-01-15T10:00:00Z'),
        };
        mockActivities.push(newActivity);
        return { id: newActivity.id };
      }),
      where: jest.fn((field: string, op: string, value: any) => {
        capturedFilters.push({ field, op, value });
        return mockActivityCollection;
      }),
      orderBy: jest.fn(() => mockActivityCollection),
      limit: jest.fn(() => mockActivityCollection),
      get: jest.fn(async () => {
        const filtered = applyFilters(mockActivities);
        capturedFilters.length = 0; // reset after each get()
        return {
          docs: filtered.map(activity => ({
            id: activity.id,
            data: () => ({
              ...activity,
              timestamp: { toDate: () => new Date(activity.timestamp) },
              loggedAt: { toDate: () => new Date(activity.loggedAt) },
            }),
          })),
        };
      }),
      doc: jest.fn((id: string) => ({
        get: jest.fn(async () => {
          const activity = mockActivities.find(a => a.id === id);
          return {
            exists: !!activity,
            id,
            data: () => activity,
          };
        }),
        update: jest.fn(async (updates: Partial<Activity>) => {
          const index = mockActivities.findIndex(a => a.id === id);
          if (index !== -1) {
            mockActivities[index] = { ...mockActivities[index], ...updates };
          }
        }),
      })),
      onSnapshot: jest.fn(callback => {
        callback({
          docs: mockActivities.map(activity => ({
            id: activity.id,
            data: () => ({
              ...activity,
              timestamp: { toDate: () => new Date(activity.timestamp) },
              loggedAt: { toDate: () => new Date(activity.loggedAt) },
            }),
          })),
        });
        return jest.fn(); // Unsubscribe function
      }),
    };

    // ─── Increment / dot-path merge helpers ────────────────────────────────
    //
    // After the P1 refactor, week-summary writes use:
    //   - FieldValue.increment(n) sentinels (mocked above as { __increment: n })
    //   - Dot-notation paths like `stats.choresCompleted` and
    //     `dailyStats.2024-01-15.choresCompleted`
    // applyMergeUpdates resolves both into the existing in-memory object so
    // assertions reading `mockSummaries.get(id).stats.choresCompleted`
    // still see the expected integer.
    const isIncrement = (v: any) =>
      v && typeof v === 'object' && typeof v.__increment === 'number';

    const setNested = (root: any, dotPath: string, value: any) => {
      const parts = dotPath.split('.');
      let cur = root;
      for (let i = 0; i < parts.length - 1; i++) {
        const k = parts[i];
        if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
        cur = cur[k];
      }
      const lastKey = parts[parts.length - 1];
      if (isIncrement(value)) {
        const prior = typeof cur[lastKey] === 'number' ? cur[lastKey] : 0;
        cur[lastKey] = prior + value.__increment;
      } else {
        cur[lastKey] = value;
      }
    };

    const applyMergeUpdates = (target: any, updates: Record<string, any>) => {
      for (const [key, val] of Object.entries(updates)) {
        if (key.includes('.')) {
          setNested(target, key, val);
        } else if (isIncrement(val)) {
          const prior = typeof target[key] === 'number' ? target[key] : 0;
          target[key] = prior + val.__increment;
        } else {
          target[key] = val;
        }
      }
    };

    // Setup mock week summary collection
    mockWeekSummaryCollection = {
      doc: jest.fn((id: string) => ({
        get: jest.fn(async () => {
          const summary = mockSummaries.get(id);
          return {
            exists: !!summary,
            id,
            data: () => summary,
          };
        }),
        set: jest.fn(async (data: any, options?: any) => {
          if (options?.merge) {
            const existing = (mockSummaries.get(id) ?? {}) as any;
            applyMergeUpdates(existing, data);
            mockSummaries.set(id, existing as WeekSummary);
          } else {
            // Non-merge: write data wholesale, but still resolve any nested
            // increment sentinels (the initialize branch of
            // incrementWeekSummaryForActivity writes plain numbers, not
            // increments — this is defensive).
            mockSummaries.set(id, data as WeekSummary);
          }
        }),
      })),
    };

    // Mock firestore.collection to return appropriate mock
    (firestore.collection as jest.Mock).mockImplementation((name: string) => {
      if (name === 'activities') return mockActivityCollection;
      if (name === 'week-summaries') return mockWeekSummaryCollection;
      return {};
    });

    // runTransaction stub: delegates tx.get / tx.set to the same in-memory
    // summary store the rest of the test uses. The P1 incrementer is the
    // only code path that hits runTransaction in this service.
    (firestore as any).runTransaction = jest.fn(async (fn: any) => {
      const tx = {
        get: async (ref: any) => {
          // The ref is whatever firestore.collection().doc() returned —
          // call ref.get() to fetch.
          return ref.get();
        },
        set: (ref: any, data: any, options?: any) => {
          // Delegate to the ref's own set (sync in the mock).
          return ref.set(data, options);
        },
        update: (ref: any, data: any) => ref.update(data),
      };
      return fn(tx);
    });
    workingRunTransaction = (firestore as any).runTransaction;
  });

  // ==========================================================================
  // logActivity Tests
  // ==========================================================================

  describe('logActivity', () => {
    it('rethrows the original Firestore error so its code is preserved', async () => {
      const original = Object.assign(new Error('denied'), { code: 'permission-denied' });
      mockActivityCollection.add.mockRejectedValueOnce(original);

      await expect(
        logActivity(
          'guest123',
          'house456',
          ActivityType.CHORE,
          ActivityDataFactory.chore('daily', 'Kitchen'),
          'user789',
        ),
      ).rejects.toBe(original);
    });

    it('should create chore activity', async () => {
      const activity = await logActivity(
        'guest123',
        'house456',
        ActivityType.CHORE,
        ActivityDataFactory.chore('daily', 'Kitchen'),
        'user789',
      );

      expect(activity.id).toBe('activity_1');
      expect(activity.guestId).toBe('guest123');
      expect(activity.houseId).toBe('house456');
      expect(activity.type).toBe(ActivityType.CHORE);
      expect(activity.verified).toBe(false);
      expect(activity.status).toBe(ActivityStatus.ACTIVE);
      expect(mockActivities).toHaveLength(1);
    });

    it('should create meeting activity', async () => {
      const activity = await logActivity(
        'guest123',
        'house456',
        ActivityType.MEETING,
        ActivityDataFactory.meeting('AA Meeting', 'AA', 60),
        'user789',
      );

      expect(activity.type).toBe(ActivityType.MEETING);
      expect(mockActivities).toHaveLength(1);
    });

    it('should create work activity', async () => {
      const activity = await logActivity(
        'guest123',
        'house456',
        ActivityType.WORK,
        ActivityDataFactory.work('Server', 8),
        'user789',
      );

      expect(activity.type).toBe(ActivityType.WORK);
      expect(mockActivities).toHaveLength(1);
    });

    it('should create medication activity', async () => {
      const activity = await logActivity(
        'guest123',
        'house456',
        ActivityType.MEDICATION,
        ActivityDataFactory.medication('Antabuse'),
        'user789',
      );

      expect(activity.type).toBe(ActivityType.MEDICATION);
      expect(mockActivities).toHaveLength(1);
    });

    it('should create primary supporter activity', async () => {
      const activity = await logActivity(
        'guest123',
        'house456',
        ActivityType.PRIMARY_SUPPORTER,
        ActivityDataFactory.primarySupporter('supporter123', 'John Sponsor'),
        'user789',
      );

      expect(activity.type).toBe(ActivityType.PRIMARY_SUPPORTER);
      expect(mockActivities).toHaveLength(1);
    });

    it('should use provided timestamp', async () => {
      const customTime = new Date('2024-01-20T15:30:00Z');

      const activity = await logActivity(
        'guest123',
        'house456',
        ActivityType.CHORE,
        ActivityDataFactory.chore('daily', 'Kitchen'),
        'user789',
        customTime,
      );

      expect(activity.timestamp).toEqual(customTime);
    });

    it('should use current time if no timestamp provided', async () => {
      const beforeTime = new Date();

      const activity = await logActivity(
        'guest123',
        'house456',
        ActivityType.CHORE,
        ActivityDataFactory.chore('daily', 'Kitchen'),
        'user789',
      );

      const afterTime = new Date();

      expect(new Date(activity.timestamp).getTime()).toBeGreaterThanOrEqual(
        beforeTime.getTime(),
      );
      expect(new Date(activity.timestamp).getTime()).toBeLessThanOrEqual(
        afterTime.getTime(),
      );
    });

    it('does not read or write week-summaries (the server trigger owns them)', async () => {
      await logActivity(
        'guest123',
        'house456',
        ActivityType.CHORE,
        ActivityDataFactory.chore('daily', 'Kitchen'),
        'user789',
        new Date('2024-01-15T10:00:00Z'),
      );

      expect(mockWeekSummaryCollection.doc).not.toHaveBeenCalled();
      expect(touchedWeekSummaries()).toBe(false);
    });
  });

  // ==========================================================================
  // getActivities Tests
  // ==========================================================================

  describe('getActivities', () => {
    beforeEach(async () => {
      // Create test activities
      await logActivity(
        'guest123',
        'house456',
        ActivityType.CHORE,
        ActivityDataFactory.chore('daily', 'Kitchen'),
        'user789',
        new Date('2024-01-15T10:00:00Z'),
      );

      await logActivity(
        'guest123',
        'house456',
        ActivityType.MEETING,
        ActivityDataFactory.meeting('AA', 'AA', 60),
        'user789',
        new Date('2024-01-16T19:00:00Z'),
      );

      await logActivity(
        'guest123',
        'house456',
        ActivityType.WORK,
        ActivityDataFactory.work('Server', 8),
        'user789',
        new Date('2024-01-17T09:00:00Z'),
      );

      await logActivity(
        'guest456',
        'house456',
        ActivityType.CHORE,
        ActivityDataFactory.chore('daily', 'Bathroom'),
        'user789',
        new Date('2024-01-15T11:00:00Z'),
      );
    });

    it('lists every counted activity: not deleted ones or approved disputes (incomplete)', async () => {
      const cases: Array<[string, Partial<Activity>]> = [
        ['active', { status: ActivityStatus.ACTIVE }],
        ['pending', { status: ActivityStatus.DISPUTED }],
        ['rejected', { status: ActivityStatus.RESOLVED, disputed: 'rejected', incomplete: false }],
        ['legacyKept', { status: ActivityStatus.RESOLVED }],
        ['approved', { status: ActivityStatus.RESOLVED, disputed: 'successful', incomplete: true }],
        ['deleted', { status: ActivityStatus.DELETED }],
      ];
      const ids: Record<string, string> = {};
      for (const [label, fields] of cases) {
        const a = await logActivity(
          'guest-status',
          'house456',
          ActivityType.CHORE,
          ActivityDataFactory.chore('daily', 'Kitchen'),
          'user789',
          new Date('2024-01-16T10:00:00Z'),
        );
        Object.assign(mockActivities.find(x => x.id === a.id)!, fields);
        ids[label] = a.id;
      }

      const listed = await getActivities(
        'guest-status',
        new Date('2024-01-15'),
        new Date('2024-01-22'),
      );

      expect(listed.map(a => a.id).sort()).toEqual(
        ['active', 'pending', 'rejected', 'legacyKept'].map(l => ids[l]).sort(),
      );
      expect(mockActivityCollection.where).toHaveBeenCalledWith('status', 'in', [
        ActivityStatus.ACTIVE,
        ActivityStatus.DISPUTED,
        ActivityStatus.RESOLVED,
      ]);
    });

    it('should get all activities for guest in date range', async () => {
      const activities = await getActivities(
        'guest123',
        new Date('2024-01-15'),
        new Date('2024-01-18'),
      );

      expect(activities).toHaveLength(3);
      expect(activities.every(a => a.guestId === 'guest123')).toBe(true);
    });

    it('should filter by activity type', async () => {
      const activities = await getActivities(
        'guest123',
        new Date('2024-01-15'),
        new Date('2024-01-18'),
        ActivityType.CHORE,
      );

      expect(activities).toHaveLength(1);
      expect(activities[0].type).toBe(ActivityType.CHORE);
    });

    it('should return empty array if no activities found', async () => {
      const activities = await getActivities(
        'guest999',
        new Date('2024-01-15'),
        new Date('2024-01-18'),
      );

      expect(activities).toHaveLength(0);
    });

    it('should convert Firebase timestamps to Date objects', async () => {
      const activities = await getActivities(
        'guest123',
        new Date('2024-01-15'),
        new Date('2024-01-18'),
      );

      activities.forEach(activity => {
        expect(activity.timestamp).toBeInstanceOf(Date);
        expect(activity.loggedAt).toBeInstanceOf(Date);
      });
    });
  });

  // ==========================================================================
  // getHouseActivities Tests
  // ==========================================================================

  describe('getHouseActivities', () => {
    beforeEach(async () => {
      // Create activities for different houses
      await logActivity(
        'guest1',
        'house123',
        ActivityType.CHORE,
        ActivityDataFactory.chore('daily', 'Kitchen'),
        'user789',
        new Date('2024-01-15T10:00:00Z'),
      );

      await logActivity(
        'guest2',
        'house123',
        ActivityType.MEETING,
        ActivityDataFactory.meeting('AA', 'AA', 60),
        'user789',
        new Date('2024-01-15T19:00:00Z'),
      );

      await logActivity(
        'guest3',
        'house456',
        ActivityType.WORK,
        ActivityDataFactory.work('Server', 8),
        'user789',
        new Date('2024-01-15T09:00:00Z'),
      );
    });

    it('should get all activities for a house', async () => {
      const activities = await getHouseActivities('house123');

      expect(activities).toHaveLength(2);
      expect(activities.every(a => a.houseId === 'house123')).toBe(true);
    });

    it('should respect limit parameter', async () => {
      // Create many activities
      for (let i = 0; i < 60; i++) {
        await logActivity(
          `guest${i}`,
          'house123',
          ActivityType.CHORE,
          ActivityDataFactory.chore('daily', 'Kitchen'),
          'user789',
          new Date('2024-01-15T10:00:00Z'),
        );
      }

      const activities = await getHouseActivities('house123', 50);

      expect(mockActivityCollection.limit).toHaveBeenCalledWith(50);
    });

    it('should use default limit of 50', async () => {
      await getHouseActivities('house123');

      expect(mockActivityCollection.limit).toHaveBeenCalledWith(50);
    });
  });

  // ==========================================================================
  // week-summaries are server-owned (onActivityWritten)
  //
  // The rules let only admins write week-summaries, so when the client kept
  // them a resident's logActivity saved the activity and then threw on the
  // summary write: an error for a saved activity, and a duplicate on retry.
  // The aggregation itself is tested in regroup/functions
  // (__tests__/activities/).
  // ==========================================================================

  describe('week-summaries are server-owned', () => {
    const denySummaryWrites = () => {
      mockWeekSummaryCollection.doc.mockImplementation(() => ({
        get: jest.fn(async () => {
          throw permissionDenied();
        }),
        set: jest.fn(async () => {
          throw permissionDenied();
        }),
      }));
      (firestore as any).runTransaction = jest.fn(async () => {
        throw permissionDenied();
      });
    };

    it('logActivity resolves with the saved activity when summary writes are denied (resident)', async () => {
      denySummaryWrites();

      const activity = await logActivity(
        'guest123',
        'house456',
        ActivityType.MEDICATION,
        ActivityDataFactory.medication('Antabuse'),
        'guest-uid',
        new Date('2024-01-15T10:00:00Z'),
      );

      expect(activity.id).toBe('activity_1');
      expect(mockActivities).toHaveLength(1);
    });

    it('logActivity opens no transaction', async () => {
      await logActivity(
        'guest123',
        'house456',
        ActivityType.CHORE,
        ActivityDataFactory.chore('daily', 'Kitchen'),
        'user789',
      );

      expect((firestore as any).runTransaction).not.toHaveBeenCalled();
    });

    it('logActivity writes exactly one document: the activity', async () => {
      await logActivity(
        'guest123',
        'house456',
        ActivityType.WORK,
        ActivityDataFactory.work('Server', 8),
        'user789',
      );

      expect(mockActivityCollection.add).toHaveBeenCalledTimes(1);
      expect(firestore.collection).toHaveBeenCalledTimes(1);
      expect(firestore.collection).toHaveBeenCalledWith('activities');
    });

    it('logActivity for a past week does not touch week-summaries', async () => {
      await logActivity(
        'guest123',
        'house456',
        ActivityType.MEETING,
        ActivityDataFactory.meeting('AA', 'AA', 60),
        'user789',
        new Date('2023-12-04T19:00:00Z'),
      );

      expect(touchedWeekSummaries()).toBe(false);
    });

    it('deleteActivity refuses a DISPUTED activity (never deleted) and touches no week-summaries', async () => {
      const activity = await logActivity(
        'guest123',
        'house456',
        ActivityType.CHORE,
        ActivityDataFactory.chore('daily', 'Kitchen'),
        'user789',
      );
      await disputeActivity(activity.id, 'Not done', 'admin123');

      await expect(deleteActivity(activity.id)).rejects.toThrow(DISPUTED_NOT_DELETABLE);

      expect(mockActivities.find(a => a.id === activity.id)!.status).toBe(ActivityStatus.DISPUTED);
      expect(touchedWeekSummaries()).toBe(false);
    });

    it('disputeActivity and verifyActivity do not touch week-summaries', async () => {
      const activity = await logActivity(
        'guest123',
        'house456',
        ActivityType.CHORE,
        ActivityDataFactory.chore('daily', 'Kitchen'),
        'user789',
      );

      await verifyActivity(activity.id, 'admin123');
      await disputeActivity(activity.id, 'Not done', 'admin123');

      expect(touchedWeekSummaries()).toBe(false);
    });

    it('the service no longer exports a client-side summary writer', () => {
      const exported = activityService as Record<string, unknown>;
      expect(exported.incrementWeekSummaryForActivity).toBeUndefined();
      expect(exported.updateWeekSummary).toBeUndefined();
      expect(typeof exported.getWeekSummary).toBe('function');
    });
  });

  // ==========================================================================
  // updateActivity Tests
  // ==========================================================================

  describe('updateActivity', () => {
    let activityId: string;

    beforeEach(async () => {
      const activity = await logActivity(
        'guest123',
        'house456',
        ActivityType.CHORE,
        ActivityDataFactory.chore('daily', 'Kitchen'),
        'user789',
        new Date('2024-01-15T10:00:00Z'),
      );
      activityId = activity.id;
    });

    it('should update activity fields', async () => {
      await updateActivity(activityId, {
        verified: true,
        notes: 'Completed early',
      });

      const updated = mockActivities.find(a => a.id === activityId);

      expect(updated?.verified).toBe(true);
      expect(updated?.notes).toBe('Completed early');
    });

    it('should throw error if activity not found', async () => {
      await expect(
        updateActivity('nonexistent', { verified: true }),
      ).rejects.toThrow('Activity not found');
    });

    it('does not recalculate the week summary client-side', async () => {
      (firestore.collection as jest.Mock).mockClear();
      await updateActivity(activityId, { notes: 'Edited by the resident' });

      expect(touchedWeekSummaries()).toBe(false);
    });
  });

  // ==========================================================================
  // deleteActivity Tests
  // ==========================================================================

  describe('deleteActivity', () => {
    let activityId: string;

    beforeEach(async () => {
      const activity = await logActivity(
        'guest123',
        'house456',
        ActivityType.CHORE,
        ActivityDataFactory.chore('daily', 'Kitchen'),
        'user789',
        new Date('2024-01-15T10:00:00Z'),
      );
      activityId = activity.id;
    });

    it('should soft delete activity', async () => {
      await deleteActivity(activityId);

      const deleted = mockActivities.find(a => a.id === activityId);

      expect(deleted?.status).toBe(ActivityStatus.DELETED);
    });

    it('should throw error if activity not found', async () => {
      await expect(deleteActivity('nonexistent')).rejects.toThrow(
        'Activity not found',
      );
    });

    it('leaves the week summary to the server trigger', async () => {
      await deleteActivity(activityId);

      expect(touchedWeekSummaries()).toBe(false);
    });
  });

  describe('deleteActivity: never a disputed activity (owner rule)', () => {
    const histories: Array<[string, Partial<Activity>]> = [
      ['disputed', { status: ActivityStatus.DISPUTED, disputedBy: 'peer' }],
      ['approved', { status: ActivityStatus.RESOLVED, disputed: 'successful', incomplete: true }],
      ['rejected', { status: ActivityStatus.RESOLVED, disputed: 'rejected', incomplete: false }],
      ['restored after a dispute', { status: ActivityStatus.ACTIVE, disputedBy: 'peer' }],
      ['kept the old way', { status: ActivityStatus.RESOLVED, disputeResolvedBy: 'admin' }],
    ];

    it.each(histories)('refuses to delete a %s activity with a clear message', async (_label, fields) => {
      const a = await logActivity(
        'guest123',
        'house456',
        ActivityType.CHORE,
        ActivityDataFactory.chore('daily', 'Kitchen'),
        'user789',
      );
      Object.assign(mockActivities.find(x => x.id === a.id)!, fields);

      await expect(deleteActivity(a.id)).rejects.toThrow(
        'This activity has been disputed, so it cannot be deleted.',
      );
      expect(mockActivities.find(x => x.id === a.id)!.status).not.toBe(ActivityStatus.DELETED);
    });

    it('still deletes an activity that was never disputed', async () => {
      const a = await logActivity(
        'guest123',
        'house456',
        ActivityType.CHORE,
        ActivityDataFactory.chore('daily', 'Kitchen'),
        'user789',
      );
      await deleteActivity(a.id);
      expect(mockActivities.find(x => x.id === a.id)!.status).toBe(ActivityStatus.DELETED);
    });
  });

  // ==========================================================================
  // disputeActivity Tests
  // ==========================================================================

  describe('disputeActivity', () => {
    let activityId: string;

    beforeEach(async () => {
      const activity = await logActivity(
        'guest123',
        'house456',
        ActivityType.CHORE,
        ActivityDataFactory.chore('daily', 'Kitchen'),
        'user789',
        new Date('2024-01-15T10:00:00Z'),
      );
      activityId = activity.id;
    });

    it('should mark activity as disputed', async () => {
      await disputeActivity(
        activityId,
        'Chore was not completed properly',
        'admin123',
      );

      const disputed = mockActivities.find(a => a.id === activityId);

      expect(disputed?.status).toBe(ActivityStatus.DISPUTED);
      expect(disputed?.disputeReason).toBe('Chore was not completed properly');
      expect(disputed?.disputeResolvedBy).toBe('admin123');
    });

    it('records who disputed in disputedBy (it survives resolution)', async () => {
      await disputeActivity(activityId, 'Not done', 'peer-uid');
      await resolveDispute(activityId, 'admin456', 'reject');

      const resolved = mockActivities.find(a => a.id === activityId);
      expect(resolved?.disputedBy).toBe('peer-uid');
      expect(resolved?.disputeResolvedBy).toBe('admin456');
    });

    it('records when the dispute was raised (disputedAt, server time), which tells it apart from a later one', async () => {
      const activityBeforeDispute = { ...(mockActivities.find(a => a.id === activityId) as any) };
      await disputeActivity(activityId, 'Not done', 'peer-uid');
      const disputed = mockActivities.find(a => a.id === activityId) as any;
      expect(disputed?.disputedAt).toEqual(new Date('2024-01-15T10:00:00Z'));
      // loggedAt is not the disputer's to rewrite.
      expect(disputed?.loggedAt).toBe(activityBeforeDispute?.loggedAt);
    });
  });

  // ==========================================================================
  // resolveDispute Tests
  // ==========================================================================

  describe('resolveDispute', () => {
    let activityId: string;

    beforeEach(async () => {
      const activity = await logActivity(
        'guest123',
        'house456',
        ActivityType.CHORE,
        ActivityDataFactory.chore('daily', 'Kitchen'),
        'user789',
        new Date('2024-01-15T10:00:00Z'),
      );
      activityId = activity.id;

      await disputeActivity(activityId, 'Test dispute', 'admin123');
    });

    it('reject: the activity stands and counts (disputed rejected, not incomplete)', async () => {
      await resolveDispute(activityId, 'admin456', 'reject');

      const resolved = mockActivities.find(a => a.id === activityId)!;

      expect(resolved.status).toBe(ActivityStatus.RESOLVED);
      expect(resolved.disputed).toBe('rejected');
      expect(resolved.incomplete).toBe(false);
      expect(resolved.disputeResult).toBe('fail');
      expect(resolved.disputeResolvedBy).toBe('admin456');
      expect(countsTowardStats(resolved)).toBe(true);
    });

    it('approve: the activity is marked not done and stops counting (kept on record)', async () => {
      await resolveDispute(activityId, 'admin456', 'approve');

      const resolved = mockActivities.find(a => a.id === activityId)!;

      expect(resolved.status).toBe(ActivityStatus.RESOLVED);
      expect(resolved.disputed).toBe('successful');
      expect(resolved.incomplete).toBe(true);
      expect(resolved.disputeResult).toBe('success');
      expect(resolved.disputeOutcome).toBe('incomplete-per-residents');
      expect(countsTowardStats(resolved)).toBe(false);
    });

    it('a rejected dispute records no outcome', async () => {
      await resolveDispute(activityId, 'admin456', 'reject');
      expect(mockActivities.find(a => a.id === activityId)!.disputeOutcome).toBeUndefined();
    });

    it('should throw error if activity not found', async () => {
      await expect(
        resolveDispute('nonexistent', 'admin456', 'reject'),
      ).rejects.toThrow('Activity not found');
    });

    it('refuses to resolve an activity that is not disputed', async () => {
      const other = await logActivity(
        'guest123',
        'house456',
        ActivityType.CHORE,
        ActivityDataFactory.chore('daily', 'Kitchen'),
        'user789',
      );
      for (const status of [ActivityStatus.ACTIVE, ActivityStatus.DELETED]) {
        mockActivities.find(a => a.id === other.id)!.status = status;
        await expect(resolveDispute(other.id, 'admin456', 'approve')).rejects.toThrow(
          'Activity is not disputed',
        );
      }
      expect(mockActivities.find(a => a.id === other.id)!.incomplete).toBeUndefined();
    });

    it('refuses a second resolve with "Dispute already resolved", inside a transaction', async () => {
      await resolveDispute(activityId, 'admin456', 'approve');
      await expect(resolveDispute(activityId, 'admin789', 'reject')).rejects.toThrow(
        'Dispute already resolved',
      );
      const resolved = mockActivities.find(a => a.id === activityId)!;
      expect(resolved.disputed).toBe('successful');
      expect(resolved.disputeResolvedBy).toBe('admin456');
      expect((firestore as any).runTransaction).toHaveBeenCalled();
    });

    it('leaves the week summary to the server trigger', async () => {
      await resolveDispute(activityId, 'admin456', 'approve');

      expect(touchedWeekSummaries()).toBe(false);
    });
  });

  // ==========================================================================
  // getWeekSummary Tests
  // ==========================================================================

  describe('getWeekSummary', () => {
    it('should return summary if exists', async () => {
      // As written by the onActivityWritten trigger.
      mockSummaries.set('guest123_2024-01-15', {
        id: 'guest123_2024-01-15',
        guestId: 'guest123',
        houseId: 'house456',
        startDate: '2024-01-15',
        endDate: '2024-01-21',
        stats: {
          choresCompleted: 1,
          meetingsAttended: 0,
          hoursWorked: 0,
          medicationTaken: 0,
          primarySupporterMet: 0,
        },
        dailyStats: {},
        lastUpdated: null,
        activityCount: 1,
      });

      const summary = await getWeekSummary('guest123', '2024-01-15');

      expect(summary).toBeDefined();
      expect(summary?.guestId).toBe('guest123');
    });

    it('should return null if summary does not exist', async () => {
      const summary = await getWeekSummary('guest999', '2024-01-15');

      expect(summary).toBeNull();
    });
  });

  // ==========================================================================
  // An admin-only summary write can no longer fail an activity write
  //
  // Every mutation used to follow its activity write with a summary write
  // (+1/-1 transaction or a full recompute). For a resident that write was
  // always denied, so the call threw after the activity had changed.
  // ==========================================================================

  describe('activity writes do not depend on week-summaries permissions', () => {
    let activityId: string;

    beforeEach(async () => {
      const activity = await logActivity(
        'guest123',
        'house456',
        ActivityType.CHORE,
        ActivityDataFactory.chore('daily', 'Kitchen'),
        'guest-uid',
        new Date('2024-01-15T10:00:00Z'),
      );
      activityId = activity.id;
      mockWeekSummaryCollection.doc.mockImplementation(() => {
        throw permissionDenied();
      });
      (firestore as any).runTransaction = jest.fn(async () => {
        throw permissionDenied();
      });
    });

    it('deleteActivity resolves when week-summaries writes are denied', async () => {
      await expect(deleteActivity(activityId)).resolves.toBeUndefined();
      expect(mockActivities[0].status).toBe(ActivityStatus.DELETED);
    });

    it('updateActivity resolves when week-summaries writes are denied', async () => {
      await expect(
        updateActivity(activityId, { notes: 'Edited' }),
      ).resolves.toBeUndefined();
      expect(mockActivities[0].notes).toBe('Edited');
    });

    it('resolveDispute resolves when week-summaries writes are denied', async () => {
      // resolveDispute's own transaction reads/writes only the activity.
      (firestore as any).runTransaction = workingRunTransaction;
      await disputeActivity(activityId, 'Not done', 'admin123');
      await expect(
        resolveDispute(activityId, 'admin456', 'approve'),
      ).resolves.toBeUndefined();
      expect(mockActivities[0].incomplete).toBe(true);
    });

    it('deleting an ACTIVE activity runs no transaction (the -1 delta is gone)', async () => {
      await deleteActivity(activityId);
      expect((firestore as any).runTransaction).not.toHaveBeenCalled();
    });

    it('makes no activities-collection queries (no client-side week recompute)', async () => {
      const before = mockActivityCollection.get.mock.calls.length;

      await updateActivity(activityId, { notes: 'Edited' });
      await deleteActivity(activityId);

      // Only the per-document .doc(id).get() reads; no .where().get() query.
      expect(mockActivityCollection.get.mock.calls.length - before).toBe(0);
    });
  });
});
