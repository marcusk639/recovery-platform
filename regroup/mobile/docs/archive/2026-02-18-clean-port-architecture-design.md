# RATS v2: Clean Port Architecture Design

**Date:** 2026-02-18
**Branch:** `v2/clean-architecture` (from `mk/mass-miration`)
**Decision:** Option C — Clean Port (not a rewrite, not continued patchwork refactor)

---

## Context

The codebase has accumulated ~18 phases of migration debt: Redux props-vs-hooks inconsistencies, deprecated embedded data patterns still active in 28+ files, and two incomplete navigation systems running in parallel. The November 2025 analysis recommended continuing the refactor (90% confidence), but that was written under assumptions that no longer apply:

- Real users with revenue pressure → pre-launch, no users
- Human dev team with limited time → primarily AI agents as builders
- Requirements evolving → comprehensive, stable spec now exists

With AI agents as primary builders and a solid spec, a clean port costs less than completing the migration. This document defines the architecture for v2.

---

## 1. Repository Strategy

**New branch:** `v2/clean-architecture` created from `mk/mass-miration` (not `main`), to carry forward the most recent fixes and service migrations.

The old app on `mk/mass-miration` remains intact. No files are deleted from that branch. v2 work is additive — new files replace or supersede old ones, old ones are deleted once replaced.

---

## 2. What Gets Carried Forward vs. Rewritten

### Carry Forward (minimal or no changes)

| Layer | Files | Rationale |
|-------|-------|-----------|
| Services | `src/services/` | Battle-tested Firestore/Firebase logic |
| Entities | `src/entities/ActivityModel.ts`, `WeekSummary.ts` | Clean, modern, typed |
| Hooks | `src/hooks/activity/` | Well-designed Firestore subscriptions |
| Styles | `src/styles/theme.ts` | Color palette, normalize, typography |
| Components | `src/components/` (UI primitives) | Already isolated, no Redux coupling |
| Firebase config | `firebase-setup.ts` | Infrastructure, unchanged |
| Cloud Functions | `functions/` | Backend logic, unchanged |

### Rewrite Clean

| Layer | Why Rewrite |
|-------|-------------|
| Screens (`src/screens/`) | Mixed props-vs-hooks, inconsistent patterns, partial migration throughout |
| Redux store + slices | Multiple slices use class-based patterns, inconsistent async handling |
| Navigation | Two navigator systems exist (`navigators.tsx` + `improved-navigators.tsx`); rewrite as one clean file |
| Entities (legacy) | `Guest.tsx`, `Week.tsx` — embedded data anti-patterns with deprecated fields |

### Style Consistency

All rewritten screens must match existing UX and visual language. Color tokens from `theme.ts` are non-negotiable. Typography scale (normalize) must be used. No new design patterns introduced without explicit approval.

---

## 3. State Management

### Redux Toolkit — 14 Slices

All slices use RTK `createSlice` + `createAsyncThunk`. No class-based reducers. All components connect via `useAppSelector` and `useAppDispatch` hooks — no `connect()` HOC.

| Slice | State Responsibility |
|-------|---------------------|
| `uiSlice` | Loading states, modal visibility, toasts |
| `authSlice` | Auth state, user session, login/logout |
| `themeSlice` | Theme mode, user theme preferences |
| `navigationSlice` | Deep link state, navigation params |
| `userSlice` | Current user profile, preferences |
| `housesSlice` | House list, current house, house metadata |
| `guestsSlice` | Guest list for current house |
| `meetingsSlice` | Meeting search results, check-in state |
| `adminSlice` | Admin-specific data, permissions |
| `chatSlice` | House chat messages, unread counts |
| `setupSlice` | Onboarding / setup wizard state |
| `cacheSlice` | Cached data for offline support |
| `notificationsSlice` | Push notification state, badge count |
| `reportsSlice` | Report data, export state |

### React Query — Firestore Subscriptions

Firestore real-time data (activities, disputes, week summaries) uses React Query + custom hooks, not Redux. These are treated as server state, not client state.

- `useActivities(options)` — activity feed with filtering
- `useWeekSummary(guestId, houseId, weekStart)` — current week stats
- `useWeekSummaryHistory(guestId, houseId, limit)` — historical weeks
- `useDisputedActivities(guestId)` — disputed activity list

---

## 4. Data Model

### Design Principle: No embedded documents that grow unboundedly

The fundamental problem with the legacy model is `Guest` embedding `Week` objects (which embed `Day` objects, which embed activity arrays). This hits Firestore's 1MB document limit as activity history grows.

### 4.1 Core Collections

#### `users`
User profiles. Auth-facing data.
```
users/{userId}
  - id, email, displayName, avatar
  - roles: { houses: { [houseId]: Role } }
  - notificationPreferences
  - createdAt, updatedAt
```

#### `houses`
House configuration. Supports both Traditional and Oxford House types.
```
houses/{houseId}
  - id, name, type: 'traditional' | 'oxford'
  - address (street, city, state, zip, country)
  - lat, lng, geohash, timezone
  - ownerId, adminIds, superAdminIds
  - managerSetupType: 'operator-only' | 'senior-peer' | 'external-managers' | 'democratic'
  - currentCapacity, maximumCapacity
  - subscriptionStatus, stripeAccountId, stripeStatus
  - gender: 'male' | 'female' | 'non-binary' | ''
  - wifi, baths, rating
  - isDemoHouse, certified

  // Traditional only (ignored for Oxford)
  - phases: Phases
  - chores: Chores
  - rentFrequency, monthlyRent, weeklyRent

  // Oxford only (ignored for Traditional)
  - eesAmount: number
  - charterCompliant: boolean
  - currentOfficers: { president, treasurer, secretary, comptroller: string | null }
```

#### `guests`
One document per resident, per house.
```
guests/{guestId}
  - id, userId, houseId
  - displayName, avatar
  - phase: string (Traditional only)
  - moveInDate, moveOutDate
  - status: 'active' | 'inactive' | 'expelled'
  - currentWeekId: string  // e.g. "{guestId}_2026-02-17"
  - currentWeekStartDate: string
  - supporterUserId: string
  - createdAt, updatedAt
```

**No embedded Week or Day objects.** Historical data lives in `activities` and `week-summaries`.

#### `activities`
Append-only log. One document per activity.
```
activities/{activityId}
  - id, guestId, houseId
  - type: ActivityType
  - status: ActivityStatus
  - timestamp: Timestamp
  - loggedAt: Timestamp
  - data: ActivityData  // typed union per ActivityType
```

`ActivityType` enum (carries forward all existing + Oxford House additions):
```typescript
enum ActivityType {
  // Traditional
  CHORE = 'CHORE',
  MEETING = 'MEETING',
  WORK = 'WORK',
  MEDICATION = 'MEDICATION',
  PRIMARY_SUPPORTER = 'PRIMARY_SUPPORTER',

  // Oxford House (gated by house.type === 'oxford')
  BUSINESS_MEETING = 'BUSINESS_MEETING',
  VOTING = 'VOTING',
}
```

#### `week-summaries`
Pre-aggregated stats. Written by Cloud Functions when activities change.
```
week-summaries/{guestId}_{weekStart}
  - id, guestId, houseId
  - startDate, endDate
  - stats: WeekStats
  - dailyStats: { [date]: DailyStats }
  - lastUpdated, activityCount
  - phaseRequirementsMet (Traditional only)
```

Already exists. Carries forward unchanged.

---

### 4.2 Oxford House Collections (defined now, gated in UI)

These collections are defined and schema-typed now. UI features are gated behind `house.type === 'oxford'`. Traditional houses never touch these collections.

#### `officers`
```
officers/{officerId}
  - id, houseId, userId
  - role: 'president' | 'treasurer' | 'secretary' | 'comptroller'
  - termStartDate, termEndDate
  - isActive: boolean
  - electedAt: Timestamp
```

#### `business_meetings`
```
business_meetings/{meetingId}
  - id, houseId
  - scheduledDate, actualDate
  - agenda: AgendaItem[]
  - attendees: string[]  // userId[]
  - quorumMet: boolean
  - minutes: string
  - votes: Vote[]
  - createdBy, createdAt
```

#### `votes`
```
votes/{voteId}
  - id, houseId, meetingId (optional — some votes are async)
  - topic, description
  - type: 'acceptance' | 'expulsion' | 'officer_removal' | 'chore_assignment' | 'general'
  - options: string[]
  - results: { [option]: number }
  - individualVotes: { [userId]: string }  // for record-keeping
  - threshold: number  // e.g. 0.8 for acceptance votes
  - passed: boolean
  - closedAt: Timestamp
```

#### `elections`
```
elections/{electionId}
  - id, houseId
  - role: 'president' | 'treasurer' | 'secretary' | 'comptroller'
  - candidates: { userId: string, nominatedBy: string }[]
  - voteId: string  // references votes collection
  - winnerId: string
  - termStartDate, termEndDate
  - conductedAt: Timestamp
```

#### `ees_transactions`
```
ees_transactions/{txId}
  - id, houseId, guestId
  - amount: number
  - period: string  // 'YYYY-MM-DD' (week start)
  - type: 'payment' | 'adjustment' | 'refund'
  - status: 'pending' | 'paid' | 'overdue'
  - paidAt: Timestamp | null
  - notes: string
```

#### `financial_records`
```
financial_records/{recordId}
  - id, houseId
  - period: string
  - totalIncome, totalExpenses, balance
  - breakdown: { category: string, amount: number }[]
  - submittedBy, submittedAt
  - approvedByVote: boolean
```

---

### 4.3 Roles

```typescript
// Traditional roles (unchanged)
type TraditionalRole = 'admin' | 'superAdmin' | 'guest' | 'supporter' | 'anonymous';

// Oxford House officer roles (stored in `officers` collection, not in user.roles)
type OxfordOfficerRole = 'president' | 'treasurer' | 'secretary' | 'comptroller';

// User.roles remains houses: { [houseId]: TraditionalRole }
// Oxford officer status is derived from officers collection query, not embedded in user
```

---

## 5. Navigation Architecture

One navigator file. One source of truth. `src/navigation/index.tsx`.

### Structure
```
RootNavigator
├── AuthStack (InitialLanding, Login, Signup, NewAccount, HouseSearch, ManagerIntro, IntroHouseSummary, OperatorSetupWizard)
├── SetupStack (OrgSetup, OperatorSetupWizard)
├── MainTab
│   ├── House tab → HouseSummary screen
│   ├── Guest tab → GuestHome screen
│   ├── Activities tab → ActivityScreen
│   ├── Contacts tab → ContactScreen
│   ├── Chat tab → HouseChat
│   └── Personal tab → Personal screen
└── RootStack.Group (modal presentation)
    ├── All detail screens (Beds, Disputes, Issues, Complaints, GuestList, etc.)
    ├── GuestMeetingSummary, GuestWorkSummary, GuestChoreSummary, GuestSupporterSummary
    ├── DirectMessage, EditUserInfo, UserInfo
    ├── HouseSettings, StripeSettings, PhaseSetup, PhaseCustomization
    ├── HouseList, HousesOverview, GuestInvites, MeetingSearch, NewMeeting
    └── SubscriptionHandler
```

No nested stack navigators inside tab screens. All navigation is flat from the root stack group.

---

## 6. Screen Patterns (All Screens)

Every screen follows this pattern — no exceptions:

```typescript
// Hooks for state
const dispatch = useAppDispatch();
const data = useAppSelector(state => state.slice.field);

// No connect() HOC
// No class components
// No prop-drilled Redux state

// Navigation via hook
const navigation = useNavigation<ScreenNavigationProp>();
```

No `as any` casts in navigator screen definitions. Every screen component must satisfy its TypeScript prop types.

---

## 7. Error Handling

All screens wrapped in `ErrorBoundary` at the navigator level (already exists, keep it).

Services throw typed errors. Screens catch via React Query's `error` state or Redux `status: 'failed'` pattern.

No silent catches. No empty `catch` blocks.

---

## 8. Implementation Sequence

1. **Branch + scaffold**: Create `v2/clean-architecture` from `mk/mass-miration`
2. **Entity layer**: Rewrite `Guest.tsx`, `Week.tsx`; add Oxford House entity interfaces
3. **Redux store**: Rewrite all 14 slices clean; delete old reducers
4. **Navigation**: Single navigator file, remove `improved-navigators.tsx` and old `navigators.tsx`
5. **Screens (Traditional)**: Rewrite each screen with `useAppSelector`/`useAppDispatch` pattern
6. **Oxford House (gated)**: UI components gated by `house.type === 'oxford'`; collections defined, features visible only for Oxford houses

---

## 9. What We're NOT Building in v1

- Oxford House full feature set (UI gated, data model defined)
- Web platform (Angular — separate project)
- Financial reporting UI
- Election workflow UI
- Business meeting agenda builder

These are defined in the data model now (to prevent schema migrations) but the UI is out of scope for v1.

---

## Open Questions (Resolved)

| Question | Decision |
|----------|----------|
| Rewrite vs. refactor vs. clean port? | Clean port |
| Same repo or fork? | Same repo, new branch |
| Branch from main or mk/mass-miration? | Branch from mk/mass-miration |
| Oxford House in scope for v1? | Data model yes, UI gated |
| Week collection or skip it? | Skip — use Activities + WeekSummary directly |
| Day collection or skip it? | Skip — embedded in WeekSummary dailyStats |
| connect() HOC allowed? | No — hooks only |
| Nested stack navigators in tabs? | No — flat root stack group |
