// src/navigation/types.ts
import {
  CompositeNavigationProp,
  NavigatorScreenParams,
} from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

// Define all route names as constants
export enum Routes {
  // Auth Routes
  PriorAuth = 'priorAuth',
  InitialLanding = 'initialLanding',
  Login = 'login',
  Signup = 'signup',
  NewAccount = 'newAccount',
  HouseSearch = 'houseSearch',
  ManagerIntro = 'managerIntro',
  IntroHouseSummary = 'introHouseSummary',
  // Setup Routes
  Setup = 'setup',
  OrgSetup = 'orgSetup',
  OperatorSetupWizard = 'operatorSetupWizard',
  InAppOrgSetup = 'inAppOrgSetup',
  // Main App Routes
  Main = 'main',

  // Tab Routes
  House = 'house',
  Guest = 'guest',
  Activities = 'activities',
  Contacts = 'contacts',
  HouseChat = 'houseChat',
  Personal = 'personal',

  // House Stack Routes
  HouseSummary = 'houseSummary',
  Beds = 'beds',
  HouseDisputes = 'houseDisputes',
  Issues = 'issues',
  Complaints = 'complaints',
  MeetingSearch = 'meetingSearch',

  // Guest Stack Routes
  GuestOverview = 'guestOverview',
  MeetingSummary = 'meetingSummary',
  WorkSummary = 'workSummary',
  ChoreSummary = 'choreSummary',
  SupporterSummary = 'supporterSummary',
  MedicationSummary = 'medicationSummary',

  // Contacts Stack Routes
  ContactsScreen = 'contactsScreen',
  DirectMessage = 'directMessage',

  // Utilities Stack Routes
  PersonalScreen = 'personalScreen',
  EditUserInfo = 'editUserInfo',

  // Oxford House Routes
  OxfordDashboard = 'oxfordDashboard',
  OxfordOnboardingWizard = 'oxfordOnboardingWizard',
  OfficerManagement = 'officerManagement',
  EESTracker = 'eesTracker',
  BusinessMeetings = 'businessMeetings',
  OxfordVoting = 'oxfordVoting',
  CharterCompliance = 'charterCompliance',

  // Treasury Routes
  TreasuryDashboard = 'treasuryDashboard',
  FinancialRecordForm = 'financialRecordForm',
  FinancialRecordDetail = 'financialRecordDetail',

  // Notification Routes
  Notifications = 'notifications',

  // Security Routes
  TwoFactorSetup = 'twoFactorSetup',

  // Payment Routes
  ResidentPayment = 'residentPayment',
  PaymentHistory = 'paymentHistory',
  PaymentDashboard = 'paymentDashboard',
  RentPayment = 'rentPayment',
  PaymentWebView = 'paymentWebView',

  // Drug Testing Routes
  DrugTesting = 'drugTesting',
  DrugTestForm = 'drugTestForm',
  DrugTestHistory = 'drugTestHistory',

  // Intake Routes
  ResidentIntake = 'residentIntake',

  // Application Routes
  Apply = 'apply',
  ApplicationStatus = 'applicationStatus',
  ApplicationList = 'applicationList',
  ApplicationDetail = 'applicationDetail',

  // Import Routes
  GuestImport = 'guestImport',

  // Document Routes
  Documents = 'documents',

  // Balance Routes
  BalanceDashboard = 'balanceDashboard',

  // Modal Routes
  HouseList = 'houseList',
  NewMeeting = 'newMeeting',
  GuestList = 'guestList',
  PhaseSetup = 'phaseSetup',
  HouseSettings = 'houseSettings',
  StripeSettings = 'stripeSettings',
  GuestInfo = 'guestInfo',
  PhaseCustomization = 'phaseCustomization',
  SubscriptionHandler = 'subscriptionHandler',
  SendInvites = 'sendInvites',
  AdminReport = 'adminReport',
  StaffNotes = 'staffNotes',
}

// DEPRECATED: Nested stack param lists removed in Phase 6.1
// All screens now live directly in RootStack or as MainTab screens
// export type HouseStackParamList = { ... };
// export type GuestStackParamList = { ... };
// export type ContactsStackParamList = { ... };
// export type UtilitiesStackParamList = { ... };

export type SetupStackParamList = {
  [Routes.OrgSetup]: undefined;
  [Routes.OperatorSetupWizard]: undefined;
};

export type AuthStackParamList = {
  [Routes.InitialLanding]: undefined;
  [Routes.Login]: undefined;
  [Routes.Signup]: { invitation?: any };
  [Routes.NewAccount]: undefined;
  [Routes.HouseSearch]: undefined;
  [Routes.ManagerIntro]: undefined;
  [Routes.IntroHouseSummary]: undefined;
} & SetupStackParamList;

// Phase 6.1: Simplified MainTab - direct screens only, no nested navigators
export type MainTabParamList = {
  [Routes.House]: undefined; // Direct to HouseSummary
  [Routes.Guest]: undefined; // Direct to GuestOverview
  [Routes.Activities]: undefined;
  [Routes.Contacts]: undefined; // Direct to ContactsScreen
  [Routes.HouseChat]: undefined;
  [Routes.Personal]: undefined; // Direct to PersonalScreen
};

// Phase 6.1: Consolidated RootStack with all screens as modals
export type RootStackParamList = {
  // Core navigation
  [Routes.PriorAuth]: NavigatorScreenParams<AuthStackParamList> & {
    initialRoute?: keyof AuthStackParamList;
  };
  [Routes.NewAccount]: undefined;
  [Routes.Setup]: NavigatorScreenParams<SetupStackParamList>;
  [Routes.Main]: NavigatorScreenParams<MainTabParamList> & {
    initialRoute?: keyof MainTabParamList;
  };

  // House screens (formerly HouseStack)
  [Routes.HouseSummary]: undefined;
  [Routes.Beds]: undefined;
  [Routes.HouseDisputes]: undefined;

  // Guest screens (formerly GuestStack)
  [Routes.GuestOverview]: undefined;
  [Routes.MeetingSummary]: undefined;
  [Routes.WorkSummary]: undefined;
  [Routes.ChoreSummary]: undefined;
  [Routes.SupporterSummary]: undefined;
  [Routes.MedicationSummary]: undefined;

  // Contacts screens (formerly ContactsStack)
  [Routes.ContactsScreen]: undefined;
  [Routes.DirectMessage]: { userId: string };

  // Utilities screens (formerly UtilitiesStack)
  [Routes.PersonalScreen]: undefined;
  [Routes.EditUserInfo]: undefined;
  [Routes.InAppOrgSetup]: undefined;

  // Shared/Modal screens (deduplicated)
  [Routes.Issues]: undefined;
  [Routes.Complaints]: undefined;

  // Other modal screens
  [Routes.HouseList]: undefined;
  [Routes.NewMeeting]: undefined;
  [Routes.GuestList]: undefined;
  [Routes.PhaseSetup]: undefined;
  [Routes.HouseSettings]: undefined;
  [Routes.StripeSettings]: undefined;
  [Routes.GuestInfo]: { userId: string };
  [Routes.PhaseCustomization]: undefined;
  [Routes.SubscriptionHandler]: undefined;
  [Routes.SendInvites]: undefined;
  [Routes.AdminReport]: undefined;
  [Routes.StaffNotes]: {
    houseId: string;
    type: 'resident_note' | 'shift_log';
    guestId?: string;
    guestName?: string;
  };
  [Routes.MeetingSearch]: undefined;

  // Oxford House screens
  [Routes.OxfordDashboard]: undefined;
  [Routes.OxfordOnboardingWizard]: undefined;
  [Routes.OfficerManagement]: undefined;
  [Routes.EESTracker]: undefined;
  [Routes.BusinessMeetings]: undefined;
  [Routes.OxfordVoting]: undefined;
  [Routes.CharterCompliance]: undefined;

  // Treasury screens
  [Routes.TreasuryDashboard]: undefined;
  [Routes.FinancialRecordForm]: { recordId?: string; houseId: string };
  [Routes.FinancialRecordDetail]: { recordId: string; houseId: string };

  // Notification screens
  [Routes.Notifications]: undefined;

  // Security screens
  [Routes.TwoFactorSetup]: undefined;

  // Payment screens
  [Routes.ResidentPayment]: { amount?: number };
  [Routes.PaymentHistory]: undefined;
  [Routes.PaymentDashboard]: undefined;
  [Routes.RentPayment]: undefined;
  [Routes.PaymentWebView]: {
    paymentUrl: string;
    amount: number;
    guestId: string;
  };

  // Drug Testing screens
  [Routes.DrugTesting]: undefined;
  [Routes.DrugTestForm]: { guestId?: string };
  [Routes.DrugTestHistory]: { guestId: string };

  // Intake screens
  [Routes.ResidentIntake]: { houseId: string; applicationId?: string };

  // Import screens
  [Routes.GuestImport]: undefined;

  // Document screens
  [Routes.Documents]: { houseId: string; guestId?: string; title: string };

  // Balance screens
  [Routes.BalanceDashboard]: undefined;

  // Application screens
  [Routes.Apply]: { houseId: string; houseName: string };
  [Routes.ApplicationStatus]: { houseId: string; houseName?: string };
  [Routes.ApplicationList]: undefined;
  [Routes.ApplicationDetail]: { houseId: string; appId: string };
};

/** Navigation prop for screens inside the auth stack (sibling routes only). */
export type AuthStackNavigationProp =
  NativeStackNavigationProp<AuthStackParamList>;

/**
 * Auth stack screens that also navigate to parent root routes (e.g. Main).
 * Use on InitialLanding, Login, SignUp, NewAccount, etc.
 */
export type AuthScreenNavigationProp = CompositeNavigationProp<
  AuthStackNavigationProp,
  NativeStackNavigationProp<RootStackParamList>
>;

/** Navigation prop for screens inside the setup stack (sibling routes only). */
export type SetupStackNavigationProp =
  NativeStackNavigationProp<SetupStackParamList>;

/**
 * Setup stack screens that also navigate to parent root routes (e.g. Main, PhaseSetup).
 * Use on OrgSetup, OperatorSetupWizard, and shared setup entities.
 */
export type SetupScreenNavigationProp = CompositeNavigationProp<
  SetupStackNavigationProp,
  NativeStackNavigationProp<RootStackParamList>
>;

// Extend navigation types for type safety
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
