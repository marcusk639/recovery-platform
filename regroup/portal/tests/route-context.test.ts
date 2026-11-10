import { vi } from 'vitest';

vi.mock('@mobile/navigation/types', () => ({
  Routes: new Proxy({}, { get: (_target, key) => `route-${String(key)}` }),
}));

import { parentOf, withRouteContext } from '../src/app/route-context';

const state = (routes: any[]) => ({ index: routes.length - 1, routes });
const nav = (name: string, params?: object) => ({ type: 'NAVIGATE', payload: { name, params } });
const inHouse = state([{ name: 'route-GuestList', params: { houseId: 'h1' } }]);
const paramsOf = (action: any) => action.payload.params;

test('a reused screen navigating with no params keeps the current house', () => {
  expect(paramsOf(withRouteContext(inHouse, nav('route-ApplicationList'), null))).toEqual({ houseId: 'h1' });
});
test('params the screen passed are kept', () => {
  expect(paramsOf(withRouteContext(inHouse, nav('route-Documents', { title: 'x' }), null))).toEqual({ title: 'x', houseId: 'h1' });
});
test('an explicit house wins', () => {
  expect(paramsOf(withRouteContext(inHouse, nav('route-GuestList', { houseId: 'h2' }), null)).houseId).toBe('h2');
});
test('a resident screen takes the nearest resident, then the selected one', () => {
  const onRecord = state([{ name: 'route-GuestOverview', params: { houseId: 'h1', guestId: 'g1' } }]);
  expect(paramsOf(withRouteContext(onRecord, nav('route-GuestInfo'), 'g9')).guestId).toBe('g1');
  expect(paramsOf(withRouteContext(inHouse, nav('route-GuestInfo'), 'g9')).guestId).toBe('g9');
});
test('a house screen does not pick up a resident', () => {
  expect(paramsOf(withRouteContext(inHouse, nav('route-Beds'), 'g9'))).toEqual({ houseId: 'h1' });
});
test('home and the house list get no house', () => {
  expect(paramsOf(withRouteContext(inHouse, nav('portalHome'), null))).toBeUndefined();
  expect(paramsOf(withRouteContext(inHouse, nav('route-HouseList'), null))).toBeUndefined();
});
test('other actions pass through untouched', () => {
  const goBack = { type: 'GO_BACK' };
  expect(withRouteContext(inHouse, goBack, null)).toBe(goBack);
});
test('the walk for a resident stops at home', () => {
  const crossed = state([
    { name: 'route-GuestOverview', params: { houseId: 'h1', guestId: 'g1' } },
    { name: 'portalHome' },
    { name: 'route-GuestList', params: { houseId: 'h2' } },
  ]);
  expect(paramsOf(withRouteContext(crossed, nav('route-GuestInfo'), 'g9')).guestId).toBe('g9');
});
test('the walk for a resident stops at another house', () => {
  const crossed = state([
    { name: 'route-GuestOverview', params: { houseId: 'h1', guestId: 'g1' } },
    { name: 'route-GuestList', params: { houseId: 'h2' } },
  ]);
  expect(paramsOf(withRouteContext(crossed, nav('route-GuestInfo'), 'g9')).guestId).toBe('g9');
});
test('going up a level from each kind of screen', () => {
  const ids = { houseId: 'h1', guestId: 'g1' };
  expect(parentOf({ name: 'route-GuestInfo', params: ids })).toEqual({ name: 'route-GuestOverview', params: ids });
  expect(parentOf({ name: 'route-GuestOverview', params: ids })).toEqual({ name: 'route-GuestList', params: { houseId: 'h1' } });
  expect(parentOf({ name: 'route-Beds', params: { houseId: 'h1' } })).toEqual({ name: 'route-HouseSummary', params: { houseId: 'h1' } });
  expect(parentOf({ name: 'route-HouseSummary', params: { houseId: 'h1' } })).toEqual({ name: 'portalHome' });
  expect(parentOf({ name: 'portalHome' })).toBeNull();
});
test("the phone's nested House route goes straight to the screen it names", () => {
  const action = withRouteContext(inHouse, nav('route-House', { screen: 'route-HouseDisputes' }), null);
  expect(action.payload.name).toBe('route-HouseDisputes');
  expect(action.payload.params).toEqual({ houseId: 'h1' });
});
test('resident notes get their type when a screen leaves it out', () => {
  const onRecord = state([{ name: 'route-GuestOverview', params: { houseId: 'h1', guestId: 'g1' } }]);
  expect(paramsOf(withRouteContext(onRecord, nav('route-StaffNotes'), null))).toMatchObject({ houseId: 'h1', guestId: 'g1', type: 'resident_note' });
});
test('a type the screen passed is kept', () => {
  expect(paramsOf(withRouteContext(inHouse, nav('route-StaffNotes', { type: 'shift_log' }), null)).type).toBe('shift_log');
});
