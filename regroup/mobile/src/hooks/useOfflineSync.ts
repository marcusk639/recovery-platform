/**
 * useOfflineSync
 *
 * Listens for app foreground transitions (background → active) using React
 * Native's built-in AppState API. When the app becomes active, it checks the
 * offline activity queue and flushes any pending items so they are synced to
 * Firestore without the user needing to take any action.
 *
 * If @react-native-community/netinfo is installed it also listens for the
 * isConnected transition from false → true and triggers a flush on reconnect.
 * This is loaded dynamically so the hook does not crash when netinfo is absent.
 *
 * Returns { pendingCount } so callers can optionally render a sync badge.
 *
 * Usage (call once near the top of the component tree, inside QueryClientProvider):
 *   const { pendingCount } = useOfflineSync();
 */

import { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { offlineQueue } from '../services/offlineQueue';
import { useFlushOfflineQueue } from '../state/queries/useFlushOfflineQueue';

// ---------------------------------------------------------------------------
// NetInfo — loaded lazily so the module does not crash when the package is
// absent from node_modules.
// ---------------------------------------------------------------------------

type NetInfoSubscription = () => void;
type NetInfoChangeHandler = (state: { isConnected: boolean | null }) => void;

interface NetInfoLike {
  addEventListener(handler: NetInfoChangeHandler): NetInfoSubscription;
}

function tryGetNetInfo(): NetInfoLike | null {
  try {
    // @react-native-community/netinfo is intentionally NOT installed. A require
    // that Metro can statically analyze (a literal, or even a `const` bound to a
    // string — Metro constant-folds those) registers an unresolvable dependency
    // slot, which Metro drops from this module's dependency map and shifts every
    // sibling import after it. That made `useFlushOfflineQueue` (imported below)
    // resolve to the wrong module at runtime ("useFlushOfflineQueue is not a
    // function"). Aliasing `require` to a value hides the call from Metro's
    // static collector entirely, so the dependency map stays intact. At runtime
    // the aliased require throws for the unbundled module and is caught here.
    const dynamicRequire = require as (name: string) => unknown;
    const mod: any = dynamicRequire('@react-native-community/netinfo');
    const impl = mod?.default ?? mod;
    if (impl && typeof impl.addEventListener === 'function') {
      return impl as NetInfoLike;
    }
    return null;
  } catch {
    return null;
  }
}

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

  // Track the previous AppState to detect background → active transitions.
  const prevAppStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Track the previous isConnected to detect false → true transitions.
  const prevIsConnectedRef = useRef<boolean | null>(null);

  // Whether a flush is already in flight — prevents double-firing when both
  // AppState and NetInfo events arrive at nearly the same time.
  const isFlushing = useRef(false);

  /**
   * Load the current pending count from the queue and update state.
   * Called on mount and after each successful flush.
   */
  const refreshPendingCount = async () => {
    try {
      const pending = await offlineQueue.getPending();
      setPendingCount(pending.length);
      return pending.length;
    } catch {
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
          onError: err => reject(err),
        });
      });
      // Refresh count again after flush completes so the badge is up to date.
      await refreshPendingCount();
    } catch {
      // Flush errors are non-fatal — the queue retains the items and the next
      // trigger will retry (up to MAX_RETRY_COUNT times in the queue itself).
    } finally {
      isFlushing.current = false;
    }
  };

  useEffect(() => {
    // Populate pending count immediately on mount (no flush yet).
    refreshPendingCount();

    // --- AppState listener ---
    const handleAppStateChange = (nextState: AppStateStatus) => {
      const prev = prevAppStateRef.current;
      prevAppStateRef.current = nextState;

      // Only flush when transitioning from background/inactive → active.
      if (nextState === 'active' && prev !== 'active') {
        maybeFlush();
      }
    };

    const appStateSubscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );

    // --- NetInfo listener (optional) ---
    const netInfo = tryGetNetInfo();
    let netInfoUnsubscribe: NetInfoSubscription | null = null;

    if (netInfo) {
      netInfoUnsubscribe = netInfo.addEventListener(state => {
        const isConnected = state.isConnected ?? false;
        const wasConnected = prevIsConnectedRef.current;
        prevIsConnectedRef.current = isConnected;

        // Skip the very first event emitted by NetInfo (initialisation call)
        // where wasConnected is still null — we don't want to flush on mount
        // just because NetInfo fired its initial state.
        if (wasConnected === null) return;

        // Only flush on reconnect transition (false → true).
        if (!wasConnected && isConnected) {
          maybeFlush();
        }
      });
    }

    return () => {
      appStateSubscription.remove();
      if (netInfoUnsubscribe) {
        netInfoUnsubscribe();
      }
    };
    // maybeFlush is defined inside the effect closure and intentionally
    // captured once. flushRef.current always points to the latest mutate fn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { pendingCount };
}
