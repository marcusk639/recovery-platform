/**
 * useWeekSummary Hook
 *
 * Subscribes to a guest's week summary in real-time
 * Provides pre-aggregated stats for display in UI components
 */

import { useState, useEffect } from 'react';
import { WeekSummary } from '../../entities/WeekSummary';
import { firestore } from '../../../firebase-setup';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { logException } from '../../util/logging';

export interface UseWeekSummaryResult {
  summary: WeekSummary | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Subscribe to a guest's week summary
 *
 * @param guestId - Guest ID to fetch summary for
 * @param houseId - House ID (for validation)
 * @param weekStart - Week start date (Monday, YYYY-MM-DD)
 * @returns Week summary data with loading and error states
 */
export function useWeekSummary(
  guestId: string | undefined,
  houseId: string | undefined,
  weekStart: string,
): UseWeekSummaryResult {
  const [summary, setSummary] = useState<WeekSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  const refetch = () => setRefetchTrigger(prev => prev + 1);

  useEffect(() => {
    // Reset state when params change
    setLoading(true);
    setError(null);
    setSummary(null);

    // Return early if required params missing
    if (!guestId || !houseId || !weekStart) {
      setLoading(false);
      return;
    }

    // Construct summary ID: {guestId}_{startDate}
    const summaryId = `${guestId}_${weekStart}`;

    // Subscribe to week summary document
    const unsubscribe = firestore
      .collection('week-summaries')
      .doc(summaryId)
      .onSnapshot(
        (snapshot: FirebaseFirestoreTypes.DocumentSnapshot) => {
          if (snapshot.exists) {
            const data = snapshot.data() as WeekSummary;

            // Convert Firestore timestamps to Date objects if needed.
            // The WeekSummary Firestore schema uses `lastUpdated` (not entity-class `updatedAt`).
            // M1 lint exception: see docs/superpowers/specs/2026-05-23-current-roadmap.md §M1 exclusion.
            if (data.lastUpdated && typeof data.lastUpdated !== 'string') {
              const converted = (data.lastUpdated as any).toDate();
              // eslint-disable-next-line no-restricted-syntax -- WeekSummary Firestore schema field
              data.lastUpdated =
                converted instanceof Date && !isNaN(converted.getTime())
                  ? converted
                  : null;
            }

            setSummary(data);
          } else {
            // Summary doesn't exist yet - this is normal for new weeks
            // Set to null to indicate no data
            setSummary(null);
          }

          setLoading(false);
          setError(null);
        },
        (err: Error) => {
          logException(err);
          setError(err);
          setLoading(false);
        },
      );

    // Cleanup subscription on unmount or param change
    return () => unsubscribe();
  }, [guestId, houseId, weekStart, refetchTrigger]);

  return { summary, loading, error, refetch };
}

/**
 * Get week summary once (no subscription)
 *
 * @param guestId - Guest ID
 * @param houseId - House ID
 * @param weekStart - Week start date
 * @returns Promise of week summary or null
 */
export async function getWeekSummaryOnce(
  guestId: string,
  houseId: string,
  weekStart: string,
): Promise<WeekSummary | null> {
  const summaryId = `${guestId}_${weekStart}`;

  try {
    const snapshot = await firestore
      .collection('week-summaries')
      .doc(summaryId)
      .get();

    if (snapshot.exists) {
      const data = snapshot.data() as WeekSummary;

      // Convert Firestore timestamps. WeekSummary schema uses `lastUpdated`
      // (not entity-class `updatedAt`). M1 lint exception per
      // docs/superpowers/specs/2026-05-23-current-roadmap.md §M1 exclusion.
      if (data.lastUpdated && typeof data.lastUpdated !== 'string') {
        const converted = (data.lastUpdated as any).toDate();
        // eslint-disable-next-line no-restricted-syntax -- WeekSummary Firestore schema field
        data.lastUpdated =
          converted instanceof Date && !isNaN(converted.getTime())
            ? converted
            : null;
      }

      return data;
    }

    return null;
  } catch (error) {
    logException(error);
    throw error;
  }
}

/**
 * Hook to get multiple week summaries (e.g., for history)
 *
 * @param guestId - Guest ID
 * @param houseId - House ID
 * @param limit - Number of weeks to fetch (default: 4)
 * @returns Array of week summaries
 */
export function useWeekSummaryHistory(
  guestId: string | undefined,
  houseId: string | undefined,
  limit: number = 4,
): {
  summaries: WeekSummary[];
  loading: boolean;
  error: Error | null;
} {
  const [summaries, setSummaries] = useState<WeekSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    if (!guestId || !houseId) {
      setLoading(false);
      return;
    }

    // Subscribe to guest's week summaries, ordered by start date descending
    const unsubscribe = firestore
      .collection('week-summaries')
      .where('guestId', '==', guestId)
      .where('houseId', '==', houseId)
      .orderBy('startDate', 'desc')
      .limit(limit)
      .onSnapshot(
        (snapshot: FirebaseFirestoreTypes.QuerySnapshot) => {
          const data = snapshot.docs.map(doc => {
            const summary = doc.data() as WeekSummary;

            // Convert timestamps. WeekSummary schema uses `lastUpdated`
            // (not entity-class `updatedAt`). M1 lint exception per
            // docs/superpowers/specs/2026-05-23-current-roadmap.md §M1 exclusion.
            if (
              summary.lastUpdated &&
              typeof summary.lastUpdated !== 'string'
            ) {
              const converted = (summary.lastUpdated as any).toDate();
              // eslint-disable-next-line no-restricted-syntax -- WeekSummary Firestore schema field
              summary.lastUpdated =
                converted instanceof Date && !isNaN(converted.getTime())
                  ? converted
                  : null;
            }

            return summary;
          });

          setSummaries(data);
          setLoading(false);
          setError(null);
        },
        (err: Error) => {
          logException(err);
          setError(err);
          setLoading(false);
        },
      );

    return () => unsubscribe();
  }, [guestId, houseId, limit]);

  return { summaries, loading, error };
}
