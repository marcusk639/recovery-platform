// src/state/queries/__tests__/activityQueries.test.ts
//
// Unit tests for the NEW MODEL activity query hooks in activityQueries.ts.
// Focused on: useActivities, useHouseActivities, useWeekSummary,
//             useLogNewActivity, useUpdateActivity, useDeleteActivity.
//
// Old-model hooks (useSearchMeetings, useLogActivity, etc.) are intentionally
// not covered here.

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock the activity service module before importing the hooks
jest.mock('../../../services/activity');
// Mock offlineQueue used inside the file (useFlushOfflineQueue)
jest.mock('../../../services/offlineQueue', () => ({
  offlineQueue: { flush: jest.fn(() => Promise.resolve()) },
  isNetworkError: jest.fn(() => false),
}));
// Mock meeting service (referenced by old-model hooks that share the file)
jest.mock('../../../services/meeting', () => ({
  searchForMeetings: jest.fn(),
  userIsAtMeeting: jest.fn(),
  addMeeting: jest.fn(),
  updateMeeting: jest.fn(),
  deleteMeeting: jest.fn(),
}));
// Mock compliance utilities referenced in useComplianceCheck
jest.mock('../../../util/compliance', () => ({
  checkPhaseCompliance: jest.fn(() => ({ compliant: true })),
  getComplianceStatus: jest.fn(() => 'compliant'),
}));
// The guest service is require()'d lazily inside useLogActivity — mock it too
jest.mock('../../../services/guest', () => ({
  updateGuest: jest.fn(() => Promise.resolve({})),
}));

import * as activityService from '../../../services/activity';
import {
  activityKeys,
  useActivities,
  useHouseActivities,
  useWeekSummary,
  useLogNewActivity,
  useUpdateActivity,
  useDeleteActivity,
} from '../activityQueries';
import { ActivityType, ActivityStatus } from '../../../entities/ActivityModel';
import type { Activity } from '../../../entities/ActivityModel';
import type { WeekSummary } from '../../../entities/WeekSummary';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeActivity = (overrides: Partial<Activity> = {}): Activity => ({
  id: 'act1',
  guestId: 'guest1',
  houseId: 'house1',
  type: ActivityType.CHORE,
  timestamp: new Date('2026-01-06T10:00:00.000Z'),
  data: { type: 'chore', choreType: 'daily', choreName: 'Dishes' },
  loggedBy: 'admin1',
  loggedAt: new Date('2026-01-06T10:00:00.000Z'),
  verified: false,
  status: ActivityStatus.ACTIVE,
  ...overrides,
});

const makeWeekSummary = (overrides: Partial<WeekSummary> = {}): WeekSummary => ({
  id: 'guest1_2026-01-05',
  guestId: 'guest1',
  houseId: 'house1',
  startDate: '2026-01-05',
  endDate: '2026-01-11',
  stats: {
    choresCompleted: 3,
    meetingsAttended: 2,
    hoursWorked: 8,
    medicationTaken: 5,
    primarySupporterMet: 1,
  },
  dailyStats: {},
  lastUpdated: new Date('2026-01-06T12:00:00.000Z'),
  activityCount: 10,
  ...overrides,
});

const START_DATE = new Date('2026-01-05T00:00:00.000Z');
const END_DATE = new Date('2026-01-11T23:59:59.000Z');

// ─── Test setup ──────────────────────────────────────────────────────────────

describe('activityQueries', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    queryClient.unmount();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  // ── activityKeys ────────────────────────────────────────────────────────────

  describe('activityKeys', () => {
    it('all is ["activities"]', () => {
      expect(activityKeys.all).toEqual(['activities']);
    });

    it('newActivities returns ["activities", "new-model"]', () => {
      expect(activityKeys.newActivities()).toEqual(['activities', 'new-model']);
    });

    it('activityList embeds guestId, startDate, endDate and optional type', () => {
      const key = activityKeys.activityList('g1', '2026-01-05', '2026-01-11', ActivityType.CHORE);
      expect(key[0]).toBe('activities');
      const last = key[key.length - 1] as any;
      expect(last.guestId).toBe('g1');
      expect(last.type).toBe(ActivityType.CHORE);
    });

    it('houseActivities embeds the houseId', () => {
      const key = activityKeys.houseActivities('house1');
      expect(key).toContain('house1');
    });

    it('weekSummary embeds guestId and weekStart', () => {
      const key = activityKeys.weekSummary('guest1', '2026-01-05');
      const last = key[key.length - 1] as any;
      expect(last.guestId).toBe('guest1');
      expect(last.weekStart).toBe('2026-01-05');
    });
  });

  // ── useActivities ───────────────────────────────────────────────────────────

  describe('useActivities', () => {
    it('fetches activities and returns them on success', async () => {
      const activities = [makeActivity()];
      (activityService.getActivities as jest.Mock).mockResolvedValue(activities);

      const { result } = renderHook(
        () => useActivities('guest1', START_DATE, END_DATE),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(activities);
      expect(activityService.getActivities).toHaveBeenCalledWith(
        'guest1',
        START_DATE,
        END_DATE,
        undefined,
      );
    });

    it('passes the optional type filter to the service', async () => {
      (activityService.getActivities as jest.Mock).mockResolvedValue([]);

      const { result } = renderHook(
        () => useActivities('guest1', START_DATE, END_DATE, ActivityType.MEETING),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(activityService.getActivities).toHaveBeenCalledWith(
        'guest1',
        START_DATE,
        END_DATE,
        ActivityType.MEETING,
      );
    });

    it('does not fetch when enabled is false', () => {
      const { result } = renderHook(
        () => useActivities('guest1', START_DATE, END_DATE, undefined, false),
        { wrapper },
      );

      expect(result.current.isLoading).toBe(false);
      expect(activityService.getActivities).not.toHaveBeenCalled();
    });

    it('does not fetch when guestId is empty', () => {
      const { result } = renderHook(
        () => useActivities('', START_DATE, END_DATE),
        { wrapper },
      );

      expect(result.current.isLoading).toBe(false);
      expect(activityService.getActivities).not.toHaveBeenCalled();
    });

    it('surfaces errors from the service', async () => {
      const error = new Error('Failed to get activities');
      (activityService.getActivities as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(
        () => useActivities('guest1', START_DATE, END_DATE),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });

    it('stores data under the correct cache key', async () => {
      const activities = [makeActivity()];
      (activityService.getActivities as jest.Mock).mockResolvedValue(activities);

      const { result } = renderHook(
        () => useActivities('guest1', START_DATE, END_DATE),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const cached = queryClient.getQueryData(
        activityKeys.activityList(
          'guest1',
          START_DATE.toISOString(),
          END_DATE.toISOString(),
        ),
      );
      expect(cached).toEqual(activities);
    });
  });

  // ── useHouseActivities ──────────────────────────────────────────────────────

  describe('useHouseActivities', () => {
    it('fetches house activities on success', async () => {
      const activities = [makeActivity({ houseId: 'house1' })];
      (activityService.getHouseActivities as jest.Mock).mockResolvedValue(activities);

      const { result } = renderHook(
        () => useHouseActivities('house1'),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(activities);
      expect(activityService.getHouseActivities).toHaveBeenCalledWith('house1', 50);
    });

    it('forwards the limit parameter to the service', async () => {
      (activityService.getHouseActivities as jest.Mock).mockResolvedValue([]);

      const { result } = renderHook(
        () => useHouseActivities('house1', 20),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(activityService.getHouseActivities).toHaveBeenCalledWith('house1', 20);
    });

    it('does not fetch when enabled is false', () => {
      const { result } = renderHook(
        () => useHouseActivities('house1', 50, false),
        { wrapper },
      );

      expect(result.current.isLoading).toBe(false);
      expect(activityService.getHouseActivities).not.toHaveBeenCalled();
    });

    it('does not fetch when houseId is empty', () => {
      const { result } = renderHook(
        () => useHouseActivities(''),
        { wrapper },
      );

      expect(result.current.isLoading).toBe(false);
      expect(activityService.getHouseActivities).not.toHaveBeenCalled();
    });

    it('surfaces errors from the service', async () => {
      const error = new Error('Failed to get house activities');
      (activityService.getHouseActivities as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(
        () => useHouseActivities('house1'),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });
  });

  // ── useWeekSummary ──────────────────────────────────────────────────────────

  describe('useWeekSummary', () => {
    it('fetches week summary on success', async () => {
      const summary = makeWeekSummary();
      (activityService.getWeekSummary as jest.Mock).mockResolvedValue(summary);

      const { result } = renderHook(
        () => useWeekSummary('guest1', '2026-01-05'),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(summary);
      expect(activityService.getWeekSummary).toHaveBeenCalledWith('guest1', '2026-01-05');
    });

    it('returns null data when the service returns null', async () => {
      (activityService.getWeekSummary as jest.Mock).mockResolvedValue(null);

      const { result } = renderHook(
        () => useWeekSummary('guest1', '2026-01-05'),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toBeNull();
    });

    it('does not fetch when enabled is false', () => {
      const { result } = renderHook(
        () => useWeekSummary('guest1', '2026-01-05', false),
        { wrapper },
      );

      expect(result.current.isLoading).toBe(false);
      expect(activityService.getWeekSummary).not.toHaveBeenCalled();
    });

    it('does not fetch when guestId is empty', () => {
      const { result } = renderHook(
        () => useWeekSummary('', '2026-01-05'),
        { wrapper },
      );

      expect(result.current.isLoading).toBe(false);
      expect(activityService.getWeekSummary).not.toHaveBeenCalled();
    });

    it('does not fetch when weekStart is empty', () => {
      const { result } = renderHook(
        () => useWeekSummary('guest1', ''),
        { wrapper },
      );

      expect(result.current.isLoading).toBe(false);
      expect(activityService.getWeekSummary).not.toHaveBeenCalled();
    });

    it('surfaces errors from the service', async () => {
      const error = new Error('Failed to get week summary');
      (activityService.getWeekSummary as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(
        () => useWeekSummary('guest1', '2026-01-05'),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });

    it('caches the result under the correct key', async () => {
      const summary = makeWeekSummary();
      (activityService.getWeekSummary as jest.Mock).mockResolvedValue(summary);

      const { result } = renderHook(
        () => useWeekSummary('guest1', '2026-01-05'),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const cached = queryClient.getQueryData(
        activityKeys.weekSummary('guest1', '2026-01-05'),
      );
      expect(cached).toEqual(summary);
    });
  });

  // ── useLogNewActivity ───────────────────────────────────────────────────────

  describe('useLogNewActivity', () => {
    const logPayload = {
      guestId: 'guest1',
      houseId: 'house1',
      type: ActivityType.CHORE,
      data: { type: 'chore' as const, choreType: 'daily', choreName: 'Dishes' },
      loggedBy: 'admin1',
    };

    it('calls logActivity with the correct arguments', async () => {
      const created = makeActivity();
      (activityService.logActivity as jest.Mock).mockResolvedValue(created);

      const { result } = renderHook(() => useLogNewActivity(), { wrapper });

      result.current.mutate(logPayload);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(activityService.logActivity).toHaveBeenCalledWith(
        'guest1',
        'house1',
        ActivityType.CHORE,
        logPayload.data,
        'admin1',
        undefined,
      );
    });

    it('forwards an optional timestamp to logActivity', async () => {
      const ts = new Date('2026-01-06T08:00:00.000Z');
      (activityService.logActivity as jest.Mock).mockResolvedValue(makeActivity());

      const { result } = renderHook(() => useLogNewActivity(), { wrapper });

      result.current.mutate({ ...logPayload, timestamp: ts });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(activityService.logActivity).toHaveBeenCalledWith(
        'guest1',
        'house1',
        ActivityType.CHORE,
        logPayload.data,
        'admin1',
        ts,
      );
    });

    it('invalidates newActivities queries on success', async () => {
      (activityService.logActivity as jest.Mock).mockResolvedValue(makeActivity());

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useLogNewActivity(), { wrapper });

      result.current.mutate(logPayload);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: activityKeys.newActivities(),
      });
    });

    it('invalidates weekSummaries queries on success', async () => {
      (activityService.logActivity as jest.Mock).mockResolvedValue(makeActivity());

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useLogNewActivity(), { wrapper });

      result.current.mutate(logPayload);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: activityKeys.weekSummaries(),
      });
    });

    it('invalidates houseActivities for the mutated houseId on success', async () => {
      (activityService.logActivity as jest.Mock).mockResolvedValue(makeActivity());

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useLogNewActivity(), { wrapper });

      result.current.mutate(logPayload);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: activityKeys.houseActivities('house1'),
      });
    });

    it('surfaces errors from logActivity', async () => {
      const error = new Error('Failed to log activity: chore');
      (activityService.logActivity as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useLogNewActivity(), { wrapper });

      result.current.mutate(logPayload);

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });
  });

  // ── useUpdateActivity ───────────────────────────────────────────────────────

  describe('useUpdateActivity', () => {
    it('calls updateActivity with activityId and updates', async () => {
      (activityService.updateActivity as jest.Mock).mockResolvedValue(undefined);

      const { result } = renderHook(() => useUpdateActivity(), { wrapper });

      result.current.mutate({
        activityId: 'act1',
        updates: { verified: true },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(activityService.updateActivity).toHaveBeenCalledWith('act1', {
        verified: true,
      });
    });

    it('invalidates newActivities queries on success', async () => {
      (activityService.updateActivity as jest.Mock).mockResolvedValue(undefined);

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateActivity(), { wrapper });

      result.current.mutate({ activityId: 'act1', updates: {} });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: activityKeys.newActivities(),
      });
    });

    it('invalidates weekSummaries queries on success', async () => {
      (activityService.updateActivity as jest.Mock).mockResolvedValue(undefined);

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateActivity(), { wrapper });

      result.current.mutate({ activityId: 'act1', updates: {} });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: activityKeys.weekSummaries(),
      });
    });

    it('surfaces errors from updateActivity', async () => {
      const error = new Error('Activity not found');
      (activityService.updateActivity as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useUpdateActivity(), { wrapper });

      result.current.mutate({ activityId: 'missing', updates: {} });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });
  });

  // ── useDeleteActivity ───────────────────────────────────────────────────────

  describe('useDeleteActivity', () => {
    it('calls deleteActivity with the activityId', async () => {
      (activityService.deleteActivity as jest.Mock).mockResolvedValue(undefined);

      const { result } = renderHook(() => useDeleteActivity(), { wrapper });

      result.current.mutate('act1');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(activityService.deleteActivity).toHaveBeenCalledWith('act1');
    });

    it('invalidates newActivities queries on success', async () => {
      (activityService.deleteActivity as jest.Mock).mockResolvedValue(undefined);

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useDeleteActivity(), { wrapper });

      result.current.mutate('act1');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: activityKeys.newActivities(),
      });
    });

    it('invalidates weekSummaries queries on success', async () => {
      (activityService.deleteActivity as jest.Mock).mockResolvedValue(undefined);

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useDeleteActivity(), { wrapper });

      result.current.mutate('act1');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: activityKeys.weekSummaries(),
      });
    });

    it('surfaces errors from deleteActivity', async () => {
      const error = new Error('Activity not found');
      (activityService.deleteActivity as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useDeleteActivity(), { wrapper });

      result.current.mutate('missing');

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });

    it('does not invalidate queries when the mutation fails', async () => {
      (activityService.deleteActivity as jest.Mock).mockRejectedValue(
        new Error('Failure'),
      );

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useDeleteActivity(), { wrapper });

      result.current.mutate('act1');

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(invalidateSpy).not.toHaveBeenCalled();
    });
  });
});
