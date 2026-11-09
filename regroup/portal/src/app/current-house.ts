// The house the current screen belongs to, read from navigation state. A reused
// screen with no house in its route keeps the house it was opened from.
import { useSyncExternalStore } from 'react';
import { HOME_ROUTE, houseIdFromPath, NOT_FOUND_ROUTE } from './urls';

let current: string | null = typeof location === 'undefined' ? null : houseIdFromPath(location.pathname);
const listeners = new Set<() => void>();

function focusedRoute(state: any): { name?: string; params?: { houseId?: string } } | undefined {
  let route = state?.routes?.[state.index ?? 0];
  while (route?.state) route = route.state.routes?.[route.state.index ?? 0];
  return route;
}

export function trackNavigationState(state: unknown): void {
  const route = focusedRoute(state);
  if (!route) return;
  const home = route.name === HOME_ROUTE || route.name === NOT_FOUND_ROUTE;
  const next = home ? null : (route.params?.houseId ?? current);
  if (next === current) return;
  current = next;
  listeners.forEach((listener) => listener());
}

export function useCurrentHouseId(): string | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
