// src/types/schema.ts

import type {FirebaseFirestoreTypes} from '@react-native-firebase/firestore';
import {Meeting, MeetingType, Treasury} from '.';
import firestore from '@react-native-firebase/firestore';
import {SponsorSettings} from './sponsorship';

export type Timestamp = FirebaseFirestoreTypes.Timestamp;

/**
 * Generic type for Firestore documents
 */
export interface FirestoreDocument<T> {
  id: string;
  data: () => T;
}

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete';
/**
 * This file defines the Firestore schema types and structure
 * to ensure consistency between client and backend.
 */

export type RecurrenceFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface RecurringTransactionDocument {
  id: string;
  groupId: string;
  type: 'income' | 'expense';
  amount: number;
  description: string;
  category: string;
  frequency: RecurrenceFrequency;
  nextDate: FirebaseFirestoreTypes.Timestamp; // Next date to generate on
  dayOfMonth?: number; // 1-28 for monthly/quarterly/yearly
  isActive: boolean;
  createdBy: string;
  createdAt: FirebaseFirestoreTypes.Timestamp;
  updatedAt: FirebaseFirestoreTypes.Timestamp;
}

export interface TransactionDocument {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  description: string;
  category: string;
  createdBy: string;
  createdAt: FirebaseFirestoreTypes.Timestamp;
  groupId: string;
  updatedAt?: FirebaseFirestoreTypes.Timestamp;
  updatedBy?: string;
  editHistory?: {
    editedAt: FirebaseFirestoreTypes.Timestamp;
    editedBy: string;
    previousValues: {
      amount?: number;
      description?: string;
      category?: string;
      type?: 'income' | 'expense';
    };
  }[];
}

export interface TreasuryOverviewDocument {
  balance: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  prudentReserve: number;
  lastUpdated: FirebaseFirestoreTypes.Timestamp;
  lastMonthReset?: FirebaseFirestoreTypes.Timestamp;
  groupId: string;
}

/**
 * Firestore User Document
 */
export interface UserDocument {
  id: string; // Matches UID from Auth, often document ID in users collection
  uid: string; // Firebase Auth UID
  email: string | null;
  displayName: string | null;
  recoveryDate?: Timestamp;
  photoUrl: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastLogin: Timestamp;
  phoneNumber?: string | null;
  showPhoneNumber?: boolean;
  sobrietyStartDate?: Timestamp | null; // Use this as the definitive start date
  showSobrietyDate?: boolean; // Controls visibility of duration/date
  notificationSettings?: {
    meetings?: boolean;
    announcements?: boolean;
    celebrations?: boolean;
    groupChatMentions?: boolean;
    allowPushNotifications?: boolean;
    dailyReflections?: boolean; // Opt-in for daily reflection push (V2)
  };
  privacySettings?: {
    allowDirectMessages?: boolean;
    showRecoveryDate?: boolean;
    showPhoneNumber?: boolean;
  };
  homeGroups?: string[]; // Array of group IDs user is member of
  adminGroups?: string[]; // Array of group IDs user is admin of
  role: 'user' | 'admin';
  favoriteMeetings?: string[]; // Array of meeting IDs
  mutedThreads?: string[]; // Thread IDs the user has muted (DMs)
  fcmTokens?: string[]; // For push notifications
  subscriptionTier?: 'free' | 'plus'; // For premium features
  subscriptionValidUntil?: Timestamp;
  stripeCustomerId?: string | null;
  sponsorSettings?: SponsorSettings;
  // Onboarding data - persisted per user
  onboardingComplete?: boolean;
  onboardingData?: {
    intent: 'admin' | 'member' | 'seeker';
    groupId?: string | null;
    action?: 'create' | 'claim';
    completedAt: Timestamp;
  };
  // Activity tracking for admin inactivity detection
  lastActivityAt?: Timestamp; // Last meaningful activity
  lastLoginAt?: Timestamp; // Last app open
  activityLog?: {
    lastGroupAction?: Timestamp; // Last admin action in any group
    lastChatMessage?: Timestamp;
    lastMeetingAttendance?: Timestamp;
  };
  // Check-in streak tracking (V2)
  checkInStreak?: {
    currentStreak: number;
    longestStreak: number;
    lastCheckInDate: string; // YYYY-MM-DD
  };
  // V4.2.2: Literature saves
  savedLiteratureIds?: string[]; // Array of literature_index document IDs
}

/**
 * Gratitude Journal Entry Document (subcollection: users/{userId}/gratitudeEntries/{YYYY-MM-DD})
 */
export interface GratitudeEntryDocument {
  date: string; // YYYY-MM-DD
  entries: string[]; // Up to 3 items
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Admin activity status type
 */
export type AdminActivityStatus = 'active' | 'inactive' | 'dormant';

/**
 * Admin Info with activity tracking
 */
export interface AdminInfo {
  uid: string;
  addedAt: FirebaseFirestoreTypes.Timestamp;
  lastActiveAt: FirebaseFirestoreTypes.Timestamp; // Last activity in THIS group
  activityStatus: AdminActivityStatus;
}

/**
 * Escalation level for admin requests
 */
export type AdminRequestEscalationLevel = 'normal' | 'timed' | 'instant';

/**
 * Pending Admin Request with escalation tracking
 */
export interface PendingAdminRequest {
  uid: string;
  requestedAt: FirebaseFirestoreTypes.Timestamp;
  message?: string;
  requesterName?: string;
  // Escalation fields for inactive admin handling
  autoApproveAt?: FirebaseFirestoreTypes.Timestamp; // When request auto-approves (if applicable)
  escalationLevel: AdminRequestEscalationLevel;
  notificationsSent: number; // Track reminder count
}

/**
 * Firestore Group Document
 */
export interface GroupDocument {
  id?: string;
  name: string;
  description: string;
  location: string;
  address?: string;
  meetings: Meeting[];
  city?: string;
  state?: string;
  zip?: string;
  lat?: number;
  lng?: number;
  createdAt: FirebaseFirestoreTypes.Timestamp;
  updatedAt: FirebaseFirestoreTypes.Timestamp;
  foundedDate?: FirebaseFirestoreTypes.Timestamp;
  memberCount: number;
  admins: string[]; // Keep for backward compatibility
  adminUids: string[]; // New field explicitly for admin user IDs
  adminDetails?: AdminInfo[]; // Detailed admin info with activity tracking
  isClaimed: boolean; // Flag to indicate if group has been claimed
  pendingAdminRequests: PendingAdminRequest[]; // Array to store admin requests
  /**
   * @deprecated Use service positions with name "Treasurer" instead.
   * This field is kept for backward compatibility during migration.
   */
  treasurers: string[];
  placeName?: string;
  type: string;
  treasury?: Treasury;
  prudentReserve?: number; // Configurable prudent reserve goal, default 600
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  subscriptionStatus?: SubscriptionStatus;
  subscriptionExpiresAt?: Timestamp | null; // Tracks when the current period ends
  stripeConnectAccountId?: string;
  stripeSubscriptionItemId?: string;
  distanceInKm?: number;
  paymentLinks?: {
    venmo?: string;
    cashApp?: string;
    paypal?: string;
    zelle?: string;
  };
  /** Opt-in to public directory — non-members can discover this group */
  isPublic?: boolean;
  /** Short description shown in public directory (optional) */
  publicDescription?: string;
  // V4.4: Intergroup affiliation
  orgId?: string; // Set when group is affiliated with an intergroup
  orgName?: string; // Denormalized for display without extra read
  stripePriceIdGroup?: string;
  stripeProductIdGroup?: string;
  publicProfileEnabled?: boolean; // default: true. Admin can set false to hide from public web page.
}

/**
 * Group Member Document (top-level collection)
 * Document ID format: {groupId}_{userId}
 */
export interface GroupMemberDocument {
  id: string; // Document ID: {groupId}_{userId}
  groupId: string; // Group ID (required)
  userId: string; // User ID (required - for querying and claims sync)
  displayName: string;
  showPhoneNumber: boolean;
  phoneNumber?: string;
  email?: string;
  photoURL?: string;
  joinedAt: Timestamp;
  sobrietyDate?: Timestamp;
  position?: string; // Position in the group (secretary, treasurer, etc.)
  isAdmin: boolean;
  isTreasurer: boolean; // Denormalized treasurer status for efficient rule checks
  roles: string[]; // Flexible role list ["admin", "treasurer", "secretary", "member"]
  showSobrietyDate: boolean; // Privacy setting specific to this group
  photoUrl?: string;
  sponsorSettings?: SponsorSettings;
}

/**
 * Announcement Sub-Collection Document
 */
export interface AnnouncementDocument {
  title: string;
  content: string;
  isPinned: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string; // User ID
  authorName: string; // Display name for efficiency
  expiresAt?: Timestamp;
  groupId: string; // Group ID that this announcement belongs to
  userId: string;
  memberId: string;
  readBy?: string[]; // Array of user IDs who have read
  readCount?: number; // Denormalized count
  status?: 'published' | 'scheduled'; // Defaults to 'published' for backward compat
  scheduledFor?: Timestamp; // Only set when status === 'scheduled'
  publishedAt?: Timestamp; // Set when Cloud Function publishes
}

/**
 * Event Sub-Collection Document
 */
export interface EventDocument {
  id: string;
  title: string;
  description: string;
  date: Timestamp;
  location: string;
  isOnline: boolean;
  meetingLink?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string; // User ID
  attendees?: string[]; // Array of user IDs
}

/**
 * Meeting Document
 */
export interface MeetingDocument {
  meetingId?: string;
  name: string;
  type: string; // AA, NA, etc.
  day: string;
  country?: string;
  time: string;
  street?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  lat?: number;
  lng?: number;
  location?: string;
  isOnline: boolean;
  onlineLink?: string;
  onlineNotes?: string;
  verified: boolean;
  addedBy?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  groupId: string;
  format?: string;
  locationName?: string;
  geohash?: string;
  temporaryNotice?: string | null;
  isCancelledTemporarily?: boolean;
  /** V3.5: For step-study meetings — the step number currently being studied */
  currentStep?: number;
}

/**
 * Notification Document
 */
export interface NotificationDocument {
  id: string;
  userId: string;
  type: string; // announcement, meeting_reminder, etc.
  title: string;
  message: string;
  read: boolean;
  createdAt: Timestamp;
  expiresAt?: Timestamp;
  data?: {
    groupId?: string;
    meetingId?: string;
    announcementId?: string;
    userId?: string;
    url?: string;
    [key: string]: any;
  };
}

/**
 * Business Meeting Document
 */
export interface BusinessMeetingDocument {
  id: string;
  groupId: string;
  date: Timestamp;
  startTime: string;
  endTime?: string;
  location: string;
  isOnline: boolean;
  onlineLink?: string;
  chair: string; // User ID
  secretary: string; // User ID
  attendees: string[]; // Array of user IDs
  treasuryReportId?: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string; // User ID
}

/**
 * Agenda Item Sub-Collection Document
 */
export interface AgendaItemDocument {
  id: string;
  title: string;
  description?: string;
  presenter: string; // User ID
  type: 'old_business' | 'new_business' | 'report' | 'election' | 'other';
  timeAllotted?: number; // minutes
  order: number;
  status: 'pending' | 'in_progress' | 'completed' | 'tabled';
  notes?: string;
}

/**
 * Decision Sub-Collection Document
 */
export interface DecisionDocument {
  id: string;
  topic: string;
  description: string;
  motionBy: string; // User ID
  secondBy?: string; // User ID
  voteFor: number;
  voteAgainst: number;
  voteAbstain: number;
  passed: boolean;
  implementationDate?: Timestamp;
  responsibleParty?: string; // User ID
  notes?: string;
}

/**
 * Service Position Document (Firestore Schema)
 * Stored in subcollection: groups/{groupId}/servicePositions/{positionId}
 */
export interface ServicePositionDocument {
  groupId: string;
  name: string;
  description?: string;
  commitmentLength?: number | null; // months
  currentHolderId?: string | null;
  currentHolderName?: string | null;
  termStartDate?: Timestamp | null;
  termEndDate?: Timestamp | null;
  remindersSent?: {
    thirtyDay?: boolean;
    sevenDay?: boolean;
    oneDay?: boolean;
  };
  termHistory?: TermHistoryRecord[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Literature Item Document
 */
export interface LiteratureItemDocument {
  id: string;
  title: string;
  type: 'book' | 'pamphlet' | 'workbook' | 'card' | 'other';
  program: 'AA' | 'NA' | 'other';
  description?: string;
  imageUrl?: string;
  price?: number;
  itemCode?: string;
  isApproved: boolean;
  language: string;
  publicationDate?: Timestamp;
  publisher: string;
  pages?: number;
  tags?: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Group Literature Inventory Sub-Collection Document
 */
export interface GroupLiteratureInventoryDocument {
  items: {
    literatureId: string;
    title: string;
    quantity: number;
    lastUpdated: Timestamp;
  }[];
  lastUpdated: Timestamp;
  updatedBy: string; // User ID
}

/**
 * Direct Message Thread Document
 */
export interface DirectMessageThreadDocument {
  id: string;
  participants: string[]; // Array of user IDs
  lastMessage: {
    text: string;
    senderId: string;
    sentAt: Timestamp;
    read: {[userId: string]: boolean};
  };
  unreadCounts?: {[userId: string]: number}; // Unread message count per user
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Direct Message Sub-Collection Document
 */
export interface DirectMessageDocument {
  id: string;
  senderId: string;
  senderName: string;
  senderPhotoURL?: string;
  text: string;
  sentAt: Timestamp;
  read: {[userId: string]: boolean};
  attachments?: {
    type: 'image' | 'file' | 'voice';
    url: string;
    name?: string;
    size?: number;
    duration?: number;
  }[];
  reactions?: {
    [reactionType: string]: string[]; // userId[]
  };
  replyTo?: {
    messageId: string;
    text: string;
    senderName: string;
  };
}

/**
 * Group Chat Document
 */
export interface GroupChatDocument {
  groupId: string;
  lastMessage: {
    text: string;
    senderId: string;
    senderName: string;
    sentAt: Timestamp;
  };
  participantCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastMessageAt?: Timestamp;
  readStatus?: {
    [userId: string]: {
      lastReadAt: Timestamp;
      lastReadMessageId?: string;
    };
  };
}

/**
 * Chat Message Document
 */
export interface ChatMessageDocument {
  id: string;
  groupId: string;
  senderId: string;
  senderName: string;
  senderPhotoURL?: string;
  text: string;
  sentAt: Timestamp;
  readBy: {[userId: string]: boolean};
  attachments?: {
    type: 'image' | 'file' | 'voice';
    url: string;
    name?: string;
    size?: number;
    duration?: number; // for voice messages
  }[];
  reactions?: {
    [reactionType: string]: string[]; // userId[]
  };
  replyTo?: {
    messageId: string;
    text: string;
    senderId: string;
    senderName: string;
  };
}

/**
 * Meeting Instance Document (Firestore Schema) - Add Chairperson
 */
export interface MeetingInstanceDocument {
  meetingId: string;
  groupId: string;
  scheduledAt: Timestamp;
  name: string;
  type: string;
  format?: string | null;
  location?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  lat?: number | null;
  lng?: number | null;
  locationName?: string | null;
  isOnline?: boolean;
  link?: string | null;
  onlineNotes?: string | null;
  isCancelled: boolean;
  instanceNotice?: string | null;
  templateUpdatedAt: Timestamp;
  // Chairperson fields
  chairpersonId?: string | null;
  chairpersonName?: string | null;
  // Attendance tracking
  attendees?: string[]; // User IDs who checked in
  attendeeCount?: number; // Denormalized count for quick display
  // Override tracking - fields that have been modified from template
  overriddenFields?: {
    scheduledAt?: boolean; // Date/time changed
    location?: boolean; // Location fields changed
    address?: boolean;
    city?: boolean;
    state?: boolean;
    zip?: boolean;
    lat?: boolean;
    lng?: boolean;
    locationName?: boolean;
    isOnline?: boolean; // Online status changed
    link?: boolean; // Online link changed
    onlineNotes?: boolean; // Online notes changed
  };
  // Timestamp of last instance-specific modification
  instanceModifiedAt?: Timestamp;
  // Whether this instance is visible to users outside the group (V3.3 Regional Events)
  isPublic?: boolean;
}

/**
 * Report reason types
 */
export type ReportReason =
  | 'harassment'
  | 'spam'
  | 'inappropriate'
  | 'threatening'
  | 'other';

/**
 * Report status types
 */
export type ReportStatus = 'pending' | 'reviewed' | 'actioned' | 'dismissed';

/**
 * Report action types
 */
export type ReportAction =
  | 'none'
  | 'warning'
  | 'content_removed'
  | 'user_banned';

/**
 * Content type that can be reported
 */
export type ReportContentType = 'message' | 'announcement' | 'user';

/**
 * Report Document - For content moderation
 */
export interface ReportDocument {
  id: string;
  reporterId: string;
  reporterName: string;
  reportedUserId: string;
  reportedUserName: string;
  groupId: string;
  contentType: ReportContentType;
  contentId?: string; // messageId or announcementId
  contentSnapshot?: string; // Copy of content at report time
  reason: ReportReason;
  description?: string;
  status: ReportStatus;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: Timestamp;
  action?: ReportAction;
  adminNotes?: string;
  createdAt: Timestamp;
}

/**
 * User Ban Document - For tracking banned users
 */
export interface UserBanDocument {
  id: string;
  userId: string;
  userName: string;
  groupId?: string; // null = platform-wide ban
  bannedBy: string;
  bannedByName: string;
  reason: string;
  reportId?: string; // Link to originating report
  bannedAt: Timestamp;
  expiresAt?: Timestamp; // null = permanent ban
  isActive: boolean;
  revokedAt?: Timestamp;
  revokedBy?: string;
  revokedByName?: string;
}

/**
 * Admin Removal Request Document
 * Collection: admin_removal_requests/{requestId}
 */
export type AdminRemovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'withdrawn';

export interface AdminRemovalRequestDocument {
  id: string;
  groupId: string;
  targetAdminId: string;
  targetAdminName: string;
  initiatedBy: string;
  initiatedByName: string;
  reason: string;
  status: AdminRemovalStatus;
  createdAt: FirebaseFirestoreTypes.Timestamp;
  expiresAt: FirebaseFirestoreTypes.Timestamp; // createdAt + 7 days
  resolvedAt?: FirebaseFirestoreTypes.Timestamp;
  // Denormalized vote tallies (updated on each vote write)
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  totalEligibleVoters: number; // group memberCount at time of initiation
  // Optional admin response
  adminResponse?: string;
  adminRespondedAt?: FirebaseFirestoreTypes.Timestamp;
}

/**
 * Admin Removal Vote Document
 * Collection: admin_removal_requests/{requestId}/votes/{userId}
 */
export interface AdminRemovalVoteDocument {
  userId: string;
  userName: string;
  vote: 'yes' | 'no' | 'abstain';
  votedAt: FirebaseFirestoreTypes.Timestamp;
}

/**
 * Referral Code Document
 * Collection: referral_codes/{code}
 */
export interface ReferralCodeDocument {
  code: string; // e.g., "JOHN2024" or auto-generated 6-char alphanumeric
  creatorId: string; // UID of admin who owns it
  creatorGroupId: string;
  uses: number; // increment on each use
  createdAt: FirebaseFirestoreTypes.Timestamp;
  isActive: boolean;
}

/**
 * Referral Document
 * Collection: referrals/{id}
 */
export interface ReferralDocument {
  id: string;
  code: string;
  referrerId: string; // UID of admin who owns the code
  referrerGroupId: string;
  referredUserId: string; // UID of user who used the code
  referredGroupId?: string; // Set when they create+subscribe a group
  status: 'pending' | 'converted' | 'expired';
  rewardApplied: boolean;
  createdAt: FirebaseFirestoreTypes.Timestamp;
  convertedAt?: FirebaseFirestoreTypes.Timestamp;
}

/**
 * Group Conscience Vote Document
 * Collection: group_conscience_votes (top-level, scoped by groupId)
 */
export interface ConscienceVoteDocument {
  id: string;
  groupId: string;
  groupName: string;
  createdBy: string;
  createdByName?: string;
  title: string;
  description?: string;
  options: string[]; // Default: ["Yes", "No", "Abstain"]
  votes: Record<string, string>; // userId → option chosen
  status: 'open' | 'closed';
  quorumRequired?: number;
  openedAt: FirebaseFirestoreTypes.Timestamp;
  closedAt?: FirebaseFirestoreTypes.Timestamp;
  autoCloseAt?: FirebaseFirestoreTypes.Timestamp;
  result?: {
    counts: Record<string, number>;
    winner?: string | null;
    quorumMet: boolean;
    totalVotes: number;
    totalEligible: number;
  };
}

/**
 * Step Work — Completed Step record embedded in StepProgressDocument
 */
export interface CompletedStep {
  step: number;
  completedAt: Timestamp;
  durationDays: number;
}

/**
 * Step Progress Document
 * Path: users/{userId}/stepProgress/current  (singleton)
 */
export interface StepProgressDocument {
  currentStep: number; // 1-12
  startedAt: Timestamp;
  completedSteps: CompletedStep[];
  sponsorId?: string;
  allowSponsorAccess: boolean;
}

/**
 * Step Note Document
 * Collection: users/{userId}/stepNotes  (doc ID = step number as string)
 */
export interface StepNoteDocument {
  step: number;
  content: string;
  updatedAt: Timestamp;
  isPrivate: boolean;
}

/**
 * Daily Reflection Document
 * Collection: daily_reflections
 * Document ID: zero-padded day of year, e.g. "001" through "365"
 */
export interface DailyReflectionDocument {
  dayOfYear: number; // 1-365
  title: string;
  body: string; // 2-4 sentence reflection text
  theme?: string; // e.g. "gratitude" | "service" | "honesty" | "surrender" | "community"
  tags?: string[]; // Optional searchable tags
  source?: string; // e.g. "public_domain" | "original" — never copyrighted AA/NA text
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Group Daily Thought Document
 * Collection: groups/{groupId}/dailyThoughts
 * Document ID: YYYY-MM-DD (one thought per group per day)
 */
export interface GroupDailyThoughtDocument {
  date: string; // YYYY-MM-DD
  groupId: string;
  content: string; // Admin's message for the day, max 500 chars
  authorId: string;
  authorName: string;
  createdAt: Timestamp;
}

/**
 * Literature Index Document
 * Collection: literature_index
 * Document ID: auto-generated
 *
 * Content policy: source must be 'public_domain' | 'original' | 'external_link' | 'contributed'
 * Contributed items have isApproved: false until a platform admin approves them.
 */
export interface LiteratureIndexDocument {
  id: string;
  title: string;
  author?: string;
  type:
    | 'article'
    | 'guide'
    | 'pamphlet'
    | 'meditation'
    | 'prayer'
    | 'external_link';
  source: 'public_domain' | 'original' | 'external_link' | 'contributed';
  program?: 'AA' | 'NA' | 'Al-Anon' | 'general';
  summary: string; // 1-3 sentences, always present
  fullText?: string; // Only for original/public_domain content; omitted for external_link
  externalUrl?: string; // Only for source === 'external_link'
  tags: string[]; // e.g. ["step-work", "gratitude", "service", "step-4"]
  contributedBy?: string; // userId of contributor if source === 'contributed'
  isApproved: boolean; // false until platform admin approves contributed items
  saveCount: number; // Denormalized count of user saves (for popularity sort)
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Group Literature Bookmark Document
 * Collection: groups/{groupId}/literatureBookmarks
 * Document ID: literatureIndexId
 */
export interface GroupLiteratureBookmarkDocument {
  literatureId: string;
  addedBy: string; // userId of admin who bookmarked it
  addedByName: string;
  addedAt: Timestamp;
  note?: string; // Optional group note: "We use this for Step 4 study"
}

/**
 * Meeting Topic Document
 * Collection: meeting_topics
 * Document ID: auto-generated
 */
export interface MeetingTopicDocument {
  id: string;
  title: string; // e.g. "Surrender and Acceptance"
  description: string; // 2-4 discussion starter sentences
  category:
    | 'discussion'
    | 'step_study'
    | 'big_book_theme'
    | 'speaker_prompt'
    | 'seasonal';
  stepNumber?: number; // 1-12, only for category === 'step_study'
  tags: string[]; // e.g. ["step-1", "powerlessness", "surrender"]
  contributedBy?: string; // userId — null for platform-seeded topics
  contributorName?: string;
  isApproved: boolean;
  useCount: number; // Denormalized — incremented when a group uses the topic
  createdAt: Timestamp;
}

/**
 * Group Topic Favorite Document
 * Collection: groups/{groupId}/topicFavorites
 * Document ID: topicId
 */
export interface GroupTopicFavoriteDocument {
  topicId: string;
  addedBy: string;
  addedAt: Timestamp;
  usedAt?: Timestamp; // Last time this was used at a meeting
  useCount: number; // How many times this group has used this topic
}

/**
 * Group Resource Document
 * Collection: groups/{groupId}/resources
 * Document ID: auto-generated
 */
export interface GroupResourceDocument {
  id: string;
  groupId: string;
  title: string;
  description?: string;
  type: 'pdf' | 'document' | 'image' | 'link' | 'other';
  source: 'upload' | 'external_link';
  // For source === 'upload':
  storageRef?: string; // Firebase Storage path: groups/{groupId}/resources/{id}/{filename}
  downloadUrl?: string; // Signed/public URL for download
  fileSize?: number; // bytes
  filename?: string;
  // For source === 'external_link':
  externalUrl?: string;
  uploadedBy: string; // userId
  uploaderName: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  isActive: boolean; // false = soft-deleted
}

/**
 * Firestore Collection Paths
 */
export const COLLECTION_PATHS = {
  USERS: 'users',
  GROUPS: 'groups',
  MEMBERS: 'members',
  GROUP_MEMBERS: (groupId: string) => `groups/${groupId}/members`, // Keep old path if needed
  SERVICE_POSITIONS: (groupId: string) => `groups/${groupId}/servicePositions`, // Subcollection
  ANNOUNCEMENTS: 'announcements',
  EVENTS: (groupId: string) => `groups/${groupId}/events`,
  TRANSACTIONS: `transactions`,
  TREASURY_OVERVIEW: `treasury_overviews`,
  MEETINGS: 'meetings',
  MEETING_INSTANCES: 'meetingInstances',
  NOTIFICATIONS: 'notifications',
  BUSINESS_MEETINGS: 'business_meetings',
  AGENDA_ITEMS: (meetingId: string) => `business_meetings/${meetingId}/agenda`,
  DECISIONS: (meetingId: string) => `business_meetings/${meetingId}/decisions`,
  LITERATURE: 'literature',
  GROUP_LITERATURE: (groupId: string) => `groups/${groupId}/literature`,
  DIRECT_MESSAGE_THREADS: 'direct_message_threads',
  DIRECT_MESSAGES: (threadId: string) =>
    `direct_message_threads/${threadId}/messages`,
  GROUP_CHATS: 'group_chats',
  CHAT_MESSAGES: (groupId: string) => `group_chats/${groupId}/messages`,
  REPORTS: 'reports',
  USER_BANS: 'user_bans',
  ADMIN_REMOVAL_REQUESTS: 'admin_removal_requests',
  ADMIN_REMOVAL_VOTES: (requestId: string) =>
    `admin_removal_requests/${requestId}/votes`,
  TREASURER_HANDOFFS: (groupId: string) =>
    `groups/${groupId}/treasurerHandoffs`,
  RECURRING_TRANSACTIONS: 'recurring_transactions',
  REFERRAL_CODES: 'referral_codes',
  REFERRALS: 'referrals',
  GROUP_INVITES: 'groupInvites',
  GROUP_CONSCIENCE_VOTES: 'group_conscience_votes',
  UPGRADE_REQUESTS: (groupId: string) => `groups/${groupId}/upgradeRequests`,
  GRATITUDE_ENTRIES: (userId: string) => `users/${userId}/gratitudeEntries`,
  MILESTONES: (groupId: string) => `groups/${groupId}/milestones`,
  // V3.5 Step Work
  STEP_PROGRESS: (userId: string) => `users/${userId}/stepProgress`,
  STEP_NOTES: (userId: string) => `users/${userId}/stepNotes`,
  // V4.1 Advanced Governance
  GROUP_BYLAWS: 'group_bylaws',
  BYLAW_VERSIONS: (groupId: string) => `group_bylaws/${groupId}/versions`,
  GROUP_ELECTIONS: 'group_elections',
  MEETING_MINUTES: (meetingId: string) =>
    `business_meetings/${meetingId}/minutes`,
  INTERGROUP_REPORTS: 'intergroup_reports',
  // V4.4 Enterprise
  INTERGROUPS: 'intergroups',
  INTERGROUP_MEMBERS: (intergroupId: string) =>
    `intergroups/${intergroupId}/members`,
  INTERGROUP_ANNOUNCEMENTS: (intergroupId: string) =>
    `intergroups/${intergroupId}/announcements`,
  BRANDING: 'branding',
  SSO_DOMAIN_INDEX: 'sso_domain_index',
  SSO_JOIN_LOG: (intergroupId: string) => `sso_join_log/${intergroupId}/events`,
  GROUP_BACKUPS: (groupId: string) => `groups/${groupId}/backups`,
  GROUP_EXPORTS: (groupId: string) => `exports/${groupId}`,
  // V4.2.1 Daily Reflections
  DAILY_REFLECTIONS: 'daily_reflections',
  GROUP_DAILY_THOUGHTS: (groupId: string) => `groups/${groupId}/dailyThoughts`,
  // V4.2.2 Literature Index
  LITERATURE_INDEX: 'literature_index',
  GROUP_LITERATURE_BOOKMARKS: (groupId: string) =>
    `groups/${groupId}/literatureBookmarks`,
  // V4.2.3 Meeting Topics
  MEETING_TOPICS: 'meeting_topics',
  GROUP_TOPIC_FAVORITES: (groupId: string) =>
    `groups/${groupId}/topicFavorites`,
  // V4.2.5 Group Resources
  GROUP_RESOURCES: (groupId: string) => `groups/${groupId}/resources`,
};

/**
 * Milestone Record — one chip given to a member
 * Stored inside MilestoneDocument.milestones array
 */
export interface MilestoneRecord {
  days: number; // e.g. 30, 60, 90, 180, 270, 365, 730, 1095...
  chipGivenAt: FirebaseFirestoreTypes.Timestamp;
  chipGivenBy: string; // userId of admin who recorded the chip
  notes?: string;
}

/**
 * Milestone Document
 * Collection: groups/{groupId}/milestones/{memberId}
 * One document per member in the group (keyed by group_member document ID)
 */
export interface MilestoneDocument {
  userId: string; // Firebase Auth UID of the member
  displayName: string;
  sobrietyDate: FirebaseFirestoreTypes.Timestamp;
  milestones: MilestoneRecord[];
  nextMilestoneDate?: FirebaseFirestoreTypes.Timestamp;
  nextMilestoneDays?: number;
}

/**
 * Bylaw Document
 * Collection: group_bylaws/{groupId}   (one document per group, the current ratified version)
 */
export interface BylawDocument {
  groupId: string;
  groupName: string;
  title: string;
  content: string;
  version: number;
  status: 'draft' | 'ratified';
  ratifyingVoteId?: string;
  ratifiedAt?: FirebaseFirestoreTypes.Timestamp;
  ratifiedBy?: string;
  createdAt: FirebaseFirestoreTypes.Timestamp;
  updatedAt: FirebaseFirestoreTypes.Timestamp;
  createdBy: string;
  lastEditedBy: string;
}

/**
 * Bylaw Version Archive
 * Collection: group_bylaws/{groupId}/versions/{versionNumber}
 */
export interface BylawVersion {
  version: number;
  content: string;
  ratifiedAt: FirebaseFirestoreTypes.Timestamp;
  ratifyingVoteId: string;
}

/**
 * Election Nominee
 */
export interface ElectionNominee {
  userId: string;
  displayName: string;
  nominatedAt: FirebaseFirestoreTypes.Timestamp;
  nominatedBy: string;
  nomineeStatement?: string;
  withdrawn?: boolean;
}

export type ElectionStatus = 'nominations_open' | 'voting_open' | 'closed';

/**
 * Election Document
 * Collection: group_elections (top-level, scoped by groupId)
 */
export interface ElectionDocument {
  id: string;
  groupId: string;
  groupName: string;
  positionId: string;
  positionName: string;
  createdBy: string;
  createdByName: string;
  status: ElectionStatus;
  nominees: ElectionNominee[];
  votes: Record<string, string>;
  nominationsOpenAt: FirebaseFirestoreTypes.Timestamp;
  nominationsCloseAt?: FirebaseFirestoreTypes.Timestamp;
  votingOpenAt?: FirebaseFirestoreTypes.Timestamp;
  closedAt?: FirebaseFirestoreTypes.Timestamp;
  result?: {
    winnerId: string | null;
    winnerName: string | null;
    counts: Record<string, number>;
    totalVotes: number;
    totalEligible: number;
    tied: boolean;
  };
  winnerAssigned?: boolean;
  createdAt: FirebaseFirestoreTypes.Timestamp;
  updatedAt: FirebaseFirestoreTypes.Timestamp;
}

/**
 * Minutes Agenda Entry
 */
export interface MinutesAgendaEntry {
  itemId: string;
  title: string;
  notes: string;
  outcome: 'no_action' | 'voted' | 'tabled' | 'information_only';
}

/**
 * Minutes Decision Entry
 */
export interface MinutesDecisionEntry {
  topic: string;
  motionText: string;
  movedBy: string;
  secondedBy?: string;
  voteFor: number;
  voteAgainst: number;
  voteAbstain: number;
  passed: boolean;
  notes?: string;
}

/**
 * Meeting Minutes Document
 * Collection: business_meetings/{meetingId}/minutes/record  (singleton per meeting)
 */
export interface MeetingMinutesDocument {
  businessMeetingId: string;
  groupId: string;
  groupName: string;
  date: FirebaseFirestoreTypes.Timestamp;
  openedAt?: string;
  closedAt?: string;
  chair: string;
  secretary: string;
  attendanceCount: number;
  memberQuorum: boolean;
  guestsPresent?: string;
  openingPrayer: boolean;
  closingPrayer: boolean;
  treasuryReport?: {
    openingBalance: number;
    collection7thTradition: number;
    expenses: number;
    closingBalance: number;
    prudentReserve: number;
    notes?: string;
  };
  agendaItems: MinutesAgendaEntry[];
  decisions: MinutesDecisionEntry[];
  nextMeetingDate?: FirebaseFirestoreTypes.Timestamp;
  nextMeetingLocation?: string;
  announcements?: string;
  status: 'draft' | 'approved';
  approvedAt?: FirebaseFirestoreTypes.Timestamp;
  approvedBy?: string;
  createdBy: string;
  createdAt: FirebaseFirestoreTypes.Timestamp;
  updatedAt: FirebaseFirestoreTypes.Timestamp;
}

/**
 * Term History Record — embedded array in ServicePositionDocument
 */
export interface TermHistoryRecord {
  holderId: string;
  holderName: string;
  termStartDate: FirebaseFirestoreTypes.Timestamp;
  termEndDate?: FirebaseFirestoreTypes.Timestamp;
  rotatedAt: FirebaseFirestoreTypes.Timestamp;
  rotatedBy: string;
  notes?: string;
}

/**
 * Intergroup Report Document
 * Collection: intergroup_reports/{reportId}
 * Document ID convention: {groupId}_{YYYY-MM}
 */
export interface IntergroupReportDocument {
  id: string;
  groupId: string;
  groupName: string;
  reportMonth: string;
  reportYear: number;
  reportMonthNumber: number;
  groupType: string;
  meetingDay: string;
  meetingTime: string;
  meetingLocation: string;
  isOnlineMeeting: boolean;
  gsrName?: string;
  gsrPhoneNumber?: string;
  averageAttendance: number;
  numberOfMeetingsHeld: number;
  totalSeventhTraditionCollected: number;
  sobrietyBirthdays: {
    memberName: string;
    years: number;
  }[];
  officers: {
    positionName: string;
    holderName: string;
  }[];
  groupNotes?: string;
  status: 'draft' | 'submitted';
  createdBy: string;
  createdAt: FirebaseFirestoreTypes.Timestamp;
  updatedAt: FirebaseFirestoreTypes.Timestamp;
}

// ============================================================
// V4.4 ENTERPRISE TYPES
// ============================================================

export type IntergroupTier = 'tier_a' | 'tier_b'; // tier_a: up to 10 groups, tier_b: unlimited

/**
 * Intergroup / District Document
 * Collection: intergroups/{intergroupId}
 */
export interface IntergroupDocument {
  id: string;
  name: string; // e.g., "Greater Atlanta Area Intergroup"
  type: 'intergroup' | 'district' | 'area' | 'treatment_center';
  description?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  state?: string;
  country?: string;

  // Affiliated groups — list of groupIds this intergroup manages
  affiliatedGroupIds: string[]; // Max 10 for tier_a, unlimited for tier_b
  maxGroups: number; // 10 for tier_a, 9999 for tier_b (sentinel for unlimited)

  // Admins
  adminUids: string[]; // UIDs of intergroup-level admins

  // Stripe subscription (paid by intergroup org, not individual groups)
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripeSubscriptionItemId?: string;
  stripePriceIdIntergroup?: string;
  stripeProductIdIntergroup?: string; // productIdIntergroupA or productIdIntergroupB
  subscriptionStatus?: SubscriptionStatus;
  subscriptionExpiresAt?: Timestamp | null;
  tier?: IntergroupTier;

  // Branding (populated by V4.4.3)
  brandingId?: string; // Reference to branding/{brandingId}

  // SSO domain (populated by V4.4.5)
  emailDomains?: string[]; // e.g., ["treehouserecovery.org"]
  ssoAutoJoinGroupId?: string; // Group new SSO users are auto-joined to
  ssoEnabled?: boolean;

  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string; // UID of founding admin
}

/**
 * Intergroup Member Document
 * Collection: intergroups/{intergroupId}/members/{userId}
 */
export interface IntergroupMemberDocument {
  userId: string;
  displayName: string;
  email?: string;
  role: 'owner' | 'admin' | 'viewer';
  addedAt: Timestamp;
  addedBy: string;
}

/**
 * Facility Stats Document — anonymized aggregate for treatment centers
 * Path: intergroups/{intergroupId}/facilityStats/current  (singleton)
 */
export interface FacilityStatsDocument {
  totalActiveMemberCount: number;
  totalMilestonesAwarded: number;
  milestonesThisMonth: number;
  milestonesThisYear: number;
  sobrietyBuckets: {
    under30Days: number;
    thirtyToNinetyDays: number;
    ninetyDaysToOneYear: number;
    oneToTwoYears: number;
    twoToFiveYears: number;
    fiveYearsPlus: number;
  };
  totalMeetingsThisMonth: number;
  totalAttendanceThisMonth: number;
  averageAttendancePerMeeting: number;
  lastUpdated: Timestamp;
  generatedBy: string;
}

/**
 * Branding Document
 * Collection: branding/{brandingId}
 */
export interface BrandingDocument {
  id: string;
  intergroupId: string;
  orgName: string;
  logoUrl?: string;
  primaryColor: string;
  accentColor: string;
  backgroundColor?: string;
  headerTextColor?: string;
  welcomeMessage?: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: Timestamp;
  reviewedAt?: Timestamp;
  reviewedBy?: string;
  rejectionReason?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * SSO Domain Index Document
 * Collection: sso_domain_index/{domain}
 */
export interface SSODomainIndexDocument {
  domain: string;
  intergroupId: string;
  autoJoinGroupId: string;
  intergroupName: string;
  enabled: boolean;
  configuredAt: Timestamp;
  configuredBy: string;
}

/**
 * SSO Join Log Document
 * Collection: sso_join_log/{intergroupId}/events/{eventId}
 */
export interface SSOJoinLogDocument {
  userId: string;
  displayName: string;
  domain: string;
  joinedAt: Timestamp;
  groupId: string;
}

/**
 * Group Backup Log Document
 * Path: groups/{groupId}/backups/{YYYY-MM}
 */
export interface GroupBackupLogDocument {
  period: string;
  filePath: string;
  fileSizeBytes: number;
  completedAt: Timestamp;
  status: 'success' | 'failed';
  errorMessage?: string;
}

/**
 * Firestore Treasurer Handoff Document
 */
export interface TreasurerHandoffDocument {
  id?: string;
  groupId: string;
  positionId: string;

  // Outgoing treasurer
  previousTreasurerId: string;
  previousTreasurerName: string;

  // Incoming treasurer
  newTreasurerId: string;
  newTreasurerName: string;

  // Financial snapshot
  balanceAtHandoff: number;
  prudentReserveAtHandoff: number;

  // Transition details
  transitionNotes?: string;
  rejectionReason?: string;

  // Status
  status: 'pending' | 'accepted' | 'completed' | 'rejected' | 'cancelled';

  // Timestamps
  createdAt: FirebaseFirestoreTypes.Timestamp;
  acceptedAt?: FirebaseFirestoreTypes.Timestamp;
  completedAt?: FirebaseFirestoreTypes.Timestamp;
  rejectedAt?: FirebaseFirestoreTypes.Timestamp;
  cancelledAt?: FirebaseFirestoreTypes.Timestamp;
}
