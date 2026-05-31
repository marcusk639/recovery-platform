import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Share } from 'react-native';
import PaymentDashboard from '../../../screens/HouseSettings/PaymentDashboard';

jest.mock('victory-native', () => ({
  VictoryBar: () => null,
  VictoryChart: ({ children }: any) => children,
  VictoryAxis: () => null,
  VictoryTheme: { material: {} },
}));

jest.mock('../../../state/queries/paymentQueries', () => ({
  paymentKeys: {
    housePayments: (id: string) => ['payments', 'house', id],
    failed: (id: string) => ['payments', 'failed', id],
  },
  useFailedPayments: () => ({ data: [] }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: [
      {
        id: 'p1',
        amount: 50000,
        currency: 'usd',
        status: 'succeeded' as const,
        description: 'Rent Payment',
        createdAt: '2026-05-01T12:00:00Z',
        guestId: 'g1',
        houseId: 'house-1',
      },
    ],
    isLoading: false,
    error: null,
  }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    canGoBack: jest.fn(() => false),
  }),
}));

jest.mock('../../../hooks/useSelectedHouse', () => ({
  useSelectedHouse: () => ({ house: { id: 'house-1' } }),
}));

jest.mock('../../../state/store', () => ({
  useAppSelector: (selector: any) =>
    selector({
      guests: {
        guests: {
          g1: { id: 'g1', firstName: 'Alice', lastName: 'Smith', rentOwed: 0 },
        },
      },
    }),
}));

const mockNavigation = { navigate: jest.fn(), replace: jest.fn() } as any;

describe('PaymentDashboard — CSV Export', () => {
  beforeEach(() => {
    jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: Share.sharedAction });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the export button', () => {
    const { getByTestId } = render(
      <PaymentDashboard navigation={mockNavigation} />,
    );
    expect(getByTestId('csv-export-button')).toBeTruthy();
  });

  it('calls Share.share with CSV content on press', async () => {
    const { getByTestId } = render(
      <PaymentDashboard navigation={mockNavigation} />,
    );
    fireEvent.press(getByTestId('csv-export-button'));
    await waitFor(() => {
      expect(Share.share).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(
            'Date,Guest Name,Amount,Status,Type',
          ),
        }),
      );
    });
  });
});
