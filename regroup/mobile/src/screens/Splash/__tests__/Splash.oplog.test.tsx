/**
 * Splash (withSplash) auth-state and FCM token handling against the
 * firebase-modular auth and messaging mocks.
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 10 Step 1).
 * This file stays byte-identical through the Task 10 migration (group 10e): a
 * mapping mistake in the rewrite fails here instead of being copied into an
 * edited expectation. Assertions are on outcomes and log entries only, never
 * on mock call chains. Auth and messaging are not part of the log; Splash
 * makes no Firestore or callable op itself (the log stays empty). Each case
 * pins what reaches the store: which user-slice action is dispatched, with
 * which argument, as a consequence of the auth state, the push permission and
 * the FCM token. Messaging callbacks are captured by replacing a method on the
 * shared messaging instance, which both API shapes delegate to.
 */
jest.mock('../../../../firebase-setup', () =>
  require('../../../../__mocks__/firebase-modular/setup'),
);
jest.mock('@react-native-firebase/auth', () =>
  require('../../../../__mocks__/firebase-modular/auth'),
);
jest.mock('@react-native-firebase/messaging', () =>
  require('../../../../__mocks__/firebase-modular/messaging'),
);
jest.mock('react-native-notify-kit', () => {
  const kit = jest.requireActual('react-native-notify-kit/jest-mock');
  return {
    ...kit,
    __esModule: true,
    default: {
      ...kit.default,
      displayNotification: async (notification: unknown) => {
        mockDisplayed.push(notification);
      },
    },
  };
});
jest.mock('../../../services/native-deep-links', () => ({
  getInitialLink: async () => null,
  onLink: () => () => {},
  getLinkType: () => null,
  createInvitationFromLink: () => null,
}));
jest.mock('../../../state/slices/userSlice', () => {
  const thunk = (type: string) => (arg?: unknown) => ({ type, arg, unwrap: async () => ({}) });
  return {
    autoLogin: thunk('autoLogin'),
    anonymouslyLogin: thunk('anonymouslyLogin'),
    updateUser: thunk('updateUser'),
    loginFailedAction: () => ({ type: 'loginFailed' }),
    initializeInvitation: (arg: unknown) => ({ type: 'initializeInvitation', arg }),
  };
});
jest.mock('../../../state/store', () => ({
  useAppDispatch: () => (action: { type: string; arg?: unknown }) => {
    mockDispatched.push({ type: action.type, arg: action.arg });
    return action;
  },
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ user: mockUserState }),
}));
jest.mock('../../../util/logging', () => ({ logException: jest.fn() }));
jest.mock('../../../util/simple-debug-logger', () => ({
  logDebug: jest.fn(),
  logError: jest.fn(),
  logWarn: jest.fn(),
}));
jest.mock('../../../components/DeepLinkTester', () => ({ DeepLinkTester: () => null }));
jest.mock('../../../components/rats-logo', () => ({ RatsLogo: () => null }));

import React from 'react';
import { Text } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';
import { getOpLog, resetOpLog } from '../../../../__mocks__/firebase-modular/log';
import { withSplash } from '../Splash';

const mockDisplayed: unknown[] = [];
const mockDispatched: Array<{ type: string; arg?: unknown }> = [];
let mockUserState: Record<string, unknown> = {};

const auth = jest.requireMock<{ setCurrentUser: (user: unknown) => void }>(
  '@react-native-firebase/auth',
);
const messaging = jest.requireMock<{
  instance: Record<string, unknown>;
  AuthorizationStatus: Record<string, number>;
}>('@react-native-firebase/messaging');
const originalMessaging = { ...messaging.instance };

const SplashHOC = withSplash(() => <Text>ready</Text>);

function renderSplash(userState: Record<string, unknown> = {}) {
  mockUserState = { user: null, invitation: null, updating: false, ...userState };
  return render(<SplashHOC navigation={{} as never} />);
}

const dispatchedOf = (type: string) => mockDispatched.filter((a) => a.type === type);

/** Lets pending promise callbacks (a token read, a dispatch) run. */
const settle = () => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

beforeEach(() => {
  resetOpLog();
  mockDisplayed.length = 0;
  mockDispatched.length = 0;
  auth.setCurrentUser(null);
});

afterEach(() => {
  Object.assign(messaging.instance, originalMessaging);
  expect(getOpLog()).toEqual([]);
});

describe('auth state', () => {
  it('auto-logs-in the signed-in Firebase user', async () => {
    auth.setCurrentUser({ uid: 'u1' });
    renderSplash();

    await waitFor(() =>
      expect(dispatchedOf('autoLogin')).toEqual([{ type: 'autoLogin', arg: { uid: 'u1' } }]),
    );
    expect(dispatchedOf('loginFailed')).toEqual([]);
  });

  it('marks login failed when no Firebase user is signed in', async () => {
    renderSplash();

    await waitFor(() => expect(dispatchedOf('loginFailed')).toHaveLength(1));
    expect(dispatchedOf('autoLogin')).toEqual([]);
  });
});

describe('FCM token on mount', () => {
  const user = (messagingToken?: string[]) => ({ id: 'u1', messagingToken });

  it('stores the token when the user has none', async () => {
    const u = user();
    renderSplash({ user: u });

    await waitFor(() =>
      expect(dispatchedOf('updateUser')).toEqual([
        { type: 'updateUser', arg: { user: u, updates: { messagingToken: ['mock-fcm-token'] } } },
      ]),
    );
  });

  it('appends the token to the existing ones', async () => {
    const u = user(['old-token']);
    renderSplash({ user: u });

    await waitFor(() =>
      expect(dispatchedOf('updateUser')).toEqual([
        {
          type: 'updateUser',
          arg: { user: u, updates: { messagingToken: ['old-token', 'mock-fcm-token'] } },
        },
      ]),
    );
  });

  it('stores the token when permission is provisional', async () => {
    messaging.instance.requestPermission = async () => messaging.AuthorizationStatus.PROVISIONAL;
    const u = user();
    renderSplash({ user: u });

    await waitFor(() => expect(dispatchedOf('updateUser')).toHaveLength(1));
  });

  it('does not store a token the user already has', async () => {
    let tokenRead = false;
    messaging.instance.getToken = async () => {
      tokenRead = true;
      return 'mock-fcm-token';
    };
    renderSplash({ user: user(['mock-fcm-token']) });

    await waitFor(() => expect(tokenRead).toBe(true));
    await settle();
    expect(dispatchedOf('updateUser')).toEqual([]);
  });

  it('does not read or store a token when permission is denied', async () => {
    let tokenRead = false;
    let asked = false;
    messaging.instance.requestPermission = async () => {
      asked = true;
      return messaging.AuthorizationStatus.DENIED;
    };
    messaging.instance.getToken = async () => {
      tokenRead = true;
      return 'mock-fcm-token';
    };
    renderSplash({ user: user() });

    await waitFor(() => expect(asked).toBe(true));
    await settle();
    expect(tokenRead).toBe(false);
    expect(dispatchedOf('updateUser')).toEqual([]);
  });

  it('does not store the token while the user is updating', async () => {
    let tokenRead = false;
    messaging.instance.getToken = async () => {
      tokenRead = true;
      return 'mock-fcm-token';
    };
    renderSplash({ user: user(), updating: true });

    await waitFor(() => expect(tokenRead).toBe(true));
    await settle();
    expect(dispatchedOf('updateUser')).toEqual([]);
  });
});

describe('messaging listeners', () => {
  it('appends a refreshed token to the user', async () => {
    let refresh: ((token: string) => Promise<void>) | undefined;
    messaging.instance.onTokenRefresh = (cb: (token: string) => Promise<void>) => {
      refresh = cb;
      return () => {};
    };
    const u = { id: 'u1', messagingToken: ['mock-fcm-token'] };
    renderSplash({ user: u });
    await waitFor(() => expect(refresh).toBeDefined());

    await refresh!('fresh-token');

    expect(dispatchedOf('updateUser')).toEqual([
      {
        type: 'updateUser',
        arg: { user: u, updates: { messagingToken: ['mock-fcm-token', 'fresh-token'] } },
      },
    ]);
  });

  it('ignores a refreshed token when no user is loaded', async () => {
    let refresh: ((token: string) => Promise<void>) | undefined;
    messaging.instance.onTokenRefresh = (cb: (token: string) => Promise<void>) => {
      refresh = cb;
      return () => {};
    };
    renderSplash();
    await waitFor(() => expect(refresh).toBeDefined());

    await refresh!('fresh-token');

    expect(dispatchedOf('updateUser')).toEqual([]);
  });

  it('displays a foreground message that carries a notifee payload', async () => {
    let onMessage: ((m: unknown) => Promise<void>) | undefined;
    messaging.instance.onMessage = (cb: (m: unknown) => Promise<void>) => {
      onMessage = cb;
      return () => {};
    };
    renderSplash();

    await onMessage!({ data: { notifee: JSON.stringify({ title: 'Chore due' }) } });
    await onMessage!({ data: {} });

    // Task 11: displayed through displayRemoteMessage, which adds the iOS
    // foreground presentation the AppDelegate used to supply.
    expect(mockDisplayed).toEqual([
      {
        title: 'Chore due',
        ios: { foregroundPresentationOptions: { banner: true, sound: true, badge: true, list: true } },
      },
    ]);
  });

  it('registers a background message handler', async () => {
    let handler: unknown;
    messaging.instance.setBackgroundMessageHandler = (cb: unknown) => {
      handler = cb;
    };
    renderSplash();

    await waitFor(() => expect(typeof handler).toBe('function'));
  });
});
