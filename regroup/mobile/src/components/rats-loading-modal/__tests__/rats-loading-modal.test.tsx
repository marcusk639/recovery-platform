/**
 * Tests for RatsLoadingModal component
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
  CARD_STYLE: {},
  tabBarStyle: {},
  elevateStyle: {},
  themes: { default: { primaryColor: '#000' } },
  windowHeight: 800,
}));

jest.mock('../../../context', () => ({
  useTheme: () => ({ theme: { primaryColor: '#000' } }),
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

jest.mock('react-native-modal', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children, isVisible }: any) =>
      isVisible ? <View testID="modal">{children}</View> : null,
  };
});

jest.mock('react-native-vector-icons/FontAwesome5', () => {
  const React = require('react');
  const { View } = require('react-native');
  return (props: any) => <View testID={`fa5-${props.name}`} />;
});

jest.mock('../../rats-loading-indicator/rats-loading-indicator', () => {
  const React = require('react');
  const { View } = require('react-native');
  return () => <View testID="loading-indicator" />;
});

jest.mock('../../rats-text', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return { RatsText: ({ text }: any) => <Text testID={`text-${text}`}>{text}</Text> };
});

// withRats HOC — pass through
jest.mock('../../rats-hoc', () => ({
  withRats: (C: any) => C,
}));

import RatsLoadingModal from '../index';

const baseProps = {
  isVisible: true,
  loading: true,
  loadingMessage: 'Saving...',
  success: false,
  error: '',
};

describe('RatsLoadingModal', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<RatsLoadingModal {...baseProps} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders the modal when isVisible is true', () => {
    const { getByTestId } = render(<RatsLoadingModal {...baseProps} />);
    expect(getByTestId('modal')).toBeTruthy();
  });

  it('does NOT render the modal when isVisible is false', () => {
    const { queryByTestId } = render(
      <RatsLoadingModal {...baseProps} isVisible={false} />,
    );
    expect(queryByTestId('modal')).toBeNull();
  });

  it('shows the loading indicator while loading and no error', () => {
    const { getByTestId } = render(<RatsLoadingModal {...baseProps} />);
    expect(getByTestId('loading-indicator')).toBeTruthy();
  });

  it('shows the loading message while loading', () => {
    const { getByTestId } = render(<RatsLoadingModal {...baseProps} loadingMessage="Please wait" />);
    expect(getByTestId('text-Please wait')).toBeTruthy();
  });

  it('does NOT show loading indicator when loading is false', () => {
    const { queryByTestId } = render(
      <RatsLoadingModal {...baseProps} loading={false} />,
    );
    expect(queryByTestId('loading-indicator')).toBeNull();
  });

  it('shows success text when loading=false and no error', () => {
    const { getByTestId } = render(
      <RatsLoadingModal {...baseProps} loading={false} success error="" />,
    );
    expect(getByTestId('text-success')).toBeTruthy();
  });

  it('shows a check-circle icon on success', () => {
    const { getByTestId } = render(
      <RatsLoadingModal {...baseProps} loading={false} success error="" />,
    );
    expect(getByTestId('fa5-check-circle')).toBeTruthy();
  });

  it('shows error text when loading=false and error is set', () => {
    const { getByTestId } = render(
      <RatsLoadingModal {...baseProps} loading={false} error="Something went wrong" />,
    );
    expect(getByTestId('text-Something went wrong')).toBeTruthy();
  });

  it('shows times-circle icon on error', () => {
    const { getByTestId } = render(
      <RatsLoadingModal {...baseProps} loading={false} error="Oops" />,
    );
    expect(getByTestId('fa5-times-circle')).toBeTruthy();
  });

  it('renders errorTemplate when provided on error', () => {
    const errorTemplate = () => {
      const { View } = require('react-native');
      return <View testID="error-template" />;
    };
    const { getByTestId } = render(
      <RatsLoadingModal
        {...baseProps}
        loading={false}
        error="Oops"
        errorTemplate={errorTemplate}
      />,
    );
    expect(getByTestId('error-template')).toBeTruthy();
  });

  it('does NOT show loading indicator when there is an error (loading=true)', () => {
    const { queryByTestId } = render(
      <RatsLoadingModal {...baseProps} loading={true} error="Err" />,
    );
    expect(queryByTestId('loading-indicator')).toBeNull();
  });
});
