// The house the current screen belongs to, derived from navigation state. A reused
// screen with no house in its route belongs to the nearest house before it.
import { HOME_ROUTE, HOUSE_LIST_ROUTE, NOT_FOUND_ROUTE } from './urls';

interface RouteLike {
  name: string;
  params?: { houseId?: string; guestId?: string };
}

export const isOutsideAnyHouse = (name: string): boolean =>
  name === HOME_ROUTE || name === NOT_FOUND_ROUTE || name === HOUSE_LIST_ROUTE;

export function houseIdForState(state: { index?: number; routes?: RouteLike[] } | undefined): string | null {
  const routes = state?.routes ?? [];
  for (let i = state?.index ?? routes.length - 1; i >= 0; i--) {
    const route = routes[i];
    if (!route || isOutsideAnyHouse(route.name)) return null;
    if (route.params?.houseId) return route.params.houseId;
  }
  return null;
}

export function guestIdForState(state: { index?: number; routes?: RouteLike[] } | undefined): string | null {
  const routes = state?.routes ?? [];
  return routes[state?.index ?? routes.length - 1]?.params?.guestId ?? null;
}
