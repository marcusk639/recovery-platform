/**
 * useKeyboard Hook Tests
 *
 * Tests the keyboard height tracking hook that subscribes to
 * React Native Keyboard events.
 *
 * Strategy: intercept Keyboard.addListener to capture callbacks, then
 * invoke them directly inside act() to simulate keyboard events.
 */

import { renderHook, act } from '@testing-library/react-native';
import { Keyboard } from 'react-native';
import { useKeyboard } from '../use-keyboard';

// ── Listener capture ──────────────────────────────────────────────────────────

type ShowCallback = (event: { endCoordinates: { height: number } }) => void;
type HideCallback = () => void;

let capturedShowCallback: ShowCallback | null = null;
let capturedHideCallback: HideCallback | null = null;

// Intercept addListener calls so we can fire them manually in tests
const addListenerSpy = jest
  .spyOn(Keyboard, 'addListener')
  .mockImplementation((eventName: string, callback: any) => {
    if (eventName === 'keyboardDidShow') {
      capturedShowCallback = callback;
    } else if (eventName === 'keyboardDidHide') {
      capturedHideCallback = callback;
    }
    // Return a minimal subscription object
    return { remove: jest.fn() } as any;
  });

// ── Helpers ───────────────────────────────────────────────────────────────────

function emitShow(height: number): void {
  capturedShowCallback?.({ endCoordinates: { height } });
}

function emitHide(): void {
  capturedHideCallback?.();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useKeyboard', () => {
  beforeEach(() => {
    capturedShowCallback = null;
    capturedHideCallback = null;
    addListenerSpy.mockClear();
  });

  describe('initial state', () => {
    it('returns keyboard height of 0 on mount', () => {
      const { result } = renderHook(() => useKeyboard());
      const [keyboardHeight] = result.current;
      expect(keyboardHeight).toBe(0);
    });

    it('returns a tuple with exactly one element', () => {
      const { result } = renderHook(() => useKeyboard());
      expect(result.current).toHaveLength(1);
    });

    it('registers keyboardDidShow listener on mount', () => {
      renderHook(() => useKeyboard());
      expect(addListenerSpy).toHaveBeenCalledWith('keyboardDidShow', expect.any(Function));
    });

    it('registers keyboardDidHide listener on mount', () => {
      renderHook(() => useKeyboard());
      expect(addListenerSpy).toHaveBeenCalledWith('keyboardDidHide', expect.any(Function));
    });
  });

  describe('keyboard show event', () => {
    it('updates height when keyboardDidShow fires', () => {
      const { result } = renderHook(() => useKeyboard());

      act(() => { emitShow(336); });

      const [keyboardHeight] = result.current;
      expect(keyboardHeight).toBe(336);
    });

    it('updates height for various keyboard sizes', () => {
      const { result } = renderHook(() => useKeyboard());

      act(() => { emitShow(271); });

      expect(result.current[0]).toBe(271);
    });

    it('updates height to exact value from event', () => {
      const { result } = renderHook(() => useKeyboard());

      act(() => { emitShow(216); });

      expect(result.current[0]).toBe(216);
    });
  });

  describe('keyboard hide event', () => {
    it('resets height to 0 when keyboardDidHide fires', () => {
      const { result } = renderHook(() => useKeyboard());

      act(() => { emitShow(336); });
      expect(result.current[0]).toBe(336);

      act(() => { emitHide(); });
      expect(result.current[0]).toBe(0);
    });

    it('remains at 0 when keyboardDidHide fires without prior show', () => {
      const { result } = renderHook(() => useKeyboard());

      act(() => { emitHide(); });

      expect(result.current[0]).toBe(0);
    });
  });

  describe('multiple show/hide cycles', () => {
    it('handles repeated show and hide cycles correctly', () => {
      const { result } = renderHook(() => useKeyboard());

      act(() => { emitShow(300); });
      expect(result.current[0]).toBe(300);

      act(() => { emitHide(); });
      expect(result.current[0]).toBe(0);

      act(() => { emitShow(400); });
      expect(result.current[0]).toBe(400);

      act(() => { emitHide(); });
      expect(result.current[0]).toBe(0);
    });
  });

  describe('cleanup', () => {
    it('removes keyboardDidShow listener on unmount', () => {
      const removeAllListenersSpy = jest.spyOn(Keyboard, 'removeAllListeners');

      const { unmount } = renderHook(() => useKeyboard());
      unmount();

      expect(removeAllListenersSpy).toHaveBeenCalledWith('keyboardDidShow');
    });

    it('removes keyboardDidHide listener on unmount', () => {
      const removeAllListenersSpy = jest.spyOn(Keyboard, 'removeAllListeners');

      const { unmount } = renderHook(() => useKeyboard());
      unmount();

      expect(removeAllListenersSpy).toHaveBeenCalledWith('keyboardDidHide');
    });

    it('calls removeAllListeners exactly twice on unmount (once per event type)', () => {
      const removeAllListenersSpy = jest.spyOn(Keyboard, 'removeAllListeners');
      // Clear any calls accumulated by prior cleanup tests in this suite
      removeAllListenersSpy.mockClear();

      const { unmount } = renderHook(() => useKeyboard());
      unmount();

      expect(removeAllListenersSpy).toHaveBeenCalledTimes(2);
    });
  });
});
