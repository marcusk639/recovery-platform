import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import '../src/adapter/preload';
import { captureException } from '../src/adapter/sentry';
import { KeyboardAwareScrollView, KeyboardEvents, useKeyboardState } from '../src/adapter/keyboard-controller';

// components/rats-search-bar assigns navigator.geolocation while loading.
test('navigator.geolocation can be assigned after preload', () => {
  const value = { getCurrentPosition: () => {} };
  (navigator as unknown as { geolocation: unknown }).geolocation = value;
  expect((navigator as unknown as { geolocation: unknown }).geolocation).toBe(value);
});
test('captureException logs the code and name, never the message or extras', () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  captureException(Object.assign(new Error('Casey Smith owes rent'), { code: 'firestore/unavailable' }), {
    extra: { message: 'Casey Smith' },
  });
  const logged = JSON.stringify(spy.mock.calls);
  expect(logged).toContain('firestore/unavailable');
  expect(logged).not.toContain('Casey');
  spy.mockRestore();
});
test('KeyboardAwareScrollView renders its children', () => {
  render(<KeyboardAwareScrollView bottomOffset={10}><span>inside</span></KeyboardAwareScrollView>);
  expect(screen.getByText('inside')).toBeTruthy();
});
test('the keyboard is never reported as visible', () => {
  let height = -1;
  const Probe = () => {
    height = useKeyboardState((s: { isVisible: boolean; height: number }) => (s.isVisible ? s.height : 0));
    return null;
  };
  render(<Probe />);
  expect(height).toBe(0);
});
test('keyboard event listeners can be removed', () => {
  expect(() => KeyboardEvents.addListener('keyboardWillHide', () => {}).remove()).not.toThrow();
});
