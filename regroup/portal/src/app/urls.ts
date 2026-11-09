// The portal's URL scheme. URLs carry ids only, never a resident's details.
import { Routes } from '@mobile/navigation/types';

export type Section = 'summary' | 'residents' | 'applications' | 'payments' | 'disputes' | 'activities' | 'reports';

export const HOME_ROUTE = 'portalHome';
export const NOT_FOUND_ROUTE = 'portalNotFound';
export const HOUSE_LIST_ROUTE: string = Routes.HouseList;

export const SECTIONS: Record<Section, { route: string; path: string; label: string }> = {
  summary: { route: Routes.HouseSummary, path: 'houses/:houseId', label: 'House' },
  residents: { route: Routes.GuestList, path: 'houses/:houseId/residents', label: 'Residents' },
  applications: { route: Routes.ApplicationList, path: 'houses/:houseId/applications', label: 'Applications' },
  payments: { route: Routes.PaymentDashboard, path: 'houses/:houseId/payments', label: 'Payments' },
  disputes: { route: Routes.HouseDisputes, path: 'houses/:houseId/disputes', label: 'Disputes' },
  activities: { route: Routes.Activities, path: 'houses/:houseId/activities', label: 'Activities' },
  reports: { route: Routes.AdminReport, path: 'houses/:houseId/reports', label: 'Reports' },
};

// Screens that open with only a house, so a reload can bring them back.
const HOUSE_SCREEN_PATHS: Record<string, string> = {
  [Routes.Beds]: 'houses/:houseId/beds',
  [Routes.Issues]: 'houses/:houseId/issues',
  [Routes.Complaints]: 'houses/:houseId/complaints',
  [Routes.DrugTesting]: 'houses/:houseId/drug-tests',
};

const RECORD_PATH = 'houses/:houseId/residents/:guestId';
export const RESIDENT_ROUTE: string = Routes.GuestOverview;
export const RESIDENT_ROUTE_PATHS: Record<string, string> = {
  [Routes.GuestOverview]: RECORD_PATH,
  [Routes.GuestInfo]: `${RECORD_PATH}/profile`,
  [Routes.EditUserInfo]: `${RECORD_PATH}/edit`,
  [Routes.PaymentHistory]: `${RECORD_PATH}/payments`,
  [Routes.MeetingSummary]: `${RECORD_PATH}/meetings`,
  [Routes.WorkSummary]: `${RECORD_PATH}/work`,
  [Routes.ChoreSummary]: `${RECORD_PATH}/chores`,
  [Routes.SupporterSummary]: `${RECORD_PATH}/supporter`,
  [Routes.MedicationSummary]: `${RECORD_PATH}/medication`,
};

export const residentPath = (houseId: string, guestId: string): string =>
  `/houses/${encodeURIComponent(houseId)}/residents/${encodeURIComponent(guestId)}`;

// Params with no slot in a path become a query string, and reused screens pass
// names that way (a Documents title, a Staff Notes guestName). URLs hold ids only.
export const stripQuery = (path: string): string => path.split('?')[0];

export const sectionPath = (houseId: string, section: Section): string =>
  `/${SECTIONS[section].path.replace(':houseId', encodeURIComponent(houseId))}`;

export function houseIdFromPath(pathname: string): string | null {
  const match = /^\/houses\/([^/]+)(\/|$)/.exec(pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function linkingConfig(origin: string) {
  const screens: Record<string, string> = {
    [HOME_ROUTE]: '',
    [NOT_FOUND_ROUTE]: '*',
    [HOUSE_LIST_ROUTE]: 'houses',
    ...HOUSE_SCREEN_PATHS,
    ...RESIDENT_ROUTE_PATHS,
  };
  for (const { route, path } of Object.values(SECTIONS)) screens[route] = path;
  return { prefixes: [origin], config: { screens } };
}
