import { renderHook, act } from '@testing-library/react-native';
import { Keyboard, EmitterSubscription } from 'react-native';
import { useKeyboardVisible } from '../useKeyboardVisible';

describe('useKeyboardVisible', () => {
  it('returns false initially', () => {
    const { result } = renderHook(() => useKeyboardVisible());
    expect(result.current).toBe(false);
  });

  it('returns true when keyboardDidShow fires', () => {
    const listeners: Record<string, Array<() => void>> = {};
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((
      event: string,
      cb: () => void,
    ) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(cb);
      return { remove: jest.fn() } as unknown as EmitterSubscription;
    }) as typeof Keyboard.addListener);

    const { result } = renderHook(() => useKeyboardVisible());
    act(() => {
      listeners['keyboardDidShow']?.forEach(cb => cb());
    });
    expect(result.current).toBe(true);
  });

  it('returns false again when keyboardDidHide fires', () => {
    const listeners: Record<string, Array<() => void>> = {};
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((
      event: string,
      cb: () => void,
    ) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(cb);
      return { remove: jest.fn() } as unknown as EmitterSubscription;
    }) as typeof Keyboard.addListener);

    const { result } = renderHook(() => useKeyboardVisible());
    act(() => {
      listeners['keyboardDidShow']?.forEach(cb => cb());
    });
    act(() => {
      listeners['keyboardDidHide']?.forEach(cb => cb());
    });
    expect(result.current).toBe(false);
  });

  it('removes listeners on unmount', () => {
    const removeShow = jest.fn();
    const removeHide = jest.fn();
    jest
      .spyOn(Keyboard, 'addListener')
      .mockImplementationOnce(
        () => ({ remove: removeShow } as unknown as EmitterSubscription),
      )
      .mockImplementationOnce(
        () => ({ remove: removeHide } as unknown as EmitterSubscription),
      );

    const { unmount } = renderHook(() => useKeyboardVisible());
    unmount();

    expect(removeShow).toHaveBeenCalled();
    expect(removeHide).toHaveBeenCalled();
  });
});
