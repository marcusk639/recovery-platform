/**
 * An operator's guest tab shows the selected guest, and nothing selected one on
 * sign-in, so it read "No guests in this house" with residents in the house.
 * The selection also has to follow the house: after Change home it must not
 * keep showing a resident of the previous house.
 */
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockDispatch = jest.fn();
let mockState: any;
jest.mock('../../state/store', () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select(mockState),
  useAppDispatch: () => mockDispatch,
}));
jest.mock('../../services/guest', () => ({ getGuests: jest.fn(), getGuest: jest.fn() }));

import { useDefaultGuestSelection } from '../useDefaultGuestSelection';
import * as guestService from '../../services/guest';
import { selectGuestById } from '../../state/slices/guestsSlice';

const guest = (id: string, firstName: string, extra: object = {}) => ({
  id,
  firstName,
  lastName: 'Test',
  houseId: 'h1',
  status: 'active',
  userId: `user-${id}`,
  ...extra,
});

const setState = (opts: { selectedGuestId?: string | null; user?: object }) => {
  mockState = {
    user: { user: { id: 'op-1', isAdmin: true, isGuest: false, ...opts.user } },
    houses: { selectedHouseId: 'h1' },
    guests: { selectedGuestId: opts.selectedGuestId ?? null },
  };
};

const renderSelection = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useDefaultGuestSelection(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
};

const loaded = (result: { current: { isLoading: boolean } }) =>
  waitFor(() => expect(result.current.isLoading).toBe(false));

beforeEach(() => {
  jest.clearAllMocks();
  setState({});
});

describe('an operator with no guest selected', () => {
  it('selects the first resident by name', async () => {
    (guestService.getGuests as jest.Mock).mockResolvedValue({
      z: guest('z', 'Casey'),
      a: guest('a', 'Blake'),
      m: guest('m', 'Avery'),
    });
    const { result } = renderSelection();
    await loaded(result);
    expect(guestService.getGuests).toHaveBeenCalledWith('houseId', 'h1');
    expect(mockDispatch).toHaveBeenCalledWith(selectGuestById('m'));
  });

  it("prefers the operator's own resident record", async () => {
    (guestService.getGuests as jest.Mock).mockResolvedValue({
      a: guest('a', 'Avery'),
      b: guest('b', 'Blake', { userId: 'op-1' }),
    });
    const { result } = renderSelection();
    await loaded(result);
    expect(mockDispatch).toHaveBeenCalledWith(selectGuestById('b'));
  });

  it('skips discharged residents', async () => {
    (guestService.getGuests as jest.Mock).mockResolvedValue({
      a: guest('a', 'Avery', { status: 'discharged' }),
      b: guest('b', 'Blake'),
    });
    const { result } = renderSelection();
    await loaded(result);
    expect(mockDispatch).toHaveBeenCalledWith(selectGuestById('b'));
  });

  it('selects nothing in a house with no current residents', async () => {
    (guestService.getGuests as jest.Mock).mockResolvedValue({
      a: guest('a', 'Avery', { status: 'discharged' }),
    });
    const { result } = renderSelection();
    await loaded(result);
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});

describe('an operator with a guest selected', () => {
  it('keeps a resident of this house, even a later one by name', async () => {
    setState({ selectedGuestId: 'b' });
    (guestService.getGuests as jest.Mock).mockResolvedValue({
      a: guest('a', 'Avery'),
      b: guest('b', 'Blake'),
    });
    const { result } = renderSelection();
    await loaded(result);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('replaces a resident of another house after Change home', async () => {
    setState({ selectedGuestId: 'other-house-guest' });
    (guestService.getGuests as jest.Mock).mockResolvedValue({ a: guest('a', 'Avery') });
    const { result } = renderSelection();
    await loaded(result);
    expect(mockDispatch).toHaveBeenCalledWith(selectGuestById('a'));
  });

  it('clears a resident of another house when this house has none', async () => {
    setState({ selectedGuestId: 'other-house-guest' });
    (guestService.getGuests as jest.Mock).mockResolvedValue({});
    const { result } = renderSelection();
    await loaded(result);
    expect(mockDispatch).toHaveBeenCalledWith(selectGuestById(null));
  });

  it('does not change the selection when the list fails to load', async () => {
    setState({ selectedGuestId: 'b' });
    (guestService.getGuests as jest.Mock).mockRejectedValue(new Error('offline'));
    const { result } = renderSelection();
    await loaded(result);
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});

describe('loading', () => {
  it('reports loading until the list arrives, so the empty message does not flash', async () => {
    (guestService.getGuests as jest.Mock).mockResolvedValue({ a: guest('a', 'Avery') });
    const { result } = renderSelection();
    expect(result.current.isLoading).toBe(true);
    await loaded(result);
  });
});

describe('a resident', () => {
  it('reads no guest list and keeps the selection made at sign-in', async () => {
    setState({ user: { isAdmin: false, isGuest: true } });
    const { result } = renderSelection();
    expect(result.current.isLoading).toBe(false);
    expect(guestService.getGuests).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});
