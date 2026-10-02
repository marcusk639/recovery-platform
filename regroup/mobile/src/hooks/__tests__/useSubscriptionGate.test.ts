/**
 * useSubscriptionGate / usePaywallKillSwitch Hook Tests
 *
 * Covers:
 * - Kill switch: explicit enabled true/false, missing doc, non-boolean field,
 *   .get() throwing → fail-closed defaults.
 * - Gate: anonymous / superadmin short-circuits, kill switch loading/disabled,
 *   admin sub-active/inactive, guest house loading, guest no-house,
 *   guest active/trialing, guest grace_period (future endsAt), guest
 *   grace_expired (past endsAt), and the "user loaded but no role flags"
 *   transitional state.
 *
 * Mocking strategy: mock paywallConfigRef, subscriptionIsActive, logException,
 * useSelectedHouse, and useAppSelector at the module level (matches existing
 * useStatSummary.test.ts pattern). Each test uses a fresh QueryClient with
 * retry:false to keep React Query deterministic.
 */

// ── Module mocks (must be declared before imports) ───────────────────────────

const mockGet = jest.fn();

jest.mock('../../services/paywall', () => ({
  paywallConfigRef: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}));

const mockSubscriptionIsActive = jest.fn();
jest.mock('../../util/subscription', () => ({
  subscriptionIsActive: (...args: unknown[]) => mockSubscriptionIsActive(...args),
}));

const mockLogException = jest.fn();
jest.mock('../../util/logging', () => ({
  logException: (...args: unknown[]) => mockLogException(...args),
}));

const mockUseSelectedHouse = jest.fn();
jest.mock('../useSelectedHouse', () => ({
  useSelectedHouse: () => mockUseSelectedHouse(),
}));

jest.mock('../../state/store', () => ({
  useAppSelector: jest.fn(),
  useAppDispatch: () => jest.fn(),
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { usePaywallKillSwitch, useSubscriptionGate } from '../useSubscriptionGate';

const { useAppSelector } = require('../../state/store');

// ── Test wrapper ─────────────────────────────────────────────────────────────

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
    },
  });
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return Wrapper;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function setUserState(state: { user?: any; anonymous?: boolean }) {
  useAppSelector.mockImplementation((selector: any) =>
    selector({
      user: {
        user: state.user ?? null,
        anonymous: state.anonymous ?? false,
      },
    }),
  );
}

function setHouse(opts: { house?: any; isLoading?: boolean } = {}) {
  mockUseSelectedHouse.mockReturnValue({
    house: opts.house ?? null,
    houseId: opts.house?.id ?? null,
    isLoading: opts.isLoading ?? false,
  });
}

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  // default: kill switch doc exists and is enabled=true (paywall on)
  mockGet.mockResolvedValue({ exists: true, data: () => ({ enabled: true }) });
  setUserState({ user: null, anonymous: false });
  setHouse({ house: null, isLoading: false });
  mockSubscriptionIsActive.mockReturnValue(false);
});

// ─────────────────────────────────────────────────────────────────────────────
// usePaywallKillSwitch
// ─────────────────────────────────────────────────────────────────────────────

describe('usePaywallKillSwitch', () => {
  it('returns killSwitchEnabled=false when doc has enabled:false', async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({ enabled: false }),
    });

    const { result } = renderHook(() => usePaywallKillSwitch(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.killSwitchEnabled).toBe(false);
  });

  it('returns killSwitchEnabled=true when doc has enabled:true', async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({ enabled: true }),
    });

    const { result } = renderHook(() => usePaywallKillSwitch(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.killSwitchEnabled).toBe(true);
  });

  it('defaults to enabled=true (fail closed) when the doc is missing', async () => {
    mockGet.mockResolvedValue({ exists: false, data: () => null });

    const { result } = renderHook(() => usePaywallKillSwitch(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.killSwitchEnabled).toBe(true);
  });

  it('defaults to enabled=true when the enabled field is non-boolean', async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({ enabled: 'yes' }),
    });

    const { result } = renderHook(() => usePaywallKillSwitch(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.killSwitchEnabled).toBe(true);
  });

  it('fails closed and logs the exception when paywallConfigRef.get() throws', async () => {
    const boom = new Error('firestore offline');
    mockGet.mockRejectedValue(boom);

    const { result } = renderHook(() => usePaywallKillSwitch(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.killSwitchEnabled).toBe(true);
    expect(mockLogException).toHaveBeenCalledWith(boom);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useSubscriptionGate
// ─────────────────────────────────────────────────────────────────────────────

describe('useSubscriptionGate', () => {
  describe('short-circuits', () => {
    it('returns allowed when anonymous flag in Redux is true', async () => {
      setUserState({ anonymous: true, user: null });

      const { result } = renderHook(() => useSubscriptionGate(), {
        wrapper: makeWrapper(),
      });

      // No need to wait for kill switch — short-circuits before that.
      expect(result.current).toEqual({ status: 'allowed' });
    });

    it('returns allowed when user.isAnonymous is true', () => {
      setUserState({ user: { isAnonymous: true } });

      const { result } = renderHook(() => useSubscriptionGate(), {
        wrapper: makeWrapper(),
      });

      expect(result.current).toEqual({ status: 'allowed' });
    });

    it('returns allowed for a potentialSuperAdmin who has not finished setup', () => {
      setUserState({
        user: { potentialSuperAdmin: true, orgSetupCompleted: false },
      });

      const { result } = renderHook(() => useSubscriptionGate(), {
        wrapper: makeWrapper(),
      });

      expect(result.current).toEqual({ status: 'allowed' });
    });
  });

  describe('kill switch states', () => {
    it('returns loading while the kill switch query is in flight', () => {
      // Never-resolving promise keeps the query loading
      mockGet.mockReturnValue(new Promise(() => {}));
      setUserState({ user: { isAdmin: true } });

      const { result } = renderHook(() => useSubscriptionGate(), {
        wrapper: makeWrapper(),
      });

      expect(result.current).toEqual({ status: 'loading' });
    });

    it('returns allowed when the kill switch is explicitly disabled', async () => {
      mockGet.mockResolvedValue({
        exists: true,
        data: () => ({ enabled: false }),
      });
      // Even an admin with an inactive subscription should be allowed through
      setUserState({ user: { isAdmin: true } });
      mockSubscriptionIsActive.mockReturnValue(false);

      const { result } = renderHook(() => useSubscriptionGate(), {
        wrapper: makeWrapper(),
      });

      await waitFor(() => expect(result.current).toEqual({ status: 'allowed' }));
    });
  });

  describe('operator (admin / superAdmin) gate', () => {
    // The operator branch reads the SAME house fields as the guest branch.
    // It used to read user.subscriptionMetadata.status, which the Stripe
    // webhook never writes (it updates subscriptions/* and houses/*), so an
    // operator's status was frozen at whatever checkout wrote.
    it('returns allowed when the operator house is active', async () => {
      setUserState({ user: { isAdmin: true, orgSetupCompleted: true } });
      setHouse({ house: { id: 'h1', subscriptionStatus: 'active' } });

      const { result } = renderHook(() => useSubscriptionGate(), {
        wrapper: makeWrapper(),
      });

      await waitFor(() => expect(result.current).toEqual({ status: 'allowed' }));
    });

    // Absent status was an untested path, which is how a client/server
    // divergence survived: the client read absent as allowed while the server
    // entitlement ladder returns absent_status → denied. It now reads as
    // loading — fail closed, but without flashing a paywall at a new operator
    // whose house has not been stamped by setHouseSubscriptionStatusOnCreate.
    // NOTE on assertion style: a plain
    //   await waitFor(() => expect(result.current).toEqual({status:'loading'}))
    // is VACUOUS here. 'loading' is also the pre-settle value while the kill
    // switch doc is being fetched, so waitFor is satisfied on the first render
    // before the gate logic runs — such a test passes even when absent status
    // folds into 'allowed'. Verified by mutation. So assert that the gate never
    // settles on 'allowed', then confirm the terminal value.
    async function expectNeverAllowed(result: { current: unknown }) {
      await expect(
        waitFor(() => expect(result.current).toEqual({ status: 'allowed' }), {
          timeout: 400,
        }),
      ).rejects.toThrow();
      expect(result.current).toEqual({ status: 'loading' });
    }

    it('does not grant access when the operator house has no subscriptionStatus', async () => {
      setUserState({ user: { isAdmin: true, orgSetupCompleted: true } });
      setHouse({ house: { id: 'h1' } });

      const { result } = renderHook(() => useSubscriptionGate(), {
        wrapper: makeWrapper(),
      });

      await expectNeverAllowed(result);
    });

    it('does not grant access when the operator subscriptionStatus is an empty string', async () => {
      setUserState({ user: { isAdmin: true, orgSetupCompleted: true } });
      setHouse({ house: { id: 'h1', subscriptionStatus: '' } });

      const { result } = renderHook(() => useSubscriptionGate(), {
        wrapper: makeWrapper(),
      });

      await expectNeverAllowed(result);
    });

    it('does not grant access to a guest whose house has no subscriptionStatus', async () => {
      setUserState({ user: { isGuest: true } });
      setHouse({ house: { id: 'h1' } });

      const { result } = renderHook(() => useSubscriptionGate(), {
        wrapper: makeWrapper(),
      });

      await expectNeverAllowed(result);
    });

    it('returns subscription_required when the operator house is canceled', async () => {
      setUserState({ user: { isSuperAdmin: true, orgSetupCompleted: true } });
      setHouse({ house: { id: 'h1', subscriptionStatus: 'canceled' } });

      const { result } = renderHook(() => useSubscriptionGate(), {
        wrapper: makeWrapper(),
      });

      await waitFor(() => expect(result.current).toEqual({ status: 'subscription_required' }));
    });

    it('returns grace_period while a past_due operator house is still in grace', async () => {
      const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
      setUserState({ user: { isSuperAdmin: true, orgSetupCompleted: true } });
      setHouse({
        house: {
          id: 'h1',
          subscriptionStatus: 'past_due',
          guestGraceEndsAt: future,
        },
      });

      const { result } = renderHook(() => useSubscriptionGate(), {
        wrapper: makeWrapper(),
      });

      await waitFor(() => expect(result.current.status).toBe('grace_period'));
    });

    // The regression that made the operator paywall unreachable: every operator
    // carries potentialSuperAdmin: true permanently (both signup funnels set it
    // and nothing clears it), so the short-circuit above swallowed this case.
    it('gates a completed operator who still carries potentialSuperAdmin', async () => {
      setUserState({
        user: {
          isSuperAdmin: true,
          potentialSuperAdmin: true,
          orgSetupCompleted: true,
        },
      });
      setHouse({ house: { id: 'h1', subscriptionStatus: 'canceled' } });

      const { result } = renderHook(() => useSubscriptionGate(), {
        wrapper: makeWrapper(),
      });

      await waitFor(() => expect(result.current).toEqual({ status: 'subscription_required' }));
    });
  });

  describe('guest gate', () => {
    it('returns loading while the guest house is loading', async () => {
      setUserState({ user: { isGuest: true } });
      setHouse({ house: null, isLoading: true });

      const { result } = renderHook(() => useSubscriptionGate(), {
        wrapper: makeWrapper(),
      });

      // Wait for kill switch to settle so loading is purely from house state
      await waitFor(() => expect(result.current).toEqual({ status: 'loading' }));
    });

    it('returns loading when the guest has no house yet (selectedHouseId unset)', async () => {
      setUserState({ user: { isGuest: true } });
      setHouse({ house: null, isLoading: false });

      const { result } = renderHook(() => useSubscriptionGate(), {
        wrapper: makeWrapper(),
      });

      await waitFor(() => expect(result.current).toEqual({ status: 'loading' }));
    });

    it('returns allowed when the guest house is active', async () => {
      setUserState({ user: { isGuest: true } });
      setHouse({
        house: { id: 'h1', subscriptionStatus: 'active' },
      });

      const { result } = renderHook(() => useSubscriptionGate(), {
        wrapper: makeWrapper(),
      });

      await waitFor(() => expect(result.current).toEqual({ status: 'allowed' }));
    });

    it('returns allowed when the guest house is trialing', async () => {
      setUserState({ user: { isGuest: true } });
      setHouse({
        house: { id: 'h1', subscriptionStatus: 'trialing' },
      });

      const { result } = renderHook(() => useSubscriptionGate(), {
        wrapper: makeWrapper(),
      });

      await waitFor(() => expect(result.current).toEqual({ status: 'allowed' }));
    });

    it('returns grace_period with endsAt when canceled but grace window is open', async () => {
      const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      setUserState({ user: { isGuest: true } });
      setHouse({
        house: {
          id: 'h1',
          subscriptionStatus: 'canceled',
          guestGraceEndsAt: future,
        },
      });

      const { result } = renderHook(() => useSubscriptionGate(), {
        wrapper: makeWrapper(),
      });

      await waitFor(() => {
        expect(result.current.status).toBe('grace_period');
      });
      expect((result.current as { status: 'grace_period'; endsAt: Date }).endsAt.getTime()).toBe(
        future.getTime(),
      );
    });

    it('returns grace_expired when past_due and grace window has closed', async () => {
      const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
      setUserState({ user: { isGuest: true } });
      setHouse({
        house: {
          id: 'h1',
          subscriptionStatus: 'past_due',
          guestGraceEndsAt: past,
        },
      });

      const { result } = renderHook(() => useSubscriptionGate(), {
        wrapper: makeWrapper(),
      });

      await waitFor(() => expect(result.current).toEqual({ status: 'grace_expired' }));
    });
  });

  describe('transitional state', () => {
    it('returns loading when user object exists but has no role flags', async () => {
      // Realistic: just-logged-in user record with no isAdmin / isGuest / etc.
      setUserState({ user: { id: 'u1' } });

      const { result } = renderHook(() => useSubscriptionGate(), {
        wrapper: makeWrapper(),
      });

      await waitFor(() => expect(result.current).toEqual({ status: 'loading' }));
    });
  });
});
