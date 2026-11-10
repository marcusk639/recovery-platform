import { Routes } from '@mobile/navigation/types';
import Disputes from '@mobile/screens/Disputes/Disputes';
import DocumentListScreen from '@mobile/screens/Documents/DocumentListScreen';
import PaymentDashboard from '@mobile/screens/HouseSettings/PaymentDashboard';

import ActivityScreen from '@mobile/screens/Activity/ActivityScreen';
import AdminReportScreen from '@mobile/screens/AdminReport/AdminReportScreen';
import ApplicationDetailScreen from '@mobile/screens/Applications/ApplicationDetailScreen';
import ApplicationListScreen from '@mobile/screens/Applications/ApplicationListScreen';
import BalanceDashboard from '@mobile/screens/BalanceDashboard/BalanceDashboard';
import Beds from '@mobile/screens/Beds/Beds';
import Complaints from '@mobile/screens/Complaints/Complaints';
import DrugTestForm from '@mobile/screens/DrugTesting/DrugTestForm';
import DrugTestHistory from '@mobile/screens/DrugTesting/DrugTestHistory';
import DrugTestingScreen from '@mobile/screens/DrugTesting/DrugTestingScreen';
import GuestChoreSummary from '@mobile/screens/GuestChoreOverview/GuestChoreSummary/GuestChoreSummary';
import GuestMedicationSummary from '@mobile/screens/GuestMedicationOverview/GuestMedicationSummary/GuestMedicationSummary';
import GuestMeetingSummary from '@mobile/screens/GuestMeetingOverview/GuestMeetingSummary/GuestMeetingSummary';
import GuestSupporterSummary from '@mobile/screens/GuestSupporterOverview/GuestSupporterSummary/GuestSupporterSummary';
import GuestWorkSummary from '@mobile/screens/GuestWorkOverview/GuestWorkSummary/GuestWorkSummary';
import Issues from '@mobile/screens/Issues/Issues';
import { PaymentHistory } from '@mobile/screens/Payments';
import EditUserInfoForm from '@mobile/screens/Profile/EditUserInfoForm';
import UserInfo from '@mobile/screens/Profile/UserInfo';
import IntakeFormScreen from '@mobile/screens/ResidentIntake/IntakeFormScreen';
import StaffNotesFeed from '@mobile/screens/StaffNotes/StaffNotesFeed';

import { Home } from './Home';
import { isRouteReleased, SHOW_LATER_AREAS } from './houses/areas';
import { HousePage } from './houses/HousePage';
import { ResidentList } from './residents/ResidentList';
import { ResidentRecord } from './residents/ResidentRecord';
import { ScreenFrame } from './ScreenFrame';
import { createSingleScreenNavigator } from './single-screen-navigator';
import { HOME_ROUTE, NOT_FOUND_ROUTE, SHIFT_LOG_ROUTE } from './urls';

const Stack = createSingleScreenNavigator() as any;

// Areas that may ship after the core. Unregistered, a reused screen linking to one
// gets the navigator's visible "use the phone" alert (spec, section 5).
const LATER_SCREENS: [string, any][] = [
  [Routes.Documents, DocumentListScreen],
  [Routes.Beds, Beds],
  [Routes.DrugTesting, DrugTestingScreen],
  [Routes.DrugTestForm, DrugTestForm],
  [Routes.DrugTestHistory, DrugTestHistory],
  [Routes.Issues, Issues],
  [Routes.Complaints, Complaints],
  [Routes.AdminReport, AdminReportScreen],
];

export const Screens = () => (
  <Stack.Navigator frame={ScreenFrame}>
    <Stack.Screen name={HOME_ROUTE} component={Home} />
    <Stack.Screen name={NOT_FOUND_ROUTE} component={Home} />
    <Stack.Screen name={Routes.GuestList} component={ResidentList} />
    <Stack.Screen name={Routes.HouseDisputes} component={Disputes} />
    <Stack.Screen name={Routes.PaymentDashboard} component={PaymentDashboard} />
    <Stack.Screen name={Routes.HouseSummary} component={HousePage} />
    {/* The phone's list selects a house the URL would then override. */}
    <Stack.Screen name={Routes.HouseList} component={Home} />
    <Stack.Screen name={Routes.ApplicationList} component={ApplicationListScreen} />
    <Stack.Screen name={Routes.ApplicationDetail} component={ApplicationDetailScreen} />
    <Stack.Screen name={Routes.ResidentIntake} component={IntakeFormScreen} />
    <Stack.Screen name={Routes.GuestOverview} component={ResidentRecord} />
    <Stack.Screen name={Routes.GuestInfo} component={UserInfo} />
    <Stack.Screen name={Routes.EditUserInfo} component={EditUserInfoForm} />
    <Stack.Screen name={Routes.StaffNotes} component={StaffNotesFeed} />
    <Stack.Screen name={SHIFT_LOG_ROUTE} component={StaffNotesFeed} initialParams={{ type: 'shift_log' }} />
    {/* PhaseCustomization stays unregistered: its save swallows errors, so the
        visible "use the phone" alert is better than a silent failure. */}
    <Stack.Screen name={Routes.BalanceDashboard} component={BalanceDashboard} />
    <Stack.Screen name={Routes.PaymentHistory} component={PaymentHistory} />
    <Stack.Screen name={Routes.Activities} component={ActivityScreen} />
    <Stack.Screen name={Routes.MeetingSummary} component={GuestMeetingSummary} />
    <Stack.Screen name={Routes.WorkSummary} component={GuestWorkSummary} />
    <Stack.Screen name={Routes.ChoreSummary} component={GuestChoreSummary} />
    <Stack.Screen name={Routes.SupporterSummary} component={GuestSupporterSummary} />
    <Stack.Screen name={Routes.MedicationSummary} component={GuestMedicationSummary} />
    {LATER_SCREENS.filter(([route]) => isRouteReleased(route, SHOW_LATER_AREAS)).map(([route, component]) => (
      <Stack.Screen key={route} name={route} component={component} />
    ))}
  </Stack.Navigator>
);
