// ─── Mock declarations (before imports) ──────────────────────────────────────

const mockUseTreasuryRole = jest.fn();
jest.mock('../../../hooks/useTreasuryRole', () => ({
  useTreasuryRole: () => mockUseTreasuryRole(),
}));

const mockUseCurrentWeekRecord = jest.fn();
const mockUseFinancialRecords = jest.fn();
jest.mock('../../../state/queries/treasuryQueries', () => ({
  useCurrentWeekRecord: () => mockUseCurrentWeekRecord(),
  useFinancialRecords: () => mockUseFinancialRecords(),
}));

const mockUseData = jest.fn();
jest.mock('../../../context/DataContext', () => ({
  useData: () => mockUseData(),
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
  const { View, Text } = require('react-native');
  return ({ header }: any) => (
    <View testID="screen-header">
      <Text>{header}</Text>
    </View>
  );
});

jest.mock('../../../components/rats-text/rats-text', () => {
  const { Text } = require('react-native');
  return ({ text }: any) => <Text>{String(text ?? '')}</Text>;
});

jest.mock(
  '../../../components/rats-loading-indicator/rats-loading-indicator',
  () => {
    const { View } = require('react-native');
    return () => <View testID="loading-indicator" />;
  },
);

// ─── Imports ──────────────────────────────────────────────────────────────────

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TreasuryDashboard from '../TreasuryDashboard';
import { Routes } from '../../../navigation/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: any) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
};

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() } as any;

const defaultRole = {
  canCreate: false,
  canApprove: false,
  canViewDrafts: false,
  role: 'member',
  isLoading: false,
};

const defaultHouse = { id: 'house-1', name: 'Test House' };

const makeRecord = (overrides: Record<string, any> = {}) => ({
  id: 'rec-1',
  houseId: 'house-1',
  period: '2026-04-07',
  status: 'approved',
  totalIncome: 50000,
  totalExpenses: 30000,
  balance: 20000,
  beginningCheckingBalance: 100000,
  endingCheckingBalance: 120000,
  incomeLines: [],
  expenseLines: [],
  breakdown: [],
  submittedBy: 'user-1',
  submittedAt: new Date().toISOString(),
  approvedByVote: false,
  billsDue: [],
  ...overrides,
});

const setupDefaults = (
  roleOverrides: Record<string, any> = {},
  currentWeekData: any = null,
  recordsData: any[] = [],
) => {
  mockUseData.mockReturnValue({ currentHouse: defaultHouse });
  mockUseTreasuryRole.mockReturnValue({ ...defaultRole, ...roleOverrides });
  mockUseCurrentWeekRecord.mockReturnValue({
    data: currentWeekData,
    isLoading: false,
  });
  mockUseFinancialRecords.mockReturnValue({
    data: recordsData,
    isLoading: false,
  });
};

const renderScreen = () =>
  render(<TreasuryDashboard navigation={mockNavigation} />, {
    wrapper: makeWrapper(),
  });

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TreasuryDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading state when queries are loading', () => {
    mockUseData.mockReturnValue({ currentHouse: defaultHouse });
    mockUseTreasuryRole.mockReturnValue({ ...defaultRole, isLoading: true });
    mockUseCurrentWeekRecord.mockReturnValue({ data: null, isLoading: true });
    mockUseFinancialRecords.mockReturnValue({ data: [], isLoading: true });

    const { getByTestId } = renderScreen();
    expect(getByTestId('treasury-loading')).toBeTruthy();
  });

  it('renders stat cards with Checking Balance, Income, and Expenses', () => {
    const record = makeRecord({
      endingCheckingBalance: 120000,
      totalIncome: 50000,
      totalExpenses: 30000,
    });
    setupDefaults({}, record, []);

    const { getByTestId, getByText } = renderScreen();
    expect(getByTestId('stat-card-balance')).toBeTruthy();
    expect(getByTestId('stat-card-income')).toBeTruthy();
    expect(getByTestId('stat-card-expenses')).toBeTruthy();
    expect(getByText('$1200.00')).toBeTruthy();
    expect(getByText('$500.00')).toBeTruthy();
    expect(getByText('$300.00')).toBeTruthy();
  });

  it('shows "No report for this week" banner when no current week record', () => {
    setupDefaults({}, null, []);

    const { getByTestId } = renderScreen();
    expect(getByTestId('status-banner-no-record')).toBeTruthy();
  });

  it('shows "Approved" banner when current week record is approved', () => {
    const record = makeRecord({ status: 'approved' });
    setupDefaults({}, record, []);

    const { getByTestId } = renderScreen();
    expect(getByTestId('status-banner-approved')).toBeTruthy();
  });

  it('FAB is visible when canCreate is true (Comptroller)', () => {
    setupDefaults({ canCreate: true, role: 'comptroller' }, null, []);

    const { getByTestId } = renderScreen();
    expect(getByTestId('treasury-fab')).toBeTruthy();
  });

  it('FAB is hidden when canCreate is false (regular member)', () => {
    setupDefaults({ canCreate: false, role: 'member' }, null, []);

    const { queryByTestId } = renderScreen();
    expect(queryByTestId('treasury-fab')).toBeNull();
  });

  it('navigates to FinancialRecordDetail when record row is tapped', () => {
    const record = makeRecord({ id: 'rec-42', status: 'approved' });
    setupDefaults({}, null, [record]);

    const { getByTestId } = renderScreen();
    fireEvent.press(getByTestId('record-row-rec-42'));

    expect(mockNavigation.navigate).toHaveBeenCalledWith(
      Routes.FinancialRecordDetail,
      { recordId: 'rec-42', houseId: 'house-1' },
    );
  });

  it('navigates to FinancialRecordForm when "Create Report" button is pressed', () => {
    setupDefaults({ canCreate: true }, null, []);

    const { getByTestId } = renderScreen();
    fireEvent.press(getByTestId('btn-create-report'));

    expect(mockNavigation.navigate).toHaveBeenCalledWith(
      Routes.FinancialRecordForm,
      { houseId: 'house-1' },
    );
  });

  it('navigates to FinancialRecordForm when FAB is pressed', () => {
    setupDefaults({ canCreate: true }, null, []);

    const { getByTestId } = renderScreen();
    fireEvent.press(getByTestId('treasury-fab'));

    expect(mockNavigation.navigate).toHaveBeenCalledWith(
      Routes.FinancialRecordForm,
      { houseId: 'house-1' },
    );
  });
});
