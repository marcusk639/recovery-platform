/**
 * Tests for SetupHeader component
 */

import React from 'react';
import { render } from '@testing-library/react-native';

// ── mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../../styles/theme', () => ({
  normalize: (n: number) => n,
  color: { light_grey: '#eee', baby_blue: '#89cff0', black: '#000', white: '#fff', grey: '#aaa', dark_grey: '#555', red: '#f00', green: '#0f0', medium_grey: '#999' },
  fontSize: { regular: 14, regular_medium: 16, medium: 15, large: 18, small: 12, larger: 22, extraLarge: 24 },
  fontFamily: { roboto: 'Roboto', bold: 'Roboto-Bold', timesNewRoman: 'TimesNewRoman' },
  ROW: { flexDirection: 'row' as const },
  CARD_STYLE: { backgroundColor: '#fff', borderRadius: 5 },
  tabBarStyle: {},
  elevateStyle: {},
  themes: { default: { primaryColor: '#000' } },
  windowHeight: 800,
}));

jest.mock('../../../context', () => ({
  useTheme: () => ({ theme: { primaryColor: '#000' } }),
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

jest.mock('react-native-vector-icons/FontAwesome5', () => {
  const React = require('react');
  const { View } = require('react-native');
  return (props: any) => <View testID={`fa5-${props.name}`} />;
});

jest.mock('../../rats-text', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return { RatsText: ({ text }: any) => <Text testID={`text-${text}`}>{text}</Text> };
});

jest.mock('../../rats-icon/boxed-icon', () => {
  const React = require('react');
  const { View } = require('react-native');
  return ({ name, backgroundColor }: any) => (
    <View testID={`boxed-icon-${name}`} accessibilityLabel={backgroundColor} />
  );
});

import SetupHeader from '../index';

const defaultProps = {
  header: 'House Setup',
  description: 'Configure your house settings',
  icon: 'home',
  iconBackgroundColor: '#007AFF',
};

describe('SetupHeader', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<SetupHeader {...defaultProps} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders the header text', () => {
    const { getByTestId } = render(<SetupHeader {...defaultProps} header="My Header" />);
    expect(getByTestId('text-My Header')).toBeTruthy();
  });

  it('renders the description text', () => {
    const { getByTestId } = render(
      <SetupHeader {...defaultProps} description="Setup your profile" />,
    );
    expect(getByTestId('text-Setup your profile')).toBeTruthy();
  });

  it('renders the BoxedIcon with the given icon name', () => {
    const { getByTestId } = render(<SetupHeader {...defaultProps} icon="star" />);
    expect(getByTestId('boxed-icon-star')).toBeTruthy();
  });

  it('passes iconBackgroundColor to BoxedIcon', () => {
    const { getByTestId } = render(
      <SetupHeader {...defaultProps} iconBackgroundColor="#ff0000" />,
    );
    const icon = getByTestId('boxed-icon-home');
    expect(icon.props.accessibilityLabel).toBe('#ff0000');
  });

  it('renders both header and description together', () => {
    const { getByTestId } = render(
      <SetupHeader
        header="Welcome"
        description="Get started here"
        icon="user"
        iconBackgroundColor="#green"
      />,
    );
    expect(getByTestId('text-Welcome')).toBeTruthy();
    expect(getByTestId('text-Get started here')).toBeTruthy();
  });

  it('accepts optional rightSideContainer style without crashing', () => {
    const { toJSON } = render(
      <SetupHeader {...defaultProps} rightSideContainer={{ margin: 5 }} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders with different icon names', () => {
    const { getByTestId } = render(<SetupHeader {...defaultProps} icon="calendar" />);
    expect(getByTestId('boxed-icon-calendar')).toBeTruthy();
  });

  it('renders header as string correctly even with special characters', () => {
    const { getByTestId } = render(
      <SetupHeader {...defaultProps} header="House & Guests" />,
    );
    expect(getByTestId('text-House & Guests')).toBeTruthy();
  });

  it('renders description as long text without crashing', () => {
    const longDesc = 'This is a very long description that spans multiple lines and should still render correctly in the component.';
    const { getByTestId } = render(
      <SetupHeader {...defaultProps} description={longDesc} />,
    );
    expect(getByTestId(`text-${longDesc}`)).toBeTruthy();
  });
});
