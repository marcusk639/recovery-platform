/**
 * Tests for EmptyScreen component
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import EmptyScreen from '../index';

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

jest.mock('../../rats-icon/rats-icon', () => ({
  RatsIcon: ({ name }: { name: string }) =>
    require('react').createElement('View', { testID: `icon-${name}` }),
}));

jest.mock('react-native-vector-icons/FontAwesome5', () => 'FontAwesome5Icon');

const defaultProps = {
  icon: 'home',
  message: 'Nothing to show here',
  buttonTitle: 'Add Item',
  onPress: jest.fn(),
};

describe('EmptyScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders without crashing', () => {
    const { toJSON } = render(<EmptyScreen {...defaultProps} />);
    expect(toJSON()).toBeTruthy();
  });

  it('displays the message text', () => {
    const { getByText } = render(
      <EmptyScreen {...defaultProps} message="No records found" />,
    );
    expect(getByText('No records found')).toBeTruthy();
  });

  it('displays the button title', () => {
    const { getByText } = render(
      <EmptyScreen {...defaultProps} buttonTitle="Create New" />,
    );
    // RatsButton uses RatsText with toUpper=true
    expect(getByText('CREATE NEW')).toBeTruthy();
  });

  it('renders the icon with the correct name', () => {
    const { getByTestId } = render(
      <EmptyScreen {...defaultProps} icon="user" />,
    );
    expect(getByTestId('icon-user')).toBeTruthy();
  });

  it('calls onPress when the button is pressed', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <EmptyScreen {...defaultProps} onPress={onPress} />,
    );
    fireEvent.press(getByText('ADD ITEM'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders with a different icon without crashing', () => {
    const { getByTestId } = render(
      <EmptyScreen {...defaultProps} icon="calendar" />,
    );
    expect(getByTestId('icon-calendar')).toBeTruthy();
  });

  it('renders with a long message without crashing', () => {
    const longMessage = 'This is a very long message that describes the empty state in detail.';
    const { getByText } = render(
      <EmptyScreen {...defaultProps} message={longMessage} />,
    );
    expect(getByText(longMessage)).toBeTruthy();
  });

  it('applies containerStyle without crashing', () => {
    const { toJSON } = render(
      <EmptyScreen {...defaultProps} containerStyle={{ margin: 20 }} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('does not crash with different button titles', () => {
    const { getByText } = render(
      <EmptyScreen {...defaultProps} buttonTitle="Refresh" />,
    );
    expect(getByText('REFRESH')).toBeTruthy();
  });

  it('calls onPress only once per single press', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <EmptyScreen {...defaultProps} onPress={onPress} />,
    );
    fireEvent.press(getByText('ADD ITEM'));
    fireEvent.press(getByText('ADD ITEM'));
    expect(onPress).toHaveBeenCalledTimes(2);
  });
});
