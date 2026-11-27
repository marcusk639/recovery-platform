/**
 * resetToSignedInRoute: after a sign-in the root navigator remounts on the
 * landing screen (App.tsx navigationKey), so every sign-in from an auth screen
 * (LoginForm, the landing screen's Demo link) resets the root through the
 * global navigationRef once the remount has committed. Runs the real
 * navigation decision.
 */
jest.mock('../service', () => ({ navigationRef: { current: null } }));
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import {
  resetToSignedInRoute,
  SIGNED_IN_RECHECK_MS,
  SIGNED_IN_RESET_DELAY_MS,
} from '../signedInNavigation';
import { Routes } from '../types';

const mockNavDispatch = jest.fn();
let mockCurrentRoute = 'House';

const service = require('../service');
const { logException } = require('../../util/logging');

/** The route the reset lands on: [root, nested]. */
const resetTarget = () => {
  const action = mockNavDispatch.mock.calls.at(-1)?.[0] as {
    type: string;
    payload: { routes: { name: string; state?: { routes: { name: string }[] } }[] };
  };
  expect(action.type).toBe('RESET');
  const [root] = action.payload.routes;
  return [root.name, root.state?.routes[0].name];
};

const admin = { uid: 'a1', isAdmin: true, infoEntered: true, isAnonymous: false } as any;
const guest = { uid: 'g1', isGuest: true, infoEntered: true, isAnonymous: false } as any;
const operatorMidSetup = {
  uid: 'o1',
  potentialSuperAdmin: true,
  infoEntered: true,
  orgSetupCompleted: false,
  isAnonymous: false,
} as any;

beforeEach(() => {
  jest.useFakeTimers();
  mockNavDispatch.mockClear();
  (logException as jest.Mock).mockClear();
  mockCurrentRoute = 'House';
  service.navigationRef.current = {
    dispatch: (...args: unknown[]) => mockNavDispatch(...args),
    getCurrentRoute: () => ({ name: mockCurrentRoute }),
  };
});
afterEach(() => jest.useRealTimers());

describe('resetToSignedInRoute', () => {
  it('waits for the remount before resetting', () => {
    resetToSignedInRoute(admin);
    jest.advanceTimersByTime(SIGNED_IN_RESET_DELAY_MS - 1);
    expect(mockNavDispatch).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(mockNavDispatch).toHaveBeenCalledTimes(1);
  });

  it('resets staff to Main on the House tab', () => {
    resetToSignedInRoute(admin);
    jest.runAllTimers();
    expect(resetTarget()).toEqual([Routes.Main, Routes.House]);
  });

  it('resets a resident to Main on the Guest tab', () => {
    resetToSignedInRoute(guest);
    jest.runAllTimers();
    expect(resetTarget()).toEqual([Routes.Main, Routes.Guest]);
  });

  it('resets an operator who has not finished setup to Setup', () => {
    resetToSignedInRoute(operatorMidSetup);
    jest.runAllTimers();
    expect(resetTarget()).toEqual([Routes.Setup, undefined]);
  });

  it('opens the invitation screen when an invitation is held', () => {
    resetToSignedInRoute(admin, { hasInvitation: true });
    jest.runAllTimers();
    expect(resetTarget()).toEqual([Routes.PriorAuth, Routes.Signup]);
  });

  it('calls onDone after the reset', () => {
    const onDone = jest.fn(() => expect(mockNavDispatch).toHaveBeenCalledTimes(1));
    resetToSignedInRoute(admin, { onDone });
    jest.runAllTimers();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('logs, and still calls onDone, when the navigation container is not mounted', () => {
    service.navigationRef.current = null;
    const onDone = jest.fn();
    resetToSignedInRoute(admin, { onDone });
    jest.runAllTimers();
    expect(logException).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('resets again when a slow remount put the landing screen back after the reset', () => {
    resetToSignedInRoute(admin);
    jest.advanceTimersByTime(SIGNED_IN_RESET_DELAY_MS);
    expect(mockNavDispatch).toHaveBeenCalledTimes(1);
    mockCurrentRoute = Routes.InitialLanding;
    jest.advanceTimersByTime(SIGNED_IN_RECHECK_MS);
    expect(mockNavDispatch).toHaveBeenCalledTimes(2);
    expect(resetTarget()).toEqual([Routes.Main, Routes.House]);
  });

  it('resets once when the start route stuck', () => {
    resetToSignedInRoute(admin);
    jest.runAllTimers();
    expect(mockNavDispatch).toHaveBeenCalledTimes(1);
  });
});
