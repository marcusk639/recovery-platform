/**
 * The paywall kill switch (useSubscriptionGate's paywallConfigRef read) and the
 * subscription callables, against the normalized Firebase operation log.
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 2). This file
 * stays byte-identical from Task 2 to the end of Task 10, the modular Firebase
 * migration. The kill switch fails closed (paywall on) unless paywall/config
 * exists with enabled: false, so its `exists` read is pinned both ways.
 */
jest.mock('../../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../__mocks__/firebase-modular/firestore'),
);
jest.mock('@react-native-firebase/functions', () =>
  require('../../../__mocks__/firebase-modular/functions'),
);
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import {
  failNext,
  getOpLog,
  resetOpLog,
  seedCall,
  seedDoc,
} from '../../../__mocks__/firebase-modular/log';
import { usePaywallKillSwitch } from '../useSubscriptionGate';
import {
  applyBundleDiscount,
  createHouses,
  updateSubscriptionGuests,
  updateSubscriptionHouses,
} from '../../services/subscription';
import { logException } from '../../util/logging';

function renderKillSwitch() {
  // gcTime Infinity: no cache-collection timer, which would keep Jest alive for 5 minutes.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => usePaywallKillSwitch(), { wrapper });
}

beforeEach(() => {
  resetOpLog();
});

describe('usePaywallKillSwitch', () => {
  it('turns the paywall off only when paywall/config says enabled: false', async () => {
    seedDoc('paywall/config', { enabled: false });

    const { result } = renderKillSwitch();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.killSwitchEnabled).toBe(false);
    expect(getOpLog()).toEqual([{ op: 'get', path: 'paywall/config' }]);
  });

  it('keeps the paywall on when the config doc does not exist', async () => {
    const { result } = renderKillSwitch();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.killSwitchEnabled).toBe(true);
  });

  it('keeps the paywall on when enabled is not a boolean', async () => {
    seedDoc('paywall/config', { enabled: 'no' });

    const { result } = renderKillSwitch();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.killSwitchEnabled).toBe(true);
  });

  it('keeps the paywall on and logs when the read fails', async () => {
    const error = new Error('unavailable');
    failNext('get', error, 'paywall/config');

    const { result } = renderKillSwitch();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.killSwitchEnabled).toBe(true);
    expect(logException).toHaveBeenCalledWith(error);
  });
});

describe('subscription callables', () => {
  const params = { ownerUserId: 'u1', houseIds: ['h1'], action: 'add' as const, amountToAdjust: 1 };

  it('send their payloads to the named callables', async () => {
    seedCall('updateSubscriptionHouses', { ok: true });
    seedCall('createHouses', { houseIds: ['srv-1'], idMap: { k1: 'srv-1' } });

    await updateSubscriptionGuests(params);
    expect(await updateSubscriptionHouses(params)).toEqual({ ok: true });
    await applyBundleDiscount('u1');
    const created = await createHouses([{ requestKey: 'k1', name: 'House', lat: 1, lng: 2 }]);

    expect(created).toEqual({ houseIds: ['srv-1'], idMap: { k1: 'srv-1' } });
    expect(getOpLog()).toEqual([
      { op: 'call', path: 'updateSubscriptionGuests', data: params },
      { op: 'call', path: 'updateSubscriptionHouses', data: params },
      { op: 'call', path: 'applyBundleDiscount', data: { userId: 'u1' } },
      {
        op: 'call',
        path: 'createHouses',
        data: { houses: [{ requestKey: 'k1', name: 'House', lat: 1, lng: 2 }] },
      },
    ]);
  });
});
