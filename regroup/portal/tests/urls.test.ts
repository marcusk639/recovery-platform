import { vi } from 'vitest';

// Mobile's tsconfig extends a package the portal doesn't install, so the real enum
// can't load here. The browser journeys in e2e/shell.spec.ts use the real one.
vi.mock('@mobile/navigation/types', () => ({
  Routes: new Proxy({}, { get: (_target, key) => `route-${String(key)}` }),
}));

import { houseIdFromPath, HOME_ROUTE, linkingConfig, residentPath, SECTIONS, sectionPath, stripQuery } from '../src/app/urls';

test('sectionPath builds the scheme', () => {
  expect(sectionPath('h1', 'residents')).toBe('/houses/h1/residents');
  expect(sectionPath('h1', 'applications')).toBe('/houses/h1/applications');
  expect(sectionPath('h1', 'summary')).toBe('/houses/h1');
});
test('houseIdFromPath finds the house', () => {
  expect(houseIdFromPath('/houses/h1/payments')).toBe('h1');
  expect(houseIdFromPath('/houses/h1')).toBe('h1');
  expect(houseIdFromPath('/')).toBeNull();
  expect(houseIdFromPath('/housesx/h1')).toBeNull();
});
test('every section has a real route name and a linking path', () => {
  const { screens } = linkingConfig('http://x').config;
  for (const section of Object.values(SECTIONS)) {
    expect(section.route).toMatch(/^route-/);
    expect(screens[section.route]).toBe(section.path);
  }
  expect(screens[HOME_ROUTE]).toBe('');
});
test('resident paths carry ids only', () => {
  expect(residentPath('h1', 'g 1')).toBe('/houses/h1/residents/g%201');
});
test('stripQuery removes everything after the path', () => {
  expect(stripQuery('/Documents?title=Bob%20Documents')).toBe('/Documents');
  expect(stripQuery('/houses/h1')).toBe('/houses/h1');
});
test('a malformed house URL is treated as no house rather than throwing', () => {
  expect(houseIdFromPath('/houses/%E0%A4%A/residents')).toBeNull();
});
test('the record and its screens have linking paths', () => {
  const { screens } = linkingConfig('http://x').config;
  expect(screens['route-GuestOverview']).toBe('houses/:houseId/residents/:guestId');
  expect(screens['route-GuestInfo']).toBe('houses/:houseId/residents/:guestId/profile');
  expect(screens['route-Beds']).toBe('houses/:houseId/beds');
});
