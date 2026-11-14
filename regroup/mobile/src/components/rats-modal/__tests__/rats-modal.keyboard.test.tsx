/**
 * RatsModal's keyboard handling (plan Task 15): keyboard-controller's
 * avoiding view on both platforms, and its own iOS toolbar, since a native
 * Modal covers the app-root one.
 */
import React from 'react';
import { Text, TextInput } from 'react-native';
import { render } from '@testing-library/react-native';
import { KeyboardToolbar } from 'react-native-keyboard-controller';
import RatsModal from '../index';
import { RatsKeyboardAvoidingView } from '../../rats-keyboard';

let mockIOS = true;
jest.mock('../../../util/platform', () => ({
  get IOS() {
    return mockIOS;
  },
  get ANDROID() {
    return !mockIOS;
  },
}));

jest.mock('react-native-modal', () => {
  const { View } = require('react-native');
  return ({ children, isVisible }: any) => (isVisible ? <View>{children}</View> : null);
});

jest.mock('../../../context', () => ({
  useTheme: () => ({ theme: { primaryColor: '#000', textColor: '#000' } }),
  useTranslation: () => ({ t: (k: string) => k ?? '', i18n: { language: 'en' } }),
}));

jest.mock('../../ios-status-bar', () => {
  const { View } = require('react-native');
  return () => <View testID="ios-status-bar" />;
});

const noop = () => {};

function renderModal(props: { behavior?: 'height' | 'padding'; useKeyboardView?: boolean } = {}) {
  return render(
    <RatsModal isVisible onBackdropPress={noop} {...(props as any)}>
      <TextInput testID="field" />
      <Text>body</Text>
    </RatsModal>,
  );
}

describe('RatsModal keyboard handling', () => {
  afterEach(() => {
    mockIOS = true;
  });

  it('renders the keyboard toolbar inside the modal on iOS', () => {
    expect(renderModal().UNSAFE_queryAllByType(KeyboardToolbar)).toHaveLength(1);
  });

  it('renders no keyboard toolbar on Android', () => {
    mockIOS = false;
    expect(renderModal().UNSAFE_queryAllByType(KeyboardToolbar)).toHaveLength(0);
  });

  it('wraps its fields in the keyboard-controller avoiding view on iOS, with padding by default', () => {
    const view = renderModal();
    const kav = view.UNSAFE_getByType(RatsKeyboardAvoidingView);
    expect(kav.props.behavior).toBe('padding');
    expect(kav.findByProps({ testID: 'field' })).toBeTruthy();
  });

  it('wraps its fields in the avoiding view on Android too (Modal windows no longer resize)', () => {
    mockIOS = false;
    const kav = renderModal().UNSAFE_getByType(RatsKeyboardAvoidingView);
    expect(kav.findByProps({ testID: 'field' })).toBeTruthy();
  });

  it('passes a caller behavior through', () => {
    expect(
      renderModal({ behavior: 'height' }).UNSAFE_getByType(RatsKeyboardAvoidingView).props.behavior,
    ).toBe('height');
  });

  it('uses no avoiding view with useKeyboardView={false}', () => {
    expect(
      renderModal({ useKeyboardView: false }).UNSAFE_queryAllByType(RatsKeyboardAvoidingView),
    ).toHaveLength(0);
  });
});
