import { vi } from 'vitest';

vi.mock('@mobile/navigation/types', () => ({
  Routes: new Proxy({}, { get: (_target, key) => `route-${String(key)}` }),
}));

import { currentAlert, resetAlerts } from '../src/adapter/alert/alert-store';
import { renderHook } from '@testing-library/react';
import { confirmLeave, releaseLeaveWarning, useLeaveWarning } from '../src/app/leave-guard';

beforeEach(() => resetAlerts());

const button = (text: string) => currentAlert()!.buttons.find((b) => b.text === text)!;

test('off the intake form, leaving happens at once', () => {
  const leave = vi.fn();
  confirmLeave('route-GuestList', leave);
  expect(leave).toHaveBeenCalledTimes(1);
  expect(currentAlert()).toBeUndefined();
});
test('on the intake form, leaving waits for Leave', () => {
  const leave = vi.fn();
  confirmLeave('route-ResidentIntake', leave);
  expect(leave).not.toHaveBeenCalled();
  expect(currentAlert()?.title).toBe('Leave the intake form?');
  button('Leave').onPress!();
  expect(leave).toHaveBeenCalledTimes(1);
});
test('Stay keeps the form', () => {
  const leave = vi.fn();
  confirmLeave('route-ResidentIntake', leave);
  button('Stay').onPress?.();
  expect(leave).not.toHaveBeenCalled();
});

const unloadPrevented = () => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};
test('on the intake form, leaving the page warns first', () => {
  const { unmount } = renderHook(() => useLeaveWarning('route-ResidentIntake'));
  expect(unloadPrevented()).toBe(true);
  unmount();
});
test('a sign-out releases the warning, so the page can unload', () => {
  const { unmount } = renderHook(() => useLeaveWarning('route-ResidentIntake'));
  releaseLeaveWarning();
  expect(unloadPrevented()).toBe(false);
  unmount();
});
