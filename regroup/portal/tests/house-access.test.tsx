import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, expect, vi } from 'vitest';

vi.mock('@mobile/navigation/types', () => ({
  Routes: new Proxy({}, { get: (_target, key) => `route-${String(key)}` }),
}));
const roles = vi.hoisted(() => ({ current: {} as Record<string, string> }));
vi.mock('../src/app/useRoles', () => ({ useRoles: () => roles.current }));
const callHttpsFunction = vi.hoisted(() => vi.fn());
vi.mock('../src/adapter/firebase-setup', () => ({ callHttpsFunction }));

import { FullViewGate } from '../src/app/FullViewGate';
import { useHouseAccess, useRoleUnknown } from '../src/app/useHouseAccess';

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const tiersAre = (tiers: Record<string, string>) =>
  callHttpsFunction.mockResolvedValue({ data: { tiers } });
const never = () => callHttpsFunction.mockReturnValue(new Promise(() => {}));

beforeEach(() => {
  client = new QueryClient();
  callHttpsFunction.mockReset();
  roles.current = { h1: 'admin' };
});

const viewOf = () => renderHook(() => useHouseAccess('h1'), { wrapper });
const gate = (route = 'route-PaymentDashboard') =>
  render(
    <FullViewGate houseId="h1" routeName={route}>
      <p>money</p>
    </FullViewGate>,
    { wrapper },
  );

describe('useHouseAccess', () => {
  test('an owner sees the house in full without asking for a tier', () => {
    roles.current = { h1: 'superAdmin' };
    expect(viewOf().result.current.view).toBe('full');
    expect(callHttpsFunction).not.toHaveBeenCalled();
  });

  test('an admin claim is still being checked until the tier answers', () => {
    never();
    expect(viewOf().result.current.view).toBe('checking');
  });

  test('a manager gets the full view once the tier answers', async () => {
    tiersAre({ h1: 'manager' });
    const { result } = viewOf();
    await waitFor(() => expect(result.current.view).toBe('full'));
  });

  test('a peer leader gets the limited view', async () => {
    tiersAre({ h1: 'peerLeader' });
    const { result } = viewOf();
    await waitFor(() => expect(result.current.view).toBe('limited'));
  });

  // An admin claim alone can't tell a manager from a peer leader.
  test('a failed tier check fails closed to the limited view, and says the role is unknown', async () => {
    callHttpsFunction.mockRejectedValue(new Error('unavailable'));
    const { result } = renderHook(
      () => ({ access: useHouseAccess('h1'), unknown: useRoleUnknown() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.unknown).toBe(true), { timeout: 5_000 });
    expect(result.current.access.view).toBe('limited');
  });
});

describe('FullViewGate', () => {
  test('while the tier is checked, a money page says so and shows nothing of it', () => {
    never();
    gate();
    expect(screen.getByRole('status').textContent).toBe('Checking your access...');
    expect(screen.queryByText('money')).toBeNull();
  });

  test('a peer leader is told the page is not for their role', async () => {
    tiersAre({ h1: 'peerLeader' });
    gate();
    expect(await screen.findByText("This page isn't available for your role.")).toBeTruthy();
    expect(screen.queryByText('money')).toBeNull();
  });

  test('a failed tier check refuses the page rather than showing it', async () => {
    callHttpsFunction.mockRejectedValue(new Error('unavailable'));
    gate();
    expect(
      await screen.findByText("This page isn't available for your role.", {}, { timeout: 5_000 }),
    ).toBeTruthy();
    expect(screen.queryByText('money')).toBeNull();
  });

  test('a manager gets the page', async () => {
    tiersAre({ h1: 'manager' });
    gate();
    expect(await screen.findByText('money')).toBeTruthy();
  });

  test('a page that needs no full view shows even while the tier is checked', () => {
    never();
    gate('route-HouseDisputes');
    expect(screen.getByText('money')).toBeTruthy();
  });
});
