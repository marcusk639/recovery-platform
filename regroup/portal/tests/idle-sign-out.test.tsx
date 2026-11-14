import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, vi } from 'vitest';

const signOutAndReset = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('../src/app/session', () => ({ signOutAndReset }));

import { IDLE_TIMEOUT_MS } from '../src/app/idle-timer';
import { useIdleSignOut } from '../src/app/useIdleSignOut';

const START = new Date('2026-11-14T12:00:00Z').getTime();
// Moves the clock without running timers, so the 30-second interval never checks:
// only the focus and visibility checks can notice.
const later = (ms: number) => vi.setSystemTime(START + ms);

beforeEach(() => {
  vi.useFakeTimers({ now: START });
  signOutAndReset.mockClear();
});
afterEach(() => vi.useRealTimers());

test('coming back to the window after 15 idle minutes signs out at once', () => {
  renderHook(() => useIdleSignOut());
  later(IDLE_TIMEOUT_MS + 1);
  window.dispatchEvent(new Event('focus'));
  expect(signOutAndReset).toHaveBeenCalledWith('idle');
});

test('showing the tab again after 15 idle minutes signs out at once', () => {
  renderHook(() => useIdleSignOut());
  later(IDLE_TIMEOUT_MS + 1);
  document.dispatchEvent(new Event('visibilitychange'));
  expect(signOutAndReset).toHaveBeenCalledWith('idle');
});

// A Modal can stop a click from bubbling; the hook listens in the capture phase.
test('activity inside something that stops the event still keeps the session', () => {
  renderHook(() => useIdleSignOut());
  const modal = document.createElement('div');
  modal.addEventListener('pointerdown', (event) => event.stopPropagation());
  document.body.append(modal);
  later(IDLE_TIMEOUT_MS - 60_000);
  modal.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  later(IDLE_TIMEOUT_MS + 60_000);
  window.dispatchEvent(new Event('focus'));
  expect(signOutAndReset).not.toHaveBeenCalled();
  modal.remove();
});

test('nothing is listening once the shell unmounts', () => {
  const { unmount } = renderHook(() => useIdleSignOut());
  unmount();
  later(IDLE_TIMEOUT_MS + 1);
  window.dispatchEvent(new Event('focus'));
  document.dispatchEvent(new Event('visibilitychange'));
  expect(signOutAndReset).not.toHaveBeenCalled();
});
