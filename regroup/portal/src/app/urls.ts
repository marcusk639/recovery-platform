// The portal's URL scheme. URLs carry ids only, never a resident's details.
import { Routes } from '@mobile/navigation/types';

export type Section =
  | 'summary'
  | 'residents'
  | 'beds'
  | 'applications'
  | 'payments'
  | 'balances'
  | 'disputes'
  | 'activities'
  | 'drugTests'
  | 'issues'
  | 'complaints'
  | 'reports';

export const HOME_ROUTE = 'portalHome';
export const NOT_FOUND_ROUTE = 'portalNotFound';
export const HOUSE_LIST_ROUTE: string = Routes.HouseList;
// The phone's StaffNotesFeed with type shift_log, under a route of its own so it can have a URL.
export const SHIFT_LOG_ROUTE = 'portalShiftLog';

// In tab order, from the layout the owner picked.
export const SECTIONS: Record<Section, { route: string; path: string; label: string }> = {
  summary: { route: Routes.HouseSummary, path: 'houses/:houseId', label: 'Overview' },
  residents: { route: Routes.GuestList, path: 'houses/:houseId/residents', label: 'Residents' },
  beds: { route: Routes.Beds, path: 'houses/:houseId/beds', label: 'Beds' },
  applications: { route: Routes.ApplicationList, path: 'houses/:houseId/applications', label: 'Applications' },
  payments: { route: Routes.PaymentDashboard, path: 'houses/:houseId/payments', label: 'Payments' },
  // The phone has no link to Balance Details; here it's a tab (owner, 2026-11-10).
  balances: { route: Routes.BalanceDashboard, path: 'houses/:houseId/payments/balances', label: 'Balances' },
  disputes: { route: Routes.HouseDisputes, path: 'houses/:houseId/disputes', label: 'Disputes' },
  activities: { route: Routes.Activities, path: 'houses/:houseId/activities', label: 'Activities' },
  drugTests: { route: Routes.DrugTesting, path: 'houses/:houseId/drug-tests', label: 'Drug tests' },
  issues: { route: Routes.Issues, path: 'houses/:houseId/issues', label: 'Issues' },
  complaints: { route: Routes.Complaints, path: 'houses/:houseId/complaints', label: 'Complaints' },
  reports: { route: Routes.AdminReport, path: 'houses/:houseId/reports', label: 'Reports' },
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
  [Routes.StaffNotes]: `${RECORD_PATH}/notes`,
  [Routes.Documents]: `${RECORD_PATH}/documents`,
};

// Screens under a tab that aren't the tab itself. Without a path a reload lost the house.
const TAB_SCREENS: Record<string, { section: Section; path: string }> = {
  [Routes.DrugTestForm]: { section: 'drugTests', path: 'houses/:houseId/drug-tests/new' },
  [Routes.DrugTestHistory]: { section: 'drugTests', path: 'houses/:houseId/drug-tests/history/:guestId' },
};

export const residentPath = (houseId: string, guestId: string): string =>
  `/houses/${encodeURIComponent(houseId)}/residents/${encodeURIComponent(guestId)}`;

// Params with no slot in a path become a query string, and reused screens pass
// names that way (a Documents title, a Staff Notes guestName). URLs hold ids only.
export const stripQuery = (path: string): string => path.split('?')[0];

// The tab a route belongs to. A resident's screens sit under Residents.
export function sectionForRoute(routeName: string): Section | null {
  if (RESIDENT_ROUTE_PATHS[routeName]) return 'residents';
  if (TAB_SCREENS[routeName]) return TAB_SCREENS[routeName].section;
  const entry = (Object.entries(SECTIONS) as [Section, { route: string }][]).find(([, s]) => s.route === routeName);
  return entry ? entry[0] : null;
}

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
    [Routes.ApplicationDetail]: 'houses/:houseId/applications/:appId',
    [Routes.ResidentIntake]: 'houses/:houseId/intake',
    [SHIFT_LOG_ROUTE]: 'houses/:houseId/shift-log',
    ...RESIDENT_ROUTE_PATHS,
  };
  for (const { route, path } of Object.values(SECTIONS)) screens[route] = path;
  for (const [route, { path }] of Object.entries(TAB_SCREENS)) screens[route] = path;
  return { prefixes: [origin], config: { screens } };
}
