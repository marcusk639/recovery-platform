import { vi } from 'vitest';

vi.mock('@mobile/navigation/types', () => ({
  Routes: new Proxy({}, { get: (_target, key) => `route-${String(key)}` }),
}));

import { areasFor, isRouteReleased, needsFullView, sectionsFor } from '../src/app/houses/areas';
import { sectionForRoute } from '../src/app/urls';

test('the page keeps adding a resident', () => {
  expect(areasFor({}).map((a) => a.label)).toContain('Add a resident');
});
test('governance links show only for an Oxford house, and say to use the phone', () => {
  expect(areasFor({}).map((a) => a.label)).not.toContain('Oxford House Hub');
  expect(areasFor({ houseType: 'oxford' }).filter((a) => a.stage === 'phone').length).toBe(5);
});
test('later sections disappear until they ship', () => {
  for (const later of ['beds', 'drugTests', 'issues', 'complaints', 'reports']) {
    expect(sectionsFor(false, true)).not.toContain(later);
    expect(sectionsFor(true, true)).toContain(later);
  }
  expect(sectionsFor(false, true)).toContain('disputes');
});
test('a limited view gets no payments or reports', () => {
  expect(sectionsFor(true, false)).not.toContain('payments');
  expect(sectionsFor(true, false)).not.toContain('reports');
  expect(sectionsFor(true, false)).toContain('residents');
  expect(sectionsFor(true, true)).toContain('payments');
});
test('tabs keep the mockup order, with Balances after Payments (owner, 2026-11-10)', () => {
  expect(sectionsFor(true, true)).toEqual([
    'summary', 'residents', 'beds', 'applications', 'payments', 'balances', 'disputes',
    'activities', 'drugTests', 'issues', 'complaints', 'reports',
  ]);
});
test('a resident screen counts as the Residents tab', () => {
  expect(sectionForRoute('route-GuestOverview')).toBe('residents');
  expect(sectionForRoute('route-GuestInfo')).toBe('residents');
  expect(sectionForRoute('route-HouseDisputes')).toBe('disputes');
  expect(sectionForRoute('route-ApplicationDetail')).toBeNull();
});
test('a later route is unregistered until it ships, so a reused screen linking to it alerts', () => {
  for (const later of ['Beds', 'Issues', 'Complaints', 'DrugTesting', 'DrugTestForm', 'DrugTestHistory', 'Documents', 'AdminReport']) {
    expect(isRouteReleased(`route-${later}`, false)).toBe(false);
    expect(isRouteReleased(`route-${later}`, true)).toBe(true);
  }
  expect(isRouteReleased('route-HouseDisputes', false)).toBe(true);
});
test('payments, reports and balances need the full view, even by URL', () => {
  expect(needsFullView('route-PaymentDashboard')).toBe(true);
  expect(needsFullView('route-AdminReport')).toBe(true);
  expect(needsFullView('route-BalanceDashboard')).toBe(true);
  expect(needsFullView('route-HouseDisputes')).toBe(false);
  // A resident's own payments too (owner, 2026-11-11).
  expect(needsFullView('route-PaymentHistory')).toBe(true);
});
test('the house page offers the shift log', () => {
  expect(areasFor({}).map((a) => a.label)).toEqual(['Add a resident', 'Shift log']);
});

test('a peer leader gets neither Payments nor Balances (owner, 2026-11-09)', () => {
  expect(sectionsFor(true, false)).not.toContain('balances');
  expect(sectionsFor(true, true)).toContain('balances');
  const full = sectionsFor(true, true);
  expect(full[full.indexOf('payments') + 1]).toBe('balances');
});
