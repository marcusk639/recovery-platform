/**
 * DataProvider, operator sign-in: which house gets selected.
 *
 * The rules let a member read a house by id but deny a query on
 * houses.adminIds (a list query cannot prove the per-house rule), so an
 * operator's houses must come from admins/{adminId}.houseIds. With the denied
 * query the operator never had a house selected and the SubscriptionGate spun
 * forever.
 */
import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockDispatch = jest.fn();
let mockState: any;
jest.mock('../../state/store', () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select(mockState),
  useAppDispatch: () => mockDispatch,
}));
jest.mock('../../services/house', () => ({
  getHousesForAdmin: jest.fn(),
  getHouses: jest.fn(),
  getHouse: jest.fn(),
}));
jest.mock('../../services/guest', () => ({ getGuests: jest.fn(), getGuest: jest.fn() }));
jest.mock('../../services/admin', () => ({ getAdmin: jest.fn() }));
jest.mock('../../hooks/useSelectedHouse', () => ({
  useSelectedHouse: () => ({ house: null, houseId: null, isLoading: false }),
}));
jest.mock('../../hooks/useSelectedGuest', () => ({
  useSelectedGuest: () => ({ guest: null, guestId: null, isLoading: false }),
}));
jest.mock('../../hooks/useSelectedAdmin', () => ({
  useSelectedAdmin: () => ({ admin: null }),
}));
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import { DataProvider } from '../DataContext';
import * as houseService from '../../services/house';
import * as guestService from '../../services/guest';
import * as adminService from '../../services/admin';
import { selectHouseById } from '../../state/slices/housesSlice';
import { selectGuestById } from '../../state/slices/guestsSlice';

const operator = {
  id: 'user-1',
  uid: 'user-1',
  adminId: 'admin-1',
  isAdmin: true,
  isGuest: false,
};

const renderProvider = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DataProvider>{null}</DataProvider>
    </QueryClientProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockState = {
    user: { user: operator, loading: false, loggedIn: true },
    houses: { selectedHouseId: null },
  };
  (adminService.getAdmin as jest.Mock).mockResolvedValue({ id: 'admin-1', houseIds: ['h1'] });
  (houseService.getHousesForAdmin as jest.Mock).mockResolvedValue({
    h1: { id: 'h1', name: 'House One' },
  });
  (guestService.getGuests as jest.Mock).mockResolvedValue({
    g1: { id: 'g1', userId: 'someone-else', houseId: 'h1' },
  });
});

describe("an operator's houses", () => {
  it("come from the operator's admin record, not a query on houses.adminIds", async () => {
    renderProvider();

    await waitFor(() => expect(houseService.getHousesForAdmin).toHaveBeenCalledWith('admin-1'));
    expect(houseService.getHouses).not.toHaveBeenCalled();
  });

  it('select the first house when none is selected yet', async () => {
    renderProvider();

    await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith(selectHouseById('h1')));
  });

  it("select the operator's own resident record in that house, when there is one", async () => {
    (guestService.getGuests as jest.Mock).mockResolvedValue({
      g1: { id: 'g1', userId: 'user-1', houseId: 'h1' },
    });

    renderProvider();

    await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith(selectGuestById('g1')));
  });

  it('keep an existing selection', async () => {
    mockState.houses.selectedHouseId = 'h2';

    renderProvider();

    await waitFor(() => expect(houseService.getHousesForAdmin).toHaveBeenCalled());
    // Let the fetch resolve and the effect finish before asserting nothing was selected.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mockDispatch).not.toHaveBeenCalledWith(selectHouseById('h1'));
    expect(guestService.getGuests).not.toHaveBeenCalled();
  });
});
