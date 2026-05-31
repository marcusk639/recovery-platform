/**
 * Tests for RatsLoadingIndicator component
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import RatsLoadingIndicator from '../rats-loading-indicator';

jest.mock('../../../context', () => ({
  useTheme: () => ({
    theme: {
      primaryColor: '#4A90E2',
      secondaryColor: '#fff',
      backgroundColor: '#fff',
      textColor: '#000',
      primaryFontFamily: 'System',
      secondaryFontFamily: 'System',
    },
  }),
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

describe('RatsLoadingIndicator', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<RatsLoadingIndicator />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders an ActivityIndicator', () => {
    const { UNSAFE_getByType } = render(<RatsLoadingIndicator />);
    const { ActivityIndicator } = require('react-native');
    expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });

  it('uses "large" size by default', () => {
    const { UNSAFE_getByType } = render(<RatsLoadingIndicator />);
    const { ActivityIndicator } = require('react-native');
    const indicator = UNSAFE_getByType(ActivityIndicator);
    expect(indicator.props.size).toBe('large');
  });

  it('uses the theme primaryColor as default color', () => {
    const { UNSAFE_getByType } = render(<RatsLoadingIndicator />);
    const { ActivityIndicator } = require('react-native');
    const indicator = UNSAFE_getByType(ActivityIndicator);
    expect(indicator.props.color).toBe('#4A90E2');
  });

  it('applies a custom color when color prop is provided', () => {
    const { UNSAFE_getByType } = render(
      <RatsLoadingIndicator color="#FF0000" />,
    );
    const { ActivityIndicator } = require('react-native');
    const indicator = UNSAFE_getByType(ActivityIndicator);
    expect(indicator.props.color).toBe('#FF0000');
  });

  it('applies "small" size when size prop is "small"', () => {
    const { UNSAFE_getByType } = render(
      <RatsLoadingIndicator size="small" />,
    );
    const { ActivityIndicator } = require('react-native');
    const indicator = UNSAFE_getByType(ActivityIndicator);
    expect(indicator.props.size).toBe('small');
  });

  it('applies a numeric size when size prop is a number', () => {
    const { UNSAFE_getByType } = render(
      <RatsLoadingIndicator size={48} />,
    );
    const { ActivityIndicator } = require('react-native');
    const indicator = UNSAFE_getByType(ActivityIndicator);
    expect(indicator.props.size).toBe(48);
  });

  it('always has animating set to true', () => {
    const { UNSAFE_getByType } = render(<RatsLoadingIndicator />);
    const { ActivityIndicator } = require('react-native');
    const indicator = UNSAFE_getByType(ActivityIndicator);
    expect(indicator.props.animating).toBe(true);
  });

  it('applies containerStyle without crashing', () => {
    const { toJSON } = render(
      <RatsLoadingIndicator containerStyle={{ backgroundColor: 'transparent' }} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders correctly with all props supplied', () => {
    const { toJSON } = render(
      <RatsLoadingIndicator
        color="#00FF00"
        size="large"
        containerStyle={{ flex: 1 }}
      />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders correctly with only color prop', () => {
    const { UNSAFE_getByType } = render(
      <RatsLoadingIndicator color="#123456" />,
    );
    const { ActivityIndicator } = require('react-native');
    const indicator = UNSAFE_getByType(ActivityIndicator);
    expect(indicator.props.color).toBe('#123456');
    expect(indicator.props.size).toBe('large');
  });
});
