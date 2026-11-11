/**
 * Only a manager or above may change a resident's rent or chore balance (the
 * rules' rentMoneyByManager). The app asks the server for the caller's own tier
 * and hides the money fields from everyone else, so a peer leader is not shown
 * an edit the rules will refuse.
 */
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { houseTierKeys, useMayEditRentMoney } from '../houseTierQueries';
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
  const hook = renderHook(() => useMayEditRentMoney(houseId), { wrapper });
  // Waits until the query has settled and the hook has re-rendered with its result, so
  // a false can't just be the loading state's.
  const settled = async () => {
    await waitFor(() =>
      expect(['success', 'error']).toContain(queryClient.getQueryState(houseTierKeys.mine)?.status),
    );
    await act(async () => {});
  };
  return { ...hook, settled };
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
    const { result, settled } = renderFor('h1');
    await waitFor(() => expect(mockGetMyHouseTiers).toHaveBeenCalled());
    await settled();
    expect(result.current).toBe(false);
  });

  it('is false while the tier is still loading', () => {
    mockGetMyHouseTiers.mockReturnValue(new Promise(() => {}));
    const { result } = renderFor('h1');
    expect(result.current).toBe(false);
  });

  it('is false when the tier lookup fails', async () => {
    mockGetMyHouseTiers.mockRejectedValue(new Error('offline'));
    const { result, settled } = renderFor('h1');
    await waitFor(() => expect(mockGetMyHouseTiers).toHaveBeenCalled());
    await settled();
    expect(result.current).toBe(false);
  });

  it('does not ask without a house', () => {
    const { result } = renderFor('');
    expect(mockGetMyHouseTiers).not.toHaveBeenCalled();
    expect(result.current).toBe(false);
  });
});
