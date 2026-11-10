/**
 * Only a manager or above may change a resident's rent or chore balance (the
 * rules' rentMoneyByManager). The app asks the server for the caller's own tier
 * and hides the money fields from everyone else, so a peer leader is not shown
 * an edit the rules will refuse.
 */
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMayEditRentMoney } from '../houseTierQueries';
import { getMyHouseTiers } from '../../../services/houseTiers';

jest.mock('../../../services/houseTiers', () => ({
  getMyHouseTiers: jest.fn(),
}));

const mockGetMyHouseTiers = getMyHouseTiers as jest.MockedFunction<typeof getMyHouseTiers>;

function renderFor(houseId: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return renderHook(() => useMayEditRentMoney(houseId), { wrapper });
}

describe('useMayEditRentMoney', () => {
  beforeEach(() => mockGetMyHouseTiers.mockReset());

  it.each([
    ['owner', true],
    ['manager', true],
    ['peerLeader', false],
    ['resident', false],
    ['none', false],
  ])('a caller whose tier is %s -> %s', async (tier, expected) => {
    mockGetMyHouseTiers.mockResolvedValue({ h1: tier });
    const { result } = renderFor('h1');
    await waitFor(() => expect(mockGetMyHouseTiers).toHaveBeenCalled());
    await waitFor(() => expect(result.current).toBe(expected));
  });

  it('is false for a house the caller holds no staff claim in', async () => {
    mockGetMyHouseTiers.mockResolvedValue({ other: 'owner' });
    const { result } = renderFor('h1');
    await waitFor(() => expect(mockGetMyHouseTiers).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });

  it('is false while the tier is still loading', () => {
    mockGetMyHouseTiers.mockReturnValue(new Promise(() => {}));
    const { result } = renderFor('h1');
    expect(result.current).toBe(false);
  });

  it('is false when the tier lookup fails', async () => {
    mockGetMyHouseTiers.mockRejectedValue(new Error('offline'));
    const { result } = renderFor('h1');
    await waitFor(() => expect(mockGetMyHouseTiers).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });

  it('does not ask without a house', () => {
    const { result } = renderFor('');
    expect(mockGetMyHouseTiers).not.toHaveBeenCalled();
    expect(result.current).toBe(false);
  });
});
