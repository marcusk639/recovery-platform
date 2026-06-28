import {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
} from '@tanstack/react-query';
import type { Guest } from '../../entities/Guest';
import type { House } from '../../entities/House';

// NEW ACTIVITY MODEL IMPORTS
import {
  Activity,
  ActivityType,
  ActivityData,
  ActivityStatus,
} from '../../entities/ActivityModel';
import * as activityService from '../../services/activity';
import {
  checkPhaseCompliance,
  ComplianceResult,
  getComplianceStatus,
} from '../../util/compliance';
import { logException } from '../../util/logging';
import { Alert } from 'react-native';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const activityKeys = {
  all: ['activities'] as const,

  newActivities: () => [...activityKeys.all, 'new-model'] as const,
  activityList: (
    guestId: string,
    startDate: string,
    endDate: string,
    type?: ActivityType,
  ) =>
    [
      ...activityKeys.newActivities(),
      'list',
      { guestId, startDate, endDate, type },
    ] as const,
  activityInfiniteList: (
    guestId: string,
    startDate: string,
    endDate: string,
    type?: ActivityType,
  ) =>
    [
      ...activityKeys.newActivities(),
      'infinite',
      { guestId, startDate, endDate, type },
    ] as const,
  houseActivities: (houseId: string) =>
    [...activityKeys.newActivities(), 'house', houseId] as const,
  weekSummaries: () => [...activityKeys.all, 'summaries'] as const,
  weekSummary: (guestId: string, weekStart: string) =>
    [...activityKeys.weekSummaries(), { guestId, weekStart }] as const,
};

// ============================================================================
// ACTIVITY HOOKS
// ============================================================================

/**
 * Get activities for a guest within a date range
 *
 * @param guestId - ID of the guest
 * @param startDate - Start of date range
 * @param endDate - End of date range
 * @param type - Optional filter by activity type
 * @param enabled - Whether to enable the query
 */
export const useActivities = (
  guestId: string,
  startDate: Date,
  endDate: Date,
  type?: ActivityType,
  enabled: boolean = true,
) => {
  return useQuery({
    queryKey: activityKeys.activityList(
      guestId,
      startDate.toISOString(),
      endDate.toISOString(),
      type,
    ),
    queryFn: () =>
      activityService.getActivities(guestId, startDate, endDate, type),
    enabled: enabled && !!guestId,
    staleTime: 30000, // 30 seconds
  });
};

/**
 * Get activities for a guest using cursor-based infinite pagination.
 *
 * Backed by `getActivitiesPage()` which fetches `pageSize + 1` docs per page
 * to detect whether a next page exists, returns only `pageSize` docs, and
 * exposes the last document snapshot as the cursor for the following page.
 *
 * Usage:
 * ```tsx
 * const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
 *   useInfiniteActivities(guestId, startDate, endDate);
 *
 * const activities = data?.pages.flatMap(p => p.activities) ?? [];
 * ```
 *
 * @param guestId   - ID of the guest
 * @param startDate - Start of date range
 * @param endDate   - End of date range
 * @param type      - Optional filter by activity type
 * @param enabled   - Whether to enable the query
 * @param pageSize  - Activities per page (default 20)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const useInfiniteActivities = (
  guestId: string,
  startDate: Date,
  endDate: Date,
  type?: ActivityType,
  enabled: boolean = true,
  pageSize: number = 20,
) => {
  return useInfiniteQuery({
    queryKey: activityKeys.activityInfiniteList(
      guestId,
      startDate.toISOString(),
      endDate.toISOString(),
      type,
    ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: ({ pageParam }: { pageParam: any }) =>
      activityService.getActivitiesPage(
        guestId,
        startDate,
        endDate,
        pageSize,
        pageParam,
        type,
      ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getNextPageParam: (lastPage: any) =>
      lastPage.hasMore && lastPage.nextCursor ? lastPage.nextCursor : undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    initialPageParam: undefined as any,
    enabled: enabled && !!guestId,
    staleTime: 30000, // 30 seconds
  });
};

/**
 * Get recent activities for a house (for activity feed)
 *
 * @param houseId - ID of the house
 * @param limit - Maximum number of activities
 * @param enabled - Whether to enable the query
 */
export const useHouseActivities = (
  houseId: string,
  limit: number = 50,
  enabled: boolean = true,
) => {
  return useQuery({
    queryKey: activityKeys.houseActivities(houseId),
    queryFn: () => activityService.getHouseActivities(houseId, limit),
    enabled: enabled && !!houseId,
    staleTime: 10000, // 10 seconds - activity feed should be fresh
    refetchInterval: 30000, // Auto-refetch every 30 seconds for live feed
  });
};

/**
 * Get week summary for a guest
 * Returns pre-aggregated stats for fast reads
 *
 * @param guestId - ID of the guest
 * @param weekStart - Week start date (YYYY-MM-DD)
 * @param enabled - Whether to enable the query
 */
export const useWeekSummary = (
  guestId: string,
  weekStart: string,
  enabled: boolean = true,
) => {
  return useQuery({
    queryKey: activityKeys.weekSummary(guestId, weekStart),
    queryFn: () => activityService.getWeekSummary(guestId, weekStart),
    enabled: enabled && !!guestId && !!weekStart,
    staleTime: 60000, // 1 minute - summaries don't change as frequently
  });
};

/**
 * Log a new activity
 * Automatically updates week summary
 */
export const useLogNewActivity = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      guestId,
      houseId,
      type,
      data,
      loggedBy,
      timestamp,
    }: {
      guestId: string;
      houseId: string;
      type: ActivityType;
      data: ActivityData;
      loggedBy: string;
      timestamp?: Date;
    }) =>
      activityService.logActivity(
        guestId,
        houseId,
        type,
        data,
        loggedBy,
        timestamp,
      ),

    // Optimistic update
    onMutate: async ({ guestId, houseId, type, data, loggedBy, timestamp }) => {
      const activityTimestamp = timestamp || new Date();

      // Cancel outgoing queries
      await queryClient.cancelQueries({
        queryKey: activityKeys.newActivities(),
      });

      // Create temporary activity for optimistic update
      const tempActivity: Activity = {
        id: `temp_${Date.now()}`,
        guestId,
        houseId,
        type,
        timestamp: activityTimestamp,
        data,
        loggedBy,
        loggedAt: new Date(),
        verified: false,
        status: ActivityStatus.ACTIVE,
      };

      return { tempActivity };
    },

    // Invalidate and refetch on success
    onSuccess: (data, variables) => {
      // Invalidate activity lists
      queryClient.invalidateQueries({ queryKey: activityKeys.newActivities() });

      // Invalidate week summaries
      queryClient.invalidateQueries({ queryKey: activityKeys.weekSummaries() });

      // Invalidate house activity feed
      queryClient.invalidateQueries({
        queryKey: activityKeys.houseActivities(variables.houseId),
      });
    },

    onError: err => {
      // Surface to Sentry so a lost check-in/drug-test is never silent. The
      // error still rejects the mutation so callers can handle it too.
      logException(err);
      Alert.alert(
        'Could not save',
        'We could not save this activity. Please check your connection and try again.',
      );
    },
  });
};

/**
 * Update an existing activity
 */
export const useUpdateActivity = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      activityId,
      updates,
    }: {
      activityId: string;
      updates: Partial<Activity>;
    }) => activityService.updateActivity(activityId, updates),

    onSuccess: () => {
      // Invalidate all activity-related queries
      queryClient.invalidateQueries({ queryKey: activityKeys.newActivities() });
      queryClient.invalidateQueries({ queryKey: activityKeys.weekSummaries() });
    },
  });
};

/**
 * Delete an activity (soft delete)
 */
export const useDeleteActivity = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (activityId: string) =>
      activityService.deleteActivity(activityId),

    onSuccess: () => {
      // Invalidate all activity-related queries
      queryClient.invalidateQueries({ queryKey: activityKeys.newActivities() });
      queryClient.invalidateQueries({ queryKey: activityKeys.weekSummaries() });
    },
  });
};

/**
 * Dispute an activity
 */
export const useDisputeActivity = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      activityId,
      reason,
      disputedBy,
    }: {
      activityId: string;
      reason: string;
      disputedBy: string;
    }) => activityService.disputeActivity(activityId, reason, disputedBy),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: activityKeys.newActivities() });
    },
  });
};

/**
 * Resolve a disputed activity
 */
export const useResolveDispute = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      activityId,
      resolvedBy,
      resolution,
    }: {
      activityId: string;
      resolvedBy: string;
      resolution: 'keep' | 'delete';
    }) => activityService.resolveDispute(activityId, resolvedBy, resolution),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: activityKeys.newActivities() });
      queryClient.invalidateQueries({ queryKey: activityKeys.weekSummaries() });
    },
  });
};

// ============================================================================
// COMPLIANCE HOOKS
// ============================================================================

/**
 * Check whether a guest is compliant with their phase requirements for a given week.
 *
 * Fetches the week summary via `useWeekSummary`, resolves the guest's phase rules
 * from the house configuration, and runs `checkPhaseCompliance` to produce a
 * detailed `ComplianceResult`.
 *
 * Returns `null` for `data` while the week summary is loading or when the guest's
 * phase cannot be found in the house configuration.
 *
 * @param guest     - The guest to check
 * @param weekStart - Week start date (YYYY-MM-DD)
 * @param house     - The house (provides phase rules)
 * @param enabled   - Whether to enable the underlying query
 */
export const useComplianceCheck = (
  guest: Guest,
  weekStart: string,
  house: House,
  enabled: boolean = true,
): {
  data: ComplianceResult | null;
  status: 'compliant' | 'non-compliant' | 'incomplete-data' | 'loading';
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
} => {
  const summaryQuery = useWeekSummary(
    guest.id,
    weekStart,
    enabled && !!guest.id && !!weekStart,
  );

  if (summaryQuery.isLoading) {
    return {
      data: null,
      status: 'loading',
      isLoading: true,
      isError: false,
      error: null,
    };
  }

  if (summaryQuery.isError) {
    return {
      data: null,
      status: 'incomplete-data',
      isLoading: false,
      isError: true,
      error: summaryQuery.error as Error | null,
    };
  }

  const weekSummary = summaryQuery.data ?? null;
  const complianceStatus = getComplianceStatus(guest, weekSummary, house);

  if (complianceStatus === 'incomplete-data' || !weekSummary) {
    return {
      data: null,
      status: 'incomplete-data',
      isLoading: false,
      isError: false,
      error: null,
    };
  }

  const phaseName = String(guest.phase);
  const phaseConfig = house.phases?.[phaseName];

  if (!phaseConfig) {
    return {
      data: null,
      status: 'incomplete-data',
      isLoading: false,
      isError: false,
      error: null,
    };
  }

  const result = checkPhaseCompliance(weekSummary, phaseConfig.rules);

  return {
    data: result,
    status: complianceStatus,
    isLoading: false,
    isError: false,
    error: null,
  };
};

// Moved to its own file to break the DataContext ↔ activityQueries init cycle.
// useOfflineSync (called inside DataContext) now imports from there directly,
// avoiding the circular chain that left useFlushOfflineQueue undefined on first load.
export { useFlushOfflineQueue } from './useFlushOfflineQueue';
