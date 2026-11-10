import { vi } from 'vitest';

vi.mock('@mobile/navigation/types', () => ({
  Routes: new Proxy({}, { get: (_target, key) => `route-${String(key)}` }),
}));

import { currentAlert, resetAlerts } from '../src/adapter/alert/alert-store';
import { confirmLeave } from '../src/app/leave-guard';

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
