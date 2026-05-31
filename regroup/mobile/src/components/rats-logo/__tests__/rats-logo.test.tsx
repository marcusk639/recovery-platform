/**
 * Tests for RatsLogo and RatsLogoHorizontal components
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { Image } from 'react-native';

// ── mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../../styles/theme', () => ({
  normalize: (n: number) => n,
  color: { light_grey: '#eee', baby_blue: '#89cff0', black: '#000', white: '#fff', grey: '#aaa', dark_grey: '#555', red: '#f00', green: '#0f0', medium_grey: '#999' },
  fontSize: { regular: 14, regular_medium: 16, medium: 15, large: 18, small: 12, larger: 22, extraLarge: 24 },
  fontFamily: { roboto: 'Roboto', bold: 'Roboto-Bold', timesNewRoman: 'TimesNewRoman' },
  ROW: { flexDirection: 'row' as const },
  CARD_STYLE: {},
  tabBarStyle: {},
  elevateStyle: {},
  themes: { default: { primaryColor: '#000' } },
  windowHeight: 800,
  useThemeHook: () => ({ primaryColor: '#000' }),
}));

jest.mock('../../../context', () => ({
  useTheme: () => ({ theme: { primaryColor: '#007AFF' } }),
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
}));

// withRats HOC — pass through
jest.mock('../../rats-hoc', () => ({
  withRats: (C: any) => {
    const Wrapped = (props: any) => {
      const t = (k: string) => k;
      const theme = { primaryColor: '#007AFF' };
      return C({ ...props, t, theme });
    };
    return Wrapped;
  },
}));

jest.mock('react-native-vector-icons/MaterialIcons', () => 'MaterialIcon');

// assets
jest.mock('../../../../assets', () => ({
  circleLogo: 1,
  appIcon: 2,
}));

jest.mock('../../rats-text', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return { RatsText: ({ text }: any) => <Text testID={`text-${text}`}>{text}</Text> };
});

import { RatsLogo, RatsLogoHorizontal } from '../index';

describe('RatsLogo', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<RatsLogo />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders an Image element', () => {
    const { UNSAFE_getAllByType } = render(<RatsLogo />);
    const images = UNSAFE_getAllByType(Image);
    expect(images.length).toBeGreaterThan(0);
  });

  it('renders the "Regroup" logo name text', () => {
    const { getByTestId } = render(<RatsLogo />);
    expect(getByTestId('text-Regroup')).toBeTruthy();
  });

  it('does NOT render description by default (displayDescription absent)', () => {
    const { queryByTestId } = render(<RatsLogo />);
    // logo.description key should NOT appear unless displayDescription is true
    expect(queryByTestId('text-logo.description')).toBeNull();
  });

  it('renders description when displayDescription is true', () => {
    const { getByTestId } = render(<RatsLogo displayDescription />);
    expect(getByTestId('text-logo.description')).toBeTruthy();
  });

  it('accepts a custom imageStyle without crashing', () => {
    const { toJSON } = render(<RatsLogo imageStyle={{ height: 100, width: 100 }} />);
    expect(toJSON()).toBeTruthy();
  });

  it('accepts a custom logoNameStyle without crashing', () => {
    const { toJSON } = render(<RatsLogo logoNameStyle={{ color: 'red' }} />);
    expect(toJSON()).toBeTruthy();
  });

  it('accepts a custom logoDescriptionStyle without crashing', () => {
    const { toJSON } = render(
      <RatsLogo displayDescription logoDescriptionStyle={{ color: 'blue' }} />,
    );
    expect(toJSON()).toBeTruthy();
  });
});

describe('RatsLogoHorizontal', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<RatsLogoHorizontal imageStyle={{}} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders an Image element', () => {
    const { UNSAFE_getAllByType } = render(<RatsLogoHorizontal imageStyle={{}} />);
    const images = UNSAFE_getAllByType(Image);
    expect(images.length).toBeGreaterThan(0);
  });

  it('renders the "Regroup" text', () => {
    const { getByTestId } = render(<RatsLogoHorizontal imageStyle={{}} />);
    expect(getByTestId('text-Regroup')).toBeTruthy();
  });

  it('renders the description text (logo.description key)', () => {
    const { getByTestId } = render(<RatsLogoHorizontal imageStyle={{}} />);
    expect(getByTestId('text-logo.description')).toBeTruthy();
  });

  it('accepts a containerStyle prop without crashing', () => {
    const { toJSON } = render(
      <RatsLogoHorizontal imageStyle={{}} containerStyle={{ margin: 10 }} />,
    );
    expect(toJSON()).toBeTruthy();
  });
});
