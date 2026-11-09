// Reused screens navigate by route name alone, because on the phone the selection
// lives in Redux. Here a route needs its ids, or its URL reads /houses/undefined/...
import { Routes } from '@mobile/navigation/types';
import { houseIdForState, isOutsideAnyHouse } from './current-house';
import { HOME_ROUTE, RESIDENT_ROUTE, RESIDENT_ROUTE_PATHS } from './urls';

interface RouteLike {
  name: string;
  params?: { houseId?: string; guestId?: string };
}
interface StateLike {
  index?: number;
  routes?: RouteLike[];
}

function nearestGuestId(state: StateLike, houseId: string | null): string | null {
  const routes = state.routes ?? [];
  for (let i = state.index ?? routes.length - 1; i >= 0; i--) {
    const route = routes[i];
    if (!route || isOutsideAnyHouse(route.name)) return null;
    if (route.params?.houseId && route.params.houseId !== houseId) return null;
    if (route.params?.guestId) return route.params.guestId;
  }
  return null;
}

export function withRouteContext(state: StateLike, action: any, selectedGuestId: string | null): any {
  if (action.type !== 'NAVIGATE' && action.type !== 'PUSH') return action;
  const name: string = action.payload?.name;
  if (!name || isOutsideAnyHouse(name)) return action;
  const given = action.payload.params ?? {};
  const params = { ...given };
  const houseId = given.houseId ?? houseIdForState(state);
  if (houseId) params.houseId = houseId;
  if (RESIDENT_ROUTE_PATHS[name] && !given.guestId) {
    const guestId = nearestGuestId(state, houseId) ?? selectedGuestId;
    if (guestId) params.guestId = guestId;
  }
  return { ...action, payload: { ...action.payload, params } };
}

// Where a back arrow goes on a screen opened by URL or reload, with nothing behind it.
export function parentOf(route: RouteLike): { name: string; params?: object } | null {
  if (isOutsideAnyHouse(route.name)) return null;
  const houseId = route.params?.houseId;
  const guestId = route.params?.guestId;
  if (route.name === RESIDENT_ROUTE) return { name: Routes.GuestList, params: { houseId } };
  if (RESIDENT_ROUTE_PATHS[route.name] && guestId) return { name: RESIDENT_ROUTE, params: { houseId, guestId } };
  if (route.name === Routes.HouseSummary || !houseId) return { name: HOME_ROUTE };
  return { name: Routes.HouseSummary, params: { houseId } };
}
