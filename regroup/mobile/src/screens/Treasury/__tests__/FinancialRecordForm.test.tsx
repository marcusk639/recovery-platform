// ─── Mock declarations (before imports) ──────────────────────────────────────

const mockGoBack = jest.fn();
const mockUseRoute = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useRoute: () => mockUseRoute(),
  useNavigation: () => ({ goBack: mockGoBack }),
}));

const mockUseData = jest.fn();
jest.mock('../../../context/DataContext', () => ({
  useData: () => mockUseData(),
}));

const mockUsePreviousWeekRecord = jest.fn();
const mockUseEESIncomeForWeek = jest.fn();
const mockUseCreateFinancialRecord = jest.fn();
const mockUseUpdateFinancialRecord = jest.fn();
jest.mock('../../../state/queries/treasuryQueries', () => ({
  usePreviousWeekRecord: () => mockUsePreviousWeekRecord(),
  useEESIncomeForWeek: () => mockUseEESIncomeForWeek(),
  useCreateFinancialRecord: () => mockUseCreateFinancialRecord(),
  useUpdateFinancialRecord: () => mockUseUpdateFinancialRecord(),
}));

jest.mock('../../../services/treasury', () => ({
  getFinancialRecord: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../../components/rats-text/rats-text', () => {
  const { Text } = require('react-native');
  return ({ text }: any) => <Text>{String(text ?? '')}</Text>;
});

jest.mock('../../../components/screen-header/screen-header', () => {
  const { View, Text } = require('react-native');
  return ({ header }: any) => (
    <View>
      <Text>{header}</Text>
    </View>
  );
});

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

// ─── Imports ──────────────────────────────────────────────────────────────────

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FinancialRecordForm from '../FinancialRecordForm';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: any) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
};

const mockMutateAsync = jest
  .fn()
  .mockResolvedValue({ id: 'new-rec', houseId: 'house-1' });

const setupDefaults = (overrides: Record<string, any> = {}) => {
  mockUseRoute.mockReturnValue({
    params: { houseId: 'house-1', ...overrides },
  });
  mockUseData.mockReturnValue({ currentUser: { id: 'user-1' } });
  mockUsePreviousWeekRecord.mockReturnValue({ data: null, isLoading: false });
  mockUseEESIncomeForWeek.mockReturnValue({ data: 0, isLoading: false });
  mockUseCreateFinancialRecord.mockReturnValue({
    mutateAsync: mockMutateAsync,
    isPending: false,
  });
  mockUseUpdateFinancialRecord.mockReturnValue({
    mutateAsync: jest.fn().mockResolvedValue({}),
    isPending: false,
  });
};

const renderScreen = () =>
  render(<FinancialRecordForm />, { wrapper: makeWrapper() });

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FinancialRecordForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaults();
  });

  it('renders income and expense section headers', () => {
    const { getByText } = renderScreen();
    expect(getByText('Cash & Receipts from Members')).toBeTruthy();
    expect(getByText('Amount Paid Out')).toBeTruthy();
  });

  it('"Add Income Line" button adds a row', () => {
    const { getByTestId, getAllByTestId } = renderScreen();

    const addBtn = getByTestId('btn-add-income');
    fireEvent.press(addBtn);

    expect(getAllByTestId(/^income-row-/)).toHaveLength(2);
  });

  it('"Add Expense Line" button adds a row', () => {
    const { getByTestId, getAllByTestId } = renderScreen();

    const addBtn = getByTestId('btn-add-expense');
    fireEvent.press(addBtn);

    expect(getAllByTestId(/^expense-row-/)).toHaveLength(2);
  });

  it('summary footer auto-calculates totals', () => {
    const { getByTestId, getByText } = renderScreen();

    // Enter $100.00 into first income amount
    fireEvent.changeText(getByTestId('income-amount-0'), '100.00');
    // Enter $40.00 into first expense amount
    fireEvent.changeText(getByTestId('expense-amount-0'), '40.00');

    // Ending balance = 0 beginning + 10000 income - 4000 expenses = 6000 cents = $60.00
    expect(getByText('$60.00')).toBeTruthy();
  });

  it('"Save Draft" calls createFinancialRecord with status="draft"', async () => {
    const { getByTestId } = renderScreen();

    await act(async () => {
      fireEvent.press(getByTestId('btn-save-draft'));
    });

    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        houseId: 'house-1',
        record: expect.objectContaining({ status: 'draft' }),
      }),
    );
  });

  it('EES pre-fill banner is shown when EES data exists', () => {
    mockUseEESIncomeForWeek.mockReturnValue({ data: 5000, isLoading: false });

    const { getByTestId } = renderScreen();
    expect(getByTestId('ees-banner')).toBeTruthy();
  });

  it('pressing "Add" in EES banner inserts an EES income line', () => {
    mockUseEESIncomeForWeek.mockReturnValue({ data: 7500, isLoading: false });

    const { getByTestId, getAllByTestId } = renderScreen();
    const countBefore = getAllByTestId(/^income-row-/).length;

    fireEvent.press(getByTestId('btn-ees-add'));

    expect(getAllByTestId(/^income-row-/).length).toBe(countBefore + 1);
  });

  it('pre-fills beginning balance from previous week ending balance', () => {
    mockUsePreviousWeekRecord.mockReturnValue({
      data: { endingCheckingBalance: 25000 },
      isLoading: false,
    });

    const { getByTestId } = renderScreen();
    // 25000 cents = $250.00
    expect(getByTestId('input-beginning-balance').props.value).toBe('250.00');
  });
});
