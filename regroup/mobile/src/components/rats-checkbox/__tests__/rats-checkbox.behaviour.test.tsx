/**
 * RatsCheckBox behaviour through a real Formik form.
 *
 * Written on RN 0.72 against @react-native-community/checkbox (plan Task 2) and kept, case for
 * case, against the JS checkbox that replaces it (Task 8). Two cases changed deliberately and are
 * recorded in docs/build/react-native-0.88-upgrade.md:
 * - a tap inside a Formik Field threw and never changed the value; the owner chose to fix it in
 *   Task 8, so the case now pins the round-trip;
 * - `disabled` was ignored; it is honoured now (the only screens that pass it are not reachable).
 */
import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Field, Formik } from 'formik';
import RatsCheckBox from '../rats-checkbox';

jest.mock('../../../context', () => ({
  useTheme: () => ({ theme: { primaryColor: '#000', textColor: '#000', primaryFontFamily: 'System' } }),
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
            <Text testID="value">{String(values.termsOfService)}</Text>
          </>
        );
      }}
    </Formik>
  );
}

const checkedOf = (el: any) => el.props.accessibilityState?.checked;

describe('RatsCheckBox in a Formik Field', () => {
  it('shows the field value and round-trips a tap into the form value (fixed in Task 8)', async () => {
    let values: any;
    const screen = render(<Form initial={false} onValues={(v) => (values = v)} />);
    const control = () => screen.getByTestId('terms-of-service-checkbox');

    expect(checkedOf(control())).toBe(false);

    fireEvent.press(control());
    await waitFor(() => expect(values.termsOfService).toBe(true));
    expect(checkedOf(control())).toBe(true);

    fireEvent.press(control());
    await waitFor(() => expect(values.termsOfService).toBe(false));
    expect(checkedOf(control())).toBe(false);
  });

  it('forwards testID to the control and renders the label', () => {
    const screen = render(<Form initial onValues={() => {}} />);

    expect(screen.getByTestId('terms-of-service-checkbox')).toBeTruthy();
    expect(screen.getByText('I agree')).toBeTruthy();
    expect(checkedOf(screen.getByTestId('terms-of-service-checkbox'))).toBe(true);
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
      <RatsCheckBox {...({ testID: 'cb', label: 'x', onValueChange } as any)} field={{ name: 'x', value: false } as any} />,
    );

    fireEvent.press(screen.getByTestId('cb'));

    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it('honours disabled: no toggle, and the control reports it (ignored before Task 8)', () => {
    const onValueChange = jest.fn();
    const screen = render(
      <RatsCheckBox
        {...({ testID: 'cb', label: 'x', disabled: true, onValueChange } as any)}
        field={{ name: 'x', value: false } as any}
      />,
    );

    expect(screen.getByTestId('cb').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    fireEvent.press(screen.getByTestId('cb'));
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
