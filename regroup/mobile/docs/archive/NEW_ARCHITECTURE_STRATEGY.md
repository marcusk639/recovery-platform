# RATS Sober Living App: Activity-Based System Migration Strategy

**Version:** 1.0  
**Date:** November 27, 2025  
**Author:** Migration Planning Team  
**Status:** Planning Phase

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture Comparison](#system-architecture-comparison)
3. [New Paradigm: Event-Sourced Activity System](#new-paradigm)
4. [Data Model Changes](#data-model-changes)
5. [Migration Strategy](#migration-strategy)
6. [Implementation Phases](#implementation-phases)
7. [Risk Assessment & Mitigation](#risk-assessment)
8. [Testing Strategy](#testing-strategy)
9. [Rollback Plan](#rollback-plan)
10. [Post-Migration Optimization](#post-migration)

---

## 1. Executive Summary

### Current Problem

The RATS sober living app currently uses a **hierarchical Week/Day data model** where:

- Guest documents contain nested `currentWeek` and `previousWeek` objects
- Each Week contains 7 Day objects with boolean/numeric stats
- Activities are tracked as state changes within Day objects
- Historical data requires archiving entire Week objects

This approach has become a bottleneck for:

- **Flexible querying**: "Show me all meetings attended in the last month"
- **Real-time analytics**: Calculating trends across arbitrary time periods
- **Dispute resolution**: Modifying past activities requires complex nested updates
- **Scalability**: Each guest carries heavy nested data structures
- **Audit trails**: Determining exactly when an activity occurred during a day

### Proposed Solution

Migrate to an **event-sourced, activity-based system** where:

- Each activity (meeting attended, chore completed, hours worked) is a separate Firestore document
- Activities are immutable records with precise timestamps
- Cached summaries (daily/weekly) provide fast reads
- Historical queries are simple Firestore queries on the activities collection
- Guest documents become lightweight profile data

### Expected Benefits

| Metric                        | Current System                       | New System               | Improvement   |
| ----------------------------- | ------------------------------------ | ------------------------ | ------------- |
| Query flexibility             | Limited to current/previous week     | Any date range           | ∞             |
| Guest document size           | 15-25KB (nested weeks)               | 2-4KB (profile only)     | 80% reduction |
| Historical data access        | Requires separate collection queries | Single collection query  | 3x faster     |
| Dispute resolution complexity | Nested document updates              | Single activity update   | 90% simpler   |
| Real-time analytics           | Requires aggregation of Day objects  | Pre-calculated summaries | 5x faster     |
| Timestamp precision           | Day-level only                       | Second-level             | Perfect       |

### Migration Timeline

**Total Duration:** 8-12 weeks

- **Phase 0:** Preparation & Infrastructure (1-2 weeks)
- **Phase 1:** Dual-Write Implementation (2-3 weeks)
- **Phase 2:** UI Migration (2-3 weeks)
- **Phase 3:** Cloud Functions Migration (1-2 weeks)
- **Phase 4:** Historical Data Migration (1-2 weeks)
- **Phase 5:** Cutover & Cleanup (1 week)

---

## 2. System Architecture Comparison

### 2.1 Current Architecture (Week/Day Paradigm)

```
┌─────────────────────────────────────────────────────────────────┐
│                         Firestore Database                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Collection: guests                                              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Document: {guestId}                                       │  │
│  │ ┌────────────────────────────────────────────────────┐   │  │
│  │ │ firstName: "John"                                   │   │  │
│  │ │ lastName: "Doe"                                     │   │  │
│  │ │ phase: "Phase 1"                                    │   │  │
│  │ │ currentWeek: {                                      │   │  │
│  │ │   startDate: "2025-11-24"                           │   │  │
│  │ │   endDate: "2025-11-30"                             │   │  │
│  │ │   chore: { name: "Kitchen" }                        │   │  │
│  │ │   days: {                                           │   │  │
│  │ │     "2025-11-24": {                                 │   │  │
│  │ │       choreCompleted: false,                        │   │  │
│  │ │       hoursWorked: { "McDonald's": 8 },            │   │  │
│  │ │       meeting: [{ name: "Monday Night", ... }],    │   │  │
│  │ │       metPrimarySupporter: false,                   │   │  │
│  │ │       medication: false                             │   │  │
│  │ │     },                                              │   │  │
│  │ │     "2025-11-25": { ... },                          │   │  │
│  │ │     ... (5 more days)                               │   │  │
│  │ │   }                                                 │   │  │
│  │ │ }                                                   │   │  │
│  │ │ previousWeek: { ... similar structure }            │   │  │
│  │ └────────────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Collection: guest-weeks (archived)                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Document: {weekId}                                        │  │
│  │   - Full Week object from previous weeks                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Collection: guest-reports                                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Document: {reportId}                                      │  │
│  │   - Weekly aggregated stats                              │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**Data Flow - Recording a Meeting:**

```
1. User selects meeting in UI
2. Redux action: updateGuest()
3. Update guest.currentWeek.days[today].meeting array
4. Activities.constructGuestActivities() creates Activity record
5. Push to guest.currentWeek.activities array (legacy)
6. Update entire Guest document in Firestore (15-25KB write)
7. Cloud function may trigger on guest update
```

**Problems:**

- ❌ 15-25KB writes for a single stat update
- ❌ Race conditions when multiple updates happen simultaneously
- ❌ Nested updates are complex and error-prone
- ❌ Cannot efficiently query "all meetings in November"
- ❌ Weekly transfer requires copying entire Week structure
- ❌ Disputes require finding and updating nested Day objects

### 2.2 New Architecture (Activity-Based Paradigm)

```
┌─────────────────────────────────────────────────────────────────┐
│                         Firestore Database                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Collection: guests                                              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Document: {guestId}                                       │  │
│  │ ┌────────────────────────────────────────────────────┐   │  │
│  │ │ firstName: "John"                                   │   │  │
│  │ │ lastName: "Doe"                                     │   │  │
│  │ │ phase: "Phase 1"                                    │   │  │
│  │ │ houseId: "house123"                                 │   │  │
│  │ │ currentChore: "Kitchen"                             │   │  │
│  │ │ primarySupporterId: "supporter456"                  │   │  │
│  │ │ step: 4                                             │   │  │
│  │ │ // NO nested week/day objects                       │   │  │
│  │ └────────────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Collection: activities                                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Document: {activityId}                                    │  │
│  │ ┌────────────────────────────────────────────────────┐   │  │
│  │ │ id: "act_123"                                       │   │  │
│  │ │ residentId: "guest789"                              │   │  │
│  │ │ houseId: "house123"                                 │   │  │
│  │ │ type: "meeting_attended"                            │   │  │
│  │ │ date: "2025-11-27"                                  │   │  │
│  │ │ createdDate: "2025-11-27T19:30:45Z"                 │   │  │
│  │ │ value: true                                         │   │  │
│  │ │ metadata: {                                         │   │  │
│  │ │   meetingName: "Monday Night Group",                │   │  │
│  │ │   meetingLocation: "123 Main St",                   │   │  │
│  │ │   verified: true                                    │   │  │
│  │ │ }                                                   │   │  │
│  │ │ underDispute: 0                                     │   │  │
│  │ │ disputeResult: "none"                               │   │  │
│  │ └────────────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Collection: daily-summaries                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Document: {residentId}_{date}                             │  │
│  │ ┌────────────────────────────────────────────────────┐   │  │
│  │ │ residentId: "guest789"                              │   │  │
│  │ │ date: "2025-11-27"                                  │   │  │
│  │ │ meetingsAttended: 1                                 │   │  │
│  │ │ hoursWorked: 8                                      │   │  │
│  │ │ choresCompleted: 1                                  │   │  │
│  │ │ supporterMet: false                                 │   │  │
│  │ │ medicationsTaken: 1                                 │   │  │
│  │ │ lastUpdated: "2025-11-27T19:30:45Z"                 │   │  │
│  │ └────────────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Collection: weekly-summaries                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Document: {residentId}_{weekStartDate}                    │  │
│  │ ┌────────────────────────────────────────────────────┐   │  │
│  │ │ residentId: "guest789"                              │   │  │
│  │ │ weekStartDate: "2025-11-24"                         │   │  │
│  │ │ weekEndDate: "2025-11-30"                           │   │  │
│  │ │ totalMeetings: 3                                    │   │  │
│  │ │ totalHoursWorked: 32                                │   │  │
│  │ │ totalChoresCompleted: 4                             │   │  │
│  │ │ supporterMeetings: 1                                │   │  │
│  │ │ medicationsTaken: 4                                 │   │  │
│  │ │ healthScore: 85                                     │   │  │
│  │ │ lastUpdated: "2025-11-27T19:30:45Z"                 │   │  │
│  │ └────────────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Collection: guest-reports (unchanged)                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Document: {reportId}                                      │  │
│  │   - Generated from weekly-summaries at week end          │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**Data Flow - Recording a Meeting:**

```
1. User selects meeting in UI
2. Redux action: addActivity()
3. Call EnhancedActivityService.addActivity()
4. Firestore batch write:
   a. Create new Activity document (~1KB)
   b. Update daily-summary (merge, ~500B)
   c. Update weekly-summary (merge, ~500B)
5. Batch commit (total: ~2KB)
6. Redux updates local state from new activity
```

**Advantages:**

- ✅ 2KB writes instead of 15-25KB (92% reduction)
- ✅ Atomic updates prevent race conditions
- ✅ Simple document structure, no nesting
- ✅ Query any date range: `activities.where('date', '>=', start).where('date', '<=', end)`
- ✅ Fast reads from cached summaries
- ✅ Perfect audit trail with exact timestamps
- ✅ Disputes update single activity document
- ✅ No weekly transfer complexity

---

## 3. New Paradigm: Event-Sourced Activity System

### 3.1 Core Principles

#### 3.1.1 Immutable Event Log

Each activity is an **immutable event** that happened at a specific time. Activities are never deleted, only marked as disputed or invalid.

**Why:** Provides complete audit trail, simplifies concurrent updates, enables time-travel queries.

#### 3.1.2 Separation of Write and Read Models (CQRS)

- **Write Model:** Individual activity documents (normalized, detailed)
- **Read Model:** Daily and weekly summary documents (denormalized, optimized for display)

**Why:** Fast writes (small documents), fast reads (pre-aggregated), independent scaling.

#### 3.1.3 Event Sourcing

Current state is derived from the history of events, not stored directly.

**Example:**

```
Question: "How many meetings has guest123 attended this week?"

Old way: guest.currentWeek.days[...].meeting.length (7 iterations)
New way: weekly-summaries/{guest123}_{weekStart}.totalMeetings (1 read)
```

**Why:** Single source of truth, temporal queries, better analytics.

#### 3.1.4 Eventual Consistency

Summaries are updated asynchronously after activities are recorded.

**Why:** Faster perceived performance, better resilience, simpler error handling.

### 3.2 Activity Types

| Type               | Value Type | Metadata                               | Example                                |
| ------------------ | ---------- | -------------------------------------- | -------------------------------------- |
| `meeting_attended` | boolean    | meetingName, meetingLocation, verified | Attended Monday Night AA               |
| `hours_worked`     | number     | jobName, hours, verified               | Worked 8 hours at McDonald's           |
| `chore_completed`  | boolean    | choreName, verified                    | Completed Kitchen chore                |
| `supporter_met`    | boolean    | supporterName                          | Met with sponsor John                  |
| `medication_taken` | boolean    | medicationType                         | Took prescribed medication             |
| `step_work`        | boolean    | stepNumber, notes                      | Completed Step 4 work                  |
| `dispute`          | N/A        | disputeId, reason                      | Activity disputed                      |
| `payment`          | number     | paymentAmount, paymentType             | Paid $500 rent                         |
| `chore_changed`    | N/A        | oldChore, newChore                     | Chore changed from Kitchen to Bathroom |

### 3.3 Summary Documents

#### Daily Summary

**Document ID:** `{residentId}_{date}` (e.g., `guest123_2025-11-27`)

**Purpose:** Quick overview of a single day's activities

**Update Trigger:** Immediately after activity creation/update (batched)

**Read Pattern:** Display daily stats, weekly aggregation

#### Weekly Summary

**Document ID:** `{residentId}_{weekStartDate}` (e.g., `guest123_2025-11-24`)

**Purpose:** Quick overview of week performance, health score calculation

**Update Trigger:**

- Immediately after activity creation/update (incremental)
- Nightly recalculation for accuracy (cloud function)

**Read Pattern:** Display weekly stats, phase requirement checking, reports

**Health Score Calculation:**

```typescript
const phaseRules = house.phases[guest.phase].rules;
const weights = { meetings: 0.25, work: 0.25, chores: 0.25, supporter: 0.25 };

const meetingScore = Math.min(totalMeetings / phaseRules.meetings, 1.0);
const workScore = Math.min(totalHoursWorked / phaseRules.work, 1.0);
const choreScore = totalChoresCompleted / 7; // one per day
const supporterScore = supporterMeetings > 0 ? 1.0 : 0.0;

const healthScore =
  meetingScore * weights.meetings +
  workScore * weights.work +
  choreScore * weights.chores +
  supporterScore * weights.supporter;

return Math.ceil(healthScore * 100); // 0-100
```

### 3.4 Data Consistency Guarantees

| Operation               | Consistency Model       | Reasoning                                      |
| ----------------------- | ----------------------- | ---------------------------------------------- |
| Activity creation       | Strong (batch write)    | Must update activity + summaries atomically    |
| Activity dispute        | Strong (transaction)    | Must update activity + recalculate summaries   |
| Summary reads           | Eventual (cached)       | Slight delay acceptable for performance        |
| Historical queries      | Strong                  | Reading immutable data                         |
| Phase requirement check | Eventual (from summary) | Cached data sufficient, refreshed on page load |

---

## 4. Data Model Changes

### 4.1 Guest Entity Changes

#### Remove (Breaking Changes)

```typescript
// REMOVE these fields:
currentWeek: Week;
previousWeek: Week;
nextWeek: Week;
```

#### Add (New Fields)

```typescript
// ADD these fields to Guest document:
currentChore: string;              // e.g., "Kitchen"
primarySupporterId: string;        // Current sponsor
primarySupporterName: string;      // Display name
sponsees: string[];                // Guest IDs of people they sponsor
step: number | string;             // Current step (1-12)
```

**Reasoning:** These fields were previously nested in `currentWeek` but are guest-level properties that persist across weeks. They belong on the guest profile, not in temporal data.

#### Before/After Comparison

**Before:**

```typescript
const guest = {
  id: 'guest123',
  firstName: 'John',
  lastName: 'Doe',
  houseId: 'house456',
  currentWeek: {
    startDate: '2025-11-24',
    endDate: '2025-11-30',
    chore: { name: 'Kitchen', description: '...' },
    primarySupporterId: 'supporter789',
    primarySupporterName: 'Mike Smith',
    step: 4,
    days: {
      /* 7 day objects */
    },
  },
  // ... other fields
};

// Document size: ~18KB
// To check chore: guest.currentWeek.chore.name
// To update sponsor: update guest.currentWeek.primarySupporterId + update previous week + create new week at week boundary
```

**After:**

```typescript
const guest = {
  id: 'guest123',
  firstName: 'John',
  lastName: 'Doe',
  houseId: 'house456',
  currentChore: 'Kitchen',
  primarySupporterId: 'supporter789',
  primarySupporterName: 'Mike Smith',
  sponsees: ['guest111', 'guest222'],
  step: 4,
  // ... other fields (NO nested week data)
};

// Document size: ~3KB
// To check chore: guest.currentChore
// To update sponsor: update guest.primarySupporterId (single field update)
```

### 4.2 New Collections

#### Collection: `activities`

**Purpose:** Event log of all guest activities

**Document Structure:**

```typescript
{
  id: string; // Auto-generated
  residentId: string; // Foreign key to guests
  houseId: string; // Foreign key to houses
  type: ActivityType; // Enum of activity types
  date: string; // YYYY-MM-DD format
  createdDate: string; // ISO 8601 timestamp
  updatedDate: string; // ISO 8601 timestamp
  value: number | boolean; // Activity value (hours, true/false)
  metadata: ActivityMetadata; // Type-specific data
  underDispute: number; // Count of active disputes
  disputeResult: 'none' | 'success' | 'fail';
  disputeId: string; // Reference to dispute document
}
```

**Indexes Required:**

```javascript
// Composite indexes for common queries
activities: [
  { fields: ['residentId', 'date'], order: 'desc' },
  { fields: ['residentId', 'type', 'date'], order: 'desc' },
  { fields: ['houseId', 'date'], order: 'desc' },
  { fields: ['houseId', 'type', 'date'], order: 'desc' },
  { fields: ['residentId', 'date', 'type'], order: 'asc' },
];
```

**Security Rules:**

```javascript
match /activities/{activityId} {
  // Guests can read their own activities
  allow read: if isGuest(resource.data.residentId);

  // House admins can read all house activities
  allow read: if isHouseAdmin(resource.data.houseId);

  // Only authenticated users can create (validated server-side)
  allow create: if request.auth != null;

  // Only admins can update (for disputes)
  allow update: if isHouseAdmin(resource.data.houseId);

  // No deletes (immutable event log)
  allow delete: if false;
}
```

**Estimated Size:** ~1KB per activity
**Estimated Count:** ~50 activities per guest per week = 2,600/year/guest
**Storage:** ~2.6MB per guest per year

#### Collection: `daily-summaries`

**Purpose:** Cached daily aggregates for fast reads

**Document ID:** `{residentId}_{date}` (e.g., `guest123_2025-11-27`)

**Document Structure:**

```typescript
{
  id: string; // Same as document ID
  residentId: string;
  date: string; // YYYY-MM-DD
  meetingsAttended: number;
  hoursWorked: number;
  choresCompleted: number;
  supporterMet: boolean;
  medicationsTaken: number;
  lastUpdated: string; // ISO 8601 timestamp
}
```

**Indexes Required:**

```javascript
daily-summaries: [
  { fields: ["residentId", "date"], order: "desc" }
]
```

**Security Rules:**

```javascript
match /daily-summaries/{summaryId} {
  allow read: if isGuest(resource.data.residentId)
              || isHouseAdmin(getGuestHouse(resource.data.residentId));
  allow write: if false; // Only server can write
}
```

**Update Strategy:** Incremental merge on activity creation, full recalculation on dispute resolution

**Estimated Size:** ~500B per day
**Estimated Count:** 365 per guest per year
**Storage:** ~180KB per guest per year

#### Collection: `weekly-summaries`

**Purpose:** Cached weekly aggregates and health scores

**Document ID:** `{residentId}_{weekStartDate}` (e.g., `guest123_2025-11-24`)

**Document Structure:**

```typescript
{
  id: string;
  residentId: string;
  weekStartDate: string; // YYYY-MM-DD (Sunday)
  weekEndDate: string; // YYYY-MM-DD (Saturday)
  totalMeetings: number;
  totalHoursWorked: number;
  totalChoresCompleted: number;
  supporterMeetings: number;
  medicationsTaken: number;
  healthScore: number; // 0-100, calculated from phase rules
  lastUpdated: string;
}
```

**Indexes Required:**

```javascript
weekly-summaries: [
  { fields: ["residentId", "weekStartDate"], order: "desc" }
]
```

**Security Rules:**

```javascript
match /weekly-summaries/{summaryId} {
  allow read: if isGuest(resource.data.residentId)
              || isHouseAdmin(getGuestHouse(resource.data.residentId));
  allow write: if false; // Only server can write
}
```

**Update Strategy:**

- Incremental on activity creation (add to totals)
- Full recalculation on dispute resolution
- Nightly recalculation for accuracy (scheduled function)

**Estimated Size:** ~600B per week
**Estimated Count:** 52 per guest per year
**Storage:** ~31KB per guest per year

### 4.3 Modified Collections

#### Collection: `guest-reports`

**Changes:** Constructor now accepts stats object instead of Week object

**Before:**

```typescript
constructor(week: Week) {
  this.guestId = week.guestId;
  this.hoursWorked = sumStat(week, 'hoursWorked');
  // ... calculated from week.days
}
```

**After:**

```typescript
constructor(
  guestId: string,
  startDate: string,
  endDate: string,
  stats: WeeklySummary
) {
  this.guestId = guestId;
  this.hoursWorked = stats.totalHoursWorked;
  // ... from pre-calculated summary
}
```

#### Collection: `guest-weeks` (Deprecated)

**Status:** Read-only, kept for historical data

**Migration:** Historical weeks will be converted to activities during migration, but original documents preserved for rollback

---

## 5. Migration Strategy

### 5.1 Overall Approach: Dual-Write Pattern

We will use a **dual-write pattern** during migration:

1. **Phase 1:** Write to both old (Week/Day) and new (Activity) systems
2. **Phase 2:** Read from new system, verify against old system
3. **Phase 3:** Read only from new system
4. **Phase 4:** Stop writing to old system
5. **Phase 5:** Deprecate old system

**Reasoning:** This approach minimizes risk by:

- ✅ Allowing rollback at any time
- ✅ Enabling gradual migration of UI components
- ✅ Providing data verification during transition
- ✅ No downtime required
- ✅ Beta testing with subset of users

### 5.2 Feature Flags

All migration phases will be controlled by feature flags:

```typescript
// Feature flags in Firebase Remote Config
const migrationFlags = {
  // Phase 1: Enable activity writes
  enableActivityWrites: boolean;          // Default: false

  // Phase 2: UI components reading from activities
  readActivitiesInStatSummary: boolean;   // Default: false
  readActivitiesInProfile: boolean;       // Default: false
  readActivitiesInReports: boolean;       // Default: false

  // Phase 3: Cloud functions using activities
  weeklyTransferUsesActivities: boolean;  // Default: false
  disputesUseActivities: boolean;         // Default: false
  healthCalcUsesActivities: boolean;      // Default: false

  // Phase 4: Stop writing to old system
  disableWeekDayWrites: boolean;          // Default: false

  // Phase 5: Cleanup
  hideWeekDayData: boolean;               // Default: false

  // Rollback flag (emergency use)
  forceUseOldSystem: boolean;             // Default: false
};
```

### 5.3 User Segmentation

Migration will roll out to user segments:

1. **Internal Testing** (1 test house): Developers and test accounts
2. **Beta Houses** (3-5 houses): Friendly houses that provide feedback
3. **Gradual Rollout** (10% → 25% → 50% → 100%)

```typescript
// Determine if house uses new system
function shouldUseNewSystem(house: House): boolean {
  // Emergency rollback
  if (migrationFlags.forceUseOldSystem) return false;

  // Internal testing
  if (house.id === 'test-house-id') return true;

  // Beta houses
  if (betaHouseIds.includes(house.id)) return true;

  // Gradual rollout based on hash
  const hash = hashCode(house.id);
  const bucket = hash % 100;

  if (currentRolloutPercentage >= bucket) {
    return true;
  }

  return false;
}
```

---

## 6. Implementation Phases

### Phase 0: Preparation & Infrastructure (1-2 weeks)

#### Objectives

- Set up new Firestore collections
- Create Activity entity and services
- Implement feature flag system
- Set up monitoring and logging

#### Tasks

**0.1: Create New Entities (3 days)**

Files to create:

- `src/entities/Activity.tsx` (client)
- `functions/src/entities/Activity.ts` (cloud functions)
- Update type definitions

```typescript
// Example: src/entities/Activity.tsx
export type ActivityType =
  | 'meeting_attended'
  | 'hours_worked'
  | 'chore_completed'
  | 'supporter_met'
  | 'medication_taken';
// ... other types

export interface ActivityMetadata {
  meetingName?: string;
  meetingLocation?: string;
  jobName?: string;
  hours?: number;
  // ... other metadata
}

export class Activity extends BaseEntity {
  id: string = uuid.v4();
  residentId: string = '';
  houseId: string = '';
  type: ActivityType;
  date: string = getTodaysDate();
  value: number | boolean = true;
  metadata: ActivityMetadata = {};
  underDispute: number = 0;
  disputeResult: 'none' | 'success' | 'fail' = 'none';
  disputeId: string = '';
  createdDate: string = getCurrentTime();
  updatedDate: string = getCurrentTime();

  constructor(/* ... */) {
    super();
    // initialization
  }
}
```

**0.2: Create Service Layer (4 days)**

Files to create:

- `src/services/EnhancedActivityService.ts`
- `src/services/activity.ts` (if not exists)

```typescript
// Key methods to implement:
class EnhancedActivityService {
  static async addActivity(data: ActivityData): Promise<Activity>;
  static async getActivities(
    residentId: string,
    options: QueryOptions,
  ): Promise<Activity[]>;
  static async getDailySummary(
    residentId: string,
    date: string,
  ): Promise<DailyActivitySummary>;
  static async getWeeklySummary(
    residentId: string,
    weekStart: string,
  ): Promise<WeeklyActivitySummary>;
  static async updateActivity(
    activityId: string,
    updates: Partial<Activity>,
  ): Promise<void>;
  static async recalculateSummaries(
    residentId: string,
    date: string,
  ): Promise<void>;
}
```

**0.3: Set Up Firestore Collections & Indexes (2 days)**

Create collections in Firebase Console:

```
activities/
daily-summaries/
weekly-summaries/
```

Create composite indexes:

```javascript
// firestore.indexes.json
{
  "indexes": [
    {
      "collectionGroup": "activities",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "residentId", "order": "ASCENDING" },
        { "fieldPath": "date", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "activities",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "residentId", "order": "ASCENDING" },
        { "fieldPath": "type", "order": "ASCENDING" },
        { "fieldPath": "date", "order": "DESCENDING" }
      ]
    },
    // ... more indexes
  ]
}
```

Deploy indexes:

```bash
firebase deploy --only firestore:indexes
```

**0.4: Set Up Security Rules (1 day)**

Update `firestore.rules`:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helper functions
    function isAuthenticated() {
      return request.auth != null;
    }

    function isGuest(guestId) {
      return isAuthenticated() &&
             request.auth.uid == get(/databases/$(database)/documents/guests/$(guestId)).data.userId;
    }

    function isHouseAdmin(houseId) {
      return isAuthenticated() &&
             request.auth.token.admin != null &&
             houseId in request.auth.token.admin;
    }

    // Activities rules
    match /activities/{activityId} {
      allow read: if isAuthenticated() && (
        isGuest(resource.data.residentId) ||
        isHouseAdmin(resource.data.houseId)
      );

      allow create: if isAuthenticated();
      allow update: if isHouseAdmin(resource.data.houseId);
      allow delete: if false; // Immutable
    }

    // Summaries rules (read-only for clients)
    match /daily-summaries/{summaryId} {
      allow read: if isAuthenticated();
      allow write: if false;
    }

    match /weekly-summaries/{summaryId} {
      allow read: if isAuthenticated();
      allow write: if false;
    }
  }
}
```

**0.5: Implement Feature Flags (2 days)**

Set up Firebase Remote Config:

```typescript
// src/services/featureFlags.ts
import { remoteConfig } from '../../firebase-setup';

class FeatureFlags {
  private static instance: FeatureFlags;
  private flags: Map<string, boolean> = new Map();

  static getInstance(): FeatureFlags {
    if (!FeatureFlags.instance) {
      FeatureFlags.instance = new FeatureFlags();
    }
    return FeatureFlags.instance;
  }

  async initialize() {
    await remoteConfig.fetchAndActivate();
    this.refreshFlags();
  }

  private refreshFlags() {
    this.flags.set(
      'enableActivityWrites',
      remoteConfig.getBoolean('enableActivityWrites'),
    );
    this.flags.set(
      'readActivitiesInStatSummary',
      remoteConfig.getBoolean('readActivitiesInStatSummary'),
    );
    // ... other flags
  }

  isEnabled(flag: string): boolean {
    return this.flags.get(flag) ?? false;
  }
}

export const featureFlags = FeatureFlags.getInstance();
```

**0.6: Set Up Monitoring (2 days)**

Implement logging and analytics:

```typescript
// src/services/migrationAnalytics.ts
export class MigrationAnalytics {
  static logDualWriteSuccess(type: 'activity' | 'week') {
    analytics.logEvent('migration_dual_write_success', { type });
  }

  static logDualWriteFailure(type: 'activity' | 'week', error: Error) {
    analytics.logEvent('migration_dual_write_failure', {
      type,
      error: error.message,
    });
  }

  static logDataMismatch(component: string, details: any) {
    analytics.logEvent('migration_data_mismatch', {
      component,
      details: JSON.stringify(details),
    });
  }

  static logPerformanceMetric(operation: string, duration: number) {
    analytics.logEvent('migration_performance', {
      operation,
      duration,
    });
  }
}
```

#### Success Criteria

- ✅ All new collections created and indexed
- ✅ Security rules deployed and tested
- ✅ Activity services pass unit tests
- ✅ Feature flag system operational
- ✅ Monitoring dashboard shows metrics
- ✅ No impact on production (no writes yet)

#### Rollback Plan

Complete rollback possible: simply don't enable feature flags. No production code changed yet.

---

### Phase 1: Dual-Write Implementation (2-3 weeks)

#### Objectives

- Write to both old and new systems simultaneously
- Verify data consistency
- No changes to read paths yet

#### Tasks

**1.1: Implement Dual-Write Service (5 days)**

Create wrapper service that writes to both systems:

```typescript
// src/services/dualWriteService.ts
export class DualWriteService {
  /**
   * Updates guest stats in both old (Week/Day) and new (Activity) systems
   */
  static async updateGuestActivity(
    guest: Guest,
    updatedGuest: Partial<Guest>,
    activityType: ActivityType,
    value: number | boolean,
    metadata: ActivityMetadata,
    date?: string,
  ): Promise<{ oldSystem: boolean; newSystem: boolean }> {
    const results = { oldSystem: false, newSystem: false };

    // ALWAYS write to old system (safety)
    try {
      await this.writeToOldSystem(guest, updatedGuest);
      results.oldSystem = true;
      MigrationAnalytics.logDualWriteSuccess('week');
    } catch (error) {
      console.error('[DualWrite] Old system write failed:', error);
      MigrationAnalytics.logDualWriteFailure('week', error);
      // Don't throw - continue to new system
    }

    // Conditionally write to new system (feature flag)
    if (featureFlags.isEnabled('enableActivityWrites')) {
      try {
        await this.writeToNewSystem(
          guest.id,
          guest.houseId,
          activityType,
          value,
          metadata,
          date,
        );
        results.newSystem = true;
        MigrationAnalytics.logDualWriteSuccess('activity');
      } catch (error) {
        console.error('[DualWrite] New system write failed:', error);
        MigrationAnalytics.logDualWriteFailure('activity', error);
        // Continue - old system write succeeded
      }
    }

    return results;
  }

  private static async writeToOldSystem(
    guest: Guest,
    updatedGuest: Partial<Guest>,
  ): Promise<void> {
    // Existing logic: update guest.currentWeek.days[date]
    Activities.constructGuestActivities(guest, updatedGuest);
    await guestService.updateGuest(guest, updatedGuest, false); // activity=false to avoid recursion
  }

  private static async writeToNewSystem(
    residentId: string,
    houseId: string,
    type: ActivityType,
    value: number | boolean,
    metadata: ActivityMetadata,
    date?: string,
  ): Promise<Activity> {
    return await EnhancedActivityService.addActivity({
      residentId,
      houseId,
      type,
      value,
      metadata,
      date,
    });
  }
}
```

**1.2: Update Guest Update Flow (3 days)**

Modify existing stat update functions to use dual-write:

```typescript
// src/store/actions/guests.tsx

// BEFORE:
export const updateGuest =
  (updatedGuest: Partial<Guest>) => async (dispatch, getState) => {
    dispatch({ type: actionTypes.UPDATING_GUEST });
    try {
      const guest = getState().guests.guests[updatedGuest.id];
      const updated = await guestService.updateGuest(guest, updatedGuest, true);
      dispatch({ type: actionTypes.UPDATING_GUEST_SUCCEEDED, guest: updated });
    } catch (error) {
      dispatch({ type: actionTypes.UPDATING_GUEST_FAILED, error });
    }
  };

// AFTER:
export const updateGuest =
  (updatedGuest: Partial<Guest>) => async (dispatch, getState) => {
    dispatch({ type: actionTypes.UPDATING_GUEST });
    try {
      const guest = getState().guests.guests[updatedGuest.id];

      // Dual-write: update both systems
      const updated = await guestService.updateGuest(guest, updatedGuest, true);
      dispatch({ type: actionTypes.UPDATING_GUEST_SUCCEEDED, guest: updated });

      // Note: Activity writes happen inside guestService.updateGuest via DualWriteService
    } catch (error) {
      dispatch({ type: actionTypes.UPDATING_GUEST_FAILED, error });
    }
  };
```

**1.3: Update Specific Stat Updates (4 days)**

Identify and update all places where stats are recorded:

Files to update:

- `src/screens/StatUpdates/MeetingSearch.tsx` - Meeting attendance
- `src/screens/StatUpdates/WorkHoursUpdate.tsx` - Work hours
- `src/screens/StatUpdates/ChoreUpdate.tsx` - Chore completion
- `src/screens/Profile/ProfileUpdate.tsx` - Supporter meetings
- `src/screens/StatUpdates/MedicationUpdate.tsx` - Medications

Example for meeting attendance:

```typescript
// src/screens/StatUpdates/MeetingSearch.tsx

// BEFORE:
const recordMeeting = async (meeting: RatsMeeting) => {
  const updatedGuest = _.cloneDeep(guest);
  updatedGuest.currentWeek.days[getTodaysDate()].meeting.push(meeting);
  await updateGuest(updatedGuest);
};

// AFTER:
const recordMeeting = async (meeting: RatsMeeting) => {
  // Still update old system for backward compatibility
  const updatedGuest = _.cloneDeep(guest);
  updatedGuest.currentWeek.days[getTodaysDate()].meeting.push(meeting);

  // Dual-write will handle writing to both systems
  await DualWriteService.updateGuestActivity(
    guest,
    updatedGuest,
    'meeting_attended',
    true,
    {
      meetingName: meeting.name,
      meetingLocation: meeting.street || meeting.Location?.[0],
      verified: meeting.verified,
    },
  );

  // Update Redux state with old system data
  await updateGuest(updatedGuest);
};
```

**1.4: Implement Data Verification (3 days)**

Create background process to verify consistency:

```typescript
// src/services/dataVerification.ts
export class DataVerificationService {
  /**
   * Compares data between old and new systems
   * Logs mismatches for investigation
   */
  static async verifyWeekData(
    guest: Guest,
    weekStartDate: string
  ): Promise<VerificationResult> {
    const oldSystemStats = this.calculateStatsFromWeek(guest.currentWeek);

    const newSystemStats = await this.calculateStatsFromActivities(
      guest.id,
      weekStartDate
    );

    const mismatches = this.compareStats(oldSystemStats, newSystemStats);

    if (mismatches.length > 0) {
      MigrationAnalytics.logDataMismatch('week_verification', {
        guestId: guest.id,
        weekStart: weekStartDate,
        mismatches
      });
    }

    return {
      consistent: mismatches.length === 0,
      mismatches,
      oldSystem: oldSystemStats,
      newSystem: newSystemStats
    };
  }

  private static calculateStatsFromWeek(week: Week) {
    return {
      meetings: sumStat(week, 'meeting'),
      hoursWorked: sumStat(week, 'hoursWorked'),
      choresCompleted: sumStat(week, 'choreCompleted'),
      metSupporter: sumStat(week, 'metPrimarySupporter') > 0
    };
  }

  private static async calculateStatsFromActivities(
    residentId: string,
    weekStart: string
  ) {
    const summary = await EnhancedActivityService.getWeeklySummary(
      residentId,
      weekStart
    );

    return {
      meetings: summary.totalMeetings,
      hoursWorked: summary.totalHoursWorked,
      choresCompleted: summary.totalChoresCompleted,
      metSupporter: summary.supporterMeetings > 0
    };
  }

  private static compareStats(old: any, new: any) {
    const mismatches = [];

    if (old.meetings !== new.meetings) {
      mismatches.push({
        field: 'meetings',
        old: old.meetings,
        new: new.meetings
      });
    }

    // ... compare other fields

    return mismatches;
  }
}
```

**1.5: Beta Testing (5 days)**

1. Enable `enableActivityWrites` for internal test house
2. Perform manual testing of all stat recording flows
3. Verify data consistency daily
4. Monitor error rates and performance
5. Expand to 3-5 beta houses if successful

**Testing Checklist:**

- [ ] Record meeting attendance
- [ ] Update work hours
- [ ] Complete chore
- [ ] Meet with supporter
- [ ] Take medication
- [ ] Change chore assignment
- [ ] Initiate dispute
- [ ] Verify all data appears correctly in both systems
- [ ] Check that summaries are updating
- [ ] Verify performance is acceptable

#### Success Criteria

- ✅ 100% of writes go to old system (backward compatibility)
- ✅ 95%+ of writes go to new system when flag enabled
- ✅ < 1% data mismatch rate between systems
- ✅ No performance degradation (< 100ms additional latency)
- ✅ Zero production incidents from dual-write
- ✅ Beta houses reporting normal functionality

#### Monitoring Metrics

```
- dual_write_success_rate (target: > 95%)
- dual_write_latency (target: < 100ms)
- data_consistency_rate (target: > 99%)
- error_rate (target: < 0.1%)
- user_reported_issues (target: 0)
```

#### Rollback Plan

1. Disable `enableActivityWrites` feature flag
2. System reverts to writing only to old system
3. Clean up any orphaned activity documents (optional)
4. No data loss - all data still in old system

**Rollback Trigger Conditions:**

- Data mismatch rate > 5%
- Error rate > 1%
- Performance degradation > 200ms
- Multiple user reports of data issues

---

### Phase 2: UI Migration (2-3 weeks)

#### Objectives

- Update UI components to read from new system
- Verify data display matches old system
- Gradual rollout with feature flags

#### Tasks

**2.1: Update Redux State Management (5 days)**

Create new Redux actions and reducers for activities:

```typescript
// src/store/actions/activities.ts
export const getGuestActivities =
  (guestId: string, startDate?: string, endDate?: string) => async dispatch => {
    dispatch({ type: actionTypes.REQUESTING_ACTIVITIES });
    try {
      const activities = await EnhancedActivityService.getActivities(guestId, {
        startDate,
        endDate,
      });

      dispatch({
        type: actionTypes.REQUESTING_ACTIVITIES_SUCCEEDED,
        activities,
        guestId,
      });
    } catch (error) {
      dispatch({
        type: actionTypes.REQUESTING_ACTIVITIES_FAILED,
        error,
      });
    }
  };

export const getWeeklySummary =
  (guestId: string, weekStartDate: string) => async dispatch => {
    dispatch({ type: actionTypes.REQUESTING_WEEKLY_SUMMARY });
    try {
      const summary = await EnhancedActivityService.getWeeklySummary(
        guestId,
        weekStartDate,
      );

      dispatch({
        type: actionTypes.REQUESTING_WEEKLY_SUMMARY_SUCCEEDED,
        summary,
        guestId,
        weekStartDate,
      });
    } catch (error) {
      dispatch({
        type: actionTypes.REQUESTING_WEEKLY_SUMMARY_FAILED,
        error,
      });
    }
  };
```

```typescript
// src/store/reducers/activities.tsx
export interface ActivitiesState {
  activities: { [guestId: string]: Activity[] };
  dailySummaries: { [key: string]: DailyActivitySummary }; // key: `${guestId}_${date}`
  weeklySummaries: { [key: string]: WeeklyActivitySummary }; // key: `${guestId}_${weekStart}`
  loading: boolean;
  error: any;
}

const initialState: ActivitiesState = {
  activities: {},
  dailySummaries: {},
  weeklySummaries: {},
  loading: false,
  error: null,
};

export default function activitiesReducer(
  state = initialState,
  action: any,
): ActivitiesState {
  switch (action.type) {
    case actionTypes.REQUESTING_ACTIVITIES_SUCCEEDED:
      return {
        ...state,
        activities: {
          ...state.activities,
          [action.guestId]: action.activities,
        },
        loading: false,
      };

    case actionTypes.REQUESTING_WEEKLY_SUMMARY_SUCCEEDED:
      const key = `${action.guestId}_${action.weekStartDate}`;
      return {
        ...state,
        weeklySummaries: {
          ...state.weeklySummaries,
          [key]: action.summary,
        },
        loading: false,
      };

    // ... other cases

    default:
      return state;
  }
}
```

**2.2: Create Utility Functions (2 days)**

Helper functions for working with activities:

```typescript
// src/util/activity.ts

/**
 * Gets weekly stats from activities (replaces sumStat from Week/Day)
 */
export function getWeeklyStatsFromSummary(
  summary: WeeklyActivitySummary,
): WeeklyStats {
  return {
    meeting: summary.totalMeetings,
    hoursWorked: summary.totalHoursWorked,
    choreCompleted: summary.totalChoresCompleted,
    metPrimarySupporter: summary.supporterMeetings > 0,
    medication: summary.medicationsTaken,
  };
}

/**
 * Checks if guest meets phase requirements
 */
export function checkPhaseRequirements(
  summary: WeeklyActivitySummary,
  phaseRules: PhaseRule,
): RequirementStatus {
  return {
    meetings: {
      required: phaseRules.meetings,
      actual: summary.totalMeetings,
      met: summary.totalMeetings >= phaseRules.meetings,
    },
    work: {
      required: phaseRules.work,
      actual: summary.totalHoursWorked,
      met: summary.totalHoursWorked >= phaseRules.work,
    },
    chore: {
      required: 7,
      actual: summary.totalChoresCompleted,
      met: summary.totalChoresCompleted >= 7,
    },
    supporter: {
      required: 1,
      actual: summary.supporterMeetings,
      met: summary.supporterMeetings >= 1,
    },
  };
}

/**
 * Gets activities for a specific date range
 */
export async function getActivitiesForDateRange(
  guestId: string,
  startDate: string,
  endDate: string,
  type?: ActivityType,
): Promise<Activity[]> {
  return await EnhancedActivityService.getActivities(guestId, {
    startDate,
    endDate,
    types: type ? [type] : undefined,
  });
}
```

**2.3: Update BaseStatSummary Component (5 days)**

This is the main stats display component:

```typescript
// src/screens/BaseStatSummary/BaseStatSummary.tsx

class BaseStatSummary extends Component<Props & WithPopoverProps, State> {
  // ... existing code

  async componentDidMount() {
    await this.loadWeekData();
  }

  async loadWeekData() {
    const { guest } = this.props;
    const weekStart = getStartOfWeek();

    // Feature flag: use new or old system
    if (featureFlags.isEnabled('readActivitiesInStatSummary')) {
      // NEW: Load from activities
      await this.props.getWeeklySummary(guest.id, weekStart);
      await this.props.getGuestActivities(guest.id, weekStart, getEndOfWeek());

      // Verification: compare with old system
      if (__DEV__) {
        this.verifyDataConsistency();
      }
    } else {
      // OLD: Use existing week data
      await this.props.getGuestReports(guest.id);
    }
  }

  getWeekStats(): WeeklyStats {
    const { guest, weeklySummaries } = this.props;
    const weekStart = getStartOfWeek();

    // Feature flag: read from new or old system
    if (featureFlags.isEnabled('readActivitiesInStatSummary')) {
      // NEW: Read from summary
      const summaryKey = `${guest.id}_${weekStart}`;
      const summary = weeklySummaries[summaryKey];

      if (summary) {
        return getWeeklyStatsFromSummary(summary);
      }

      // Fallback to old system if summary not loaded
      console.warn(
        '[Migration] Weekly summary not found, falling back to old system',
      );
      MigrationAnalytics.logDataMismatch('stat_summary_fallback', {
        guestId: guest.id,
        weekStart,
      });
    }

    // OLD: Read from guest.currentWeek
    return {
      meeting: sumStat(guest.currentWeek, 'meeting'),
      hoursWorked: sumStat(guest.currentWeek, 'hoursWorked'),
      choreCompleted: sumStat(guest.currentWeek, 'choreCompleted'),
      metPrimarySupporter:
        sumStat(guest.currentWeek, 'metPrimarySupporter') > 0,
      medication: sumStat(guest.currentWeek, 'medication'),
    };
  }

  async verifyDataConsistency() {
    const oldStats = this.getWeekStatsOld();
    const newStats = this.getWeekStatsNew();

    if (!_.isEqual(oldStats, newStats)) {
      MigrationAnalytics.logDataMismatch('stat_summary', {
        guestId: this.props.guest.id,
        old: oldStats,
        new: newStats,
      });
    }
  }

  // ... rest of component
}
```

**2.4: Update Other UI Components (6 days)**

Components to update:

1. `GuestProfile.tsx` - Display current chore, supporter, step
2. `WeekStatSummary.tsx` - Weekly overview
3. `ActivityFeed.tsx` - Activity history
4. `Reports.tsx` - Historical reports
5. `HouseOverview.tsx` - House-wide stats
6. `DisputeResolution.tsx` - Dispute handling

Example for GuestProfile:

```typescript
// src/screens/Profile/GuestProfile.tsx

// BEFORE:
const currentChore = guest.currentWeek?.chore?.name || 'None';
const primarySupporter = guest.currentWeek?.primarySupporterName || 'None';
const currentStep = guest.currentWeek?.step || 1;

// AFTER:
const currentChore = guest.currentChore || 'None';
const primarySupporter = guest.primarySupporterName || 'None';
const currentStep = guest.step || 1;

// These fields now live on Guest directly, not in currentWeek
```

**2.5: Update Reporting Components (4 days)**

Historical reports need to query activities:

```typescript
// src/screens/Reports/WeeklyReports.tsx

const loadHistoricalReports = async (guestId: string, weeks: number) => {
  const reports = [];

  for (let i = 0; i < weeks; i++) {
    const weekStart = getStartOfWeek(
      new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000),
    );

    const summary = await EnhancedActivityService.getWeeklySummary(
      guestId,
      weekStart,
    );

    if (summary) {
      reports.push({
        weekStart: summary.weekStartDate,
        weekEnd: summary.weekEndDate,
        stats: getWeeklyStatsFromSummary(summary),
        healthScore: summary.healthScore,
      });
    }
  }

  return reports;
};
```

**2.6: Beta Testing (4 days)**

1. Enable `readActivitiesInStatSummary` for internal test house
2. Manually verify all UI components display correctly
3. Compare displayed data with old system
4. Monitor error rates and user feedback
5. Expand to beta houses if successful

**Testing Checklist:**

- [ ] Stat summary shows correct weekly totals
- [ ] Activity feed displays all activities
- [ ] Historical reports match old system
- [ ] Phase requirements display correctly
- [ ] Health scores match old calculations
- [ ] Profile shows correct chore/supporter/step
- [ ] Dispute resolution works correctly
- [ ] Performance is acceptable (< 2s page load)

#### Success Criteria

- ✅ All UI components successfully read from new system
- ✅ Data displayed matches old system (< 1% mismatch)
- ✅ No visual regressions
- ✅ Performance equal or better than old system
- ✅ Zero critical bugs reported
- ✅ User satisfaction maintained

#### Monitoring Metrics

```
- ui_data_mismatch_rate (target: < 1%)
- page_load_time (target: < 2s)
- error_rate_ui (target: < 0.1%)
- user_satisfaction_score (target: > 4.5/5)
```

#### Rollback Plan

1. Disable `readActivitiesInStatSummary` and related flags
2. UI reverts to reading from old system
3. No data loss - old system still being written to
4. Users see old UI behavior

---

### Phase 3: Cloud Functions Migration (1-2 weeks)

#### Objectives

- Update cloud functions to use activity-based data
- Replace weekly transfer logic
- Update dispute resolution
- Update health calculations

#### Tasks

**3.1: Update Weekly Transfer Function (4 days)**

Replace Week/Day based transfer with activity-based reporting:

```typescript
// functions/src/util/guest.ts

export const transferStats = async (
  context: EventContext,
  timezone?: string,
  houseId?: string,
) => {
  logger.info('Starting activity-based weekly transfer...');

  let houseQuery: any;
  if (houseId) {
    houseQuery = await houseCollection.where('id', '==', houseId).get();
  } else {
    houseQuery = timezone
      ? await houseCollection.where('timezone', '==', timezone).get()
      : await houseCollection.get();
  }

  logger.info('Processing weekly reports...');

  for (let doc of houseQuery.docs) {
    const house = doc.data() as House;

    try {
      await ratsFirestore.runTransaction(async transaction => {
        const guestQuery = await transaction.get(
          guestCollection.where('houseId', '==', house.id),
        );

        // Calculate house health (now async)
        await calculateWeeklyHealthFromActivities(
          guestQuery,
          house,
          transaction,
        );
        transaction.update(doc.ref, { health: house.health });

        for (const guestDoc of guestQuery.docs) {
          const guest = guestDoc.data() as Guest;

          // Get last week's dates
          const lastWeekStart = getStartOfWeek(
            new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          );
          const lastWeekEnd = getEndOfWeek(lastWeekStart);

          // Check if report already exists
          const existingReport = await reportCollection
            .where('guestId', '==', guest.id)
            .where('startDate', '==', lastWeekStart)
            .get();

          if (existingReport.empty) {
            // Get weekly summary
            const summaryKey = `${guest.id}_${lastWeekStart}`;
            const summaryDoc = await weeklySummaryCollection
              .doc(summaryKey)
              .get();

            if (summaryDoc.exists) {
              const summary = summaryDoc.data() as WeeklyActivitySummary;

              // Create weekly report
              const report = new WeeklyReport(
                guest.id,
                lastWeekStart,
                lastWeekEnd,
                {
                  hoursWorked: summary.totalHoursWorked,
                  meeting: summary.totalMeetings,
                  medication: summary.medicationsTaken,
                  choreCompleted: summary.totalChoresCompleted,
                  metPrimarySupporter: summary.supporterMeetings > 0,
                  step: guest.step,
                },
              );

              const reportDoc = reportCollection.doc();
              transaction.set(reportDoc, report);

              logger.info('Weekly report created for', guest.firstName);
            }
          }
        }
      });
    } catch (error) {
      logger.error('Error processing house', house.id, error);
    }
  }

  logger.info('Weekly transfer complete!');
};
```

**3.2: Update Dispute Resolution (3 days)**

Modify disputes to work with activities collection:

```typescript
// functions/src/util/disputes.ts

export const determineDisputeResult = async (
  house: House,
  dispute: Dispute,
  transaction: FirebaseFirestore.Transaction,
) => {
  logger.info('Determining dispute result for activity', dispute.activityId);

  // Get the disputed activity
  const activityDoc = await transaction.get(
    activityCollection.doc(dispute.activityId),
  );

  if (!activityDoc.exists) {
    logger.error('Activity not found:', dispute.activityId);
    return;
  }

  const activity = activityDoc.data() as Activity;
  const result = disputeResult(dispute, activity);

  if (result !== 'none') {
    logger.info('Dispute result:', result);

    // Update activity
    transaction.update(activityDoc.ref, {
      underDispute: Math.max(0, activity.underDispute - 1),
      disputeResult: result,
      updatedDate: getCurrentTime(),
    });

    // If successful, invalidate the activity
    if (result === 'success') {
      transaction.update(activityDoc.ref, {
        value: false,
        'metadata.disputedSuccessfully': true,
        'metadata.disputeId': dispute.id,
      });

      // Recalculate summaries
      await recalculateSummariesForActivity(
        activity.residentId,
        activity.date,
        transaction,
      );
    }

    // Update house disputes
    const { disputes, resolvedDispute } = updateHouseDisputes(
      house,
      dispute,
      result === 'fail' ? 'overturned' : 'allowed',
    );

    transaction.update(houseCollection.doc(house.id), { disputes });
  }
};

async function recalculateSummariesForActivity(
  residentId: string,
  date: string,
  transaction: FirebaseFirestore.Transaction,
) {
  // Get all activities for that date
  const activitiesQuery = await activityCollection
    .where('residentId', '==', residentId)
    .where('date', '==', date)
    .get();

  // Recalculate daily summary
  const dailySummary = calculateDailySummaryFromActivities(
    residentId,
    date,
    activitiesQuery.docs.map(d => d.data() as Activity),
  );

  transaction.set(
    dailySummaryCollection.doc(`${residentId}_${date}`),
    dailySummary,
  );

  // Recalculate weekly summary
  const weekStart = getStartOfWeek(date);
  const weekEnd = getEndOfWeek(weekStart);

  const weekActivitiesQuery = await activityCollection
    .where('residentId', '==', residentId)
    .where('date', '>=', weekStart)
    .where('date', '<=', weekEnd)
    .get();

  const weeklySummary = calculateWeeklySummaryFromActivities(
    residentId,
    weekStart,
    weekEnd,
    weekActivitiesQuery.docs.map(d => d.data() as Activity),
  );

  transaction.set(
    weeklySummaryCollection.doc(`${residentId}_${weekStart}`),
    weeklySummary,
  );
}
```

**3.3: Update Health Calculations (3 days)**

Modify house health calculation to use summaries:

```typescript
// functions/src/util/house.ts

export const calculateWeeklyHealthFromActivities = async (
  guestsQuery: FirebaseFirestore.QuerySnapshot,
  house: House,
  transaction: FirebaseFirestore.Transaction,
) => {
  const guests = fillGuests(guestsQuery);
  const weekEndDate = getYesterdaysDate();
  const weekStart = getStartOfWeek(weekEndDate);

  // Get health scores for all guests
  const healthScores: number[] = [];

  for (const guest of Object.values(guests)) {
    const summaryKey = `${guest.id}_${weekStart}`;
    const summaryDoc = await weeklySummaryCollection.doc(summaryKey).get();

    if (summaryDoc.exists) {
      const summary = summaryDoc.data() as WeeklyActivitySummary;
      healthScores.push(summary.healthScore);
    } else {
      // Fallback: calculate from activities
      const weekActivities = await activityCollection
        .where('residentId', '==', guest.id)
        .where('date', '>=', weekStart)
        .where('date', '<=', weekEndDate)
        .get();

      const score = calculateHealthScoreFromActivities(
        guest,
        house,
        weekActivities.docs.map(d => d.data() as Activity),
      );

      healthScores.push(score);
    }
  }

  // Calculate average
  const avgHealth =
    healthScores.length > 0
      ? Math.ceil(healthScores.reduce((a, b) => a + b, 0) / healthScores.length)
      : 0;

  // Update house health history
  if (!house.health || typeof house.health !== 'object') {
    house.health = {};
  }

  // Keep only last 8 weeks
  if (Object.keys(house.health).length >= 8) {
    const sortedDates = Object.keys(house.health).sort();
    delete house.health[sortedDates[0]];
  }

  house.health[weekEndDate] = avgHealth;
};
```

**3.4: Update Guest Entity (1 day)**

Remove Week fields from cloud functions Guest entity:

```typescript
// functions/src/entities/Guest.ts

export class Guest extends BaseEntity {
  id: string = '';
  userId: string = '';
  houseId: string = '';
  // ... other fields

  // REMOVE:
  // currentWeek: Week;
  // previousWeek: Week;
  // nextWeek: Week;

  // ADD:
  currentChore: string = '';
  primarySupporterId: string = '';
  primarySupporterName: string = '';
  sponsees: string[] = [];
  step: number | string = 1;

  constructor() {
    super();
    this.id = createGuestId();
    // REMOVED: this.currentWeek = new Week(this);
  }
}
```

**3.5: Deploy and Test (2 days)**

1. Deploy updated cloud functions
2. Enable `weeklyTransferUsesActivities` flag for test house
3. Trigger manual weekly transfer
4. Verify reports are generated correctly
5. Test dispute resolution
6. Monitor error rates

#### Success Criteria

- ✅ Weekly transfers complete successfully
- ✅ Reports generated match old system
- ✅ Dispute resolution works correctly
- ✅ House health calculations accurate
- ✅ No cloud function errors
- ✅ Performance acceptable (< 30s for weekly transfer)

#### Monitoring Metrics

```
- weekly_transfer_success_rate (target: 100%)
- weekly_transfer_duration (target: < 30s per house)
- dispute_resolution_success_rate (target: 100%)
- cloud_function_error_rate (target: < 0.1%)
```

#### Rollback Plan

1. Disable feature flags for cloud functions
2. Revert to previous deployment
3. Old system continues to work
4. No data loss

---

### Phase 4: Historical Data Migration (1-2 weeks)

#### Objectives

- Migrate archived Week data to activities
- Backfill summaries from historical data
- Verify data integrity

#### Tasks

**4.1: Create Migration Function (3 days)**

```typescript
// functions/src/migrations/weekToActivityMigration.ts

export const migrateWeekToActivities = async (
  week: Week,
  guestId: string,
  houseId: string
): Promise<Activity[]> {
  const activities: Activity[] = [];
  const batch = ratsFirestore.batch();

  // Iterate through each day
  Object.keys(week.days).forEach(date => {
    const day = week.days[date];

    // Migrate meetings
    if (day.meeting && day.meeting.length > 0) {
      day.meeting.forEach(meeting => {
        const activity = new Activity(
          guestId,
          'meeting_attended',
          true,
          {
            meetingName: meeting.name,
            meetingLocation: meeting.street || meeting.Location?.[0],
            verified: meeting.verified || false
          },
          date
        );

        const activityRef = activityCollection.doc(activity.id);
        batch.set(activityRef, activity);
        activities.push(activity);
      });
    }

    // Migrate work hours
    if (day.hoursWorked) {
      Object.keys(day.hoursWorked).forEach(jobName => {
        const hours = day.hoursWorked[jobName];
        if (hours > 0) {
          const activity = new Activity(
            guestId,
            'hours_worked',
            hours,
            { jobName, hours },
            date
          );

          const activityRef = activityCollection.doc(activity.id);
          batch.set(activityRef, activity);
          activities.push(activity);
        }
      });
    }

    // Migrate chore completion
    if (day.choreCompleted) {
      const activity = new Activity(
        guestId,
        'chore_completed',
        true,
        { choreName: week.chore?.name || 'Unknown' },
        date
      );

      const activityRef = activityCollection.doc(activity.id);
      batch.set(activityRef, activity);
      activities.push(activity);
    }

    // Migrate supporter meeting
    if (day.metPrimarySupporter) {
      const activity = new Activity(
        guestId,
        'supporter_met',
        true,
        { supporterName: week.primarySupporterName || 'Unknown' },
        date
      );

      const activityRef = activityCollection.doc(activity.id);
      batch.set(activityRef, activity);
      activities.push(activity);
    }

    // Migrate medication
    if (day.medication) {
      const activity = new Activity(
        guestId,
        'medication_taken',
        true,
        {},
        date
      );

      const activityRef = activityCollection.doc(activity.id);
      batch.set(activityRef, activity);
      activities.push(activity);
    }
  });

  // Commit batch
  await batch.commit();

  return activities;
};
```

**4.2: Create Batch Migration Function (2 days)**

```typescript
// functions/src/migrations/batchMigration.ts

export const migrateAllGuestHistory = functions.https.onCall(
  async (data: { houseId?: string; limit?: number }, context) => {
    if (!context.auth || !context.auth.token.superAdmin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only super admins can run migrations',
      );
    }

    const limit = data.limit || 100;
    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    logger.info('Starting historical data migration', {
      houseId: data.houseId,
      limit,
    });

    try {
      // Get all guests
      let guestQuery = guestCollection.limit(limit);
      if (data.houseId) {
        guestQuery = guestQuery.where('houseId', '==', data.houseId);
      }

      const guestDocs = await guestQuery.get();

      for (const guestDoc of guestDocs.docs) {
        const guest = guestDoc.data() as Guest;
        processed++;

        try {
          // Migrate current week if exists
          if (guest.currentWeek) {
            await migrateWeekToActivities(
              guest.currentWeek,
              guest.id,
              guest.houseId,
            );
          }

          // Migrate previous week if exists
          if (guest.previousWeek) {
            await migrateWeekToActivities(
              guest.previousWeek,
              guest.id,
              guest.houseId,
            );
          }

          // Migrate archived weeks
          const archivedWeeks = await weeksCollection
            .where('guestId', '==', guest.id)
            .get();

          for (const weekDoc of archivedWeeks.docs) {
            const week = weekDoc.data() as Week;
            await migrateWeekToActivities(week, guest.id, guest.houseId);
          }

          // Generate summaries for all weeks
          await regenerateSummariesForGuest(guest.id);

          succeeded++;
          logger.info(
            `Migrated guest ${guest.id} (${processed}/${guestDocs.size})`,
          );
        } catch (error) {
          failed++;
          logger.error(`Failed to migrate guest ${guest.id}:`, error);
        }
      }

      logger.info('Migration complete', { processed, succeeded, failed });

      return {
        success: true,
        processed,
        succeeded,
        failed,
      };
    } catch (error) {
      logger.error('Migration failed:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  },
);

async function regenerateSummariesForGuest(guestId: string) {
  // Get all activities for guest
  const activitiesSnapshot = await activityCollection
    .where('residentId', '==', guestId)
    .get();

  const activities = activitiesSnapshot.docs.map(d => d.data() as Activity);

  // Group by date for daily summaries
  const byDate = _.groupBy(activities, 'date');

  for (const [date, dateActivities] of Object.entries(byDate)) {
    const dailySummary = calculateDailySummaryFromActivities(
      guestId,
      date,
      dateActivities,
    );

    await dailySummaryCollection.doc(`${guestId}_${date}`).set(dailySummary);
  }

  // Group by week for weekly summaries
  const byWeek = _.groupBy(activities, activity =>
    getStartOfWeek(activity.date),
  );

  for (const [weekStart, weekActivities] of Object.entries(byWeek)) {
    const weekEnd = getEndOfWeek(weekStart);
    const weeklySummary = calculateWeeklySummaryFromActivities(
      guestId,
      weekStart,
      weekEnd,
      weekActivities,
    );

    await weeklySummaryCollection
      .doc(`${guestId}_${weekStart}`)
      .set(weeklySummary);
  }
}
```

**4.3: Run Migration (5 days)**

1. Test migration on single guest
2. Test migration on test house
3. Verify data integrity
4. Run migration on beta houses
5. Schedule full migration (run during low-traffic period)

**Migration Checklist:**

- [ ] Backup all data before migration
- [ ] Run migration on test guest - verify
- [ ] Run migration on test house - verify
- [ ] Compare activity counts with week data
- [ ] Verify summaries match old reports
- [ ] Run migration on beta houses
- [ ] Monitor error rates
- [ ] Full migration scheduled for 2 AM Sunday

**4.4: Data Verification (2 days)**

After migration, verify:

```typescript
// Verification script
export const verifyMigration = async (guestId: string) => {
  // Get old reports
  const oldReports = await reportCollection
    .where('guestId', '==', guestId)
    .get();

  // Get new summaries
  const summaries = await weeklySummaryCollection
    .where('residentId', '==', guestId)
    .get();

  // Compare totals
  const oldTotalMeetings = oldReports.docs.reduce(
    (sum, doc) => sum + (doc.data().meeting || 0),
    0,
  );

  const newTotalMeetings = summaries.docs.reduce(
    (sum, doc) => sum + (doc.data().totalMeetings || 0),
    0,
  );

  if (oldTotalMeetings !== newTotalMeetings) {
    logger.error('Meeting count mismatch', {
      old: oldTotalMeetings,
      new: newTotalMeetings,
    });
    return false;
  }

  // ... verify other stats

  return true;
};
```

#### Success Criteria

- ✅ 100% of historical weeks migrated to activities
- ✅ All summaries generated correctly
- ✅ Data verification passes for all guests
- ✅ < 0.1% data loss/corruption
- ✅ Old data preserved in guest-weeks collection

#### Monitoring Metrics

```
- migration_success_rate (target: 100%)
- data_verification_pass_rate (target: > 99.9%)
- migration_duration (estimate: 2-4 hours for full database)
```

#### Rollback Plan

- Original data still in `guest-weeks` and `Guest.currentWeek/previousWeek`
- Can delete activities collection and regenerate
- Can revert to old system completely if needed

---

### Phase 5: Cutover & Cleanup (1 week)

#### Objectives

- Stop writing to old system
- Remove deprecated code
- Optimize performance
- Complete migration

#### Tasks

**5.1: Stop Dual-Write (2 days)**

1. Verify all systems reading from new data
2. Enable `disableWeekDayWrites` feature flag
3. Monitor for 48 hours
4. Remove dual-write code

```typescript
// After monitoring period, remove DualWriteService
// Update guestService.updateGuest to only write activities

export async function updateGuest(
  guest: Partial<Guest>,
  updatedGuest: Partial<Guest>,
): Promise<Partial<Guest>> {
  // OLD CODE (remove):
  // Activities.constructGuestActivities(guest, updatedGuest);
  // await crud.update<Guest>(guestCollection, updatedGuest);

  // NEW CODE (keep):
  // Activities are now created directly via EnhancedActivityService
  // Guest updates only update profile fields
  await crud.update<Guest>(guestCollection, updatedGuest);
  return updatedGuest;
}
```

**5.2: Remove Week/Day Fields from Guest (1 day)**

Update Guest entity to remove deprecated fields:

```typescript
// src/entities/Guest.tsx
// functions/src/entities/Guest.ts

export class Guest extends BaseEntity {
  id: string = '';
  // ... existing fields

  // REMOVED:
  // currentWeek: Week;
  // previousWeek: Week;
  // nextWeek: Week;

  constructor() {
    super();
    this.id = createGuestId();
    // REMOVED: this.currentWeek = new Week(this);
  }
}
```

**5.3: Remove Deprecated Code (2 days)**

Files to remove or deprecate:

- `src/util/week.ts` - Week utility functions
- `src/constants/activities.tsx` - Old activity constructors
- `src/services/weeks.tsx` - Weekly transfer client code
- `functions/src/util/week.ts` - Week utilities
- Keep `entities/Week.tsx` marked as `@deprecated` for archived data

**5.4: Database Cleanup (1 day)**

1. **Do NOT delete** `guest-weeks` collection (historical data)
2. **Do NOT delete** `guest-reports` collection (reports)
3. Verify no code references `currentWeek/previousWeek`
4. Update database documentation

**5.5: Performance Optimization (1 day)**

1. Review Firestore index usage
2. Optimize query patterns
3. Implement caching where beneficial
4. Monitor costs and adjust

**5.6: Documentation Update (1 day)**

Update docs:

- Architecture documentation
- API documentation
- Developer onboarding
- Data model diagrams
- Migration retrospective

#### Success Criteria

- ✅ Zero writes to old Week/Day structure
- ✅ All deprecated code removed
- ✅ No references to currentWeek/previousWeek
- ✅ Performance meets or exceeds old system
- ✅ Documentation updated
- ✅ Migration marked complete

---

## 7. Risk Assessment & Mitigation

### 7.1 Technical Risks

| Risk                                   | Probability | Impact   | Mitigation Strategy                                                                                                             |
| -------------------------------------- | ----------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Data loss during migration**         | Low         | Critical | • Backup all data before migration<br>• Test on subset first<br>• Keep old data indefinitely<br>• Implement rollback procedures |
| **Data inconsistency between systems** | Medium      | High     | • Dual-write pattern<br>• Automated verification<br>• Manual spot checks<br>• Feature flags for rollback                        |
| **Performance degradation**            | Medium      | High     | • Load testing before rollout<br>• Monitor performance metrics<br>• Optimize indexes<br>• Cache summaries                       |
| **Cloud function timeout**             | Low         | Medium   | • Batch processing<br>• Implement pagination<br>• Optimize queries<br>• Increase timeout limits                                 |
| **Index creation taking too long**     | Medium      | Low      | • Create indexes early<br>• Plan for 24-48 hour index build time<br>• Test with production-size data                            |
| **Dispute resolution bugs**            | Medium      | Medium   | • Extensive testing<br>• Feature flag for new dispute logic<br>• Manual review of disputed activities                           |
| **Firestore cost increase**            | Medium      | Medium   | • Monitor costs closely<br>• Optimize query patterns<br>• Use caching effectively<br>• Set budget alerts                        |

### 7.2 Operational Risks

| Risk                                      | Probability | Impact | Mitigation Strategy                                                                                              |
| ----------------------------------------- | ----------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| **User confusion during transition**      | High        | Low    | • Clear communication<br>• Help documentation<br>• Support team training<br>• In-app guidance                    |
| **Support team unaware of changes**       | Medium      | Medium | • Training sessions<br>• Updated support docs<br>• Migration FAQ<br>• Dedicated support during rollout           |
| **Beta houses experiencing issues**       | Medium      | Medium | • Close monitoring<br>• Direct communication channel<br>• Quick rollback ability<br>• Compensation/apology ready |
| **Migration taking longer than expected** | Medium      | Low    | • Buffer time in schedule<br>• Incremental approach<br>• Can pause and resume<br>• Communicate delays early      |

### 7.3 Business Risks

| Risk                             | Probability | Impact | Mitigation Strategy                                                                          |
| -------------------------------- | ----------- | ------ | -------------------------------------------------------------------------------------------- |
| **User churn due to bugs**       | Low         | High   | • Extensive testing<br>• Gradual rollout<br>• Quick rollback<br>• Proactive communication    |
| **Revenue impact from downtime** | Low         | Medium | • No downtime required<br>• Dual-write ensures continuity<br>• Rollback plan ready           |
| **Reputation damage**            | Low         | Medium | • Transparent communication<br>• Quick issue resolution<br>• Compensation for impacted users |

---

## 8. Testing Strategy

### 8.1 Unit Tests

Test each component in isolation:

```typescript
// Example: Activity service tests
describe('EnhancedActivityService', () => {
  describe('addActivity', () => {
    it('should create activity document', async () => {
      const activity = await EnhancedActivityService.addActivity({
        residentId: 'test-guest',
        houseId: 'test-house',
        type: 'meeting_attended',
        value: true,
        metadata: { meetingName: 'Test Meeting' }
      });

      expect(activity.id).toBeDefined();
      expect(activity.type).toBe('meeting_attended');
    });

    it('should update daily summary', async () => {
      const activity = await EnhancedActivityService.addActivity({...});

      const summary = await EnhancedActivityService.getDailySummary(
        'test-guest',
        getTodaysDate()
      );

      expect(summary.meetingsAttended).toBe(1);
    });

    it('should update weekly summary', async () => {
      const activity = await EnhancedActivityService.addActivity({...});

      const summary = await EnhancedActivityService.getWeeklySummary(
        'test-guest',
        getStartOfWeek()
      );

      expect(summary.totalMeetings).toBeGreaterThan(0);
    });
  });
});
```

### 8.2 Integration Tests

Test end-to-end flows:

```typescript
describe('Dual-Write Integration', () => {
  it('should write to both old and new systems', async () => {
    const guest = createTestGuest();

    // Record meeting
    await recordMeeting(guest, testMeeting);

    // Verify old system
    const updatedGuest = await getGuest(guest.id);
    expect(updatedGuest.currentWeek.days[getTodaysDate()].meeting.length).toBe(
      1,
    );

    // Verify new system
    const activities = await EnhancedActivityService.getActivities(guest.id);
    expect(activities.filter(a => a.type === 'meeting_attended').length).toBe(
      1,
    );
  });
});
```

### 8.3 Load Testing

Simulate production load:

```bash
# Use Artillery or k6 for load testing
# Test concurrent activity creation
artillery run load-test.yml

# Verify:
# - Response times < 200ms for 95th percentile
# - Zero errors at 10x normal load
# - Summaries update correctly under load
```

### 8.4 Manual Testing

Testing checklist for each phase:

**Phase 1: Dual-Write**

- [ ] Record meeting - verify in both systems
- [ ] Update work hours - verify in both systems
- [ ] Complete chore - verify in both systems
- [ ] Meet supporter - verify in both systems
- [ ] Check data consistency report
- [ ] Verify performance is acceptable

**Phase 2: UI Migration**

- [ ] Stat summary displays correctly
- [ ] Activity feed shows all activities
- [ ] Historical reports match
- [ ] Phase requirements accurate
- [ ] Profile shows correct data
- [ ] No visual regressions

**Phase 3: Cloud Functions**

- [ ] Weekly transfer completes
- [ ] Reports generated correctly
- [ ] Disputes resolved correctly
- [ ] House health calculated
- [ ] Performance acceptable

**Phase 4: Data Migration**

- [ ] Test guest migrated correctly
- [ ] Historical data preserved
- [ ] Summaries accurate
- [ ] No data loss
- [ ] Verification passes

---

## 9. Rollback Plan

### 9.1 Rollback Triggers

Immediately rollback if:

- Data loss detected (> 0.1%)
- Critical bugs affecting > 10% of users
- Performance degradation > 3x
- Security vulnerability discovered
- Data corruption detected

Consider rollback if:

- Data mismatch rate > 5%
- User complaints spike (> 10 reports/day)
- Support tickets double
- Error rate > 1%

### 9.2 Rollback Procedures

**Phase 1 Rollback:**

```
1. Disable enableActivityWrites flag
2. System reverts to old system only
3. Clean up orphaned activities (optional)
4. No data loss - all in old system
Time: < 5 minutes
```

**Phase 2 Rollback:**

```
1. Disable all readActivities* flags
2. UI reverts to reading from old system
3. Dual-write continues
4. No data loss
Time: < 5 minutes
```

**Phase 3 Rollback:**

```
1. Revert cloud functions deployment
2. Disable cloud function flags
3. Old functions take over
4. No data loss
Time: < 10 minutes
```

**Phase 4 Rollback:**

```
1. Stop migration script
2. Can re-run migration later
3. Delete migrated activities if needed
4. Original data preserved
Time: < 30 minutes to stop, hours to clean up
```

**Phase 5 Rollback (Nuclear Option):**

```
If complete rollback needed after cutover:
1. Re-enable Week/Day writes in code
2. Redeploy old cloud functions
3. Regenerate currentWeek from activities
4. May lose some recent data (< 24 hours)
Time: 1-2 hours
Risk: High
```

### 9.3 Rollback Communication

**Internal:**

1. Notify dev team immediately
2. Post in #engineering Slack channel
3. Update status page
4. Alert support team

**External:**

1. In-app banner (if user-facing)
2. Email to affected houses
3. Support team ready for questions
4. Social media update if needed

---

## 10. Post-Migration Optimization

### 10.1 Performance Monitoring (First 2 weeks)

Monitor key metrics:

```
- Activity write latency (target: < 100ms p95)
- Summary update latency (target: < 50ms p95)
- Query response time (target: < 200ms p95)
- Cloud function duration (target: < 5s)
- Firestore costs (target: < 20% increase)
- Error rates (target: < 0.1%)
```

### 10.2 Query Optimization

After migration, analyze and optimize:

```typescript
// Before optimization
const activities = await activityCollection
  .where('residentId', '==', guestId)
  .get(); // Gets ALL activities

// After optimization
const activities = await activityCollection
  .where('residentId', '==', guestId)
  .where('date', '>=', thirtyDaysAgo)
  .limit(100)
  .get(); // Only recent activities
```

### 10.3 Cost Optimization

Strategies to reduce Firestore costs:

1. **Aggressive caching:** Cache summaries in Redux
2. **Batch reads:** Read multiple days at once
3. **Summary preference:** Always read from summaries instead of activities when possible
4. **Query limits:** Limit activity queries to reasonable date ranges (e.g., last 30 days)
5. **Index optimization:** Remove unused indexes to reduce storage costs
6. **Archival strategy:** Move activities older than 1 year to cold storage (Cloud Storage)

**Example caching strategy:**

```typescript
// Cache weekly summaries in Redux for 1 hour
const getCachedWeeklySummary = (state, guestId, weekStart) => {
  const key = `${guestId}_${weekStart}`;
  const cached = state.activities.weeklySummaries[key];

  if (cached && Date.now() - cached.lastFetched < 3600000) {
    // 1 hour
    return cached;
  }

  return null; // Needs refresh
};
```

### 10.4 Index Optimization

Review and optimize Firestore indexes after 2 weeks:

```javascript
// Remove unused indexes
// Keep only these essential indexes:
{
  "indexes": [
    // Most common: Get recent activities for a guest
    {
      "collectionGroup": "activities",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "residentId", "order": "ASCENDING" },
        { "fieldPath": "date", "order": "DESCENDING" }
      ]
    },
    // For filtered queries (by type)
    {
      "collectionGroup": "activities",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "residentId", "order": "ASCENDING" },
        { "fieldPath": "type", "order": "ASCENDING" },
        { "fieldPath": "date", "order": "DESCENDING" }
      ]
    },
    // For house-wide queries
    {
      "collectionGroup": "activities",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "houseId", "order": "ASCENDING" },
        { "fieldPath": "date", "order": "DESCENDING" }
      ]
    },
    // For weekly summary lookups
    {
      "collectionGroup": "weekly-summaries",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "residentId", "order": "ASCENDING" },
        { "fieldPath": "weekStartDate", "order": "DESCENDING" }
      ]
    }
  ]
}
```

### 10.5 Feature Enhancements (Post-Migration)

Now that we have activity-based data, we can build new features:

#### 10.5.1 Enhanced Analytics

```typescript
// New capabilities enabled by activity data:

// 1. Attendance patterns
const getMeetingAttendancePattern = async (guestId: string, months: number) => {
  const startDate = moment().subtract(months, 'months').format('YYYY-MM-DD');
  const activities = await getActivities(
    guestId,
    startDate,
    getTodaysDate(),
    'meeting_attended',
  );

  // Analyze by day of week
  const byDayOfWeek = _.groupBy(activities, a => moment(a.date).format('dddd'));

  return {
    mostCommonDay: _.maxBy(
      Object.keys(byDayOfWeek),
      day => byDayOfWeek[day].length,
    ),
    averagePerWeek: activities.length / (months * 4.33),
    trend: calculateTrend(activities),
  };
};

// 2. Work consistency tracking
const getWorkConsistency = async (guestId: string) => {
  // Track gaps in work history, compare week-over-week
  // Identify if guest is maintaining employment
};

// 3. Recovery trajectory
const getRecoveryScore = async (guestId: string) => {
  // Calculate improvement over time across all metrics
  // Compare current performance vs first month
};
```

#### 10.5.2 Predictive Features

```typescript
// Predict guests at risk of relapse based on activity patterns
const calculateRiskScore = (weeklySummaries: WeeklyActivitySummary[]) => {
  const recentWeeks = weeklySummaries.slice(0, 4);

  // Red flags:
  // - Declining meeting attendance
  // - Missing supporter meetings
  // - Inconsistent work
  // - Not completing chores

  let riskScore = 0;

  // Calculate trends
  const meetingTrend = calculateTrend(recentWeeks.map(w => w.totalMeetings));
  if (meetingTrend < -0.5) riskScore += 25; // Declining meetings

  const missedSupporter = recentWeeks.filter(
    w => w.supporterMeetings === 0,
  ).length;
  if (missedSupporter >= 2) riskScore += 20;

  // ... other risk factors

  return {
    score: riskScore, // 0-100
    risk: riskScore > 60 ? 'high' : riskScore > 30 ? 'medium' : 'low',
    recommendations: generateRecommendations(riskScore),
  };
};
```

#### 10.5.3 Detailed Activity Timeline

```typescript
// Build comprehensive timeline view
const getActivityTimeline = async (guestId: string, days: number = 30) => {
  const activities = await getActivities(
    guestId,
    moment().subtract(days, 'days').format('YYYY-MM-DD'),
    getTodaysDate(),
  );

  // Group by date
  const timeline = _.groupBy(activities, 'date');

  // Add daily summaries
  for (const date of Object.keys(timeline)) {
    const summary = await getDailySummary(guestId, date);
    timeline[date] = {
      activities: timeline[date],
      summary,
      healthScore: calculateDailyHealthScore(summary),
    };
  }

  return timeline;
};
```

#### 10.5.4 Comparative Analytics

```typescript
// Compare guest performance to house average
const compareToHouseAverage = async (guestId: string, houseId: string) => {
  const weekStart = getStartOfWeek();

  // Get guest summary
  const guestSummary = await getWeeklySummary(guestId, weekStart);

  // Get all house summaries
  const houseSummaries = await weeklySummaryCollection
    .where('weekStartDate', '==', weekStart)
    .get();

  const houseActivities = houseSummaries.docs
    .map(d => d.data() as WeeklyActivitySummary)
    .filter(s => s.residentId !== guestId); // Exclude current guest

  const averages = {
    meetings: _.meanBy(houseActivities, 'totalMeetings'),
    hours: _.meanBy(houseActivities, 'totalHoursWorked'),
    chores: _.meanBy(houseActivities, 'totalChoresCompleted'),
    healthScore: _.meanBy(houseActivities, 'healthScore'),
  };

  return {
    guest: {
      meetings: guestSummary.totalMeetings,
      hours: guestSummary.totalHoursWorked,
      chores: guestSummary.totalChoresCompleted,
      healthScore: guestSummary.healthScore,
    },
    houseAverage: averages,
    percentiles: {
      meetings: calculatePercentile(
        guestSummary.totalMeetings,
        houseActivities.map(a => a.totalMeetings),
      ),
      hours: calculatePercentile(
        guestSummary.totalHoursWorked,
        houseActivities.map(a => a.totalHoursWorked),
      ),
      // ... etc
    },
  };
};
```

### 10.6 Documentation Updates

Update all relevant documentation:

#### 10.6.1 Architecture Documentation

- **File:** `docs/architecture.md`
- **Updates needed:**
  - Remove Week/Day architecture diagrams
  - Add Activity-based architecture diagrams
  - Document new Firestore collections
  - Explain event sourcing pattern
  - Document query patterns
  - Add performance benchmarks

#### 10.6.2 API Documentation

- **File:** `docs/api.md`
- **Updates needed:**
  - Document `EnhancedActivityService` methods
  - Add examples for common queries
  - Document summary structure
  - Explain caching strategy
  - Add security considerations

#### 10.6.3 Developer Onboarding

- **File:** `docs/onboarding.md`
- **Updates needed:**
  - Remove references to Week/Day model
  - Add activity-based concepts
  - Update code examples
  - Explain dual-write history (for context)
  - Document best practices

#### 10.6.4 Data Model Documentation

- **File:** `docs/data-model.md`
- **Create new:**

````markdown
# RATS Data Model - Activity-Based System

## Collections

### activities

Individual events representing guest activities.

**Document Structure:**

- `id`: string (auto-generated)
- `residentId`: string (foreign key)
- `houseId`: string (foreign key)
- `type`: ActivityType enum
- `date`: string (YYYY-MM-DD)
- `createdDate`: string (ISO 8601)
- `value`: number | boolean
- `metadata`: ActivityMetadata object
- `underDispute`: number
- `disputeResult`: enum

**Indexes:**

- (residentId, date DESC)
- (residentId, type, date DESC)
- (houseId, date DESC)

**Security Rules:**

- Read: Guest or house admin
- Write: Server only
- Delete: Never (immutable)

### daily-summaries

Cached daily aggregates for performance.

**Document ID Pattern:** `{residentId}_{date}`

**Update Strategy:**

- Incremental merge on activity creation
- Full recalculation on dispute resolution

### weekly-summaries

Cached weekly aggregates with health scores.

**Document ID Pattern:** `{residentId}_{weekStartDate}`

**Update Strategy:**

- Incremental on activity creation
- Full recalculation on dispute resolution
- Nightly recalculation (cloud function)

## Query Patterns

### Get recent activities for a guest

```typescript
const activities = await activityCollection
  .where('residentId', '==', guestId)
  .where('date', '>=', startDate)
  .where('date', '<=', endDate)
  .orderBy('date', 'desc')
  .limit(100)
  .get();
```
````

### Get weekly summary (preferred for stats)

```typescript
const summary = await weeklySummaryCollection
  .doc(`${guestId}_${weekStart}`)
  .get();
```

## Best Practices

1. **Always prefer summaries over activities** for read operations
2. **Use batch writes** when creating activities
3. **Limit query ranges** to reduce costs
4. **Cache summaries** in Redux/state management
5. **Never delete activities** - mark as disputed instead

````

#### 10.6.5 Migration History
- **File:** `docs/migration-history.md`
- **Create retrospective:**
```markdown
# Activity-Based System Migration - Retrospective

## Migration Timeline
- Planning: [dates]
- Phase 0: [dates]
- Phase 1: [dates]
- Phase 2: [dates]
- Phase 3: [dates]
- Phase 4: [dates]
- Phase 5: [dates]

## Metrics
- Total users migrated: X
- Data migrated: X GB
- Activities created: X million
- Migration duration: X hours
- Downtime: 0 minutes
- Data loss: 0%

## What Went Well
- [List successes]
- Feature flags enabled smooth rollout
- Dual-write prevented data loss
- etc.

## What Could Be Improved
- [List challenges]
- Migration took longer than expected
- Index creation delayed rollout
- etc.

## Lessons Learned
- [Key learnings]
- Always test at production scale
- Feature flags are essential
- etc.

## Future Recommendations
- [Recommendations for future migrations]
````

---

## 11. Success Metrics & KPIs

### 11.1 Technical Metrics

| Metric                       | Baseline (Old) | Target (New)  | Measurement       |
| ---------------------------- | -------------- | ------------- | ----------------- |
| Average write size           | 18KB           | 2KB           | -89%              |
| Average read time            | 450ms          | 200ms         | -56%              |
| Query flexibility            | Limited        | Unlimited     | Qualitative       |
| Database size per guest/year | ~25MB          | ~3MB          | -88%              |
| Cloud function duration      | 45s            | 15s           | -67%              |
| Firestore costs              | $X/month       | $X\*1.1/month | +10% (acceptable) |
| Error rate                   | 0.5%           | <0.1%         | -80%              |

### 11.2 User Experience Metrics

| Metric                   | Baseline | Target   | Measurement |
| ------------------------ | -------- | -------- | ----------- |
| Page load time           | 2.5s     | 1.5s     | -40%        |
| User satisfaction        | 4.2/5    | >4.2/5   | Maintained  |
| Support tickets          | 10/week  | <10/week | Maintained  |
| App crash rate           | 0.2%     | <0.2%    | Maintained  |
| Feature requests enabled | 0        | 5+       | Qualitative |

### 11.3 Business Metrics

| Metric                       | Target | Measurement                |
| ---------------------------- | ------ | -------------------------- |
| Zero downtime                | 100%   | Achieved                   |
| Zero data loss               | 100%   | Achieved                   |
| Migration cost               | <$5K   | Engineering time           |
| User churn during migration  | <1%    | Monthly churn rate         |
| New feature releases enabled | 5+     | Features built on new data |

---

## 12. Appendix

### 12.1 Glossary

**Activity:** An individual event representing a guest action (meeting attended, chore completed, etc.)

**Daily Summary:** A cached document containing aggregated stats for a single day

**Weekly Summary:** A cached document containing aggregated stats and health score for a week

**Dual-Write:** Writing to both old and new systems simultaneously during migration

**Event Sourcing:** Architecture pattern where state is derived from a log of events

**CQRS:** Command Query Responsibility Segregation - separate write and read models

**Health Score:** Calculated score (0-100) representing compliance with phase requirements

**Phase Rules:** Requirements a guest must meet based on their recovery phase

### 12.2 Reference Links

**Internal Documentation:**

- Architecture Overview: `/docs/architecture.md`
- Data Model: `/docs/data-model.md`
- API Reference: `/docs/api.md`
- Migration History: `/docs/migration-history.md`

**External Resources:**

- Event Sourcing: https://martinfowler.com/eaaDev/EventSourcing.html
- CQRS: https://martinfowler.com/bliki/CQRS.html
- Firestore Best Practices: https://firebase.google.com/docs/firestore/best-practices
- Feature Flags: https://martinfowler.com/articles/feature-toggles.html

### 12.3 Contact Information

**Migration Team:**

- Technical Lead: [Name]
- Backend Lead: [Name]
- Frontend Lead: [Name]
- DevOps Lead: [Name]

**Support Channels:**

- Engineering Slack: #rats-migration
- Support Email: support@rats-app.com
- Emergency Hotline: [Number]

### 12.4 FAQ

**Q: Why migrate to activity-based system?**
A: The current Week/Day model doesn't scale well and limits our ability to query historical data, implement advanced analytics, and provide flexible reporting.

**Q: Will there be any downtime?**
A: No. The dual-write pattern ensures the app continues to work throughout migration.

**Q: What happens if something goes wrong?**
A: We can rollback at any time by disabling feature flags. All data is preserved in both systems during migration.

**Q: How long will migration take?**
A: 8-12 weeks total, rolled out gradually with feature flags controlling each phase.

**Q: Will my historical data be lost?**
A: No. All historical data is preserved and migrated to the new system. The original data remains in the database as backup.

**Q: Will the app look different?**
A: No. The UI remains the same. This is a backend/data model change that's transparent to users.

**Q: How will we know if migration is successful?**
A: We have automated verification scripts that compare data between old and new systems, plus manual testing and monitoring.

**Q: Can we rollback after full migration?**
A: Yes, though it becomes more complex after Phase 5. We maintain the ability to regenerate Week data from activities if needed.

**Q: What new features does this enable?**
A: Advanced analytics, predictive risk scoring, detailed activity timelines, flexible reporting, better dispute resolution, and more.

**Q: How much will Firestore costs increase?**
A: We expect approximately 10% increase due to more documents, but offset by smaller document sizes and better query efficiency.

### 12.5 Code Examples

**Example 1: Recording a Meeting (New System)**

```typescript
// User records meeting attendance
const recordMeeting = async (guest: Guest, meeting: RatsMeeting) => {
  const activity = await EnhancedActivityService.addActivity({
    residentId: guest.id,
    houseId: guest.houseId,
    type: 'meeting_attended',
    value: true,
    metadata: {
      meetingName: meeting.name,
      meetingLocation: meeting.street,
      verified: meeting.verified,
    },
  });

  // Activity service automatically updates daily and weekly summaries

  dispatch({
    type: 'ACTIVITY_ADDED',
    activity,
  });
};
```

**Example 2: Displaying Weekly Stats**

```typescript
// Component displays weekly performance
const WeeklyStats: React.FC<Props> = ({ guest }) => {
  const [summary, setSummary] = useState<WeeklyActivitySummary | null>(null);

  useEffect(() => {
    const loadSummary = async () => {
      const weekStart = getStartOfWeek();
      const summary = await EnhancedActivityService.getWeeklySummary(
        guest.id,
        weekStart,
      );
      setSummary(summary);
    };

    loadSummary();
  }, [guest.id]);

  if (!summary) return <LoadingIndicator />;

  return (
    <View>
      <StatRow label="Meetings" value={summary.totalMeetings} />
      <StatRow label="Hours Worked" value={summary.totalHoursWorked} />
      <StatRow label="Chores" value={summary.totalChoresCompleted} />
      <StatRow label="Health Score" value={summary.healthScore} />
    </View>
  );
};
```

**Example 3: Checking Phase Requirements**

```typescript
// Check if guest meets phase requirements
const checkRequirements = async (
  guest: Guest,
  house: House,
): Promise<RequirementStatus> => {
  const weekStart = getStartOfWeek();
  const summary = await EnhancedActivityService.getWeeklySummary(
    guest.id,
    weekStart,
  );

  const phaseRules = house.phases[guest.phase].rules;

  return {
    meetings: {
      required: phaseRules.meetings,
      actual: summary.totalMeetings,
      met: summary.totalMeetings >= phaseRules.meetings,
      percentage: Math.min(
        100,
        (summary.totalMeetings / phaseRules.meetings) * 100,
      ),
    },
    work: {
      required: phaseRules.work,
      actual: summary.totalHoursWorked,
      met: summary.totalHoursWorked >= phaseRules.work,
      percentage: Math.min(
        100,
        (summary.totalHoursWorked / phaseRules.work) * 100,
      ),
    },
    // ... other requirements
  };
};
```

**Example 4: Querying Historical Data**

```typescript
// Get all meetings in the last month
const getRecentMeetings = async (guestId: string) => {
  const thirtyDaysAgo = moment().subtract(30, 'days').format('YYYY-MM-DD');
  const today = getTodaysDate();

  const activities = await EnhancedActivityService.getActivities(guestId, {
    startDate: thirtyDaysAgo,
    endDate: today,
    types: ['meeting_attended'],
  });

  return activities.map(activity => ({
    date: activity.date,
    name: activity.metadata.meetingName,
    location: activity.metadata.meetingLocation,
    verified: activity.metadata.verified,
  }));
};
```

---

## 13. Conclusion

### 13.1 Summary

This migration from a hierarchical Week/Day data model to an event-sourced, activity-based system represents a significant architectural improvement for the RATS sober living app. The new paradigm offers:

- **Superior flexibility:** Query any date range, any activity type, any time period
- **Better scalability:** Smaller documents, faster queries, lower coupling
- **Enhanced capabilities:** Advanced analytics, predictive features, detailed timelines
- **Improved maintainability:** Simpler code, clearer separation of concerns
- **Perfect audit trail:** Every activity timestamped and preserved

### 13.2 Migration Approach

Our carefully designed migration strategy uses:

1. **Dual-write pattern** to maintain system stability
2. **Feature flags** for gradual, controlled rollout
3. **User segmentation** to minimize risk
4. **Comprehensive testing** at every phase
5. **Clear rollback procedures** for safety
6. **Continuous monitoring** to detect issues early

### 13.3 Expected Outcomes

Upon successful completion:

- ✅ **Zero downtime** throughout migration
- ✅ **Zero data loss** with complete historical preservation
- ✅ **Improved performance** (40% faster queries, 89% smaller writes)
- ✅ **New capabilities** enabling 5+ new features
- ✅ **Better user experience** with faster, more responsive app
- ✅ **Reduced technical debt** and improved maintainability
- ✅ **Foundation for future growth** and innovation

### 13.4 Timeline Recap

| Phase                         | Duration       | Key Milestones           |
| ----------------------------- | -------------- | ------------------------ |
| Phase 0: Preparation          | 1-2 weeks      | Infrastructure ready     |
| Phase 1: Dual-Write           | 2-3 weeks      | Both systems active      |
| Phase 2: UI Migration         | 2-3 weeks      | UI reads from new system |
| Phase 3: Cloud Functions      | 1-2 weeks      | Functions use new system |
| Phase 4: Historical Migration | 1-2 weeks      | All data migrated        |
| Phase 5: Cutover & Cleanup    | 1 week         | Old system deprecated    |
| **Total**                     | **8-12 weeks** | **Complete migration**   |

### 13.5 Next Steps

1. **Review this document** with engineering team
2. **Approve migration plan** with stakeholders
3. **Set up monitoring** and alerting infrastructure
4. **Create migration timeline** with specific dates
5. **Begin Phase 0** implementation
6. **Schedule regular check-ins** throughout migration
7. **Prepare rollback procedures** for each phase
8. **Communicate timeline** to all stakeholders

### 13.6 Final Thoughts

This migration is not just a technical upgrade—it's an investment in the future of the RATS platform. By modernizing our data architecture, we're enabling:

- **Better outcomes for guests** through advanced analytics and early intervention
- **More efficient operations** for house administrators
- **Faster feature development** for our engineering team
- **Improved reliability** and performance for all users

With careful planning, thorough testing, and gradual rollout, we can achieve this transformation with minimal risk and maximum benefit.

---

**Document Version:** 1.0  
**Last Updated:** November 27, 2025  
**Status:** Ready for Review  
**Next Review Date:** [To be scheduled]  
**Approved By:** [Pending]

---

**End of Document**

```typescript
// Cache weekly summaries in Redux for 1 hour
const getCachedWeeklySummary = (state, guestId, weekStart) => {
  const key = `${guestId}_${weekStart}`;
  const cached = state.activities.weeklySummaries[key];

  if (cached && Date.now() - cached.lastFetched < 3600000) {
    // 1 hour
    return cached;
  }

  return null; // Needs refresh
};
```

```javascript
// Remove unused indexes
// Keep only these essential indexes:
{
  "indexes": [
    // Most common: Get recent activities for a guest
    {
      "collectionGroup": "activities",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "residentId", "order": "ASCENDING" },
        { "fieldPath": "date", "order": "DESCENDING" }
      ]
    },
    // For filtered queries (by type)
    {
      "collectionGroup": "activities",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "residentId", "order": "ASCENDING" },
        { "fieldPath": "type", "order": "ASCENDING" },
        { "fieldPath": "date", "order": "DESCENDING" }
      ]
    },
    // For house-wide queries
    {
      "collectionGroup": "activities",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "houseId", "order": "ASCENDING" },
        { "fieldPath": "date", "order": "DESCENDING" }
      ]
    },
    // For weekly summary lookups
    {
      "collectionGroup": "weekly-summaries",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "residentId", "order": "ASCENDING" },
        { "fieldPath": "weekStartDate", "order": "DESCENDING" }
      ]
    }
  ]
}
```

```typescript
// New capabilities enabled by activity data:

// 1. Attendance patterns
const getMeetingAttendancePattern = async (guestId: string, months: number) => {
  const startDate = moment().subtract(months, 'months').format('YYYY-MM-DD');
  const activities = await getActivities(
    guestId,
    startDate,
    getTodaysDate(),
    'meeting_attended',
  );

  // Analyze by day of week
  const byDayOfWeek = _.groupBy(activities, a => moment(a.date).format('dddd'));

  return {
    mostCommonDay: _.maxBy(
      Object.keys(byDayOfWeek),
      day => byDayOfWeek[day].length,
    ),
    averagePerWeek: activities.length / (months * 4.33),
    trend: calculateTrend(activities),
  };
};

// 2. Work consistency tracking
const getWorkConsistency = async (guestId: string) => {
  // Track gaps in work history, compare week-over-week
  // Identify if guest is maintaining employment
};

// 3. Recovery trajectory
const getRecoveryScore = async (guestId: string) => {
  // Calculate improvement over time across all metrics
  // Compare current performance vs first month
};
```

```typescript
// Predict guests at risk of relapse based on activity patterns
const calculateRiskScore = (weeklySummaries: WeeklyActivitySummary[]) => {
  const recentWeeks = weeklySummaries.slice(0, 4);

  // Red flags:
  // - Declining meeting attendance
  // - Missing supporter meetings
  // - Inconsistent work
  // - Not completing chores

  let riskScore = 0;

  // Calculate trends
  const meetingTrend = calculateTrend(recentWeeks.map(w => w.totalMeetings));
  if (meetingTrend < -0.5) riskScore += 25; // Declining meetings

  const missedSupporter = recentWeeks.filter(
    w => w.supporterMeetings === 0,
  ).length;
  if (missedSupporter >= 2) riskScore += 20;

  // ... other risk factors

  return {
    score: riskScore, // 0-100
    risk: riskScore > 60 ? 'high' : riskScore > 30 ? 'medium' : 'low',
    recommendations: generateRecommendations(riskScore),
  };
};
```

```typescript
// Build comprehensive timeline view
const getActivityTimeline = async (guestId: string, days: number = 30) => {
  const activities = await getActivities(
    guestId,
    moment().subtract(days, 'days').format('YYYY-MM-DD'),
    getTodaysDate(),
  );

  // Group by date
  const timeline = _.groupBy(activities, 'date');

  // Add daily summaries
  for (const date of Object.keys(timeline)) {
    const summary = await getDailySummary(guestId, date);
    timeline[date] = {
      activities: timeline[date],
      summary,
      healthScore: calculateDailyHealthScore(summary),
    };
  }

  return timeline;
};
```

```typescript
// Compare guest performance to house average
const compareToHouseAverage = async (guestId: string, houseId: string) => {
  const weekStart = getStartOfWeek();

  // Get guest summary
  const guestSummary = await getWeeklySummary(guestId, weekStart);

  // Get all house summaries
  const houseSummaries = await weeklySummaryCollection
    .where('weekStartDate', '==', weekStart)
    .get();

  const houseActivities = houseSummaries.docs
    .map(d => d.data() as WeeklyActivitySummary)
    .filter(s => s.residentId !== guestId); // Exclude current guest

  const averages = {
    meetings: _.meanBy(houseActivities, 'totalMeetings'),
    hours: _.meanBy(houseActivities, 'totalHoursWorked'),
    chores: _.meanBy(houseActivities, 'totalChoresCompleted'),
    healthScore: _.meanBy(houseActivities, 'healthScore'),
  };

  return {
    guest: {
      meetings: guestSummary.totalMeetings,
      hours: guestSummary.totalHoursWorked,
      chores: guestSummary.totalChoresCompleted,
      healthScore: guestSummary.healthScore,
    },
    houseAverage: averages,
    percentiles: {
      meetings: calculatePercentile(
        guestSummary.totalMeetings,
        houseActivities.map(a => a.totalMeetings),
      ),
      hours: calculatePercentile(
        guestSummary.totalHoursWorked,
        houseActivities.map(a => a.totalHoursWorked),
      ),
      // ... etc
    },
  };
};
```

````markdown
# RATS Data Model - Activity-Based System

## Collections

### activities

Individual events representing guest activities.

**Document Structure:**

- `id`: string (auto-generated)
- `residentId`: string (foreign key)
- `houseId`: string (foreign key)
- `type`: ActivityType enum
- `date`: string (YYYY-MM-DD)
- `createdDate`: string (ISO 8601)
- `value`: number | boolean
- `metadata`: ActivityMetadata object
- `underDispute`: number
- `disputeResult`: enum

**Indexes:**

- (residentId, date DESC)
- (residentId, type, date DESC)
- (houseId, date DESC)

**Security Rules:**

- Read: Guest or house admin
- Write: Server only
- Delete: Never (immutable)

### daily-summaries

Cached daily aggregates for performance.

**Document ID Pattern:** `{residentId}_{date}`

**Update Strategy:**

- Incremental merge on activity creation
- Full recalculation on dispute resolution

### weekly-summaries

Cached weekly aggregates with health scores.

**Document ID Pattern:** `{residentId}_{weekStartDate}`

**Update Strategy:**

- Incremental on activity creation
- Full recalculation on dispute resolution
- Nightly recalculation (cloud function)

## Query Patterns

### Get recent activities for a guest

```typescript
const activities = await activityCollection
  .where('residentId', '==', guestId)
  .where('date', '>=', startDate)
  .where('date', '<=', endDate)
  .orderBy('date', 'desc')
  .limit(100)
  .get();
```
````

### Get weekly summary (preferred for stats)

```typescript
const summary = await weeklySummaryCollection
  .doc(`${guestId}_${weekStart}`)
  .get();
```

## Best Practices

1. **Always prefer summaries over activities** for read operations
2. **Use batch writes** when creating activities
3. **Limit query ranges** to reduce costs
4. **Cache summaries** in Redux/state management
5. **Never delete activities** - mark as disputed instead

````

```typescript
# Activity-Based System Migration - Retrospective

## Migration Timeline
- Planning: [dates]
- Phase 0: [dates]
- Phase 1: [dates]
- Phase 2: [dates]
- Phase 3: [dates]
- Phase 4: [dates]
- Phase 5: [dates]

## Metrics
- Total users migrated: X
- Data migrated: X GB
- Activities created: X million
- Migration duration: X hours
- Downtime: 0 minutes
- Data loss: 0%

## What Went Well
- [List successes]
- Feature flags enabled smooth rollout
- Dual-write prevented data loss
- etc.

## What Could Be Improved
- [List challenges]
- Migration took longer than expected
- Index creation delayed rollout
- etc.

## Lessons Learned
- [Key learnings]
- Always test at production scale
- Feature flags are essential
- etc.

## Future Recommendations
- [Recommendations for future migrations]
````

```markdown
# Activity-Based System Migration - Retrospective

## Migration Timeline

- Planning: [dates]
- Phase 0: [dates]
- Phase 1: [dates]
- Phase 2: [dates]
- Phase 3: [dates]
- Phase 4: [dates]
- Phase 5: [dates]

## Metrics

- Total users migrated: X
- Data migrated: X GB
- Activities created: X million
- Migration duration: X hours
- Downtime: 0 minutes
- Data loss: 0%

## What Went Well

- [List successes]
- Feature flags enabled smooth rollout
- Dual-write prevented data loss
- etc.

## What Could Be Improved

- [List challenges]
- Migration took longer than expected
- Index creation delayed rollout
- etc.

## Lessons Learned

- [Key learnings]
- Always test at production scale
- Feature flags are essential
- etc.

## Future Recommendations

- [Recommendations for future migrations]
```

```plaintext
// User records meeting attendance
const recordMeeting = async (guest: Guest, meeting: RatsMeeting) => {
  const activity = await EnhancedActivityService.addActivity({
    residentId: guest.id,
    houseId: guest.houseId,
    type: 'meeting_attended',
    value: true,
    metadata: {
      meetingName: meeting.name,
      meetingLocation: meeting.street,
      verified: meeting.verified
    }
  });

  // Activity service automatically updates daily and weekly summaries

  dispatch({
    type: 'ACTIVITY_ADDED',
    activity
  });
};
```

```typescript
// User records meeting attendance
const recordMeeting = async (guest: Guest, meeting: RatsMeeting) => {
  const activity = await EnhancedActivityService.addActivity({
    residentId: guest.id,
    houseId: guest.houseId,
    type: 'meeting_attended',
    value: true,
    metadata: {
      meetingName: meeting.name,
      meetingLocation: meeting.street,
      verified: meeting.verified,
    },
  });

  // Activity service automatically updates daily and weekly summaries

  dispatch({
    type: 'ACTIVITY_ADDED',
    activity,
  });
};
```

```typescript
// Component displays weekly performance
const WeeklyStats: React.FC<Props> = ({ guest }) => {
  const [summary, setSummary] = useState<WeeklyActivitySummary | null>(null);

  useEffect(() => {
    const loadSummary = async () => {
      const weekStart = getStartOfWeek();
      const summary = await EnhancedActivityService.getWeeklySummary(
        guest.id,
        weekStart,
      );
      setSummary(summary);
    };

    loadSummary();
  }, [guest.id]);

  if (!summary) return <LoadingIndicator />;

  return (
    <View>
      <StatRow label="Meetings" value={summary.totalMeetings} />
      <StatRow label="Hours Worked" value={summary.totalHoursWorked} />
      <StatRow label="Chores" value={summary.totalChoresCompleted} />
      <StatRow label="Health Score" value={summary.healthScore} />
    </View>
  );
};
```

```typescript
// Component displays weekly performance
const WeeklyStats: React.FC<Props> = ({ guest }) => {
  const [summary, setSummary] = useState<WeeklyActivitySummary | null>(null);

  useEffect(() => {
    const loadSummary = async () => {
      const weekStart = getStartOfWeek();
      const summary = await EnhancedActivityService.getWeeklySummary(
        guest.id,
        weekStart,
      );
      setSummary(summary);
    };

    loadSummary();
  }, [guest.id]);

  if (!summary) return <LoadingIndicator />;

  return (
    <View>
      <StatRow label="Meetings" value={summary.totalMeetings} />
      <StatRow label="Hours Worked" value={summary.totalHoursWorked} />
      <StatRow label="Chores" value={summary.totalChoresCompleted} />
      <StatRow label="Health Score" value={summary.healthScore} />
    </View>
  );
};
```

```typescript
// Check if guest meets phase requirements
const checkRequirements = async (
  guest: Guest,
  house: House,
): Promise<RequirementStatus> => {
  const weekStart = getStartOfWeek();
  const summary = await EnhancedActivityService.getWeeklySummary(
    guest.id,
    weekStart,
  );

  const phaseRules = house.phases[guest.phase].rules;

  return {
    meetings: {
      required: phaseRules.meetings,
      actual: summary.totalMeetings,
      met: summary.totalMeetings >= phaseRules.meetings,
      percentage: Math.min(
        100,
        (summary.totalMeetings / phaseRules.meetings) * 100,
      ),
    },
    work: {
      required: phaseRules.work,
      actual: summary.totalHoursWorked,
      met: summary.totalHoursWorked >= phaseRules.work,
      percentage: Math.min(
        100,
        (summary.totalHoursWorked / phaseRules.work) * 100,
      ),
    },
    // ... other requirements
  };
};
```

```typescript
// Check if guest meets phase requirements
const checkRequirements = async (
  guest: Guest,
  house: House,
): Promise<RequirementStatus> => {
  const weekStart = getStartOfWeek();
  const summary = await EnhancedActivityService.getWeeklySummary(
    guest.id,
    weekStart,
  );

  const phaseRules = house.phases[guest.phase].rules;

  return {
    meetings: {
      required: phaseRules.meetings,
      actual: summary.totalMeetings,
      met: summary.totalMeetings >= phaseRules.meetings,
      percentage: Math.min(
        100,
        (summary.totalMeetings / phaseRules.meetings) * 100,
      ),
    },
    work: {
      required: phaseRules.work,
      actual: summary.totalHoursWorked,
      met: summary.totalHoursWorked >= phaseRules.work,
      percentage: Math.min(
        100,
        (summary.totalHoursWorked / phaseRules.work) * 100,
      ),
    },
    // ... other requirements
  };
};
```

```typescript
// Get all meetings in the last month
const getRecentMeetings = async (guestId: string) => {
  const thirtyDaysAgo = moment().subtract(30, 'days').format('YYYY-MM-DD');
  const today = getTodaysDate();

  const activities = await EnhancedActivityService.getActivities(guestId, {
    startDate: thirtyDaysAgo,
    endDate: today,
    types: ['meeting_attended'],
  });

  return activities.map(activity => ({
    date: activity.date,
    name: activity.metadata.meetingName,
    location: activity.metadata.meetingLocation,
    verified: activity.metadata.verified,
  }));
};
```

```typescript
// Get all meetings in the last month
const getRecentMeetings = async (guestId: string) => {
  const thirtyDaysAgo = moment().subtract(30, 'days').format('YYYY-MM-DD');
  const today = getTodaysDate();

  const activities = await EnhancedActivityService.getActivities(guestId, {
    startDate: thirtyDaysAgo,
    endDate: today,
    types: ['meeting_attended'],
  });

  return activities.map(activity => ({
    date: activity.date,
    name: activity.metadata.meetingName,
    location: activity.metadata.meetingLocation,
    verified: activity.metadata.verified,
  }));
};
```

```typescript
// Get all meetings in the last month
const getRecentMeetings = async (guestId: string) => {
  const thirtyDaysAgo = moment().subtract(30, 'days').format('YYYY-MM-DD');
  const today = getTodaysDate();

  const activities = await EnhancedActivityService.getActivities(guestId, {
    startDate: thirtyDaysAgo,
    endDate: today,
    types: ['meeting_attended'],
  });

  return activities.map(activity => ({
    date: activity.date,
    name: activity.metadata.meetingName,
    location: activity.metadata.meetingLocation,
    verified: activity.metadata.verified,
  }));
};
```
