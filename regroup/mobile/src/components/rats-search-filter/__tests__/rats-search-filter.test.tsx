/**
 * Tests for RatsSearchFilter component
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('../../../styles/theme', () => ({
  normalize: (n: number) => n,
  fontSize: {
    small: 10,
    regular: 12,
    medium: 14,
    medium_large: 16,
    large: 18,
    huge: 24,
    huger: 28,
  },
  color: {
    white: '#ffffff',
    black: '#000000',
    dark_grey: '#888888',
    grey: '#cccccc',
    green: '#00ff00',
    baby_blue: '#89CFF0',
    red: '#ff0000',
  },
  fontFamily: { bold: 'System-Bold', regular: 'System' },
  CARD_STYLE: {},
  CARD_NO_ELEVATION: {},
  ROW: { flexDirection: 'row' },
  themes: { default: { primaryColor: '#000' } },
  useThemeHook: () => ({ primaryColor: '#000' }),
}));

jest.mock('../../../context', () => ({
  useTheme: () => ({
    theme: { primaryColor: '#000', secondaryColor: '#fff' },
  }),
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

jest.mock('react-native-vector-icons/FontAwesome5', () => {
  const React = require('react');
  const { View } = require('react-native');
  return (props: any) => <View testID={`icon-${props.name}`} />;
});

jest.mock('react-native-vector-icons/MaterialIcons', () => {
  const React = require('react');
  const { View } = require('react-native');
  return (props: any) => <View testID={`material-${props.name}`} />;
});

jest.mock('../../card', () => {
  const React = require('react');
  const { TouchableOpacity } = require('react-native');
  return {
    __esModule: true,
    default: ({ children, onPress, containerStyle, testID }: any) => (
      <TouchableOpacity
        testID={testID || 'card'}
        onPress={onPress}
        style={containerStyle}>
        {children}
      </TouchableOpacity>
    ),
  };
});

import RatsSearchFilter from '../index';

const defaultProps = {
  onPress: jest.fn(),
  active: false,
  filterName: 'Filter A',
  iconName: 'search',
};

describe('RatsSearchFilter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    const { toJSON } = render(<RatsSearchFilter {...defaultProps} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders filter name text', () => {
    const { getByText } = render(<RatsSearchFilter {...defaultProps} />);
    expect(getByText('Filter A')).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <RatsSearchFilter {...defaultProps} onPress={onPress} testID="filter" />,
    );
    // Card is rendered as the outer touchable
    fireEvent.press(getByTestId('card'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders icon with correct name', () => {
    const { getByTestId } = render(
      <RatsSearchFilter {...defaultProps} iconName="star" />,
    );
    expect(getByTestId('icon-star')).toBeTruthy();
  });

  it('renders with active=true without crashing', () => {
    const { toJSON } = render(
      <RatsSearchFilter {...defaultProps} active={true} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders with active=false without crashing', () => {
    const { toJSON } = render(
      <RatsSearchFilter {...defaultProps} active={false} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders different filter names', () => {
    const { getByText } = render(
      <RatsSearchFilter {...defaultProps} filterName="My Custom Filter" />,
    );
    expect(getByText('My Custom Filter')).toBeTruthy();
  });

  it('renders with custom iconSize', () => {
    const { toJSON } = render(
      <RatsSearchFilter {...defaultProps} iconSize={24} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders with custom containerStyle', () => {
    const { toJSON } = render(
      <RatsSearchFilter {...defaultProps} containerStyle={{ margin: 5 }} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders different icon names', () => {
    const { getByTestId } = render(
      <RatsSearchFilter {...defaultProps} iconName="home" />,
    );
    expect(getByTestId('icon-home')).toBeTruthy();
  });

  it('renders filter text with active state toggled', () => {
    const { rerender, getByText } = render(
      <RatsSearchFilter {...defaultProps} active={false} />,
    );
    expect(getByText('Filter A')).toBeTruthy();
    rerender(<RatsSearchFilter {...defaultProps} active={true} />);
    expect(getByText('Filter A')).toBeTruthy();
  });
});
