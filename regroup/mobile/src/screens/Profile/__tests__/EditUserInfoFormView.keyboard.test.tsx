/**
 * EditUserInfoFormView after plan Task 15: its APPLY/Cancel row is pinned
 * below the scroll view. Android's adjustResize used to keep that row above
 * the keyboard; edge-to-edge drops it, so the scroll view and the row sit in
 * the Android resize view.
 */
import React from 'react';
import { Formik } from 'formik';
import { render } from '@testing-library/react-native';
import EditUserInfoFormView from '../EditUserInfoFormView';
import { keyboardAncestor } from '../../../components/rats-keyboard/__tests__/keyboardAncestor';

jest.mock('../../../components/rats-image-picker', () => () => null);
jest.mock('../../../components/screen-header', () => () => null);
jest.mock('../../../components/rats-datepicker/rats-datepicker', () => () => null);
jest.mock('../../../util/form', () => ({ renderPicker: () => null }));
jest.mock('../../../components/rats-text-input/rats-text-input', () => {
  const { TextInput } = require('react-native');
  return (props: any) => <TextInput testID={props.testID} />;
});
jest.mock('../../../context', () => ({
  useTheme: () => ({ theme: { primaryColor: '#000', textColor: '#000' } }),
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

function renderForm() {
  return render(
    <Formik initialValues={{}} onSubmit={jest.fn()}>
      {(formik) => (
        <EditUserInfoFormView {...(formik as any)} navigation={{ goBack: jest.fn() } as any} />
      )}
    </Formik>,
  );
}

describe('EditUserInfoFormView keyboard', () => {
  it('keeps the phone field in the RatsScrollView', () => {
    expect(keyboardAncestor(renderForm().getByTestId('phone-input'))).toBe('RatsScrollView');
  });

  it('puts the scroll view and the pinned APPLY row in the Android resize view', () => {
    const view = renderForm();
    expect(keyboardAncestor(view.getByTestId('save-profile-button'))).toBe(
      'RatsKeyboardAvoidingView',
    );
  });
});
