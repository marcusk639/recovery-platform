/**
 * Tests for RatsSetupStepIndicator component
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

import RatsSetupStepIndicator from '../index';

const labels = [
  { label: 'Step One', icon: 'home' },
  { label: 'Step Two', icon: 'user' },
  { label: 'Step Three', icon: 'cog' },
];

describe('RatsSetupStepIndicator', () => {
  it('renders without crashing with no props', () => {
    const { toJSON } = render(<RatsSetupStepIndicator />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders with labels', () => {
    const { toJSON } = render(
      <RatsSetupStepIndicator labels={labels} currentPosition={0} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders label text for each step', () => {
    const { getByText } = render(
      <RatsSetupStepIndicator labels={labels} currentPosition={0} />,
    );
    expect(getByText('Step One')).toBeTruthy();
    expect(getByText('Step Two')).toBeTruthy();
    expect(getByText('Step Three')).toBeTruthy();
  });

  it('renders the correct number of step icons', () => {
    const { getAllByTestId } = render(
      <RatsSetupStepIndicator labels={labels} currentPosition={0} />,
    );
    // Step 0 icon is 'home', steps 1 and 2 get their own icons
    expect(getAllByTestId(/^icon-/).length).toBeGreaterThanOrEqual(labels.length);
  });

  it('renders check icon for completed steps (index < currentPosition)', () => {
    const { getAllByTestId } = render(
      <RatsSetupStepIndicator labels={labels} currentPosition={2} />,
    );
    // Steps 0 and 1 should show 'check' icons
    const checkIcons = getAllByTestId('icon-check');
    expect(checkIcons.length).toBe(2);
  });

  it('calls onPress with the correct step index', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <RatsSetupStepIndicator
        labels={labels}
        currentPosition={0}
        onPress={onPress}
      />,
    );
    fireEvent.press(getByText('Step Two'));
    expect(onPress).toHaveBeenCalledWith(1);
  });

  it('calls onPress with index 0 for first step', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <RatsSetupStepIndicator
        labels={labels}
        currentPosition={1}
        onPress={onPress}
      />,
    );
    fireEvent.press(getByText('Step One'));
    expect(onPress).toHaveBeenCalledWith(0);
  });

  it('renders without labels gracefully', () => {
    const { toJSON } = render(
      <RatsSetupStepIndicator labels={[]} currentPosition={0} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders with currentPosition at last step', () => {
    const { getByText } = render(
      <RatsSetupStepIndicator labels={labels} currentPosition={2} />,
    );
    expect(getByText('Step Three')).toBeTruthy();
  });

  it('renders the current step icon (not check) at currentPosition', () => {
    const { getAllByTestId } = render(
      <RatsSetupStepIndicator labels={labels} currentPosition={1} />,
    );
    // Step at index 0 should show check, step 1 shows its own icon 'user'
    expect(getAllByTestId('icon-check').length).toBe(1);
    expect(getAllByTestId('icon-user').length).toBe(1);
  });

  it('renders two-label step indicator correctly', () => {
    const twoLabels = [
      { label: 'First', icon: 'flag' },
      { label: 'Second', icon: 'bell' },
    ];
    const { getByText } = render(
      <RatsSetupStepIndicator labels={twoLabels} currentPosition={0} />,
    );
    expect(getByText('First')).toBeTruthy();
    expect(getByText('Second')).toBeTruthy();
  });
});
