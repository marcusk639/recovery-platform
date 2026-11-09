import { vi } from 'vitest';

// Mobile's tsconfig extends a package the portal doesn't install, so the real enum
// can't load here. The browser journeys in e2e/shell.spec.ts use the real one.
vi.mock('@mobile/navigation/types', () => ({
  Routes: new Proxy({}, { get: (_target, key) => `route-${String(key)}` }),
}));

import { houseIdFromPath, HOME_ROUTE, linkingConfig, SECTIONS, sectionPath } from '../src/app/urls';

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
