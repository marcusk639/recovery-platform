// src/types/navigation/index.ts
import {NavigatorScreenParams} from '@react-navigation/native';
import {Meeting, ServicePosition} from '../index';

// Group Stack Navigation Params
export type GroupStackParamList = {
  GroupsList: undefined;
  GroupOverview: {
    groupId: string;
    groupName: string;
    showClaimBanner?: boolean;
  };
  GroupMembers: {groupId: string; groupName: string};
  GroupAnnouncements: {groupId: string; groupName: string};
  GroupTreasury: {groupId: string; groupName: string};
  GroupLiterature: {groupId: string; groupName: string};
  GroupMemberDetails: {groupId: string; memberId: string};
  GroupAnnouncementDetails: {groupId: string; announcementId: string};
  GroupEventDetails: {groupId: string; eventId: string};
  // Business Meeting screens
  BusinessMeetingsList: {groupId: string; groupName: string};
  BusinessMeetingDetail: {
    groupId: string;
    groupName: string;
    meetingId: string;
  };
  CreateEditBusinessMeeting: {
    groupId: string;
    groupName: string;
    meetingId?: string;
  };
  ManageAgenda: {groupId: string; groupName: string; meetingId: string};
  GroupEditDetails: {groupId: string; groupName: string};
  GroupDetails: {groupId: string; groupName: string};
  CreateGroup: {meeting?: Meeting};
  GroupSchedule: {groupId: string; groupName: string};
  AddTransaction: {groupId: string; groupName: string};
  GroupChat: {groupId: string; groupName: string};
  // Shared media picker - works for both group chat and DMs
  ChatMediaPicker: {
    context: 'group' | 'dm';
    // Group chat context
    groupId?: string;
    // DM context
    threadId?: string;
    otherUserId?: string;
    otherUserName?: string;
  };
  GroupChatInfo: {groupId: string; groupName: string};
  GroupServicePositions: {groupId: string; groupName: string};
  AssignChairperson: {
    groupId: string;
    groupName: string;
    instanceId: string;
    currentChairpersonId?: string | null;
    scheduledAt: number;
  };
  EditMeetingInstance: {
    groupId: string;
    groupName: string;
    instanceId: string;
  };
  GroupDonation: {groupId: string; groupName: string};
  AdminValueProp: {groupId: string; groupName: string};
  SubscriptionUpgrade: {groupId: string; groupName: string};
  PaymentLinksSetup: {groupId: string; groupName: string};
  GroupSponsors: {groupId: string; groupName: string};
  TreasurerHandoff: {groupId: string; groupName: string};
  SponsorChat: {
    groupId: string;
    groupName: string;
    sponsorId: string;
    sponseeId: string;
    sponsorName: string;
    sponseeName: string;
  };
  SponsorshipAnalytics: {groupId: string; groupName: string};
  AddEditServicePosition: {
    groupId: string;
    groupName: string;
    positionId?: string;
    position?: ServicePosition;
  };
  PositionHistory: {
    groupId: string;
    groupName: string;
    positionId: string;
    positionName: string;
  };
  // Treasury screens
  ManageRecurring: {groupId: string; groupName: string};
  YearEndSummary: {groupId: string; groupName: string};
  TreasuryReport: {groupId: string; groupName: string; savedReportId?: string};
  SavedTreasuryReports: {groupId: string; groupName: string};
  // Treasurer Handoff screens
  InitiateHandoff: {groupId: string; groupName: string; positionId: string};
  HandoffRequest: {groupId: string; groupName: string; handoffId: string};
  HandoffConfirmation: {groupId: string; groupName: string; handoffId: string};
  HandoffHistory: {groupId: string; groupName: string};
  // Admin Dashboard screen
  AdminDashboard: {groupId: string; groupName: string};
  // V4.3 Analytics screens
  GroupHealthDashboard: {groupId: string; groupName: string};
  AttendanceAnalytics: {groupId: string; groupName: string};
  TreasuryTrends: {groupId: string; groupName: string};
  // Moderation screens
  ModerationQueue: {groupId: string; groupName: string};
  ReportDetail: {reportId: string; groupId: string; groupName: string};
  UserBans: {groupId: string; groupName: string};
  // Meeting Calendar screen
  GroupCalendar: {groupId: string; groupName: string};
  // Admin Removal screens
  AdminRemovalRequests: {groupId: string; groupName: string};
  // Referral Program screen
  ReferralDashboard: {groupId: string; groupName: string};
  // Direct Message screens
  DirectMessage: {
    threadId: string;
    otherUserId: string;
    otherUserName: string;
    otherUserPhotoURL?: string;
  };
  ConversationsList: undefined;
  // V3.1: Phone List & Milestones
  GroupPhoneList: {groupId: string; groupName: string};
  GroupMilestones: {groupId: string; groupName: string};
  // V3.2: Meeting Finder screens
  MeetingDetail: {
    meetingId: string;
    groupId?: string;
    source: 'recoveryconnect' | 'external';
  };
  MeetingQRCode: {
    groupId: string;
    meetingId: string;
    meetingName: string;
  };
  // V3.3: Group Governance & Secretary Toolkit
  GroupConscience: {groupId: string; groupName: string};
  CreateConscienceVote: {groupId: string; groupName: string};
  SecretaryToolkit: {groupId: string; groupName: string};
  MeetingChecklist: {groupId: string; groupName: string; meetingId?: string};
  // V3.5: Step Work — sponsor read-only view of sponsee step progress
  SponseeStepProgress: {
    userId: string;
    sponseeName: string;
  };
  // V4.1: Bylaws
  GroupBylaws: {groupId: string; groupName: string};
  EditBylaws: {groupId: string; groupName: string};
  // V4.1: Elections
  GroupElections: {groupId: string; groupName: string};
  ElectionDetail: {
    groupId: string;
    groupName: string;
    electionId: string;
  };
  // V4.1: Minutes
  MeetingMinutes: {
    groupId: string;
    groupName: string;
    businessMeetingId: string;
    meetingDate: number;
  };
  EditMeetingMinutes: {
    groupId: string;
    groupName: string;
    businessMeetingId: string;
    meetingDate: number;
  };
  MinutesArchive: {groupId: string; groupName: string};
  // V4.1: Term Dashboard
  TermsDashboard: {groupId: string; groupName: string};
  // V4.1: Intergroup Report
  IntergroupReport: {
    groupId: string;
    groupName: string;
    reportMonth: string;
    reportId?: string;
  };
  IntergroupReportHistory: {groupId: string; groupName: string};
  // V4.4: Data Export
  GroupDataExport: {groupId: string; groupName: string};
  // V4.2.1: Post Group Daily Thought
  PostGroupDailyThought: {groupId: string; groupName: string};
  // V4.2.2: Group Literature Bookmarks
  GroupLiteratureBookmarks: {groupId: string; groupName: string};
  // V4.2.3: Meeting Topics
  MeetingTopics: {
    groupId: string;
    groupName: string;
    /** If provided, tapping a topic pre-fills the meeting checklist or agenda */
    returnToMeetingId?: string;
  };
  // V4.2.5: Group Resource Library
  GroupResourceLibrary: {groupId: string; groupName: string};
  AddGroupResource: {groupId: string; groupName: string};
};

// Profile Stack Navigation Params (assuming it exists)
export type ProfileStackParamList = {
  ProfileMain: undefined;
  ProfileManagement: undefined;
  SobrietyTracker: undefined;
  MySponsorships: undefined;
  GratitudeJournal: undefined;
  CheckInStreak: undefined;
  // V4.3: My Recovery Journey
  MyRecoveryJourney: undefined;
  // V3.5: Step Work
  StepTracker:
    | {
        /** When provided, render a read-only view of this user's step progress (sponsor view). */
        userId?: string;
        /** Display name of the sponsee (used in the read-only header). */
        sponseeName?: string;
      }
    | undefined;
  // V4.2.1: Daily Reflection
  DailyReflection:
    | {
        /** ISO date string YYYY-MM-DD; defaults to today if omitted */
        date?: string;
        /** If the user tapped from a push notification, the day of year is passed directly */
        dayOfYear?: number;
      }
    | undefined;
  // V4.2.2: Literature Index
  LiteratureIndex: undefined;
  LiteratureDetail: {literatureId: string};
  // V4.2.3: Contribute Literature
  ContributeLiterature: undefined;
  // V4.2.4: Sobriety Calculator
  SobrietyCalculator:
    | {
        /** Pre-populate with this date string (YYYY-MM-DD). Defaults to UserDocument.sobrietyStartDate */
        initialDate?: string;
      }
    | undefined;
};

// Messages Stack Navigation Params
export type MessagesStackParamList = {
  UnifiedInbox: undefined;
  ConversationsList: undefined;
  DirectMessage: {
    threadId: string;
    otherUserId: string;
    otherUserName: string;
    otherUserPhotoURL?: string;
  };
  ChatMediaPicker: {
    context: 'dm';
    threadId: string;
    otherUserId: string;
    otherUserName: string;
  };
};

// Main Tab Navigation Params
export type MainTabParamList = {
  Home: NavigatorScreenParams<GroupStackParamList>; // <-- Specify params for Home stack
  Meetings: undefined;
  Messages: NavigatorScreenParams<MessagesStackParamList>; // <-- Messages stack
  Treasury: undefined;
  Profile: NavigatorScreenParams<ProfileStackParamList>; // <-- Specify params for Profile stack
  GroupSearch: undefined;
  AdminPanel: undefined;
};

// Auth Stack Navigation Params
export type AuthStackParamList = {
  Landing: undefined;
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  Meetings: undefined;
};

// Root Stack Navigation Params
export type RootStackParamList = {
  Splash: undefined;
  Auth: undefined;
  Onboarding: undefined;
  Main: NavigatorScreenParams<MainTabParamList>;
  // V4.4: Intergroup — presented as a root-level stack over the main tabs
  Intergroup: NavigatorScreenParams<IntergroupStackParamList>;
};

// V4.4: Intergroup Stack Navigation Params
export type IntergroupStackParamList = {
  IntergroupDashboard: {intergroupId: string};
  IntergroupGroups: {intergroupId: string};
  IntergroupGroupDetail: {intergroupId: string; groupId: string};
  IntergroupAnnouncement: {intergroupId: string};
  IntergroupSettings: {intergroupId: string};
  IntergroupBilling: {intergroupId: string};
  IntergroupUpgrade: {intergroupId: string; currentTier: string};
  FacilityDashboard: {intergroupId: string};
  IntergroupSSO: {intergroupId: string};
  GroupDataExport: {groupId: string; groupName: string};
};
