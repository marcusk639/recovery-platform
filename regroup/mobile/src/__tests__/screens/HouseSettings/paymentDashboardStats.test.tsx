/**
 * PaymentDashboard stats aggregation tests.
 *
 * Covers the single-pass useMemo that derives totalCollected, totalOutstanding,
 * and collectionRate from filteredPayments (replaced three inline
 * .filter().reduce() chains that recomputed on every render).
 *
 * Key cases:
 *  - Mixed statuses: succeeded → Collected, pending → Outstanding, failed
 *    excluded from both AND from collectionRate denominator
 *  - All failed: collectionRate is 0% (regression: avoid division-by-zero)
 *  - Empty: all values are 0
 *  - Only succeeded: rate is 100%
 */

// Use a date inside the current month so the default `dateFilter='month'`
// includes every fixture payment.
const RECENT = new Date().toISOString();

let mockPayments: Array<{
  id: string;
  amount: number;
  status: 'succeeded' | 'pending' | 'failed';
  createdAt: string;
  guestId: string;
  houseId: string;
  description?: string;
}> = [];

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
  useQuery: () => ({ data: mockPayments, isLoading: false, error: null }),
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
  useAppSelector: (selector: any) => selector({ guests: { guests: {} } }),
}));

import React from 'react';
import { render, within } from '@testing-library/react-native';
import PaymentDashboard from '../../../screens/HouseSettings/PaymentDashboard';

const mockNavigation = { navigate: jest.fn(), replace: jest.fn() } as any;

const payment = (
  id: string,
  status: 'succeeded' | 'pending' | 'failed',
  amount: number,
) => ({
  id,
  amount,
  status,
  createdAt: RECENT,
  guestId: `g-${id}`,
  houseId: 'house-1',
  description: 'Rent',
});

describe('PaymentDashboard — stats aggregation', () => {
  // Scope text queries to the stats card so we don't collide with chart axis
  // labels or per-payment list items that may render the same dollar value.
  const renderAndGetStats = () => {
    const utils = render(<PaymentDashboard navigation={mockNavigation} />);
    return within(utils.getByTestId('payment-stats-card'));
  };

  it('sums succeeded amounts into Collected, pending into Outstanding', () => {
    mockPayments = [
      payment('p1', 'succeeded', 30000), // $300
      payment('p2', 'succeeded', 20000), // $200
      payment('p3', 'pending', 15000), // $150
      payment('p4', 'pending', 10000), // $100
    ];

    const stats = renderAndGetStats();
    expect(stats.getByText('$500.00')).toBeTruthy(); // Collected (300 + 200)
    expect(stats.getByText('$250.00')).toBeTruthy(); // Outstanding (150 + 100)
  });

  it('excludes failed payments from both totals AND from the collectionRate denominator', () => {
    // 2 succeeded ($100 + $100 = $200), 1 pending ($50), 5 failed.
    // Failed should not appear anywhere. Rate: 2 / (2+1) = 67%.
    mockPayments = [
      payment('p1', 'succeeded', 10000),
      payment('p2', 'succeeded', 10000),
      payment('p3', 'pending', 5000),
      payment('p4', 'failed', 99999),
      payment('p5', 'failed', 99999),
      payment('p6', 'failed', 99999),
      payment('p7', 'failed', 99999),
      payment('p8', 'failed', 99999),
    ];

    const stats = renderAndGetStats();
    expect(stats.getByText('$200.00')).toBeTruthy(); // Collected — failed excluded
    expect(stats.getByText('$50.00')).toBeTruthy(); // Outstanding
    expect(stats.getByText('67%')).toBeTruthy(); // 2/3 = 67% (failed not in denominator)
  });

  it('returns 0% collectionRate when all actionable payments are absent (only failed)', () => {
    // Regression: when actionableCount is 0 the formula divides 0/0 which
    // would yield NaN. The useMemo branch returns 0 explicitly.
    mockPayments = [
      payment('p1', 'failed', 10000),
      payment('p2', 'failed', 20000),
    ];

    const stats = renderAndGetStats();
    // Both Collected and Outstanding render as $0.00 — assert at least two.
    expect(stats.getAllByText('$0.00').length).toBe(2);
    expect(stats.getByText('0%')).toBeTruthy(); // Rate — not NaN
  });

  it('returns all zeros when there are no payments', () => {
    mockPayments = [];

    const stats = renderAndGetStats();
    expect(stats.getAllByText('$0.00').length).toBe(2);
    expect(stats.getByText('0%')).toBeTruthy();
  });

  it('returns 100% collectionRate when every actionable payment succeeded', () => {
    mockPayments = [
      payment('p1', 'succeeded', 10000),
      payment('p2', 'succeeded', 10000),
      payment('p3', 'succeeded', 10000),
    ];

    const stats = renderAndGetStats();
    expect(stats.getByText('$300.00')).toBeTruthy();
    expect(stats.getByText('100%')).toBeTruthy();
  });
});
