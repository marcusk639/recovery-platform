/**
 * Tests for rats-interactable-section (Section component)
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// Mock theme dependency
jest.mock('../../../styles/theme', () => ({
  CARD_STYLE: {},
  CARD_NO_ELEVATION: {},
  ROW: { flexDirection: 'row' },
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
    red: '#ff0000',
    white: '#ffffff',
    black: '#000000',
    dark_grey: '#888888',
    grey: '#cccccc',
    green: '#00ff00',
    baby_blue: '#89CFF0',
    darkYellow: '#ffcc00',
  },
  fontFamily: {
    bold: 'System-Bold',
    regular: 'System',
  },
  themes: { default: { primaryColor: '#000', secondaryColor: '#fff' } },
  useThemeHook: () => ({ primaryColor: '#000', secondaryColor: '#fff' }),
}));

jest.mock('../../../context', () => ({
  useTheme: () => ({
    theme: { primaryColor: '#000', secondaryColor: '#fff', backgroundColor: '#fff', textColor: '#000' },
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

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({}),
}));

jest.mock('../../../util/platform', () => ({ IOS: false }));

import Section from '../index';

const defaultProps = {
  name: 'Test Name',
  description: 'Test Description',
};

describe('Section (rats-interactable-section)', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<Section {...defaultProps} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders the name text', () => {
    const { getByText } = render(<Section {...defaultProps} />);
    expect(getByText('Test Name')).toBeTruthy();
  });

  it('renders the description text', () => {
    const { getByText } = render(<Section {...defaultProps} />);
    expect(getByText('Test Description')).toBeTruthy();
  });

  it('calls onPress when touchable is pressed', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <Section {...defaultProps} testID="section-btn" onPress={onPress} />,
    );
    fireEvent.press(getByTestId('section-btn'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders description2 when provided', () => {
    const { getByText } = render(
      <Section {...defaultProps} description2="Extra info" />,
    );
    expect(getByText('Extra info')).toBeTruthy();
  });

  it('renders error text when error prop is set', () => {
    const { getByText } = render(
      <Section {...defaultProps} error="Something went wrong" />,
    );
    expect(getByText('Something went wrong')).toBeTruthy();
  });

  it('does not render error text when error is null', () => {
    const { queryByText } = render(
      <Section {...defaultProps} error={null} />,
    );
    expect(queryByText('Something went wrong')).toBeNull();
  });

  it('renders notification badge when notifications > 0', () => {
    const { getByText } = render(
      <Section {...defaultProps} notifications={5} />,
    );
    expect(getByText('5')).toBeTruthy();
  });

  it('does not render notification badge when notifications is 0', () => {
    const { queryByText } = render(
      <Section {...defaultProps} notifications={0} />,
    );
    // notification count should not be rendered
    expect(queryByText('0')).toBeNull();
  });

  it('renders button text when buttonText is provided', () => {
    const { getByText } = render(
      <Section {...defaultProps} buttonText="Click Me" />,
    );
    // RatsText with toUpper=true uppercases the title
    expect(getByText('CLICK ME')).toBeTruthy();
  });

  it('does not render button when buttonText is null', () => {
    const { queryByText } = render(
      <Section {...defaultProps} buttonText={null} />,
    );
    expect(queryByText('CLICK ME')).toBeNull();
  });

  it('calls onEdit when edit button is pressed', () => {
    const onEdit = jest.fn();
    const { UNSAFE_getAllByType } = render(
      <Section {...defaultProps} onEdit={onEdit} />,
    );
    const { TouchableOpacity } = require('react-native');
    const touchables = UNSAFE_getAllByType(TouchableOpacity);
    // The edit button is nested inside the outer TouchableOpacity
    // Find the one that has onEdit wired. Press the last TouchableOpacity (edit button).
    const editButton = touchables[touchables.length - 1];
    fireEvent.press(editButton);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('renders with testID prop', () => {
    const { getByTestId } = render(
      <Section {...defaultProps} testID="my-section" />,
    );
    expect(getByTestId('my-section')).toBeTruthy();
  });

  it('renders a custom icon node when icon prop is passed', () => {
    const { View } = require('react-native');
    const CustomIcon = () => <View testID="custom-icon" />;
    const { getByTestId } = render(
      <Section {...defaultProps} icon={<CustomIcon />} />,
    );
    expect(getByTestId('custom-icon')).toBeTruthy();
  });
});
