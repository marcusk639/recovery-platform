// A house's "Applications waiting" figure is for its owners and managers only: the
// rules refuse a peer leader's read of the applications (owner, 2026-11-27), so for
// them the query is never made and the figure is hidden, not an error.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, expect, vi } from 'vitest';

const access = vi.hoisted(() => ({ view: 'full' as 'full' | 'limited' | 'checking' }));
vi.mock('../src/app/useHouseAccess', () => ({ useHouseAccess: () => ({ view: access.view }) }));

const useHouseApplications = vi.hoisted(() =>
  vi.fn((_houseId: string, enabled: boolean) =>
    enabled
      ? { status: 'success', data: [{ status: 'pending' }, { status: 'approved' }] }
      : { status: 'pending' },
  ),
);
vi.mock('@mobile/state/queries/applicationQueries', () => ({ useHouseApplications }));
vi.mock('@mobile/state/queries/houseQueries', () => ({
  useHouse: () => ({ status: 'success', data: { id: 'h1', name: 'One', rooms: {} } }),
}));
vi.mock('@mobile/state/queries/guestQueries', () => ({
  useGuests: () => ({ status: 'success', data: {} }),
}));
vi.mock('@mobile/hooks/useSubscriptionGate', () => ({
  usePaywallKillSwitch: () => ({ killSwitchEnabled: false, isLoading: false }),
}));
vi.mock('@mobile/hooks/activity/useCurrentWeek', () => ({
  useCurrentWeek: () => ({ startDate: '2026-11-23' }),
}));
vi.mock('@mobile/hooks/useLiveHouseDisputes', () => ({ LIVE_DISPUTES: 'house-disputes' }));
vi.mock('@mobile/services/activity', () => ({ getWeekSummary: vi.fn() }));
vi.mock('@mobile/state/queries/activityQueries', () => ({
  activityKeys: { weekSummary: () => ['week'] },
}));
vi.mock('@mobile/util/display', () => ({ getTodaysDate: () => '2026-11-27' }));
vi.mock('@mobile/util/firestore', () => ({ toDateSafe: () => null }));
vi.mock('@mobile/util/guest', () => ({ getOverallPercentage: () => 100 }));
vi.mock('@mobile/util/house', () => ({
  countBeds: () => ({ used: 0, max: 0 }),
  countOpenDisputes: () => 0,
}));
vi.mock('../src/adapter/firebase-setup', () => ({ firestore: {} }));
vi.mock('../src/adapter/firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(async () => ({ exists: () => false })),
}));

import { useHouseSummary } from '../src/app/houses/useHouseSummary';

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const summaryOf = () => renderHook(() => useHouseSummary('h1'), { wrapper }).result.current;

beforeEach(() => {
  client = new QueryClient();
  useHouseApplications.mockClear();
  access.view = 'full';
});

test('an owner or manager reads the applications and sees how many wait', () => {
  expect(summaryOf().applicationsWaiting).toEqual({ state: 'ready', value: 1 });
  expect(useHouseApplications).toHaveBeenCalledWith('h1', true);
});

test('a peer leader never reads the applications, and the figure is hidden, not an error', () => {
  access.view = 'limited';
  expect(summaryOf().applicationsWaiting).toEqual({ state: 'hidden' });
  expect(useHouseApplications).not.toHaveBeenCalledWith('h1', true);
});

test('while the role is checked, nothing is read and the figure is loading', () => {
  access.view = 'checking';
  expect(summaryOf().applicationsWaiting).toEqual({ state: 'loading' });
  expect(useHouseApplications).not.toHaveBeenCalledWith('h1', true);
});
