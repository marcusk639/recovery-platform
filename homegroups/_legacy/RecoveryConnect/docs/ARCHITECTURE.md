> ⚠️ **Legacy document.** Carried over from the standalone `RecoveryConnect` repository, archived on 2026-06-06. Historical reference only — may be outdated and is NOT part of current `homegroups` documentation.

# RecoveryConnect — End-to-End Architecture

Comprehensive breakdown of the mobile app and Cloud Functions implementations.

**Last updated**: 2026-05-25
**Codebase stats**: 26 Redux slice files (24 registered; 2 dead — see ROADMAP D-1) · 16 models · 90 callable functions · 16 active Firestore triggers (+ 1 commented out: `onGroupAdminUpdate`) · 14 Pub/Sub schedulers · 106 mobile screens

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Mobile App — Navigation](#2-mobile-app--navigation)
3. [Mobile App — State Management (Redux Slices)](#3-mobile-app--state-management)
4. [Mobile App — Data Access (Models)](#4-mobile-app--data-access-models)
5. [Mobile App — Screens](#5-mobile-app--screens)
6. [Cloud Functions — Callable](#6-cloud-functions--callable)
7. [Cloud Functions — HTTP Endpoints](#7-cloud-functions--http-endpoints)
8. [Cloud Functions — Firestore Triggers](#8-cloud-functions--firestore-triggers)
9. [Cloud Functions — Auth Triggers](#9-cloud-functions--auth-triggers)
10. [Cloud Functions — Pub/Sub Scheduled Jobs](#10-cloud-functions--pubsub-scheduled-jobs)
11. [Cloud Functions — Utilities](#11-cloud-functions--utilities)
12. [Firestore Schema](#12-firestore-schema)
13. [Cross-Cutting Patterns](#13-cross-cutting-patterns)
14. [Data Flow Diagrams](#14-data-flow-diagrams)

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        MOBILE APP (React Native)                    │
│                                                                     │
│  Navigation (7 navigators) → Screens (106) → Redux (26 slices)     │
│                                    │                                │
│                              Models (16)                            │
│                                    │                                │
│                    ┌───────────────┼───────────────┐                │
│                    ▼               ▼               ▼                │
│              Firestore         Functions       Auth/FCM             │
└────────────────────┬───────────────┬───────────────┬────────────────┘
                     │               │               │
┌────────────────────▼───────────────▼───────────────▼────────────────┐
│                         FIREBASE BACKEND                            │
│                                                                     │
│  Firestore (30+ collections)  ·  Auth (JWT claims, SSO)            │
│  Cloud Functions (90 callable + 16 triggers + 14 cron)             │
│  FCM (push notifications)  ·  Storage (media)  ·  Hosting          │
│                                                                     │
│                    ┌───────────────┐                                │
│                    ▼               ▼                                │
│              Stripe API      External APIs                          │
│          (subscriptions,    (Meeting Guide,                         │
│           Connect, Portal)   SendGrid, Geocode)                    │
└─────────────────────────────────────────────────────────────────────┘
```

### Feature Versions

| Version | Name          | Features                                                                                 |
| ------- | ------------- | ---------------------------------------------------------------------------------------- |
| V2      | Core          | Groups, meetings, chat, DMs, treasury, gratitude journal                                 |
| V3.1    | Milestones    | Sobriety milestones, meeting check-in, referral program                                  |
| V3.2    | Meeting Guide | Meeting Guide format export                                                              |
| V3.3    | Engagement    | Check-in streaks, engagement metrics, group conscience votes                             |
| V3.5    | Depth         | Step work, sponsorship, treasurer handoff, recurring transactions, admin removal         |
| V4.1    | Governance    | Bylaws, elections, meeting minutes, term history, intergroup reports                     |
| V4.2    | Content       | 365 reflections, literature index, meeting topics, sobriety calculator, group resources  |
| V4.3    | Analytics     | Group health, attendance trends, treasury trends, member engagement, My Recovery Journey |
| V4.4    | Enterprise    | Intergroup accounts, treatment center, white-label branding, data export, SSO            |

---

## 2. Mobile App — Navigation

### Navigator Tree

```
AppNavigator
├── SplashScreen (loading)
├── OnboardingScreen (new users)
├── AuthNavigator (unauthenticated)
│   ├── LandingScreen
│   ├── LoginScreen
│   ├── RegisterScreen
│   ├── ForgotPasswordScreen
│   └── MeetingFinderScreen (public access)
│
├── MainTabNavigator (authenticated)
│   ├── Tab 1: Home → GroupStackNavigator (130+ screens)
│   │   ├── Group Discovery (search, join, create)
│   │   ├── Group Overview → GroupTabNavigator
│   │   │   ├── Members, Announcements, Treasury
│   │   │   ├── Chat, Schedule, Calendar
│   │   │   └── Service Positions
│   │   ├── Treasury (transactions, reports, recurring, handoff)
│   │   ├── Business Meetings (agenda, decisions, minutes)
│   │   ├── Governance (bylaws, elections, conscience votes)
│   │   ├── Sponsorship (sponsors list, chat, analytics)
│   │   ├── Admin (dashboard, health, moderation, bans)
│   │   ├── Resources (literature, daily thought, topics)
│   │   └── Data Export
│   │
│   ├── Tab 2: Meetings → MeetingFinderScreen
│   ├── Tab 3: Groups → GroupSearchScreen
│   ├── Tab 4: Messages → MessagesNavigator
│   │   ├── UnifiedInboxScreen
│   │   ├── ConversationsListScreen
│   │   └── DirectMessageScreen
│   ├── Tab 5: Profile → ProfileNavigator
│   │   ├── ProfileScreen, ProfileManagementScreen
│   │   ├── SobrietyTrackerScreen, SobrietyCalculatorScreen
│   │   ├── StepTrackerScreen, CheckInStreakScreen
│   │   ├── GratitudeJournalScreen, DailyReflectionScreen
│   │   ├── MySponsorshipsScreen
│   │   ├── LiteratureIndexScreen → LiteratureDetailScreen
│   │   └── MyRecoveryJourneyScreen (V4.3)
│   └── Tab 6: AdminPanel (super admins only)
│
└── IntergroupNavigator (V4.4, feature-flagged)
    ├── IntergroupDashboardScreen
    ├── IntergroupGroupsScreen
    ├── IntergroupAnnouncementScreen
    ├── FacilityDashboardScreen
    └── IntergroupSSOScreen
```

**Limited Mode** (U-4): Unauthenticated seekers can use the app without signing up — useful for evaluating Meetings before committing.

- **Entry point**: `mobile/src/navigation/MainTabNavigator.tsx` reads an AsyncStorage flag `@onboarding_complete_anonymous`. If set (the user opted into "Just looking" during onboarding), the app skips the auth gate and renders the tabs as a seeker.
- **Tab behavior**: Meetings tab is fully usable (read-only). Home, Profile, and Messages tabs render a locked placeholder with a sign-up CTA. The CTA opens an `AuthModal` (embedded screen, not a navigation route) which the user can dismiss without signing up.
- **Redux store** (`mobile/src/store/index.ts`): Seeker flows still hydrate slices that don't require auth (meetings, geocoding) but skip slices that do (members, transactions, milestones). `auth.user` remains null throughout.
- **State transition**: When a seeker eventually signs up via AuthModal, the AsyncStorage flag is cleared and the full Redux rehydration runs as if it were a first sign-in.

---

## 3. Mobile App — State Management

27 Redux Toolkit slices with entity adapters for normalized state. Organized by domain:

### Core (auth, groups, members)

#### authSlice

- **State**: `user`, `onboardingComplete`, `onboardingData`, `isAuthenticated`, `lastFetched`, `location`, `pendingNavigation`
- **Thunks**: `checkAuthState`, `loginUser`, `registerUser`, `updateUserProfile`, `updateDisplayName`, `updateSobrietyDate`, `updateUserPhoto`, `updateUserPhoneNumber`, `updateNotificationSettings`, `updatePrivacySettings`, `setOnboardingComplete`
- **Selectors**: `selectUser`, `selectOnboardingData`, `selectOnboardingComplete`, `selectUserById`
- **Entity Adapter**: usersAdapter

#### groupsSlice

- **State**: groups entities, `memberGroups[]`, `adminGroups[]`, `nearbyGroups`, `searchResults`, `lastFetched` (TTL: 5 min)
- **Thunks**: `fetchUserGroups`, `fetchGroupById`, `createGroup`, `updateGroup`, `joinGroup`, `leaveGroup`, `searchGroups`, `searchGroupsByLocation`, `requestGroupAdminAccess`, `completeDonation`, `updateGroupPaymentLinks`
- **Selectors**: `selectAllGroups`, `selectMemberGroupIds`, `selectAdminGroupIds`, `selectGroupById`, `selectMemberGroups`, `selectAdminGroups`, `selectIsGroupMember`, `selectIsGroupAdmin`
- **Entity Adapter**: groupsAdapter (sortComparer: name alphabetically)

#### membersSlice

- **State**: members by group, member details with roles/status
- **Thunks**: `fetchGroupMembers`, `addMember`, `removeMember`, `updateMemberRole`, `updateMemberStatus`
- **Entity Adapter**: membersAdapter

### Messaging (chat, DMs)

#### chatSlice (Group Chat)

- **State**: messages entities, chats, `groupMessageIds` (per-group), `unreadCounts` (per-group), `lastFetched` (TTL: 2 min)
- **Thunks**: `initializeGroupChat`, `fetchRecentMessages`, `fetchEarlierMessages`, `sendMessage`, `addReaction`, `markMessageAsRead`, `deleteMessage`, `fetchUnreadCount`, `markChatAsRead`, `fetchAllUnreadCounts`
- **Selectors**: `selectMessagesByGroup`, `selectUnreadCount`, `selectTotalUnreadCount`, `selectChatStatus`
- **Entity Adapters**: messagesAdapter, chatsAdapter
- **Optimistic Updates**: `addOptimisticMessage`, `removeOptimisticMessage`

#### directMessagesSlice (1:1 DMs)

- **State**: messages, conversations, `threadMessageIds`, pagination (`hasMoreConversations`, `lastConversationThreadId`), `lastFetched` (TTL: 2 min)
- **Thunks**: `initializeThread`, `fetchRecentMessages`, `fetchEarlierMessages`, `sendMessage`, `markMessageAsRead`, `addReaction`, `removeReaction`, `deleteMessage`, `fetchConversations`
- **Selectors**: `selectMessagesByThread`, `selectAllConversations`, `selectTotalUnreadCount`, `selectHasMoreConversations`
- **Entity Adapters**: messagesAdapter (sorted by `sentAt`), conversationsAdapter (sorted by `updatedAt` desc)
- **Optimistic Updates**: `addOptimisticMessage`, `removeOptimisticMessage`

### Treasury & Finance

#### transactionsSlice

- **State**: transactions per group, `groupTransactionIds`, `lastFetchedGroup` (TTL: 5 min)
- **Thunks**: `fetchGroupTransactions`, `addTransaction`, `updateTransaction`, `deleteTransaction`
- **Selectors**: `selectGroupTransactions`, `selectTransactionById`
- **Entity Adapter**: transactionsAdapter (sortComparer: createdAt desc)

#### treasurySlice

- **State**: treasury data per group (balance, reserves, monthly stats)
- **Thunks**: `fetchGroupTreasury`, `updateTreasuryBalance`, `generateReport`
- **Entity Adapter**: treasuryAdapter

#### recurringTransactionsSlice (V3.5)

- **State**: recurring transaction schedules per group
- **Thunks**: `fetchRecurringTransactions`, `createRecurringTransaction`, `updateRecurringTransaction`, `deleteRecurringTransaction`
- **Entity Adapter**: recurringTransactionsAdapter

#### treasurerHandoffSlice (V3.5)

- **State**: active handoff requests, history
- **Thunks**: `initiateHandoff`, `requestHandoff`, `confirmHandoff`, `cancelHandoff`, `fetchHandoffHistory`

### Meetings

#### meetingsSlice

- **State**: meetings, meetingInstances, `filteredIds`, `favoriteIds`, `groupMeetingIds`, `userLocation`, `lastFetchedGroup` (TTL: 10 min)
- **Thunks**: `setUserLocation`, `fetchGroupMeetings`, `fetchMeetings`, `searchMeetings`, `addFavoriteMeeting`, `removeFavoriteMeeting`
- **Entity Adapters**: meetingsAdapter, meetingInstancesAdapter

#### businessMeetingsSlice

- **State**: business meetings per group
- **Thunks**: `fetchGroupBusinessMeetings`, `createBusinessMeeting`, `updateBusinessMeeting`, `deleteBusinessMeeting`, `updateAgenda`
- **Entity Adapter**: businessMeetingsAdapter

### Communication & Announcements

#### announcementsSlice

- **State**: announcements per group, pinned status
- **Thunks**: `fetchGroupAnnouncements`, `createAnnouncement`, `updateAnnouncement`, `deleteAnnouncement`, `pinAnnouncement`
- **Entity Adapter**: announcementsAdapter

### Service & Governance

#### servicePositionsSlice

- **State**: positions per group, assignment history
- **Thunks**: `fetchGroupServicePositions`, `createServicePosition`, `updateServicePosition`, `assignMember`, `removeAssignment`
- **Entity Adapter**: servicePositionsAdapter

#### adminRemovalSlice (V3.5)

- **State**: active removal votes, voting progress
- **Thunks**: `fetchRemovalRequests`, `initiateRemovalVote`, `voteOnRemoval`, `executeRemoval`

**Vote math + window (U-6):** A removal motion passes when `votes >= ceil(totalEligibleVoters * 2/3)` (supermajority by ceiling, not floor — a 5-member group needs 4 votes to pass, not 3). The voting window is **7 days from initiation**; if quorum is not reached, `scheduledAdminRemovalExpiry` (1 AM UTC daily) marks the process as `expired` and clears the in-flight removal request. There is no automatic re-initiation; another admin must file a fresh motion if needed.

### Profile & Personal

#### sponsorshipSlice

- **State**: active sponsorships, pending requests, sponsor settings
- **Thunks**: `fetchUserSponsorships`, `requestSponsor`, `confirmSponsorship`, `endSponsorShip`

#### gratitudeSlice (V2)

- **State**: gratitude journal entries per user
- **Thunks**: `fetchGratitudeEntries`, `addGratitudeEntry`, `deleteGratitudeEntry`
- **Entity Adapter**: gratitudeAdapter

#### engagementSlice (V3.3)

- **State**: check-in streaks, engagement metrics
- **Thunks**: `fetchEngagementData`, `updateCheckInStreak`

#### stepWorkSlice (V3.5)

- **State**: personal step work, sponsee visibility
- **Thunks**: `fetchStepProgress`, `updateStepProgress`, `fetchSponseeProgress`
- **Entity Adapter**: stepWorkAdapter

### Content & Resources (V4.2)

#### reflectionsSlice

- **State**: daily reflections, user responses
- **Thunks**: `fetchDailyReflection`, `submitReflectionResponse`, `fetchUserReflections`

#### literatureSlice

- **State**: literature catalog, user bookmarks
- **Thunks**: `fetchLiteratureIndex`, `fetchLiteratureDetail`, `saveBookmark`, `removeBookmark`, `contributeLiterature`
- **Entity Adapters**: literatureAdapter, bookmarksAdapter

#### groupResourcesSlice

- **State**: resources per group, resource library
- **Thunks**: `fetchGroupResources`, `addGroupResource`, `updateGroupResource`, `deleteGroupResource`
- **Entity Adapter**: resourcesAdapter

### Analytics & Admin

#### dashboardSlice

- **State**: admin metrics, key indicators
- **Thunks**: `fetchDashboardMetrics`, `fetchGroupAnalytics`, `fetchAttendanceStats`

#### groupHealthSlice (V4.3)

- **State**: group health metrics, growth trends
- **Thunks**: `fetchGroupHealth`, `generateHealthReport`

#### reportsSlice

- **State**: user reports, admin/moderation queue
- **Thunks**: `fetchReports`, `createReport`, `updateReportStatus`, `deleteReport`
- **Entity Adapter**: reportsAdapter

### Enterprise (V4.4)

#### intergroupSlice

- **State**: intergroup organization data
- **Thunks**: `fetchIntergroupData`, `submitIntergroupReport`, `fetchAffiliatedGroups`

#### brandingSlice

- **State**: theme, branding per group (configurable colors, logos)

#### referralSlice (V3.1)

- **State**: referral links, codes, rewards
- **Thunks**: `fetchReferralData`, `referUser`, `claimReward`

### Cache TTL Summary

| Slice               | TTL    | Reason                                  |
| ------------------- | ------ | --------------------------------------- |
| chatSlice           | 2 min  | Messages change frequently              |
| directMessagesSlice | 2 min  | Messages change frequently              |
| groupsSlice         | 5 min  | Group data changes infrequently         |
| transactionsSlice   | 5 min  | Financial data changes infrequently     |
| meetingsSlice       | 10 min | Meeting schedules are relatively stable |

---

## 4. Mobile App — Data Access (Models)

16 model classes handling Firestore CRUD, timestamp conversions, and real-time listeners. All models follow the same pattern: static methods that call Firestore directly, returning typed documents.

### UserModel

- **Collection**: `users/`
- **CRUD**: `getById`, `create`, `update`, `getUserGroups`, `searchByEmail`
- **Settings**: `updateNotificationSettings`, `updatePrivacySettings`, `updatePhoneNumber`, `updateOnboardingStatus`
- **Listeners**: `onUserUpdated`, `onOnboardingStatusChange`

### GroupModel

- **Collection**: `groups/`
- **CRUD**: `getById`, `getUserGroups`, `create`, `update`
- **Members**: `addMember`, `removeMember`, `getMembers`
- **Search**: `searchGroups` (by name), `searchGroupsByLocation` (geohash)
- **Payments**: `completeDonation`
- **Cache**: 5-minute TTL per group

### MemberModel

- **Collection**: `members/` (document ID format: `{groupId}_{userId}`)
- **CRUD**: `getGroupMembers`, `getMemberById`, `addMember`, `removeMember`
- **Roles**: `updateMemberRole`, `updateMemberStatus`
- **Listeners**: `onMemberJoined`, `onMemberLeft`, `onRoleChanged`

### ChatModel

- **Collections**: `groups/{groupId}/messages/`, `groupChats/`
- **Messaging**: `sendMessage` (with text, attachments, replyTo, mentions), `deleteMessage`, `addReaction`
- **Reading**: `getRecentMessages` (limit 50), `getMessagesBefore` (pagination)
- **Status**: `markMessageAsRead`, `markGroupChatAsRead`, `getUnreadCount`
- **Listeners**: `onNewMessage`, `onMessageDeleted`, `onMessageReactionAdded`

### DirectMessageModel

- **Collections**: `directMessages/{threadId}/messages/`, `userThreads/{userId}/`
- **Threading**: `initializeOrGetThread` (creates or fetches), `generateThreadId` (deterministic from two user IDs)
- **Messaging**: `sendMessage`, `deleteMessage`, `addReaction`, `removeReaction`
- **Reading**: `getRecentMessages`, `getMessagesBefore`, `getConversationsForUser` (paginated)
- **Listeners**: `onNewDMMessage`, `onConversationUpdated`

### MeetingModel

- **Collections**: `meetings/`, `groups/{groupId}/meetings/`
- **CRUD**: `getById`, `getMeetingsByGroupId`, `searchMeetings` (filters: location, time, day, type)
- **Instances**: `getMeetingInstances`, `createMeetingInstance`, `editMeetingInstance`
- **Favorites**: `addFavoriteMeeting`, `removeFavoriteMeeting`
- **Listeners**: `onMeetingUpdated`, `onNewMeetingInstance`

### TreasuryModel

- **Collections**: `groups/{groupId}/transactions/`, `groups/{groupId}/treasury/`
- **CRUD**: `getGroupTreasury`, `getTransactions`, `createTransaction`, `updateTransaction`, `deleteTransaction`
- **Recurring**: `createRecurringTransaction`, `getRecurringTransactions`
- **Reports**: `generateMonthlyReport`, `generateYearEndSummary`
- **Listeners**: `onTransactionAdded`, `onTransactionUpdated`, `onTransactionDeleted`

### BusinessMeetingModel

- **Collection**: `groups/{groupId}/businessMeetings/`
- **CRUD**: `getGroupBusinessMeetings`, `create`, `update`, `delete`
- **Governance**: `updateAgenda`, `recordDecisions`
- **Listeners**: `onBusinessMeetingAdded`, `onAgendaUpdated`, `onDecisionRecorded`

### ServicePositionModel

- **Collections**: `groups/{groupId}/servicePositions/`, `groups/{groupId}/positionHistory/`
- **CRUD**: `getGroupServicePositions`, `create`, `update`
- **Assignments**: `assignMember`, `removeAssignment`, `getPositionHistory`
- **Listeners**: `onPositionAssigned`, `onPositionUnassigned`

### AnnouncementModel

- **Collection**: `groups/{groupId}/announcements/`
- **CRUD**: `getGroupAnnouncements` (limit 50), `create`, `update`, `delete`
- **Pinning**: `pinAnnouncement`, `unpinAnnouncement`
- **Listeners**: `onAnnouncementAdded`, `onAnnouncementUpdated`

### ReportModel

- **Collections**: `reports/`, `groups/{groupId}/reports/`
- **CRUD**: `createReport`, `getReportById`, `getAdminReports`, `updateReportStatus`, `deleteReport`
- **Listeners**: `onNewReport`, `onReportStatusChanged`

### TreasurerHandoffModel (V3.5)

- **Collection**: `groups/{groupId}/treasurerHandoffs/`
- **Flow**: `initiateHandoff` → `requestHandoff` → `confirmHandoff` / `cancelHandoff`
- **History**: `getHandoffHistory`
- **Listeners**: `onHandoffRequested`, `onHandoffCompleted`

### SponsorModel (V3.5)

- **Collections**: `users/{userId}/sponsorships/`, `sponsorships/`
- **Flow**: `requestSponsor` → `confirmSponsorship` → `endSponsorship`
- **Settings**: `updateSponsorSettings`
- **Queries**: `getUserSponsorships`, `getSponsorees`
- **Listeners**: `onSponsorshipRequested`, `onSponsorshipConfirmed`

---

## 5. Mobile App — Screens

130+ screens organized by domain in `mobile/src/screens/`:

| Directory        | Count | Key Screens                                                                           |
| ---------------- | ----- | ------------------------------------------------------------------------------------- |
| `auth/`          | 4     | Login, Register, Landing, ForgotPassword                                              |
| `homegroup/`     | ~60   | Group management, treasury, governance, chat, meetings, sponsorship, admin, resources |
| `profile/`       | ~12   | Profile, sobriety tracker, step work, gratitude, literature, recovery journey         |
| `messages/`      | 3     | UnifiedInbox, ConversationsList, DirectMessage                                        |
| `meetings/`      | 3     | MeetingFinder, MeetingDetail, Meeting (legacy)                                        |
| `admin/`         | 1     | AdminPanel (super admin)                                                              |
| `moderation/`    | 3     | ModerationQueue, ReportDetail, UserBans                                               |
| `onboarding/`    | 3     | OnboardingScreen, OnboardingSlide, AdminValueProp                                     |
| `intergroup/`    | 5     | Dashboard, Groups, Announcements, Facility, SSO                                       |
| `subscription/`  | 1     | SubscriptionUpgrade                                                                   |
| `sponsor/`       | 1     | SponsorChat                                                                           |
| `sponsorship/`   | 1     | MySponsorships                                                                        |
| `announcements/` | 1     | Announcements                                                                         |

---

## 6. Cloud Functions — Callable

90 callable functions invoked by mobile clients via `firebase.functions().httpsCallable(name)`. All require Firebase Auth unless noted.

### Group Management

| Function                      | Purpose                                                                                                                                | Collections                       |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `createGroupWithSubscription` | Atomic: creates group → Stripe subscription → member doc → predefined service positions (Treasurer, Secretary)                         | groups, members, servicePositions |
| `generateGroupInvite`         | Creates 6-char alphanumeric invite code (7-day expiry). Rate-limited: 10 pending per user per 24h. Transactional to prevent duplicates | groupInvites                      |
| `joinGroupByInviteCode`       | Joins user to group via invite code. Validates expiry, increments join count                                                           | groupInvites, members             |
| `sendGroupInviteEmail`        | Sends email invitation via SendGrid                                                                                                    | —                                 |
| `updateGroupMemberCount`      | Increments/decrements group member count                                                                                               | groups                            |

### Subscription & Billing

| Function                               | Purpose                                                      | Stripe Integration              |
| -------------------------------------- | ------------------------------------------------------------ | ------------------------------- |
| `createStripeCheckoutSession`          | Initiates checkout for flat-rate $12/year group subscription | `checkout.sessions.create`      |
| `createStripePaymentIntent`            | Creates PaymentIntent for manual capture (setup flows)       | `paymentIntents.create`         |
| `createStripeAccountLink`              | Generates Stripe Connect account link for group donations    | `accountLinks.create`           |
| `createGroupSubscription`              | Upgrades existing group to paid subscription                 | `subscriptions.create`          |
| `setupSubscriptionPaymentMethod`       | Attaches payment method to customer                          | `paymentMethods.attach`         |
| `createCustomerPortalSession`          | Generates Customer Portal session URL                        | `billingPortal.sessions.create` |
| `reactivateGroupSubscription`          | Resumes a cancelled subscription                             | `subscriptions.update`          |
| `getGroupSubscriptionInfo`             | Retrieves subscription status                                | `subscriptions.retrieve`        |
| `getStripeAccountInfo/Details/Metrics` | Stripe Connect account data                                  | `accounts.retrieve`             |

### Admin & Governance

| Function                     | Purpose                                                     |
| ---------------------------- | ----------------------------------------------------------- |
| `setUserAsSuperAdmin`        | Grants superadmin role (special check required)             |
| `banUser`                    | Removes user from group, blocks rejoining, strips all roles |
| `initiateAdminRemoval`       | Starts voting process to remove admin                       |
| `voteOnAdminRemoval`         | Records vote (yes/no/abstain), tracks quorum                |
| `submitAdminRemovalResponse` | Admin being voted on submits statement                      |
| `notifyAdminRequestResult`   | Sends notification when voting concludes                    |

### Elections & Bylaws (V4.1)

| Function                | Purpose                                        |
| ----------------------- | ---------------------------------------------- |
| `openElection`          | Creates election for group leadership position |
| `openElectionVoting`    | Opens voting phase of election                 |
| `nominateForElection`   | Nominates member for position                  |
| `castElectionVote`      | Records member's vote                          |
| `closeElection`         | Closes voting, tallies results                 |
| `saveBylawDraft`        | Saves group bylaw draft                        |
| `ratifyBylaws`          | Ratifies bylaws for the group                  |
| `saveMeetingMinutes`    | Documents group meeting                        |
| `approveMeetingMinutes` | Approves minutes for record                    |

### Group Conscience Votes

| Function               | Purpose                                                                 |
| ---------------------- | ----------------------------------------------------------------------- |
| `createConscienceVote` | Creates a group conscience vote (motion). Broadcasts FCM to all members |
| `castConscienceVote`   | Records member's vote on motion                                         |
| `closeConscienceVote`  | Closes voting, tallies results                                          |

### Milestones & Recovery (V3.1)

| Function                             | Purpose                                                                                                               |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `recordMilestone`                    | Admin records sobriety milestone for member. Calculates next milestone date. Sends FCM (personal + group celebration) |
| `getMilestones`                      | Retrieves milestone history                                                                                           |
| `recordCheckIn` / `checkInToMeeting` | Records meeting attendance. Updates attendee count                                                                    |

### Sponsorship (V3.5)

| Function                 | Purpose                                          |
| ------------------------ | ------------------------------------------------ |
| `grantSponsorStepAccess` | Sponsor grants mentee access to step work guides |

### Content & Resources (V4.2)

| Function                     | Purpose                                      |
| ---------------------------- | -------------------------------------------- |
| `seedDailyReflections`       | Populates daily reflection library           |
| `postGroupDailyThought`      | Posts daily reflection to group              |
| `contributeLiterature`       | User contributes literature to group library |
| `saveLiteratureItem`         | Saves literature for personal access         |
| `bookmarkLiteratureForGroup` | Marks literature as valuable for group       |
| `contributeMeetingTopic`     | Adds meeting discussion topic                |
| `favoriteGroupTopic`         | User marks topic as favorite                 |
| `deleteGroupResource`        | Removes resource from group                  |

### Location & Search

| Function                 | Purpose                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `findMeetings`           | Searches 12-step meetings by location and type (AA, NA, Custom). Filters by date/day |
| `searchGroupsByLocation` | Nearby groups via geohash + lat/lng                                                  |
| `getPublicEvents`        | Public meetings/events by location                                                   |

### Referral Program

| Function               | Purpose                                                 |
| ---------------------- | ------------------------------------------------------- |
| `generateReferralCode` | Creates unique referral code                            |
| `getReferralStats`     | User's referral metrics (signups, conversions, rewards) |
| `applyReferralCode`    | Applies discount when new user signs up with code       |

### Data Export & Privacy

| Function               | Purpose                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------- |
| `exportUserData`       | GDPR: exports all user data (JSON/CSV)                                                 |
| `exportGroupData`      | Exports group history/member data (admin-only)                                         |
| `exportIntergroupData` | Exports intergroup/organization data (V4.4)                                            |
| `deleteUserAccount`    | GDPR Article 17: anonymizes messages/reports/treasury, deletes user doc + auth account |

### Multi-Group & Analytics

| Function                       | Purpose                                                      |
| ------------------------------ | ------------------------------------------------------------ |
| `getGroupDashboardMetrics`     | Dashboard: member count, attendance, growth trends           |
| `getGroupHealthTimeSeries`     | Group health metric time series for trend charts (V4.3)      |
| `getAttendanceAnalytics`       | Attendance analytics per group (V4.3)                        |
| `getMemberEngagementMetrics`   | Member engagement metrics (V4.3)                             |
| `getTreasuryTrends`            | Treasury trend data for charts (V4.3)                        |
| `createMultiGroupAnnouncement` | Broadcasts announcement to multiple groups                   |
| `getCrossGroupSponsors`        | Finds sponsors across affiliated groups                      |
| `getMultiGroupPricing`         | Pricing for managing multiple groups                         |
| `exportMeetingGuideFormat`     | Exports meetings in Meeting Guide standardized format (V3.2) |

### Intergroup & Enterprise (V4.4)

| Function                         | Purpose                                           |
| -------------------------------- | ------------------------------------------------- |
| `createIntergroup`               | Creates organizational parent for multiple groups |
| `affiliateGroupToIntergroup`     | Links group to intergroup                         |
| `deaffiliateGroupFromIntergroup` | Removes affiliation                               |
| `sendIntergroupAnnouncement`     | Broadcasts to all affiliated groups               |
| `generateIntergroupReport`       | Generates reports for affiliated intergroups      |
| `getFacilityStats`               | Treatment center stats (milestones, members)      |
| `exportFacilityComplianceReport` | Compliance metrics for facility management        |
| `submitBranding`                 | Configures intergroup/group branding              |
| `uploadBrandingLogo`             | Uploads logo asset                                |
| `configureSSO`                   | Sets up SSO (domain-based auto-join)              |

### Misc

| Function                             | Purpose                                                         |
| ------------------------------------ | --------------------------------------------------------------- |
| `sendMentionNotifications`           | FCM when user is @mentioned in group chat                       |
| `createWebAuthToken`                 | Generates auth token for web session                            |
| `syncUserClaims`                     | Synchronizes custom claims from Firestore to Auth               |
| `notifyAdminUpgradeRequest`          | Notifies admin of feature/upgrade requests                      |
| `requestAdminAccessWithSubscription` | Request admin access with subscription flow                     |
| `submitPartnershipLead`              | Captures treatment center / intergroup partnership lead form    |
| `getPublicGroupProfile`              | Returns public-facing group data for the web group profile page |

---

## 7. Cloud Functions — HTTP Endpoints

Two HTTP request functions:

### `stripeWebhook` — Platform Webhook

- **Path**: `POST /stripeWebhook`
- **Events handled**:
  - `checkout.session.completed` → activates subscription, writes price ID to group
  - `invoice.payment_succeeded` → updates subscription status
  - `invoice.payment_failed` → marks subscription past due
  - `customer.subscription.updated` → syncs status changes
  - `customer.subscription.deleted` → marks subscription canceled
  - `charge.dispute.created` → flags group for review
  - `customer.subscription.trial_will_end` → triggers reminder
  - `payment_intent.succeeded/failed` → logs payment events
- **Idempotency**: Checks `stripe_events` collection to prevent duplicate processing
- **Handler functions**: In `stripeUtils.ts`

### `stripeConnectWebhook` — Connected Account Webhook

- **Path**: `POST /stripeConnectWebhook`
- **Events**: `account.updated`, `payment_intent.succeeded/failed`, `charge.dispute.created`
- **Purpose**: Handles Stripe Connect account transfers (donations to groups)

---

## 8. Cloud Functions — Firestore Triggers

16 active triggers responding to document changes (+ 1 commented out: `onGroupAdminUpdate`):

### Group Lifecycle

| Trigger                       | Path               | Event    | Effect                                               |
| ----------------------------- | ------------------ | -------- | ---------------------------------------------------- |
| `onGroupCreateSetGeolocation` | `groups/{groupId}` | onCreate | Calculates geohash from lat/lng using geofire-common |

### Meeting Lifecycle

| Trigger                   | Path                                             | Event    | Effect                                                        |
| ------------------------- | ------------------------------------------------ | -------- | ------------------------------------------------------------- |
| `onMeetingCreate`         | `meetings/{meetingId}`                           | onCreate | Generates meeting instances for next 7 days in group timezone |
| `onMeetingUpdate`         | `meetings/{meetingId}`                           | onUpdate | Updates future meeting instances when details change          |
| `onMeetingDelete`         | `meetings/{meetingId}`                           | onDelete | Cascades delete to all future instances                       |
| `onMeetingInstanceUpdate` | `groups/{groupId}/meetingInstances/{instanceId}` | onUpdate | Syncs check-in counts or cancellation status                  |

### Member Management

| Trigger                    | Path                 | Event    | Effect                                                                                  |
| -------------------------- | -------------------- | -------- | --------------------------------------------------------------------------------------- |
| `onMemberCreate`           | `members/{memberId}` | onCreate | Sends FCM "new member joined" to all group members (respects notification settings)     |
| `onMemberWrite`            | `members/{memberId}` | onWrite  | **Critical**: Syncs custom JWT claims when roles change. Enforces 1000-byte claim limit |
| `onGroupMemberCountUpdate` | `groups/{groupId}`   | onUpdate | Updates analytics when memberCount changes                                              |

### Notifications

| Trigger                 | Path                                                 | Event    | Effect                                                                                                 |
| ----------------------- | ---------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `onAnnouncementCreate`  | `announcements/{id}`                                 | onCreate | Sends FCM to all group members (except creator). Skips scheduled announcements. Truncates to 100 chars |
| `onAdminRequestCreate`  | `admin_requests/{id}`                                | onCreate | Notifies group admins of admin access request                                                          |
| `onDirectMessageCreate` | `direct_message_threads/{threadId}/messages/{msgId}` | onCreate | Sends FCM to message recipient                                                                         |

### Role & Admin

| Trigger                       | Path               | Event    | Effect                                                        |
| ----------------------------- | ------------------ | -------- | ------------------------------------------------------------- |
| `onGroupTreasurerUpdate`      | `groups/{groupId}` | onUpdate | Updates treasurer custom claims when treasurers array changes |
| `onGroupAdminUpdate`          | `groups/{groupId}` | onUpdate | Updates admin custom claims (currently disabled)              |
| `onUserSponsorSettingsUpdate` | `users/{userId}`   | onUpdate | Syncs sponsor preferences                                     |

### Treasury

| Trigger              | Path                           | Event   | Effect                                                                                                                            |
| -------------------- | ------------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `onTransactionWrite` | `transactions/{transactionId}` | onWrite | Updates `treasury_overviews/{groupId}` with balance deltas. Handles monthly reset. Uses `FieldValue.increment` for atomic updates |

### Governance & Milestones

| Trigger                  | Path                                     | Event    | Effect                                                                                                                                    |
| ------------------------ | ---------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `onServicePositionWrite` | `groups/{groupId}/servicePositions/{id}` | onWrite  | Maintains history of position holders and term dates                                                                                      |
| `onMilestoneWrite`       | `groups/{groupId}/milestones/{memberId}` | onWrite  | Updates facility stats for treatment center intergroups. Increments `totalMilestonesAwarded`, `milestonesThisMonth`, `milestonesThisYear` |
| `onReportCreate`         | `reports/{reportId}`                     | onCreate | Logs user reports for moderation                                                                                                          |

---

## 9. Cloud Functions — Auth Triggers

### `onUserCreated` (Firebase Auth onCreate)

SSO auto-join flow:

1. Checks user email domain against `sso_domain_index` collection
2. If SSO enabled for domain → auto-joins user to configured `autoJoinGroupId`
3. Creates `members/{groupId}_{userId}` document
4. Updates `users/{userId}.homeGroups` array
5. Logs SSO join event to `sso_join_log/{intergroupId}/events`

**Duplicate-event behavior (U-7):** `onUserCreated` fires for every Firebase Auth signup, including signups where the user already exists in `members/{groupId}_{userId}` (e.g. a user who was added manually and later signs in via the email-domain SSO). In that case the trigger short-circuits the member-document write (it already exists) but **still appends a new event row to `sso_join_log/{intergroupId}/events`** — there's no dedup. Operators reading the audit log should expect to see duplicates per user for SSO domains with manual onboarding paths.

---

## 10. Cloud Functions — Pub/Sub Scheduled Jobs

14 scheduled jobs running on Cloud Scheduler:

| Job                               | Schedule                         | Purpose                                                                                                                                                                 |
| --------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generateDailyMeetingInstances`   | `0 2 * * *` (2 AM UTC)           | Generates meeting instances for next 7 days for all groups. Accounts for group timezone                                                                                 |
| `scheduledMeetingReminders`       | `0 * * * *` (hourly)             | Finds meetings starting within 60 min, sends FCM to users who favorited them. Batches in groups of 500                                                                  |
| `scheduledMilestoneCheck`         | `0 9 * * *` (9 AM UTC)           | Checks for due milestones, notifies admins                                                                                                                              |
| `scheduledMilestoneReminders`     | `0 6 * * *` (6 AM UTC)           | Finds milestones due within 3 days, sends FCM to group admins. Uses collectionGroup query                                                                               |
| `scheduledRecurringTransactions`  | `30 0 * * *` (00:30 UTC)         | Processes active recurring transactions where `nextDate <= today`. Creates transaction, advances nextDate by frequency. Balance updated by `onTransactionWrite` trigger |
| `scheduledAdminRequestProcessor`  | `every 1 hours`                  | Processes/expires pending admin access requests                                                                                                                         |
| `scheduledAdminRemovalExpiry`     | `0 1 * * *` (1 AM UTC)           | Expires concluded admin removal voting processes                                                                                                                        |
| `scheduledPositionReminders`      | `0 9 * * *` (9 AM UTC)           | Reminds service position holders of upcoming term end                                                                                                                   |
| `scheduledTrialReminders`         | `0 10 * * *` (10 AM UTC)         | Day 5 (2–3 days remaining) and Day 7 (0–1 days remaining) trial ending reminders via FCM                                                                                |
| `scheduledRenewalReminders`       | `0 10 * * *` (10 AM UTC)         | 30-day and 7-day pre-renewal reminders for active/trialing subscriptions via FCM                                                                                        |
| `scheduledSubscriptionReconciler` | `0 2 * * *` (2 AM UTC)           | Syncs stale `trialing`/`active` Firestore subscription status against Stripe for groups past `subscriptionExpiresAt`                                                    |
| `scheduledDailyReflection`        | `0 9 * * *` (9 AM UTC)           | Publishes daily reflection to opted-in groups                                                                                                                           |
| `scheduledGroupBackups`           | `0 2 1 * *` (1st of month)       | Backs up group data to Cloud Storage/BigQuery (V4.4)                                                                                                                    |
| `scheduledYearEndSummary`         | `0 10 1 11 *` (Nov 1, 10 AM UTC) | Generates year-end summary for groups ≥10 months old. Eligibility filter applied inside the handler. Sends FCM + email to group admins. (U-9)                           |

**Additional** (in `triggers/scheduled/`):

- `scheduledAnnouncementPublisher` — Publishes scheduled announcements at their `scheduledFor` time

---

## 11. Cloud Functions — Utilities

### `firebase.ts`

- Initializes Firebase Admin SDK (singleton with `apps.length` guard)
- Exports: `db` (Firestore), `auth` (Firebase Auth), `messaging` (FCM)

### `stripe.ts`

- Configures Stripe client with test/production keys from environment
- **Exports**: `stripe` instance, `webhookSecret`, `connectWebhookSecret`, `priceIdMember`, `productIdGroup`
- **Constants**: `TRIAL_PERIOD_DAYS = 7`, `PLATFORM_FEE_PERCENT = 5%`
- **Key function**: `getDefaultPriceForProduct(productId)` — fetches default price ID at runtime (never hardcoded)
- Detects test mode via `STRIPE_TEST_SECRET_KEY` presence
- Validates all required env vars on startup

### `stripeUtils.ts`

- Webhook event handlers: `handleCheckoutSessionCompleted`, `handleInvoicePaymentSucceeded/Failed`, `handleSubscriptionUpdated/Deleted`, `handlePaymentIntentSucceeded/Failed`, `handleDisputeCreated`, `handleTrialWillEnd`, `handleIntergroupSubscriptionUpdated/Deleted`
- **Idempotency**: `isEventProcessed(eventId)`, `markEventProcessed(eventId)` — checks/writes `stripe_events` collection

### `location.ts`

- Geospatial utilities using geofire-common, ngeohash, haversine-distance
- `locationIsInArea(polygon, userLocation)` — point-in-polygon test
- `getDistance(start, end)` — haversine distance in meters
- `getGeohashRange(lat, lng, miles)` — geohash bounds for radius search
- `getAddressFromGeocode(geocode)` — parses Google geocode response

### Other Utilities

| File                    | Purpose                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| `date.ts`               | Timezone handling, date arithmetic                                                                            |
| `email.ts`              | SendGrid email integration                                                                                    |
| `streakCompute.ts`      | Meeting attendance/sobriety streak computation                                                                |
| `meetings.ts`           | External API integration (AA, NA, Meeting Guide APIs)                                                         |
| `meetingUtils.ts`       | Meeting instance generation: `generateInstancesForMeeting(meetingId, data, startDate, endDate, timezone, db)` |
| `reflectionsLibrary.ts` | Curated daily reflection content (365 entries)                                                                |
| `claims.ts`             | Legacy custom claim management (deprecated/commented out)                                                     |

---

## 12. Firestore Schema

### Top-Level Collections

```
users/{userId}
├── uid, email, displayName, photoUrl
├── sobrietyStartDate?, showSobrietyDate?
├── phoneNumber?, showPhoneNumber?
├── notificationSettings {meetings, announcements, celebrations, groupChatMentions, allowPushNotifications, dailyReflections}
├── privacySettings {allowDirectMessages, showRecoveryDate, showPhoneNumber}
├── homeGroups[], adminGroups[], favoriteMeetings[], mutedThreads?
├── subscriptionTier, subscriptionValidUntil?, stripeCustomerId?
├── fcmTokens[], sponsorSettings {isAvailable, requirements[], bio}
├── onboardingComplete?, onboardingData {intent, groupId?, action?, completedAt}
├── lastActivityAt?, lastLoginAt?, checkInStreak
└── savedLiteratureIds[]

groups/{groupId}
├── name, description, type (AA/NA/etc)
├── location, address, city, state, zip, lat, lng, placeName?
├── admins[], memberCount, isClaimed, pendingAdminRequests[]
├── adminDetails [{uid, addedAt, lastActiveAt, activityStatus}]
├── treasurers[], treasury {balance, prudentReserve, monthlyIncome, monthlyExpenses}  // DC-4: this nested `treasury` map is denormalized for read efficiency. Canonical write target for `prudentReserve` is `treasury_overviews/{groupId}` per `firestore.rules` — clients can update prudentReserve only on that collection. The nested copy is kept eventually consistent via the treasury_overviews → groups sync path.
├── createdAt, updatedAt, foundedDate?
├── stripeCustomerId?, stripeSubscriptionId?, stripeSubscriptionItemId?
├── stripeConnectAccountId?, subscriptionStatus, subscriptionExpiresAt?
├── stripeProductIdGroup (prod_xxx), stripePriceIdGroup (price_xxx)
├── paymentLinks {donation?, event?}
├── /meetingInstances/{instanceId}
├── /messages/{messageId}
├── /milestones/{memberId}
├── /servicePositions/{positionId}
├── /businessMeetings/{meetingId}
├── /treasurerHandoffs/{handoffId}
└── /announcements/{announcementId}

members/{groupId}_{userId}
├── groupId, userId, role, status
├── joinedAt, lastActiveAt
└── customClaims (synced to JWT by onMemberWrite)

meetings/{meetingId}
├── name, description, groupId
├── day (DayOfWeek), time, location, address, lat, lng
├── format[], isPublic, type
└── createdAt, updatedAt

transactions/{transactionId}
├── type (income/expense), amount, description, category
├── createdBy, createdAt, groupId
└── updatedAt?, updatedBy?

treasury_overviews/{groupId}
├── balance, monthlyIncome, monthlyExpenses
├── lastMonthReset
└── (atomically updated by onTransactionWrite trigger)

direct_message_threads/{threadId}
└── /messages/{messageId}
    ├── threadId, senderId, senderName
    ├── text?, attachments[], sentAt (number — Unix timestamp)
    ├── read{}, reactions{}
    └── replyTo {messageId, senderName, text}

recurring_transactions/{id}
├── groupId, type, amount, description, category, frequency
├── nextDate, dayOfMonth?, isActive
└── createdBy, createdAt, updatedAt
```

### Supporting Collections

| Collection               | Purpose                                         |
| ------------------------ | ----------------------------------------------- |
| `groupInvites`           | Invite codes (6-char, 7-day expiry)             |
| `announcements`          | Group announcements (with groupId field)        |
| `reports`                | User reports for moderation                     |
| `sponsorships`           | Mentor/mentee relationships                     |
| `group_conscience_votes` | Group voting/motions                            |
| `admin_requests`         | Admin access requests                           |
| `admin_removal_requests` | Admin removal voting                            |
| `stripe_events`          | Processed webhook event IDs (idempotency)       |
| `sso_domain_index`       | Email domain → intergroup mapping for auto-join |
| `sso_join_log`           | Audit log of SSO joins                          |
| `intergroups`            | Organization/parent group entities (V4.4)       |

---

## 13. Cross-Cutting Patterns

### Authentication & Authorization

- All callable functions require `request.auth?.uid`
- Group admin checks via `members/{groupId}_{userId}.roles` or `groups.admins[]` array
- Custom JWT claims synced by `onMemberWrite` trigger (1000-byte limit)
- Claims fallback: when byte limit exceeded, Firestore security rules fall back to document reads

### Notifications (FCM)

- Respects per-user settings: `allowPushNotifications`, `announcements`, `meetings`, `celebrations`
- Large sends batched in groups of 500 (FCM limit)
- Notification body truncated to 100 chars
- Android/APNS priority settings configured per notification type

### Data Consistency

- Firestore transactions for multi-document atomics (group creation, invite codes)
- `FieldValue.increment` for atomic counter updates (treasury, member counts)
- Optimistic updates in Redux for messages (add before server confirms, rollback on failure)

### Caching Strategy

- Per-slice TTLs (2–10 min) prevent redundant Firestore reads
- `lastFetched` timestamps compared on thunk dispatch
- Real-time listeners supplement cache for high-frequency data (messages, members)

### Timezone Handling

- All scheduled jobs run in UTC
- Meeting instance generation converts UTC → group timezone using moment-timezone
- Daily boundaries calculated per-group timezone, not server timezone

### Privacy & Compliance

- `exportUserData` / `deleteUserAccount` implement GDPR Articles 15 and 17
- Account deletion anonymizes messages/reports/treasury (doesn't fully delete for audit trail)
- Phone numbers and recovery dates respect per-user privacy settings

### Rate Limiting

- Invite generation: 10 pending per user per 24 hours
- FCM batching: 500 per batch

---

## 14. Data Flow Diagrams

### Group Creation Flow

```
User taps "Create Group"
        │
        ▼
createGroupWithSubscription (callable)
        │
        ├── 1. Create Stripe customer (if needed)
        ├── 2. Attach payment method
        ├── 3. Create Stripe subscription (7-day trial)
        ├── 4. Create groups/{groupId} document
        │       └── onGroupCreateSetGeolocation (trigger) → writes geohash
        ├── 5. Create members/{groupId}_{userId} document (role: admin)
        │       ├── onMemberCreate (trigger) → FCM "new member"
        │       └── onMemberWrite (trigger) → sync JWT claims
        └── 6. Create predefined servicePositions (Treasurer, Secretary)
```

### Message Send Flow

```
User types message
        │
        ▼
Redux: addOptimisticMessage (instant UI update)
        │
        ▼
ChatModel.sendMessage → Firestore write
        │
        ├── Success → message persisted
        │       └── onNewMessage listener → other clients update
        │
        └── Failure → Redux: removeOptimisticMessage (rollback)
```

### Treasury Transaction Flow

```
Admin adds transaction
        │
        ▼
transactionsSlice.addTransaction → TreasuryModel.createTransaction
        │
        ▼
Firestore: transactions/{id} created
        │
        ▼
onTransactionWrite (trigger)
        │
        ├── Calculate delta (income - expense)
        ├── Check if month changed → reset monthly counters
        └── FieldValue.increment on treasury_overviews/{groupId}
                ├── balance += delta
                ├── monthlyIncome += income
                └── monthlyExpenses += expense
```

### Subscription Lifecycle

```
Checkout → stripeWebhook
        │
        ▼
checkout.session.completed
        │
        ▼
handleCheckoutSessionCompleted
        ├── Write price ID to stripePriceIdGroup
        ├── Write product ID to stripeProductIdGroup
        └── Set subscriptionStatus = 'active'
        │
        ▼ (7 days later)
invoice.payment_succeeded → confirm subscription
        │
        ▼ (yearly renewal or failure)
├── invoice.payment_succeeded → continue
├── invoice.payment_failed → subscriptionStatus = 'past_due'
└── customer.subscription.deleted → subscriptionStatus = 'canceled' (one L)
```

### Meeting Instance Generation

```
Daily at 2 AM UTC: generateDailyMeetingInstances
        │
        ▼
For each group:
        ├── Convert UTC → group timezone
        ├── Query meetings for group
        └── For each meeting:
                └── generateInstancesForMeeting(next 7 days)
                        └── Write meetingInstances subcollection

Hourly: scheduledMeetingReminders
        │
        ▼
Query meetingInstances starting within 60 min
        │
        ▼
For each instance:
        ├── Find users who favorited this meeting
        └── Send FCM (batched in 500s)
```
