// src/screens/DrugTesting/__tests__/DrugTestForm.test.tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DrugTestForm from '../DrugTestForm';

jest.mock('../../../state/queries/drugTestQueries', () => ({
  useLogDrugTest: jest.fn(),
}));

jest.mock('../../../components/rats-text/rats-text', () => {
  const { Text } = require('react-native');
  return ({ text }: any) => <Text>{String(text ?? '')}</Text>;
});

jest.mock('../../../context/DataContext', () => ({
  useData: () => ({
    currentHouse: { id: 'house-1', name: 'Test House' },
    currentUser: { uid: 'user-1', firstName: 'Jane', lastName: 'Admin' },
  }),
}));

jest.mock('../../../state/store', () => ({
  useAppSelector: jest.fn((selector: any) =>
    selector({
      guests: {
        guests: [
          {
            id: 'guest-1',
            firstName: 'Alice',
            lastName: 'Smith',
            houseId: 'house-1',
          },
          {
            id: 'guest-2',
            firstName: 'Bob',
            lastName: 'Jones',
            houseId: 'house-1',
          },
        ],
      },
    }),
  ),
}));

// After A2 migration, DrugTestForm reads guests via useGuests(houseId).
// Mock the hook to return the same fixtures the legacy Redux mock provided.
// See .full-review [A2].
jest.mock('../../../state/queries/guestQueries', () => ({
  useGuests: jest.fn(() => ({
    data: {
      'guest-1': {
        id: 'guest-1',
        firstName: 'Alice',
        lastName: 'Smith',
        houseId: 'house-1',
      },
      'guest-2': {
        id: 'guest-2',
        firstName: 'Bob',
        lastName: 'Jones',
        houseId: 'house-1',
      },
    },
    isLoading: false,
    isError: false,
  })),
}));

jest.mock('../../../entities/DrugTest', () => {
  const actual = jest.requireActual('../../../entities/DrugTest');
  return {
    ...actual,
    drugTestSchema: {
      validate: jest.fn().mockResolvedValue(true),
    },
  };
});

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
}));

import { useLogDrugTest } from '../../../state/queries/drugTestQueries';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

describe('DrugTestForm', () => {
  const mockMutateAsync = jest
    .fn()
    .mockResolvedValue({ guestId: 'guest-1', houseId: 'house-1' });

  beforeEach(() => {
    jest.clearAllMocks();
    (useLogDrugTest as jest.Mock).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    });
  });

  it('renders the form title "Log Drug Test"', () => {
    const { getAllByText } = render(<DrugTestForm />, { wrapper });
    expect(getAllByText('Log Drug Test').length).toBeGreaterThanOrEqual(1);
  });

  it('renders result options Negative and Positive', () => {
    const { getAllByText } = render(<DrugTestForm />, { wrapper });
    expect(getAllByText('Negative').length).toBeGreaterThanOrEqual(1);
    expect(getAllByText('Positive').length).toBeGreaterThanOrEqual(1);
  });

  it('renders guest list', () => {
    const { getByText } = render(<DrugTestForm />, { wrapper });
    expect(getByText('Alice Smith')).toBeTruthy();
    expect(getByText('Bob Jones')).toBeTruthy();
  });

  it('submits form with guest selected + result selected, calls mutateAsync, navigates back', async () => {
    const { getByText, getByTestId } = render(<DrugTestForm />, { wrapper });

    // Select a guest
    fireEvent.press(getByText('Alice Smith'));

    // Select result
    fireEvent.press(getByText('Negative'));

    // Submit
    fireEvent.press(getByTestId('submit-button'));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          guestId: 'guest-1',
          houseId: 'house-1',
          result: 'negative',
          observedBy: 'user-1',
          observerName: 'Jane Admin',
        }),
      );
      expect(mockGoBack).toHaveBeenCalled();
    });
  });

  it('shows substances input only when result is positive', () => {
    const { getByText, queryByPlaceholderText } = render(<DrugTestForm />, {
      wrapper,
    });

    expect(queryByPlaceholderText('e.g. THC, cocaine')).toBeNull();

    fireEvent.press(getByText('Positive'));

    expect(queryByPlaceholderText('e.g. THC, cocaine')).toBeTruthy();
  });
});
