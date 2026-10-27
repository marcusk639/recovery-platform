/**
 * useOfflineSync — unit tests
 *
 * Mocks:
 *   - AppState.addEventListener        (configured on the preset's mock via beforeEach)
 *   - firebase auth                    (mutable current user + onAuthStateChanged)
 *   - offlineQueue                     (via jest.mock)
 *   - useFlushOfflineQueue             (via jest.mock)
 *   - @react-native-community/netinfo  (addEventListener captures the hook's handler)
 *
 * Jest allows "mock"-prefixed variables in mock factories, so the factories
 * close over mutable mock state that each test can drive.
 */

import { renderHook, waitFor, act } from '@testing-library/react-native';
import { AppState, AppStateStatus } from 'react-native';

// ---------------------------------------------------------------------------
// Mock: firebase auth
//
// onAuthStateChanged delivers the current user immediately, like the real
// listener, and keeps the callback so tests can sign in/out later.
// ---------------------------------------------------------------------------
let mockCurrentUser: { uid: string } | null = { uid: 'test-uid' };
let mockAuthListener: ((user: { uid: string } | null) => void) | null = null;
const mockAuthUnsub = jest.fn();
jest.mock('@react-native-firebase/auth', () => ({
  __esModule: true,
  default: () => ({
    get currentUser() {
      return mockCurrentUser;
    },
    onAuthStateChanged: (listener: (user: { uid: string } | null) => void) => {
      mockAuthListener = listener;
      listener(mockCurrentUser);
      return mockAuthUnsub;
    },
  }),
}));

const mockLogException = jest.fn();
jest.mock('../../util/logging', () => ({
  logException: (...args: unknown[]) => mockLogException(...args),
}));

// ---------------------------------------------------------------------------
// Mock: offlineQueue
// ---------------------------------------------------------------------------
const mockGetPending = jest.fn();
jest.mock('../../services/offlineQueue', () => ({
  offlineQueue: {
    getPending: (...args: unknown[]) => mockGetPending(...args),
  },
}));

// ---------------------------------------------------------------------------
// Mock: useFlushOfflineQueue
// ---------------------------------------------------------------------------
const mockMutate = jest.fn();
// useOfflineSync imports the hook from the extracted leaf module, so the mock
// must target that path, not activityQueries, which only re-exports it.
jest.mock('../../state/queries/useFlushOfflineQueue', () => ({
  useFlushOfflineQueue: () => ({
    mutate: mockMutate,
  }),
}));

// ---------------------------------------------------------------------------
// NetInfo mock
//
// mockNetInfo.handler — set by the hook when it calls addEventListener
// mockNetInfo.unsub   — returned as the unsubscribe token
// ---------------------------------------------------------------------------
type NetInfoHandler = (state: {
  isConnected: boolean | null;
  isInternetReachable?: boolean | null;
}) => void;

const mockNetInfo = {
  handler: null as NetInfoHandler | null,
  unsub: jest.fn(),
};
const mockNetInfoAddEventListener = jest.fn((handler: NetInfoHandler) => {
  mockNetInfo.handler = handler;
  return mockNetInfo.unsub;
});

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: (handler: NetInfoHandler) => mockNetInfoAddEventListener(handler),
  },
}));

// ---------------------------------------------------------------------------
// AppState helpers
//
// The react-native jest preset mocks AppState.addEventListener as jest.fn().
// We configure it in beforeEach to capture the callback.
// ---------------------------------------------------------------------------
type AppStateHandler = (state: AppStateStatus) => void;
let capturedAppStateHandler: AppStateHandler | null = null;

function simulateAppState(nextState: AppStateStatus) {
  if (capturedAppStateHandler) {
    act(() => {
      capturedAppStateHandler!(nextState);
    });
  }
}

function simulateNetInfo(isConnected: boolean, isInternetReachable?: boolean | null) {
  if (mockNetInfo.handler) {
    act(() => {
      mockNetInfo.handler!({ isConnected, isInternetReachable });
    });
  }
}

/** Resolve the most recently called mutate's onSuccess callback. */
function resolveMutate() {
  const calls = mockMutate.mock.calls;
  const call = calls[calls.length - 1];
  const callbacks = call?.[1];
  if (callbacks?.onSuccess) {
    act(() => callbacks.onSuccess());
  }
}

// ---------------------------------------------------------------------------
// Import hook under test (after all top-level mocks are in place)
// ---------------------------------------------------------------------------
import { useOfflineSync, REACHABILITY_FALLBACK_MS } from '../useOfflineSync';

// ---------------------------------------------------------------------------
// Common beforeEach
// ---------------------------------------------------------------------------
beforeEach(() => {
  jest.clearAllMocks();
  capturedAppStateHandler = null;
  mockNetInfo.handler = null;
  mockNetInfo.unsub.mockReset();
  mockCurrentUser = { uid: 'test-uid' };
  mockAuthListener = null;

  (AppState.addEventListener as jest.Mock).mockImplementation(
    (_event: string, handler: AppStateHandler) => {
      capturedAppStateHandler = handler;
      return { remove: jest.fn() };
    },
  );

  mockGetPending.mockResolvedValue([]);
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useOfflineSync', () => {
  // -------------------------------------------------------------------------
  // Mount behaviour
  // -------------------------------------------------------------------------
  describe('on mount', () => {
    it("passes the signed-in user's uid to getPending()", async () => {
      renderHook(() => useOfflineSync());
      await waitFor(() => expect(mockGetPending).toHaveBeenCalledWith('test-uid'));
    });

    it('calls getPending() to initialise pendingCount', async () => {
      mockGetPending.mockResolvedValueOnce([]);

      const { result } = renderHook(() => useOfflineSync());

      await waitFor(() => expect(mockGetPending).toHaveBeenCalledTimes(1));
      expect(result.current.pendingCount).toBe(0);
    });

    it('sets pendingCount to the actual queue size', async () => {
      mockGetPending.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);

      const { result } = renderHook(() => useOfflineSync());

      await waitFor(() => expect(result.current.pendingCount).toBe(3));
    });

    it('subscribes to NetInfo and to auth state changes', async () => {
      renderHook(() => useOfflineSync());

      expect(mockNetInfoAddEventListener).toHaveBeenCalledTimes(1);
      expect(mockAuthListener).not.toBeNull();
      await waitFor(() => expect(mockGetPending).toHaveBeenCalledTimes(1));
    });

    it('flushes once on mount when the signed-in user already has queued items', async () => {
      mockGetPending.mockResolvedValue([{ id: 'cold-start' }]);

      renderHook(() => useOfflineSync());

      await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));
    });

    it('reports 0 and neither reads nor flushes the queue when signed out', async () => {
      mockCurrentUser = null;
      mockGetPending.mockResolvedValue([{ id: 'x' }]);

      const { result } = renderHook(() => useOfflineSync());

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      expect(result.current.pendingCount).toBe(0);
      expect(mockGetPending).not.toHaveBeenCalled();
      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('flushes when a user signs in after mount, and resets the count on sign-out', async () => {
      mockCurrentUser = null;
      const { result } = renderHook(() => useOfflineSync());
      mockCurrentUser = { uid: 'late-uid' };
      mockGetPending.mockResolvedValue([{ id: 'q1' }, { id: 'q2' }]);

      act(() => mockAuthListener!({ uid: 'late-uid' }));
      await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));
      expect(mockGetPending).toHaveBeenCalledWith('late-uid');
      await waitFor(() => expect(result.current.pendingCount).toBe(2));

      act(() => mockAuthListener!(null));
      expect(result.current.pendingCount).toBe(0);
    });

    it('reports (without throwing) when the pending count cannot be read', async () => {
      mockGetPending.mockRejectedValue(new Error('storage'));

      const { result } = renderHook(() => useOfflineSync());

      await waitFor(() => expect(mockLogException).toHaveBeenCalled());
      expect(result.current.pendingCount).toBe(0);
      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('reports a failed flush and allows a later flush', async () => {
      mockGetPending.mockResolvedValue([{ id: 'f1' }]);
      renderHook(() => useOfflineSync());
      await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));

      act(() => mockMutate.mock.calls[0][1].onError(new Error('flush failed')));
      await waitFor(() => expect(mockLogException).toHaveBeenCalled());

      simulateAppState('background');
      simulateAppState('active');
      await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(2));
    });

    it('does NOT call mutate on mount when the queue is empty (only checks count)', async () => {
      mockGetPending.mockResolvedValueOnce([]);

      renderHook(() => useOfflineSync());

      await waitFor(() => expect(mockGetPending).toHaveBeenCalledTimes(1));
      expect(mockMutate).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // AppState transitions
  // -------------------------------------------------------------------------
  describe('AppState changes', () => {
    it('does NOT flush when transitioning active → background', async () => {
      mockGetPending.mockResolvedValue([]);
      renderHook(() => useOfflineSync());

      await waitFor(() => expect(mockGetPending).toHaveBeenCalledTimes(1));

      simulateAppState('background');

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('does NOT flush when going active → active (no-op transition)', async () => {
      mockGetPending.mockResolvedValue([]);
      renderHook(() => useOfflineSync());

      await waitFor(() => expect(mockGetPending).toHaveBeenCalledTimes(1));

      simulateAppState('active');

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('flushes when transitioning background → active with pending items', async () => {
      mockGetPending.mockResolvedValueOnce([]); // on mount
      renderHook(() => useOfflineSync());

      await waitFor(() => expect(mockGetPending).toHaveBeenCalledTimes(1));

      simulateAppState('background');

      // Queue now has items
      mockGetPending.mockResolvedValue([{ id: 'x' }]);

      simulateAppState('active');

      await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));
    });

    it('does NOT flush when transitioning background → active with empty queue', async () => {
      mockGetPending.mockResolvedValue([]);
      renderHook(() => useOfflineSync());

      await waitFor(() => expect(mockGetPending).toHaveBeenCalledTimes(1));

      simulateAppState('background');
      simulateAppState('active');

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('updates pendingCount to 0 after a successful flush', async () => {
      mockGetPending.mockResolvedValueOnce([]); // on mount
      const { result } = renderHook(() => useOfflineSync());

      await waitFor(() => expect(mockGetPending).toHaveBeenCalledTimes(1));

      // getPending during maybeFlush → 1 item; after flush completes → 0 items
      mockGetPending.mockResolvedValueOnce([{ id: 'y' }]).mockResolvedValueOnce([]);

      simulateAppState('background');
      simulateAppState('active');

      await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));

      resolveMutate();

      await waitFor(() => expect(result.current.pendingCount).toBe(0));
    });

    it('pendingCount reflects queue size set at mount', async () => {
      mockGetPending.mockResolvedValueOnce([{ id: '1' }, { id: '2' }]);
      const { result } = renderHook(() => useOfflineSync());

      await waitFor(() => expect(result.current.pendingCount).toBe(2));
    });
  });

  // -------------------------------------------------------------------------
  // Concurrent-flush guard
  // -------------------------------------------------------------------------
  describe('concurrent flush guard', () => {
    it('does not trigger a second flush while one is in flight', async () => {
      // Empty at mount (so mount does not flush), items afterwards.
      mockGetPending.mockResolvedValueOnce([]).mockResolvedValue([{ id: 'z' }]);
      renderHook(() => useOfflineSync());

      // Wait for the mount count check to complete.
      await waitFor(() => expect(mockGetPending).toHaveBeenCalledTimes(1));

      // Both background→active transitions fire synchronously so the second
      // maybeFlush sees isFlushing = true (set before the first getPending await).
      simulateAppState('background');
      simulateAppState('active'); // First trigger: sets isFlushing = true immediately

      simulateAppState('background');
      simulateAppState('active'); // Second trigger: should be blocked

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      expect(mockMutate).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Cleanup / no memory leaks
  // -------------------------------------------------------------------------
  describe('cleanup', () => {
    it('removes the AppState listener on unmount', () => {
      const localRemove = jest.fn();
      (AppState.addEventListener as jest.Mock).mockReturnValueOnce({
        remove: localRemove,
      });

      const { unmount } = renderHook(() => useOfflineSync());
      unmount();

      expect(localRemove).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // NetInfo integration (simulated)
  //
  // The queue is empty at mount (so mount itself does not flush) and holds
  // items afterwards; events are then driven through mockNetInfo.handler.
  // -------------------------------------------------------------------------
  describe('NetInfo integration (simulated)', () => {
    const queueFilledAfterMount = (id: string) =>
      mockGetPending.mockResolvedValueOnce([]).mockResolvedValue([{ id }]);

    it('flushes when isConnected transitions false → true with pending items', async () => {
      queueFilledAfterMount('net1');

      renderHook(() => useOfflineSync());

      await waitFor(() => expect(mockGetPending).toHaveBeenCalledTimes(1));

      // First event: wasConnected is null → initialisation guard, no flush.
      simulateNetInfo(false, false);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      expect(mockMutate).toHaveBeenCalledTimes(0);

      // Reconnect: false → true (reachability confirmed) — SHOULD flush.
      simulateNetInfo(true, true);
      await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));
    });

    it('does NOT flush when isConnected stays true → true', async () => {
      queueFilledAfterMount('net2');

      renderHook(() => useOfflineSync());

      await waitFor(() => expect(mockGetPending).toHaveBeenCalledTimes(1));

      // First event: initialisation guard (wasConnected === null) → no flush.
      simulateNetInfo(true, true);
      // Second event: true → true → no flush.
      simulateNetInfo(true, true);

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('cleans up the NetInfo subscription on unmount', async () => {
      mockGetPending.mockResolvedValue([]);

      const { unmount } = renderHook(() => useOfflineSync());

      await waitFor(() => expect(mockGetPending).toHaveBeenCalledTimes(1));

      unmount();

      expect(mockNetInfo.unsub).toHaveBeenCalledTimes(1);
    });

    it('does NOT flush on reconnect while the internet is unreachable', async () => {
      queueFilledAfterMount('net3');

      renderHook(() => useOfflineSync());

      await waitFor(() => expect(mockGetPending).toHaveBeenCalledTimes(1));

      // NetInfo's real captive-portal sequence: reachability is undecided
      // (null) when the link comes up, then settles on false.
      simulateNetInfo(false, false);
      simulateNetInfo(true, null);
      simulateNetInfo(true, false);

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('flushes once reachability is confirmed after a reconnect', async () => {
      queueFilledAfterMount('net4');

      renderHook(() => useOfflineSync());

      await waitFor(() => expect(mockGetPending).toHaveBeenCalledTimes(1));

      simulateNetInfo(false, false);
      simulateNetInfo(true, null);
      simulateNetInfo(true, true);

      await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));
    });
    describe('reachability that never settles', () => {
      const startReconnectWithUndecidedReachability = async () => {
        jest.useFakeTimers();
        queueFilledAfterMount('net5');
        renderHook(() => useOfflineSync());
        await waitFor(() => expect(mockGetPending).toHaveBeenCalledTimes(1));
        simulateNetInfo(false, false);
        simulateNetInfo(true, null);
      };

      it('falls back to isConnected after the bounded wait', async () => {
        await startReconnectWithUndecidedReachability();

        await act(async () => {
          jest.advanceTimersByTime(REACHABILITY_FALLBACK_MS - 1);
        });
        expect(mockMutate).not.toHaveBeenCalled();

        await act(async () => {
          jest.advanceTimersByTime(1);
        });
        await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));
      });

      it('does not fall back when reachability is decided as unreachable in time', async () => {
        await startReconnectWithUndecidedReachability();

        simulateNetInfo(true, false);
        await act(async () => {
          jest.advanceTimersByTime(REACHABILITY_FALLBACK_MS * 2);
        });

        expect(mockMutate).not.toHaveBeenCalled();
      });

      it('does not fall back after the link is lost again', async () => {
        await startReconnectWithUndecidedReachability();

        simulateNetInfo(false, false);
        await act(async () => {
          jest.advanceTimersByTime(REACHABILITY_FALLBACK_MS * 2);
        });

        expect(mockMutate).not.toHaveBeenCalled();
      });

      it('cancels the pending fallback on unmount', async () => {
        jest.useFakeTimers();
        queueFilledAfterMount('net6');
        const { unmount } = renderHook(() => useOfflineSync());
        await waitFor(() => expect(mockGetPending).toHaveBeenCalledTimes(1));
        simulateNetInfo(false, false);
        simulateNetInfo(true, null);

        unmount();
        await act(async () => {
          jest.advanceTimersByTime(REACHABILITY_FALLBACK_MS * 2);
        });

        expect(mockMutate).not.toHaveBeenCalled();
      });
    });
  });
});
