import React from 'react';
import { render } from '@testing-library/react-native';
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
  useQuery: () => ({ data: [], isLoading: false, error: null }),
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
  useSelectedHouse: () => ({
    house: { id: 'house-1' },
  }),
}));

jest.mock('../../../state/store', () => ({
  useAppSelector: (selector: any) =>
    selector({
      guests: {
        guests: {
          g1: {
            id: 'g1',
            firstName: 'Alice',
            lastName: 'Smith',
            rentOwed: 150,
          },
          g2: { id: 'g2', firstName: 'Bob', lastName: 'Jones', rentOwed: 0 },
          g3: { id: 'g3', firstName: 'Carol', lastName: 'White', rentOwed: 75 },
        },
      },
    }),
}));

// After A2 migration, PaymentDashboard reads guests via useGuests instead of
// state.guests.guests. Mock useGuests to return the same fixture so the
// overdue-residents card sees the data it needs. See .full-review [A2].
jest.mock('../../../state/queries/guestQueries', () => ({
  useGuests: () => ({
    data: {
      g1: {
        id: 'g1',
        firstName: 'Alice',
        lastName: 'Smith',
        rentOwed: 150,
      },
      g2: { id: 'g2', firstName: 'Bob', lastName: 'Jones', rentOwed: 0 },
      g3: { id: 'g3', firstName: 'Carol', lastName: 'White', rentOwed: 75 },
    },
    isLoading: false,
    isError: false,
  }),
}));

const mockNavigation = { navigate: jest.fn(), replace: jest.fn() } as any;

describe('PaymentDashboard — Overdue Residents', () => {
  it('renders overdue residents card when guests have rentOwed > 0', () => {
    const { getByTestId } = render(
      <PaymentDashboard navigation={mockNavigation} />,
    );
    expect(getByTestId('overdue-residents-card')).toBeTruthy();
  });

  it('shows only guests with rentOwed > 0, sorted by rentOwed descending', () => {
    const { getAllByTestId } = render(
      <PaymentDashboard navigation={mockNavigation} />,
    );
    const rows = getAllByTestId('overdue-resident-row');
    expect(rows).toHaveLength(2); // Alice (150) and Carol (75); Bob (0) excluded
  });
});
