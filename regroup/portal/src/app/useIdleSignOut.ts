import { useEffect } from 'react';
import { createIdleTimer, IDLE_TIMEOUT_MS } from './idle-timer';
import { signOutAndReset } from './session';

const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'];
const CHECK_INTERVAL_MS = 30_000;

export function useIdleSignOut(): void {
  useEffect(() => {
    const timer = createIdleTimer({
      timeoutMs: IDLE_TIMEOUT_MS,
      now: () => Date.now(),
      onIdle: () => void signOutAndReset('idle'),
    });
    const onActivity = () => timer.activity();
    const check = () => timer.check();
    // Capture, so activity inside open Modals counts too.
    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, onActivity, { capture: true, passive: true }));
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, onActivity, { capture: true }));
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
      clearInterval(interval);
    };
  }, []);
}
