/**
 * The password field's e2e-only relaxation.
 *
 * Maestro cannot type into a secure field, so e2e builds turn secureTextEntry
 * off. The gate is the bundled build variant, not __DEV__: a store build must
 * never be able to relax it, whatever it is launched with. Debug builds keep
 * honouring the IS_E2E_TEST launch flag the existing Maestro flows pass.
 */
import React from 'react';
import { Settings } from 'react-native';
import { render } from '@testing-library/react-native';
import { Formik } from 'formik';
import LoginFormView from '../LoginFormView';

jest.mock('../../../components/rats-text-input/rats-text-input', () => {
  const { TextInput } = require('react-native');
  return ({ testID, secureTextEntry }: any) => (
    <TextInput testID={testID} secureTextEntry={secureTextEntry} />
  );
});
jest.mock('../../../components/rats-button/rats-button', () => () => null);
jest.mock('../../../components/rats-text', () => ({ RatsText: () => null }));

const mockSettingsGet = Settings.get as jest.Mock;
const originalVariant = process.env.E2E_VARIANT;
const originalDev = (global as any).__DEV__;

const setVariant = (variant?: string) => {
  if (variant === undefined) {
    delete process.env.E2E_VARIANT;
  } else {
    process.env.E2E_VARIANT = variant;
  }
};

const launchedWithE2EFlag = () =>
  mockSettingsGet.mockImplementation((key: string) => (key === 'IS_E2E_TEST' ? 1 : undefined));

const passwordIsSecure = (): boolean => {
  const { getByTestId } = render(
    <Formik initialValues={{ email: '', password: '' }} onSubmit={jest.fn()}>
      {(formik) => (
        <LoginFormView
          {...(formik as any)}
          navigation={{ navigate: jest.fn() }}
          setModalVisible={jest.fn()}
        />
      )}
    </Formik>,
  );
  return getByTestId('password-input').props.secureTextEntry;
};

afterEach(() => {
  (global as any).__DEV__ = originalDev;
  mockSettingsGet.mockReset();
  setVariant(originalVariant);
});

describe('LoginFormView password secureTextEntry', () => {
  it('is secure in a debug build that is not an e2e build', () => {
    setVariant(undefined);
    expect(__DEV__).toBe(true);
    expect(passwordIsSecure()).toBe(true);
  });

  it.each(['emulator', 'staging'])('is relaxed in the %s e2e build', (variant) => {
    setVariant(variant);
    expect(passwordIsSecure()).toBe(false);
  });

  it('is relaxed in an e2e build even when it is not a debug build', () => {
    setVariant('emulator');
    (global as any).__DEV__ = false;
    expect(passwordIsSecure()).toBe(false);
  });

  it('stays secure in a release build launched with the IS_E2E_TEST flag', () => {
    setVariant(undefined);
    (global as any).__DEV__ = false;
    launchedWithE2EFlag();
    expect(passwordIsSecure()).toBe(true);
  });

  it('is relaxed in a debug build launched with the IS_E2E_TEST flag', () => {
    setVariant(undefined);
    launchedWithE2EFlag();
    expect(passwordIsSecure()).toBe(false);
  });
});
