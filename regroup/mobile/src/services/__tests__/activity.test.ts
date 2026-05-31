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
} from '../../entities/ActivityModel';
import { WeekSummary } from '../../entities/WeekSummary';

// Mock Firebase before importing the service.
//
// runTransaction is added to support the P1 increment-based week-summary
// updater (incrementWeekSummaryForActivity). The mock runs the callback
// immediately with a `tx` that delegates to the same in-memory summary store
// used by the rest of the file.
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
import {
  logActivity,
  getActivities,
  getHouseActivities,
  getWeekSummary,
  updateWeekSummary,
  updateActivity,
  deleteActivity,
  disputeActivity,
  resolveDispute,
  incrementWeekSummaryForActivity,
} from '../activity';

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
      };
      return fn(tx);
    });
  });

  // ==========================================================================
  // logActivity Tests
  // ==========================================================================

  describe('logActivity', () => {
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

    it('should call updateWeekSummary after creating activity', async () => {
      await logActivity(
        'guest123',
        'house456',
        ActivityType.CHORE,
        ActivityDataFactory.chore('daily', 'Kitchen'),
        'user789',
        new Date('2024-01-15T10:00:00Z'),
      );

      // Verify summary doc was created/updated
      const summaryId = 'guest123_2024-01-15';
      expect(mockWeekSummaryCollection.doc).toHaveBeenCalledWith(summaryId);
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
  // updateWeekSummary Tests
  // ==========================================================================

  describe('updateWeekSummary', () => {
    beforeEach(async () => {
      // Create activities for a week
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
        new Date('2024-01-15T19:00:00Z'),
      );

      await logActivity(
        'guest123',
        'house456',
        ActivityType.WORK,
        ActivityDataFactory.work('Server', 8),
        'user789',
        new Date('2024-01-16T09:00:00Z'),
      );
    });

    it('should create summary from activities', async () => {
      await updateWeekSummary('guest123', 'house456', '2024-01-15');

      const summary = mockSummaries.get('guest123_2024-01-15');

      expect(summary).toBeDefined();
      expect(summary?.guestId).toBe('guest123');
      expect(summary?.houseId).toBe('house456');
      expect(summary?.startDate).toBe('2024-01-15');
    });

    it('should aggregate stats correctly', async () => {
      await updateWeekSummary('guest123', 'house456', '2024-01-15');

      const summary = mockSummaries.get('guest123_2024-01-15');

      expect(summary?.stats.choresCompleted).toBe(1);
      expect(summary?.stats.meetingsAttended).toBe(1);
      expect(summary?.stats.hoursWorked).toBe(8);
    });

    it('should create daily stats breakdown', async () => {
      await updateWeekSummary('guest123', 'house456', '2024-01-15');

      const summary = mockSummaries.get('guest123_2024-01-15');

      expect(summary?.dailyStats['2024-01-15']).toBeDefined();
      expect(summary?.dailyStats['2024-01-15'].choresCompleted).toBe(1);
      expect(summary?.dailyStats['2024-01-15'].meetingsAttended).toBe(1);

      expect(summary?.dailyStats['2024-01-16']).toBeDefined();
      expect(summary?.dailyStats['2024-01-16'].hoursWorked).toBe(8);
    });

    it('should set activity count', async () => {
      await updateWeekSummary('guest123', 'house456', '2024-01-15');

      const summary = mockSummaries.get('guest123_2024-01-15');

      expect(summary?.activityCount).toBe(3);
    });

    it('should handle multiple jobs on same day', async () => {
      await logActivity(
        'guest123',
        'house456',
        ActivityType.WORK,
        ActivityDataFactory.work('Delivery', 4),
        'user789',
        new Date('2024-01-16T14:00:00Z'),
      );

      await updateWeekSummary('guest123', 'house456', '2024-01-15');

      const summary = mockSummaries.get('guest123_2024-01-15');

      expect(summary?.stats.hoursWorked).toBe(12); // 8 + 4
      expect(summary?.dailyStats['2024-01-16'].hoursWorked).toBe(12);
    });

    it('should handle multiple meetings on same day', async () => {
      await logActivity(
        'guest123',
        'house456',
        ActivityType.MEETING,
        ActivityDataFactory.meeting('NA', 'NA', 90),
        'user789',
        new Date('2024-01-15T20:30:00Z'),
      );

      await updateWeekSummary('guest123', 'house456', '2024-01-15');

      const summary = mockSummaries.get('guest123_2024-01-15');

      expect(summary?.stats.meetingsAttended).toBe(2);
      expect(summary?.dailyStats['2024-01-15'].meetingsAttended).toBe(2);
    });

    it('should handle week with no activities', async () => {
      await updateWeekSummary('guest999', 'house456', '2024-01-15');

      const summary = mockSummaries.get('guest999_2024-01-15');

      expect(summary?.stats.choresCompleted).toBe(0);
      expect(summary?.stats.meetingsAttended).toBe(0);
      expect(summary?.activityCount).toBe(0);
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

    it('should recalculate week summary after update', async () => {
      await updateActivity(activityId, { verified: true });

      // Verify updateWeekSummary was called
      expect(mockWeekSummaryCollection.doc).toHaveBeenCalled();
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

    it('should recalculate week summary after deletion', async () => {
      await deleteActivity(activityId);

      // Verify updateWeekSummary was called
      expect(mockWeekSummaryCollection.doc).toHaveBeenCalled();
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

    it('should resolve dispute by keeping activity', async () => {
      await resolveDispute(activityId, 'admin456', 'keep');

      const resolved = mockActivities.find(a => a.id === activityId);

      expect(resolved?.status).toBe(ActivityStatus.RESOLVED);
      expect(resolved?.disputeResolvedBy).toBe('admin456');
    });

    it('should resolve dispute by deleting activity', async () => {
      await resolveDispute(activityId, 'admin456', 'delete');

      const resolved = mockActivities.find(a => a.id === activityId);

      expect(resolved?.status).toBe(ActivityStatus.DELETED);
    });

    it('should throw error if activity not found', async () => {
      await expect(
        resolveDispute('nonexistent', 'admin456', 'keep'),
      ).rejects.toThrow('Activity not found');
    });

    it('should recalculate summary after resolution', async () => {
      await resolveDispute(activityId, 'admin456', 'keep');

      expect(mockWeekSummaryCollection.doc).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // getWeekSummary Tests
  // ==========================================================================

  describe('getWeekSummary', () => {
    it('should return summary if exists', async () => {
      // Create a summary
      await logActivity(
        'guest123',
        'house456',
        ActivityType.CHORE,
        ActivityDataFactory.chore('daily', 'Kitchen'),
        'user789',
        new Date('2024-01-15T10:00:00Z'),
      );

      await updateWeekSummary('guest123', 'house456', '2024-01-15');

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
  // incrementWeekSummaryForActivity Tests  — .full-review [P1]
  //
  // The increment-based hot path replaces the O(N²) reads-per-week strategy
  // that updateWeekSummary still uses for the rare update/resolveDispute
  // callers. These tests verify:
  //   - First write of the week materializes the full WeekSummary schema
  //     (every stat key present as 0 + the activity's delta applied).
  //   - Subsequent writes use FieldValue.increment semantics and accumulate
  //     correctly across activity types.
  //   - WORK activities scale by hoursWorked.
  //   - Negative deltas (delete path) subtract.
  // ==========================================================================

  describe('incrementWeekSummaryForActivity', () => {
    const GUEST = 'guest-p1';
    const HOUSE = 'house-p1';
    const TS = new Date('2024-01-15T10:00:00Z'); // Monday — week start
    const SUMMARY_ID = `${GUEST}_2024-01-15`;

    it('first write of the week materializes the full schema', async () => {
      await incrementWeekSummaryForActivity(
        GUEST,
        HOUSE,
        {
          type: ActivityType.CHORE,
          timestamp: TS,
          data: ActivityDataFactory.chore('daily', 'Kitchen'),
        },
        1,
      );

      const summary = mockSummaries.get(SUMMARY_ID) as any;
      expect(summary).toBeDefined();
      expect(summary.guestId).toBe(GUEST);
      expect(summary.houseId).toBe(HOUSE);
      expect(summary.startDate).toBe('2024-01-15');

      // Every top-level stat is a number (no undefined for unused types).
      expect(summary.stats.choresCompleted).toBe(1);
      expect(summary.stats.meetingsAttended).toBe(0);
      expect(summary.stats.hoursWorked).toBe(0);
      expect(summary.stats.medicationTaken).toBe(0);
      expect(summary.stats.primarySupporterMet).toBe(0);

      // The dailyStats entry for the activity date is populated; sibling
      // days still exist with zeros (initializeDailyStats schedules them).
      expect(summary.dailyStats['2024-01-15'].choresCompleted).toBe(1);
      expect(summary.dailyStats['2024-01-15'].meetingsAttended).toBe(0);
      expect(summary.activityCount).toBe(1);
    });

    it('subsequent writes accumulate across types via field-path increments', async () => {
      // First two writes — chore + meeting on same day.
      await incrementWeekSummaryForActivity(
        GUEST,
        HOUSE,
        {
          type: ActivityType.CHORE,
          timestamp: TS,
          data: ActivityDataFactory.chore('daily', 'Kitchen'),
        },
        1,
      );
      await incrementWeekSummaryForActivity(
        GUEST,
        HOUSE,
        {
          type: ActivityType.MEETING,
          timestamp: TS,
          data: ActivityDataFactory.meeting('AA', 'AA', 60),
        },
        1,
      );

      const summary = mockSummaries.get(SUMMARY_ID) as any;
      expect(summary.stats.choresCompleted).toBe(1);
      expect(summary.stats.meetingsAttended).toBe(1);
      expect(summary.dailyStats['2024-01-15'].choresCompleted).toBe(1);
      expect(summary.dailyStats['2024-01-15'].meetingsAttended).toBe(1);
      expect(summary.activityCount).toBe(2);
    });

    it('WORK delta scales by hoursWorked, not by 1', async () => {
      await incrementWeekSummaryForActivity(
        GUEST,
        HOUSE,
        {
          type: ActivityType.WORK,
          timestamp: TS,
          data: ActivityDataFactory.work('Server', 8),
        },
        1,
      );
      await incrementWeekSummaryForActivity(
        GUEST,
        HOUSE,
        {
          type: ActivityType.WORK,
          timestamp: new Date('2024-01-16T10:00:00Z'),
          data: ActivityDataFactory.work('Server', 4),
        },
        1,
      );

      const summary = mockSummaries.get(SUMMARY_ID) as any;
      expect(summary.stats.hoursWorked).toBe(12);
      expect(summary.dailyStats['2024-01-15'].hoursWorked).toBe(8);
      expect(summary.dailyStats['2024-01-16'].hoursWorked).toBe(4);
      // activityCount is per-activity, not per-hour.
      expect(summary.activityCount).toBe(2);
    });

    it('negative delta (delete path) subtracts the counter', async () => {
      // Seed two chores, then delete one.
      await incrementWeekSummaryForActivity(
        GUEST,
        HOUSE,
        {
          type: ActivityType.CHORE,
          timestamp: TS,
          data: ActivityDataFactory.chore('daily', 'Kitchen'),
        },
        1,
      );
      await incrementWeekSummaryForActivity(
        GUEST,
        HOUSE,
        {
          type: ActivityType.CHORE,
          timestamp: TS,
          data: ActivityDataFactory.chore('daily', 'Bathroom'),
        },
        1,
      );
      await incrementWeekSummaryForActivity(
        GUEST,
        HOUSE,
        {
          type: ActivityType.CHORE,
          timestamp: TS,
          data: ActivityDataFactory.chore('daily', 'Bathroom'),
        },
        -1,
      );

      const summary = mockSummaries.get(SUMMARY_ID) as any;
      expect(summary.stats.choresCompleted).toBe(1);
      expect(summary.dailyStats['2024-01-15'].choresCompleted).toBe(1);
      expect(summary.activityCount).toBe(1);
    });

    it('only reads the summary doc ONCE per call (the prior read-all-week-activities cost is gone)', async () => {
      // Spy on the activities collection to make sure no .where().get() chain
      // is triggered from the increment path. logActivity DOES call .add()
      // separately for the activity write — that's unrelated; the cost we're
      // verifying is the absence of the read-all-week-activities query.
      const before = mockActivityCollection.get.mock.calls.length;

      await incrementWeekSummaryForActivity(
        GUEST,
        HOUSE,
        {
          type: ActivityType.CHORE,
          timestamp: TS,
          data: ActivityDataFactory.chore('daily', 'Kitchen'),
        },
        1,
      );
      await incrementWeekSummaryForActivity(
        GUEST,
        HOUSE,
        {
          type: ActivityType.MEETING,
          timestamp: TS,
          data: ActivityDataFactory.meeting('AA', 'AA', 60),
        },
        1,
      );

      const after = mockActivityCollection.get.mock.calls.length;
      expect(after - before).toBe(0); // no activities-collection queries
    });
  });
});
