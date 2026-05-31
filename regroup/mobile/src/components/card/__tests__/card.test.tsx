/**
 * Tests for Card component
 */

import React from 'react';
import { Text, View } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import Card from '../index';

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

describe('Card', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(
      <Card>
        <Text>Content</Text>
      </Card>,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders children correctly', () => {
    const { getByText } = render(
      <Card>
        <Text>Card Body</Text>
      </Card>,
    );
    expect(getByText('Card Body')).toBeTruthy();
  });

  it('renders multiple children', () => {
    const { getByText } = render(
      <Card>
        <Text>First</Text>
        <Text>Second</Text>
      </Card>,
    );
    expect(getByText('First')).toBeTruthy();
    expect(getByText('Second')).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <Card onPress={onPress}>
        <Text>Press Me</Text>
      </Card>,
    );
    fireEvent.press(getByText('Press Me'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not crash when onPress is not provided', () => {
    const { getByText } = render(
      <Card>
        <Text>No handler</Text>
      </Card>,
    );
    expect(() => fireEvent.press(getByText('No handler'))).not.toThrow();
  });

  it('applies custom containerStyle', () => {
    const { toJSON } = render(
      <Card containerStyle={{ borderRadius: 8, margin: 10 }}>
        <Text>Styled</Text>
      </Card>,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('accepts activeOpacity prop without crashing', () => {
    const { toJSON } = render(
      <Card activeOpacity={0.5}>
        <Text>Opacity</Text>
      </Card>,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders a View child without crashing', () => {
    const { toJSON } = render(
      <Card>
        <View>
          <Text>Nested</Text>
        </View>
      </Card>,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders with testID passed through TouchableOpacityProps', () => {
    const { getByTestId } = render(
      <Card testID="my-card">
        <Text>Test</Text>
      </Card>,
    );
    expect(getByTestId('my-card')).toBeTruthy();
  });

  it('disabled prop prevents interaction when set', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <Card testID="disabled-card" onPress={onPress} disabled>
        <Text>Disabled</Text>
      </Card>,
    );
    fireEvent.press(getByTestId('disabled-card'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('renders with no containerStyle without crashing', () => {
    const { toJSON } = render(
      <Card>
        <Text>Default Style</Text>
      </Card>,
    );
    expect(toJSON()).toBeTruthy();
  });
});
