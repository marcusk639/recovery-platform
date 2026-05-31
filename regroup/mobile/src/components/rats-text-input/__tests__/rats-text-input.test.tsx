/**
 * Tests for RatsTextInput component
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import RatsTextInput from '../rats-text-input';

// ── Context mock ─────────────────────────────────────────────────────────────
jest.mock('../../../context', () => ({
  useTheme: () => ({
    theme: {
      primaryColor: '#000',
      secondaryColor: '#fff',
      backgroundColor: '#fff',
      textColor: '#000',
      primaryFontFamily: 'System',
      secondaryFontFamily: 'System',
    },
  }),
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

// ── Icon mock ─────────────────────────────────────────────────────────────────
jest.mock('../../rats-icon/rats-icon', () => ({
  RatsIcon: ({ name }: { name: string }) => {
    const { View } = require('react-native');
    return require('react').createElement(View, { testID: `icon-${name}` });
  },
}));

jest.mock('react-native-vector-icons/FontAwesome5', () => 'FontAwesome5Icon');

// ── Google Places mock ────────────────────────────────────────────────────────
jest.mock('../../google-places-autocomplete', () => {
  const MockGooglePlaces = () => {
    const { View } = require('react-native');
    return require('react').createElement(View, { testID: 'google-places' });
  };
  return MockGooglePlaces;
});

// ── react-native-gesture-handler TouchableOpacity mock ────────────────────────
// RatsTextInput imports TouchableOpacity from react-native-gesture-handler; the
// global mock in jest.setup.js does not export it, so we provide it here.
jest.mock('react-native-gesture-handler', () => {
  const { TouchableOpacity, ScrollView, FlatList, TextInput } = require('react-native');
  return {
    GestureHandlerRootView: ({ children }: any) => children,
    TouchableOpacity,
    ScrollView,
    FlatList,
    TextInput,
    Swipeable: 'Swipeable',
    DrawerLayout: 'DrawerLayout',
    State: {},
    Slider: 'Slider',
    Switch: 'Switch',
    ToolbarAndroid: 'ToolbarAndroid',
    ViewPagerAndroid: 'ViewPagerAndroid',
    DrawerLayoutAndroid: 'DrawerLayoutAndroid',
    WebView: 'WebView',
    NativeViewGestureHandler: 'NativeViewGestureHandler',
    TapGestureHandler: 'TapGestureHandler',
    FlingGestureHandler: 'FlingGestureHandler',
    ForceTouchGestureHandler: 'ForceTouchGestureHandler',
    LongPressGestureHandler: 'LongPressGestureHandler',
    PanGestureHandler: 'PanGestureHandler',
    PinchGestureHandler: 'PinchGestureHandler',
    RotationGestureHandler: 'RotationGestureHandler',
    RawButton: 'RawButton',
    BaseButton: 'BaseButton',
    RectButton: 'RectButton',
    BorderlessButton: 'BorderlessButton',
    gestureHandlerRootHOC: jest.fn((comp: any) => comp),
    Directions: {},
  };
});

// ── Utility mocks ─────────────────────────────────────────────────────────────
jest.mock('../../../util/address', () => ({
  getPlaceAsAddress: jest.fn(() => ({})),
  getAddressDisplay: jest.fn(() => ''),
}));

jest.mock('../../../util/platform', () => ({ IOS: false }));

// ── Label mock ────────────────────────────────────────────────────────────────
jest.mock('../../rats-label/rats-label', () => {
  const MockLabel = ({ label }: { label: string }) => {
    const { Text } = require('react-native');
    return require('react').createElement(
      Text,
      { testID: `label-${label}` },
      label,
    );
  };
  return MockLabel;
});

// ── Numeric input arrow button export mock ────────────────────────────────────
jest.mock('../../rats-numeric-input', () => ({
  ARROW_BUTTON: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderColor: '#99CCFF',
    borderWidth: 1.5,
    borderRadius: 5,
  },
}));

// ─────────────────────────────────────────────────────────────────────────────

const defaultField = {
  name: 'email',
  value: '',
  onChange: jest.fn(),
  onBlur: jest.fn(),
};
const defaultForm = {
  errors: {},
  touched: {},
  setFieldValue: jest.fn(),
  values: {},
};

describe('RatsTextInput', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders without crashing', () => {
    const { toJSON } = render(
      <RatsTextInput field={defaultField} form={defaultForm} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders with no props at all without crashing', () => {
    const { toJSON } = render(<RatsTextInput />);
    expect(toJSON()).toBeTruthy();
  });

  it('displays the placeholder in the TextInput', () => {
    const { getByPlaceholderText } = render(
      <RatsTextInput
        placeholder="Enter email"
        field={defaultField}
        form={defaultForm}
      />,
    );
    expect(getByPlaceholderText('Enter email')).toBeTruthy();
  });

  it('forwards testID to the underlying TextInput', () => {
    const { getByTestId } = render(
      <RatsTextInput
        testID="email-input"
        field={defaultField}
        form={defaultForm}
      />,
    );
    expect(getByTestId('email-input')).toBeTruthy();
  });

  it('renders the field label when label is provided', () => {
    const { getByTestId } = render(
      <RatsTextInput
        label="Email Address"
        field={defaultField}
        form={defaultForm}
      />,
    );
    expect(getByTestId('label-Email Address')).toBeTruthy();
  });

  it('does not render label when labelDisabled is true', () => {
    const { queryByTestId } = render(
      <RatsTextInput
        labelDisabled
        label="Hidden Label"
        field={defaultField}
        form={defaultForm}
      />,
    );
    expect(queryByTestId('label-Hidden Label')).toBeNull();
  });

  it('calls customHandleChange on text change', () => {
    const customHandleChange = jest.fn();
    const { getByTestId } = render(
      <RatsTextInput
        testID="custom-input"
        customHandleChange={customHandleChange}
        field={defaultField}
        form={defaultForm}
      />,
    );
    fireEvent.changeText(getByTestId('custom-input'), 'new value');
    expect(customHandleChange).toHaveBeenCalledWith('new value');
  });

  it('uses the field value as TextInput value', () => {
    const field = { ...defaultField, value: 'test@example.com' };
    const { getByTestId } = render(
      <RatsTextInput
        testID="valued-input"
        field={field}
        form={defaultForm}
      />,
    );
    expect(getByTestId('valued-input').props.value).toBe('test@example.com');
  });

  it('shows empty string when field value is empty', () => {
    const { getByTestId } = render(
      <RatsTextInput
        testID="empty-input"
        field={defaultField}
        form={defaultForm}
      />,
    );
    expect(getByTestId('empty-input').props.value).toBe('');
  });

  it('is not editable when disabled is true', () => {
    const { getByTestId } = render(
      <RatsTextInput
        testID="disabled-input"
        disabled
        field={defaultField}
        form={defaultForm}
      />,
    );
    expect(getByTestId('disabled-input').props.editable).toBe(false);
  });

  it('is editable when disabled is false', () => {
    const { getByTestId } = render(
      <RatsTextInput
        testID="enabled-input"
        disabled={false}
        field={defaultField}
        form={defaultForm}
      />,
    );
    expect(getByTestId('enabled-input').props.editable).toBe(true);
  });

  it('renders Google Places autocomplete when address is true', () => {
    const { getByTestId } = render(
      <RatsTextInput
        address
        field={defaultField}
        form={defaultForm}
      />,
    );
    expect(getByTestId('google-places')).toBeTruthy();
  });

  it('does not render Google Places when address is false', () => {
    const { queryByTestId } = render(
      <RatsTextInput
        address={false}
        field={defaultField}
        form={defaultForm}
      />,
    );
    expect(queryByTestId('google-places')).toBeNull();
  });
});
