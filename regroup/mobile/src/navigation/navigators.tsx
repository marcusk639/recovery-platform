// src/navigation/index.tsx
// Phase 4.3: Added ErrorBoundary to navigators for better error handling
import React from 'react';
import {
  createNativeStackNavigator,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import FontAwesome5 from 'react-native-vector-icons/FontAwesome5';
import { useAppSelector } from '../state/hooks';
// Phase 6.3: Removed migration-utils (migration complete)
import ErrorBoundary from '../components/ErrorBoundary';
import SubscriptionGate from '../components/subscription/SubscriptionGate';
// Phase 6.1: Simplified imports - removed nested stack param lists
import {
  RootStackParamList,
  Routes,
  MainTabParamList,
  AuthStackParamList,
  SetupStackParamList,
} from './types';
import { normalize, color } from '../styles/theme';
import { UserPersonalButton } from '../components/title-bar-right-button';

// Import screens
import InitialLanding from '../screens/Landing/InitialLanding';
import LoginScreen from '../screens/Login/Login';
import SignUpScreen from '../screens/SignUp/SignUp';
import NewAccount from '../screens/NewAccount/NewAccount';
import HouseSearchScreen from '../screens/HouseSearch/HouseSearchScreen';
import NewManagerIntro from '../screens/NewManager/NewManager';
import OrgSetup from '../screens/SetupWizards/OrgSetup';
import OperatorSetupWizard from '../screens/SetupWizards/OperatorSetupWizard';
import HouseSummary from '../screens/HouseOverview/HouseSummary/HouseSummary';
import Beds from '../screens/Beds/Beds';
import Disputes from '../screens/Disputes/Disputes';
import Issues from '../screens/Issues/Issues';
import Complaints from '../screens/Complaints/Complaints';
import MeetingSearch from '../screens/StatUpdates/MeetingSearch';
import GuestHome from '../screens/Profile/GuestHome';
import GuestMeetingSummary from '../screens/GuestMeetingOverview/GuestMeetingSummary/GuestMeetingSummary';
import GuestWorkSummary from '../screens/GuestWorkOverview/GuestWorkSummary/GuestWorkSummary';
import GuestChoreSummary from '../screens/GuestChoreOverview/GuestChoreSummary/GuestChoreSummary';
import GuestSupporterSummary from '../screens/GuestSupporterOverview/GuestSupporterSummary/GuestSupporterSummary';
import GuestMedicationSummary from '../screens/GuestMedicationOverview/GuestMedicationSummary/GuestMedicationSummary';
import ContactScreen from '../screens/Contacts/ContactScreen';
import DirectChat from '../screens/DirectChat/DirectChat';
import Personal from '../screens/Personal/Personal';
import EditUserInfoForm from '../screens/Profile/EditUserInfoForm';
import ActivityScreen from '../screens/Activity/ActivityScreen';
import HouseChat from '../screens/HouseChat/HouseChat';
import HousesOverview from '../screens/HousesOverview/HousesOverview';
import NewMeeting from '../screens/StatUpdates/NewMeeting';
import GuestList from '../screens/GuestList/GuestList';
import { PhaseConfigSetup } from '../screens/SetupWizards/PhaseSetup/PhaseConfigSetup';
import HouseSettings from '../screens/HouseSettings/HouseSettings';
import StripeSettingsScreen from '../screens/HouseSettings/StripeSettingsScreen';
import UserInfo from '../screens/Profile/UserInfo';
import PhaseCustomization from '../screens/Profile/PhaseCustomization';
import SubscriptionHandler from '../screens/SubscriptionHandler/SubscriptionHandler';
import GuestInvites from '../screens/Profile/GuestInvites';
import IntroHouseSummary from '../screens/IntroHouseSummary/IntroHouseSummary';
import OxfordDashboard from '../screens/Oxford/OxfordDashboard';
import OxfordOnboardingWizard from '../screens/Oxford/OxfordOnboardingWizard';
import OfficerManagement from '../screens/Oxford/OfficerManagement';
import EESTracker from '../screens/Oxford/EESTracker';
import BusinessMeetings from '../screens/Oxford/BusinessMeetings';
import OxfordVoting from '../screens/Oxford/Voting';
import CharterCompliance from '../screens/Oxford/CharterCompliance';
import { ResidentPayment, PaymentHistory } from '../screens/Payments';
import PaymentDashboard from '../screens/HouseSettings/PaymentDashboard';
import DrugTestingScreen from '../screens/DrugTesting/DrugTestingScreen';
import DrugTestForm from '../screens/DrugTesting/DrugTestForm';
import DrugTestHistory from '../screens/DrugTesting/DrugTestHistory';
import IntakeFormScreen from '../screens/ResidentIntake/IntakeFormScreen';
import ApplyScreen from '../screens/Application/ApplyScreen';
import ApplicationStatusScreen from '../screens/Application/ApplicationStatusScreen';
import ApplicationListScreen from '../screens/Applications/ApplicationListScreen';
import ApplicationDetailScreen from '../screens/Applications/ApplicationDetailScreen';
import BalanceDashboard from '../screens/BalanceDashboard/BalanceDashboard';
import RentPaymentScreen from '../screens/RentPayment/RentPaymentScreen';
import PaymentWebView from '../screens/RentPayment/PaymentWebView';
import TwoFactorSetup from '../screens/Personal/TwoFactorSetup';
import NotificationsScreen from '../screens/Notifications/Notifications';
import TreasuryDashboard from '../screens/Treasury/TreasuryDashboard';
import FinancialRecordForm from '../screens/Treasury/FinancialRecordForm';
import FinancialRecordDetail from '../screens/Treasury/FinancialRecordDetail';
import GuestImportScreen from '../screens/GuestImport/GuestImportScreen';
import AdminReportScreen from '../screens/AdminReport/AdminReportScreen';
import DocumentListScreen from '../screens/Documents/DocumentListScreen';
import StaffNotesFeed from '../screens/StaffNotes/StaffNotesFeed';

// Wrapper to inject Redux guest+house into RentPaymentScreen
const RentPaymentConnector = ({ navigation }: any) => {
  const guest = useAppSelector((s: any) => s.guests.selectedGuest);
  const house = useAppSelector((s: any) => s.houses.selectedHouse);
  if (!guest || !house) return null;
  return (
    <RentPaymentScreen navigation={navigation} guest={guest} house={house} />
  );
};

// Phase 6.1: Simplified navigators - removed nested stacks
const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const SetupStack = createNativeStackNavigator<SetupStackParamList>();
const MainTab = createBottomTabNavigator<MainTabParamList>();

// Tab Navigator Icons
const getTabBarIcon = (routeName: string, focused: boolean, color: string) => {
  let iconName: string;

  switch (routeName) {
    case Routes.House:
      iconName = 'home';
      break;
    case Routes.Guest:
      iconName = 'user';
      break;
    case Routes.Activities:
      iconName = 'briefcase';
      break;
    case Routes.Contacts:
      iconName = 'address-book';
      break;
    case Routes.HouseChat:
      iconName = 'comment';
      break;
    case Routes.Personal:
      return <UserPersonalButton />;
    default:
      iconName = 'home';
  }

  return (
    <FontAwesome5 solid name={iconName} size={normalize(20)} color={color} />
  );
};

// Auth Stack Navigator (Phase 4.3: Wrapped with ErrorBoundary)
export const AuthNavigator = React.memo(
  ({ initialRoute }: { initialRoute?: keyof AuthStackParamList }) => {
    // Phase 6.3: Removed migration debug logging

    return (
      <ErrorBoundary>
        <AuthStack.Navigator
          screenOptions={{ headerShown: false }}
          initialRouteName={initialRoute}>
          <AuthStack.Screen
            name={Routes.InitialLanding}
            component={InitialLanding}
          />
          <AuthStack.Screen name={Routes.Login} component={LoginScreen} />
          <AuthStack.Screen name={Routes.Signup} component={SignUpScreen} />
          <AuthStack.Screen name={Routes.NewAccount} component={NewAccount} />
          <AuthStack.Screen
            name={Routes.HouseSearch}
            component={HouseSearchScreen}
          />
          <AuthStack.Screen
            name={Routes.ManagerIntro}
            component={NewManagerIntro}
          />
          <AuthStack.Screen
            name={Routes.IntroHouseSummary}
            component={IntroHouseSummary}
          />
          <AuthStack.Screen
            name={Routes.OperatorSetupWizard}
            component={OperatorSetupWizard}
          />
        </AuthStack.Navigator>
      </ErrorBoundary>
    );
  },
);

const renderAuthStack = (initialRoute?: keyof AuthStackParamList) => {
  const AuthNavigatorWithRoute = () => (
    <AuthNavigator initialRoute={initialRoute} />
  );
  return (
    <RootStack.Screen
      name={Routes.PriorAuth}
      component={AuthNavigatorWithRoute}
    />
  );
};

const renderMainStack = (initialRoute?: keyof MainTabParamList) => {
  const MainNavigatorWithRoute = () => (
    <SubscriptionGate>
      <MainNavigator initialRoute={initialRoute} />
    </SubscriptionGate>
  );
  return (
    <RootStack.Screen name={Routes.Main} component={MainNavigatorWithRoute} />
  );
};

// Setup Stack Navigator (Phase 4.3: Wrapped with ErrorBoundary)
export const SetupNavigator = () => (
  <ErrorBoundary>
    <SetupStack.Navigator
      screenOptions={{ headerShown: false }}
      initialRouteName={Routes.OrgSetup}>
      <SetupStack.Screen name={Routes.OrgSetup} component={OrgSetup as any} />
      <SetupStack.Screen
        name={Routes.OperatorSetupWizard}
        component={OperatorSetupWizard}
        options={{
          contentStyle: { paddingTop: 0 },
        }}
      />
    </SetupStack.Navigator>
  </ErrorBoundary>
);

// Phase 6.1: Removed nested stack navigators
// All screens now defined directly in RootStack or MainTab
// HouseNavigator, GuestNavigator, ContactsNavigator, UtilitiesNavigator removed

// Phase 6.1: Simplified Main Tab Navigator - direct screens only
export const MainNavigator = React.memo(
  ({ initialRoute }: { initialRoute?: keyof MainTabParamList }) => {
    // Phase 6.3: Removed migration debug logging

    return (
      <ErrorBoundary>
        <MainTab.Navigator
          initialRouteName={initialRoute}
          screenOptions={({ route }) => ({
            tabBarIcon: ({ focused, color }) =>
              getTabBarIcon(route.name, focused, color),
            tabBarShowLabel: false,
            tabBarStyle: {
              backgroundColor: color.white,
            },
            headerShown: false,
          })}>
          <MainTab.Screen
            name={Routes.House}
            component={HouseSummary}
            options={{ tabBarButtonTestID: 'house-tab' }}
          />
          <MainTab.Screen
            name={Routes.Guest}
            component={GuestHome}
            options={{ tabBarButtonTestID: 'guest-tab' }}
          />
          <MainTab.Screen
            name={Routes.Activities}
            component={ActivityScreen}
            options={{ tabBarButtonTestID: 'activities-tab' }}
          />
          <MainTab.Screen
            name={Routes.Contacts}
            component={ContactScreen}
            options={{ tabBarButtonTestID: 'contacts-tab' }}
          />
          <MainTab.Screen
            name={Routes.HouseChat}
            component={HouseChat}
            options={{ tabBarButtonTestID: 'chat-tab' }}
          />
          <MainTab.Screen
            name={Routes.Personal}
            component={Personal}
            options={{ tabBarButtonTestID: 'profile-tab' }}
          />
        </MainTab.Navigator>
      </ErrorBoundary>
    );
  },
);

const SubscriptionHandlerScreen = ({
  navigation,
  route,
}: NativeStackScreenProps<any, Routes.SubscriptionHandler>) => {
  const user = useAppSelector(state => state.user.user);
  if (!user) return null;
  return (
    <SubscriptionHandler
      navigation={navigation}
      route={route}
      user={user as any}
    />
  );
};

// Root Navigator
export const RootNavigator = ({
  initialRoute,
  authInitialRoute,
  initialMainRoute,
}: {
  initialRoute: keyof RootStackParamList;
  authInitialRoute?: keyof AuthStackParamList;
  initialMainRoute?: keyof MainTabParamList;
}) => (
  <RootStack.Navigator
    initialRouteName={initialRoute || Routes.Setup}
    screenOptions={{ headerShown: false }}>
    {/* Authentication Flow */}
    {renderAuthStack(authInitialRoute)}

    {/* Setup Flow */}
    <RootStack.Screen name={Routes.Setup} component={SetupNavigator} />

    {/* Main App */}
    {renderMainStack(initialMainRoute)}

    {/* Phase 6.1: All modal screens (consolidated from nested stacks) */}
    <RootStack.Group
      screenOptions={{ presentation: 'modal', headerShown: false }}>
      {/* Existing modal screens */}
      <RootStack.Screen name={Routes.HouseList} component={HousesOverview} />
      <RootStack.Screen
        name={Routes.NewMeeting}
        component={NewMeeting as any}
      />
      <RootStack.Screen name={Routes.GuestList} component={GuestList} />
      <RootStack.Screen
        name={Routes.PhaseSetup}
        component={PhaseConfigSetup as any}
      />
      <RootStack.Screen name={Routes.HouseSettings} component={HouseSettings} />
      <RootStack.Screen
        name={Routes.StripeSettings}
        component={StripeSettingsScreen}
      />
      <RootStack.Screen name={Routes.GuestInfo} component={UserInfo} />
      <RootStack.Screen
        name={Routes.PhaseCustomization}
        component={PhaseCustomization}
      />
      <RootStack.Screen
        name={Routes.SubscriptionHandler}
        component={SubscriptionHandlerScreen}
      />
      <RootStack.Screen name={Routes.SendInvites} component={GuestInvites} />
      <RootStack.Screen
        name={Routes.AdminReport}
        component={AdminReportScreen}
      />
      <RootStack.Screen name={Routes.StaffNotes} component={StaffNotesFeed} />
      <RootStack.Screen name={Routes.MeetingSearch} component={MeetingSearch} />
      <RootStack.Screen name={Routes.NewAccount} component={NewAccount} />

      {/* House screens (formerly HouseStack) */}
      <RootStack.Screen name={Routes.HouseSummary} component={HouseSummary} />
      <RootStack.Screen name={Routes.Beds} component={Beds} />
      <RootStack.Screen name={Routes.HouseDisputes} component={Disputes} />

      {/* Guest screens (formerly GuestStack) */}
      <RootStack.Screen name={Routes.GuestOverview} component={GuestHome} />
      <RootStack.Screen
        name={Routes.MeetingSummary}
        component={GuestMeetingSummary}
      />
      <RootStack.Screen
        name={Routes.WorkSummary}
        component={GuestWorkSummary}
      />
      <RootStack.Screen
        name={Routes.ChoreSummary}
        component={GuestChoreSummary}
      />
      <RootStack.Screen
        name={Routes.SupporterSummary}
        component={GuestSupporterSummary}
      />
      <RootStack.Screen
        name={Routes.MedicationSummary}
        component={GuestMedicationSummary}
      />

      {/* Contacts screens (formerly ContactsStack) */}
      <RootStack.Screen
        name={Routes.ContactsScreen}
        component={ContactScreen}
      />
      <RootStack.Screen name={Routes.DirectMessage} component={DirectChat} />

      {/* Utilities screens (formerly UtilitiesStack) */}
      <RootStack.Screen name={Routes.PersonalScreen} component={Personal} />
      <RootStack.Screen
        name={Routes.EditUserInfo}
        component={EditUserInfoForm}
      />
      <RootStack.Screen
        name={Routes.InAppOrgSetup}
        component={SetupNavigator}
      />

      {/* Shared screens (Phase 6.2: deduplicated from HouseStack and UtilitiesStack) */}
      <RootStack.Screen name={Routes.Issues} component={Issues} />
      <RootStack.Screen name={Routes.Complaints} component={Complaints} />

      {/* Oxford House screens */}
      <RootStack.Screen
        name={Routes.OxfordDashboard}
        component={OxfordDashboard}
      />
      <RootStack.Screen
        name={Routes.OxfordOnboardingWizard}
        component={OxfordOnboardingWizard}
        options={{ headerShown: false }}
      />
      <RootStack.Screen
        name={Routes.OfficerManagement}
        component={OfficerManagement}
      />
      <RootStack.Screen name={Routes.EESTracker} component={EESTracker} />
      <RootStack.Screen
        name={Routes.BusinessMeetings}
        component={BusinessMeetings}
      />
      <RootStack.Screen name={Routes.OxfordVoting} component={OxfordVoting} />
      <RootStack.Screen
        name={Routes.CharterCompliance}
        component={CharterCompliance}
      />

      {/* Payment screens */}
      <RootStack.Screen
        name={Routes.ResidentPayment}
        component={ResidentPayment as any}
      />
      <RootStack.Screen
        name={Routes.PaymentHistory}
        component={PaymentHistory}
      />
      <RootStack.Screen
        name={Routes.PaymentDashboard}
        component={PaymentDashboard}
      />
      <RootStack.Screen
        name={Routes.RentPayment}
        component={RentPaymentConnector}
      />
      <RootStack.Screen
        name={Routes.PaymentWebView}
        component={PaymentWebView as any}
      />

      {/* Drug Testing screens */}
      <RootStack.Screen
        name={Routes.DrugTesting}
        component={DrugTestingScreen}
      />
      <RootStack.Screen name={Routes.DrugTestForm} component={DrugTestForm} />
      <RootStack.Screen
        name={Routes.DrugTestHistory}
        component={DrugTestHistory}
      />

      {/* Intake screens */}
      <RootStack.Screen
        name={Routes.ResidentIntake}
        component={IntakeFormScreen}
      />

      {/* Application screens */}
      <RootStack.Screen name={Routes.Apply} component={ApplyScreen} />
      <RootStack.Screen
        name={Routes.ApplicationStatus}
        component={ApplicationStatusScreen}
      />
      <RootStack.Screen
        name={Routes.ApplicationList}
        component={ApplicationListScreen}
      />
      <RootStack.Screen
        name={Routes.ApplicationDetail}
        component={ApplicationDetailScreen}
      />

      {/* Import screens */}
      <RootStack.Screen
        name={Routes.GuestImport}
        component={GuestImportScreen}
      />

      {/* Document screens */}
      <RootStack.Screen
        name={Routes.Documents}
        component={DocumentListScreen}
      />

      {/* Balance screens */}
      <RootStack.Screen
        name={Routes.BalanceDashboard}
        component={BalanceDashboard}
      />

      {/* Notification screens */}
      <RootStack.Screen
        name={Routes.Notifications}
        component={NotificationsScreen}
      />

      {/* Treasury screens */}
      <RootStack.Screen
        name={Routes.TreasuryDashboard}
        component={TreasuryDashboard}
      />
      <RootStack.Screen
        name={Routes.FinancialRecordForm}
        component={FinancialRecordForm}
      />
      <RootStack.Screen
        name={Routes.FinancialRecordDetail}
        component={FinancialRecordDetail}
      />

      {/* Security screens */}
      <RootStack.Screen
        name={Routes.TwoFactorSetup}
        component={TwoFactorSetup}
      />
    </RootStack.Group>
  </RootStack.Navigator>
);
