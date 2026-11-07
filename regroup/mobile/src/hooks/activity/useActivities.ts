/**
 * useActivities Hook
 *
 * Subscribes to one house's activities in real time, optionally narrowed by
 * guest, date range, type and status. No houseId, no query: the rules deny an
 * activities list not filtered by house.
 */

import { useState, useEffect, useMemo } from 'react';
import { Activity, ActivityType, ActivityStatus } from '../../entities/ActivityModel';
import { firestore } from '../../../firebase-setup';
import {
  collection,
  getDocs,
  limit as limitTo,
  onSnapshot,
  orderBy,
  query,
  where,
  type QueryConstraint,
  type QuerySnapshot,
} from '@react-native-firebase/firestore';
import { logException } from '../../util/logging';

export interface UseActivitiesOptions {
  guestId?: string;
  /**
   * Required key (pass `house?.id`): the rules deny an activities list not
   * filtered by house, so while it is undefined nothing is queried and the
   * result is idle: empty, loading false, `idle` true.
   */
  houseId: string | undefined;
  startDate?: Date | string;
  endDate?: Date | string;
  type?: ActivityType;
  status?: ActivityStatus;
  limit?: number;
}

export interface UseActivitiesResult {
  activities: Activity[];
  loading: boolean;
  /** No houseId yet: nothing was queried (not the same as "no activities"). */
  idle: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * The filters every activities list here applies, in query order: guest (when
 * given), house, type, status, then the timestamp range. houseId is always
 * present: callers return before querying without one.
 */
function activityFilters({
  guestId,
  houseId,
  startDate,
  endDate,
  type,
  status,
}: Omit<UseActivitiesOptions, 'limit'>): QueryConstraint[] {
  const filters: QueryConstraint[] = [];
  if (guestId) filters.push(where('guestId', '==', guestId));
  filters.push(where('houseId', '==', houseId));
  if (type) filters.push(where('type', '==', type));
  if (status) filters.push(where('status', '==', status));
  if (startDate) filters.push(where('timestamp', '>=', new Date(startDate)));
  if (endDate) filters.push(where('timestamp', '<=', new Date(endDate)));
  return filters;
}

/**
 * Subscribe to activities with filtering
 *
 * @param options - Filter options
 * @returns Activities data with loading and error states
 */
export function useActivities(options: UseActivitiesOptions): UseActivitiesResult {
  const { guestId, houseId, startDate, endDate, type, status, limit = 100 } = options;

  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  const refetch = () => setRefetchTrigger((prev) => prev + 1);

  useEffect(() => {
    // The rules let a client list activities only in a house it belongs to,
    // so any query without a houseId filter is denied: send none.
    // loading stays true underneath, so the render where houseId arrives
    // shows loading rather than an empty list (the returned value masks it).
    if (!houseId) {
      setActivities([]);
      setError(null);
      setLoading(true);
      return;
    }

    setLoading(true);
    setError(null);

    // Most recent first, limited.
    const activitiesQuery = query(
      collection(firestore, 'activities'),
      ...activityFilters({ guestId, houseId, startDate, endDate, type, status }),
      orderBy('timestamp', 'desc'),
      limitTo(limit),
    );

    // Subscribe to query
    const unsubscribe = onSnapshot(
      activitiesQuery,
      (snapshot: QuerySnapshot) => {
        const data = snapshot.docs.map((activityDoc) => {
          const activity = activityDoc.data() as Activity;
          activity.id = activityDoc.id;

          // Convert Firestore timestamps to Date objects
          if (activity.timestamp && typeof activity.timestamp !== 'string') {
            activity.timestamp = (activity.timestamp as any).toDate();
          }

          if (activity.loggedAt && typeof activity.loggedAt !== 'string') {
            activity.loggedAt = (activity.loggedAt as any).toDate();
          }

          return activity;
        });

        setActivities(data);
        setLoading(false);
        setError(null);
      },
      (err: Error) => {
        logException(err, 'useActivities onSnapshot');
        setError(err);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [guestId, houseId, startDate, endDate, type, status, limit, refetchTrigger]);

  return { activities, loading: !!houseId && loading, idle: !houseId, error, refetch };
}

/**
 * Get activities once (no subscription)
 *
 * @param options - Filter options
 * @returns Promise of activities array
 */
export async function getActivitiesOnce(options: UseActivitiesOptions): Promise<Activity[]> {
  const { guestId, houseId, startDate, endDate, type, status, limit = 100 } = options;

  // A one-shot call has no "house still loading" state: a missing houseId is a
  // caller bug, and the query would be denied (see UseActivitiesOptions.houseId).
  if (!houseId) {
    throw new Error('getActivitiesOnce: houseId is required');
  }

  const activitiesQuery = query(
    collection(firestore, 'activities'),
    ...activityFilters({ guestId, houseId, startDate, endDate, type, status }),
    orderBy('timestamp', 'desc'),
    limitTo(limit),
  );

  try {
    const snapshot = await getDocs(activitiesQuery);

    return snapshot.docs.map((activityDoc) => {
      const activity = activityDoc.data() as Activity;
      activity.id = activityDoc.id;

      // Convert timestamps
      if (activity.timestamp && typeof activity.timestamp !== 'string') {
        activity.timestamp = (activity.timestamp as any).toDate();
      }

      if (activity.loggedAt && typeof activity.loggedAt !== 'string') {
        activity.loggedAt = (activity.loggedAt as any).toDate();
      }

      return activity;
    });
  } catch (error) {
    logException(error as Error, 'getActivitiesOnce');
    throw error;
  }
}

/**
 * Live count of matching activities (subscribes to the full result set; not an
 * aggregate query). Like useActivities, counts 0 without a houseId.
 *
 * @param options - Filter options
 * @returns Activity count
 */
export function useActivityCount(options: UseActivitiesOptions): {
  count: number;
  loading: boolean;
  /** No houseId yet: nothing was counted (not the same as a count of 0). */
  idle: boolean;
  error: Error | null;
} {
  const { guestId, houseId, startDate, endDate, type, status } = options;

  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // See UseActivitiesOptions.houseId.
    if (!houseId) {
      setCount(0);
      setError(null);
      setLoading(true);
      return;
    }

    setLoading(true);
    setError(null);

    const unsubscribe = onSnapshot(
      query(
        collection(firestore, 'activities'),
        ...activityFilters({ guestId, houseId, startDate, endDate, type, status }),
      ),
      (snapshot: QuerySnapshot) => {
        setCount(snapshot.size);
        setLoading(false);
        setError(null);
      },
      (err: Error) => {
        logException(err, 'useActivityCount onSnapshot');
        setError(err);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [guestId, houseId, startDate, endDate, type, status]);

  // Masked as in useActivities: no house means nothing to load.
  return { count, loading: !!houseId && loading, idle: !houseId, error };
}

/**
 * Hook to get disputed activities only: a house's disputes, or one guest's
 * when guestId is given (no query without houseId).
 *
 * @param options - Filter options (status is fixed to DISPUTED)
 * @returns Disputed activities
 */
export function useDisputedActivities(
  options: Omit<UseActivitiesOptions, 'status'>,
): UseActivitiesResult {
  return useActivities({ ...options, status: ActivityStatus.DISPUTED });
}

/**
 * Hook to get activities grouped by date
 *
 * @param options - Filter options
 * @returns Activities grouped by date string (YYYY-MM-DD)
 */
export function useActivitiesByDate(options: UseActivitiesOptions): {
  activitiesByDate: Record<string, Activity[]>;
  loading: boolean;
  error: Error | null;
} {
  const { activities, loading, error } = useActivities(options);

  const activitiesByDate = useMemo(() => {
    const grouped: Record<string, Activity[]> = {};

    activities.forEach((activity) => {
      const dateStr =
        typeof activity.timestamp === 'string'
          ? activity.timestamp.split('T')[0]
          : new Date(activity.timestamp).toISOString().split('T')[0];

      if (!grouped[dateStr]) {
        grouped[dateStr] = [];
      }

      grouped[dateStr].push(activity);
    });

    return grouped;
  }, [activities]);

  return { activitiesByDate, loading, error };
}
