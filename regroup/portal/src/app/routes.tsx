import { Routes } from '@mobile/navigation/types';
import Disputes from '@mobile/screens/Disputes/Disputes';
import DocumentListScreen from '@mobile/screens/Documents/DocumentListScreen';
import GuestList from '@mobile/screens/GuestList/GuestList';
import HouseSummary from '@mobile/screens/HouseOverview/HouseSummary/HouseSummary';
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
import HousesOverview from '@mobile/screens/HousesOverview/HousesOverview';
import Issues from '@mobile/screens/Issues/Issues';
import { PaymentHistory } from '@mobile/screens/Payments';
import EditUserInfoForm from '@mobile/screens/Profile/EditUserInfoForm';
import GuestHome from '@mobile/screens/Profile/GuestHome';
import UserInfo from '@mobile/screens/Profile/UserInfo';
import IntakeFormScreen from '@mobile/screens/ResidentIntake/IntakeFormScreen';
import StaffNotesFeed from '@mobile/screens/StaffNotes/StaffNotesFeed';

import { Home } from './Home';
import { ScreenFrame } from './ScreenFrame';
import { createSingleScreenNavigator } from './single-screen-navigator';
import { HOME_ROUTE, NOT_FOUND_ROUTE } from './urls';

const Stack = createSingleScreenNavigator() as any;

export const Screens = () => (
  <Stack.Navigator frame={ScreenFrame}>
    <Stack.Screen name={HOME_ROUTE} component={Home} />
    <Stack.Screen name={NOT_FOUND_ROUTE} component={Home} />
    <Stack.Screen name={Routes.GuestList} component={GuestList} />
    <Stack.Screen name={Routes.HouseDisputes} component={Disputes} />
    <Stack.Screen name={Routes.PaymentDashboard} component={PaymentDashboard} />
    <Stack.Screen name={Routes.Documents} component={DocumentListScreen} />
    <Stack.Screen name={Routes.HouseSummary} component={HouseSummary} />
    <Stack.Screen name={Routes.HouseList} component={HousesOverview} />
    <Stack.Screen name={Routes.Beds} component={Beds} />
    <Stack.Screen name={Routes.ApplicationList} component={ApplicationListScreen} />
    <Stack.Screen name={Routes.ApplicationDetail} component={ApplicationDetailScreen} />
    <Stack.Screen name={Routes.ResidentIntake} component={IntakeFormScreen} />
    <Stack.Screen name={Routes.GuestOverview} component={GuestHome} />
    <Stack.Screen name={Routes.GuestInfo} component={UserInfo} />
    <Stack.Screen name={Routes.EditUserInfo} component={EditUserInfoForm} />
    <Stack.Screen name={Routes.StaffNotes} component={StaffNotesFeed} />
    <Stack.Screen name={Routes.BalanceDashboard} component={BalanceDashboard} />
    <Stack.Screen name={Routes.PaymentHistory} component={PaymentHistory} />
    <Stack.Screen name={Routes.Activities} component={ActivityScreen} />
    <Stack.Screen name={Routes.MeetingSummary} component={GuestMeetingSummary} />
    <Stack.Screen name={Routes.WorkSummary} component={GuestWorkSummary} />
    <Stack.Screen name={Routes.ChoreSummary} component={GuestChoreSummary} />
    <Stack.Screen name={Routes.SupporterSummary} component={GuestSupporterSummary} />
    <Stack.Screen name={Routes.MedicationSummary} component={GuestMedicationSummary} />
    <Stack.Screen name={Routes.DrugTesting} component={DrugTestingScreen} />
    <Stack.Screen name={Routes.DrugTestForm} component={DrugTestForm} />
    <Stack.Screen name={Routes.DrugTestHistory} component={DrugTestHistory} />
    <Stack.Screen name={Routes.Issues} component={Issues} />
    <Stack.Screen name={Routes.Complaints} component={Complaints} />
    <Stack.Screen name={Routes.AdminReport} component={AdminReportScreen} />
  </Stack.Navigator>
);
