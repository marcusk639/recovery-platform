/**
 * Tests for SummaryListItem component
 */

import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { SummaryListItem } from '../index';

jest.mock('../../../context', () => ({
  useTheme: () => ({
    theme: {
      primaryColor: '#000',
      secondaryColor: '#fff',
      backgroundColor: '#fff',
      textColor: '#000',
      primaryFontFamily: 'System',
      secondaryFontFamily: 'System',
      tertiaryColor: '#ccc',
    },
  }),
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

jest.mock('react-native-vector-icons/FontAwesome5', () => {
  const React = require('react');
  const { View } = require('react-native');
  const FontAwesome5 = (props: any) => (
    <View testID={`fa5-${props.name}`} {...props} />
  );
  return FontAwesome5;
});

// Mock RatsImage used inside RatsAvatar
jest.mock('../../rats-image', () => {
  const React = require('react');
  const { Image } = require('react-native');
  return { RatsImage: (props: any) => <Image {...props} /> };
});

const defaultProps = {
  name: 'John Doe',
  itemId: 'item-1',
  health: 'happy' as const,
  onPress: jest.fn(),
  imageSource: { uri: '' },
};

describe('SummaryListItem', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    const { toJSON } = render(<SummaryListItem {...defaultProps} />);
    expect(toJSON()).toBeTruthy();
  });

  it('displays the name', () => {
    const { getByText } = render(<SummaryListItem {...defaultProps} />);
    expect(getByText('John Doe')).toBeTruthy();
  });

  it('calls onPress with itemId when pressed', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <SummaryListItem {...defaultProps} onPress={onPress} itemId="abc-123" />,
    );
    fireEvent.press(getByText('John Doe'));
    expect(onPress).toHaveBeenCalledWith('abc-123');
  });

  it('shows notifications text when showNotifications is true (default)', () => {
    const { getByText } = render(
      <SummaryListItem {...defaultProps} notifications="5" />,
    );
    expect(getByText('5')).toBeTruthy();
  });

  it('does not show notifications when showNotifications is false', () => {
    const { queryByText } = render(
      <SummaryListItem
        {...defaultProps}
        notifications="5"
        showNotifications={false}
      />,
    );
    expect(queryByText('5')).toBeNull();
  });

  it('shows all three face icons when showAllIcons is true (default)', () => {
    const { getByTestId } = render(
      <SummaryListItem {...defaultProps} showAllIcons health="happy" />,
    );
    expect(getByTestId('fa5-laugh')).toBeTruthy();
    expect(getByTestId('fa5-meh')).toBeTruthy();
    expect(getByTestId('fa5-frown-open')).toBeTruthy();
  });

  it('shows only the laugh icon for happy health when showAllIcons is false', () => {
    const { getByTestId, queryByTestId } = render(
      <SummaryListItem
        {...defaultProps}
        health="happy"
        showAllIcons={false}
      />,
    );
    expect(getByTestId('fa5-laugh')).toBeTruthy();
    expect(queryByTestId('fa5-meh')).toBeNull();
    expect(queryByTestId('fa5-frown-open')).toBeNull();
  });

  it('shows only the meh icon for neutral health when showAllIcons is false', () => {
    const { getByTestId, queryByTestId } = render(
      <SummaryListItem
        {...defaultProps}
        health="neutral"
        showAllIcons={false}
      />,
    );
    expect(getByTestId('fa5-meh')).toBeTruthy();
    expect(queryByTestId('fa5-laugh')).toBeNull();
  });

  it('shows only the frown-open icon for sad health when showAllIcons is false', () => {
    const { getByTestId, queryByTestId } = render(
      <SummaryListItem
        {...defaultProps}
        health="sad"
        showAllIcons={false}
      />,
    );
    expect(getByTestId('fa5-frown-open')).toBeTruthy();
    expect(queryByTestId('fa5-laugh')).toBeNull();
  });

  it('renders a description when provided', () => {
    const { getByText } = render(
      <SummaryListItem {...defaultProps} description="Group Leader" />,
    );
    expect(getByText('Group Leader')).toBeTruthy();
  });

  it('renders children inside the summary area', () => {
    const { getByText } = render(
      <SummaryListItem {...defaultProps}>
        <Text>Extra Info</Text>
      </SummaryListItem>,
    );
    expect(getByText('Extra Info')).toBeTruthy();
  });

  it('renders numeric notifications', () => {
    const { getByText } = render(
      <SummaryListItem {...defaultProps} notifications={12} />,
    );
    expect(getByText('12')).toBeTruthy();
  });

  it('renders with an image source URI', () => {
    const { toJSON } = render(
      <SummaryListItem
        {...defaultProps}
        imageSource={{ uri: 'https://example.com/avatar.png' }}
      />,
    );
    expect(toJSON()).toBeTruthy();
  });
});
