/**
 * TwoFactorSetup's phone sign-in and credential linking against the
 * firebase-modular auth mock.
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 10 Step 1).
 * This file stays byte-identical through the Task 10 migration (group 10e): a
 * mapping mistake in the rewrite fails here instead of being copied into an
 * edited expectation. Assertions are on outcomes and log entries only, never
 * on mock call chains. Auth is not part of the log: each case pins the
 * credential linked to the signed-in fake user, the step the screen ends on,
 * the alert shown, and that no Firestore or callable op was made.
 *
 * The shared auth mock has no signInWithPhoneNumber or PhoneAuthProvider.
 * They are added here on both API shapes; signInWithPhoneNumber delegates to
 * the shared auth instance, where each case sets the confirmation it returns.
 */
jest.mock('../../../../firebase-setup', () =>
  require('../../../../__mocks__/firebase-modular/setup'),
);
jest.mock('@react-native-firebase/auth', () => {
  const base = require('../../../../__mocks__/firebase-modular/auth');
  const PhoneAuthProvider = {
    credential: (verificationId: string, code: string) => ({
      providerId: 'phone',
      verificationId,
      code,
    }),
  };
  const auth = Object.assign(() => base.default(), { PhoneAuthProvider });
  base.instance.signInWithPhoneNumber = async (phone: string) => ({
    verificationId: `vid:${phone}`,
  });
  return {
    ...base,
    default: auth,
    PhoneAuthProvider,
    signInWithPhoneNumber: (_auth: unknown, phone: string) =>
      base.instance.signInWithPhoneNumber(phone),
  };
});
jest.mock('../../../components/screen-header', () => () => null);
jest.mock('../../../components/rats-scroll-view', () => {
  const { View } = require('react-native');
  return ({ children }: { children: React.ReactNode }) => <View>{children}</View>;
});
jest.mock('../../../components/rats-button/rats-button', () => {
  const { TouchableOpacity } = require('react-native');
  return ({ testID, onPress }: { testID: string; onPress: () => void }) => (
    <TouchableOpacity testID={testID} onPress={onPress} />
  );
});

import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { getOpLog, resetOpLog } from '../../../../__mocks__/firebase-modular/log';
import TwoFactorSetup from '../TwoFactorSetup';

const { instance, setCurrentUser } = jest.requireMock<{
  instance: Record<string, unknown>;
  setCurrentUser: (user: unknown) => void;
}>('@react-native-firebase/auth');
const original = { ...instance };

let alerts: Array<[string | null | undefined, string | null | undefined]> = [];

/** Signs in a fake user that keeps the credential linked to it. */
function signIn(linkError?: Error) {
  const user = {
    uid: 'u1',
    linked: undefined as unknown,
    linkWithCredential: async (credential: unknown) => {
      if (linkError) throw linkError;
      user.linked = credential;
      return { user };
    },
  };
  setCurrentUser(user);
  return user;
}

async function sendCode(phone = '+15550000000') {
  render(<TwoFactorSetup />);
  fireEvent.changeText(screen.getByTestId('phone-input'), phone);
  await act(async () => {
    fireEvent.press(screen.getByTestId('send-code-button'));
  });
}

async function verify(code = '123456') {
  await waitFor(() => screen.getByTestId('verification-code-input'));
  fireEvent.changeText(screen.getByTestId('verification-code-input'), code);
  await act(async () => {
    fireEvent.press(screen.getByTestId('verify-code-button'));
  });
}

beforeEach(() => {
  resetOpLog();
  setCurrentUser(null);
  alerts = [];
  jest.spyOn(Alert, 'alert').mockImplementation((title, message) => {
    alerts.push([title, message]);
  });
});

afterEach(() => {
  Object.assign(instance, original);
  jest.restoreAllMocks();
  expect(getOpLog()).toEqual([]);
});

describe('sendCode', () => {
  it('sends a code to the entered number and moves to the code step', async () => {
    signIn();

    await sendCode('+15550000001');

    expect(await screen.findByText('Enter the 6-digit code sent to +15550000001.')).toBeTruthy();
    expect(alerts).toEqual([]);
  });

  it('alerts the error and stays on the phone step when sending fails', async () => {
    signIn();
    instance.signInWithPhoneNumber = async () => {
      throw Object.assign(new Error('Invalid phone number.'), {
        code: 'auth/invalid-phone-number',
      });
    };

    await sendCode('123');

    await waitFor(() => expect(alerts).toEqual([['Error', 'Invalid phone number.']]));
    expect(screen.getByTestId('phone-input')).toBeTruthy();
  });
});

describe('verifyCode', () => {
  it('links the phone credential to the signed-in user and finishes', async () => {
    const user = signIn();

    await sendCode('+15550000002');
    await verify('123456');

    expect(await screen.findByText('2FA is enabled on your account.')).toBeTruthy();
    expect(user.linked).toEqual({
      providerId: 'phone',
      verificationId: 'vid:+15550000002',
      code: '123456',
    });
    expect(alerts).toEqual([
      ['2FA Enabled', 'Your account is now protected with two-factor authentication.'],
    ]);
  });

  it('alerts the error and stays on the code step when linking fails', async () => {
    signIn(
      Object.assign(new Error('The code is invalid.'), { code: 'auth/invalid-verification-code' }),
    );

    await sendCode();
    await verify('000000');

    await waitFor(() => expect(alerts).toEqual([['Error', 'The code is invalid.']]));
    expect(screen.getByTestId('verification-code-input')).toBeTruthy();
  });

  it('reports success without linking anything when nobody is signed in', async () => {
    await sendCode();
    await verify();

    expect(await screen.findByText('2FA is enabled on your account.')).toBeTruthy();
    expect(instance.currentUser).toBeNull();
    expect(alerts).toEqual([
      ['2FA Enabled', 'Your account is now protected with two-factor authentication.'],
    ]);
  });
});
