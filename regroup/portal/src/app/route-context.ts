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

// The phone nests its house screens under Routes.House ({ screen }); the portal has them flat.
function unnest(action: any): any {
  const params = action.payload?.params;
  if (action.payload?.name !== Routes.House || !params?.screen) return action;
  return { ...action, payload: { ...action.payload, name: params.screen, params: params.params } };
}

export function withRouteContext(state: StateLike, original: any, selectedGuestId: string | null): any {
  if (original.type !== 'NAVIGATE' && original.type !== 'PUSH') return original;
  const action = unnest(original);
  const name: string = action.payload?.name;
  if (!name || isOutsideAnyHouse(name)) return action === original ? original : action;
  const given = action.payload.params ?? {};
  const params = { ...given };
  const houseId = given.houseId ?? houseIdForState(state);
  if (houseId) params.houseId = houseId;
  if (RESIDENT_ROUTE_PATHS[name] && !given.guestId) {
    const guestId = nearestGuestId(state, houseId) ?? selectedGuestId;
    if (guestId) params.guestId = guestId;
  }
  if (name === Routes.StaffNotes && params.guestId && !params.type) params.type = 'resident_note';
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
