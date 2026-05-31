# RecoveryConnect: Feature Gap Analysis for MVP Release

> **Analysis Date:** December 21, 2024  
> **Last Updated:** December 21, 2024  
> **Purpose:** Identify missing features that are critical for maximizing user adoption and engagement  
> **Reference Documents:** priorities.md, priorities2.md, mvp-reqs.md, spec.md

---

## Executive Summary

RecoveryConnect has a **strong foundation** with core features including authentication, group management, chat, treasury (with reports and handoff), announcements, sobriety tracking, push notifications, and content moderation. The app is approximately **85% complete** for MVP launch, with a few remaining gaps that would significantly enhance user engagement and retention.

### Current Statistics

- **Implemented Features:** ~85% of core MVP functionality
- **Features Required for Initial Release:** 5 (Onboarding, Offline Support, Business Meetings, Direct Chat, Chairperson Assignment)
- **Post-Launch Enhancements:** 2 (Meeting Favorites, Meeting Reminders)
- **Estimated Impact:** Addressing release features will increase retention by 30-40%

---

## Table of Contents

1. [Current Implementation Status](#current-implementation-status)
2. [Features Required for Initial Release](#features-required-for-initial-release)
3. [Post-Launch Features](#post-launch-features)
4. [Nice-to-Have Features](#nice-to-have-features)
5. [Monetization Alignment](#monetization-alignment)
6. [Recommended Implementation Roadmap](#recommended-implementation-roadmap)

---

## Current Implementation Status

### ✅ Fully Implemented Features

| Feature                 | Location                                                                | Notes                                                 |
| ----------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------- |
| **Email/Password Auth** | `screens/auth/`                                                         | Registration, login, password recovery                |
| **Social Sign-in**      | `services/firebase/auth.ts`                                             | Google authentication working                         |
| **Profile Management**  | `screens/profile/ProfileScreen.tsx`                                     | Photo, name, phone, sobriety date                     |
| **Meeting Search**      | `screens/meetings/MeetingScreen.tsx`                                    | Location-based, filters, details                      |
| **Group Creation**      | `screens/homegroup/CreateGroupScreen.tsx`                               | Full wizard flow                                      |
| **Group Overview**      | `screens/homegroup/GroupOverviewScreen.tsx`                             | Navigation tiles, info display, location              |
| **Member Directory**    | `screens/homegroup/GroupMembersScreen.tsx`                              | List, roles, privacy controls                         |
| **Announcements**       | `screens/announcements/`, `store/slices/announcementsSlice.ts`          | CRUD, pinning, admin-only                             |
| **Treasury Basics**     | `screens/homegroup/GroupTreasuryScreen.tsx`                             | Balance, transactions, stats                          |
| **Treasury Reports**    | `screens/homegroup/TreasuryReportScreen.tsx`                            | PDF generation, sharing, saved reports                |
| **Treasurer Handoff**   | `screens/homegroup/InitiateHandoffScreen.tsx`, etc.                     | Full handoff flow with notifications                  |
| **Group Chat**          | `screens/homegroup/GroupChatScreen.tsx`                                 | Messages, reactions, mentions, ban enforcement        |
| **Sobriety Tracker**    | `screens/profile/SobrietyTrackerScreen.tsx`                             | Milestones, medallions, celebrations                  |
| **Service Positions**   | `screens/homegroup/GroupServicePositionsScreen.tsx`                     | Create, assign, terms, rotation                       |
| **Privacy Settings**    | `screens/profile/ProfileScreen.tsx`                                     | Granular controls                                     |
| **Admin Panel**         | `screens/admin/AdminPanelScreen.tsx`                                    | Request approval, super admin                         |
| **Stripe Donations**    | `screens/homegroup/GroupDonationScreen.tsx`                             | Stripe Connect integration                            |
| **Sponsorship**         | `screens/homegroup/GroupSponsorsScreen.tsx`                             | Availability, sponsor-sponsee chat                    |
| **Content Moderation**  | `screens/moderation/ModerationQueueScreen.tsx`, `models/ReportModel.ts` | Reports, bans, admin review                           |
| **Push Notifications**  | `services/notifications/`, `functions/src/triggers/`                    | FCM, announcements, milestones, mentions, new members |
| **Group Invites**       | `components/groups/GroupInviteModal.tsx`                                | Code/link generation via Cloud Function               |

### ⚠️ Partially Implemented Features

| Feature                    | Status             | What's Missing                                | Release Target |
| -------------------------- | ------------------ | --------------------------------------------- | -------------- |
| **Business Meetings**      | Types defined      | No screens or functionality                   | Initial        |
| **Direct Messages**        | Types defined      | No screens, model, or functionality           | Initial        |
| **Chairperson Assignment** | 70% implemented    | Screen not registered, no UI entry point      | Initial        |
| **Meeting Favorites**      | Redux + Model only | No UI to view favorites, no personal schedule | Post-Launch    |
| **Meeting Reminders**      | Not implemented    | No scheduled notifications for meetings       | Post-Launch    |
| **Deep Linking**           | Basic setup exists | Needs end-to-end testing, QR codes            | Post-Launch    |

---

## Features Required for Initial Release

### 1. User Onboarding Flow

**Priority:** 🔴 CRITICAL  
**Impact:** Very High (Retention, Trust)  
**Effort:** Low (1 day)  
**Status:** ❌ Not Implemented

#### Current State

```typescript
// mobile/src/navigation/AppNavigator.tsx
{
  isAuthenticated ? (
    <Stack.Screen name="Main" component={MainTabNavigator} />
  ) : (
    <Stack.Screen name="Auth" component={AuthNavigator} />
  );
}
// Users go directly to main app after registration - no onboarding
```

#### What's Missing

1. **Onboarding Screens** (3-4 screens max)

   **Screen 1: Welcome**

   ```
   ┌─────────────────────────────────┐
   │          [App Logo]             │
   │                                 │
   │   Welcome to Homegroups         │
   │                                 │
   │   Your recovery journey,        │
   │   supported by community.       │
   │                                 │
   │       [Get Started →]           │
   └─────────────────────────────────┘
   ```

   **Screen 2: Privacy First**

   ```
   ┌─────────────────────────────────┐
   │         🔒 Your Privacy         │
   │                                 │
   │   • First names only (no last)  │
   │   • You control what's visible  │
   │   • Messages are group-only     │
   │   • No data sold, ever          │
   │                                 │
   │   [Skip]           [Next →]     │
   └─────────────────────────────────┘
   ```

   **Screen 3: Key Features**

   ```
   ┌─────────────────────────────────┐
   │     What You Can Do             │
   │                                 │
   │   📍 Find meetings near you     │
   │   👥 Join your homegroup        │
   │   🏆 Track your sobriety        │
   │   📣 Stay updated with alerts   │
   │                                 │
   │   [Skip]           [Next →]     │
   └─────────────────────────────────┘
   ```

   **Screen 4: Quick Setup**

   ```
   ┌─────────────────────────────────┐
   │     Quick Setup (Optional)      │
   │                                 │
   │   Set your sobriety date?       │
   │   ┌─────────────────────────┐   │
   │   │     [Select Date]       │   │
   │   └─────────────────────────┘   │
   │                                 │
   │   [Skip for now]  [Continue →]  │
   └─────────────────────────────────┘
   ```

2. **Implementation**

   ```typescript
   // New files:
   // screens/onboarding/OnboardingScreen.tsx
   // screens/onboarding/OnboardingSlide.tsx
   // store/slices/onboardingSlice.ts (track completion)

   // Modify AppNavigator to check onboarding status
   // Store completion in AsyncStorage + user document
   ```

3. **Skip Logic**
   - Users can skip at any time
   - Mark onboarding as "completed" or "skipped"
   - Never show again after completion

#### Why Critical

- First 30 seconds determine if users stay
- Privacy messaging builds trust immediately
- Reduces confusion about app purpose
- Increases sobriety date setup rate (key engagement metric)

---

### 2. Offline Support & Firestore Persistence

**Priority:** 🔴 HIGH  
**Impact:** High (Usability)  
**Effort:** Low (0.5 days)  
**Status:** ❌ Not Implemented

#### Current State

```typescript
// mobile/src/services/firebase/config.ts
const firestore = FirebaseFirestore();
firestore.settings({ ignoreUndefinedProperties: true });
// NO persistence enabled
```

#### What's Missing

1. **Firestore Offline Persistence**

   ```typescript
   // Enable offline persistence
   firestore().settings({
     persistence: true,
     cacheSizeBytes: firestore.CACHE_SIZE_UNLIMITED,
   });
   ```

2. **Offline UI Indicators**

   - Connection status banner
   - "Offline mode" indicator
   - Sync status for pending changes

3. **Offline-First Data Access**

   - Meeting details cached
   - Group info cached
   - Recent transactions cached
   - Chat messages cached

4. **Network Status Hook**
   ```typescript
   // hooks/useNetworkStatus.ts
   const useNetworkStatus = () => {
     const [isOnline, setIsOnline] = useState(true);
     // Listen to NetInfo
     return { isOnline, isOffline: !isOnline };
   };
   ```

#### Why Critical

- Meetings often in church basements with poor signal
- Users check meeting info on the way to meetings
- Data should be available when needed most
- Poor UX if app appears broken when offline

---

### 3. Business Meeting Support

**Priority:** 🔴 HIGH  
**Impact:** Medium (Group Operations)  
**Effort:** Medium (2-3 days)  
**Status:** ⚠️ Types Only

#### Current State

```typescript
// Types defined in types/domain/business-meeting.ts
interface BusinessMeeting {...}
interface AgendaItem {...}

// Types in types/schema.ts
interface BusinessMeetingDocument {...}
interface AgendaItemDocument {...}

// NO screens or functionality
```

#### What's Missing

1. **Schedule Business Meeting Screen**
2. **Create/Edit Agenda Items**
3. **Meeting Notes/Minutes**
4. **Link Treasury Report to Business Meeting**
5. **Group Calendar Integration**

#### Required Files

- `screens/homegroup/BusinessMeetingScreen.tsx`
- `screens/homegroup/CreateBusinessMeetingScreen.tsx`
- `models/BusinessMeetingModel.ts`
- `store/slices/businessMeetingsSlice.ts`

---

### 4. Direct Member Chat (DMs)

**Priority:** 🔴 HIGH  
**Impact:** High (Engagement & Support)  
**Effort:** Medium (2-3 days)  
**Status:** ⚠️ Types Only

#### Current State

```typescript
// Types exist in types/schema.ts
interface DirectMessageThreadDocument {...}
interface DirectMessageDocument {...}

// Sponsor-sponsee chat exists (SponsorChatScreen.tsx)
// BUT: No general member-to-member DMs
```

#### What's Missing

1. **Conversation List Screen**

   ```
   ┌─────────────────────────────────┐
   │      Messages                   │
   ├─────────────────────────────────┤
   │ ┌───┐ John D.                   │
   │ │ 👤│ Thanks for the support... │
   │ └───┘ 2:34 PM                   │
   ├─────────────────────────────────┤
   │ ┌───┐ Sarah M.                  │
   │ │ 👤│ See you at the meeting!   │
   │ └───┘ Yesterday                 │
   └─────────────────────────────────┘
   ```

2. **Direct Message Screen**

   - One-on-one chat interface
   - Message history
   - Read receipts (optional)
   - Block user option

3. **Entry Points**

   - From member profile (Group Members list)
   - From MemberDetailScreen
   - From group chat (tap on username)

4. **Privacy Controls**

   - User setting: "Allow direct messages from group members"
   - Options: All members / Only admins / Nobody
   - Block specific users

5. **Required Files**
   - `screens/messages/ConversationsListScreen.tsx`
   - `screens/messages/DirectMessageScreen.tsx`
   - `models/DirectMessageModel.ts`
   - `store/slices/directMessagesSlice.ts`
   - Update `MemberDetailScreen.tsx` with "Message" button

#### Why High-Value

- Builds deeper connections within recovery community
- Allows private support without sharing phone numbers
- Members can reach out discreetly for help
- Natural extension of existing chat infrastructure
- Increases daily app engagement

---

### 5. Chairperson Assignment for Meeting Instances

**Priority:** 🔴 HIGH  
**Impact:** Medium (Group Operations)  
**Effort:** Low (0.5-1 day)  
**Status:** ⚠️ 70% Implemented - Needs Wiring

#### Current State

The feature is largely built but not connected:

```typescript
// ✅ ALREADY EXISTS:

// 1. MeetingInstance type with chairperson fields (types/index.ts)
export interface MeetingInstance extends Meeting {
  instanceId: string;
  meetingId: string;
  groupId: string;
  scheduledAt: Date;
  isCancelled: boolean;
  chairpersonId?: string | null;
  chairpersonName?: string | null;
}

// 2. MeetingInstanceDocument schema (types/schema.ts)
// 3. AssignChairpersonScreen.tsx - Full UI for selecting a chairperson
// 4. MeetingModel.updateInstanceChairperson() method
// 5. Cloud function generateMonthlyMeetingInstances creates instances
// 6. fetchUpcomingMeetingInstances Redux thunk

// ❌ MISSING:
// - AssignChairperson NOT registered in GroupStackNavigator
// - No UI entry point to navigate to the screen
// - No display of upcoming meeting instances with chairperson info
```

#### What's Missing

1. **Register Screen in Navigator**

   - Add `AssignChairperson` to `GroupStackNavigator.tsx`

2. **UI to Display Upcoming Meeting Instances**

   - Add "Upcoming Meetings" section to GroupOverviewScreen or GroupScheduleScreen
   - Show meeting instances with date, time, and current chairperson
   - "Assign Chair" button for admins

3. **Navigation Entry Point**
   - Button on each meeting instance to assign/change chairperson
   - Only visible to group admins

#### Implementation Details

```typescript
// Add to GroupStackNavigator.tsx after AddEditServicePosition:
<Stack.Screen
  name="AssignChairperson"
  component={AssignChairpersonScreen}
  options={{
    title: "Assign Chairperson",
  }}
/>;

// Navigation call (from meeting instance list):
navigation.navigate("AssignChairperson", {
  groupId,
  groupName,
  instanceId: instance.instanceId,
  currentChairpersonId: instance.chairpersonId,
  scheduledAt: instance.scheduledAt.getTime(),
});
```

#### Data Model (Already Exists)

Meeting instances are generated monthly by Cloud Function and stored in `meetingInstances` collection:

- Each instance represents ONE occurrence of a recurring meeting
- Instances have their own `chairpersonId` and `chairpersonName`
- This allows different chairpersons for each meeting date

---

## Post-Launch Features

These features provide high value but can be delivered in a post-launch iteration.

### 6. Meeting Favorites & Personal Schedule UI

**Priority:** 🟡 MEDIUM (Post-Launch)  
**Impact:** High (Daily Value)  
**Effort:** Low-Medium (1-2 days)  
**Status:** ⚠️ Partially Implemented

#### Current State

```typescript
// mobile/src/store/slices/meetingsSlice.ts
export const toggleFavoriteMeeting = createAsyncThunk(...);
// favoriteIds: string[] exists in state

// mobile/src/models/UserModel.ts
static async addFavoriteMeeting(...) { ... }
static async removeFavoriteMeeting(...) { ... }

// BUT: NO UI TO VIEW FAVORITES OR PERSONAL SCHEDULE
```

#### What's Missing

1. **Favorites UI on Meeting Cards**

   - Heart/star icon toggle on meeting list items
   - Toggle favorite from meeting details screen
   - Visual indicator for favorited meetings

2. **"My Meetings" Screen**

   - List of all favorited meetings
   - Accessible from Meetings tab or Profile
   - Quick access to meeting details

3. **Personal Schedule View**

   ```
   ┌─────────────────────────────────┐
   │      My Weekly Schedule         │
   ├─────────────────────────────────┤
   │ MONDAY                          │
   │   7:00 PM - Home Group Meeting  │
   │             [Group Name]        │
   ├─────────────────────────────────┤
   │ WEDNESDAY                       │
   │   12:00 PM - Noon Meeting       │
   │             [Group Name]        │
   ├─────────────────────────────────┤
   │ SATURDAY                        │
   │   10:00 AM - Saturday Sobriety  │
   │             [Location]          │
   └─────────────────────────────────┘
   ```

4. **Required Files**
   - `screens/meetings/MyMeetingsScreen.tsx`
   - Update `MeetingCard.tsx` with favorite toggle
   - Navigation integration

---

### 7. Meeting Reminders (Push Notifications)

**Priority:** 🟡 MEDIUM (Post-Launch)  
**Impact:** High (Engagement)  
**Effort:** Medium (1-2 days)  
**Status:** ❌ Not Implemented

#### Current State

- Push notification infrastructure exists and is working
- No scheduled function for meeting reminders
- No user preference for reminder timing

#### What's Missing

1. **Cloud Function** - `scheduledMeetingReminderCheck`

   ```typescript
   // functions/src/triggers/pubsub/scheduledMeetingReminder.ts
   // Run every 15-30 minutes
   // Check for users with favorited meetings starting soon
   // Send push notification with meeting details
   ```

2. **User Preference**

   - Setting in Profile: "Meeting reminder time"
   - Options: 15 min, 30 min, 1 hour, None
   - Store in user document `notificationSettings.meetingReminderMinutes`

3. **Notification Payload**
   ```typescript
   {
     type: 'meeting_reminder',
     title: 'Meeting in 30 minutes',
     body: 'Home Group Meeting at Community Center',
     data: { meetingId, groupId }
   }
   ```

---

## Nice-to-Have Features

### 8. End-to-End Encrypted Messaging

- Encryption for direct messages
- Encryption for sponsor-sponsee chat
- Encryption at rest

### 9. Meeting Check-In

- "I'm here" button at meetings
- Attendance tracking (anonymous)
- Group engagement metrics

### 10. Literature Reading Plans

- Daily readings
- Step work tracking
- Shareable progress

### 11. Multi-Language Support

- Spanish, French, Portuguese
- Critical for international adoption

### 12. QR Codes for Group Invites

- Generate QR code from invite link
- Physical flyer printing support
- Scan to join flow

---

## Monetization Alignment

### Premium Group Features ($1/month)

| Feature                    | Status       | Priority |
| -------------------------- | ------------ | -------- |
| Treasury Report Generation | ✅ Built     | -        |
| Treasurer Handoff Tools    | ✅ Built     | -        |
| Admin Analytics Dashboard  | ❌ Not Built | MEDIUM   |
| Meeting Exception Handling | ⚠️ Partial   | LOW      |
| Celebration Automation     | ✅ Built     | -        |
| Extended Chat History      | ✅ Built     | -        |

### Free Features (All Users)

| Feature                     | Status |
| --------------------------- | ------ |
| Meeting Search              | ✅     |
| Join Groups                 | ✅     |
| Basic Announcements         | ✅     |
| Sobriety Tracker            | ✅     |
| Group Chat (30 day history) | ✅     |
| Basic Treasury View         | ✅     |
| Push Notifications          | ✅     |

---

## Recommended Implementation Roadmap

### Phase 1: Initial Release (5-7 days)

| Priority | Feature                  | Effort    | Impact    |
| -------- | ------------------------ | --------- | --------- |
| 1        | User Onboarding Flow     | 1 day     | Very High |
| 2        | Offline Persistence      | 0.5 days  | High      |
| 3        | Business Meeting Support | 2-3 days  | Medium    |
| 4        | Direct Member Chat       | 2-3 days  | High      |
| 5        | Chairperson Assignment   | 0.5-1 day | High      |

### Phase 2: Post-Launch Iteration

| Priority | Feature                     | Effort   | Impact |
| -------- | --------------------------- | -------- | ------ |
| 6        | Meeting Favorites UI        | 1.5 days | High   |
| 7        | Meeting Reminders           | 1.5 days | High   |
| 8        | Deep Link Polish & QR Codes | 1 day    | Medium |

---

## Priority Matrix

### Initial Release Features

| Feature                  | User Impact  | Dev Effort | Priority Score    |
| ------------------------ | ------------ | ---------- | ----------------- |
| User Onboarding Flow     | 🔴 Very High | 🟢 Low     | **1st (Release)** |
| Offline Persistence      | 🟠 High      | 🟢 Low     | **2nd (Release)** |
| Business Meeting Support | 🟡 Medium    | 🟡 Medium  | **3rd (Release)** |
| Direct Member Chat       | 🟠 High      | 🟡 Medium  | **4th (Release)** |
| Chairperson Assignment   | 🟡 Medium    | 🟢 Low     | **5th (Release)** |

### Post-Launch Features

| Feature              | User Impact | Dev Effort | Priority Score        |
| -------------------- | ----------- | ---------- | --------------------- |
| Meeting Favorites UI | 🟠 High     | 🟡 Medium  | **6th (Post-Launch)** |
| Meeting Reminders    | 🟠 High     | 🟡 Medium  | **7th (Post-Launch)** |

---

## Recently Completed Features

The following features have been implemented since the initial analysis:

### ✅ Push Notifications Infrastructure (Completed Dec 21, 2024)

- FCM initialization in `App.tsx` and `index.js`
- `NotificationService.ts` - Permission requests, token management
- `NotificationHandler.ts` - Foreground, background, quit state handling
- Cloud Functions:
  - `onAnnouncementCreate` - Notifications for new announcements
  - `onMemberCreate` - Notifications when new members join
  - `scheduledMilestoneCheck` - Daily milestone celebration notifications
  - `sendMentionNotifications` - Chat mention notifications

### ✅ Content Moderation System (Completed Dec 2024)

- `ReportModel.ts` - Full CRUD for reports and bans
- `ModerationQueueScreen.tsx` - Admin review interface
- `UserBansScreen.tsx` - Ban management
- Ban enforcement in `ChatModel.ts`
- Firestore security rules for reports

### ✅ Treasury Reports (Completed Dec 2024)

- `TreasuryReportScreen.tsx` - Report generation with date range
- `TreasuryReportService.ts` - PDF generation using react-native-html-to-pdf
- `SavedTreasuryReportsScreen.tsx` - View historical reports
- Share via PDF or plain text

### ✅ Treasurer Handoff Flow (Completed Dec 2024)

- `InitiateHandoffScreen.tsx` - Start handoff process
- `HandoffRequestScreen.tsx` - Accept/decline requests
- `HandoffConfirmationScreen.tsx` - Confirm completion
- `HandoffHistoryScreen.tsx` - Audit trail
- `TreasurerHandoffModel.ts` - Firestore operations
- `treasurerHandoffSlice.ts` - Redux state management
- Firestore security rules for handoffs

---

## Appendix: Technical Debt Notes

### Areas Needing Refactoring

1. ~~**Firebase config** - Commented out services need cleanup~~ ✅ Fixed
2. **Type inconsistencies** - Some screens define local types vs using shared types

### Security Considerations

1. ~~Firestore rules need audit for moderation features~~ ✅ Added
2. ~~Ban enforcement needs server-side validation~~ ✅ Implemented in ChatModel
3. ~~Report data should be admin-only readable~~ ✅ Rules in place

---

_Document maintained by: Development Team_  
_Last updated: December 21, 2024_
