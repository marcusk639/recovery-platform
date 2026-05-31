jest.mock('../../../hooks/useSelectedHouse', () => ({
  useSelectedHouse: jest.fn(),
}));
jest.mock('../../../state/queries/guestQueries', () => ({
  useGuests: jest.fn(),
}));
jest.mock('../../../state/queries/reportingQueries', () => ({
  useOccupancyReport: jest.fn(),
  useComplianceTrend: jest.fn(),
  useDischargeReport: jest.fn(),
}));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));
jest.mock('../../../context', () => ({
  useTheme: () => ({
    theme: {
      primaryColor: '#638BFA',
      secondaryColor: '#d2d8ef',
      tertiaryColor: '#969696',
      backgroundColor: '#FAFAFA',
      textColor: 'black',
      primaryFontFamily: 'Quicksand-Medium',
      secondaryFontFamily: 'Quicksand-Medium',
      logoTintColor: '#ffffff',
    },
  }),
  useTranslation: () => ({ t: (k: string) => k }),
}));
jest.mock('../../../components/screen-header', () => {
  const { View } = require('react-native');
  return ({ header }: any) => <View testID="screen-header" />;
});
jest.mock('../../../components/rats-text', () => {
  const { Text } = require('react-native');
  return {
    RatsText: ({ text, testID }: any) => (
      <Text testID={testID}>{String(text ?? '')}</Text>
    ),
  };
});
jest.mock(
  '../../../components/rats-loading-indicator/rats-loading-indicator',
  () => {
    const { View } = require('react-native');
    return ({ testID }: any) => <View testID={testID ?? 'loading-indicator'} />;
  },
);

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { useSelectedHouse } from '../../../hooks/useSelectedHouse';
import { useGuests } from '../../../state/queries/guestQueries';
import {
  useOccupancyReport,
  useComplianceTrend,
  useDischargeReport,
} from '../../../state/queries/reportingQueries';
import AdminReportScreen from '../AdminReportScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() } as any;

const defaultOccupancy = {
  activeCount: 5,
  capacity: 8,
  occupancyPct: 63,
};

const defaultCompliance = {
  weeks: [
    { weekStart: '2026-05-10', choreRate: 0.9, meetingRate: 0.85 },
    { weekStart: '2026-05-17', choreRate: 0.7, meetingRate: 0.6 },
  ],
};

const defaultDischarge = {
  count: 1,
  residents: [
    { id: 'g99', displayName: 'John Doe', movedOutDate: '2026-05-01' },
  ],
};

const defaultGuests = {
  g1: { id: 'g1', status: 'active', displayName: 'Alice' },
  g2: { id: 'g2', status: 'active', displayName: 'Bob' },
  g99: { id: 'g99', status: 'discharged', displayName: 'John Doe' },
};

function setupMocks(overrides: Record<string, any> = {}) {
  (useSelectedHouse as jest.Mock).mockReturnValue({
    house: { maximumCapacity: 8 },
    houseId: 'house-1',
    isLoading: false,
    ...overrides.useSelectedHouse,
  });
  (useGuests as jest.Mock).mockReturnValue({
    data:
      overrides.guestsData !== undefined ? overrides.guestsData : defaultGuests,
    isLoading: overrides.guestsLoading ?? false,
  });
  (useOccupancyReport as jest.Mock).mockReturnValue({
    data:
      overrides.occupancy !== undefined
        ? overrides.occupancy
        : defaultOccupancy,
    isLoading: overrides.occLoading ?? false,
  });
  (useComplianceTrend as jest.Mock).mockReturnValue({
    data:
      overrides.compliance !== undefined
        ? overrides.compliance
        : defaultCompliance,
    isLoading: overrides.compLoading ?? false,
  });
  (useDischargeReport as jest.Mock).mockReturnValue({
    data:
      overrides.discharge !== undefined
        ? overrides.discharge
        : defaultDischarge,
    isLoading: overrides.disLoading ?? false,
  });
}

describe('AdminReportScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
  });

  it('renders all three sections', () => {
    const { getByTestId } = render(
      <AdminReportScreen navigation={mockNavigation} />,
    );
    expect(getByTestId('occupancy-section')).toBeTruthy();
    expect(getByTestId('compliance-section')).toBeTruthy();
    expect(getByTestId('discharge-section')).toBeTruthy();
  });

  it('shows loading indicator when guestsLoading is true', () => {
    setupMocks({ guestsLoading: true });
    const { getByTestId } = render(
      <AdminReportScreen navigation={mockNavigation} />,
    );
    expect(getByTestId('report-loading')).toBeTruthy();
  });

  it('displays occupancy ratio and percentage', () => {
    const { getByTestId } = render(
      <AdminReportScreen navigation={mockNavigation} />,
    );
    expect(getByTestId('occupancy-ratio').props.children).toBe('5 / 8');
    expect(getByTestId('occupancy-pct').props.children).toBe('(63%)');
  });

  it('renders a row for each compliance week', () => {
    const { getByTestId } = render(
      <AdminReportScreen navigation={mockNavigation} />,
    );
    expect(getByTestId('week-row-2026-05-10')).toBeTruthy();
    expect(getByTestId('week-row-2026-05-17')).toBeTruthy();
  });

  it('shows chore rate text correctly', () => {
    const { getByTestId } = render(
      <AdminReportScreen navigation={mockNavigation} />,
    );
    expect(getByTestId('chore-rate-2026-05-10').props.children).toBe('90%');
    expect(getByTestId('chore-rate-2026-05-17').props.children).toBe('70%');
  });

  it('renders discharged resident rows', () => {
    const { getByTestId } = render(
      <AdminReportScreen navigation={mockNavigation} />,
    );
    expect(getByTestId('discharge-row-g99')).toBeTruthy();
  });

  it('shows empty message when discharge.count === 0', () => {
    setupMocks({ discharge: { count: 0, residents: [] } });
    const { getByTestId } = render(
      <AdminReportScreen navigation={mockNavigation} />,
    );
    expect(getByTestId('discharge-empty')).toBeTruthy();
  });

  it('period toggle buttons exist and are pressable', () => {
    const { getByTestId } = render(
      <AdminReportScreen navigation={mockNavigation} />,
    );
    const btn60 = getByTestId('period-btn-60');
    expect(btn60).toBeTruthy();
    fireEvent.press(btn60);
    // After pressing 60d, useDischargeReport should be called with period 60
    expect(useDischargeReport).toHaveBeenCalledWith(
      'house-1',
      expect.any(Array),
      60,
      true,
    );
  });

  it('shows "no compliance data" text when compliance.weeks is empty', () => {
    setupMocks({ compliance: { weeks: [] } });
    const { getByText } = render(
      <AdminReportScreen navigation={mockNavigation} />,
    );
    expect(getByText('No compliance data for the last 4 weeks.')).toBeTruthy();
  });
});
