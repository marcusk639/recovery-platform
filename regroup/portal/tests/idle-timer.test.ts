import { vi } from 'vitest';
import { createIdleTimer, IDLE_TIMEOUT_MS } from '../src/app/idle-timer';

function setup() {
  let time = 0;
  const onIdle = vi.fn();
  const timer = createIdleTimer({ timeoutMs: IDLE_TIMEOUT_MS, now: () => time, onIdle });
  return { timer, onIdle, advance: (ms: number) => (time += ms) };
}
const MIN = 60_000;

test('the timeout is 15 minutes', () => {
  expect(IDLE_TIMEOUT_MS).toBe(15 * MIN);
});
test('fires once after the timeout with no activity', () => {
  const { timer, onIdle, advance } = setup();
  advance(15 * MIN);
  timer.check();
  timer.check();
  expect(onIdle).toHaveBeenCalledTimes(1);
});
test('does not fire one millisecond early', () => {
  const { timer, onIdle, advance } = setup();
  advance(15 * MIN - 1);
  timer.check();
  expect(onIdle).not.toHaveBeenCalled();
});
test('activity restarts the clock', () => {
  const { timer, onIdle, advance } = setup();
  advance(14 * MIN);
  timer.activity();
  advance(14 * MIN);
  timer.check();
  expect(onIdle).not.toHaveBeenCalled();
});
test('a check after a long gap fires, as when a laptop wakes or a hidden tab resumes', () => {
  const { timer, onIdle, advance } = setup();
  advance(120 * MIN);
  timer.check();
  expect(onIdle).toHaveBeenCalledTimes(1);
});
test('activity after it fired does not fire it again', () => {
  const { timer, onIdle, advance } = setup();
  advance(15 * MIN);
  timer.check();
  timer.activity();
  advance(15 * MIN);
  timer.check();
  expect(onIdle).toHaveBeenCalledTimes(1);
});
