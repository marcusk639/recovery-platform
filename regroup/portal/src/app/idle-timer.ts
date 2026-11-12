export const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

export interface IdleTimer {
  activity(): void;
  check(): void;
}

// Compares clock times rather than counting down, because browsers throttle timers
// in hidden tabs and stop them while a laptop sleeps.
export function createIdleTimer(options: { timeoutMs: number; now: () => number; onIdle: () => void }): IdleTimer {
  let lastActivity = options.now();
  let fired = false;
  const check = () => {
    if (fired || options.now() - lastActivity < options.timeoutMs) return;
    fired = true;
    options.onIdle();
  };
  return {
    activity() {
      // A waking laptop's first mouse move must not rescue an expired session.
      check();
      if (!fired) lastActivity = options.now();
    },
    check,
  };
}
