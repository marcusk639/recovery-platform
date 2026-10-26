/**
 * useFlushOfflineQueue
 *
 * Isolated from activityQueries.ts so that useOfflineSync (called inside
 * DataContext) can import this hook without creating a module-initialisation
 * cycle:
 *
 *   DataContext → useOfflineSync → activityQueries → [long chain] → DataContext
 *
 * This file imports only external packages and low-level services that carry
 * no transitive path back to DataContext.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as activityService from '../../services/activity';
import auth from '@react-native-firebase/auth';

// Mirror activityKeys.newActivities() and activityKeys.weekSummaries().
// Defined inline to avoid importing activityQueries (which is in the cycle).
const ACTIVITY_NEW_MODEL_QUERY_KEY = ['activities', 'new-model'] as const;
const ACTIVITY_SUMMARIES_QUERY_KEY = ['activities', 'summaries'] as const;

/**
 * Flush the offline activity queue.
 *
 * Call when the app regains connectivity. Syncs all queued activities to
 * Firestore and invalidates caches so the UI reflects newly synced data.
 * Only the signed-in user's items are replayed; with no signed-in user
 * nothing is flushed. Items that exceed the retry limit are silently dropped (dead-letter
 * behaviour is handled inside ActivityOfflineQueue.flush()).
 */
export const useFlushOfflineQueue = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const uid = auth().currentUser?.uid;
      if (!uid) {
        return { synced: 0, failed: 0 };
      }
      return activityService.flushOfflineActivities(uid);
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ACTIVITY_NEW_MODEL_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ACTIVITY_SUMMARIES_QUERY_KEY });
    },
  });
};
