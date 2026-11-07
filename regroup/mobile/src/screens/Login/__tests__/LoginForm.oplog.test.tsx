/**
 * LoginForm's sign-in analytics event against the firebase-modular analytics
 * mock.
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 10 Step 1).
 * This file stays byte-identical through the Task 10 migration (group 10e): a
 * mapping mistake in the rewrite fails here instead of being copied into an
 * edited expectation. Assertions are on outcomes and log entries only, never
 * on mock call chains. LoginForm's only direct Firebase call is the 'signin'
 * analytics event; sign-in itself goes through the user slice's login thunk
 * (stubbed here) and the users service (users-auth.oplog.test.ts). Analytics
 * is not part of the log: events are captured by replacing logEvent on the
 * shared analytics instance, which both API shapes delegate to. Each case pins
 * the event and its non-PII role parameter (never the email), and that the
 * form makes no Firestore or callable op.
 */
jest.mock('../../../../firebase-setup', () =>
  require('../../../../__mocks__/firebase-modular/setup'),
);
jest.mock('@react-native-firebase/analytics', () =>
  require('../../../../__mocks__/firebase-modular/analytics'),
);
jest.mock('../../../state/slices/userSlice', () => ({
  login: (credentials: unknown) => ({ unwrap: () => mockLogin(credentials) }),
}));
jest.mock('../../../state/store', () => ({
  useAppDispatch: () => (action: unknown) => action,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ user: { user: null, loggedIn: false } }),
}));
jest.mock('../../../state/queries/houseQueries', () => ({ houseKeys: { list: () => ['h'] } }));
jest.mock('../../../state/queries/adminQueries', () => ({ adminKeys: { detail: () => ['a'] } }));
jest.mock('../../../navigation/improved-navigation-service', () => ({
  __esModule: true,
  default: { getInitialNavigation: () => ({ initialRoute: 'main' }) },
}));
jest.mock('../../../navigation/service', () => ({ navigationRef: { current: null } }));
jest.mock('../../../util/logging', () => ({ logException: jest.fn() }));
jest.mock('../../../components/rats-text', () => ({ RatsText: () => null }));
jest.mock('../../../components/rats-button/rats-button', () => {
  const { TouchableOpacity } = require('react-native');
  return ({ testID, onPress }: { testID: string; onPress: () => void }) => (
    <TouchableOpacity testID={testID} onPress={onPress} />
  );
});
jest.mock('../../../components/rats-text-input/rats-text-input', () => {
  const { TextInput } = require('react-native');
  return ({ testID, field, form }: any) => (
    <TextInput
      testID={testID}
      value={field.value}
      onChangeText={(text: string) => form.setFieldValue(field.name, text)}
    />
  );
});

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { getOpLog, resetOpLog } from '../../../../__mocks__/firebase-modular/log';
import LoginFormWrapper from '../LoginForm';

const mockLogin = jest.fn();

const analytics = jest.requireMock<{ instance: Record<string, unknown> }>(
  '@react-native-firebase/analytics',
);
const originalAnalytics = { ...analytics.instance };
let events: Array<{ name: string; params: unknown }> = [];

function submit() {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  const screen = render(
    <QueryClientProvider client={client}>
      <LoginFormWrapper email="L1@Example.com" setEmail={() => {}} navigation={{}} />
    </QueryClientProvider>,
  );
  fireEvent.changeText(screen.getByTestId('password-input'), 'password1');
  fireEvent.press(screen.getByTestId('login-button'));
  return screen;
}

beforeEach(() => {
  jest.useFakeTimers();
  resetOpLog();
  events = [];
  analytics.instance.logEvent = async (name: string, params: unknown) => {
    events.push({ name, params });
  };
});

afterEach(() => {
  act(() => {
    jest.runOnlyPendingTimers();
  });
  jest.useRealTimers();
  Object.assign(analytics.instance, originalAnalytics);
  expect(getOpLog()).toEqual([]);
});

describe('signin analytics event', () => {
  it('logs the admin role for an admin', async () => {
    mockLogin.mockResolvedValue({ user: { id: 'u1', isAdmin: true } });

    submit();

    await waitFor(() => expect(events).toEqual([{ name: 'signin', params: { role: 'admin' } }]));
  });

  it('logs the guest role for a guest', async () => {
    mockLogin.mockResolvedValue({ user: { id: 'u1', isGuest: true } });

    submit();

    await waitFor(() => expect(events).toEqual([{ name: 'signin', params: { role: 'guest' } }]));
  });

  it('logs an unknown role for a user that is neither', async () => {
    mockLogin.mockResolvedValue({ user: { id: 'u1' } });

    submit();

    await waitFor(() => expect(events).toEqual([{ name: 'signin', params: { role: 'unknown' } }]));
  });

  it('logs nothing when the login is rejected', async () => {
    mockLogin.mockRejectedValue(Object.assign(new Error('bad'), { code: 'auth/wrong-password' }));

    submit();

    await waitFor(() => expect(mockLogin).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    expect(events).toEqual([]);
  });
});
