---
archived: true
archived_at: 2026-05-25
archived_reason: Plan shipped; tracked DONE in docs/plans/README.md (with PR# or commit ref). Preserved for historical reference.
original_path: docs/plans/2026-02-22-v4-advanced-governance.md
---

# V4.1: Advanced Governance Implementation Plan

**Goal:** Give RecoveryConnect-backed groups the formal governance infrastructure of a traditional AA/NA intergroup — bylaws, officer elections, structured minutes, and district reporting — all in the same app they already use for treasury and announcements.

**Theme: "The Group That Runs Itself Well"**

Mature 12-step groups that have been around for decades have institutional memory stored in notebooks and the heads of long-timers. When that long-timer moves away or passes, the group loses its history. V4.1 digitizes that institutional memory in a way that respects 12-step traditions: no hierarchy imposed by the app, every decision made by group conscience, and full PDF export so nothing is locked in the cloud.

**Why groups will pay for this:**
- Groups that have been running for 5+ years have bylaws disputes. This prevents them by keeping the current bylaws one tap away.
- Officer elections in the app eliminate the "who did we vote for last year?" problem.
- Structured minutes create an archive the next secretary can actually read.
- GSRs (Group Service Representatives) who carry a monthly intergroup report built automatically from app data will show it to other GSRs at district meetings — organic word-of-mouth.

**Architecture notes:**
- All new Firestore collections follow established patterns (top-level collections scoped by `groupId`, or subcollections under `groups/{groupId}/`).
- All new Cloud Functions use the same pattern as `createConscienceVote.ts`: `functions.https.onCall` with `CallableRequest<T>`, auth check via `members` collection, group lookup for name, then `db.collection(...).doc().set(...)`.
- Scheduled triggers follow `scheduledPositionReminders.ts` pattern: `functionsV1.pubsub.schedule(...).timeZone("UTC").onRun(...)`.
- New screens follow `GroupConscienceScreen.tsx` structure: route props from `GroupStackParamList`, `useRoute`/`useNavigation` hooks, `auth().currentUser`, Firestore reads in a `loadData` callback, `RefreshControl`, and a `ScrollView` with section cards.
- PDF export uses `RNHTMLtoPDF` following the existing `TreasuryReportService` pattern.
- No new Redux slices are required for V4.1 — all data is fetched directly via Firestore in-screen (same pattern as `GroupConscienceScreen`) or via Cloud Functions. A Redux slice can be added in a follow-up if cross-screen caching becomes necessary.

**Estimated Effort:** ~13-16 hours

---

## Section Overview

| Section | Feature | Effort | Key Value |
|---------|---------|--------|-----------|
| V4.1.1 | Bylaw / Guidelines Management | 3-4 hrs | One canonical document, ratified by conscience vote |
| V4.1.2 | Officer Election System | 3-4 hrs | Nomination + ranked vote, winner auto-assigned |
| V4.1.3 | Business Meeting Minutes | 3-4 hrs | Structured template, searchable archive, PDF export |
| V4.1.4 | Trusted Servant Term Tracking (enhancements) | 1-2 hrs | Term dashboard + extended reminder logic |
| V4.1.5 | Intergroup / District Monthly Report | 2-3 hrs | AA-format auto-generated report, PDF share |

---

## V4.1.1: Bylaw / Guidelines Management

**Why first:** Bylaws are the foundation all other governance features reference ("per our group guidelines, officer terms are 6 months"). Building this first gives V4.1.2 and V4.1.3 something to link to. It also reuses `ConscienceVoteDocument` without modification — the ratification vote is a standard group conscience vote with a special link field.

**Schema already supports most of this:** `ConscienceVoteDocument` handles the ratification vote. We need one new collection for the document itself.

---

### Task 1.1: Bylaw Document Schema & Cloud Functions

**Files to create:**
- `functions/src/callable/saveBylawDraft.ts`
- `functions/src/callable/ratifyBylaws.ts`

**Files to modify:**
- `mobile/src/types/schema.ts` — add `BylawDocument`, `BylawVersion`
- `mobile/src/types/schema.ts` — add `GROUP_BYLAWS` and `BYLAW_VERSIONS` to `COLLECTION_PATHS`

**Firestore schema:**

```typescript
/**
 * Bylaw Document
 * Collection: group_bylaws/{groupId}   (one document per group, the current ratified version)
 */
export interface BylawDocument {
  groupId: string;
  groupName: string;
  title: string;                       // e.g., "Home Group Guidelines"
  content: string;                     // Full text — markdown supported
  version: number;                     // Incrementing integer: 1, 2, 3...
  status: 'draft' | 'pending_vote' | 'ratified';
  ratifyingVoteId?: string;            // ConscienceVoteDocument.id that ratified this version
  ratifiedAt?: FirebaseFirestoreTypes.Timestamp;
  ratifiedBy?: string;                 // Admin UID who triggered ratification
  createdAt: FirebaseFirestoreTypes.Timestamp;
  updatedAt: FirebaseFirestoreTypes.Timestamp;
  createdBy: string;
  lastEditedBy: string;
}

/**
 * Bylaw Version Archive
 * Collection: group_bylaws/{groupId}/versions/{versionNumber}
 * Written when a new version is ratified; previous version is archived here.
 */
export interface BylawVersion {
  version: number;
  content: string;
  ratifiedAt: FirebaseFirestoreTypes.Timestamp;
  ratifyingVoteId: string;
}
```

**`COLLECTION_PATHS` additions:**

```typescript
GROUP_BYLAWS: 'group_bylaws',
BYLAW_VERSIONS: (groupId: string) => `group_bylaws/${groupId}/versions`,
```

**`saveBylawDraft` CF:**

```typescript
// functions/src/callable/saveBylawDraft.ts
interface SaveBylawDraftData {
  groupId: string;
  title: string;
  content: string;        // Full text of the guidelines
}

interface SaveBylawDraftResult {
  bylawId: string;        // == groupId (one document per group)
}

// Auth: must be admin of groupId
// Creates or overwrites group_bylaws/{groupId} with status: 'draft'
// Does not increment version — version only increments on ratification
// Idempotent: calling again replaces the draft content
```

**`ratifyBylaws` CF:**

```typescript
// functions/src/callable/ratifyBylaws.ts
interface RatifyBylawsData {
  groupId: string;
  voteId: string;         // The conscience vote that passed — CF verifies it
}

interface RatifyBylawsResult {
  version: number;
}

// Auth: must be admin of groupId
// 1. Load the conscience vote — verify status == 'closed' && result.winner == 'Yes'
//    (winner field set by closeConscienceVote CF)
// 2. Load current group_bylaws/{groupId}
// 3. If version N already exists, write group_bylaws/{groupId}/versions/{N} with old content
// 4. Increment version, set status = 'ratified', set ratifyingVoteId, ratifiedAt
// 5. Update group_bylaws/{groupId}
// 6. Send FCM to all group members: "Group guidelines ratified (v{N}) — tap to read"
```

---

### Task 1.2: Bylaw Screens

**Files to create:**
- `mobile/src/screens/homegroup/GroupBylawsScreen.tsx`
- `mobile/src/screens/homegroup/EditBylawsScreen.tsx`

**Files to modify:**
- `mobile/src/types/navigation/index.ts` — add routes to `GroupStackParamList`
- `mobile/src/navigation/GroupStackNavigator.tsx` — register new screens
- `mobile/src/screens/homegroup/GroupOverviewScreen.tsx` — add "Guidelines" nav tile

**Navigation route params:**

```typescript
// Add to GroupStackParamList in mobile/src/types/navigation/index.ts
GroupBylaws: { groupId: string; groupName: string };
EditBylaws: { groupId: string; groupName: string };
```

**`GroupBylawsScreen.tsx` layout:**

```
[Header: "Group Guidelines"   [Edit icon — admin only]]

[Version badge: "v3 — Ratified Jan 12, 2026"]
[Status badge: RATIFIED (green) / DRAFT (amber) / PENDING VOTE (blue)]

[ScrollView — full guidelines text, markdown rendered via react-native-markdown-display]

[Section: "Version History" — collapsible]
  [v2 — Ratified Aug 3, 2025  >]
  [v1 — Ratified Mar 14, 2025  >]

[Button: "Share PDF"  (admin only: "Start Ratification Vote")]

--- Empty state (no bylaws yet) ---
[Icon: clipboard-text-outline]
["Your group hasn't added guidelines yet."]
[Button: "Create Guidelines" — admin only]
```

**`EditBylawsScreen.tsx` layout:**

```
[Header: "Edit Guidelines"   [Save]]

[TextInput: Title — "Home Group Guidelines"]

[TextInput: Content — multiline, tall, monospace-friendly]
  (Accepts plain text or markdown)

[Info banner: "Changes are saved as a draft.
  Start a ratification vote when ready to make this official."]

[Button: "Save Draft"]
[Button: "Start Ratification Vote" — only shown when draft differs from ratified]
  (navigates to CreateConscienceVote with title pre-filled:
   "Ratify Group Guidelines v{N+1}" and a note linking back to the draft)
```

**PDF export:**

```typescript
// Follow TreasuryReportService pattern
// mobile/src/services/reports/BylawsReportService.ts
export class BylawsReportService {
  static generateReportHTML(bylaw: BylawDocument, groupName: string): string {
    // Header: group name, "Official Guidelines", version + ratification date
    // Body: bylaw.content (pre-formatted, no markdown parsing in HTML)
    // Footer: "Ratified by group conscience vote — RecoveryConnect"
  }
  static async generateAndShare(bylaw: BylawDocument, groupName: string): Promise<void> {
    // RNHTMLtoPDF.convert(...) → Share.share(...)
  }
}
```

**Files to create:**
- `mobile/src/services/reports/BylawsReportService.ts`

**GroupOverviewScreen tile to add (in the navTilesContainer, visible to all members):**

```tsx
<TouchableOpacity
  style={styles.navTile}
  onPress={() => navigation.navigate('GroupBylaws', {groupId, groupName})}
  testID="group-overview-bylaws-tile">
  <View style={[styles.navTileIcon, {backgroundColor: '#E8F5E9'}]}>
    <Icon name="file-document-outline" size={24} color="#388E3C" />
  </View>
  <Text style={styles.navTileText}>Guidelines</Text>
</TouchableOpacity>
```

**Effort estimate: 3-4 hours**

---

## V4.1.2: Officer Election System

**Why second:** Elections produce the officers who then create minutes (V4.1.3). The election system reuses `ConscienceVoteDocument` infrastructure (cast/close functions, FCM pattern) but needs its own collection because it has candidate nominees, a position linkage, and an auto-assignment winner step that conscience votes don't have.

**Relationship to existing data:** `ServicePositionDocument` (subcollection `groups/{groupId}/servicePositions/{positionId}`) is the target of an election result. Winning candidate is assigned via updating `currentHolderId` / `currentHolderName` on the position — same fields already populated by the existing `AddEditServicePosition` screen.

---

### Task 2.1: Election Schema & Cloud Functions

**Files to create:**
- `functions/src/callable/openElection.ts`
- `functions/src/callable/nominateForElection.ts`
- `functions/src/callable/castElectionVote.ts`
- `functions/src/callable/closeElection.ts`

**Files to modify:**
- `mobile/src/types/schema.ts` — add `ElectionDocument`, `ElectionNominee`
- `mobile/src/types/schema.ts` — add `ELECTIONS` to `COLLECTION_PATHS`

**Firestore schema:**

```typescript
/**
 * Election Document
 * Collection: group_elections (top-level, scoped by groupId)
 */
export interface ElectionNominee {
  userId: string;
  displayName: string;
  nominatedAt: FirebaseFirestoreTypes.Timestamp;
  nominatedBy: string;        // userId of nominator (same as userId if self-nominated)
  nomineeStatement?: string;  // Optional: "I'd like to serve because..."
  withdrawn?: boolean;        // Nominee can withdraw before voting opens
}

export type ElectionStatus = 'nominations_open' | 'voting_open' | 'closed';

export interface ElectionDocument {
  id: string;
  groupId: string;
  groupName: string;
  positionId: string;         // groups/{groupId}/servicePositions/{positionId}
  positionName: string;       // Denormalized for display
  createdBy: string;          // Admin UID
  createdByName: string;
  status: ElectionStatus;
  nominees: ElectionNominee[];
  votes: Record<string, string>;   // userId → nomineeUserId (hidden until closed)
  nominationsOpenAt: FirebaseFirestoreTypes.Timestamp;
  nominationsCloseAt?: FirebaseFirestoreTypes.Timestamp;  // Optional auto-close
  votingOpenAt?: FirebaseFirestoreTypes.Timestamp;
  closedAt?: FirebaseFirestoreTypes.Timestamp;
  result?: {
    winnerId: string | null;          // null = tie
    winnerName: string | null;
    counts: Record<string, number>;   // nomineeUserId → vote count
    totalVotes: number;
    totalEligible: number;
    tied: boolean;
  };
  // Set to true once winner has been assigned to the service position
  winnerAssigned?: boolean;
  createdAt: FirebaseFirestoreTypes.Timestamp;
  updatedAt: FirebaseFirestoreTypes.Timestamp;
}
```

**`COLLECTION_PATHS` addition:**

```typescript
GROUP_ELECTIONS: 'group_elections',
```

**`openElection` CF:**

```typescript
// functions/src/callable/openElection.ts
interface OpenElectionData {
  groupId: string;
  positionId: string;
  nominationsCloseHours?: number;  // Optional: auto-close nominations after N hours
}
interface OpenElectionResult { electionId: string }
// Auth: must be admin of groupId
// Loads groups/{groupId}/servicePositions/{positionId} to get positionName
// Creates group_elections/{electionId} with status: 'nominations_open', nominees: []
// Sends FCM to all members: "Nominations open for [positionName] — tap to nominate"
```

**`nominateForElection` CF:**

```typescript
// functions/src/callable/nominateForElection.ts
interface NominateData {
  electionId: string;
  nomineeUserId: string;        // Can be self (self-nomination) or another member
  nomineeStatement?: string;
}
interface NominateResult { success: boolean }
// Auth: must be member of election.groupId
// Validates: election.status == 'nominations_open'
// Validates: nomineeUserId is a member of the group (members collection lookup)
// Validates: nominee not already in nominees array
// Appends to election.nominees array via arrayUnion
// If nomineeUserId != callerId: notifies nominee via FCM "You've been nominated for [positionName]"
```

**`castElectionVote` CF:**

```typescript
// functions/src/callable/castElectionVote.ts
interface CastElectionVoteData {
  electionId: string;
  nomineeUserId: string;   // Must be in election.nominees and not withdrawn
}
interface CastElectionVoteResult { success: boolean }
// Auth: must be member of election.groupId
// Validates: election.status == 'voting_open'
// Validates: nomineeUserId is a non-withdrawn nominee
// Sets election.votes[callerId] = nomineeUserId (idempotent — can change while open)
// Does NOT reveal vote counts
```

**`closeElection` CF:**

```typescript
// functions/src/callable/closeElection.ts
interface CloseElectionData {
  electionId: string;
  assignWinner?: boolean;   // If true, auto-assigns winner to the service position
}
interface CloseElectionResult {
  winnerId: string | null;
  winnerName: string | null;
  tied: boolean;
}
// Auth: must be admin of election.groupId
// Tallies election.votes, finds majority winner (or tie)
// Sets result, status: 'closed', closedAt
// If assignWinner == true && !tied:
//   Updates groups/{groupId}/servicePositions/{positionId}:
//     currentHolderId, currentHolderName, updatedAt
//   Sets election.winnerAssigned = true
// Sends FCM to all members: "[winnerName] elected as [positionName]"
//   OR (if tied): "Election tied for [positionName] — admin will determine next steps"
```

---

### Task 2.2: Election Screens

**Files to create:**
- `mobile/src/screens/homegroup/GroupElectionsScreen.tsx`
- `mobile/src/screens/homegroup/ElectionDetailScreen.tsx`

**Files to modify:**
- `mobile/src/types/navigation/index.ts` — add routes
- `mobile/src/navigation/GroupStackNavigator.tsx` — register screens
- `mobile/src/screens/homegroup/GroupServicePositionsScreen.tsx` — add "Start Election" button on positions with no current holder (admin only)

**Navigation route params:**

```typescript
// Add to GroupStackParamList
GroupElections: { groupId: string; groupName: string };
ElectionDetail: {
  groupId: string;
  groupName: string;
  electionId: string;
};
```

**`GroupElectionsScreen.tsx` layout:**

```
[Header: "Officer Elections"   [+ icon — admin only]]

[Section: "Active Elections"]
  [Election card: borderLeft blue (nominations) or green (voting)]
    [NOMINATIONS OPEN badge]  [Position: Secretary]
    [X nominees so far]
    [Button: "Nominate" or "Vote" depending on status]
    [Admin: Close nominations | Open voting | Close Election]

[Section: "Past Elections"]
  [Closed election card: borderLeft grey]
    [CLOSED badge]  [Secretary — Result: Jane D. elected]
    [Nov 12, 2025  •  8 of 12 members voted]
```

**`ElectionDetailScreen.tsx` layout:**

```
[Header: "Election: [Position Name]"   status badge]

--- Status: nominations_open ---
[Section: "Nominees (N)"]
  [Nominee row: name, sobriety chip (optional), "Nominated by X"]
  [Nominee statement if provided]
  [Button: "Nominate Someone" or "Nominate Myself"]
  [Admin: "Close Nominations & Open Voting"]

--- Status: voting_open ---
[Section: "Cast Your Vote"]
  [Radio list of nominees — same UX as GroupConscienceScreen option buttons]
  [Your selection highlighted if already voted]
  [Admin: "Close Election & Reveal Results"]

--- Status: closed ---
[Winner banner: check-circle green — "[Name] elected as [Position]"]
  OR tie banner
[Vote counts with progress bars — same renderClosedVote pattern]
[Admin: "Assign Winner to Position" button (if !winnerAssigned)]
```

**Effort estimate: 3-4 hours**

---

## V4.1.3: Business Meeting Minutes

**Why third:** The `BusinessMeetingDocument` already exists in schema and Firestore. The existing screens (`BusinessMeetingsList`, `BusinessMeetingDetail`, `CreateEditBusinessMeeting`, `ManageAgenda`) handle scheduling. V4.1.3 extends the *existing business meeting* with a structured **minutes template** that the secretary fills in during the meeting, stores, and can export as PDF. This is a targeted enhancement, not a new standalone feature.

**What exists vs. what's new:**
- Exists: `BusinessMeetingDocument`, `AgendaItemDocument`, `DecisionDocument`, collection paths, navigation routes
- New: `MeetingMinutesDocument` subcollection (structured minutes, separate from the agenda scaffold), minutes entry screen, PDF export, archive search

---

### Task 3.1: Minutes Schema

**Files to modify:**
- `mobile/src/types/schema.ts` — add `MeetingMinutesDocument`, `MinutesAgendaEntry`, `MinutesDecisionEntry`
- `mobile/src/types/schema.ts` — add `MEETING_MINUTES` to `COLLECTION_PATHS`

**Firestore schema:**

```typescript
/**
 * Meeting Minutes Document
 * Collection: business_meetings/{meetingId}/minutes/record   (singleton per meeting)
 * The "minutes/record" path uses a fixed doc ID "record" to enforce one-per-meeting.
 */
export interface MinutesAgendaEntry {
  itemId: string;        // Matches AgendaItemDocument.id if linked; else free-form
  title: string;
  notes: string;         // What was discussed
  outcome: 'no_action' | 'voted' | 'tabled' | 'information_only';
}

export interface MinutesDecisionEntry {
  topic: string;
  motionText: string;    // "It was moved by [name] and seconded by [name] that..."
  movedBy: string;       // display name (not uid — minutes are for records, not auth)
  secondedBy?: string;
  voteFor: number;
  voteAgainst: number;
  voteAbstain: number;
  passed: boolean;
  notes?: string;
}

export interface MeetingMinutesDocument {
  businessMeetingId: string;
  groupId: string;
  groupName: string;
  date: FirebaseFirestoreTypes.Timestamp;    // From parent BusinessMeetingDocument
  openedAt?: string;                         // "7:32 PM" — freeform time string
  closedAt?: string;                         // "8:15 PM"
  chair: string;                             // Display name
  secretary: string;                         // Display name (recorder)
  attendanceCount: number;
  memberQuorum: boolean;                     // Did attendance meet quorum?
  guestsPresent?: string;                    // Freeform: "2 guests"
  openingPrayer: boolean;
  closingPrayer: boolean;
  // Treasury report snapshot
  treasuryReport?: {
    openingBalance: number;
    collection7thTradition: number;
    expenses: number;
    closingBalance: number;
    prudentReserve: number;
    notes?: string;
  };
  // Agenda items discussed
  agendaItems: MinutesAgendaEntry[];
  // Formal decisions/votes taken
  decisions: MinutesDecisionEntry[];
  // Next meeting
  nextMeetingDate?: FirebaseFirestoreTypes.Timestamp;
  nextMeetingLocation?: string;
  announcements?: string;    // Freeform
  status: 'draft' | 'approved';
  approvedAt?: FirebaseFirestoreTypes.Timestamp;
  approvedBy?: string;
  createdBy: string;         // User ID of secretary
  createdAt: FirebaseFirestoreTypes.Timestamp;
  updatedAt: FirebaseFirestoreTypes.Timestamp;
}
```

**`COLLECTION_PATHS` addition:**

```typescript
MEETING_MINUTES: (meetingId: string) => `business_meetings/${meetingId}/minutes`,
```

---

### Task 3.2: Minutes Cloud Functions

**Files to create:**
- `functions/src/callable/saveMeetingMinutes.ts`
- `functions/src/callable/approveMeetingMinutes.ts`

**`saveMeetingMinutes` CF:**

```typescript
// functions/src/callable/saveMeetingMinutes.ts
interface SaveMinutesData {
  businessMeetingId: string;
  groupId: string;
  minutes: Omit<MeetingMinutesDocument,
    'businessMeetingId' | 'groupId' | 'groupName' | 'createdBy' |
    'createdAt' | 'updatedAt' | 'status' | 'approvedAt' | 'approvedBy'>;
}
interface SaveMinutesResult { success: boolean }
// Auth: must be secretary or admin of groupId
// Secretary check: members/{groupId}_{callerId}.roles includes 'secretary'
// Creates or overwrites business_meetings/{meetingId}/minutes/record
// status is always set to 'draft' by this CF; approval is separate
```

**`approveMeetingMinutes` CF:**

```typescript
// functions/src/callable/approveMeetingMinutes.ts
interface ApproveMinutesData { businessMeetingId: string; groupId: string }
interface ApproveMinutesResult { success: boolean }
// Auth: must be admin of groupId
// Sets status: 'approved', approvedAt: serverTimestamp(), approvedBy: callerId
// Sends FCM to all members: "Minutes from [date] meeting approved — tap to read"
```

---

### Task 3.3: Minutes Screens

**Files to create:**
- `mobile/src/screens/homegroup/MeetingMinutesScreen.tsx`
- `mobile/src/screens/homegroup/EditMeetingMinutesScreen.tsx`
- `mobile/src/screens/homegroup/MinutesArchiveScreen.tsx`
- `mobile/src/services/reports/MeetingMinutesReportService.ts`

**Files to modify:**
- `mobile/src/types/navigation/index.ts` — add routes
- `mobile/src/navigation/GroupStackNavigator.tsx` — register screens
- `mobile/src/screens/homegroup/BusinessMeetingDetail.tsx` — add "Minutes" button

**Navigation route params:**

```typescript
// Add to GroupStackParamList
MeetingMinutes: {
  groupId: string;
  groupName: string;
  businessMeetingId: string;
  meetingDate: number;   // Unix timestamp for display in header
};
EditMeetingMinutes: {
  groupId: string;
  groupName: string;
  businessMeetingId: string;
  meetingDate: number;
};
MinutesArchive: { groupId: string; groupName: string };
```

**`MeetingMinutesScreen.tsx` layout:**

```
[Header: "Minutes — Jan 14, 2026"   [Edit — secretary/admin]  [Share PDF]]

[Status badge: DRAFT (amber) / APPROVED (green)]

[Section: "Meeting Info"]
  Chair: John S.  |  Secretary: Mary T.
  Opened: 7:32 PM  |  Closed: 8:15 PM
  Attendance: 14 members  [Quorum met]
  Opening prayer: Yes  |  Closing prayer: Yes

[Section: "Treasury Report"]
  Opening balance: $312.50
  7th Tradition: $67.00
  Expenses: $18.00
  Closing balance: $361.50
  Prudent reserve: $300.00

[Section: "Agenda Items (N)"]
  [Item row: title, outcome badge, notes excerpt]

[Section: "Decisions (N)"]
  [Decision row: topic, "PASSED" or "FAILED", vote tally]

[Section: "Next Meeting"]
  [Date + location if set]

[Admin: "Approve Minutes" button — only when status == 'draft']
```

**`EditMeetingMinutesScreen.tsx` layout:**

```
[Header: "Record Minutes"   [Save Draft]]

[ScrollView of form sections]
  [Meeting Info section]
    Chair (TextInput)
    Secretary (TextInput — pre-filled with current user display name)
    Attendance Count (numeric TextInput)
    Quorum met? (Switch)
    Opened (TextInput: "7:32 PM")
    Closed (TextInput)
    Opening prayer / Closing prayer (Switches)

  [Treasury Report section]  (all numeric TextInput)
    Opening balance / 7th Tradition / Expenses / Notes

  [Agenda Items section]
    [Item cards with title + outcome picker + notes]
    [+ Add Agenda Item button]

  [Decisions section]
    [Decision cards with topic, motion text, vote counts, passed toggle]
    [+ Add Decision button]

  [Next Meeting section]
    DateTimePicker + location TextInput

  [Announcements (multiline)]
```

**`MinutesArchiveScreen.tsx` layout:**

```
[Header: "Minutes Archive"   [Search icon]]

[SearchBar: filter by month/year or keyword]

[FlatList of past minutes, newest first]
  [Row: "Jan 14, 2026 — APPROVED  •  14 members  >"]
  [Row: "Dec 10, 2025 — DRAFT     •  11 members  >"]
```

**MinutesArchiveScreen** queries `business_meetings` where `groupId == groupId`, ordered by `date` desc, then for each doc checks if `business_meetings/{id}/minutes/record` exists. Tap navigates to `MeetingMinutes` screen.

**Add to `GroupOverviewScreen` nav tile grid (secretary/admin only):**

```tsx
{isMember && isSecretaryOrAdmin && (
  <TouchableOpacity
    style={styles.navTile}
    onPress={() => navigation.navigate('MinutesArchive', {groupId, groupName})}
    testID="group-overview-minutes-archive-tile">
    <View style={[styles.navTileIcon, {backgroundColor: '#FBE9E7'}]}>
      <Icon name="notebook-outline" size={24} color="#BF360C" />
    </View>
    <Text style={styles.navTileText}>Minutes</Text>
  </TouchableOpacity>
)}
```

**PDF export pattern:**

```typescript
// mobile/src/services/reports/MeetingMinutesReportService.ts
export class MeetingMinutesReportService {
  static generateReportHTML(
    minutes: MeetingMinutesDocument,
    groupName: string,
  ): string {
    // Standard header: group name, "Business Meeting Minutes", date
    // Section: Meeting Info table
    // Section: Treasury Report table
    // Section: Agenda Items
    // Section: Formal Decisions (numbered, with vote tallies)
    // Section: Announcements / Next Meeting
    // Footer: "Approved by group conscience" (if status == 'approved')
    //   OR "DRAFT — Not yet approved" watermark
  }
  static async generateAndShare(
    minutes: MeetingMinutesDocument,
    groupName: string,
  ): Promise<void> {
    // RNHTMLtoPDF.convert → Share.share
  }
}
```

**Effort estimate: 3-4 hours**

---

## V4.1.4: Trusted Servant Term Tracking (enhancements)

**Context:** `ServicePositionDocument` already has `termStartDate`, `termEndDate`, `remindersSent`, and `commitmentLength`. `scheduledPositionReminders.ts` already fires at 30, 7, and 1-day intervals to both the holder and admins. The existing `GroupServicePositionsScreen` and `AddEditServicePosition` screens already display and edit these fields (visible in `GroupOverviewScreen.tsx` lines 784-797).

**What V4.1.4 adds:** A dedicated **"Upcoming Term Expirations" dashboard** so the admin can see all expiring positions in one place, and a **"Terms History"** log on each position showing past holders (so the group knows who served when).

This is a smaller, targeted enhancement. No new Cloud Functions needed — all reads are client-side Firestore queries.

---

### Task 4.1: Term History Schema

**Files to modify:**
- `mobile/src/types/schema.ts` — add `TermHistoryRecord`, extend `ServicePositionDocument`

**Schema addition:**

```typescript
/**
 * Term History Record — embedded array in ServicePositionDocument
 * Added so we don't need a separate subcollection for common display cases.
 */
export interface TermHistoryRecord {
  holderId: string;
  holderName: string;
  termStartDate: FirebaseFirestoreTypes.Timestamp;
  termEndDate?: FirebaseFirestoreTypes.Timestamp;  // null = still serving (shouldn't happen in history)
  rotatedAt: FirebaseFirestoreTypes.Timestamp;     // When the position was reassigned away
  rotatedBy: string;                               // Admin UID who made the change
  notes?: string;
}

// Add to ServicePositionDocument:
// termHistory?: TermHistoryRecord[];
```

**When to write to `termHistory`:** The existing `AddEditServicePosition` screen saves position changes. The plan is for the CF (or client write via `saveBylawDraft`-style pattern) to append to `termHistory` when `currentHolderId` changes and the old holder had a `termStartDate`. This can be implemented as a Firestore trigger.

**Files to create:**
- `functions/src/triggers/firestore/onServicePositionWrite.ts` — Firestore `onWrite` trigger that detects holder changes and appends the old holder to `termHistory`

```typescript
// functions/src/triggers/firestore/onServicePositionWrite.ts
// Trigger: functions.firestore.document('groups/{groupId}/servicePositions/{positionId}').onWrite()
// If before.currentHolderId != after.currentHolderId && before.currentHolderId is set:
//   Append TermHistoryRecord for the outgoing holder to termHistory
// This keeps the existing AddEditServicePosition client write unchanged.
```

---

### Task 4.2: Term Dashboard Screen

**Files to create:**
- `mobile/src/screens/homegroup/TermsDashboardScreen.tsx`

**Files to modify:**
- `mobile/src/types/navigation/index.ts` — add route
- `mobile/src/navigation/GroupStackNavigator.tsx` — register screen
- `mobile/src/screens/homegroup/GroupServicePositionsScreen.tsx` — add "Expiring Terms" banner + link when any position expires within 60 days

**Navigation route params:**

```typescript
// Add to GroupStackParamList
TermsDashboard: { groupId: string; groupName: string };
```

**`TermsDashboardScreen.tsx` layout:**

```
[Header: "Trusted Servant Terms"]

[Section: "Expiring Within 60 Days"]
  [Position card — borderLeft amber/red based on urgency]
    Secretary — Jane D.
    Term ends: Feb 28, 2026  (6 days — URGENT red)
    [Reminder sent: 30-day, 7-day  |  Next: 1-day]

  [Position card]
    Treasurer — Bob M.
    Term ends: Apr 5, 2026  (41 days — amber)

[Section: "All Active Terms"]
  [FlatList of all positions with currentHolderId set, showing termStartDate → termEndDate]

[Section: "Positions Without Holders"]
  [List of positions where currentHolderId is null/empty]
  [Button: "Start Election" next to each — navigates to GroupElections with positionId pre-selected]
```

**Data source:** Query `collectionGroup('servicePositions').where('groupId', '==', groupId)` client-side (no CF needed — this is a scoped query on the group's own subcollection). Sort by `termEndDate` ascending.

**Add to `GroupServicePositionsScreen` header area (admin only, when any term expires within 60 days):**

```tsx
{hasExpiringTerms && (
  <TouchableOpacity
    style={styles.expiringBanner}
    onPress={() => navigation.navigate('TermsDashboard', {groupId, groupName})}>
    <Icon name="alert-circle-outline" size={16} color="#E65100" />
    <Text style={styles.expiringBannerText}>
      {expiringCount} term{expiringCount > 1 ? 's' : ''} expiring soon — view dashboard
    </Text>
  </TouchableOpacity>
)}
```

**Effort estimate: 1-2 hours**

---

## V4.1.5: Intergroup / District Monthly Report

**Why last:** This feature synthesizes data from all other features (treasury, attendance, milestones, term tracking) into a format GSRs can hand to their intergroup. It's the most visible external-facing feature of V4.1. Building it last ensures the data sources it pulls from are stable.

**AA Format context:** Most AA intergroups request monthly reports from groups covering: group info, average attendance, 7th tradition total, sobriety birthdays, officer roster. This is the GSR's main job at intergroup meetings. If the app generates this report automatically, every GSR in the area becomes a natural advocate ("the app literally writes my report for me").

---

### Task 5.1: Report Schema

**Files to modify:**
- `mobile/src/types/schema.ts` — add `IntergroupReportDocument`
- `mobile/src/types/schema.ts` — add `INTERGROUP_REPORTS` to `COLLECTION_PATHS`

**Firestore schema:**

```typescript
/**
 * Intergroup Report Document
 * Collection: intergroup_reports/{reportId}
 * One report per group per month. Document ID convention: {groupId}_{YYYY-MM}
 */
export interface IntergroupReportDocument {
  id: string;                    // {groupId}_{YYYY-MM}
  groupId: string;
  groupName: string;
  reportMonth: string;           // "2026-01" (YYYY-MM)
  reportYear: number;            // 2026
  reportMonthNumber: number;     // 1-12
  // Group Info
  groupType: string;             // "AA" | "NA" etc.
  meetingDay: string;            // "Tuesday" or "Tues & Thu" (freeform)
  meetingTime: string;           // "7:30 PM"
  meetingLocation: string;
  isOnlineMeeting: boolean;
  gsrName?: string;              // Group Service Representative name
  gsrPhoneNumber?: string;
  // Attendance
  averageAttendance: number;     // Admin enters or pulled from MeetingInstance attendeeCount
  numberOfMeetingsHeld: number;
  // 7th Tradition
  totalSeventhTraditionCollected: number;  // Pulled from treasury transactions or admin enters
  // Sobriety Birthdays (this month)
  sobrietyBirthdays: {
    memberName: string;          // Display name only
    years: number;
  }[];
  // Officer roster
  officers: {
    positionName: string;
    holderName: string;
  }[];
  // Notes
  groupNotes?: string;           // Any special announcements (new meeting, GSO contribution, etc.)
  // Status
  status: 'draft' | 'submitted';
  createdBy: string;             // Admin UID
  createdAt: FirebaseFirestoreTypes.Timestamp;
  updatedAt: FirebaseFirestoreTypes.Timestamp;
}
```

**`COLLECTION_PATHS` addition:**

```typescript
INTERGROUP_REPORTS: 'intergroup_reports',
```

---

### Task 5.2: Report Cloud Function

**Files to create:**
- `functions/src/callable/generateIntergroupReport.ts`

**`generateIntergroupReport` CF:**

```typescript
// functions/src/callable/generateIntergroupReport.ts
interface GenerateReportData {
  groupId: string;
  reportMonth: string;    // "2026-01"
}
interface GenerateReportResult {
  reportId: string;
  reportData: IntergroupReportDocument;  // Pre-populated, caller reviews/edits before saving
}

// Auth: must be admin of groupId
// 1. Load group document for name, type, location, meetings
// 2. Load servicePositions for officers snapshot
// 3. Load milestones subcollection — filter to sobrietyDate anniversaries in reportMonth
//    (e.g., if sobrietyDate is Jan 15 2019, this month they hit 7 years)
// 4. Load treasury transactions for reportMonth: sum all income where category matches
//    'seventh_tradition' or description contains "7th" (best-effort)
// 5. Load meetingInstances for the group in reportMonth: count non-cancelled, average attendeeCount
// 6. Create or overwrite intergroup_reports/{groupId}_{reportMonth} with status: 'draft'
// Returns the populated document so the mobile client can show a preview + allow edits
```

---

### Task 5.3: Report Screens

**Files to create:**
- `mobile/src/screens/homegroup/IntergroupReportScreen.tsx`
- `mobile/src/screens/homegroup/IntergroupReportHistoryScreen.tsx`
- `mobile/src/services/reports/IntergroupReportService.ts`

**Files to modify:**
- `mobile/src/types/navigation/index.ts` — add routes
- `mobile/src/navigation/GroupStackNavigator.tsx` — register screens
- `mobile/src/screens/homegroup/GroupOverviewScreen.tsx` — add "GSR Report" nav tile (admin only)

**Navigation route params:**

```typescript
// Add to GroupStackParamList
IntergroupReport: {
  groupId: string;
  groupName: string;
  reportMonth: string;   // "2026-01"
  reportId?: string;     // If editing an existing report
};
IntergroupReportHistory: { groupId: string; groupName: string };
```

**`IntergroupReportScreen.tsx` layout:**

```
[Header: "GSR Monthly Report — Jan 2026"   [Share PDF]]

[Status badge: DRAFT / SUBMITTED]
[Button: "Generate / Refresh from App Data"]  (calls generateIntergroupReport CF)

[Section: "Group Info"]
  Group Name: ___     Type: AA
  Meeting: Tuesday 7:30 PM at [location]
  GSR Name: ___  (editable TextInput)
  GSR Phone: ___  (editable TextInput)

[Section: "Attendance"]
  Meetings held this month: 4    (editable)
  Average attendance: 13         (editable — pre-filled from meetingInstances)

[Section: "7th Tradition"]
  Total collected: $278.00       (editable — pre-filled from treasury)

[Section: "Sobriety Birthdays"]
  [Chip: John S. — 5 Years]
  [Chip: Maria T. — 1 Year]
  [+ Add manually] (if milestone was in-person only)

[Section: "Current Officers"]
  [Read-only list from servicePositions]
  Secretary: Jane D.
  Treasurer: Bob M.

[Section: "Group Notes"]
  [Multiline TextInput — freeform]

[Footer buttons]
  [Save Draft]   [Share PDF]   [Mark as Submitted]
```

**Add to `GroupOverviewScreen` nav tiles (admin only):**

```tsx
{isCurrentUserAdmin() && (
  <TouchableOpacity
    style={styles.navTile}
    onPress={() =>
      navigation.navigate('IntergroupReportHistory', {groupId, groupName})
    }
    testID="group-overview-gsr-report-tile">
    <View style={[styles.navTileIcon, {backgroundColor: '#E8EAF6'}]}>
      <Icon name="file-chart-outline" size={24} color="#3949AB" />
    </View>
    <Text style={styles.navTileText}>GSR Report</Text>
  </TouchableOpacity>
)}
```

**`IntergroupReportHistoryScreen.tsx` layout:**

```
[Header: "GSR Reports"]
[Button: "Generate New Report for This Month"]

[FlatList — newest first]
  [Row: "January 2026 — SUBMITTED  •  Avg attendance: 13  >"]
  [Row: "December 2025 — DRAFT     •  Not submitted        >"]
```

**PDF export:**

```typescript
// mobile/src/services/reports/IntergroupReportService.ts
export class IntergroupReportService {
  static generateReportHTML(report: IntergroupReportDocument): string {
    // Formatted as a professional letter-style report
    // Header: [Group Name] Monthly Report — [Month Year]
    // Group type, meeting schedule, GSR info
    // Attendance summary table
    // 7th Tradition total
    // Sobriety Birthdays section (names + years)
    // Current Officers table
    // Notes section
    // Footer: "Generated by RecoveryConnect — [date]"
  }
  static async generateAndShare(report: IntergroupReportDocument): Promise<void> {
    // RNHTMLtoPDF.convert → Share.share
  }
}
```

**Effort estimate: 2-3 hours**

---

## Firestore Security Rules

Add to `firestore.rules` for the new collections:

```javascript
// Group Bylaws
match /group_bylaws/{groupId} {
  allow read: if isGroupMember(groupId);
  allow create, update: if false;  // CF only (saveBylawDraft, ratifyBylaws)
  allow delete: if false;

  match /versions/{versionNumber} {
    allow read: if isGroupMember(groupId);
    allow write: if false;  // CF only
  }
}

// Officer Elections
match /group_elections/{electionId} {
  allow read: if isGroupMember(resource.data.groupId);
  allow create: if false;    // CF only (openElection)
  allow update: if false;    // CF only (nominateForElection, castElectionVote, closeElection)
  allow delete: if false;
}

// Meeting Minutes (subcollection of existing business_meetings)
match /business_meetings/{meetingId}/minutes/{docId} {
  // Read: any member of the group this business meeting belongs to
  allow read: if isGroupMember(resource.data.groupId);
  allow write: if false;    // CF only (saveMeetingMinutes, approveMeetingMinutes)
}

// Intergroup Reports
match /intergroup_reports/{reportId} {
  allow read: if isGroupMember(resource.data.groupId);
  allow write: if false;    // CF only (generateIntergroupReport)
}
```

---

## Implementation Order

```
V4.1.1 (Bylaws) → V4.1.2 (Elections) → V4.1.3 (Minutes) → V4.1.4 (Term Dashboard) → V4.1.5 (GSR Report)
```

**Rationale:**

1. **Bylaws first** because it introduces the new pattern of a "singleton per group" Firestore document (`group_bylaws/{groupId}`), which V4.1.3 also uses (`minutes/record`). Getting this pattern right once means the rest follows cleanly. It also has the simplest UI — one read screen, one edit screen.

2. **Elections second** because the schema is self-contained and the UI pattern is already understood from `GroupConscienceScreen`. The `closeElection` CF's winner-assignment step directly writes to `ServicePositionDocument`, proving the integration before minutes and reports need to read from it.

3. **Minutes third** because it's the most UI-intensive task (multi-section form, complex display). By this point all CF and schema patterns are established. Minutes also needs to read from treasury (already exists) and agenda (already exists), making it a good integration test.

4. **Term Dashboard fourth** because it's primarily a query + display task with no new CF. It requires the `termHistory` Firestore trigger, which is a small addition. This is a natural "breath" task after the complexity of minutes.

5. **GSR Report last** because it aggregates data from every other feature built in this plan (bylaws don't contribute to the report, but milestones, treasury, attendance, and service positions all do). It's also the feature most likely to require iteration based on what real GSRs need, so it benefits from being last and having stable data sources.

---

## File Reference

### New Screens

- `mobile/src/screens/homegroup/GroupBylawsScreen.tsx`
- `mobile/src/screens/homegroup/EditBylawsScreen.tsx`
- `mobile/src/screens/homegroup/GroupElectionsScreen.tsx`
- `mobile/src/screens/homegroup/ElectionDetailScreen.tsx`
- `mobile/src/screens/homegroup/MeetingMinutesScreen.tsx`
- `mobile/src/screens/homegroup/EditMeetingMinutesScreen.tsx`
- `mobile/src/screens/homegroup/MinutesArchiveScreen.tsx`
- `mobile/src/screens/homegroup/TermsDashboardScreen.tsx`
- `mobile/src/screens/homegroup/IntergroupReportScreen.tsx`
- `mobile/src/screens/homegroup/IntergroupReportHistoryScreen.tsx`

### New Cloud Functions

- `functions/src/callable/saveBylawDraft.ts`
- `functions/src/callable/ratifyBylaws.ts`
- `functions/src/callable/openElection.ts`
- `functions/src/callable/nominateForElection.ts`
- `functions/src/callable/castElectionVote.ts`
- `functions/src/callable/closeElection.ts`
- `functions/src/callable/saveMeetingMinutes.ts`
- `functions/src/callable/approveMeetingMinutes.ts`
- `functions/src/callable/generateIntergroupReport.ts`

### New Firestore Triggers

- `functions/src/triggers/firestore/onServicePositionWrite.ts`

### New Services

- `mobile/src/services/reports/BylawsReportService.ts`
- `mobile/src/services/reports/MeetingMinutesReportService.ts`
- `mobile/src/services/reports/IntergroupReportService.ts`

### Files Modified

- `mobile/src/types/schema.ts` — new interfaces + `COLLECTION_PATHS` entries
- `mobile/src/types/navigation/index.ts` — new routes in `GroupStackParamList`
- `mobile/src/navigation/GroupStackNavigator.tsx` — register all new screens
- `mobile/src/screens/homegroup/GroupOverviewScreen.tsx` — 3 new nav tiles (Guidelines, Minutes, GSR Report)
- `mobile/src/screens/homegroup/GroupServicePositionsScreen.tsx` — expiring terms banner
- `mobile/src/screens/homegroup/BusinessMeetingDetail.tsx` — "Minutes" button
- `firestore.rules` — security rules for 4 new collections
- `functions/src/index.ts` — export all new CFs and triggers

---

## Effort Estimate Summary

| Task | Min | Max |
|------|-----|-----|
| V4.1.1 Bylaw / Guidelines | 3 hrs | 4 hrs |
| V4.1.2 Officer Elections | 3 hrs | 4 hrs |
| V4.1.3 Business Meeting Minutes | 3 hrs | 4 hrs |
| V4.1.4 Term Tracking Enhancements | 1 hr | 2 hrs |
| V4.1.5 Intergroup / District Report | 2 hrs | 3 hrs |
| **Total** | **12 hrs** | **17 hrs** |
