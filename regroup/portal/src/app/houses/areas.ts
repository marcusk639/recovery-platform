// What a house offers beyond its tabs, and which areas have shipped.
import { Routes } from '@mobile/navigation/types';
import type { Section } from '../urls';

export interface Area {
  label: string;
  route: string;
  stage: 'core' | 'phone';
  params?: object;
}

// The core ships first if the work runs late (spec, section 5). P7 decides this.
export const SHOW_LATER_AREAS = true;

const ORDER: Section[] = [
  'summary', 'residents', 'beds', 'applications', 'payments', 'disputes',
  'activities', 'drugTests', 'issues', 'complaints', 'reports',
];
const LATER_SECTIONS = new Set<Section>(['beds', 'drugTests', 'issues', 'complaints', 'reports']);
// Peer leaders see less (owner decision, 2026-11-09).
const FULL_VIEW_SECTIONS = new Set<Section>(['payments', 'reports']);

const LATER_ROUTES = new Set<string>([
  Routes.Beds,
  Routes.Issues,
  Routes.Complaints,
  Routes.DrugTesting,
  Routes.DrugTestForm,
  Routes.DrugTestHistory,
  Routes.Documents,
  Routes.AdminReport,
]);

// Pages a peer leader doesn't get, even by URL or bookmark (owner decision, 2026-11-09).
const FULL_VIEW_ROUTES = new Set<string>([Routes.PaymentDashboard, Routes.AdminReport, Routes.BalanceDashboard]);
export const needsFullView = (route: string): boolean => FULL_VIEW_ROUTES.has(route);

export const sectionsFor = (showLater: boolean, fullView: boolean): Section[] =>
  ORDER.filter((s) => (showLater || !LATER_SECTIONS.has(s)) && (fullView || !FULL_VIEW_SECTIONS.has(s)));

// An unregistered route reaches the navigator's visible "use the phone" alert.
export const isRouteReleased = (route: string, showLater: boolean): boolean => showLater || !LATER_ROUTES.has(route);

// Oxford governance stays on the phone (spec, section 5). Labels match HouseSummary.
const OXFORD: Area[] = [
  { label: 'Oxford House Hub', route: Routes.OxfordDashboard, stage: 'phone' },
  { label: 'Officers', route: Routes.OfficerManagement, stage: 'phone' },
  { label: 'Equal Expense Share', route: Routes.EESTracker, stage: 'phone' },
  { label: 'Business Meetings', route: Routes.BusinessMeetings, stage: 'phone' },
  { label: 'Voting', route: Routes.OxfordVoting, stage: 'phone' },
];

export function areasFor(house: { houseType?: string; id?: string }): Area[] {
  const areas: Area[] = [
    { label: 'Add a resident', route: Routes.ResidentIntake, stage: 'core', params: { houseId: house.id } },
  ];
  return house.houseType === 'oxford' ? [...areas, ...OXFORD] : areas;
}
