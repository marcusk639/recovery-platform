import React from 'react';
import {createStackNavigator} from '@react-navigation/stack';

// Import types
import {GroupStackParamList} from '../types/navigation';

// Import screens
import GroupsListScreen from '../screens/homegroup/GroupListScreen';
import GroupOverviewScreen from '../screens/homegroup/GroupOverviewScreen';
import GroupMembersScreen from '../screens/homegroup/GroupMembersScreen';
import GroupAnnouncementsScreen from '../screens/homegroup/GroupAnnouncementsScreen';
// import GroupLiteratureScreen from '../screens/groups/GroupLiteratureScreen';
import GroupMemberDetailsScreen from '../screens/homegroup/MemberDetailScreen';
import GroupAnnouncementDetailsScreen from '../screens/homegroup/GroupAnnouncementDetailsScreen';
import GroupTreasuryScreen from '../screens/homegroup/GroupTreasuryScreen';
import GroupEditDetailsScreen from '../screens/homegroup/GroupEditDetailsScreen';
import CreateGroupScreen from '../screens/homegroup/CreateGroupScreen';
import GroupScheduleScreen from '../screens/homegroup/GroupScheduleScreen';
import GroupCalendarScreen from '../screens/homegroup/GroupCalendarScreen';
import AddTransactionScreen from '../screens/homegroup/AddTransactionScreen';
import GroupChatScreen from '../screens/homegroup/GroupChatScreen';
import ChatMediaPickerScreen from '../components/chat/ChatMediaPickerScreen';
import GroupChatInfoScreen from '../screens/homegroup/GroupChatInfoScreen';
import GroupServicePositionsScreen from '../screens/homegroup/GroupServicePositionsScreen';
import AssignChairpersonScreen from '../screens/homegroup/AssignChairpersonScreen';
import EditMeetingInstanceScreen from '../screens/homegroup/EditMeetingInstanceScreen';
import GroupDonationScreen from '../screens/homegroup/GroupDonationScreen';
import SubscriptionUpgradeScreen from '../screens/subscription/SubscriptionUpgradeScreen';
import PaymentLinksSetupScreen from '../screens/homegroup/PaymentLinksSetupScreen';
import GroupSponsorsScreen from '../screens/homegroup/GroupSponsorsScreen';
import SponsorChatScreen from '../screens/homegroup/SponsorChatScreen';
import SponsorshipAnalyticsScreen from '../screens/homegroup/SponsorshipAnalyticsScreen';
import AddEditServicePositionScreen from '../screens/homegroup/AddEditServicePositionScreen';
import PositionHistoryScreen from '../screens/homegroup/PositionHistoryScreen';
import TreasuryReportScreen from '../screens/homegroup/TreasuryReportScreen';
import SavedTreasuryReportsScreen from '../screens/homegroup/SavedTreasuryReportsScreen';
import ManageRecurringScreen from '../screens/homegroup/ManageRecurringScreen';
import YearEndSummaryScreen from '../screens/homegroup/YearEndSummaryScreen';
import InitiateHandoffScreen from '../screens/homegroup/InitiateHandoffScreen';
import HandoffRequestScreen from '../screens/homegroup/HandoffRequestScreen';
import HandoffConfirmationScreen from '../screens/homegroup/HandoffConfirmationScreen';
import HandoffHistoryScreen from '../screens/homegroup/HandoffHistoryScreen';
import TreasurerHandoffScreen from '../screens/homegroup/TreasurerHandoffScreen';
// import GroupEventDetailsScreen from '../screens/groups/GroupEventDetailsScreen';

// Business Meeting screens
import BusinessMeetingsListScreen from '../screens/homegroup/BusinessMeetingsListScreen';
import BusinessMeetingDetailScreen from '../screens/homegroup/BusinessMeetingDetailScreen';
import CreateEditBusinessMeetingScreen from '../screens/homegroup/CreateEditBusinessMeetingScreen';
import ManageAgendaScreen from '../screens/homegroup/ManageAgendaScreen';

// Admin Dashboard screen
import AdminDashboardScreen from '../screens/homegroup/AdminDashboardScreen';

// V4.3: Analytics & Insights screens
import GroupHealthDashboardScreen from '../screens/homegroup/GroupHealthDashboardScreen';
import AttendanceAnalyticsScreen from '../screens/homegroup/AttendanceAnalyticsScreen';
import TreasuryTrendsScreen from '../screens/homegroup/TreasuryTrendsScreen';

// Referral Program screen
import ReferralDashboardScreen from '../screens/homegroup/ReferralDashboardScreen';

// Moderation screens
import ModerationQueueScreen from '../screens/moderation/ModerationQueueScreen';
import ReportDetailScreen from '../screens/moderation/ReportDetailScreen';
import UserBansScreen from '../screens/moderation/UserBansScreen';
import AdminRemovalRequestsScreen from '../screens/homegroup/AdminRemovalRequestsScreen';

// Onboarding screens
import AdminValuePropScreen from '../screens/onboarding/AdminValuePropScreen';

// Direct Message screens
import DirectMessageScreen from '../screens/messages/DirectMessageScreen';
import ConversationsListScreen from '../screens/messages/ConversationsListScreen';

// V3.1: Phone List & Milestones screens
import GroupPhoneListScreen from '../screens/homegroup/GroupPhoneListScreen';
import GroupMilestonesScreen from '../screens/homegroup/GroupMilestonesScreen';

// V3.2: Meeting Finder screens
import MeetingDetailScreen from '../screens/meetings/MeetingDetailScreen';
import MeetingQRCodeScreen from '../screens/homegroup/MeetingQRCodeScreen';

// V3.3: Group Governance & Secretary Toolkit screens
import GroupConscienceScreen from '../screens/homegroup/GroupConscienceScreen';
import CreateConscienceVoteScreen from '../screens/homegroup/CreateConscienceVoteScreen';
import SecretaryToolkitScreen from '../screens/homegroup/SecretaryToolkitScreen';
import MeetingChecklistScreen from '../screens/homegroup/MeetingChecklistScreen';

// V3.5: Step Work — sponsor can view sponsee step progress
import StepTrackerScreen from '../screens/profile/StepTrackerScreen';

// V4.4: Data Export screen
import GroupDataExportScreen from '../screens/homegroup/GroupDataExportScreen';

// V4.1: Advanced Governance screens
import GroupBylawsScreen from '../screens/homegroup/GroupBylawsScreen';
import EditBylawsScreen from '../screens/homegroup/EditBylawsScreen';
import GroupElectionsScreen from '../screens/homegroup/GroupElectionsScreen';
import ElectionDetailScreen from '../screens/homegroup/ElectionDetailScreen';
import MeetingMinutesScreen from '../screens/homegroup/MeetingMinutesScreen';
import EditMeetingMinutesScreen from '../screens/homegroup/EditMeetingMinutesScreen';
import MinutesArchiveScreen from '../screens/homegroup/MinutesArchiveScreen';
import TermsDashboardScreen from '../screens/homegroup/TermsDashboardScreen';
import IntergroupReportScreen from '../screens/homegroup/IntergroupReportScreen';
import IntergroupReportHistoryScreen from '../screens/homegroup/IntergroupReportHistoryScreen';

// V4.2: Content & Resources
import PostGroupDailyThoughtScreen from '../screens/homegroup/PostGroupDailyThoughtScreen';
import GroupLiteratureBookmarksScreen from '../screens/homegroup/GroupLiteratureBookmarksScreen';
import MeetingTopicsScreen from '../screens/homegroup/MeetingTopicsScreen';
import GroupResourceLibraryScreen from '../screens/homegroup/GroupResourceLibraryScreen';
import AddGroupResourceScreen from '../screens/homegroup/AddGroupResourceScreen';

const Stack = createStackNavigator<GroupStackParamList>();

const GroupStackNavigator: React.FC = () => {
  return (
    <Stack.Navigator
      initialRouteName="GroupsList"
      screenOptions={{
        headerBackTitle: 'Back',
        headerTitleAlign: 'center',
      }}>
      <Stack.Screen
        name="GroupsList"
        component={GroupsListScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="GroupOverview"
        component={GroupOverviewScreen}
        options={({route}) => ({
          title: route.params.groupName || 'Group Details',
        })}
      />
      <Stack.Screen
        name="GroupMembers"
        component={GroupMembersScreen}
        options={({route}) => ({
          title: `${route.params.groupName} - Members`,
        })}
      />
      <Stack.Screen
        name="GroupAnnouncements"
        component={GroupAnnouncementsScreen}
        options={({route}) => ({
          title: `${route.params.groupName} - Announcements`,
        })}
      />
      <Stack.Screen
        name="GroupTreasury"
        component={GroupTreasuryScreen}
        options={({route}) => ({
          title: `${route.params.groupName} - Treasury`,
        })}
      />
      <Stack.Screen
        name="ManageRecurring"
        component={ManageRecurringScreen}
        options={{
          title: 'Recurring Transactions',
        }}
      />
      <Stack.Screen
        name="YearEndSummary"
        component={YearEndSummaryScreen}
        options={{
          title: 'Year-End Summary',
        }}
      />
      <Stack.Screen
        name="TreasuryReport"
        component={TreasuryReportScreen}
        options={{
          title: 'Treasury Report',
        }}
      />
      <Stack.Screen
        name="SavedTreasuryReports"
        component={SavedTreasuryReportsScreen}
        options={{
          title: 'Saved Reports',
        }}
      />
      {/* Treasurer Handoff Screens */}
      <Stack.Screen
        name="InitiateHandoff"
        component={InitiateHandoffScreen}
        options={{
          title: 'Transfer Treasurer Role',
        }}
      />
      <Stack.Screen
        name="HandoffRequest"
        component={HandoffRequestScreen}
        options={{
          title: 'Handoff Request',
        }}
      />
      <Stack.Screen
        name="HandoffConfirmation"
        component={HandoffConfirmationScreen}
        options={{
          title: 'Complete Handoff',
        }}
      />
      <Stack.Screen
        name="HandoffHistory"
        component={HandoffHistoryScreen}
        options={{
          title: 'Handoff History',
        }}
      />
      {/* Business Meeting Screens */}
      <Stack.Screen
        name="BusinessMeetingsList"
        component={BusinessMeetingsListScreen}
        options={({route}) => ({
          title: `${route.params.groupName} - Business Meetings`,
        })}
      />
      <Stack.Screen
        name="BusinessMeetingDetail"
        component={BusinessMeetingDetailScreen}
        options={{
          title: 'Business Meeting',
        }}
      />
      <Stack.Screen
        name="CreateEditBusinessMeeting"
        component={CreateEditBusinessMeetingScreen}
        options={{
          title: 'New Business Meeting',
        }}
      />
      <Stack.Screen
        name="ManageAgenda"
        component={ManageAgendaScreen}
        options={{
          title: 'Manage Agenda',
        }}
      />
      {/* <Stack.Screen 
        name="GroupLiterature" 
        component={GroupLiteratureScreen} 
        options={({route}) => ({
          title: `${route.params.groupName} - Literature`,
        })}
      /> */}
      <Stack.Screen
        name="GroupMemberDetails"
        component={GroupMemberDetailsScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="GroupAnnouncementDetails"
        component={GroupAnnouncementDetailsScreen}
        options={{
          title: 'Announcement',
        }}
      />
      {/* <Stack.Screen 
        name="GroupEventDetails" 
        component={GroupEventDetailsScreen} 
        options={{
          title: 'Event Details',
        }}
      />
      <Stack.Screen 
        name="GroupBusinessMeeting" 
        component={GroupBusinessMeetingScreen} 
        options={{
          title: 'Business Meeting',
        }}
      />  */}
      <Stack.Screen
        name="GroupEditDetails"
        component={GroupEditDetailsScreen}
        options={{
          title: 'Edit Group Details',
        }}
      />
      <Stack.Screen
        name="CreateGroup"
        component={CreateGroupScreen}
        options={{
          title: 'Create Group',
        }}
      />
      <Stack.Screen
        name="GroupSchedule"
        component={GroupScheduleScreen}
        options={({route}) => ({
          title: `${route.params.groupName} - Meetings`,
        })}
      />
      <Stack.Screen
        name="GroupCalendar"
        component={GroupCalendarScreen}
        options={({route}) => ({
          title: `${route.params.groupName} - Calendar`,
        })}
      />
      <Stack.Screen
        name="EditMeetingInstance"
        component={EditMeetingInstanceScreen}
        options={{
          title: 'Edit Meeting Instance',
        }}
      />
      <Stack.Screen
        name="AssignChairperson"
        component={AssignChairpersonScreen}
        options={{
          title: 'Assign Chairperson',
        }}
      />
      <Stack.Screen
        name="AddTransaction"
        component={AddTransactionScreen}
        options={{
          presentation: 'modal',
          title: 'Add Transaction',
        }}
      />
      <Stack.Screen
        name="GroupChat"
        component={GroupChatScreen}
        options={{
          title: 'Group Chat',
        }}
      />
      <Stack.Screen
        name="GroupChatInfo"
        component={GroupChatInfoScreen}
        options={({route}) => ({
          title: `${route.params.groupName} - Chat Info`,
        })}
      />
      <Stack.Screen
        name="ChatMediaPicker"
        component={ChatMediaPickerScreen}
        options={{
          title: 'Choose Media',
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="GroupServicePositions"
        component={GroupServicePositionsScreen}
        options={({route}) => ({
          title: `${route.params.groupName} - Service`,
        })}
      />
      <Stack.Screen
        name="GroupDonation"
        component={GroupDonationScreen}
        options={{
          title: 'Donate to Group',
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="AdminValueProp"
        component={AdminValuePropScreen}
        options={{
          title: 'What You Get',
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="SubscriptionUpgrade"
        component={SubscriptionUpgradeScreen}
        options={{
          title: 'Upgrade',
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="PaymentLinksSetup"
        component={PaymentLinksSetupScreen}
        options={{
          title: 'Set Up Donations',
        }}
      />
      <Stack.Screen
        name="GroupSponsors"
        component={GroupSponsorsScreen}
        options={({route}) => ({
          title: `${route.params.groupName} - Sponsors`,
        })}
      />
      <Stack.Screen
        name="SponsorChat"
        component={SponsorChatScreen}
        options={({route}) => ({
          title: 'Chat',
        })}
      />
      <Stack.Screen
        name="SponsorshipAnalytics"
        component={SponsorshipAnalyticsScreen}
        options={({route}) => ({
          title: `${route.params.groupName} - Sponsorship Analytics`,
        })}
      />
      <Stack.Screen
        name="AddEditServicePosition"
        component={AddEditServicePositionScreen}
        options={{
          title: 'Add Service Position',
        }}
      />
      <Stack.Screen
        name="PositionHistory"
        component={PositionHistoryScreen}
        options={({route}) => ({
          title: `${route.params.positionName} - History`,
        })}
      />
      {/* Admin Dashboard Screen */}
      <Stack.Screen
        name="AdminDashboard"
        component={AdminDashboardScreen}
        options={({route}) => ({
          title: `${route.params.groupName} - Dashboard`,
        })}
      />
      {/* V4.3: Analytics & Insights Screens */}
      <Stack.Screen
        name="GroupHealthDashboard"
        component={GroupHealthDashboardScreen}
        options={({route}) => ({
          title: `${route.params.groupName} - Group Health`,
        })}
      />
      <Stack.Screen
        name="AttendanceAnalytics"
        component={AttendanceAnalyticsScreen}
        options={({route}) => ({
          title: `${route.params.groupName} - Attendance`,
        })}
      />
      <Stack.Screen
        name="TreasuryTrends"
        component={TreasuryTrendsScreen}
        options={({route}) => ({
          title: `${route.params.groupName} - Treasury Trends`,
        })}
      />
      {/* Moderation Screens */}
      <Stack.Screen
        name="ModerationQueue"
        component={ModerationQueueScreen}
        options={{
          title: 'Moderation Queue',
        }}
      />
      <Stack.Screen
        name="ReportDetail"
        component={ReportDetailScreen}
        options={{
          title: 'Report Details',
        }}
      />
      <Stack.Screen
        name="UserBans"
        component={UserBansScreen}
        options={{
          title: 'Banned Users',
        }}
      />
      {/* Admin Removal Screens */}
      <Stack.Screen
        name="AdminRemovalRequests"
        component={AdminRemovalRequestsScreen}
        options={({route}) => ({
          title: `${route.params.groupName} - Admin Removal Votes`,
        })}
      />
      {/* Referral Program Screen */}
      <Stack.Screen
        name="ReferralDashboard"
        component={ReferralDashboardScreen}
        options={{
          title: 'Referral Program',
        }}
      />
      {/* Public Events screen (V3.3 Regional Events) */}
      {/* Direct Message screens */}
      <Stack.Screen
        name="DirectMessage"
        component={DirectMessageScreen}
        options={({route}) => ({
          title: route.params.otherUserName || 'Message',
        })}
      />
      <Stack.Screen
        name="ConversationsList"
        component={ConversationsListScreen}
        options={{
          title: 'Messages',
        }}
      />
      {/* V3.1: Phone List & Milestones */}
      <Stack.Screen
        name="GroupPhoneList"
        component={GroupPhoneListScreen}
        options={({route}) => ({
          title: `${route.params.groupName} - Phone List`,
        })}
      />
      <Stack.Screen
        name="GroupMilestones"
        component={GroupMilestonesScreen}
        options={({route}) => ({
          title: `${route.params.groupName} - Milestones`,
        })}
      />
      {/* V3.2: Meeting Finder screens */}
      <Stack.Screen
        name="MeetingDetail"
        component={MeetingDetailScreen}
        options={{
          title: 'Meeting Details',
        }}
      />
      <Stack.Screen
        name="MeetingQRCode"
        component={MeetingQRCodeScreen}
        options={({route}) => ({
          title: `QR Check-In: ${route.params.meetingName}`,
        })}
      />
      {/* V3.3: Group Governance & Secretary Toolkit */}
      <Stack.Screen
        name="GroupConscience"
        component={GroupConscienceScreen}
        options={({route}) => ({
          title: `${route.params.groupName} - Group Conscience`,
        })}
      />
      <Stack.Screen
        name="CreateConscienceVote"
        component={CreateConscienceVoteScreen}
        options={{
          title: 'New Group Conscience Vote',
        }}
      />
      <Stack.Screen
        name="SecretaryToolkit"
        component={SecretaryToolkitScreen}
        options={({route}) => ({
          title: `${route.params.groupName} - Secretary Toolkit`,
        })}
      />
      <Stack.Screen
        name="MeetingChecklist"
        component={MeetingChecklistScreen}
        options={{
          title: 'Meeting Checklist',
        }}
      />
      {/* V3.5: Sponsor read-only view of sponsee step progress */}
      <Stack.Screen
        name="SponseeStepProgress"
        component={StepTrackerScreen}
        options={({route}) => ({
          title: `${route.params.sponseeName}'s Step Work`,
        })}
      />

      {/* V4.1: Advanced Governance — Bylaws */}
      <Stack.Screen
        name="GroupBylaws"
        component={GroupBylawsScreen}
        options={({route}) => ({
          title: `${route.params.groupName} - Guidelines`,
        })}
      />
      <Stack.Screen
        name="EditBylaws"
        component={EditBylawsScreen}
        options={{
          title: 'Edit Guidelines',
        }}
      />

      {/* V4.1: Advanced Governance — Elections */}
      <Stack.Screen
        name="GroupElections"
        component={GroupElectionsScreen}
        options={({route}) => ({
          title: `${route.params.groupName} - Elections`,
        })}
      />
      <Stack.Screen
        name="ElectionDetail"
        component={ElectionDetailScreen}
        options={{
          title: 'Election',
        }}
      />

      {/* V4.1: Advanced Governance — Minutes */}
      <Stack.Screen
        name="MeetingMinutes"
        component={MeetingMinutesScreen}
        options={{
          title: 'Meeting Minutes',
        }}
      />
      <Stack.Screen
        name="EditMeetingMinutes"
        component={EditMeetingMinutesScreen}
        options={{
          title: 'Record Minutes',
        }}
      />
      <Stack.Screen
        name="MinutesArchive"
        component={MinutesArchiveScreen}
        options={({route}) => ({
          title: `${route.params.groupName} - Minutes Archive`,
        })}
      />

      {/* V4.1: Advanced Governance — Term Dashboard */}
      <Stack.Screen
        name="TermsDashboard"
        component={TermsDashboardScreen}
        options={({route}) => ({
          title: `${route.params.groupName} - Term Dashboard`,
        })}
      />

      {/* V4.1: Advanced Governance — Intergroup Report */}
      <Stack.Screen
        name="IntergroupReport"
        component={IntergroupReportScreen}
        options={{
          title: 'GSR Monthly Report',
        }}
      />
      <Stack.Screen
        name="IntergroupReportHistory"
        component={IntergroupReportHistoryScreen}
        options={({route}) => ({
          title: `${route.params.groupName} - GSR Reports`,
        })}
      />

      {/* V4.4: Data Export */}
      <Stack.Screen
        name="GroupDataExport"
        component={GroupDataExportScreen}
        options={{
          title: 'Export Group Data',
        }}
      />

      {/* V4.2: Content & Resources */}
      <Stack.Screen
        name="PostGroupDailyThought"
        component={PostGroupDailyThoughtScreen}
        options={{
          title: 'Post Group Daily Thought',
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="GroupLiteratureBookmarks"
        component={GroupLiteratureBookmarksScreen}
        options={({route}) => ({
          title: `${route.params.groupName} - Literature`,
        })}
      />
      <Stack.Screen
        name="MeetingTopics"
        component={MeetingTopicsScreen}
        options={({route}) => ({
          title: `Meeting Topics`,
        })}
      />
      <Stack.Screen
        name="GroupResourceLibrary"
        component={GroupResourceLibraryScreen}
        options={({route}) => ({
          title: `${route.params.groupName} - Resources`,
        })}
      />
      <Stack.Screen
        name="AddGroupResource"
        component={AddGroupResourceScreen}
        options={{
          title: 'Add Resource',
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="TreasurerHandoff"
        component={TreasurerHandoffScreen}
        options={{
          title: 'Transfer Treasurer Role',
        }}
      />
    </Stack.Navigator>
  );
};

export default GroupStackNavigator;
