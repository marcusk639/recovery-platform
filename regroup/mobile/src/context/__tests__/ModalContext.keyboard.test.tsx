/**
 * The app-wide form modal after plan Task 15. The forms it hosts as plain
 * views (MedicationForm, the supporter step form, AddJobForm, the reject
 * reason form and others; keyboard audit §5 note 6) had only
 * IQKeyboardManager on iOS and adjustResize on Android. Their fields now sit
 * in RatsModal's keyboard-controller avoiding view on both platforms.
 */
import React from 'react';
import { Pressable, Text, TextInput } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { ModalProvider, useModal } from '../ModalContext';
import { keyboardAncestor } from '../../components/rats-keyboard/__tests__/keyboardAncestor';

let mockIOS = true;
jest.mock('../../util/platform', () => ({
  ...jest.requireActual('../../util/platform'),
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

jest.mock('../../components/screen-header', () => () => null);
jest.mock('../../components/ios-status-bar', () => () => null);

jest.mock('../index', () => ({
  useTheme: () => ({ theme: { primaryColor: '#000', textColor: '#000' } }),
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

const PlainViewForm = () => <TextInput testID="form-field" />;

const Opener = ({ fullScreen }: { fullScreen: boolean }) => {
  const { showFormModal } = useModal();
  return (
    <Pressable onPress={() => showFormModal(<PlainViewForm />, 'Form', fullScreen)}>
      <Text>open</Text>
    </Pressable>
  );
};

function openForm(fullScreen: boolean) {
  const view = render(
    <ModalProvider>
      <Opener fullScreen={fullScreen} />
    </ModalProvider>,
  );
  fireEvent.press(view.getByText('open'));
  return view;
}

describe('form modal keyboard', () => {
  afterEach(() => {
    mockIOS = true;
  });

  it('keeps a full-screen plain-view form in the avoiding view on iOS', () => {
    expect(keyboardAncestor(openForm(true).getByTestId('form-field'))).toBe(
      'RatsKeyboardAvoidingView',
    );
  });

  it('keeps a full-screen plain-view form in the avoiding view on Android', () => {
    mockIOS = false;
    expect(keyboardAncestor(openForm(true).getByTestId('form-field'))).toBe(
      'RatsKeyboardAvoidingView',
    );
  });

  it('keeps a bottom-sheet form in the avoiding view', () => {
    expect(keyboardAncestor(openForm(false).getByTestId('form-field'))).toBe(
      'RatsKeyboardAvoidingView',
    );
  });
});
