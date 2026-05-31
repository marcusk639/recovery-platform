---
archived: true
archived_at: 2026-05-25
archived_reason: Plan shipped; tracked DONE in docs/plans/README.md (with PR# or commit ref). Preserved for historical reference.
original_path: docs/plans/2026-02-22-v3-implementation.md
---

# V3 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Transform RecoveryConnect from a group admin tool into a recovery community hub that individual members love — creating bottom-up adoption pressure that converts skeptical 12-step groups.

**Theme: "The Group Tool That Members Demand"**

The core adoption problem for traditional 12-step groups is that adoption decisions go through the *group conscience*, not a single admin. The strategy is to give individual members enough value that they bring the app to their group themselves — bypassing the wariness of the group as a whole.

**Adoption Flywheel:**
1. Member downloads to find meetings or track sobriety
2. Their group isn't listed → they show the admin "we should be on this"
3. Admin tries 90-day free trial (extended from 30 days for referral sign-ups)
4. Group conscience agrees to try it at the next business meeting
5. Secretary uses phone list + meeting tools → group gets hooked
6. Group subscribes → refer other groups → exponential growth

**Why 12-step groups specifically resist, and how we answer each:**
| Objection | Answer |
|---|---|
| "We don't need outside technology" | Secretary toolkit, printable output, and phone list have immediate practical value |
| "Anonymity at the level of press/radio/films" | Display names only, no last names ever collected, no public profiles without opt-in |
| "We're self-supporting through our own contributions" | Group pays from group funds via the treasurer; the app that tracks your 7th tradition income pays for itself |
| "What if the company shuts down?" | Full data export at any time (already implemented) |
| "Only if the group conscience agrees" | Group Conscience Voting feature — the app itself runs the vote |

**Architecture:** All new Firestore collections follow established patterns. New Redux slices use entity adapters. New screens follow the existing navigation structure. New Cloud Functions use `functions.https.onCall` with `CallableRequest<T>` typing (established project pattern).

**Tech Stack:** React Native + TypeScript, Firebase (Firestore, Auth, FCM, Cloud Functions), Redux Toolkit entity adapters, `react-native-html-to-pdf` (already installed), `@react-native-firebase/functions`

**Estimated Effort:** ~42-52 hours

---

## Section Overview

| Section | Features | Effort | Key Differentiator |
|---------|----------|--------|--------------------|
| V3.1 | Phone List & Milestone Celebrations | 8-10 hrs | Members use the app daily, not just admins |
| V3.2 | Location-Based Meeting Finder | 10-12 hrs | Top-of-funnel: members find meetings → discover groups not listed |
| V3.3 | Group Governance & Secretary Toolkit | 10-12 hrs | Makes reluctant groups say "actually, this is useful" |
| V3.4 | Referral Program & Multi-Group (complete stubs) | 6-8 hrs | Growth mechanics: admins recruit other groups |
| V3.5 | Step Work Companion | 8-10 hrs | Deepest differentiation: no other group app does this |

---

## V3.1: Member Phone List & Milestone Celebrations

**Why first:** This section gives *members* (not just admins) a daily reason to open the app. Without it, the app is only useful to the secretary and treasurer. With it, all 15-20 members of an average homegroup use it regularly.

**Schema already supports this:** `GroupMemberDocument` already has `showPhoneNumber: boolean` and `phoneNumber?: string`. No schema migration needed for phone list. Milestones need a new subcollection.

---

### Task 1.1: Group Phone List Screen

**Files:**
- Create: `mobile/src/screens/homegroup/GroupPhoneListScreen.tsx`
- Modify: `mobile/src/navigation/GroupStackNavigator.tsx` (add route)
- Modify: `mobile/src/types/navigation/index.ts` (add to `GroupStackParamList`)
- Modify: `mobile/src/screens/homegroup/GroupOverviewScreen.tsx` (add nav button)

**Context:** `GroupMemberDocument` already has `showPhoneNumber` and `phoneNumber`. The phone list screen queries `group_members` where `groupId == groupId && showPhoneNumber == true`, sorted by display name. Calling/texting uses React Native `Linking.openURL('tel:...')`.

**Implementation:**

The screen should show a searchable alphabetical list of members who have opted in:

```typescript
// GroupPhoneListScreen.tsx structure
interface PhoneListEntry {
  userId: string;
  displayName: string;
  phoneNumber: string;
  position?: string;  // secretary, treasurer, etc.
  roles: string[];
  sobrietyYears?: number;  // optional, shown if showSobrietyDate is true
}

// Query: group_members where groupId == groupId && showPhoneNumber == true
// Sort by displayName ASC
// Show "X members sharing phone" count at top
// Search bar filters by name
// Each row: name, position badge (if any), phone number, call/text icons
// "Share as PDF" button in header (uses RNHTMLtoPDF pattern from TreasuryReportService)
```

**Navigation:** Add to `GroupOverviewScreen` in the Members section alongside the existing "View Members" button. Title: "Phone List".

**Route params:** `GroupPhoneList: { groupId: string; groupName: string }`

**Printable PDF:** Generate with `RNHTMLtoPDF` following the exact same pattern as `TreasuryReportService.ts`. HTML template: group name at top, date generated, table of name/phone/position, footer "Confidential — Group Members Only".

**Settings entry point:** Members opt in via their `GroupMemberDocument`. The existing `MemberDetailScreen.tsx` and member settings (or `ProfileManagementScreen.tsx`) should have a toggle "Share my phone number with [Group Name]" that updates `showPhoneNumber` in Firestore. The `GroupPhoneListScreen` is read-only for all members; only the member themselves can update their opt-in status.

---

### Task 1.2: Sobriety Milestone Tracking

**Files:**
- Create: `mobile/src/screens/homegroup/GroupMilestonesScreen.tsx`
- Create: `functions/src/callable/recordMilestone.ts`
- Create: `functions/src/callable/getMilestones.ts`
- Modify: `mobile/src/types/schema.ts` (add `MilestoneDocument`)
- Modify: `mobile/src/navigation/GroupStackNavigator.tsx`
- Modify: `mobile/src/types/navigation/index.ts`

**Firestore schema:**
```typescript
// Collection: groups/{groupId}/milestones (one doc per member)
interface MilestoneDocument {
  userId: string;
  displayName: string;
  sobrietyDate: Timestamp;          // Set when admin records first milestone
  milestones: MilestoneRecord[];    // Chronological list
  nextMilestoneDate?: Timestamp;    // Pre-computed for notification scheduling
  nextMilestoneDays?: number;       // 30, 60, 90, 180, 270, 365, 730, etc.
}

interface MilestoneRecord {
  days: number;                     // 30, 60, 90, 180, 270, 365, 730, 1095...
  chipGivenAt: Timestamp;           // When the chip was given at meeting
  chipGivenBy: string;              // Admin UID who recorded it
  notes?: string;                   // Optional: "received chip at Tuesday meeting"
}
```

**Milestone thresholds (standard AA/NA chips):**
`[30, 60, 90, 180, 270, 365]` then every 365 after that.

**`recordMilestone` CF:**
```typescript
interface RecordMilestoneData {
  groupId: string;
  memberId: string;
  days: number;
  sobrietyDate?: string; // ISO string, required only on first record
  notes?: string;
}
// Auth check: caller must be admin of groupId
// Creates/updates groups/{groupId}/milestones/{memberId}
// Sends FCM to the member: "Congratulations on [N] days! 🎉 Your group is proud of you."
// Sends FCM to all group members with announcements enabled: "[Name] is celebrating [N] days today!"
```

**Screen:** `GroupMilestonesScreen` shows:
- "Upcoming Milestones" section: members whose next milestone falls within 30 days, sorted by date. Admin can tap to record chip.
- "Recent Chips" section: last 10 milestones recorded, newest first.
- FAB: "+ Record Milestone" → modal to select member + milestone.
- For non-admins: read-only celebration view.

**Navigation:** Add "Milestones" card to `GroupOverviewScreen` admin section.

---

### Task 1.3: Shareable Anniversary Cards

**Files:**
- Create: `mobile/src/components/milestones/AnniversaryCard.tsx`
- Create: `mobile/src/components/milestones/ShareAnniversaryCard.tsx`
- Modify: `mobile/src/screens/homegroup/GroupMilestonesScreen.tsx` (add share button)

**Implementation:** When admin records a milestone, a full-screen "anniversary card" component is shown and can be shared. Uses `react-native-share` (already installed, used in treasury reports) to share as image.

```typescript
// AnniversaryCard.tsx: styled View that can be captured as image
// Content:
//   [RecoveryConnect logo - subtle]
//   "[Name]"
//   "Celebrating"
//   "[X] Days / [N] Years"
//   "of Recovery"
//   [Group Name] — [Date]
// Colors: warm, celebratory (gold/amber tones)
// No last name, no sobriety date shown (only days/years count)
// Anonymous option: "A Member of [Group Name]" instead of display name

// Use react-native-view-shot to capture the card as PNG
// Then Share.share({ url: filePath }) or react-native-share
```

**Note:** `react-native-view-shot` may need to be installed (`yarn add react-native-view-shot` in mobile/). Check `mobile/package.json` first. If not installed, generate an HTML card and share as PDF instead (same RNHTMLtoPDF pattern), which avoids a new native dependency.

---

### Task 1.4: Upcoming Milestones Push Notifications

**Files:**
- Create: `functions/src/triggers/pubsub/scheduledMilestoneReminders.ts`
- Modify: `functions/src/index.ts` (export new trigger)

**Implementation:** Runs daily at 06:00 UTC. Queries `group_members` where `nextMilestoneDate` is within the next 3 days. For each hit, sends FCM to the group's admins:

```typescript
// Topic-based query: no global collection scan needed
// Query: collectionGroup('milestones')
//   .where('nextMilestoneDate', '>=', today)
//   .where('nextMilestoneDate', '<=', threeDaysFromNow)
// For each result:
//   Load group admins
//   Send notification: "[Name] reaches [N] days in 3 days — remember the chip!"
```

---

## V3.2: Location-Based Meeting Finder

**Why:** The existing `findMeetings` CF and `PublicEventsScreen` are functional but list-only, and the `PublicDirectoryScreen` searches groups rather than meetings. This section creates the true discovery engine: a meeting finder that works like "Google Maps for 12-step meetings," pulling from RecoveryConnect groups AND external meeting sources.

**The adoption hook:** When a member searches for meetings and notices their regular homegroup isn't listed, they become a free sales rep who goes back to their group and says "you should be on this app so people can find us."

---

### Task 2.1: Meeting Finder Screen with Map

**Files:**
- Create: `mobile/src/screens/meetings/MeetingFinderScreen.tsx`
- Modify: `mobile/src/navigation/MainTabNavigator.tsx` (the "Meetings" tab already exists — wire it to this screen instead of a stub)
- Modify: `mobile/src/types/navigation/index.ts` (add `MeetingFinderScreen` to appropriate param list)

**Context:** `findMeetings` CF already exists and calls `getAlcoholicsAnonymousMeetings`, `getNarcoticsAnoymousMeetings`, etc. The `PublicEventsScreen` shows upcoming meeting instances from RecoveryConnect groups.

**UI structure:**
```
[Search bar: "City, zip, or current location"]     [Filter icon]

[Toggle row]: List | Map

[Filter chips]: AA  NA  Al-Anon  CA  All   |   Today  Mon  Tue...

[Results: FlatList or MapView depending on toggle]

Each result card:
  [Type badge: AA/NA/etc]  [Meeting Name]
  [Day + Time]  [Format: Open/Closed/Speaker]
  [Address or "Online"]   [Distance: 2.3 mi]
  [Favorite ⭐]  [→ Details]
```

**Data sources:**
- **RecoveryConnect groups** (primary): query `groups` collection where `isPublic == true`, expand their `meetings` array, filter by day/type. For location filtering, use existing `lat/lng` on `GroupDocument`.
- **External source** (secondary): The existing `findMeetings` CF integrates with external meeting databases. Call it for the user's location and merge results.

**Favorites integration:** `UserDocument.favoriteMeetings` already exists. Starring a RecoveryConnect meeting saves the group's meeting ID. The meeting reminder push (V2, already implemented) reads from `favoriteMeetings`. So this screen activates V2 meeting reminders automatically.

**"This group isn't on RecoveryConnect" flow:** When displaying an external meeting (not from a RecoveryConnect group), show: "Is this your group? Get it on RecoveryConnect →" which deep-links to `CreateGroup` with the group name pre-filled.

---

### Task 2.2: Meeting Detail Screen (for non-member discovery)

**Files:**
- Create: `mobile/src/screens/meetings/MeetingDetailScreen.tsx`
- Modify: `mobile/src/types/navigation/index.ts`

**Content:** Shows full meeting details for a non-member discovering a group via the finder. Includes the group's public description, meeting schedule for that location, and a "Join This Group" button (triggers `joinGroupByInviteCode` flow if group has invite, or just a request).

For RecoveryConnect groups: deep link into `GroupOverview` for that group.

---

### Task 2.3: "Export to Meeting Guide" Feature

**Files:**
- Create: `functions/src/callable/exportMeetingGuideFormat.ts`
- Modify: `mobile/src/screens/homegroup/GroupScheduleScreen.tsx` (add export button)

**Why this matters:** [Meeting Guide](https://www.aa.org/meeting-guide-app) is the most widely used AA meeting finder, maintained by AA's General Service Office. Many district/intergroup committees use it as their primary listing. If RecoveryConnect can generate a properly formatted export that a group's GSR can submit to their intergroup, the group gets immediate, concrete value: their meetings appear on the most-used meeting finder in the world. This is a powerful adoption argument.

**Implementation:**
```typescript
// exportMeetingGuideFormat CF:
// Input: { groupId: string }
// Auth: must be member of group
// Output: {
//   csv: string,      // Meeting Guide CSV format
//   json: string,     // Meeting Guide JSON format
//   instructions: string  // How to submit to your intergroup
// }

// Meeting Guide CSV format fields:
// name, day, time, end_time, types, address, city, state, zip, country,
// location_name, notes, conference_url, conference_url_notes
// Types: O (Open), C (Closed), BB (Big Book), SP (Speaker), SS (Step Study), etc.
```

**Screen integration:** Add "Export for Meeting Guide" button in `GroupScheduleScreen` header menu. Show a share sheet with the CSV + simple instructions like "Forward this CSV to your intergroup webmaster."

---

### Task 2.4: QR Code Meeting Check-In

**Files:**
- Create: `mobile/src/screens/homegroup/MeetingQRCodeScreen.tsx`
- Modify: `mobile/src/navigation/GroupStackNavigator.tsx`
- Modify: `mobile/src/types/navigation/index.ts`
- Modify: `mobile/src/screens/homegroup/GroupScheduleScreen.tsx` (add "Show QR" button)

**Why:** The secretary can display a QR code on their phone at the start of the meeting. Members scan it to mark attendance. Builds attendance data over time. Attendance data can feed treasury projections ("we average 15 members, our 7th tradition collection should cover expenses").

**Implementation:**
```typescript
// QR code encodes: recoveryconnect://checkin?groupId=G&meetingId=M&date=YYYY-MM-DD
// Use react-native-qrcode-svg (check if installed, otherwise use a simple URL QR approach)
// Alternatively: generate a short URL to a web check-in page (no new native dependency needed)

// Secretary flow:
//   GroupScheduleScreen → [QR icon on meeting row] → MeetingQRCodeScreen
//   Full-screen QR code, "Members: scan to check in"
//   Shows live count of check-ins as members scan

// Member flow:
//   Scan QR with camera app → deep link opens app → calls checkInToMeeting CF (already exists from V2)
//   OR: deep link opens a simple web page → redirects to App Store if not installed
```

---

## V3.3: Group Governance & Secretary Toolkit

**Why this section converts skeptical groups:** Traditional 12-step groups make decisions by *group conscience* — a group vote at the business meeting. The most common objection to using any app is "we haven't voted on this." This section lets the group vote on using the app *within the app itself* — meta, but effective. The secretary toolkit answers "what concrete thing does this do that we don't already do?"

---

### Task 3.1: Group Conscience Voting

**Files:**
- Create: `mobile/src/screens/homegroup/GroupConscienceScreen.tsx`
- Create: `mobile/src/screens/homegroup/CreateConscienceVoteScreen.tsx`
- Create: `functions/src/callable/createConscienceVote.ts`
- Create: `functions/src/callable/castConscienceVote.ts`
- Create: `functions/src/callable/closeConscienceVote.ts`
- Modify: `mobile/src/types/schema.ts` (add `ConscienceVoteDocument`)
- Modify: `mobile/src/navigation/GroupStackNavigator.tsx`
- Modify: `mobile/src/types/navigation/index.ts`
- Modify: `mobile/src/screens/homegroup/GroupOverviewScreen.tsx` (add Group Conscience card)

**Firestore schema:**
```typescript
// Collection: group_conscience_votes (top-level, scoped by groupId)
interface ConscienceVoteDocument {
  id: string;
  groupId: string;
  groupName: string;
  createdBy: string;           // Admin UID
  title: string;               // e.g., "Should we use RecoveryConnect?"
  description?: string;        // Context or motion text
  options: string[];           // Default: ["Yes", "No", "Abstain"]
  votes: Record<string, string>; // userId → option chosen (hidden from voters until closed)
  status: 'open' | 'closed';
  quorumRequired?: number;     // Optional: minimum votes needed to be valid
  openedAt: Timestamp;
  closedAt?: Timestamp;
  result?: {                   // Populated on close
    counts: Record<string, number>;  // option → count
    winner?: string;                 // Majority option, if any
    quorumMet: boolean;
    totalVotes: number;
    totalEligible: number;          // group.memberCount at time of close
  };
}
```

**Anonymity:** The `votes` map stores `userId → option` so we can prevent double-voting and show each user their own vote, but the *results* only show aggregate counts until closed. Admins see aggregate counts only — individual votes are never displayed.

**`createConscienceVote` CF:**
```typescript
interface CreateVoteData {
  groupId: string;
  title: string;
  description?: string;
  options?: string[];       // Defaults to ["Yes", "No", "Abstain"]
  quorumRequired?: number;
  autoCloseHours?: number;  // Auto-close after N hours (optional)
}
// Auth: must be admin of groupId
// Creates document in group_conscience_votes
// Sends FCM to all group members: "Group Conscience vote opened: [title]"
```

**`castConscienceVote` CF:**
```typescript
interface CastVoteData {
  voteId: string;
  option: string;  // Must be one of vote.options
}
// Auth: must be member of vote.groupId
// Checks vote.status == 'open'
// Sets votes[uid] = option (idempotent — can change vote while open)
// Does NOT reveal vote counts until closed
```

**`closeConscienceVote` CF:**
```typescript
interface CloseVoteData { voteId: string }
// Auth: must be admin of vote.groupId
// Tallies votes, sets result, sets status = 'closed'
// Sends FCM to all members: "Group Conscience results: [title] — [winner]"
```

**Screen:** `GroupConscienceScreen` shows open and past votes. Active vote: shows the motion, user's current selection, aggregate count only after closed. Past votes: show result summary. Admin header: "+ New Vote".

**Firestore rules:**
```javascript
// group_conscience_votes
match /group_conscience_votes/{voteId} {
  allow read: if isGroupMember(resource.data.groupId);
  allow create: if isGroupAdmin(request.resource.data.groupId);
  allow update, delete: if false;  // Only via Cloud Functions
}
```

---

### Task 3.2: Secretary Pre-Meeting Checklist

**Files:**
- Create: `mobile/src/screens/homegroup/SecretaryToolkitScreen.tsx`
- Create: `mobile/src/screens/homegroup/MeetingChecklistScreen.tsx`
- Modify: `mobile/src/navigation/GroupStackNavigator.tsx`
- Modify: `mobile/src/types/navigation/index.ts`
- Modify: `mobile/src/screens/homegroup/GroupOverviewScreen.tsx` (add Secretary Toolkit card, visible to secretaries + admins)

**Context:** Service positions (secretary, treasurer, etc.) already exist via `GroupServicePositionsScreen` and the `servicePositionsSlice`. A user with role `secretary` (in `GroupMemberDocument.roles`) should see the Secretary Toolkit card.

**Checklist items (configurable per group, defaults below):**
```typescript
interface MeetingChecklistTemplate {
  id: string;
  groupId: string;
  format: 'open' | 'closed' | 'speaker' | 'step_study' | 'big_book' | 'discussion';
  items: ChecklistItem[];
}

interface ChecklistItem {
  id: string;
  label: string;
  category: 'before' | 'during' | 'after';
  isRequired: boolean;
}

// Default items (before meeting):
// - Literature available (Big Book, 12&12, daily reader)
// - Chips/medallions ready (30-day, 90-day, 1-year)
// - Serenity Prayer printed / available
// - [Format: Speaker] Speaker confirmed and knows format
// - [Format: Step Study] Step number to study tonight: [input]
// - Coffee / refreshments
// - Contribution basket
// - Group phone list printed or available in app

// Default items (during meeting):
// - Open with Serenity Prayer
// - Read How It Works / Preamble
// - Announce upcoming events / anniversaries
// - 7th Tradition collected
// - Mark attendance (use QR check-in or manual count)

// Default items (after meeting):
// - Count 7th tradition collection → record in Treasury
// - Clean up space
// - Store literature
```

**Screen flow:** Secretary opens `MeetingChecklistScreen` as the meeting starts. Each item is a checkbox. 7th tradition amount can be entered inline and tapped to open `AddTransaction` with the amount pre-filled. Meeting closes by tapping "End Meeting" → summary shows total attendance, 7th tradition amount, opens/closes any chips recorded.

---

### Task 3.3: Printable Phone List & Schedule

**Files:**
- Create: `mobile/src/services/reports/PhoneListReportService.ts`
- Create: `mobile/src/services/reports/MeetingScheduleReportService.ts`
- Modify: `mobile/src/screens/homegroup/GroupPhoneListScreen.tsx` (add "Print / Share PDF")
- Modify: `mobile/src/screens/homegroup/GroupScheduleScreen.tsx` (add "Print / Share PDF")

**Implementation:** Follow the exact pattern in `TreasuryReportService.ts`:
```typescript
// PhoneListReportService.ts
export class PhoneListReportService {
  static generateReportHTML(
    members: PhoneListEntry[],
    groupName: string,
    generatedDate: Date,
  ): string { ... }  // Returns styled HTML

  static async generateAndShare(
    members: PhoneListEntry[],
    groupName: string,
  ): Promise<void> { ... }  // RNHTMLtoPDF → Share.share
}

// MeetingScheduleReportService.ts
// Same pattern: generates weekly schedule as printable PDF
// Format: Day | Time | Type (Open/Closed) | Format (Speaker/Discussion) | Location
```

**Why this matters for traditional groups:** A printed phone list passed around at a meeting is a 12-step tradition. Many groups still do this. By making the digital app *generate* the printed version, you bridge the digital/analog divide and make the app serve both tech-savvy and tech-resistant members.

---

## V3.4: Referral Program & Multi-Group (Complete Existing Stubs)

**Status:** Several CFs and screens already exist. This section wires them together and fills gaps.

**Existing:** `generateReferralCode.ts`, `applyReferralCode.ts`, `getReferralStats.ts`, `ReferralDashboardScreen.tsx`, `referralSlice.ts`, `getMultiGroupPricing.ts`, `createMultiGroupAnnouncement.ts`

---

### Task 4.1: Audit & Complete Referral Flow

**Files:**
- Read & audit: `functions/src/callable/generateReferralCode.ts`
- Read & audit: `functions/src/callable/applyReferralCode.ts`
- Read & audit: `functions/src/callable/getReferralStats.ts`
- Read & audit: `mobile/src/store/slices/referralSlice.ts`
- Read & audit: `mobile/src/screens/homegroup/ReferralDashboardScreen.tsx`
- Modify gaps found during audit

**What to verify:**
1. Does `applyReferralCode` correctly identify when a referred group *converts* (goes from trial to paid)?
2. Does the referral reward (extend referrer's subscription by 1 month) actually run via Stripe API?
3. Does `ReferralDashboardScreen` handle the empty state (no code yet), loading state, and error state?
4. Is the `ReferralDashboard` route accessible from `GroupOverviewScreen`?

**If reward application is missing:** Add to `stripeUtils.ts` webhook handler for `customer.subscription.updated` — when a group's subscription transitions from `trialing` to `active`, check if there's a `referralCode` on the group document, look up the referrer, and call `stripe.subscriptions.update(referrerSubId, { trial_end: extendedDate })`.

**Extended trial for referral sign-ups:** When `applyReferralCode` is called during group creation, set the Stripe trial to 90 days instead of 30. Update `createGroupWithSubscription.ts` to accept an optional `referralCode` param and pass it through.

---

### Task 4.2: Group Switcher UI

**Files:**
- Create: `mobile/src/components/navigation/GroupSwitcher.tsx`
- Modify: `mobile/src/screens/homegroup/GroupListScreen.tsx` (integrate switcher for multi-admin users)

**Context:** `UserDocument.adminGroups` already stores the array of groups a user admins. A user who admins multiple groups needs a faster way to switch than navigating back to the group list.

```typescript
// GroupSwitcher.tsx: a modal/action-sheet triggered from a header button
// Shows all groups in UserDocument.adminGroups with:
//   - Group name
//   - Unread notifications count
//   - Subscription status badge
// One tap navigates to GroupOverview for that group
// Only show for users in adminGroups.length > 1
```

**Placement:** Add a "switch group" icon to the `GroupOverviewScreen` header (right side) for users who admin multiple groups.

---

### Task 4.3: Unified Inbox Screen

**Files:**
- Create: `mobile/src/screens/messages/UnifiedInboxScreen.tsx`
- Modify: `mobile/src/navigation/ProfileNavigator.tsx` or appropriate navigator (route already in nav types as `UnifiedInbox`)

**Content:** Aggregates across all of the user's groups:
- Unread group chat messages (grouped by group name)
- Recent announcements (last 7 days)
- Pending admin actions (admin removal votes, handoff requests, pending member requests)
- DM thread previews

```typescript
// Query pattern (all client-side, no new CF needed):
// 1. chatSlice already has unread counts per group
// 2. announcementsSlice already loaded for current group — extend to load all groups
// 3. adminRemovalSlice — load pending votes across all user's groups
// Each section is collapsible, tap navigates to the source screen
```

---

### Task 4.4: Multi-Group Discount Checkout

**Files:**
- Read & audit: `functions/src/callable/getMultiGroupPricing.ts`
- Modify: `mobile/src/screens/subscription/SubscriptionUpgradeScreen.tsx` (show multi-group discount if applicable)
- Modify: `mobile/src/screens/homegroup/CreateGroupScreen.tsx` (if user already has a group, offer discounted checkout)

**Pricing:** $12/year first group, $8/year each additional group (already in `getMultiGroupPricing`). The checkout flow for a second group should detect existing subscription and show the discounted price.

---

## V3.5: Step Work Companion

**Why this is the deepest differentiator:** Sober Grid, Loosid, Monument, and other recovery apps focus on connection and sobriety tracking. None of them integrate step work into the *homegroup* context. This section makes RecoveryConnect the first app where a member's step progress is connected to their sponsor, their group, and their recovery community — not just a solo private journal.

**Privacy note:** All step work data is **private by default**. Members choose what (if anything) to share. Sponsors can be granted read access to their sponsee's notes.

---

### Task 5.1: Step Progress Tracker

**Files:**
- Create: `mobile/src/screens/profile/StepTrackerScreen.tsx`
- Create: `mobile/src/store/slices/stepWorkSlice.ts`
- Modify: `mobile/src/types/schema.ts` (add `StepProgressDocument`, `StepNoteDocument`)
- Modify: `mobile/src/types/navigation/index.ts` (add `StepTracker` to `ProfileStackParamList`)
- Modify: `mobile/src/navigation/ProfileNavigator.tsx` (add route)
- Modify: `mobile/src/screens/profile/ProfileScreen.tsx` (add "Step Work" card)

**Firestore schema:**
```typescript
// Document: users/{userId}/stepProgress/current (singleton document)
interface StepProgressDocument {
  currentStep: number;           // 1-12
  startedAt: Timestamp;
  completedSteps: CompletedStep[];
  sponsorId?: string;            // Optional: sponsor's userId
  allowSponsorAccess: boolean;   // If true, sponsorId can read notes
}

interface CompletedStep {
  step: number;
  completedAt: Timestamp;
  durationDays: number;          // Days spent on this step
}

// Collection: users/{userId}/stepNotes (one doc per step)
interface StepNoteDocument {
  step: number;
  content: string;               // Free-form notes
  updatedAt: Timestamp;
  isPrivate: boolean;            // Always true unless shared with sponsor
}
```

**`stepWorkSlice.ts` (entity adapter):**
```typescript
// State: { progress: StepProgressDocument | null, notes: Record<number, StepNoteDocument> }
// Thunks: loadStepProgress, updateCurrentStep, completeStep, saveStepNote, loadStepNotes
// Selectors: selectCurrentStep, selectCompletedSteps, selectStepNote(step)
```

**Screen layout:**
```
[Progress bar: Steps 1-12, current step highlighted]

[Step N: "Step Nine"]
[Standard step text — pulled from constants, not a copyrighted work]
[✓ Mark as Complete]  [Started: Jan 5, 2026]

[My Notes]
[Multiline text input, auto-saves on blur]
[Private — only you (and sponsor if allowed) can see this]

[Previous Steps: collapsible list of completed steps with dates]
```

**Step text:** Use the publicly-known step statements (not AA copyrighted text). Example: "Step 9: Made direct amends to such people wherever possible, except when to do so would injure them or others." These are the steps themselves, not the book text.

---

### Task 5.2: Sponsor Connection & Step Sharing

**Files:**
- Modify: `mobile/src/screens/homegroup/GroupSponsorsScreen.tsx` (add "View Step Progress" for sponsees who grant access)
- Modify: `mobile/src/screens/sponsor/SponsorChatScreen.tsx` (add "Step Progress" tab if sponsee grants access)
- Create: `functions/src/callable/grantSponsorStepAccess.ts`

**Firestore rules for step notes:**
```javascript
match /users/{userId}/stepNotes/{stepId} {
  allow read: if request.auth.uid == userId
    || (request.auth.uid == get(/databases/$(database)/documents/users/$(userId)/stepProgress/current).data.sponsorId
        && get(/databases/$(database)/documents/users/$(userId)/stepProgress/current).data.allowSponsorAccess == true);
  allow write: if request.auth.uid == userId;
}
```

**`grantSponsorStepAccess` CF:**
```typescript
// Input: { sponsorId: string, allow: boolean }
// Updates users/{userId}/stepProgress/current: { sponsorId, allowSponsorAccess: allow }
// Sends notification to sponsor: "[Name] has shared their step work with you"
```

---

### Task 5.3: Step Study Meeting Integration

**Files:**
- Modify: `mobile/src/types/schema.ts` — add `currentStep?: number` to `MeetingDocument`
- Modify: `mobile/src/screens/homegroup/GroupScheduleScreen.tsx` — show "Step [N]" badge on step study meetings
- Modify: `mobile/src/screens/homegroup/EditMeetingInstanceScreen.tsx` — add "Step being studied" field for step study format

**Context:** `MeetingDocument` already has `format?: string`. When `format == 'step_study'`, show a "Step [N]" input on the edit screen. Display it on the schedule so members know which step is being studied this week before they arrive.

This integration makes the step tracker and meeting schedule feel like one coherent system rather than two separate features.

---

## Adoption Strategy: Enticing Traditional 12-Step Groups

This section is not a code task but documents the product strategy that should inform all marketing and onboarding copy.

### The "Traditional Group" Onboarding Flow

When an admin creates a group and arrives at the subscription screen, if they skip or dismiss:
1. Show a 90-day free trial (not 30) with messaging: "No credit card required. Decide at your business meeting."
2. Provide a **"Group Conscience Packet"** — a PDF they can print and bring to their business meeting. Contains: what the app does, cost, anonymity guarantees, and a sample group conscience motion: *"Shall our group use RecoveryConnect for meeting administration at a cost of $1/month from our 7th tradition?"*
3. Show a "Demo Mode" option — limited read-only access for all members before the group subscribes.

### Member-Driven Discovery (no cold outreach)

The meeting finder (V3.2) is the primary organic growth channel:
- A member searches for a meeting → their homegroup isn't listed → they tell their group
- A member scans a QR check-in at a visiting group's meeting → they discover the app

### Feature-Led Objection Handling (in-app copy)

| Screen | Copy opportunity |
|---|---|
| `GroupConscienceScreen` | "Run your group conscience vote digitally — or bring results to your business meeting" |
| `GroupPhoneListScreen` | "Your traditional phone list, always up to date, printable any time" |
| `MeetingChecklistScreen` | "Your secretary checklist — nothing gets forgotten" |
| `MeetingQRCodeScreen` | "No apps required for members to check in — just a phone camera" |
| Referral dashboard | "Each group you refer gets a 90-day trial. If they subscribe, you get a free month." |

---

## V3 Success Metrics

| Metric | Target | How it's measured |
|---|---|---|
| Referral K-factor | > 0.4 | (referred groups that convert) / (total referrers) |
| Member DAU / Group MAU | > 40% | Ratio of daily active members to monthly active groups |
| Anniversary card shares | > 20% of milestones shared | Share events in analytics |
| Secretary checklist usage | > 30% of groups | `meetingChecklistSession` Firestore events |
| Multi-group admin rate | > 12% | Users with adminGroups.length > 1 |
| Organic group creation from meeting finder | > 25% of new groups | `referralSource: 'meeting_finder'` flag on CreateGroup |

---

## Implementation Order

Start with V3.1 (phone list + milestones) because it has immediate member value and zero schema migration risk. Then V3.3 (governance tools) because it answers the primary group objection. V3.2 (meeting finder) requires the most UI work but drives top-of-funnel growth. V3.4 (referral completion) is fast because the infrastructure exists. V3.5 (step work) is the long-term retention play.

```
V3.1 → V3.3 → V3.2 → V3.4 → V3.5
(member hooks) → (group adoption) → (discovery) → (growth) → (retention)
```

---

## File Reference

**New screens:**
- `mobile/src/screens/homegroup/GroupPhoneListScreen.tsx`
- `mobile/src/screens/homegroup/GroupMilestonesScreen.tsx`
- `mobile/src/screens/meetings/MeetingFinderScreen.tsx`
- `mobile/src/screens/meetings/MeetingDetailScreen.tsx`
- `mobile/src/screens/homegroup/GroupConscienceScreen.tsx`
- `mobile/src/screens/homegroup/CreateConscienceVoteScreen.tsx`
- `mobile/src/screens/homegroup/SecretaryToolkitScreen.tsx`
- `mobile/src/screens/homegroup/MeetingChecklistScreen.tsx`
- `mobile/src/screens/homegroup/MeetingQRCodeScreen.tsx`
- `mobile/src/screens/messages/UnifiedInboxScreen.tsx`
- `mobile/src/screens/profile/StepTrackerScreen.tsx`

**New Cloud Functions:**
- `functions/src/callable/recordMilestone.ts`
- `functions/src/callable/getMilestones.ts`
- `functions/src/callable/exportMeetingGuideFormat.ts`
- `functions/src/callable/createConscienceVote.ts`
- `functions/src/callable/castConscienceVote.ts`
- `functions/src/callable/closeConscienceVote.ts`
- `functions/src/callable/grantSponsorStepAccess.ts`
- `functions/src/triggers/pubsub/scheduledMilestoneReminders.ts`

**New Redux slices:**
- `mobile/src/store/slices/stepWorkSlice.ts`

**New services:**
- `mobile/src/services/reports/PhoneListReportService.ts`
- `mobile/src/services/reports/MeetingScheduleReportService.ts`

**New components:**
- `mobile/src/components/milestones/AnniversaryCard.tsx`
- `mobile/src/components/navigation/GroupSwitcher.tsx`
