/**
 * useOfflineSync — unit tests
 *
 * Mocks:
 *   - AppState.addEventListener  (configured on the preset's mock via beforeEach)
 *   - offlineQueue               (via jest.mock)
 *   - useFlushOfflineQueue       (via jest.mock)
 *   - @react-native-community/netinfo  (virtual mock, see NetInfo section)
 *
 * Strategy for NetInfo:
 *   The hook calls require('@react-native-community/netinfo') lazily inside
 *   the useEffect so we can control it via a virtual jest.mock whose factory
 *   closes over a mutable "mock" prefixed state object. Jest allows variables
 *   whose names start with "mock" (case-insensitive) in mock factories.
 */

import { renderHook, waitFor, act } from '@testing-library/react-native';
import { AppState, AppStateStatus } from 'react-native';

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
// useOfflineSync imports the hook from the extracted leaf module (see 6e0d615),
// so the mock must target that path — not activityQueries, which only re-exports it.
jest.mock('../../state/queries/useFlushOfflineQueue', () => ({
  useFlushOfflineQueue: () => ({
    mutate: mockMutate,
  }),
}));

// ---------------------------------------------------------------------------
// NetInfo virtual mock
//
// The factory references only "mock"-prefixed names (allowed by Jest).
// mockNetInfo.handler  — set by the hook when it calls addEventListener
// mockNetInfo.unsub    — returned as the unsubscribe token
// mockNetInfo.enabled  — controls whether addEventListener is exposed
// ---------------------------------------------------------------------------
const mockNetInfo = {
  handler: null as ((state: { isConnected: boolean | null }) => void) | null,
  unsub: jest.fn(),
  enabled: false,
};

jest.mock(
  '@react-native-community/netinfo',
  () => ({
    // When enabled, addEventListener captures the handler the hook passes in.
    // When not enabled, addEventListener is undefined so tryGetNetInfo() returns null.
    get addEventListener() {
      if (!mockNetInfo.enabled) {
        return undefined;
      }
      return (handler: (state: { isConnected: boolean | null }) => void) => {
        mockNetInfo.handler = handler;
        return mockNetInfo.unsub;
      };
    },
  }),
  { virtual: true },
);

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

function simulateNetInfo(isConnected: boolean) {
  if (mockNetInfo.handler) {
    act(() => {
      mockNetInfo.handler!({ isConnected });
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
import { useOfflineSync } from '../useOfflineSync';

// ---------------------------------------------------------------------------
// Common beforeEach
// ---------------------------------------------------------------------------
beforeEach(() => {
  jest.clearAllMocks();
  capturedAppStateHandler = null;
  mockNetInfo.handler = null;
  mockNetInfo.enabled = false;
  mockNetInfo.unsub.mockReset();

  (AppState.addEventListener as jest.Mock).mockImplementation(
    (_event: string, handler: AppStateHandler) => {
      capturedAppStateHandler = handler;
      return { remove: jest.fn() };
    },
  );

  mockGetPending.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useOfflineSync', () => {
  // -------------------------------------------------------------------------
  // Mount behaviour
  // -------------------------------------------------------------------------
  describe('on mount', () => {
    it('calls getPending() to initialise pendingCount', async () => {
      mockGetPending.mockResolvedValueOnce([]);

      const { result } = renderHook(() => useOfflineSync());

      await waitFor(() => expect(mockGetPending).toHaveBeenCalledTimes(1));
      expect(result.current.pendingCount).toBe(0);
    });

    it('sets pendingCount to the actual queue size', async () => {
      mockGetPending.mockResolvedValueOnce([
        { id: 'a' },
        { id: 'b' },
        { id: 'c' },
      ]);

      const { result } = renderHook(() => useOfflineSync());

      await waitFor(() => expect(result.current.pendingCount).toBe(3));
    });

    it('does NOT call mutate on mount (only checks count, no flush)', async () => {
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
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('does NOT flush when going active → active (no-op transition)', async () => {
      mockGetPending.mockResolvedValue([]);
      renderHook(() => useOfflineSync());

      await waitFor(() => expect(mockGetPending).toHaveBeenCalledTimes(1));

      simulateAppState('active');

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
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
        await new Promise(resolve => setTimeout(resolve, 20));
      });

      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('updates pendingCount to 0 after a successful flush', async () => {
      mockGetPending.mockResolvedValueOnce([]); // on mount
      const { result } = renderHook(() => useOfflineSync());

      await waitFor(() => expect(mockGetPending).toHaveBeenCalledTimes(1));

      // getPending during maybeFlush → 1 item; after flush completes → 0 items
      mockGetPending
        .mockResolvedValueOnce([{ id: 'y' }])
        .mockResolvedValueOnce([]);

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
      // Queue always has items.
      mockGetPending.mockResolvedValue([{ id: 'z' }]);
      renderHook(() => useOfflineSync());

      // Wait for the mount refreshPendingCount to complete.
      await waitFor(() => expect(mockGetPending).toHaveBeenCalledTimes(1));

      // Both background→active transitions fire synchronously so the second
      // maybeFlush sees isFlushing = true (set before the first getPending await).
      simulateAppState('background');
      simulateAppState('active'); // First trigger: sets isFlushing = true immediately

      simulateAppState('background');
      simulateAppState('active'); // Second trigger: should be blocked

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 20));
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
  // Set mockNetInfo.enabled = true so the virtual mock exposes addEventListener.
  // The hook's tryGetNetInfo() runs at effect-mount time, so the flag must be
  // set before renderHook() is called.
  // -------------------------------------------------------------------------
  describe('NetInfo integration (simulated)', () => {
    beforeEach(() => {
      mockNetInfo.enabled = true;
    });

    it('flushes when isConnected transitions false → true with pending items', async () => {
      mockGetPending.mockResolvedValue([{ id: 'net1' }]);

      renderHook(() => useOfflineSync());

      await waitFor(() => expect(mockGetPending).toHaveBeenCalledTimes(1));

      // First event: wasConnected is null → initialisation guard, no flush.
      simulateNetInfo(false);
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });
      expect(mockMutate).toHaveBeenCalledTimes(0);

      // Reconnect: false → true — SHOULD flush.
      simulateNetInfo(true);
      await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));
    });

    it('does NOT flush when isConnected stays true → true', async () => {
      mockGetPending.mockResolvedValue([{ id: 'net2' }]);

      renderHook(() => useOfflineSync());

      await waitFor(() => expect(mockGetPending).toHaveBeenCalledTimes(1));

      // First event: initialisation guard (wasConnected === null) → no flush.
      simulateNetInfo(true);
      // Second event: true → true → no flush.
      simulateNetInfo(true);

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 20));
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
  });
});
