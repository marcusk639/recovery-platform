/**
 * An invitation that arrived signed out survives sign-in (launch spec §4.2,
 * owner decision 2026-11-06; P5 Task 3; device rows DEVS-018 / DEVP-007):
 * after a login, LoginForm opens the invitation screen (SignUp, which shows a
 * signed-in user "Accept as this account" / "Continue to the app") instead of
 * the account's start route. Runs the real navigation decision.
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
    selector({ user: { user: null, loggedIn: false, invitation: mockHeldInvitation } }),
}));
jest.mock('../../../state/queries/houseQueries', () => ({ houseKeys: { list: () => ['h'] } }));
jest.mock('../../../state/queries/adminQueries', () => ({ adminKeys: { detail: () => ['a'] } }));
jest.mock('../../../navigation/service', () => ({
  navigationRef: { current: { dispatch: (action: unknown) => mockNavDispatch(action) } },
}));
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
import LoginFormWrapper from '../LoginForm';
import { Routes } from '../../../navigation/types';

const mockLogin = jest.fn();
const mockNavDispatch = jest.fn();
let mockHeldInvitation: Record<string, unknown> | null = null;

const completeGuest = { uid: 'u1', isGuest: true, infoEntered: true, isAnonymous: false };

/** The route the post-login reset lands on: [root, nested]. */
const resetTarget = () => {
  const action = mockNavDispatch.mock.calls.at(-1)?.[0] as {
    payload: { routes: { name: string; state?: { routes: { name: string }[] } }[] };
  };
  const [root] = action.payload.routes;
  return [root.name, root.state?.routes[0].name];
};

async function logIn() {
  mockLogin.mockResolvedValue({ user: completeGuest });
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  const screen = render(
    <QueryClientProvider client={client}>
      <LoginFormWrapper email="g@rats-e2e.com" setEmail={() => {}} navigation={{}} />
    </QueryClientProvider>,
  );
  fireEvent.changeText(screen.getByTestId('password-input'), 'password1');
  fireEvent.press(screen.getByTestId('login-button'));
  await waitFor(() => expect(mockLogin).toHaveBeenCalled());
  await act(async () => {
    await Promise.resolve();
    jest.runOnlyPendingTimers();
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  mockNavDispatch.mockClear();
  mockHeldInvitation = null;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('LoginForm with an invitation held from before sign-in', () => {
  it('opens the invitation screen after login', async () => {
    mockHeldInvitation = { id: '', token: 'tok-1', type: 'admin', houseId: 'h1', email: '' };
    await logIn();
    expect(resetTarget()).toEqual([Routes.PriorAuth, Routes.Signup]);
  });

  it('opens the start route when no invitation is held', async () => {
    await logIn();
    expect(resetTarget()).toEqual([Routes.Main, Routes.Guest]);
  });
});
