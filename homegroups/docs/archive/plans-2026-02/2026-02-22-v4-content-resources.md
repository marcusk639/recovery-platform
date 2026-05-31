---
archived: true
archived_at: 2026-05-25
archived_reason: Plan shipped; tracked DONE in docs/plans/README.md (with PR# or commit ref). Preserved for historical reference.
original_path: docs/plans/2026-02-22-v4-content-resources.md
---

# V4.2 Implementation Plan: Content & Resources

**Goal:** Turn RecoveryConnect into the content hub members reach for every day — not just a group admin tool. Rich, Firestore-backed content means improvements ship without app releases and groups can personalize the experience.

**Theme: "The App That Feeds Your Recovery"**

Members who open an app only when they need to manage their group churn. Members who open it every morning for a reflection, check their sobriety countdown, and browse meeting topics stay forever. V4.2 bets that *content* is the daily-use forcing function — just as V3.5 step work was the deep retention play.

**Architecture:** All new Firestore collections follow established project patterns. New Redux slices use entity adapters. New screens follow the existing navigator structure (`GroupStackNavigator`, `ProfileNavigator`). Cloud Functions use `functions.https.onCall` with `CallableRequest<T>`. The daily reflection trigger follows the `scheduledDailyReflection.ts` pub/sub pattern (Firebase Functions v1 pubsub scheduler).

**Tech Stack:** React Native + TypeScript, Firebase (Firestore, Auth, FCM, Cloud Functions v1 pubsub + v2 callable), Redux Toolkit entity adapters, `@react-native-firebase/functions`, `react-native-share` (already installed).

**Estimated Effort:** ~10-14 hours

---

## Section Overview

| Section | Feature | Effort | Key Value |
|---------|---------|--------|-----------|
| V4.2.1 | Expanded Daily Reflections Library (365 entries, Firestore-backed, group thoughts) | 3-4 hrs | Replaces hardcoded 14-entry array; content updatable without release |
| V4.2.2 | Recovery Literature Index (searchable, member favorites, group bookmarks) | 2-3 hrs | Curated public-domain content; avoids copyrighted AA/NA text |
| V4.2.3 | Meeting Topic Suggestions (secretary picks, member contributions) | 1-2 hrs | Secretary toolkit extension; feeds existing checklist feature |
| V4.2.4 | Sobriety Date Calculator & Milestones Countdown (standalone, shareable) | 2-3 hrs | Accessible without a group; top-of-funnel member hook |
| V4.2.5 | Group Resource Library (admin upload/link, member access) | 2-3 hrs | Admin uploads local intergroup docs, PDFs, group conscience records |

---

## Implementation Order Rationale

```
V4.2.1 → V4.2.4 → V4.2.2 → V4.2.3 → V4.2.5
```

**V4.2.1 first** because it migrates the existing hardcoded `DAILY_REFLECTIONS` array to Firestore and changes the pub/sub trigger. Everything else builds on a live content system. The 14-entry array is already the most-exposed content surface in the app.

**V4.2.4 second** because the sobriety calculator is a standalone screen with zero dependencies on new Firestore schema — it is pure local computation plus a shareable card. Fast win that can ship immediately.

**V4.2.2 and V4.2.3 next** — both introduce new collections and read-only screens. Neither requires CF writes except member favorites/contributions, which are low-risk.

**V4.2.5 last** because it requires Firebase Storage URL handling and admin-only write CFs; it is the most operationally complex and can be phased in after the lighter content features are live.

---

## V4.2.1: Expanded Daily Reflections Library

### Context

The existing `scheduledDailyReflection.ts` pub/sub trigger hardcodes 14 reflections and cycles by `dayOfYear % 14`. There is no screen for reading reflections on demand — users only see them as push notifications. This section:

1. Seeds a `daily_reflections` Firestore collection with 365 unique entries (one per calendar day).
2. Updates the scheduler to read from Firestore instead of the hardcoded array.
3. Adds a `DailyReflectionScreen` where members can read today's reflection (and group-specific daily thoughts posted by admins).
4. Allows admins to post a "Group Daily Thought" — a one-off message appended to that day's reflection for group members.

### Task 1.1: Firestore Schema & Seeding

**Files to create/modify:**
- Create: `functions/src/utils/reflectionsLibrary.ts` — the 365-entry constant array used by both the seed script and the scheduler fallback
- Create: `functions/src/callable/seedDailyReflections.ts` — one-time admin-only CF to seed the collection
- Modify: `mobile/src/types/schema.ts` — add `DailyReflectionDocument` and `GroupDailyThoughtDocument`

**Firestore schema:**

```typescript
/**
 * Daily Reflection Document
 * Collection: daily_reflections
 * Document ID: zero-padded day of year, e.g. "001" through "365"
 */
export interface DailyReflectionDocument {
  dayOfYear: number;       // 1-365
  title: string;
  body: string;            // 2-4 sentence reflection text
  theme?: string;          // e.g. "gratitude" | "service" | "honesty" | "surrender" | "community"
  tags?: string[];         // Optional searchable tags
  source?: string;         // e.g. "public_domain" | "original" — never copyrighted AA/NA text
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Group Daily Thought Document
 * Collection: groups/{groupId}/dailyThoughts
 * Document ID: YYYY-MM-DD (one thought per group per day)
 */
export interface GroupDailyThoughtDocument {
  date: string;            // YYYY-MM-DD
  groupId: string;
  content: string;         // Admin's message for the day, max 500 chars
  authorId: string;
  authorName: string;
  createdAt: Timestamp;
}
```

**`seedDailyReflections` CF:**

```typescript
// functions/src/callable/seedDailyReflections.ts
import { onCall, CallableRequest } from 'firebase-functions/v2/https';

interface SeedInput { force?: boolean }
interface SeedOutput { seeded: number; skipped: number }

export const seedDailyReflections = onCall(
  { cors: true },
  async (request: CallableRequest<SeedInput>): Promise<SeedOutput> => {
    // Auth: must be platform admin (check custom claim `role === 'admin'` from UserDocument)
    // Reads REFLECTIONS_365 from reflectionsLibrary.ts
    // Writes daily_reflections/{dayOfYear padded to 3 digits}
    // If doc already exists and force !== true, skips (idempotent)
    // Returns { seeded: N, skipped: M }
  }
);
```

**`COLLECTION_PATHS` additions** to `schema.ts`:

```typescript
DAILY_REFLECTIONS: 'daily_reflections',
GROUP_DAILY_THOUGHTS: (groupId: string) => `groups/${groupId}/dailyThoughts`,
```

### Task 1.2: Update Scheduler to Read from Firestore

**Files to modify:**
- Modify: `functions/src/triggers/pubsub/scheduledDailyReflection.ts`

**Changes:**

```typescript
// Replace the hardcoded DAILY_REFLECTIONS array usage with:
// 1. Compute dayOfYear as before
// 2. Fetch doc: db.collection('daily_reflections').doc(dayOfYear.toString().padStart(3, '0')).get()
// 3. If doc exists, use its title/body; otherwise fall back to the existing DAILY_REFLECTIONS[dayOfYear % 14] constant
//    (The fallback protects against the collection not yet being seeded in dev/staging)
// 4. Notification data payload: add { type: 'daily_reflection', dayOfYear: String(dayOfYear) }
//    so the client can deep-link to DailyReflectionScreen for that day
```

The `getDayOfYear` and `getReflectionForDay` exported functions remain but `getReflectionForDay` becomes the fallback path only. The scheduler signature does not change.

### Task 1.3: DailyReflectionScreen

**Files to create/modify:**
- Create: `mobile/src/screens/profile/DailyReflectionScreen.tsx`
- Create: `mobile/src/store/slices/reflectionsSlice.ts`
- Modify: `mobile/src/types/navigation/index.ts` — add `DailyReflection` to `ProfileStackParamList`
- Modify: `mobile/src/navigation/ProfileNavigator.tsx` — register route
- Modify: `mobile/src/screens/profile/ProfileScreen.tsx` — add "Today's Reflection" link in the Daily Engagement section (alongside Gratitude Journal, Daily Streak, Step Work)

**Navigation route params:**

```typescript
// In ProfileStackParamList:
DailyReflection: {
  /** ISO date string YYYY-MM-DD; defaults to today if omitted */
  date?: string;
  /** If the user tapped from a push notification, the day of year is passed directly */
  dayOfYear?: number;
} | undefined;
```

**`reflectionsSlice.ts` (no entity adapter needed — simple slice):**

```typescript
// State:
interface ReflectionsState {
  today: DailyReflectionDocument | null;
  groupThought: GroupDailyThoughtDocument | null; // for the current group context
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

// Thunks:
// loadTodayReflection(): fetches daily_reflections/{dayOfYear} from Firestore client-side
// loadGroupDailyThought(groupId: string): fetches groups/{groupId}/dailyThoughts/{YYYY-MM-DD}

// Selectors:
// selectTodayReflection, selectGroupDailyThought, selectReflectionsStatus
```

**Screen layout:**

```
[SafeAreaView]
  [ScrollView]

  [Header card — warm amber/gold tones, full-width]
    [Today's Reflection]
    [Date: Sunday, February 22]

  [Card: Reflection]
    [Title: bold, 20px]
    [Body: 15px, lineHeight 24, generous padding]
    [Theme badge, optional — e.g. "Gratitude"]

  [Card: Group Thought — only shown if group context and admin posted one]
    [Section label: "From Your Group"]
    [Author name + content]
    [Admin: "+ Post a Thought for Today" button — navigates to PostGroupThought]

  [Card: Quick Actions]
    [Open Gratitude Journal]
    [Check In Today]
```

The screen is accessible from:
1. Profile > Daily Engagement section (new row)
2. Tapping the daily reflection push notification (`type: 'daily_reflection'` in data payload)
3. Group Overview admin panel (to post a Group Daily Thought)

### Task 1.4: Post Group Daily Thought (Admin)

**Files to create/modify:**
- Create: `functions/src/callable/postGroupDailyThought.ts`
- Modify: `mobile/src/types/navigation/index.ts` — add `PostGroupDailyThought` to `GroupStackParamList`
- Modify: `mobile/src/navigation/GroupStackNavigator.tsx` — register route
- Add modal or screen: `mobile/src/screens/homegroup/PostGroupDailyThoughtScreen.tsx`

**CF signature:**

```typescript
// functions/src/callable/postGroupDailyThought.ts
import { onCall, CallableRequest } from 'firebase-functions/v2/https';

interface PostThoughtInput {
  groupId: string;
  content: string;   // max 500 chars, validated server-side
  date?: string;     // YYYY-MM-DD; defaults to today UTC
}
interface PostThoughtOutput { thoughtId: string }

export const postGroupDailyThought = onCall(
  { cors: true },
  async (request: CallableRequest<PostThoughtInput>): Promise<PostThoughtOutput> => {
    // Auth: must be admin of groupId (check adminUids or claims)
    // Validates content length <= 500 chars
    // Writes groups/{groupId}/dailyThoughts/{date}
    //   (upsert — admin can edit today's thought by re-calling)
    // Returns { thoughtId: date string used as doc ID }
  }
);
```

**Navigation route params:**

```typescript
// In GroupStackParamList:
PostGroupDailyThought: { groupId: string; groupName: string };
```

**Firestore rules:**

```javascript
match /groups/{groupId}/dailyThoughts/{date} {
  allow read: if isGroupMember(groupId);
  allow create, update: if false; // CF only
  allow delete: if false;
}
```

**Effort estimate: 3-4 hours total for V4.2.1**

---

## V4.2.2: Recovery Literature Index

### Context

A searchable index of publicly available recovery-related text. Strict content policy: no copyrighted AA/NA book text (Big Book, 12&12, etc. are under copyright until 2026-2035 depending on edition). The index contains:

- Public-domain recovery texts (pre-1929 temperance literature, early Washingtonian movement texts)
- Original step study guides written for this app
- Summaries and commentary (fair use)
- User-contributed resources (approved by admins before publishing platform-wide)
- Links to external public-domain sources (no text scraped — only metadata + URL)

Groups can bookmark resources to their group library. Individual members can save favorites to their user profile.

### Task 2.1: Firestore Schema

**Files to modify:**
- Modify: `mobile/src/types/schema.ts` — add `LiteratureIndexDocument`, `GroupLiteratureBookmarkDocument`; extend `UserDocument` with `savedLiteratureIds`

**Note:** `LiteratureItemDocument` already exists in `schema.ts` (for physical literature inventory). The new `LiteratureIndexDocument` is a separate collection for the content index — different purpose.

```typescript
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
  type: 'article' | 'guide' | 'pamphlet' | 'meditation' | 'prayer' | 'external_link';
  source: 'public_domain' | 'original' | 'external_link' | 'contributed';
  program?: 'AA' | 'NA' | 'Al-Anon' | 'general';
  summary: string;           // 1-3 sentences, always present
  fullText?: string;         // Only for original/public_domain content; omitted for external_link
  externalUrl?: string;      // Only for source === 'external_link'
  tags: string[];            // e.g. ["step-work", "gratitude", "service", "step-4"]
  contributedBy?: string;    // userId of contributor if source === 'contributed'
  isApproved: boolean;       // false until platform admin approves contributed items
  saveCount: number;         // Denormalized count of user saves (for popularity sort)
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
  addedBy: string;          // userId of admin who bookmarked it
  addedByName: string;
  addedAt: Timestamp;
  note?: string;            // Optional group note: "We use this for Step 4 study"
}
```

**`UserDocument` addition** (already has `favoriteMeetings?: string[]` — follow same pattern):

```typescript
// Add to UserDocument in schema.ts:
savedLiteratureIds?: string[];  // Array of literature_index document IDs
```

**`COLLECTION_PATHS` additions:**

```typescript
LITERATURE_INDEX: 'literature_index',
GROUP_LITERATURE_BOOKMARKS: (groupId: string) => `groups/${groupId}/literatureBookmarks`,
```

### Task 2.2: Cloud Functions

**Files to create:**
- Create: `functions/src/callable/contributeLiterature.ts`
- Create: `functions/src/callable/saveLiteratureItem.ts`
- Create: `functions/src/callable/bookmarkLiteratureForGroup.ts`

**CF signatures:**

```typescript
// contributeLiterature.ts
// Any authenticated user can contribute; item is created with isApproved: false
interface ContributeLiteratureInput {
  title: string;
  author?: string;
  type: LiteratureIndexDocument['type'];
  summary: string;       // max 500 chars
  externalUrl?: string;  // required if type === 'external_link'
  tags?: string[];
  program?: string;
}
interface ContributeLiteratureOutput { itemId: string }

// saveLiteratureItem.ts
// Adds/removes a literature item from the user's savedLiteratureIds
interface SaveLiteratureInput {
  literatureId: string;
  save: boolean;   // true = add, false = remove
}
interface SaveLiteratureOutput { saved: boolean; newCount: number }
// Uses Firestore arrayUnion/arrayRemove on users/{uid}.savedLiteratureIds
// Uses Firestore increment on literature_index/{literatureId}.saveCount

// bookmarkLiteratureForGroup.ts
// Admin only — bookmarks an item to their group's library
interface BookmarkForGroupInput {
  groupId: string;
  literatureId: string;
  note?: string;
  remove?: boolean;  // true = un-bookmark
}
interface BookmarkForGroupOutput { bookmarked: boolean }
```

### Task 2.3: Redux Slice

**Files to create:**
- Create: `mobile/src/store/slices/literatureSlice.ts`

```typescript
// Entity adapter keyed by id
// State: { items: EntityState<LiteratureIndexDocument>, savedIds: string[], status, searchQuery }
// Thunks:
//   loadLiteratureIndex(options?: { tag?: string; program?: string; searchQuery?: string })
//     → queries literature_index where isApproved == true, limit 50, ordered by saveCount DESC
//   loadSavedLiterature()
//     → reads current user's savedLiteratureIds, fetches those docs
//   loadGroupBookmarks(groupId: string)
//     → fetches groups/{groupId}/literatureBookmarks, then the referenced literature_index docs
//   saveLiterature(literatureId: string, save: boolean) → calls saveLiteratureItem CF
//   bookmarkForGroup(groupId: string, literatureId: string, note?: string) → calls CF

// Selectors:
//   selectAllLiterature, selectSavedLiterature, selectGroupBookmarks(groupId),
//   selectLiteratureById(id), selectLiteratureSearchQuery
```

### Task 2.4: Screens

**Files to create/modify:**
- Create: `mobile/src/screens/profile/LiteratureIndexScreen.tsx`
- Create: `mobile/src/screens/profile/LiteratureDetailScreen.tsx`
- Create: `mobile/src/screens/homegroup/GroupLiteratureBookmarksScreen.tsx`
- Modify: `mobile/src/types/navigation/index.ts` — add routes to `ProfileStackParamList` and `GroupStackParamList`
- Modify: `mobile/src/navigation/ProfileNavigator.tsx` — register `LiteratureIndex`, `LiteratureDetail`
- Modify: `mobile/src/navigation/GroupStackNavigator.tsx` — register `GroupLiteratureBookmarks`
- Modify: `mobile/src/screens/profile/ProfileScreen.tsx` — add "Literature & Resources" row in Daily Engagement section
- Modify: `mobile/src/screens/homegroup/GroupOverviewScreen.tsx` — add "Group Resources" card in the Members section

**Navigation route params:**

```typescript
// In ProfileStackParamList:
LiteratureIndex: undefined;
LiteratureDetail: { literatureId: string };

// In GroupStackParamList:
GroupLiteratureBookmarks: { groupId: string; groupName: string };
```

**`LiteratureIndexScreen` layout:**

```
[Search bar: "Search guides, meditations, step study..."]

[Filter chips]:  All   Step Work   Gratitude   Service   Prayers   Step-N

[FlatList — ordered by saveCount DESC]
Each row:
  [Type badge: Guide / Meditation / External Link]
  [Title]
  [Program badge: AA / NA / General]  [Author, if any]
  [Summary — 2 lines, ellipsis]
  [Tags row]
  [Bookmark icon — filled if saved]   [→ Detail]

[FAB: "+ Contribute Resource"]  → navigates to ContributeLiteratureScreen (modal)
```

**`LiteratureDetailScreen` layout:**

```
[Header: Title + type badge + program badge]
[Author, if present]
[Tags]
[Summary card]
[Full text — ScrollView — only shown if fullText exists]
[External Link button — only shown if externalUrl exists]
[Save / Unsave button]
[Share button — uses React Native Share with the summary + externalUrl or app store link]
[If user is group admin: "Add to Group Library" button]
```

**`GroupLiteratureBookmarksScreen` layout:**

```
[Group name header]
[FlatList of bookmarked items]
Each row: same as LiteratureIndexScreen row + admin note (if any)
[Admin: "Browse Literature to Add" button → LiteratureIndexScreen in group-context mode]
```

**Firestore rules:**

```javascript
match /literature_index/{itemId} {
  allow read: if request.auth != null && resource.data.isApproved == true;
  allow create: if false; // CF only (contributeLiterature)
  allow update, delete: if false;
}
match /groups/{groupId}/literatureBookmarks/{literatureId} {
  allow read: if isGroupMember(groupId);
  allow write: if false; // CF only
}
```

**Effort estimate: 2-3 hours total for V4.2.2**

---

## V4.2.3: Meeting Topic Suggestions

### Context

A library of meeting topic ideas the secretary can browse and pick from when planning a meeting. Topics include discussion starters, step study questions, Big Book chapter themes (no copyrighted text — just chapter titles and theme summaries), and seasonal/holiday recovery themes. Any authenticated member can contribute a suggestion; group admins can pin favorites to their group's topic library.

This extends the existing Secretary Toolkit (V3.3) — the `MeetingChecklistScreen` already has a "Step being studied" field. This section adds a dedicated topic picker.

### Task 3.1: Firestore Schema

**Files to modify:**
- Modify: `mobile/src/types/schema.ts` — add `MeetingTopicDocument`, `GroupTopicFavoriteDocument`

```typescript
/**
 * Meeting Topic Document
 * Collection: meeting_topics
 * Document ID: auto-generated
 */
export interface MeetingTopicDocument {
  id: string;
  title: string;             // e.g. "Surrender and Acceptance"
  description: string;       // 2-4 discussion starter sentences
  category: 'discussion' | 'step_study' | 'big_book_theme' | 'speaker_prompt' | 'seasonal';
  stepNumber?: number;       // 1-12, only for category === 'step_study'
  tags: string[];            // e.g. ["step-1", "powerlessness", "surrender"]
  contributedBy?: string;    // userId — null for platform-seeded topics
  contributorName?: string;
  isApproved: boolean;
  useCount: number;          // Denormalized — incremented when a group uses the topic
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
  usedAt?: Timestamp;        // Last time this was used at a meeting
  useCount: number;          // How many times this group has used this topic
}
```

**`COLLECTION_PATHS` additions:**

```typescript
MEETING_TOPICS: 'meeting_topics',
GROUP_TOPIC_FAVORITES: (groupId: string) => `groups/${groupId}/topicFavorites`,
```

### Task 3.2: Cloud Functions

**Files to create:**
- Create: `functions/src/callable/contributeMeetingTopic.ts`
- Create: `functions/src/callable/favoriteGroupTopic.ts`

**CF signatures:**

```typescript
// contributeMeetingTopic.ts
// Any authenticated user can contribute; isApproved: false until admin review
interface ContributeTopicInput {
  title: string;
  description: string;   // max 400 chars
  category: MeetingTopicDocument['category'];
  stepNumber?: number;
  tags?: string[];
}
interface ContributeTopicOutput { topicId: string }

// favoriteGroupTopic.ts
// Admin or secretary (roles includes 'secretary') only
interface FavoriteTopicInput {
  groupId: string;
  topicId: string;
  remove?: boolean;
}
interface FavoriteTopicOutput { favorited: boolean }
```

### Task 3.3: Screen

**Files to create/modify:**
- Create: `mobile/src/screens/homegroup/MeetingTopicsScreen.tsx`
- Modify: `mobile/src/types/navigation/index.ts` — add `MeetingTopics` to `GroupStackParamList`
- Modify: `mobile/src/navigation/GroupStackNavigator.tsx` — register route
- Modify: `mobile/src/screens/homegroup/SecretaryToolkitScreen.tsx` — add "Browse Meeting Topics" button

**Navigation route params:**

```typescript
// In GroupStackParamList:
MeetingTopics: {
  groupId: string;
  groupName: string;
  /** If provided, tapping a topic pre-fills the meeting checklist or agenda */
  returnToMeetingId?: string;
};
```

**`MeetingTopicsScreen` layout:**

```
[Search bar: "Search topics..."]

[Filter chips]:  All   Discussion   Step Study   Big Book   Speaker   Seasonal
                 (step study: sub-filter 1-12)

[Section: Group Favorites — shown first if group has any]
  [FlatList of favorited topics with "use this" quick action]

[Section: All Topics — sorted by useCount DESC]
  [FlatList]
  Each row:
    [Category badge]   [Step N badge if step_study]
    [Title]
    [Description — 2 lines]
    [Tags]
    [Star / Unfavorite (secretary/admin only)]  [Use This Topic button]

[FAB: "+ Suggest a Topic"]
```

"Use This Topic" increments `useCount` on the topic (via `favoriteGroupTopic` with `usedAt` set), updates the group's `topicFavorites`, and optionally navigates back with the topic title pre-filled in the meeting checklist or agenda title.

**Effort estimate: 1-2 hours total for V4.2.3**

---

## V4.2.4: Sobriety Date Calculator & Milestones Countdown

### Context

A standalone calculator that works without being in a group. Users enter a sobriety date and immediately see:

- Total days sober
- Years + months + days breakdown
- Next chip date (30, 60, 90, 180, 270, 365, then yearly)
- Days until next chip
- A shareable "result card"

The screen reads from `UserDocument.sobrietyStartDate` if the user is logged in and has one set, but also allows manually entering any date for "what if" calculation. It is accessible from the Profile tab without needing a group.

This feature uses the calculation logic already present in `ProfileScreen.tsx` (`calculateSobrietyTime`) and the chip thresholds already defined in V3.1 (`[30, 60, 90, 180, 270, 365]` then yearly).

### Task 4.1: Sobriety Calculator Screen

**Files to create/modify:**
- Create: `mobile/src/screens/profile/SobrietyCalculatorScreen.tsx`
- Create: `mobile/src/utils/sobrietyCalculator.ts` — pure calculation utility (no Firebase, fully testable)
- Modify: `mobile/src/types/navigation/index.ts` — add `SobrietyCalculator` to `ProfileStackParamList`
- Modify: `mobile/src/navigation/ProfileNavigator.tsx` — register route
- Modify: `mobile/src/screens/profile/ProfileScreen.tsx` — add "Sobriety Calculator" row in Daily Engagement section (visible even without a set sobriety date, as it allows manual date entry)

**Navigation route params:**

```typescript
// In ProfileStackParamList:
SobrietyCalculator: {
  /** Pre-populate with this date string (YYYY-MM-DD). Defaults to UserDocument.sobrietyStartDate */
  initialDate?: string;
} | undefined;
```

**`sobrietyCalculator.ts` utility:**

```typescript
// mobile/src/utils/sobrietyCalculator.ts

export interface SobrietyStats {
  totalDays: number;
  years: number;
  months: number;
  days: number;
  nextChipDays: number;       // threshold of the next chip (e.g. 90)
  nextChipDate: Date;         // calendar date when the next chip is earned
  daysUntilNextChip: number;
  pastChips: ChipRecord[];    // all chips already earned based on totalDays
}

export interface ChipRecord {
  days: number;               // threshold
  label: string;              // e.g. "90 Days" or "1 Year"
  earnedDate: Date;
}

export const CHIP_THRESHOLDS = [30, 60, 90, 180, 270, 365];
// After 365, next chip is at 730, 1095, 1460... (multiples of 365)

export function calculateSobrietyStats(sobrietyDate: Date, asOf?: Date): SobrietyStats { ... }
export function formatChipLabel(days: number): string { ... }  // "30 Days" | "1 Year" | "2 Years"
export function getNextChipThreshold(totalDays: number): number { ... }
```

**Screen layout:**

```
[SafeAreaView]
  [ScrollView]

  [Date Input Card]
    [Label: "Sobriety Date"]
    [TouchableOpacity showing selected date → opens DateTimePickerModal]
    [Helper: "Enter your sobriety date to see your stats"]

  [Stats Card — updates live as date changes]
    [Large center display:]
      [NNN]
      [Days Sober]
    [Row: [X years] [X months] [X days]]

  [Next Chip Card]
    [Icon: medal-outline (Ionicons, amber)]
    [Next: "90-Day Chip"]
    [Date: "April 22, 2026"]
    [Countdown: "in 59 days"]

  [Past Chips Card — collapsible]
    [Header: "Chips Earned (N)"]
    [Row for each earned chip: medal icon + label + date earned]

  [Share Card Button]
    ["Share My Progress"]
    → calls react-native-share with result text (no new dependencies needed)

  [Set as My Sobriety Date button — only shown if logged in and date differs from UserDocument.sobrietyStartDate]
    → dispatches updateSobrietyDate thunk (already in authSlice)
```

**Shareable result text (no image capture needed — plain text share):**

```
"I have [NNN] days of recovery today!
Next milestone: [Label] on [Date].
Tracking my journey with RecoveryConnect."
```

Using `react-native-share` (already installed) with `Share.share({ message: text })` — no native image capture required.

**Effort estimate: 2-3 hours total for V4.2.4**

---

## V4.2.5: Group Resource Library

### Context

Admins upload or link resources specific to their group: local intergroup contact sheets, meeting schedule PDFs, group conscience documents, service position handbooks, local hotline numbers. Members access these from the Group Overview screen.

Resources are either:
1. **File uploads** — stored in Firebase Storage under `groups/{groupId}/resources/{resourceId}/{filename}`. Admins upload from the app.
2. **External links** — a URL the admin pastes in (e.g., a Google Doc link, intergroup website).

This avoids the complexity of a full document viewer — for files, the app opens the download URL in the system browser or PDF viewer using `Linking.openURL`.

### Task 5.1: Firestore Schema & Storage

**Files to modify:**
- Modify: `mobile/src/types/schema.ts` — add `GroupResourceDocument`

```typescript
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
  storageRef?: string;       // Firebase Storage path: groups/{groupId}/resources/{id}/{filename}
  downloadUrl?: string;      // Signed/public URL for download
  fileSize?: number;         // bytes
  filename?: string;
  // For source === 'external_link':
  externalUrl?: string;
  uploadedBy: string;        // userId
  uploaderName: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  isActive: boolean;         // false = soft-deleted
}
```

**`COLLECTION_PATHS` addition:**

```typescript
GROUP_RESOURCES: (groupId: string) => `groups/${groupId}/resources`,
```

**Firebase Storage path:** `groups/{groupId}/resources/{resourceId}/{filename}`

File size limit: 10 MB per file, enforced client-side before upload and via Firebase Storage security rules.

### Task 5.2: Cloud Functions

**Files to create:**
- Create: `functions/src/callable/deleteGroupResource.ts`

**Note:** Upload is handled client-side using `@react-native-firebase/storage` (the same pattern as profile photo upload in `ProfileScreen.tsx`) — no CF needed for the upload itself. A CF is only needed for delete (to clean up Storage alongside the Firestore doc).

```typescript
// deleteGroupResource.ts
import { onCall, CallableRequest } from 'firebase-functions/v2/https';

interface DeleteResourceInput {
  groupId: string;
  resourceId: string;
}
interface DeleteResourceOutput { deleted: boolean }

export const deleteGroupResource = onCall(
  { cors: true },
  async (request: CallableRequest<DeleteResourceInput>): Promise<DeleteResourceOutput> => {
    // Auth: must be admin of groupId
    // Fetches groups/{groupId}/resources/{resourceId}
    // If source === 'upload' and storageRef exists: deletes from Firebase Storage
    // Sets isActive: false on the Firestore doc (soft delete — preserves audit trail)
    // Returns { deleted: true }
  }
);
```

### Task 5.3: Redux Slice

**Files to create:**
- Create: `mobile/src/store/slices/groupResourcesSlice.ts`

```typescript
// Entity adapter keyed by id
// State: { resources: EntityState<GroupResourceDocument>, status, uploading: boolean, uploadProgress: number }
// Thunks:
//   loadGroupResources(groupId: string)
//     → queries groups/{groupId}/resources where isActive == true, ordered by createdAt DESC
//   uploadGroupResource(params: { groupId: string; title: string; description?: string; fileUri: string; filename: string })
//     → uploads to Storage, writes Firestore doc, updates slice
//   addGroupResourceLink(params: { groupId: string; title: string; description?: string; url: string; type: GroupResourceDocument['type'] })
//     → writes Firestore doc directly (no Storage)
//   deleteGroupResource(params: { groupId: string; resourceId: string })
//     → calls deleteGroupResource CF, removes from entity state

// Selectors:
//   selectGroupResources(groupId), selectGroupResourcesStatus, selectUploadProgress
```

### Task 5.4: Screens

**Files to create/modify:**
- Create: `mobile/src/screens/homegroup/GroupResourceLibraryScreen.tsx`
- Create: `mobile/src/screens/homegroup/AddGroupResourceScreen.tsx`
- Modify: `mobile/src/types/navigation/index.ts` — add routes to `GroupStackParamList`
- Modify: `mobile/src/navigation/GroupStackNavigator.tsx` — register routes
- Modify: `mobile/src/screens/homegroup/GroupOverviewScreen.tsx` — add "Group Resources" card visible to all members

**Navigation route params:**

```typescript
// In GroupStackParamList:
GroupResourceLibrary: { groupId: string; groupName: string };
AddGroupResource: { groupId: string; groupName: string };
```

**`GroupResourceLibraryScreen` layout:**

```
[Header: "Group Resources"  [Admin: + Add button]]

[FlatList]
Each row:
  [Type icon: document-outline / link-outline / image-outline]
  [Title]
  [Description — 1 line, optional]
  [Uploader name + date]
  [File size badge for uploads]
  [Open button → Linking.openURL(downloadUrl or externalUrl)]
  [Admin: delete button (swipe-to-reveal or long-press menu)]

[Empty state: "No resources yet.
  Admins can upload PDFs, link documents, or add local intergroup contacts."]
```

**`AddGroupResourceScreen` layout:**

```
[Tab bar or segmented control]:  Upload File  |  Add Link

[Upload File tab:]
  [Title field]
  [Description field (optional)]
  [Type picker: PDF / Document / Image / Other]
  [File picker button → react-native-image-picker with MediaType 'mixed', or react-native-document-picker if installed]
  [Upload progress bar — shown during upload]
  [Save button — disabled until file selected]

[Add Link tab:]
  [Title field]
  [Description field (optional)]
  [URL field — validated as URL before save]
  [Type picker: PDF / Document / Link / Other]
  [Save button]
```

**File upload pattern** (matches existing `ProfileScreen.tsx` photo upload):

```typescript
// 1. User picks file via react-native-image-picker or DocumentPicker
// 2. const storageRef = storage().ref(`groups/${groupId}/resources/${resourceId}/${filename}`)
// 3. const task = storageRef.putFile(localUri)
// 4. task.on('state_changed', snap => dispatch(setUploadProgress(snap.bytesTransferred / snap.totalBytes)))
// 5. const downloadUrl = await storageRef.getDownloadURL()
// 6. Write Firestore doc via dispatch(addGroupResource({ ..., downloadUrl, storageRef: storageRef.fullPath }))
```

**Note on document picker:** Check `mobile/package.json` for `react-native-document-picker`. If not installed, fall back to `react-native-image-picker` with `mediaType: 'mixed'` which supports PDF on iOS. This avoids a new native dependency. Add a note in the implementation to check this before building `AddGroupResourceScreen`.

**Firestore rules:**

```javascript
match /groups/{groupId}/resources/{resourceId} {
  allow read: if isGroupMember(groupId) && resource.data.isActive == true;
  allow create: if false; // client writes directly but only after Storage upload
  // Exception: allow direct client writes from admin for link-type resources (no CF needed)
  // A more precise rule:
  allow create: if isGroupAdmin(groupId)
    && request.resource.data.source == 'external_link'
    && request.resource.data.groupId == groupId;
  allow update, delete: if false; // CF only for deletes (soft delete)
}
```

**Firebase Storage rules:**

```javascript
match /groups/{groupId}/resources/{resourceId}/{filename} {
  allow read: if request.auth != null;  // Authenticated users — no group check at storage level
  // (Group membership check is enforced at Firestore read time)
  allow write: if request.auth != null
    && isGroupAdmin(groupId)   // requires custom token claim check or Firestore lookup
    && request.resource.size < 10 * 1024 * 1024;  // 10 MB limit
}
```

**Effort estimate: 2-3 hours total for V4.2.5**

---

## File Reference

### New Screens

| Path | Feature |
|------|---------|
| `mobile/src/screens/profile/DailyReflectionScreen.tsx` | V4.2.1 — today's reflection view |
| `mobile/src/screens/homegroup/PostGroupDailyThoughtScreen.tsx` | V4.2.1 — admin posts group daily thought |
| `mobile/src/screens/profile/LiteratureIndexScreen.tsx` | V4.2.2 — searchable literature list |
| `mobile/src/screens/profile/LiteratureDetailScreen.tsx` | V4.2.2 — full content view |
| `mobile/src/screens/homegroup/GroupLiteratureBookmarksScreen.tsx` | V4.2.2 — group's bookmarked resources |
| `mobile/src/screens/homegroup/MeetingTopicsScreen.tsx` | V4.2.3 — secretary topic picker |
| `mobile/src/screens/profile/SobrietyCalculatorScreen.tsx` | V4.2.4 — calculator + share card |
| `mobile/src/screens/homegroup/GroupResourceLibraryScreen.tsx` | V4.2.5 — member view of group files |
| `mobile/src/screens/homegroup/AddGroupResourceScreen.tsx` | V4.2.5 — admin upload/link form |

### New Cloud Functions

| Path | Purpose |
|------|---------|
| `functions/src/callable/seedDailyReflections.ts` | V4.2.1 — one-time seed of 365 Firestore docs |
| `functions/src/callable/postGroupDailyThought.ts` | V4.2.1 — admin posts group thought |
| `functions/src/callable/contributeLiterature.ts` | V4.2.2 — member contributes resource |
| `functions/src/callable/saveLiteratureItem.ts` | V4.2.2 — user saves/unsaves item |
| `functions/src/callable/bookmarkLiteratureForGroup.ts` | V4.2.2 — admin bookmarks to group |
| `functions/src/callable/contributeMeetingTopic.ts` | V4.2.3 — member suggests topic |
| `functions/src/callable/favoriteGroupTopic.ts` | V4.2.3 — admin/secretary favorites topic |
| `functions/src/callable/deleteGroupResource.ts` | V4.2.5 — soft-delete + Storage cleanup |

### Modified Cloud Functions

| Path | Change |
|------|--------|
| `functions/src/triggers/pubsub/scheduledDailyReflection.ts` | V4.2.1 — read from Firestore instead of hardcoded array; keep array as fallback |

### New Redux Slices

| Path | Feature |
|------|---------|
| `mobile/src/store/slices/reflectionsSlice.ts` | V4.2.1 — today's reflection + group thought |
| `mobile/src/store/slices/literatureSlice.ts` | V4.2.2 — literature index + saves |
| `mobile/src/store/slices/groupResourcesSlice.ts` | V4.2.5 — group file/link library |

### New Utilities

| Path | Purpose |
|------|---------|
| `functions/src/utils/reflectionsLibrary.ts` | V4.2.1 — 365-entry constant array (shared by seed CF and scheduler fallback) |
| `mobile/src/utils/sobrietyCalculator.ts` | V4.2.4 — pure calculation, fully unit-testable |

### Modified Files

| Path | Change |
|------|--------|
| `mobile/src/types/schema.ts` | Add `DailyReflectionDocument`, `GroupDailyThoughtDocument`, `LiteratureIndexDocument`, `GroupLiteratureBookmarkDocument`, `MeetingTopicDocument`, `GroupTopicFavoriteDocument`, `GroupResourceDocument`; add `savedLiteratureIds` to `UserDocument`; add new `COLLECTION_PATHS` entries |
| `mobile/src/types/navigation/index.ts` | Add `DailyReflection`, `PostGroupDailyThought`, `LiteratureIndex`, `LiteratureDetail`, `GroupLiteratureBookmarks`, `MeetingTopics`, `SobrietyCalculator`, `GroupResourceLibrary`, `AddGroupResource` to appropriate param lists |
| `mobile/src/navigation/ProfileNavigator.tsx` | Register `DailyReflection`, `LiteratureIndex`, `LiteratureDetail`, `SobrietyCalculator` |
| `mobile/src/navigation/GroupStackNavigator.tsx` | Register `PostGroupDailyThought`, `GroupLiteratureBookmarks`, `MeetingTopics`, `GroupResourceLibrary`, `AddGroupResource` |
| `mobile/src/screens/profile/ProfileScreen.tsx` | Add rows in Daily Engagement section: "Today's Reflection", "Literature & Resources", "Sobriety Calculator" |
| `mobile/src/screens/homegroup/GroupOverviewScreen.tsx` | Add "Group Resources" card (all members) |
| `mobile/src/screens/homegroup/SecretaryToolkitScreen.tsx` | Add "Browse Meeting Topics" button |
| `functions/src/index.ts` | Export `seedDailyReflections`, `postGroupDailyThought`, `contributeLiterature`, `saveLiteratureItem`, `bookmarkLiteratureForGroup`, `contributeMeetingTopic`, `favoriteGroupTopic`, `deleteGroupResource` |

---

## Notes & Caveats

**Copyright policy for all content features:**
- Do not include any text from the AA Big Book (under copyright until at least 2034 for later editions), the 12&12, the NA Basic Text, or other program literature. These texts are copyrighted.
- The 12 step statements themselves (as used in `StepTrackerScreen.tsx`) are in the public domain as they are the steps themselves, not book text.
- For the literature index: seed only original writing, step-number-indexed discussion questions, or clearly public-domain material.

**`reflectionsLibrary.ts` content guidance:**
Write 365 unique short reflections (2-4 sentences each). Group by theme: Days 1-30 "foundations" (powerlessness, surrender, asking for help), Days 31-90 "early recovery" (steps 1-3, meetings, sponsors), Days 91-180 "step work" (inventory, amends), Days 181-270 "service and community", Days 271-365 "maintenance and growth". Avoid any direct quotes from AA/NA literature. Use general recovery language accessible to all 12-step programs.

**`react-native-document-picker` dependency check:**
Before implementing `AddGroupResourceScreen`, run `cat mobile/package.json | grep document-picker`. If not present, use `react-native-image-picker` with `mediaType: 'mixed'` for the MVP. Document picker can be added later for better UX.

**Seeding strategy for `daily_reflections`:**
Run `seedDailyReflections` once in production after deploying the CF. The scheduler falls back to the hardcoded 14-entry array until the collection is seeded, so there is no downtime window. In development, call it from the Firebase Emulator Suite.

**`saveCount` and `useCount` denormalization:**
Both are written atomically using `FieldValue.increment(1)` / `FieldValue.increment(-1)` inside the respective CFs. No Firestore transactions needed — increment is atomic at the field level.

**Group resource file size:**
10 MB is a practical limit for intergroup schedules and group conscience PDFs. Enforce client-side (check `file.size` before upload) and in Storage rules. The Storage rules `request.resource.size` check fires on upload; the client check gives faster user feedback.
