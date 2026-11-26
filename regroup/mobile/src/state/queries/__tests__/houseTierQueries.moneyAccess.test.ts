/**
 * useHouseMoneyAccess (P5 Task 20): RequireHouseRole waits on it before it
 * opens a money screen, so the loading state must be told apart from a 'no'.
 */
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useHouseMoneyAccess } from '../houseTierQueries';
import { getMyHouseTiers } from '../../../services/houseTiers';

jest.mock('../../../services/houseTiers', () => ({
  getMyHouseTiers: jest.fn(),
}));

const mockGetMyHouseTiers = getMyHouseTiers as jest.MockedFunction<typeof getMyHouseTiers>;

function renderFor(houseId: string, enabled = true) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return renderHook(() => useHouseMoneyAccess(houseId, enabled), { wrapper });
}

describe('useHouseMoneyAccess', () => {
  beforeEach(() => mockGetMyHouseTiers.mockReset());

  it.each([
    ['owner', 'yes'],
    ['manager', 'yes'],
    ['peerLeader', 'no'],
  ])('a %s tier gives %s', async (tier, expected) => {
    mockGetMyHouseTiers.mockResolvedValue({ h1: tier });
    const { result } = renderFor('h1');
    await waitFor(() => expect(result.current).toBe(expected));
  });

  it('is checking while the tier loads', () => {
    mockGetMyHouseTiers.mockReturnValue(new Promise(() => {}));
    expect(renderFor('h1').result.current).toBe('checking');
  });

  it('is no when the tier could not be read', async () => {
    mockGetMyHouseTiers.mockRejectedValue(new Error('unavailable'));
    const { result } = renderFor('h1');
    await waitFor(() => expect(result.current).toBe('no'));
  });

  it('is no with no tier for this house', async () => {
    mockGetMyHouseTiers.mockResolvedValue({ other: 'owner' });
    const { result } = renderFor('h1');
    await waitFor(() => expect(result.current).toBe('no'));
  });

  it('asks nothing when not needed', () => {
    expect(renderFor('h1', false).result.current).toBe('no');
    expect(mockGetMyHouseTiers).not.toHaveBeenCalled();
  });
});
