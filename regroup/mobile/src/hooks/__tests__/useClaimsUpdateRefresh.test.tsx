/**
 * useClaimsUpdateRefresh (S5, REV-A5): subscribes while signed in, and on a
 * claims change stores the refreshed token and refetches active queries.
 */
import React from 'react';
import { renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockUnsubscribe = jest.fn();
const mockWatch = jest.fn((_uid: string, _deps: unknown) => mockUnsubscribe);
jest.mock('../../services/claimsUpdates', () => ({
  watchClaimsUpdates: (uid: string, deps: unknown) => mockWatch(uid, deps),
}));
const mockGetAuthUser = jest.fn();
jest.mock('../../services/users', () => ({
  getAuthUser: (force: boolean) => mockGetAuthUser(force),
}));
const mockDispatch = jest.fn();
jest.mock('../../state/store', () => ({ useAppDispatch: () => mockDispatch }));

import { useClaimsUpdateRefresh } from '../useClaimsUpdateRefresh';
import { tokenRefreshed } from '../../state/slices/userSlice';

type Deps = { refresh: () => Promise<void>; tokenIssuedAtMs: () => Promise<number | undefined> };

const queryClient = new QueryClient();
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);
const deps = () => mockWatch.mock.calls[mockWatch.mock.calls.length - 1][1] as Deps;

beforeEach(() => jest.clearAllMocks());

describe('useClaimsUpdateRefresh', () => {
  it('does not listen for a signed-out or anonymous user', () => {
    renderHook(() => useClaimsUpdateRefresh(undefined, true), { wrapper });
    renderHook(() => useClaimsUpdateRefresh('u1', false), { wrapper });
    expect(mockWatch).not.toHaveBeenCalled();
  });

  it("listens to the account's marker and unsubscribes on sign-out", () => {
    const { rerender } = renderHook(
      ({ uid, enabled }: { uid?: string; enabled: boolean }) =>
        useClaimsUpdateRefresh(uid, enabled),
      { wrapper, initialProps: { uid: 'u1', enabled: true } },
    );
    expect(mockWatch).toHaveBeenCalledWith('u1', expect.any(Object));
    rerender({ uid: undefined, enabled: false });
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it('force-refreshes the token, stores it and refetches active queries', async () => {
    const token = { claims: { guest: {} }, issuedAtTime: 'Fri, 27 Nov 2026 12:00:00 GMT' };
    mockGetAuthUser.mockResolvedValue(token);
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    renderHook(() => useClaimsUpdateRefresh('u1', true), { wrapper });

    await deps().refresh();

    expect(mockGetAuthUser).toHaveBeenCalledWith(true);
    expect(mockDispatch).toHaveBeenCalledWith(tokenRefreshed(token));
    expect(invalidate).toHaveBeenCalledWith();
  });

  it("reports the current token's issue time without refreshing it", async () => {
    mockGetAuthUser.mockResolvedValue({ issuedAtTime: 'Fri, 27 Nov 2026 12:00:00 GMT' });
    renderHook(() => useClaimsUpdateRefresh('u1', true), { wrapper });
    await expect(deps().tokenIssuedAtMs()).resolves.toBe(Date.UTC(2026, 10, 27, 12));
    expect(mockGetAuthUser).toHaveBeenCalledWith(false);
    mockGetAuthUser.mockResolvedValue({ issuedAtTime: 'not a date' });
    await expect(deps().tokenIssuedAtMs()).resolves.toBeUndefined();
  });
});
