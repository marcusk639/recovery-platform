/**
 * useActivities Hook
 *
 * Subscribes to activities with real-time updates
 * Supports filtering by guest, house, date range, type, and status
 */

import { useState, useEffect, useMemo } from 'react';
import { Activity, ActivityType, ActivityStatus } from '../../entities/ActivityModel';
import { firestore } from '../../../firebase-setup';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { logException } from '../../util/logging';

export interface UseActivitiesOptions {
  guestId?: string;
  houseId?: string;
  startDate?: Date | string;
  endDate?: Date | string;
  type?: ActivityType;
  status?: ActivityStatus;
  limit?: number;
}

export interface UseActivitiesResult {
  activities: Activity[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Subscribe to activities with filtering
 *
 * @param options - Filter options
 * @returns Activities data with loading and error states
 */
export function useActivities(options: UseActivitiesOptions = {}): UseActivitiesResult {
  const { guestId, houseId, startDate, endDate, type, status, limit = 100 } = options;

  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  const refetch = () => setRefetchTrigger((prev) => prev + 1);

  useEffect(() => {
    setLoading(true);
    setError(null);

    // Build Firestore query
    let query: FirebaseFirestoreTypes.Query = firestore.collection('activities');

    // Filter by guestId (most common, indexed)
    if (guestId) {
      query = query.where('guestId', '==', guestId);
    }

    // Filter by houseId (indexed)
    if (houseId) {
      query = query.where('houseId', '==', houseId);
    }

    // Filter by type
    if (type) {
      query = query.where('type', '==', type);
    }

    // Filter by status
    if (status) {
      query = query.where('status', '==', status);
    }

    // Filter by date range (if provided)
    // Note: Firestore doesn't support range queries on multiple fields
    // So we query with one bound and filter the rest in memory
    if (startDate) {
      const startTimestamp = new Date(startDate);
      query = query.where('timestamp', '>=', startTimestamp);
    }

    if (endDate) {
      const endTimestamp = new Date(endDate);
      query = query.where('timestamp', '<=', endTimestamp);
    }

    // Order by timestamp descending (most recent first)
    query = query.orderBy('timestamp', 'desc');

    // Limit results
    query = query.limit(limit);

    // Subscribe to query
    const unsubscribe = query.onSnapshot(
      (snapshot: FirebaseFirestoreTypes.QuerySnapshot) => {
        const data = snapshot.docs.map((doc) => {
          const activity = doc.data() as Activity;
          activity.id = doc.id;

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
        logException(err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [guestId, houseId, startDate, endDate, type, status, limit, refetchTrigger]);

  return { activities, loading, error, refetch };
}

/**
 * Get activities once (no subscription)
 *
 * @param options - Filter options
 * @returns Promise of activities array
 */
export async function getActivitiesOnce(
  options: UseActivitiesOptions = {}
): Promise<Activity[]> {
  const { guestId, houseId, startDate, endDate, type, status, limit = 100 } = options;

  let query: FirebaseFirestoreTypes.Query = firestore.collection('activities');

  if (guestId) {
    query = query.where('guestId', '==', guestId);
  }

  if (houseId) {
    query = query.where('houseId', '==', houseId);
  }

  if (type) {
    query = query.where('type', '==', type);
  }

  if (status) {
    query = query.where('status', '==', status);
  }

  if (startDate) {
    query = query.where('timestamp', '>=', new Date(startDate));
  }

  if (endDate) {
    query = query.where('timestamp', '<=', new Date(endDate));
  }

  query = query.orderBy('timestamp', 'desc').limit(limit);

  try {
    const snapshot = await query.get();

    return snapshot.docs.map((doc) => {
      const activity = doc.data() as Activity;
      activity.id = doc.id;

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
    logException(error as Error);
    throw error;
  }
}

/**
 * Hook to get activity count (without fetching all data)
 *
 * @param options - Filter options
 * @returns Activity count
 */
export function useActivityCount(options: UseActivitiesOptions = {}): {
  count: number;
  loading: boolean;
  error: Error | null;
} {
  const { guestId, houseId, startDate, endDate, type, status } = options;

  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    let query: FirebaseFirestoreTypes.Query = firestore.collection('activities');

    if (guestId) query = query.where('guestId', '==', guestId);
    if (houseId) query = query.where('houseId', '==', houseId);
    if (type) query = query.where('type', '==', type);
    if (status) query = query.where('status', '==', status);
    if (startDate) query = query.where('timestamp', '>=', new Date(startDate));
    if (endDate) query = query.where('timestamp', '<=', new Date(endDate));

    const unsubscribe = query.onSnapshot(
      (snapshot: FirebaseFirestoreTypes.QuerySnapshot) => {
        setCount(snapshot.size);
        setLoading(false);
        setError(null);
      },
      (err: Error) => {
        logException(err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [guestId, houseId, startDate, endDate, type, status]);

  return { count, loading, error };
}

/**
 * Hook to get disputed activities only
 *
 * @param guestId - Guest ID
 * @param startDate - Optional start date
 * @param endDate - Optional end date
 * @returns Disputed activities
 */
export function useDisputedActivities(
  guestId: string | undefined,
  startDate?: Date | string,
  endDate?: Date | string
): UseActivitiesResult {
  return useActivities({
    guestId,
    startDate,
    endDate,
    status: ActivityStatus.DISPUTED,
  });
}

/**
 * Hook to get activities grouped by date
 *
 * @param options - Filter options
 * @returns Activities grouped by date string (YYYY-MM-DD)
 */
export function useActivitiesByDate(
  options: UseActivitiesOptions = {}
): {
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
