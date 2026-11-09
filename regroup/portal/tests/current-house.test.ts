import { vi } from 'vitest';

vi.mock('@mobile/navigation/types', () => ({
  Routes: new Proxy({}, { get: (_target, key) => `route-${String(key)}` }),
}));

import { houseIdForState } from '../src/app/current-house';
import { HOME_ROUTE } from '../src/app/urls';

const state = (index: number, ...routes: { name: string; params?: { houseId?: string } }[]) => ({ index, routes });

test('a route with a house in its params is that house', () => {
  expect(houseIdForState(state(0, { name: 'residents', params: { houseId: 'a' } }))).toBe('a');
});
test('home has no house', () => {
  expect(houseIdForState(state(0, { name: HOME_ROUTE }))).toBeNull();
});
test('a route with no house belongs to the nearest house before it', () => {
  expect(houseIdForState(state(1, { name: 'summary', params: { houseId: 'a' } }, { name: 'issues' }))).toBe('a');
});
test('the search stops at home', () => {
  expect(houseIdForState(state(2, { name: 'summary', params: { houseId: 'a' } }, { name: HOME_ROUTE }, { name: 'issues' }))).toBeNull();
});
test('Back to an earlier route uses that route, not a later house', () => {
  const routes = [{ name: 'summary', params: { houseId: 'a' } }, { name: 'issues' }, { name: 'summary', params: { houseId: 'b' } }];
  expect(houseIdForState(state(1, ...routes))).toBe('a');
});
test('no state has no house', () => {
  expect(houseIdForState(undefined)).toBeNull();
});
