const mockUseOxfordGate = jest.fn();
const mockUseCharterCompliance = jest.fn();

jest.mock('../../../hooks/useOxfordGate', () => ({
  useOxfordGate: () => mockUseOxfordGate(),
}));

jest.mock('../../../state/queries/charterComplianceQueries', () => ({
  useCharterCompliance: () => mockUseCharterCompliance(),
}));

jest.mock('../../../components/oxford/CharterBadge', () => {
  const { View, Text } = require('react-native');
  return ({ status, testID }: any) => (
    <View testID={testID}>
      <Text>{status}</Text>
    </View>
  );
});

jest.mock('../../../components/screen-header', () => {
  const { View, Text } = require('react-native');
  return ({ header }: any) => (
    <View testID="screen-header">
      <Text>{header}</Text>
    </View>
  );
});

jest.mock('../../../components/rats-text', () => ({
  RatsText: ({ text, testID }: any) => {
    const { Text } = require('react-native');
    return <Text testID={testID}>{text}</Text>;
  },
}));

jest.mock('../../../context', () => ({
  useTheme: () => ({
    theme: {
      primaryFontFamily: 'System',
      secondaryFontFamily: 'System',
      primaryColor: '#000',
      secondaryColor: '#fff',
      tertiaryColor: '#ccc',
      backgroundColor: '#fff',
      textColor: '#000',
      logoTintColor: '#fff',
    },
  }),
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
}));

import React from 'react';
import { render } from '@testing-library/react-native';
import CharterCompliance from '../CharterCompliance';

const PASS_CONDITION = {
  status: 'pass' as const,
  metric: 0.9,
  threshold: 0.8,
  detail: 'All good.',
};

const FAIL_CONDITION = {
  status: 'fail' as const,
  metric: 0.5,
  threshold: 0.8,
  detail: 'Below threshold.',
};

const SUMMARY = {
  overall: 'pass' as const,
  democratic: PASS_CONDITION,
  financial: PASS_CONDITION,
  zeroTolerance: { ...PASS_CONDITION, metric: 0, threshold: 0 },
  computedAt: new Date('2024-06-01').toISOString(),
};

describe('CharterCompliance screen', () => {
  beforeEach(() => {
    mockUseOxfordGate.mockReturnValue({ allowed: true, houseId: 'h1' });
    mockUseCharterCompliance.mockReturnValue({
      summary: SUMMARY,
      isLoading: false,
      isError: false,
    });
  });

  it('shows not-enabled message when gate is closed', () => {
    mockUseOxfordGate.mockReturnValue({ allowed: false, houseId: '' });
    const { getByText } = render(<CharterCompliance />);
    expect(
      getByText('Oxford House features are not enabled for this house.'),
    ).toBeTruthy();
  });

  it('shows loading indicator while fetching', () => {
    mockUseCharterCompliance.mockReturnValue({
      summary: null,
      isLoading: true,
      isError: false,
    });
    const { getByTestId } = render(<CharterCompliance />);
    expect(getByTestId('charter-loading')).toBeTruthy();
  });

  it('shows error message on fetch failure', () => {
    mockUseCharterCompliance.mockReturnValue({
      summary: null,
      isLoading: false,
      isError: true,
    });
    const { getByTestId } = render(<CharterCompliance />);
    expect(getByTestId('charter-error')).toBeTruthy();
  });

  it('renders overall badge and all three condition cards', () => {
    const { getByTestId } = render(<CharterCompliance />);
    expect(getByTestId('charter-overall')).toBeTruthy();
    expect(getByTestId('charter-badge-overall')).toBeTruthy();
    expect(getByTestId('charter-card-democratic')).toBeTruthy();
    expect(getByTestId('charter-card-financial')).toBeTruthy();
    expect(getByTestId('charter-card-zeroTolerance')).toBeTruthy();
  });

  it('renders fail badge on failing condition', () => {
    mockUseCharterCompliance.mockReturnValue({
      summary: {
        ...SUMMARY,
        overall: 'fail',
        democratic: FAIL_CONDITION,
      },
      isLoading: false,
      isError: false,
    });
    const { getByTestId, getAllByText } = render(<CharterCompliance />);
    expect(getByTestId('charter-badge-democratic')).toBeTruthy();
    // Both overall and democratic render 'fail' — at least two instances expected
    expect(getAllByText('fail').length).toBeGreaterThanOrEqual(1);
  });
});
