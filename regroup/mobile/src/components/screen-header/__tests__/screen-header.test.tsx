/**
 * Tests for ScreenHeader component
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ScreenHeader from '../index';

// ── Navigation mock ──────────────────────────────────────────────────────────
const mockGoBack = jest.fn();
const mockNavigate = jest.fn();
const mockCanGoBack = jest.fn(() => true);

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: mockGoBack,
    navigate: mockNavigate,
    canGoBack: mockCanGoBack,
  }),
  NavigationProp: {},
  ParamListBase: {},
}));

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

// ── Redux / connected component mocks ────────────────────────────────────────
// Note: jest.mock factories cannot reference out-of-scope variables like React;
// use require() inside the factory instead.
jest.mock('react-redux', () => ({
  connect: () => (Component: any) => {
    const { View } = require('react-native');
    const Wrapped = (props: any) =>
      require('react').createElement(Component, {
        house: { name: 'Test House', avatar: '' },
        guest: { firstName: 'John', lastName: 'Doe', avatar: '' },
        userEntity: { isAdmin: true },
        ...props,
      });
    Wrapped.displayName = 'Connected';
    return Wrapped;
  },
  useSelector: jest.fn(),
  useDispatch: () => jest.fn(),
}));

jest.mock('../../../constants/routes', () => ({
  default: {},
  tabs: {},
}));

jest.mock('../../../navigation/types', () => ({
  Routes: {
    HouseList: 'HouseList',
    GuestList: 'GuestList',
    Personal: 'Personal',
  },
}));

jest.mock('../../rats-icon/rats-icon', () => ({
  RatsIcon: ({ name }: { name: string }) => {
    const { View } = require('react-native');
    return require('react').createElement(View, { testID: `icon-${name}` });
  },
}));

jest.mock('../../title-bar-right-button', () => ({
  HouseSelectionButton: () => {
    const { View } = require('react-native');
    return require('react').createElement(View, { testID: 'house-selection-button' });
  },
  GuestSelectionButton: () => {
    const { View } = require('react-native');
    return require('react').createElement(View, { testID: 'guest-selection-button' });
  },
}));

jest.mock('react-native-vector-icons/FontAwesome5', () => 'FontAwesome5Icon');

// ── Assets mock ───────────────────────────────────────────────────────────────
jest.mock('../../../../assets', () => ({
  placeholderUserIcon: 0,
  circleLogo: 0,
}));

// ── RatsAvatar mock ───────────────────────────────────────────────────────────
jest.mock('../../rats-avatar', () => {
  const MockAvatar = ({ name }: { name: string }) => {
    const { View } = require('react-native');
    return require('react').createElement(View, { testID: `avatar-${name}` });
  };
  return MockAvatar;
});

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockCanGoBack.mockReturnValue(true);
});

describe('ScreenHeader', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<ScreenHeader header="Dashboard" />);
    expect(toJSON()).toBeTruthy();
  });

  it('displays the header text', () => {
    const { getByText } = render(<ScreenHeader header="My Screen" />);
    expect(getByText('My Screen')).toBeTruthy();
  });

  it('does not render back button when renderBackButton is false', () => {
    const { queryByTestId } = render(
      <ScreenHeader header="No Back" renderBackButton={false} />,
    );
    expect(queryByTestId('back-button')).toBeNull();
  });

  it('renders back button when renderBackButton is true and canGoBack returns true', () => {
    const { getByTestId } = render(
      <ScreenHeader header="Has Back" renderBackButton />,
    );
    expect(getByTestId('back-button')).toBeTruthy();
  });

  it('does not render back button when canGoBack returns false', () => {
    mockCanGoBack.mockReturnValue(false);
    const { queryByTestId } = render(
      <ScreenHeader header="No Back" renderBackButton />,
    );
    expect(queryByTestId('back-button')).toBeNull();
  });

  it('calls navigation.goBack when back button pressed and no onBackPress provided', () => {
    const { getByTestId } = render(
      <ScreenHeader header="Back Nav" renderBackButton />,
    );
    fireEvent.press(getByTestId('back-button'));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('calls custom onBackPress instead of navigation.goBack when provided', () => {
    const onBackPress = jest.fn();
    const { getByTestId } = render(
      <ScreenHeader header="Custom Back" renderBackButton onBackPress={onBackPress} />,
    );
    fireEvent.press(getByTestId('back-button'));
    expect(onBackPress).toHaveBeenCalledTimes(1);
    expect(mockGoBack).not.toHaveBeenCalled();
  });

  it('renders house switcher button when renderHouseButton is true', () => {
    const { getByTestId } = render(
      <ScreenHeader header="House" renderHouseButton />,
    );
    expect(getByTestId('house-switcher-button')).toBeTruthy();
  });

  it('does not render house switcher button by default', () => {
    const { queryByTestId } = render(<ScreenHeader header="Plain" />);
    expect(queryByTestId('house-switcher-button')).toBeNull();
  });

  it('navigates to HouseList when clickableHouseButton is true and house button pressed', () => {
    const { getByTestId } = render(
      <ScreenHeader header="House Nav" renderHouseButton clickableHouseButton />,
    );
    fireEvent.press(getByTestId('house-switcher-button'));
    expect(mockNavigate).toHaveBeenCalledWith('HouseList');
  });

  it('does not navigate when clickableHouseButton is false and house button pressed', () => {
    const { getByTestId } = render(
      <ScreenHeader
        header="House No Nav"
        renderHouseButton
        clickableHouseButton={false}
      />,
    );
    fireEvent.press(getByTestId('house-switcher-button'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('renders children inside the header', () => {
    const { View } = require('react-native');
    const { getByTestId } = render(
      <ScreenHeader header="With Child">
        <View testID="header-child" />
      </ScreenHeader>,
    );
    expect(getByTestId('header-child')).toBeTruthy();
  });
});
