// src/types/index.ts

import {Transaction, TransactionType} from './domain/treasury';
import React from 'react';
import {SponsorSettings} from './sponsorship';
import {ChatAttachment} from '../models/ChatModel';
/**
 * Authentication and User Types
 */

export type OnboardingIntent = 'admin' | 'member' | 'seeker';

export interface OnboardingData {
  intent: OnboardingIntent;
  groupId: string | null;
  action?: 'create' | 'claim';
  completedAt: number; // timestamp in ms
}

// Activity tracking types for admin inactivity detection
export type AdminActivityStatus = 'active' | 'inactive' | 'dormant';
export type AdminRequestEscalationLevel = 'normal' | 'timed' | 'instant';

export interface ActivityLog {
  lastGroupAction?: Date;
  lastChatMessage?: Date;
  lastMeetingAttendance?: Date;
}

export interface AdminInfo {
  uid: string;
  addedAt: Date;
  lastActiveAt: Date;
  activityStatus: AdminActivityStatus;
}

export interface PendingAdminRequest {
  uid: string;
  requestedAt: Date;
  message?: string;
  requesterName?: string;
  autoApproveAt?: Date;
  escalationLevel: AdminRequestEscalationLevel;
  notificationsSent: number;
}

export interface User {
  uid: string;
  email: string;
  displayName: string;
  recoveryDate?: string;
  createdAt: Date;
  updatedAt: Date;
  lastLogin: Date;
  notificationSettings: NotificationSettings;
  privacySettings: PrivacySettings;
  homeGroups: string[];
  role: 'user' | 'admin';
  favoriteMeetings?: string[];
  photoUrl?: string | null;
  phoneNumber?: string | null;
  fcmTokens?: string[];
  stripeCustomerId?: string;
  sponsorSettings?: SponsorSettings;
  // Onboarding data
  onboardingComplete?: boolean;
  onboardingData?: OnboardingData;
  // Activity tracking
  lastActivityAt?: Date;
  lastLoginAt?: Date;
  activityLog?: ActivityLog;
}

export interface NotificationSettings {
  meetings: boolean;
  announcements: boolean;
  celebrations: boolean;
  groupChatMentions?: boolean;
  allowPushNotifications?: boolean;
  dailyReflections?: boolean;
}

export interface PrivacySettings {
  showRecoveryDate: boolean;
  allowDirectMessages: boolean;
  showPhoneNumber?: boolean;
}

export interface RegisterData {
  email: string;
  password: string;
  confirmPassword: string;
  displayName: string;
  recoveryDate?: string;
  agreeToTerms: boolean;
}

export interface LoginData {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface TreasurySummary {
  balance: number;
  prudentReserve: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  lastUpdated: Date;
}

export interface Treasury {
  balance: number;
  prudentReserve: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  summary: TreasurySummary;
  transactions: Transaction[];
}

export interface HomeGroup {
  id: string;
  name: string;
  description: string;
  location: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  lat?: number;
  lng?: number;
  createdAt: Date;
  updatedAt: Date;
  foundedDate?: string;
  memberCount: number;
  admins: string[]; // Keep for backward compatibility
  adminDetails?: AdminInfo[]; // Detailed admin info with activity tracking
  isClaimed: boolean; // Flag to indicate if group has been claimed
  pendingAdminRequests?: PendingAdminRequest[]; // Admin requests with escalation info
  /**
   * @deprecated Use service positions with name "Treasurer" instead.
   * This field is kept for backward compatibility during migration.
   */
  treasurers: string[];
  placeName?: string;
  type: string;
  meetings: Meeting[];
  treasury: Treasury;
  prudentReserve?: number; // Configurable prudent reserve goal, default 600
  distanceInKm?: number;
  stripeConnectAccountId?: string; // Stripe Connect account ID for receiving payments
  stripeCustomerId?: string; // Stripe customer ID for the group
  stripeSubscriptionItemId?: string; // Stripe subscription item ID for the group
  stripeSubscriptionId?: string; // Stripe subscription ID for the group
  subscriptionStatus?: string; // Stripe subscription status for the group
  subscriptionExpiresAt?: Date | null; // When current subscription period (or trial) ends
  // Payment links for simple donation setup (alternative to Stripe Connect)
  paymentLinks?: PaymentLinks;
  /** Opt-in to public directory — non-members can discover this group */
  isPublic?: boolean;
  /** Short blurb shown in the public directory */
  publicDescription?: string;
  /** Admin can set false to hide this group from the public web page; default: true */
  publicProfileEnabled?: boolean;
}

// Payment links for group donations (simple setup alternative to Stripe Connect)
export interface PaymentLinks {
  venmo?: string; // Venmo username (with or without @)
  cashApp?: string; // Cash App $cashtag
  paypal?: string; // PayPal.me link or username
  zelle?: string; // Zelle email or phone
}

export interface GroupMember {
  id: string; // Document ID: {groupId}_{userId}
  groupId: string;
  userId: string;
  email?: string;
  name: string;
  position?: string;
  isAdmin?: boolean;
  isTreasurer?: boolean; // Denormalized treasurer status for efficient rule checks
  roles?: string[]; // Flexible role list ["admin", "treasurer", "secretary", "member"]
  sobrietyDate?: string;
  phoneNumber?: string;
  showSobrietyDate?: boolean;
  showPhoneNumber?: boolean;
  joinedAt: Date;
  photoUrl?: string;
  sponsorSettings?: SponsorSettings;
}

export interface SobrietyMilestone {
  memberId: string;
  memberName: string;
  years: number;
  date: Date;
}

/**
 * Announcement Types
 */

export interface Announcement {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  authorName: string;
  expiresAt?: Date;
  groupId: string;
  userId: string;
  memberId: string;
  readBy?: string[]; // Array of user IDs who have read
  readCount?: number; // Denormalized count
  status?: 'published' | 'scheduled';
  scheduledFor?: Date;
  publishedAt?: Date;
}

/**
 * Meeting Types
 */

export class DaysAndTimes {
  sunday: string = '';
  monday: string = '';
  tuesday: string = '';
  wednesday: string = '';
  thursday: string = '';
  friday: string = '';
  saturday: string = '';
}

export type MeetingType =
  | 'AA'
  | 'NA'
  | 'IOP'
  | 'Religious'
  | 'Celebrate Recovery'
  | 'Custom';

export interface Meeting {
  id: string;
  name: string;
  meetingId?: string;
  type: MeetingType;
  day: string;
  time: string;
  address?: string;
  country?: string;
  city?: string;
  state?: string;
  street?: string;
  zip?: string;
  lat?: number;
  lng?: number;
  location?: string;
  online?: boolean;
  link?: string | null;
  onlineNotes?: string | null;
  formattedAddress?: string;
  verified?: boolean;
  addedBy?: string;
  groupName?: string;
  createdAt?: Date;
  updatedAt?: Date;
  format?: string;
  locationName?: string;
  groupId?: string; // Optional reference to associated group
  isFavorite?: boolean; // For UI state, not stored
  temporaryNotice?: string | null; // e.g., "Speaker meeting", "Cancelled this week"
  isCancelledTemporarily?: boolean; // Specific flag for cancellation
}

export interface Location {
  lat: number;
  lng: number;
  city?: string;
  state?: string;
  street?: string;
  zip?: string;
}

export interface MeetingSearchCriteria {
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  time?: string;
  location?: Location;
}

export interface MeetingFilters {
  type?: MeetingType;
  day?: keyof DaysAndTimes;
  name?: string;
  location?: Location;
  radius?: number;
}

export interface MeetingSearchInput {
  location?: Location;
  filters?: MeetingFilters;
  criteria?: MeetingSearchCriteria;
}

/**
 * Event Types
 */

export interface GroupEvent {
  id: string;
  title: string;
  description: string;
  date: Date;
  location: string;
  isOnline: boolean;
  meetingLink?: string;
  groupId: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Navigation Types
 */

export type AuthStackParamList = {
  Landing: undefined;
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
};

export type MainStackParamList = {
  Home: undefined;
  HomeGroup: {groupId: string};
  Meetings: undefined;
  MeetingDetails: {meetingId: string};
  Treasury: undefined;
  Profile: undefined;
  Announcements: {groupId: string; groupName: string};
  Events: {groupId: string; groupName: string};
  Members: {groupId: string; groupName: string};
  CreateGroup: {meeting?: Meeting};
  GroupDetails: {groupId: string};
  GroupMembers: {groupId: string; groupName: string};
};

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  Splash: undefined;
};

/**
 * UI Component Props
 */

export interface ButtonProps {
  title: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'text';
  size?: 'small' | 'medium' | 'large';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: any;
  textStyle?: any;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  onPress?: () => void;
}

export interface InputProps {
  label?: string;
  error?: string;
  containerStyle?: any;
  labelStyle?: any;
  inputStyle?: any;
  errorStyle?: any;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  value?: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?:
    | 'default'
    | 'email-address'
    | 'numeric'
    | 'phone-pad'
    | 'number-pad';
  multiline?: boolean;
  numberOfLines?: number;
}

export interface LoadingIndicatorProps {
  size?: 'small' | 'large';
  color?: string;
  style?: any;
  fullscreen?: boolean;
}

export interface SocialSignInButtonProps {
  provider: 'google' | 'apple';
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: any;
}

export interface AnnouncementDetailProps {
  announcement: Announcement;
  isAdmin: boolean;
  isCreator: boolean;
  onDismiss: () => void;
  onUpdate?: (updatedAnnouncement: Announcement) => void;
  onDelete?: (announcementId: string) => void;
}

export interface AnnouncementListProps {
  groupId: string;
  isAdmin: boolean;
  onAnnouncementPress?: (announcement: Announcement) => void;
}

/**
 * Filter Options
 */

export interface MeetingFilterOptions {
  showOnline: boolean;
  showInPerson: boolean;
  meetingType: MeetingType | null;
  day: keyof DaysAndTimes | null;
  radius: number;
}

export interface TreasuryFilterOptions {
  type: TransactionType | 'all';
  dateRange: 'week' | 'month' | 'quarter' | 'year' | 'custom';
  startDate?: Date;
  endDate?: Date;
  category?: string;
}

/**
 * API Response Types
 */

export interface APIResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface ErrorResponse {
  success: false;
  message: string;
  errors?: {[key: string]: string[]};
}

/**
 * Firebase Types
 */

export interface FirestoreTimestamp {
  seconds: number;
  nanoseconds: number;
  toDate: () => Date;
}

export interface FirestoreDocument<T> {
  id: string;
  data: () => T;
}

export interface FirestoreCollection<T> {
  docs: FirestoreDocument<T>[];
}

/**
 * Cloud Function Types
 */

export interface CloudFunctionResponse<T> {
  data: T;
}

export interface MeetingSearchResults {
  meetings: Meeting[];
  totalCount: number;
}

/**
 * Theme Types
 */

export interface ThemeColors {
  primary: {
    light: string;
    main: string;
    dark: string;
    contrastText: string;
  };
  secondary: {
    light: string;
    main: string;
    dark: string;
    contrastText: string;
  };
  text: {
    primary: string;
    secondary: string;
    disabled: string;
  };
  background: {
    default: string;
    paper: string;
  };
  divider: string;
  error: string;
  warning: string;
  info: string;
  success: string;
  grey: {
    [key: number]: string;
  };
}

export interface ThemeSpacing {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
}

export interface ThemeFonts {
  regular: string;
  medium: string;
  light: string;
  thin: string;
}

export interface ThemeFontSizes {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
  xxxl: number;
}

export interface Theme {
  colors: ThemeColors;
  spacing: ThemeSpacing;
  fonts: ThemeFonts;
  fontSizes: ThemeFontSizes;
  roundness: number;
}

/**
 * Service Position Type
 */
export interface ServicePosition {
  id: string; // Firestore document ID
  groupId: string;
  name: string; // e.g., "Secretary", "Treasurer", "GSR", "Coffee Maker"
  description?: string;
  commitmentLength?: number; // Optional length in months
  currentHolderId?: string | null; // User ID of the current holder
  currentHolderName?: string | null; // Denormalized name for display
  termStartDate?: Date | null;
  termEndDate?: Date | null;
  remindersSent?: {
    thirtyDay?: boolean;
    sevenDay?: boolean;
    oneDay?: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Meeting Instance Type (Add Chairperson)
 */
// Direct Message Types
export interface DirectMessage {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  senderPhotoURL?: string;
  text?: string;
  attachments?: ChatAttachment[];
  sentAt: number;
  read: {[userId: string]: boolean};
  reactions?: Record<string, string[]>;
  replyTo?: {messageId: string; senderName: string; text: string} | null;
  isOptimistic?: boolean; // Flag for optimistic UI updates
}

export interface DirectConversation {
  threadId: string;
  otherUserId: string;
  otherUserName: string;
  otherUserPhotoURL?: string;
  lastMessage: {
    text: string;
    senderId: string;
    sentAt: Date;
    read: {[userId: string]: boolean};
  };
  unreadCount: number;
  updatedAt: Date;
}

// Import ChatAttachment from ChatModel (re-export for convenience)
export type {ChatAttachment} from '../models/ChatModel';

export interface MeetingInstance extends Meeting {
  instanceId: string;
  meetingId: string;
  groupId: string;
  scheduledAt: Date;
  link?: string | null | undefined;
  onlineNotes?: string | null | undefined;
  locationName?: string;
  isOnline?: boolean;
  isCancelled: boolean;
  instanceNotice?: string | null;
  templateUpdatedAt: Date;
  // Chairperson fields
  chairpersonId?: string | null;
  chairpersonName?: string | null; // Denormalized for easier display
  // Attendance tracking
  attendees?: string[]; // User IDs who checked in
  attendeeCount?: number; // Denormalized count
  // Override tracking - fields that have been modified from template
  overriddenFields?: {
    scheduledAt?: boolean;
    location?: boolean;
    address?: boolean;
    city?: boolean;
    state?: boolean;
    zip?: boolean;
    lat?: boolean;
    lng?: boolean;
    locationName?: boolean;
    isOnline?: boolean;
    link?: boolean;
    onlineNotes?: boolean;
  };
  // Timestamp of last instance-specific modification
  instanceModifiedAt?: Date;
  // Whether this instance is visible to users outside the group (V3.3 Regional Events)
  isPublic?: boolean;
}
