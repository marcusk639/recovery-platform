// src/screens/DrugTesting/__tests__/DrugTestingScreen.test.tsx
import React from 'react';
import { StyleSheet as InsetStyleSheet } from 'react-native';
// The module object itself: an `import * as` namespace is a copy, which a spy would miss.
const SafeArea = require('react-native-safe-area-context');
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DrugTestingScreen from '../DrugTestingScreen';

jest.mock('../../../state/queries/drugTestQueries', () => ({
  useHouseDrugTests: jest.fn(),
}));

jest.mock('../../../components/rats-text/rats-text', () => {
  const { Text } = require('react-native');
  return ({ text }: any) => <Text>{String(text ?? '')}</Text>;
});

jest.mock(
  '../../../components/rats-loading-indicator/rats-loading-indicator',
  () => {
    const { View } = require('react-native');
    return () => <View testID="rats-loading-indicator" />;
  },
);

jest.mock('../../../context/DataContext', () => ({
  useData: () => ({
    currentHouse: { id: 'house-1', name: 'Test House' },
  }),
}));

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

import { useHouseDrugTests } from '../../../state/queries/drugTestQueries';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

describe('DrugTestingScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders loading state', () => {
    (useHouseDrugTests as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: true,
    });
    const { getByTestId } = render(<DrugTestingScreen />, { wrapper });
    expect(getByTestId('loading-indicator')).toBeTruthy();
  });

  it('renders drug test list when data loaded', async () => {
    (useHouseDrugTests as jest.Mock).mockReturnValue({
      data: [
        {
          id: 'test-1',
          guestId: 'guest-1',
          result: 'negative',
          testDate: '2026-04-01',
          testType: 'urine',
          observerName: 'Jane Admin',
          isRandom: true,
          substancesDetected: [],
          escalationTriggered: false,
        },
      ],
      isLoading: false,
    });
    const { findAllByText, findByText } = render(<DrugTestingScreen />, {
      wrapper,
    });
    // 'Negative' appears in both the filter pill and the result badge
    const negativeEls = await findAllByText('Negative');
    expect(negativeEls.length).toBeGreaterThanOrEqual(1);
    expect(await findByText('Jane Admin')).toBeTruthy();
  });

  it('navigates to log form on FAB press', () => {
    (useHouseDrugTests as jest.Mock).mockReturnValue({
      data: [],
      isLoading: false,
    });
    const { getByTestId } = render(<DrugTestingScreen />, { wrapper });
    fireEvent.press(getByTestId('fab-log-test'));
    expect(mockNavigate).toHaveBeenCalledWith('drugTestForm', {});
  });
});

describe('DrugTestingScreen bottom inset (Android edge-to-edge)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('lifts the FAB by the bottom safe-area inset', () => {
    jest
      .spyOn(SafeArea, 'useSafeAreaInsets')
      .mockReturnValue({ top: 0, right: 0, bottom: 48, left: 0 });
    (useHouseDrugTests as jest.Mock).mockReturnValue({ data: [], isLoading: false });
    const { getByTestId } = render(<DrugTestingScreen />, { wrapper });

    expect(InsetStyleSheet.flatten(getByTestId('fab-log-test').props.style)).toEqual(
      expect.objectContaining({ position: 'absolute', bottom: 30, marginBottom: 48 }),
    );
  });
});
