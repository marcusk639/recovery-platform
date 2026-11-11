/**
 * The form against the real update mutation and query cache, not a mocked mutateAsync.
 * The form sends only the fields that changed; the mutation's optimistic update must
 * merge them into the cached guest, or the form re-reads a guest with only those
 * fields and crashes before the save even reaches the network.
 */
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GuestUpdateForm from '../GuestUpdateForm';

const mockGuest = {
  id: 'g1',
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
  phoneNumber: '5551234567',
  sobrietyDate: '',
  drugOfChoice: 'none',
  dailyHabit: 'none',
  rentOwed: 50000,
  choreFees: 0,
  phase: 1,
  houseId: 'h1',
};

jest.mock('../../../services/guest', () => ({
  getGuest: jest.fn(async () => ({ ...mockGuest })),
  getGuests: jest.fn(async () => ({})),
  // Never settles, so the test sees the optimistic cache, not a refetch.
  updateGuest: jest.fn(() => new Promise(() => {})),
}));
jest.mock('../../../hooks/useSelectedGuest', () => {
  const { useGuest } = require('../../../state/queries/guestQueries');
  return {
    useSelectedGuest: () => {
      const { data } = useGuest('g1');
      return { guest: data ?? null, guestId: 'g1', isLoading: false };
    },
  };
});
jest.mock('../../../state/queries/houseTierQueries', () => ({
  useMayEditRentMoney: () => true,
}));
jest.mock('../../../util/logging', () => ({ logException: jest.fn(), logDebug: jest.fn() }));

it('keeps the whole guest, and the form, after an ordinary save starts', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(['guests', 'detail', 'g1'], mockGuest);
  const ui = render(
    <QueryClientProvider client={queryClient}>
      <GuestUpdateForm navigation={{ navigate: jest.fn(), goBack: jest.fn() } as never} />
    </QueryClientProvider>,
  );

  fireEvent.changeText(ui.getByTestId('guest-firstname-input'), 'Janet');
  fireEvent.press(ui.getByTestId('create-guest-button'));

  await waitFor(() =>
    expect(queryClient.getQueryData(['guests', 'detail', 'g1'])).toEqual({
      ...mockGuest,
      firstName: 'Janet',
    }),
  );
  expect(ui.getByTestId('guest-firstname-input')).toBeTruthy();
});
