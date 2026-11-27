// The operator-only screens, each registered behind its own role check (P5
// Task 20). These modal routes sit outside SubscriptionGate and are reached
// by navigation only (the linking config does not expose them), so the check
// here is the second line after the entry points; the rules are the last.
// Peer leaders hold the same admin claim as managers, so the money screens
// ask for 'manager'.
import type React from 'react';
import { withHouseRole } from '../components/require-house-role/withHouseRole';
import type { HouseRank } from '../components/require-house-role/RequireHouseRole';
import { Routes } from './types';
import DrugTestingScreen from '../screens/DrugTesting/DrugTestingScreen';
import DrugTestForm from '../screens/DrugTesting/DrugTestForm';
import DrugTestHistory from '../screens/DrugTesting/DrugTestHistory';
import IntakeFormScreen from '../screens/ResidentIntake/IntakeFormScreen';
import ApplicationListScreen from '../screens/Applications/ApplicationListScreen';
import ApplicationDetailScreen from '../screens/Applications/ApplicationDetailScreen';
import GuestImportScreen from '../screens/GuestImport/GuestImportScreen';
import BalanceDashboard from '../screens/BalanceDashboard/BalanceDashboard';
import PaymentDashboard from '../screens/HouseSettings/PaymentDashboard';
import HouseSettings from '../screens/HouseSettings/HouseSettings';
import StripeSettingsScreen from '../screens/HouseSettings/StripeSettingsScreen';
import AdminReportScreen from '../screens/AdminReport/AdminReportScreen';
import StaffNotesFeed from '../screens/StaffNotes/StaffNotesFeed';
import RentSettingsScreen from '../screens/HouseSettings/RentSettingsScreen';
import GuestBalanceScreen from '../screens/GuestUpdate/GuestBalanceScreen';

const SCREENS: Record<string, [React.ComponentType<any>, HouseRank]> = {
  [Routes.DrugTesting]: [DrugTestingScreen, 'admin'],
  [Routes.DrugTestForm]: [DrugTestForm, 'admin'],
  // Only DrugTesting opens a history; residents don't see their own.
  [Routes.DrugTestHistory]: [DrugTestHistory, 'admin'],
  [Routes.ResidentIntake]: [IntakeFormScreen, 'admin'],
  [Routes.ApplicationList]: [ApplicationListScreen, 'admin'],
  [Routes.ApplicationDetail]: [ApplicationDetailScreen, 'admin'],
  // Owners and managers (owner, 2026-11-27): bulk-adding residents.
  [Routes.GuestImport]: [GuestImportScreen, 'manager'],
  // Staff rank, though its only entry (HouseSummary's gear, house:full-edit)
  // is the owner's: the screen hides its money, Connect and Reports entries
  // by rank itself.
  [Routes.HouseSettings]: [HouseSettings, 'admin'],
  [Routes.StaffNotes]: [StaffNotesFeed, 'admin'],
  [Routes.BalanceDashboard]: [BalanceDashboard, 'manager'],
  [Routes.PaymentDashboard]: [PaymentDashboard, 'manager'],
  // Stripe Connect setup: the Connect callables accept only the house's owners.
  [Routes.StripeSettings]: [StripeSettingsScreen, 'owner'],
  // No house money, but peer leaders get no Reports (portal spec §5, owner
  // 2026-11-09).
  [Routes.AdminReport]: [AdminReportScreen, 'manager'],
  // House Settings → Rent: every admin. A peer leader gets the read-only view
  // (useMayEditRentMoney); residents are refused.
  [Routes.RentSettings]: [RentSettingsScreen, 'admin'],
  // A resident's balance, for staff correcting it: owners and managers, as the
  // rules' rentMoneyByManager. Only GuestHome's staff Balance card opens it.
  [Routes.GuestBalance]: [GuestBalanceScreen, 'manager'],
};

/** Route → its minimum rank, for the guard tests. */
export const GUARDED_ROUTE_RANKS: Record<string, HouseRank> = Object.fromEntries(
  Object.entries(SCREENS).map(([route, [, rank]]) => [route, rank]),
);

/** Route → the screen wrapped in its role check, for navigators.tsx. */
export const guardedScreens: Record<string, React.ComponentType<any>> = Object.fromEntries(
  Object.entries(SCREENS).map(([route, [Screen, rank]]) => [route, withHouseRole(Screen, rank)]),
);
