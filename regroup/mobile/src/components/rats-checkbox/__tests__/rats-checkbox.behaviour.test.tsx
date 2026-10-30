/**
 * RatsCheckBox behaviour through a real Formik form.
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 2): written on
 * RN 0.72 with @react-native-community/checkbox (mocked here, as a native
 * component). Task 8 replaces that package with a JS checkbox; these cases must
 * keep passing against it. The native mock below stands in for the control a
 * user taps: it renders `value` and calls `onValueChange` on press.
 */
import React from 'react';
import { Pressable, Text } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Field, Formik } from 'formik';
import RatsCheckBox from '../rats-checkbox';

jest.mock(
  '@react-native-community/checkbox',
  () => {
    const { Pressable: MockPressable, Text: MockText } = require('react-native');
    return (props: any) => (
      <MockPressable
        testID={props.testID || 'checkbox-control'}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: !!props.value, disabled: !!props.disabled }}
        onPress={() => !props.disabled && props.onValueChange && props.onValueChange(!props.value)}
      >
        <MockText>{props.value ? 'checked' : 'unchecked'}</MockText>
      </MockPressable>
    );
  },
  { virtual: true },
);

jest.mock('../../../context', () => ({
  useTheme: () => ({
    theme: { primaryColor: '#000', textColor: '#000', primaryFontFamily: 'System' },
  }),
  useTranslation: () => ({ t: (k: string) => k ?? '', i18n: { language: 'en' } }),
}));

jest.mock('../../rats-label/rats-label', () => {
  const { Text: MockText } = require('react-native');
  return ({ label }: any) => <MockText>{label}</MockText>;
});

function Form({ initial, onValues }: { initial: boolean; onValues: (v: any) => void }) {
  return (
    <Formik initialValues={{ termsOfService: initial }} onSubmit={() => {}}>
      {({ values }) => {
        onValues(values);
        return (
          <>
            <Field
              component={RatsCheckBox}
              name="termsOfService"
              testID="terms-of-service-checkbox"
              label="I agree"
            />
            <Pressable testID="noop">
              <Text>{String(values.termsOfService)}</Text>
            </Pressable>
          </>
        );
      }}
    </Formik>
  );
}

describe('RatsCheckBox in a Formik Field', () => {
  // PRE-EXISTING DEFECT, pinned as found on RN 0.72 (2026-10-30): the native
  // checkbox calls onValueChange(boolean), and RatsCheckBox hands that to
  // Formik's field.onChange(name), which expects a string or an event, so a
  // tap throws inside Formik and the form value never changes. Every app use
  // (SignUp terms, HouseConfig phase rules, GuestUpdate booleans) goes through
  // a Field. Recorded in docs/build/react-native-0.88-upgrade.md; whether Task 8
  // fixes it is the owner's call, and this case changes only with that call.
  it('shows the field value, and a tap throws inside Formik without changing it (pre-existing)', async () => {
    let values: any;
    const screen = render(<Form initial={false} onValues={(v) => (values = v)} />);

    expect(screen.getByText('unchecked')).toBeTruthy();

    expect(() => fireEvent.press(screen.getByTestId('terms-of-service-checkbox'))).toThrow(
      TypeError,
    );
    await waitFor(() => expect(values.termsOfService).toBe(false));
    expect(screen.getByText('unchecked')).toBeTruthy();
  });

  it('forwards testID to the control and renders the label', () => {
    const screen = render(<Form initial onValues={() => {}} />);

    expect(screen.getByTestId('terms-of-service-checkbox')).toBeTruthy();
    expect(screen.getByText('I agree')).toBeTruthy();
    expect(screen.getByText('checked')).toBeTruthy();
  });

  it('exposes checkbox role and checked state on the control', () => {
    const screen = render(<Form initial onValues={() => {}} />);

    const control = screen.getByTestId('terms-of-service-checkbox');
    expect(control.props.accessibilityRole).toBe('checkbox');
    expect(control.props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
  });
});

describe('RatsCheckBox without Formik', () => {
  it('calls onValueChange with the toggled value', () => {
    const onValueChange = jest.fn();
    const screen = render(
      <RatsCheckBox
        {...({ testID: 'cb', label: 'x', onValueChange } as any)}
        field={{ name: 'x', value: false } as any}
      />,
    );

    fireEvent.press(screen.getByTestId('cb'));

    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it('does not forward disabled to the control today (pre-existing)', () => {
    const onValueChange = jest.fn();
    const screen = render(
      <RatsCheckBox
        {...({ testID: 'cb', label: 'x', disabled: true, onValueChange } as any)}
        field={{ name: 'x', value: false } as any}
      />,
    );

    expect(screen.getByTestId('cb').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: false }),
    );
    fireEvent.press(screen.getByTestId('cb'));
    expect(onValueChange).toHaveBeenCalledWith(true);
  });
});
