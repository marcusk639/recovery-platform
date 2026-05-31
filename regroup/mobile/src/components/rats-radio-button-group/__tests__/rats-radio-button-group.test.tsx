/**
 * Tests for RatsRadioButtonGroup component
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';

// ── mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../../styles/theme', () => ({
  normalize: (n: number) => n,
  color: { light_grey: '#eee', baby_blue: '#89cff0', black: '#000', white: '#fff', grey: '#aaa', dark_grey: '#555', red: '#f00', green: '#0f0', medium_grey: '#999' },
  fontSize: { regular: 14, regular_medium: 16, medium: 15, large: 18, small: 12, larger: 22, extraLarge: 24 },
  fontFamily: { roboto: 'Roboto', bold: 'Roboto-Bold', timesNewRoman: 'TimesNewRoman' },
  ROW: { flexDirection: 'row' as const },
  CARD_STYLE: {},
  tabBarStyle: {},
  elevateStyle: {},
  themes: { default: { primaryColor: '#000' } },
  windowHeight: 800,
}));

jest.mock('../../../context', () => ({
  useTheme: () => ({ theme: { primaryColor: '#000' } }),
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
}));

jest.mock('../../rats-label/rats-label', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return ({ label }: any) => <Text testID={`label-${label}`}>{label}</Text>;
});

// withRats HOC — pass through injecting t and theme
jest.mock('../../rats-hoc', () => ({
  withRats: (C: any) => {
    const Wrapped = (props: any) => {
      const t = (k: string) => k;
      const theme = { primaryColor: '#000' };
      return C({ ...props, t, theme });
    };
    return Wrapped;
  },
}));

jest.mock('react-native-simple-radio-button', () => {
  const React = require('react');
  const { View, TouchableOpacity, Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: any) => <View testID="radio-form">{children}</View>,
    RadioButton: ({ children }: any) => <View testID="radio-button">{children}</View>,
    RadioButtonInput: ({ onPress, obj, isSelected }: any) => (
      <TouchableOpacity
        testID={`radio-input-${obj.value}`}
        onPress={() => onPress(obj.value)}
        accessibilityState={{ selected: isSelected }}>
        <Text>{isSelected ? 'selected' : 'unselected'}</Text>
      </TouchableOpacity>
    ),
    RadioButtonLabel: ({ onPress, obj }: any) => (
      <TouchableOpacity testID={`radio-label-${obj.value}`} onPress={() => onPress(obj.value)}>
        <Text>{obj.label}</Text>
      </TouchableOpacity>
    ),
  };
});

import RatsRadioButtonGroup from '../index';

const radioButtons = [
  { label: 'Option A', value: 'a', disabled: false },
  { label: 'Option B', value: 'b', disabled: false },
  { label: 'Option C', value: 'c', disabled: true },
];

const buildProps = (overrides: any = {}) => ({
  field: { name: 'choice', value: 'a' },
  form: { setFieldValue: jest.fn(), errors: {}, touched: {} },
  radioButtons,
  labelHorizontal: true,
  formHorizontal: true,
  buttonColor: '#000',
  selectedButtonColor: '#000',
  initial: 0,
  wrapStyle: {},
  ...overrides,
});

describe('RatsRadioButtonGroup', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<RatsRadioButtonGroup {...buildProps()} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders the RadioForm', () => {
    const { getByTestId } = render(<RatsRadioButtonGroup {...buildProps()} />);
    expect(getByTestId('radio-form')).toBeTruthy();
  });

  it('renders a radio input for each option', () => {
    const { getAllByTestId } = render(<RatsRadioButtonGroup {...buildProps()} />);
    expect(getAllByTestId('radio-button').length).toBe(3);
  });

  it('renders the label when labelDisabled is false', () => {
    const { getByTestId } = render(
      <RatsRadioButtonGroup {...buildProps({ label: 'My Group', labelDisabled: false })} />,
    );
    expect(getByTestId('label-My Group')).toBeTruthy();
  });

  it('does NOT render the label when labelDisabled is true', () => {
    const { queryByTestId } = render(
      <RatsRadioButtonGroup {...buildProps({ label: 'Hidden Label', labelDisabled: true })} />,
    );
    expect(queryByTestId('label-Hidden Label')).toBeNull();
  });

  it('calls setFieldValue when a radio input is pressed', () => {
    const setFieldValue = jest.fn();
    const { getByTestId } = render(
      <RatsRadioButtonGroup
        {...buildProps({ form: { setFieldValue, errors: {}, touched: {} } })}
      />,
    );
    fireEvent.press(getByTestId('radio-input-b'));
    expect(setFieldValue).toHaveBeenCalledWith('choice', 'b');
  });

  it('calls setFieldValue when a radio label is pressed', () => {
    const setFieldValue = jest.fn();
    const { getByTestId } = render(
      <RatsRadioButtonGroup
        {...buildProps({ form: { setFieldValue, errors: {}, touched: {} } })}
      />,
    );
    fireEvent.press(getByTestId('radio-label-b'));
    expect(setFieldValue).toHaveBeenCalledWith('choice', 'b');
  });

  it('does NOT call setFieldValue for a disabled option', () => {
    const setFieldValue = jest.fn();
    const { getByTestId } = render(
      <RatsRadioButtonGroup
        {...buildProps({ form: { setFieldValue, errors: {}, touched: {} } })}
      />,
    );
    fireEvent.press(getByTestId('radio-input-c'));
    expect(setFieldValue).not.toHaveBeenCalled();
  });

  it('shows validation error when errors[name] and touched[name] are set', () => {
    const props = buildProps({
      label: 'Choice',
      labelDisabled: false,
      form: {
        setFieldValue: jest.fn(),
        errors: { choice: 'Please select one' },
        touched: { choice: true },
      },
    });
    const { getByTestId } = render(<RatsRadioButtonGroup {...props} />);
    expect(getByTestId('label-Please select one')).toBeTruthy();
  });

  it('does NOT show error when field is not touched', () => {
    const props = buildProps({
      label: 'Choice',
      labelDisabled: false,
      form: {
        setFieldValue: jest.fn(),
        errors: { choice: 'Please select one' },
        touched: { choice: false },
      },
    });
    const { queryByTestId } = render(<RatsRadioButtonGroup {...props} />);
    expect(queryByTestId('label-Please select one')).toBeNull();
  });

  it('renders option labels as text', () => {
    const { getByText } = render(<RatsRadioButtonGroup {...buildProps()} />);
    expect(getByText('Option A')).toBeTruthy();
    expect(getByText('Option B')).toBeTruthy();
    expect(getByText('Option C')).toBeTruthy();
  });

  it('accepts custom containerStyle without crashing', () => {
    const { toJSON } = render(
      <RatsRadioButtonGroup {...buildProps({ containerStyle: { margin: 10 } })} />,
    );
    expect(toJSON()).toBeTruthy();
  });
});
