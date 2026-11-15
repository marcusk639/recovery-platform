import { accessFor, canAccessHouse, hasFullHouseView, operatorHouseIds, signInErrorMessage } from '../src/app/access';

const roles = { h1: 'admin', h2: 'guest', h3: 'superAdmin' };

test('admin and superAdmin houses are operator houses', () => {
  expect(operatorHouseIds(roles)).toEqual(['h1', 'h3']);
});
test('a house held only as a guest is not accessible', () => {
  expect(canAccessHouse(roles, 'h2')).toBe(false);
  expect(canAccessHouse(roles, 'h1')).toBe(true);
  expect(canAccessHouse(roles, 'unknown')).toBe(false);
});
test('a resident with no staff role is sent to the phone', () => {
  expect(accessFor({ isGuest: true }, { h2: 'guest' })).toBe('resident');
});
// Senior-peer residents hold guest and admin claims, and peer leaders are in scope.
test('a peer leader who is also a resident is an operator', () => {
  expect(accessFor({ isGuest: true, isAdmin: true }, { h1: 'admin' })).toBe('operator');
});
test('a manager is an operator without setup flags', () => {
  expect(accessFor({ isAdmin: true }, { h1: 'admin' })).toBe('operator');
});
test('an owner who has not finished setup is sent to the phone', () => {
  expect(accessFor({ isSuperAdmin: true, orgSetupCompleted: false }, { h1: 'superAdmin' })).toBe('setup-incomplete');
  expect(accessFor({ potentialSuperAdmin: true, orgSetupCompleted: false }, {})).toBe('setup-incomplete');
});
test('an owner who has finished setup is an operator', () => {
  expect(accessFor({ isSuperAdmin: true, orgSetupCompleted: true }, { h1: 'superAdmin' })).toBe('operator');
});
test('someone with no roles has no access', () => {
  expect(accessFor({}, {})).toBe('none');
  expect(accessFor(null, {})).toBe('none');
});
test('sign-in messages do not say which part was wrong', () => {
  expect(signInErrorMessage({ code: 'auth/wrong-password' })).toBe(signInErrorMessage({ code: 'auth/user-not-found' }));
  expect(signInErrorMessage({ code: 'auth/invalid-credential' })).toMatch(/email or password/);
});
test('too many attempts and connection failures have their own messages', () => {
  expect(signInErrorMessage({ code: 'auth/too-many-requests' })).toMatch(/too many/i);
  expect(signInErrorMessage(new Error('offline'))).toMatch(/connection/);
});
test('owners and co-owners get the full view without waiting for a tier', () => {
  expect(hasFullHouseView({ h1: 'superAdmin' }, undefined, 'h1')).toBe(true);
});
test('a manager gets the full view', () => {
  expect(hasFullHouseView({ h1: 'admin' }, { h1: 'manager' }, 'h1')).toBe(true);
  expect(hasFullHouseView({ h1: 'admin' }, { h1: 'owner' }, 'h1')).toBe(true);
});
test('a peer leader, or a tier nobody could confirm, gets the limited view', () => {
  expect(hasFullHouseView({ h1: 'admin' }, { h1: 'peerLeader' }, 'h1')).toBe(false);
  expect(hasFullHouseView({ h1: 'admin' }, undefined, 'h1')).toBe(false);
  expect(hasFullHouseView({ h1: 'admin' }, { h2: 'manager' }, 'h1')).toBe(false);
});
test('a tier does not outrank a missing role', () => {
  expect(hasFullHouseView({}, { h1: 'manager' }, 'h1')).toBe(false);
  expect(hasFullHouseView({ h1: 'guest' }, { h1: 'manager' }, 'h1')).toBe(false);
});
