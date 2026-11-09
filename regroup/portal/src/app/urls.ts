// The portal's URL scheme. URLs carry ids only, never a resident's details.
import { Routes } from '@mobile/navigation/types';

export type Section = 'summary' | 'residents' | 'applications' | 'payments' | 'disputes' | 'activities' | 'reports';

export const HOME_ROUTE = 'portalHome';
export const NOT_FOUND_ROUTE = 'portalNotFound';

export const SECTIONS: Record<Section, { route: string; path: string; label: string }> = {
  summary: { route: Routes.HouseSummary, path: 'houses/:houseId', label: 'House' },
  residents: { route: Routes.GuestList, path: 'houses/:houseId/residents', label: 'Residents' },
  applications: { route: Routes.ApplicationList, path: 'houses/:houseId/applications', label: 'Applications' },
  payments: { route: Routes.PaymentDashboard, path: 'houses/:houseId/payments', label: 'Payments' },
  disputes: { route: Routes.HouseDisputes, path: 'houses/:houseId/disputes', label: 'Disputes' },
  activities: { route: Routes.Activities, path: 'houses/:houseId/activities', label: 'Activities' },
  reports: { route: Routes.AdminReport, path: 'houses/:houseId/reports', label: 'Reports' },
};

export const sectionPath = (houseId: string, section: Section): string =>
  `/${SECTIONS[section].path.replace(':houseId', encodeURIComponent(houseId))}`;

export function houseIdFromPath(pathname: string): string | null {
  const match = /^\/houses\/([^/]+)(\/|$)/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

export function linkingConfig(origin: string) {
  const screens: Record<string, string> = { [HOME_ROUTE]: '', [NOT_FOUND_ROUTE]: '*' };
  for (const { route, path } of Object.values(SECTIONS)) screens[route] = path;
  return { prefixes: [origin], config: { screens } };
}
