/**
 * Only a manager or above may change a resident's rent or chore balance (the
 * rules' rentMoneyByManager). The app asks the server for the caller's own tier
 * and hides the money fields from everyone else, so a peer leader is not shown
 * an edit the rules will refuse.
 */
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { houseTierKeys, useMayEditGuestMoney, useMayEditRentMoney } from '../houseTierQueries';
import { getMyHouseTiers } from '../../../services/houseTiers';

jest.mock('../../../../firebase-setup', () => ({ auth: { currentUser: { uid: 'manager-uid' } } }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockAuth: { currentUser: { uid: string } | null } = require('../../../../firebase-setup').auth;

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

describe('useMayEditGuestMoney', () => {
  beforeEach(() => {
    mockGetMyHouseTiers.mockReset();
    mockAuth.currentUser = { uid: 'manager-uid' };
  });

  const renderFor = (guest: { houseId: string; userId?: string }) => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);
    return renderHook(() => useMayEditGuestMoney(guest), { wrapper });
  };

  it("lets a manager change another resident's rate and balance", async () => {
    mockGetMyHouseTiers.mockResolvedValue({ h1: 'manager' });
    const { result } = renderFor({ houseId: 'h1', userId: 'resident-uid' });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('never on their own record, a manager included (rules: ownMoneyUnchanged)', async () => {
    mockGetMyHouseTiers.mockResolvedValue({ h1: 'manager' });
    mockAuth.currentUser = { uid: 'resident-uid' };
    const { result } = renderFor({ houseId: 'h1', userId: 'resident-uid' });
    await act(async () => {});
    expect(result.current).toBe(false);
  });

  it('not for a peer leader', async () => {
    mockGetMyHouseTiers.mockResolvedValue({ h1: 'peerLeader' });
    const { result } = renderFor({ houseId: 'h1', userId: 'resident-uid' });
    await act(async () => {});
    expect(result.current).toBe(false);
  });

  it('a resident record with no account is anyone-but-self: a manager may', async () => {
    mockGetMyHouseTiers.mockResolvedValue({ h1: 'owner' });
    const { result } = renderFor({ houseId: 'h1', userId: '' });
    await waitFor(() => expect(result.current).toBe(true));
  });
});
