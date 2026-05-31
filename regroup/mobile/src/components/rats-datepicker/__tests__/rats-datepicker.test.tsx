/**
 * Tests for RatsDatePicker and RatsTimePicker components
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';

// Mock native modules before imports
jest.mock('react-native-date-picker', () => 'RNDatePicker');
jest.mock('react-native-vector-icons/Ionicons', () => 'IonIcon');
jest.mock('react-native-vector-icons/FontAwesome5', () => 'FontAwesome5Icon');
jest.mock('react-native-vector-icons/MaterialIcons', () => 'MaterialIcon');

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }),
  useRoute: () => ({}),
}));

jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

jest.mock('react-native-iphone-x-helper', () => ({
  isIphoneX: () => false,
  getBottomSpace: () => 0,
}));

// Mock google-places-autocomplete used transitively by rats-text-input
jest.mock('react-native-google-places-autocomplete', () => ({
  GooglePlacesAutocomplete: 'GooglePlacesAutocomplete',
}));

// Mock rats-modal used by RatsTimePicker
jest.mock('../../rats-modal', () => {
  const { View } = require('react-native');
  return ({ children, isVisible }: any) =>
    isVisible ? <View>{children}</View> : null;
});

// Mock RatsTextInput to avoid deep dependency chain (gesture handler, address utils, etc.)
jest.mock('../../rats-text-input/rats-text-input', () => {
  const { TextInput } = require('react-native');
  return (props: any) => <TextInput testID="rats-text-input" value={props.field?.value ?? ''} />;
});

import RatsDatePicker from '../rats-datepicker';
import { RatsTimePicker } from '../rats-timepicker';

// Minimal Formik-like field/form props
const makeFieldProps = (value: string = '') => ({
  field: {
    name: 'date',
    value,
    onChange: jest.fn(),
    onBlur: jest.fn(),
  },
  form: {
    setFieldValue: jest.fn(),
    errors: {},
    touched: {},
    values: {},
  },
});

describe('RatsDatePicker', () => {
  it('renders without crashing', () => {
    const props = makeFieldProps();
    const { toJSON } = render(<RatsDatePicker {...props} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders the DatePicker modal (closed initially)', () => {
    const props = makeFieldProps();
    const { UNSAFE_getAllByType } = render(<RatsDatePicker {...props} />);
    const picker = UNSAFE_getAllByType('RNDatePicker' as any);
    expect(picker.length).toBeGreaterThan(0);
    // open should be false initially
    expect(picker[0].props.open).toBe(false);
  });

  it('opens DatePicker when TouchableOpacity is pressed', () => {
    const props = makeFieldProps();
    const { UNSAFE_getAllByType, UNSAFE_getByType } = render(
      <RatsDatePicker {...props} />,
    );
    const { TouchableOpacity } = require('react-native');
    fireEvent.press(UNSAFE_getByType(TouchableOpacity));
    const picker = UNSAFE_getAllByType('RNDatePicker' as any);
    expect(picker[0].props.open).toBe(true);
  });

  it('renders in date mode', () => {
    const props = makeFieldProps();
    const { UNSAFE_getAllByType } = render(<RatsDatePicker {...props} />);
    const picker = UNSAFE_getAllByType('RNDatePicker' as any);
    expect(picker[0].props.mode).toBe('date');
  });

  it('passes a Date to the DatePicker when no value given', () => {
    const props = makeFieldProps('');
    const { UNSAFE_getAllByType } = render(<RatsDatePicker {...props} />);
    const picker = UNSAFE_getAllByType('RNDatePicker' as any);
    expect(picker[0].props.date).toBeInstanceOf(Date);
  });

  it('passes a Date based on value when value given', () => {
    const props = makeFieldProps('2024-01-15');
    const { UNSAFE_getAllByType } = render(<RatsDatePicker {...props} />);
    const picker = UNSAFE_getAllByType('RNDatePicker' as any);
    expect(picker[0].props.date).toBeInstanceOf(Date);
  });

  it('calls setFieldValue with formatted date string on confirm', () => {
    const props = makeFieldProps('');
    const { UNSAFE_getAllByType, UNSAFE_getByType } = render(
      <RatsDatePicker {...props} />,
    );
    const { TouchableOpacity } = require('react-native');
    // Open the picker
    fireEvent.press(UNSAFE_getByType(TouchableOpacity));
    // Simulate confirm
    const picker = UNSAFE_getAllByType('RNDatePicker' as any);
    const testDate = new Date('2024-06-15T12:00:00');
    act(() => {
      picker[0].props.onConfirm(testDate);
    });
    // setFieldValue should have been called with the field name and a date string
    expect(props.form.setFieldValue).toHaveBeenCalledWith(
      'date',
      expect.any(String),
    );
  });

  it('closes picker on cancel', () => {
    const props = makeFieldProps('');
    const { UNSAFE_getAllByType, UNSAFE_getByType } = render(
      <RatsDatePicker {...props} />,
    );
    const { TouchableOpacity } = require('react-native');
    // Open
    fireEvent.press(UNSAFE_getByType(TouchableOpacity));
    let picker = UNSAFE_getAllByType('RNDatePicker' as any);
    expect(picker[0].props.open).toBe(true);
    // Cancel
    act(() => {
      picker[0].props.onCancel();
    });
    picker = UNSAFE_getAllByType('RNDatePicker' as any);
    expect(picker[0].props.open).toBe(false);
  });

  it('renders with a labelColor prop', () => {
    const props = makeFieldProps('2024-01-01');
    const { toJSON } = render(
      <RatsDatePicker {...props} labelColor="blue" />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders the mocked RatsTextInput', () => {
    // Since RatsTextInput is mocked (to avoid deep dependencies), verify it renders
    const props = makeFieldProps('2024-01-01');
    const { UNSAFE_getAllByType } = render(<RatsDatePicker {...props} />);
    const { TextInput } = require('react-native');
    expect(UNSAFE_getAllByType(TextInput).length).toBeGreaterThan(0);
  });

  it('snapshot matches', () => {
    const props = makeFieldProps('2024-03-20');
    const { toJSON } = render(<RatsDatePicker {...props} />);
    expect(toJSON()).toMatchSnapshot();
  });
});

describe('RatsTimePicker', () => {
  const baseValue = new Date('2024-01-01T12:00:00');
  const baseProps = {
    value: baseValue,
    onChange: jest.fn(),
    onBackdropPress: jest.fn(),
    mode: 'time' as const,
  };

  // In the test environment Platform.OS = 'ios' so IOS=true.
  // RatsTimePicker on iOS renders DateTimePicker inside RatsModal (our mock).
  // The modal mock returns children when isVisible=true and null otherwise.

  it('renders without crashing when visible', () => {
    const { toJSON } = render(
      <RatsTimePicker {...baseProps} isVisible={true} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders the DateTimePicker when visible', () => {
    const { UNSAFE_getAllByType } = render(
      <RatsTimePicker {...baseProps} isVisible={true} />,
    );
    const pickers = UNSAFE_getAllByType('DateTimePicker' as any);
    expect(pickers.length).toBeGreaterThan(0);
  });

  it('renders in time mode', () => {
    const { UNSAFE_getAllByType } = render(
      <RatsTimePicker {...baseProps} isVisible={true} />,
    );
    const picker = UNSAFE_getAllByType('DateTimePicker' as any)[0];
    expect(picker.props.mode).toBe('time');
  });

  it('passes value to DateTimePicker', () => {
    const { UNSAFE_getAllByType } = render(
      <RatsTimePicker {...baseProps} isVisible={true} />,
    );
    const picker = UNSAFE_getAllByType('DateTimePicker' as any)[0];
    expect(picker.props.value).toBe(baseValue);
  });

  it('renders null (hidden) when isVisible=false (on iOS)', () => {
    // Our mock RatsModal returns null when isVisible=false
    const { toJSON } = render(
      <RatsTimePicker {...baseProps} isVisible={false} />,
    );
    // Modal is hidden, so the root output is null
    expect(toJSON()).toBeNull();
  });

  it('renders with isVisible=true without crashing', () => {
    const { toJSON } = render(
      <RatsTimePicker {...baseProps} isVisible={true} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('snapshot matches when visible', () => {
    const { toJSON } = render(
      <RatsTimePicker {...baseProps} isVisible={true} />,
    );
    expect(toJSON()).toMatchSnapshot();
  });
});
