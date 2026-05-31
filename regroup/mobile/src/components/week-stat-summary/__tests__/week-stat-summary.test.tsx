/**
 * Tests for WeekStatSummary component
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { Text, View } from 'react-native';

jest.mock('../../../styles/theme', () => ({
  normalize: (n: number) => n,
  fontSize: {
    small: 10,
    regular: 12,
    medium: 14,
    regular_medium: 15,
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
    darkYellow: '#ffcc00',
  },
  fontFamily: { bold: 'System-Bold', regular: 'System' },
  CARD_STYLE: {},
  CARD_NO_ELEVATION: {},
  ROW: { flexDirection: 'row' },
  elevateStyle: {},
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

jest.mock('../../../util/guest', () => ({
  getHealthByPercentage: (percentage: number) => {
    if (percentage >= 90) return 'super_happy';
    if (percentage >= 75) return 'happy';
    if (percentage >= 50) return 'neutral';
    return 'sad';
  },
  HEALTH_COLOR_MAP: {
    super_happy: '#89CFF0',
    happy: '#00ff00',
    neutral: '#ffcc00',
    sad: '#ff0000',
  },
}));

jest.mock('../../../util/platform', () => ({ IOS: false }));

// Mock getHealthIcon to return a simple View
jest.mock('../../rats-icon', () => ({
  getHealthIcon: (health: string, style: any) => {
    const React = require('react');
    const { View } = require('react-native');
    return <View testID={`health-icon-${health}`} />;
  },
}));

import WeekStatSummary from '../index';

const RightSideContent = () => <View testID="right-side" />;

describe('WeekStatSummary', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(
      <WeekStatSummary
        header="Weekly Progress"
        rightSideContent={<RightSideContent />}
        percentage={80}
      />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders the header text', () => {
    const { getByText } = render(
      <WeekStatSummary
        header="My Header"
        rightSideContent={<RightSideContent />}
        percentage={80}
      />,
    );
    expect(getByText('My Header')).toBeTruthy();
  });

  it('renders the percentage value', () => {
    const { getByText } = render(
      <WeekStatSummary
        header="Header"
        rightSideContent={<RightSideContent />}
        percentage={75}
      />,
    );
    expect(getByText('75%')).toBeTruthy();
  });

  it('renders right side content', () => {
    const { getByTestId } = render(
      <WeekStatSummary
        header="Header"
        rightSideContent={<RightSideContent />}
        percentage={80}
      />,
    );
    expect(getByTestId('right-side')).toBeTruthy();
  });

  it('renders children when provided', () => {
    const { getByText } = render(
      <WeekStatSummary
        header="Header"
        rightSideContent={<RightSideContent />}
        percentage={80}>
        <Text>Child Content</Text>
      </WeekStatSummary>,
    );
    expect(getByText('Child Content')).toBeTruthy();
  });

  it('renders without children', () => {
    const { toJSON } = render(
      <WeekStatSummary
        header="Header"
        rightSideContent={<RightSideContent />}
        percentage={80}
      />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders 0% percentage', () => {
    const { getByText } = render(
      <WeekStatSummary
        header="Header"
        rightSideContent={<RightSideContent />}
        percentage={0}
      />,
    );
    expect(getByText('0%')).toBeTruthy();
  });

  it('renders 100% percentage', () => {
    const { getByText } = render(
      <WeekStatSummary
        header="Header"
        rightSideContent={<RightSideContent />}
        percentage={100}
      />,
    );
    expect(getByText('100%')).toBeTruthy();
  });

  it('renders health icon for super_happy percentage (>=90)', () => {
    const { getByTestId } = render(
      <WeekStatSummary
        header="Header"
        rightSideContent={<RightSideContent />}
        percentage={95}
      />,
    );
    expect(getByTestId('health-icon-super_happy')).toBeTruthy();
  });

  it('renders health icon for sad percentage (<50)', () => {
    const { getByTestId } = render(
      <WeekStatSummary
        header="Header"
        rightSideContent={<RightSideContent />}
        percentage={30}
      />,
    );
    expect(getByTestId('health-icon-sad')).toBeTruthy();
  });

  it('renders with rightSideContainer style', () => {
    const { toJSON } = render(
      <WeekStatSummary
        header="Header"
        rightSideContent={<RightSideContent />}
        percentage={80}
        rightSideContainer={{ padding: 10 }}
      />,
    );
    expect(toJSON()).toBeTruthy();
  });
});
