/**
 * useOfflineSync
 *
 * Flushes the signed-in user's offline activity queue at the moments it can
 * succeed, so queued activities reach Firestore without user action:
 *   - once a user is signed in (including a cold start with items queued
 *     earlier), via the auth state listener's initial event;
 *   - when the app returns to the foreground (background/inactive -> active),
 *     via React Native's AppState;
 *   - when connectivity returns, via @react-native-community/netinfo.
 *
 * Returns { pendingCount } (0 when signed out) so callers can optionally
 * render a sync badge.
 *
 * Usage (call once near the top of the component tree, inside QueryClientProvider):
 *   const { pendingCount } = useOfflineSync();
 */

import { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import auth from '@react-native-firebase/auth';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { offlineQueue } from '../services/offlineQueue';
import { useFlushOfflineQueue } from '../state/queries/useFlushOfflineQueue';
import { logException } from '../util/logging';

/**
 * How long a link may report "connected" with undecided reachability before
 * we stop waiting and treat it as reachable (NetInfo can leave it null).
 */
export const REACHABILITY_FALLBACK_MS = 10000;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseOfflineSyncResult {
  /** Number of activities waiting to be synced. Updated on mount and after each flush. */
  pendingCount: number;
}

export function useOfflineSync(): UseOfflineSyncResult {
  const [pendingCount, setPendingCount] = useState(0);
  const flushMutation = useFlushOfflineQueue();

  // Stable ref so AppState / NetInfo callbacks always see the latest flush fn
  // without needing to be re-subscribed every render.
  const flushRef = useRef(flushMutation.mutate);
  flushRef.current = flushMutation.mutate;

  // AppState at the previous change event; a flush needs a background/inactive -> active transition.
  const prevAppStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Last decided connectivity (link up and internet reachable); null until the
  // first decided event, which only records the state and never flushes.
  const prevIsConnectedRef = useRef<boolean | null>(null);

  // Whether a flush is already in flight — prevents double-firing when both
  // AppState and NetInfo events arrive at nearly the same time.
  const isFlushing = useRef(false);

  /**
   * Load the current pending count from the queue and update state.
   * Called when a user is present or changes, and after each flush.
   */
  const refreshPendingCount = async () => {
    try {
      const uid = auth().currentUser?.uid;
      if (!uid) {
        setPendingCount(0);
        return 0;
      }
      const pending = await offlineQueue.getPending(uid);
      setPendingCount(pending.length);
      return pending.length;
    } catch (error) {
      logException(error, 'useOfflineSync: reading the pending count failed');
      return 0;
    }
  };

  /**
   * Check the queue and trigger a flush if there are pending items.
   * Guards against concurrent calls with the isFlushing flag.
   *
   * The flag is set synchronously before any async work so that a second
   * trigger arriving while getPending() is in flight is also suppressed.
   */
  const maybeFlush = async () => {
    if (isFlushing.current) return;

    // Set the guard synchronously — before any await — so concurrent calls
    // (e.g. both AppState and NetInfo firing at the same time) are blocked.
    isFlushing.current = true;

    try {
      const count = await refreshPendingCount();
      if (count === 0) {
        return;
      }

      await new Promise<void>((resolve, reject) => {
        flushRef.current(undefined, {
          onSuccess: () => resolve(),
          onError: (err) => reject(err),
        });
      });
      // Refresh count again after flush completes so the badge is up to date.
      await refreshPendingCount();
    } catch (error) {
      // Non-fatal: the queue retains the items and the next trigger retries
      // (non-network failures count against the queue's retry limit).
      logException(error, 'useOfflineSync: offline queue flush failed');
    } finally {
      isFlushing.current = false;
    }
  };

  useEffect(() => {
    // The auth listener delivers the current state on subscribe, so this covers
    // a cold start with items queued earlier, and a user who signs in later.
    const authUnsubscribe = auth().onAuthStateChanged((user) => {
      if (user) {
        maybeFlush();
      } else {
        setPendingCount(0);
      }
    });

    // --- AppState listener ---
    const handleAppStateChange = (nextState: AppStateStatus) => {
      const prev = prevAppStateRef.current;
      prevAppStateRef.current = nextState;

      // Only flush when transitioning from background/inactive → active.
      if (nextState === 'active' && prev !== 'active') {
        maybeFlush();
      }
    };

    const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

    // --- NetInfo listener ---
    let reachabilityTimer: ReturnType<typeof setTimeout> | undefined;

    const applyConnectivity = (isConnected: boolean) => {
      const wasConnected = prevIsConnectedRef.current;
      prevIsConnectedRef.current = isConnected;

      // The first decided state only initialises the ref: don't flush on mount
      // just because NetInfo reported its initial state.
      if (wasConnected === null) {
        return;
      }

      // Only flush on reconnect transition (false → true).
      if (!wasConnected && isConnected) {
        maybeFlush();
      }
    };

    const netInfoUnsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      clearTimeout(reachabilityTimer);
      reachabilityTimer = undefined;

      // NetInfo emits (connected, reachable=null) the moment a link comes up and
      // only later settles on true/false (captive portal, weak signal). A flush
      // at the undecided stage either hangs on Firestore's pending writes or
      // fails fast; wait for the decision instead. A lost link (isConnected
      // false) is always decisive, whatever the reachability.
      const linkUp = state.isConnected ?? false;
      if (
        linkUp &&
        (state.isInternetReachable === null || state.isInternetReachable === undefined)
      ) {
        // Reachability can stay undecided; stop waiting and trust the link.
        reachabilityTimer = setTimeout(() => {
          reachabilityTimer = undefined;
          applyConnectivity(true);
        }, REACHABILITY_FALLBACK_MS);
        return;
      }
      applyConnectivity(linkUp && state.isInternetReachable === true);
    });

    return () => {
      authUnsubscribe();
      appStateSubscription.remove();
      netInfoUnsubscribe();
      clearTimeout(reachabilityTimer);
    };
    // maybeFlush is defined inside the effect closure and intentionally
    // captured once. flushRef.current always points to the latest mutate fn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { pendingCount };
}
