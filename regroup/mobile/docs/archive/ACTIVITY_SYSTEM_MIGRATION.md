---
archived: true
archived_date: 2026-05-24
reason: 'Activity system migration completed (M1-M3 done as of Apr 2026). 2804-line guide no longer operational.'
---

# RATS Sober Living App: Hybrid Activity System Architecture & Migration Guide

**Version:** 2.0  
**Date:** November 27, 2025  
**Status:** Final Recommendation  
**Target Platform:** Firebase (Firestore, Cloud Functions, Realtime Database, Cloud Storage)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Firebase Ecosystem Analysis](#2-firebase-ecosystem-analysis)
3. [New Paradigm: Hybrid Activity Architecture](#3-new-paradigm-hybrid-activity-architecture)
4. [Data Model Specification](#4-data-model-specification)
5. [Implementation Details](#5-implementation-details)
6. [Risk Assessment](#6-risk-assessment)
7. [Migration Strategy](#7-migration-strategy)
8. [Cost Analysis](#8-cost-analysis)
9. [Testing & Validation](#9-testing--validation)
10. [Post-Migration Optimization](#10-post-migration-optimization)

---

## 1. Executive Summary

### 1.1 Current Problem

The RATS sober living app tracks guest activities (meetings attended, work hours, chores completed, etc.) using a **nested Week/Day data model** where:

- Guest documents contain embedded `currentWeek` and `previousWeek` objects (~18KB each)
- Each Week contains 7 Day objects with stats as fields
- Historical data requires archiving entire Week objects
- Querying across time periods requires loading and iterating nested structures

**Key Limitations:**

- ❌ Cannot efficiently query "all meetings in November" without loading all weeks
- ❌ Large document writes (18KB) for small stat updates
- ❌ Complex weekly transfer logic prone to race conditions
- ❌ Limited audit trail (no exact timestamps)
- ❌ Difficult dispute resolution (nested updates)

### 1.2 Proposed Solution: Hybrid Activity Architecture

A **Firebase-optimized hybrid approach** that leverages Firestore's strengths while avoiding its cost pitfalls:

1. **Subcollection-based structure** for natural hierarchical queries
2. **Week documents with daily stat maps AND activity log array** for fast reads
3. **`house-activities` collection** for efficient house-wide activity feed
4. **Firestore triggers** for real-time summary updates
5. **Full dispute support** - any activity can be disputed by other guests

**Key Benefits:**

- ✅ Efficient house-wide activity feed (single query)
- ✅ Complete activity log with timestamps
- ✅ Any activity can be disputed
- ✅ Natural security rules via document hierarchy
- ✅ Simple queries without complex indexes

### 1.3 Migration Approach

A **4-phase migration over 6-8 weeks**:

| Phase   | Duration  | Description                                                |
| ------- | --------- | ---------------------------------------------------------- |
| Phase 1 | 2 weeks   | Infrastructure setup, parallel write to new subcollections |
| Phase 2 | 2 weeks   | UI migration to read from new structure                    |
| Phase 3 | 1-2 weeks | Cloud Functions migration, historical data migration       |
| Phase 4 | 1 week    | Cutover, cleanup, monitoring                               |

---

## 2. Firebase Ecosystem Analysis

### 2.1 Firestore: Strengths & Weaknesses

#### Strengths (Leverage These)

| Strength                            | How We Leverage It                                    |
| ----------------------------------- | ----------------------------------------------------- |
| **Hierarchical document structure** | Use subcollections: `guests/{guestId}/weeks/{weekId}` |
| **Strong consistency**              | Reliable real-time updates, no stale data             |
| **Offline persistence**             | Better UX for guests with spotty connectivity         |
| **Atomic batch writes**             | Update multiple documents safely                      |
| **FieldValue.increment()**          | Efficient counter updates without read-modify-write   |
| **FieldValue.arrayUnion()**         | Append to arrays without conflicts                    |
| **Collection group queries**        | Query across all guests' activities when needed       |
| **Aggregation queries (count/sum)** | Calculate stats without reading documents             |
| **Real-time listeners**             | Live UI updates for stat changes                      |
| **Security rules**                  | Hierarchical rules match document structure           |

#### Weaknesses (Avoid These)

| Weakness                             | Mitigation Strategy                        |
| ------------------------------------ | ------------------------------------------ |
| **Writes cost more than reads**      | Minimize write operations via hybrid model |
| **Composite indexes slow writes**    | Use subcollections to reduce index needs   |
| **500 doc transaction limit**        | Use batched writes, process in chunks      |
| **No server-side joins**             | Denormalize data strategically             |
| **IN queries limited to 30 values**  | Use collection group queries instead       |
| **1MB document limit**               | Keep documents small via subcollections    |
| **Index explosion with many fields** | Limit indexed fields per collection        |

### 2.2 Cloud Functions: Strengths & Weaknesses

#### Strengths

| Strength                      | How We Leverage It                 |
| ----------------------------- | ---------------------------------- |
| **Firestore triggers**        | Real-time summary updates on write |
| **Scheduled functions**       | Nightly health score recalculation |
| **HTTP callables**            | Admin operations, batch migrations |
| **Background retry**          | Reliable summary propagation       |
| **Integrated authentication** | Secure admin-only operations       |

#### Weaknesses

| Weakness                   | Mitigation Strategy                     |
| -------------------------- | --------------------------------------- |
| **Cold starts (1-3s)**     | Use min instances for critical paths    |
| **540s timeout**           | Chunk large operations, use Cloud Tasks |
| **Memory limits**          | Stream data, avoid loading all docs     |
| **No guaranteed ordering** | Idempotent operations, timestamps       |

### 2.3 Realtime Database: Potential Use Cases

While Firestore is our primary store, **Realtime Database excels at**:

| Use Case                 | Consideration                             |
| ------------------------ | ----------------------------------------- |
| **Presence system**      | Track who's online in house               |
| **Live activity feed**   | Real-time notifications of house activity |
| **Typing indicators**    | Chat features                             |
| **Low-latency counters** | Daily activity counts (if needed)         |

**Recommendation:** Consider Realtime Database for a live "house activity feed" showing real-time updates of all guest activities. This provides social accountability.

```
/activity-feed/{houseId}/{activityId}
  - guestName: "John D."
  - type: "meeting_attended"
  - message: "Attended Monday Night AA"
  - timestamp: 1701100000000
  - (auto-expire after 7 days via TTL)
```

### 2.4 Cloud Storage: Archival Strategy

For long-term data retention and cost optimization:

| Use Case                    | Strategy                         |
| --------------------------- | -------------------------------- |
| **Old week data (>1 year)** | Export to Cloud Storage as JSON  |
| **Activity audit logs**     | Archive to Cloud Storage monthly |
| **Compliance exports**      | Generate periodic data exports   |

---

## 3. New Paradigm: Hybrid Activity Architecture

### 3.1 Core Principles

#### Principle 1: Minimize Writes, Optimize Reads

Firestore charges $0.18 per 100K writes vs $0.06 per 100K reads. Design for few writes, many reads.

**Implementation:**

- Store aggregated stats in week documents (1 write updates many stats)
- Only create activity documents for auditable events
- Use `FieldValue.increment()` to avoid read-modify-write cycles

#### Principle 2: Hierarchical Data = Hierarchical Security

Firestore security rules naturally cascade through document hierarchy.

**Implementation:**

- `guests/{guestId}/weeks/{weekId}` - Only guest and house admins can access
- `guests/{guestId}/activities/{activityId}` - Same permissions, simpler rules

#### Principle 3: Denormalize for Query Patterns

Firestore has no joins. Store data where you query it.

**Implementation:**

- Week documents contain daily stats map (no need to query activities)
- House documents contain aggregate health scores
- Activity documents contain denormalized guest name and house ID

#### Principle 4: Event-Driven Updates

Use Firestore triggers instead of polling or scheduled functions where possible.

**Implementation:**

- Week document update triggers health score recalculation
- Activity creation triggers notifications and feed updates

### 3.2 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           FIRESTORE DATABASE                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Collection: guests                                                      │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ Document: {guestId}                                                 │ │
│  │   firstName, lastName, email, phase, houseId                        │ │
│  │   currentChore, primarySupporterId, primarySupporterName, step      │ │
│  │   (NO nested week data)                                             │ │
│  │                                                                      │ │
│  │   Subcollection: weeks                                              │ │
│  │   ┌────────────────────────────────────────────────────────────┐   │ │
│  │   │ Document: {weekId} (e.g., "2025-W48")                       │   │ │
│  │   │                                                             │   │ │
│  │   │   // Week Configuration                                     │   │ │
│  │   │   startDate: "2025-11-24"                                   │   │ │
│  │   │   endDate: "2025-11-30"                                     │   │ │
│  │   │   chore: { name: "Kitchen", description: "..." }            │   │ │
│  │   │   primarySupporterName: "Mike Smith"                        │   │ │
│  │   │   step: 4                                                   │   │ │
│  │   │                                                             │   │ │
│  │   │   // Daily Stats (for calendar/stat views)                  │   │ │
│  │   │   days: {                                                   │   │ │
│  │   │     "2025-11-24": {                                         │   │ │
│  │   │       meetings: 1, meetingNames: ["Monday Night AA"],       │   │ │
│  │   │       hoursWorked: 8, choreCompleted: true, ...             │   │ │
│  │   │     },                                                      │   │ │
│  │   │     ...                                                     │   │ │
│  │   │   }                                                         │   │ │
│  │   │                                                             │   │ │
│  │   │   // Aggregated Totals                                      │   │ │
│  │   │   totals: { meetings: 3, hoursWorked: 24, chores: 4, ... }  │   │ │
│  │   │                                                             │   │ │
│  │   │   // Activity Log (for guest's activity history + disputes) │   │ │
│  │   │   activities: [                                             │   │ │
│  │   │     {                                                       │   │ │
│  │   │       id: "act-123",                                        │   │ │
│  │   │       type: "meeting_attended",                             │   │ │
│  │   │       date: "2025-11-24",                                   │   │ │
│  │   │       createdAt: "2025-11-24T19:30:00Z",                    │   │ │
│  │   │       displayText: "Attended Monday Night AA",              │   │ │
│  │   │       metadata: { meetingName: "Monday Night AA" },         │   │ │
│  │   │       disputeStatus: "none",                                │   │ │
│  │   │       disputeCount: 0                                       │   │ │
│  │   │     },                                                      │   │ │
│  │   │     { id: "act-124", type: "hours_worked", ... },           │   │ │
│  │   │     ...                                                     │   │ │
│  │   │   ]                                                         │   │ │
│  │   │                                                             │   │ │
│  │   │   healthScore: 85                                           │   │ │
│  │   └────────────────────────────────────────────────────────────┘   │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  Collection: house-activities  ← HOUSE-WIDE ACTIVITY FEED               │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ Document: {activityId}                                              │ │
│  │   id: "act-123"                                                     │ │
│  │   houseId: "house-456"               ← Indexed for feed queries     │ │
│  │   guestId: "guest-789"                                              │ │
│  │   guestName: "John D."               ← Denormalized for display     │ │
│  │   weekId: "2025-W48"                 ← Reference back to week doc   │ │
│  │   type: "meeting_attended"                                          │ │
│  │   date: "2025-11-24"                                                │ │
│  │   createdAt: Timestamp               ← Indexed for sorting          │ │
│  │   displayText: "Attended Monday Night AA"                           │ │
│  │   metadata: { meetingName: "Monday Night AA", verified: true }      │ │
│  │   disputeStatus: "none" | "pending" | "resolved_for" | "resolved_against" │
│  │   disputeCount: 0                                                   │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  Collection: houses                                                      │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ Document: {houseId}                                                 │ │
│  │   name, address, phases, chores                                     │ │
│  │   disputes: {                        ← Active disputes map          │ │
│  │     "dispute-123": {                                                │ │
│  │       activityId, victimGuestId, disputerId, status, ...            │ │
│  │     }                                                               │ │
│  │   }                                                                 │ │
│  │   health: { "2025-11-23": 82, ... }                                │ │
│  │   currentWeekHealth: 85                                             │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  Collection: guest-reports (UNCHANGED - for historical compatibility)   │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ Document: {reportId}                                                │ │
│  │   Generated weekly from week documents                              │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                            CLOUD FUNCTIONS                               │
├─────────────────────────────────────────────────────────────────────────┤
│  Firestore Triggers:                                                     │
│    onWeekWrite → Recalculate health score, update house stats           │
│    onHouseActivityCreate → Send notifications for new activities        │
│                                                                          │
│  Scheduled Functions:                                                    │
│    weeklyReportGeneration (Sunday 2 AM) → Create guest-reports          │
│    resolveExpiredDisputes (Daily 2 AM) → Auto-resolve 48hr disputes     │
│    monthlyArchive (1st of month) → Archive old data to Cloud Storage    │
│                                                                          │
│  HTTP Callables:                                                         │
│    migrateGuestData → Admin migration operations                        │
│    recalculateHealthScores → Manual recalculation                       │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Data Flow Examples

#### Example 1: Guest Records a Meeting

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     Recording a Meeting Attendance                        │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  1. User taps "I attended a meeting"                                     │
│     │                                                                     │
│     ▼                                                                     │
│  2. Client validates meeting selection                                   │
│     │                                                                     │
│     ▼                                                                     │
│  3. BATCH Firestore Write (atomic, 2 operations):                        │
│     ┌─────────────────────────────────────────────────────────────────┐  │
│     │ Operation 1: guests/{guestId}/weeks/{weekId}                     │  │
│     │   days.{today}.meetings: FieldValue.increment(1)                 │  │
│     │   days.{today}.meetingNames: FieldValue.arrayUnion("Monday AA")  │  │
│     │   totals.meetings: FieldValue.increment(1)                       │  │
│     │   activities: FieldValue.arrayUnion({                            │  │
│     │     id: "act-123", type: "meeting_attended",                     │  │
│     │     date: "2025-11-27", createdAt: "2025-11-27T19:30:00Z",       │  │
│     │     displayText: "Attended Monday Night AA",                     │  │
│     │     metadata: { meetingName: "Monday Night AA" },                │  │
│     │     disputeStatus: "none", disputeCount: 0                       │  │
│     │   })                                                             │  │
│     │   updatedAt: serverTimestamp()                                   │  │
│     │                                                                   │  │
│     │ Operation 2: house-activities/{activityId}                       │  │
│     │   id: "act-123"                                                  │  │
│     │   houseId: "house-456"                                           │  │
│     │   guestId: "guest-789"                                           │  │
│     │   guestName: "John D."                                           │  │
│     │   weekId: "2025-W48"                                             │  │
│     │   type: "meeting_attended"                                       │  │
│     │   date: "2025-11-27"                                             │  │
│     │   createdAt: serverTimestamp()                                   │  │
│     │   displayText: "Attended Monday Night AA"                        │  │
│     │   metadata: { meetingName: "Monday Night AA" }                   │  │
│     │   disputeStatus: "none"                                          │  │
│     │   disputeCount: 0                                                │  │
│     └─────────────────────────────────────────────────────────────────┘  │
│     │                                                                     │
│     ▼                                                                     │
│  4. Firestore Trigger fires (onWeekWrite):                               │
│     ┌─────────────────────────────────────────────────────────────────┐  │
│     │ • Recalculate week health score                                  │  │
│     │ • Update house.currentWeekHealth (aggregated)                    │  │
│     └─────────────────────────────────────────────────────────────────┘  │
│     │                                                                     │
│     ▼                                                                     │
│  5. Other house guests receive real-time update to activity feed         │
│     │                                                                     │
│     ▼                                                                     │
│  6. UI updates: stat count + activity appears in house feed              │
│                                                                           │
│  Total Firestore Operations:                                             │
│    • Writes: 2 (week document + house-activities)                        │
│    • Reads: 1 (trigger reads week to calculate health)                   │
│    • Cost: ~$0.0000042 per meeting                                       │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

#### Example 2: Guest Records Meeting That Requires Verification

```
┌──────────────────────────────────────────────────────────────────────────┐
│              Recording a Meeting That Requires Verification               │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  1. User selects meeting with verification requirement                   │
│     │                                                                     │
│     ▼                                                                     │
│  2. Client verifies user location against meeting location               │
│     │                                                                     │
│     ▼                                                                     │
│  3. Firestore Batch Write (atomic):                                      │
│     ┌─────────────────────────────────────────────────────────────────┐  │
│     │ Operation 1: guests/{guestId}/weeks/{weekId}                     │  │
│     │   days.{today}.meetings: FieldValue.increment(1)                 │  │
│     │   days.{today}.meetingNames: FieldValue.arrayUnion("Monday AA")  │  │
│     │   totals.meetings: FieldValue.increment(1)                       │  │
│     │                                                                   │  │
│     │ Operation 2: guests/{guestId}/activities/{activityId}            │  │
│     │   type: "meeting_attended"                                        │  │
│     │   date: "2025-11-27"                                              │  │
│     │   createdAt: serverTimestamp()                                    │  │
│     │   metadata: {                                                     │  │
│     │     meetingName: "Monday Night AA",                               │  │
│     │     meetingLocation: { lat, lng },                                │  │
│     │     userLocation: { lat, lng },                                   │  │
│     │     verified: true,                                               │  │
│     │     distance: 50 // meters from meeting                           │  │
│     │   }                                                               │  │
│     │   houseId: "house123"                                             │  │
│     │   disputeStatus: "none"                                           │  │
│     └─────────────────────────────────────────────────────────────────┘  │
│     │                                                                     │
│     ▼                                                                     │
│  4. Both triggers fire:                                                  │
│     • onWeekWrite → Update health scores                                │
│     • onActivityCreate → Push to feed, potential notification           │
│                                                                           │
│  Total Firestore Operations:                                             │
│    • Writes: 2 (week + activity)                                         │
│    • Reads: 2 (triggers)                                                 │
│    • Cost: ~$0.0000048 per verified meeting                              │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

#### Example 3: Admin Initiates Dispute

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         Dispute Resolution Flow                           │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  1. Admin questions guest's meeting attendance                           │
│     │                                                                     │
│     ▼                                                                     │
│  2. Admin searches activities for specific date                          │
│     Query: guests/{guestId}/activities                                   │
│            WHERE date == "2025-11-25"                                    │
│            WHERE type == "meeting_attended"                              │
│     │                                                                     │
│     ▼                                                                     │
│  3. Admin selects activity to dispute                                    │
│     │                                                                     │
│     ▼                                                                     │
│  4. Firestore Transaction (atomic):                                      │
│     ┌─────────────────────────────────────────────────────────────────┐  │
│     │ Operation 1: Update activity                                      │  │
│     │   guests/{guestId}/activities/{activityId}                        │  │
│     │     disputeStatus: "pending"                                      │  │
│     │     disputeInitiatedBy: "admin456"                                │  │
│     │     disputeInitiatedAt: serverTimestamp()                         │  │
│     │                                                                   │  │
│     │ Operation 2: Update week stats (provisional)                      │  │
│     │   guests/{guestId}/weeks/{weekId}                                 │  │
│     │     days.{date}.meetingsUnderDispute: FieldValue.increment(1)     │  │
│     │                                                                   │  │
│     │ Operation 3: Create dispute record                                │  │
│     │   houses/{houseId}.disputes.{disputeId}: {                        │  │
│     │     activityId, guestId, type, initiatedAt, status: "pending"     │  │
│     │   }                                                               │  │
│     └─────────────────────────────────────────────────────────────────┘  │
│     │                                                                     │
│     ▼                                                                     │
│  5. Guest notified of dispute (can challenge)                            │
│     │                                                                     │
│     ▼                                                                     │
│  6. 48 hours pass, scheduled function runs                               │
│     │                                                                     │
│     ▼                                                                     │
│  7. Dispute resolution:                                                  │
│     IF no challenge AND verification failed:                            │
│       • activity.disputeStatus = "resolved_against"                     │
│       • week.days.{date}.meetings: FieldValue.increment(-1)             │
│       • week.totals.meetings: FieldValue.increment(-1)                  │
│       • Recalculate health score                                        │
│     ELSE:                                                                │
│       • activity.disputeStatus = "resolved_for"                         │
│       • week.days.{date}.meetingsUnderDispute: FieldValue.increment(-1) │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

---

_Continued in sections 4-10 below..._

## 4. Data Model Specification

### 4.1 Guest Document (Root Level)

**Path:** `guests/{guestId}`

**Purpose:** Profile data and current configuration (NO temporal/activity data)

```typescript
interface Guest {
  // Identity
  id: string;
  userId: string; // Firebase Auth UID
  houseId: string;

  // Profile
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  avatar?: string;

  // Recovery Info
  sobrietyDate: string; // YYYY-MM-DD
  drugOfChoice: string;
  phase: string; // Phase name (references house.phases)
  step: number; // Current step (1-12)

  // Current Assignments (updated weekly or as needed)
  currentChore: string; // Chore name
  primarySupporterId?: string; // Sponsor guest ID
  primarySupporterName?: string; // Denormalized for display
  sponsees: string[]; // Guest IDs of people they sponsor

  // Financial
  rentOwed: number;
  choreFees: number;

  // Metadata
  jobs: Job[]; // Employment info
  isAdmin: boolean;
  roles?: Roles;
  infoEntered: boolean;
  createdDate: string;
  updatedDate: string;

  // REMOVED: currentWeek, previousWeek, nextWeek
}
```

**Size:** ~2-4KB (down from 18-25KB)

### 4.2 Week Document (Subcollection)

**Path:** `guests/{guestId}/weeks/{weekId}`

**Document ID Format:** `YYYY-Www` (e.g., `2025-W48`)

**Purpose:** Aggregated stats for a week, daily breakdown, AND activity log

```typescript
interface WeekDocument {
  // Week Boundaries
  id: string; // Same as document ID
  startDate: string; // YYYY-MM-DD (Sunday)
  endDate: string; // YYYY-MM-DD (Saturday)

  // Week Configuration (snapshot at start of week)
  chore: {
    name: string;
    description: string;
  };
  primarySupporterId: string;
  primarySupporterName: string;
  step: number | string;

  // Daily Stats (keyed by YYYY-MM-DD)
  days: {
    [date: string]: DayStats;
  };

  // Aggregated Totals (updated on each stat change)
  totals: WeekTotals;

  // Activity Log (for guest's activity history and disputes)
  activities: ActivityLogEntry[];

  // Calculated Scores
  healthScore: number; // 0-100, calculated by trigger

  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
  migratedFromLegacy?: boolean; // True if migrated from old system
}

interface DayStats {
  // Core accountability counts
  meetings: number;
  meetingNames: string[]; // For display in UI
  hoursWorked: number;
  hoursWorkedByJob: {
    // Breakdown by employer
    [jobName: string]: number;
  };

  // Booleans
  choreCompleted: boolean;
  metSupporter: boolean;
  medication: boolean;

  // Curfew & Overnight tracking
  curfewCheckedIn: boolean; // GPS-verified curfew check-in
  curfewCheckinTime?: string; // ISO timestamp of check-in
  overnightApproved?: boolean; // If overnight was requested & approved

  // Sponsor/Step tracking
  metSponsor: boolean; // Met with 12-step sponsor specifically

  // Dispute Tracking
  meetingsUnderDispute: number;
  hoursUnderDispute: number;
  activitiesUnderDispute: number; // Generic count for other disputed activities
}

interface WeekTotals {
  // Core phase requirements
  meetings: number;
  hoursWorked: number;
  choresCompleted: number; // Count of days with chore done
  supporterMet: boolean; // True if any day has metSupporter
  medications: number; // Count of days with medication taken

  // Curfew compliance
  curfewsMet: number; // Days curfew was met (out of required)
  curfewsMissed: number; // Days curfew was missed

  // Overnight tracking
  overnightsUsed: number; // Nights spent away from home
  overnightsAllowed: number; // Max allowed per phase (denormalized)

  // Sponsor/Step tracking
  sponsorMeetings: number; // Times met with sponsor this week
  currentStep: number; // Current step in 12-step program
}

interface ActivityLogEntry {
  id: string; // UUID for dispute reference
  type: ActivityType;
  date: string; // YYYY-MM-DD
  createdAt: string; // ISO timestamp (exact time)
  displayText: string; // Human-readable: "Attended Monday Night AA"
  value: number | boolean;

  // Type-specific details (comprehensive for all activity types)
  metadata: ActivityMetadata;

  // Dispute tracking
  disputeStatus: 'none' | 'pending' | 'resolved_for' | 'resolved_against';
  disputeCount: number; // Number of guests who disputed this
}

interface ActivityMetadata {
  // Meeting details
  meetingName?: string;
  meetingType?: 'AA' | 'NA' | 'IOP' | 'Celebrate Recovery' | 'Custom';
  meetingLocation?: string;

  // Work details
  jobName?: string;
  hours?: number;
  workType?: 'employment' | 'job_seeking' | 'school' | 'volunteering';

  // Chore details
  choreName?: string;
  choreDescription?: string;

  // Sponsor/Supporter details
  supporterName?: string;
  supporterType?: 'sponsor' | 'family' | 'friend' | 'counselor';

  // Curfew details
  curfewTime?: string; // Required curfew time
  checkinTime?: string; // Actual check-in time
  checkinLocation?: { lat: number; lng: number };

  // Overnight details
  overnightReason?: string;
  overnightLocation?: string;
  approvedBy?: string; // Manager who approved

  // Step work details
  stepNumber?: number; // 1-12
  stepNotes?: string;

  // Medication details
  medicationName?: string;
  medicationType?: 'MAT' | 'psychiatric' | 'other';

  // Phase advancement
  fromPhase?: string;
  toPhase?: string;

  // Issue details
  issueType?: 'maintenance' | 'house' | 'guest';
  issueDescription?: string;

  // Dispute details (for dispute_initiated type)
  disputedActivityId?: string;
  disputeReason?: string;

  // Verification
  verified?: boolean;
  verificationMethod?: 'gps' | 'manual' | 'admin';
  verificationDistance?: number; // Meters from expected location
}

type ActivityType =
  // Core accountability activities (Phase system)
  | 'meeting_attended' // AA, NA, IOP, Celebrate Recovery meetings
  | 'hours_worked' // Work, job-seeking, school, volunteering
  | 'chore_completed' // Daily chore completion
  | 'supporter_met' // Met with sponsor/supporter
  | 'medication_taken' // MAT tracking (Suboxone, etc.)

  // Location-based activities
  | 'curfew_checkin' // GPS check-in for curfew compliance
  | 'overnight_request' // Request to spend night away from home

  // Recovery progression
  | 'step_completed' // Completed a step in 12-step program
  | 'sponsor_meeting' // Specific meeting with sponsor (distinct from supporter)

  // Administrative activities (visible in activity log)
  | 'phase_advanced' // Guest moved to next phase
  | 'payment_made' // Rent/fee payment (future)
  | 'issue_reported' // Maintenance/house/guest issue logged

  // Manager actions (for audit trail)
  | 'chore_assigned' // Manager assigned chore to guest
  | 'dispute_initiated' // Someone disputed an activity
  | 'dispute_resolved'; // Dispute was resolved
```

**Size:** ~2-5KB per week (activities array adds ~200 bytes per activity, ~50 activities max)

### 4.3 House Activity Document (Top-Level Collection)

**Path:** `house-activities/{activityId}`

**Purpose:** House-wide activity feed - enables efficient querying of all activities across all guests

```typescript
interface HouseActivityDocument {
  // Identity
  id: string; // Same as document ID, matches ActivityLogEntry.id

  // Relationships (for queries and display)
  houseId: string; // Indexed - filter by house
  guestId: string; // Reference to guest
  guestName: string; // Denormalized: "John D." for privacy
  weekId: string; // Reference back to week doc for updates

  // Activity Data
  type: ActivityType;
  date: string; // YYYY-MM-DD
  createdAt: Timestamp; // Indexed - sort by time
  displayText: string; // "Attended Monday Night AA"
  value: number | boolean;

  // Type-specific details (same as ActivityLogEntry)
  metadata: ActivityMetadata;

  // Dispute tracking
  disputeStatus: 'none' | 'pending' | 'resolved_for' | 'resolved_against';
  disputeCount: number;

  // Future: Social features
  reactions?: { [emoji: string]: string[] }; // emoji -> array of guestIds
  commentCount?: number; // Number of comments
}
```

**Indexes Required:**

```javascript
// For house activity feed (main use case)
{ collection: "house-activities", fields: [
  { fieldPath: "houseId", order: "ASCENDING" },
  { fieldPath: "createdAt", order: "DESCENDING" }
]}

// For filtered feed by activity type
{ collection: "house-activities", fields: [
  { fieldPath: "houseId", order: "ASCENDING" },
  { fieldPath: "type", order: "ASCENDING" },
  { fieldPath: "createdAt", order: "DESCENDING" }
]}

// For pending disputes
{ collection: "house-activities", fields: [
  { fieldPath: "houseId", order: "ASCENDING" },
  { fieldPath: "disputeStatus", order: "ASCENDING" }
]}
```

**Size:** ~500 bytes per activity

### 4.4 Dispute Record (Embedded in House Document)

**Path:** `houses/{houseId}.disputes.{disputeId}`

**Purpose:** Track active disputes for resolution

```typescript
interface DisputeRecord {
  id: string;
  activityId: string; // References both week.activities[].id and house-activities/{id}
  victimGuestId: string; // Guest whose activity is disputed
  victimName: string; // Denormalized for display
  disputerId: string; // Guest who initiated dispute
  disputerName: string; // Denormalized for display
  type: ActivityType; // Type of activity disputed
  date: string; // Date of disputed activity
  displayText: string; // "Attended Monday Night AA"
  reason: string; // Why disputer is challenging this
  status: 'pending' | 'resolved';
  resolution?: 'allowed' | 'overturned'; // allowed = activity valid, overturned = fraudulent
  initiatedAt: Timestamp;
  resolvedAt?: Timestamp;
}
```

**Usage:** Disputes are stored in house document for easy querying of all house disputes. After 48 hours, a scheduled Cloud Function automatically resolves disputes.

### 4.5 Requirements Coverage Matrix

This section maps each app requirement to our architecture to ensure complete coverage.

#### Core Features

| Feature                | Status     | Implementation                                                                           |
| ---------------------- | ---------- | ---------------------------------------------------------------------------------------- |
| **Chores**             | ✅ Covered | `chore_completed` activity, `choreCompleted` in DayStats                                 |
| **Meetings**           | ✅ Covered | `meeting_attended` activity with GPS verification metadata                               |
| **Sponsorship**        | ✅ Covered | `sponsor_meeting` + `supporter_met` activities, step tracking                            |
| **Work**               | ✅ Covered | `hours_worked` activity with job breakdown, workType for job-seeking/school/volunteering |
| **Curfews**            | ✅ Covered | `curfew_checkin` activity with GPS verification                                          |
| **Overnights**         | ✅ Covered | `overnight_request` activity with approval tracking                                      |
| **Activity Log**       | ✅ Covered | `house-activities` collection, real-time subscription                                    |
| **Disputes**           | ✅ Covered | Full dispute flow with 48hr auto-resolution                                              |
| **Reports**            | ✅ Covered | `guest-reports` collection, generated from Week documents                                |
| **House Score**        | ✅ Covered | `healthScore` in Week documents, aggregated to house                                     |
| **Push Notifications** | ✅ Covered | Cloud Function trigger on activity creation                                              |

#### Phase System Requirements

| Phase Requirement     | Tracked In                                     | Notes                                    |
| --------------------- | ---------------------------------------------- | ---------------------------------------- |
| Meetings per week     | `totals.meetings`                              | Compared against `phase.rules.meetings`  |
| Work hours per week   | `totals.hoursWorked`                           | Compared against `phase.rules.work`      |
| Chore completion      | `totals.choresCompleted`                       | Daily requirement, 7/week                |
| Sponsor meeting       | `totals.sponsorMeetings`                       | Compared against `phase.rules.supporter` |
| Curfew compliance     | `totals.curfewsMet`                            | GPS-verified check-ins                   |
| Overnights allowed    | `totals.overnightsUsed` vs `overnightsAllowed` | Per-phase limits                         |
| Medication compliance | `totals.medications`                           | For MAT tracking                         |

#### Future Features Preparation

| Future Feature                   | Architecture Support                                                          |
| -------------------------------- | ----------------------------------------------------------------------------- |
| **Medications (MAT)**            | ✅ `medication_taken` activity type, `medicationType: 'MAT'` in metadata      |
| **Supporters (external access)** | 🔧 Add `supporterAccess` field to Guest doc, security rules for external read |
| **Analytics**                    | ✅ Week documents contain structured data for aggregation queries             |
| **Payments**                     | 🔧 `payment_made` activity type defined, integrate with Stripe webhooks       |
| **Scheduling**                   | 🔧 Could add `scheduled_event` activity type for calendar integration         |
| **Social Networking**            | 🔧 `reactions` and `commentCount` fields added to HouseActivityDocument       |

#### Analytics-Ready Data Structure

The architecture supports efficient analytics queries:

```typescript
// Example: Get meeting attendance trend for a guest over 8 weeks
const weeks = await firestore
  .collection('guests')
  .doc(guestId)
  .collection('weeks')
  .orderBy('startDate', 'desc')
  .limit(8)
  .get();

const trend = weeks.docs.map(doc => ({
  week: doc.data().startDate,
  meetings: doc.data().totals.meetings,
  hoursWorked: doc.data().totals.hoursWorked,
  healthScore: doc.data().healthScore,
}));

// Example: House-wide meeting attendance this week (aggregation query)
const { count } = await firestore
  .collection('house-activities')
  .where('houseId', '==', houseId)
  .where('type', '==', 'meeting_attended')
  .where('createdAt', '>=', weekStart)
  .count()
  .get();
```

#### External Supporter Access (Future)

When implementing supporter access, add to Guest document:

```typescript
interface Guest {
  // ... existing fields

  // External supporter access
  supporters: {
    [supporterId: string]: {
      name: string;
      email: string;
      relationship: 'sponsor' | 'family' | 'probation' | 'counselor';
      accessLevel: 'stats_only' | 'full_activity_log' | 'reports_only';
      invitedAt: Timestamp;
      acceptedAt?: Timestamp;
    };
  };
}
```

And add security rules:

```javascript
// Allow supporters to read guest's week stats
match /guests/{guestId}/weeks/{weekId} {
  allow read: if isGuestOrAdmin(guestId) ||
                 (request.auth.uid in resource.data.supporters);
}
```

### 4.6 Required Firestore Indexes

```javascript
// firestore.indexes.json
{
  "indexes": [
    // Week queries by date (for guest's historical weeks)
    {
      "collectionGroup": "weeks",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "startDate", "order": "DESCENDING" }
      ]
    },
    // House activity feed (main query)
    {
      "collectionGroup": "house-activities",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "houseId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    // House activity feed filtered by type
    {
      "collectionGroup": "house-activities",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "houseId", "order": "ASCENDING" },
        { "fieldPath": "type", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    // Pending disputes query
    {
      "collectionGroup": "house-activities",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "houseId", "order": "ASCENDING" },
        { "fieldPath": "disputeStatus", "order": "ASCENDING" }
      ]
    }
  ]
}
```

---

## 5. Implementation Details

### 5.1 Client-Side Activity Service

```typescript
// src/services/activityService.ts

import { firestore } from '../../firebase-setup';
import { FieldValue, Timestamp } from '@firebase/firestore';
import uuid from 'react-native-uuid';

export class ActivityService {
  /**
   * Record a meeting attendance
   * Writes to BOTH week document AND house-activities collection
   */
  static async recordMeeting(
    guest: Guest,
    meeting: RatsMeeting,
    options: { verified?: boolean; userLocation?: Location } = {},
  ): Promise<void> {
    const weekId = getWeekId();
    const today = getTodaysDate();
    const activityId = uuid.v4() as string;
    const now = new Date().toISOString();

    const weekRef = firestore
      .collection('guests')
      .doc(guest.id)
      .collection('weeks')
      .doc(weekId);

    // Create activity entry (used in both places)
    const activityEntry: ActivityLogEntry = {
      id: activityId,
      type: 'meeting_attended',
      date: today,
      createdAt: now,
      displayText: `Attended ${meeting.name}`,
      value: true,
      metadata: {
        meetingName: meeting.name,
        meetingLocation: meeting.street || meeting.Location?.[0],
        verified: options.verified,
      },
      disputeStatus: 'none',
      disputeCount: 0,
    };

    const batch = firestore.batch();

    // 1. Update week document (stats + activity log)
    batch.set(
      weekRef,
      {
        [`days.${today}.meetings`]: FieldValue.increment(1),
        [`days.${today}.meetingNames`]: FieldValue.arrayUnion(meeting.name),
        ['totals.meetings']: FieldValue.increment(1),
        activities: FieldValue.arrayUnion(activityEntry),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    // 2. Add to house-activities collection (for house-wide feed)
    const houseActivityRef = firestore
      .collection('house-activities')
      .doc(activityId);

    batch.set(houseActivityRef, {
      ...activityEntry,
      houseId: guest.houseId,
      guestId: guest.id,
      guestName: `${guest.firstName} ${guest.lastName.charAt(0)}.`,
      weekId,
      createdAt: FieldValue.serverTimestamp(), // Use server timestamp for ordering
    });

    await batch.commit();
  }

  /**
   * Record work hours
   */
  static async recordWorkHours(
    guest: Guest,
    jobName: string,
    hours: number,
  ): Promise<void> {
    const weekId = getWeekId();
    const today = getTodaysDate();
    const activityId = uuid.v4() as string;
    const now = new Date().toISOString();

    const activityEntry: ActivityLogEntry = {
      id: activityId,
      type: 'hours_worked',
      date: today,
      createdAt: now,
      displayText: `Worked ${hours} hours at ${jobName}`,
      value: hours,
      metadata: { jobName, hours },
      disputeStatus: 'none',
      disputeCount: 0,
    };

    const batch = firestore.batch();

    // 1. Update week document
    const weekRef = getWeekRef(guest.id, weekId);
    batch.set(
      weekRef,
      {
        [`days.${today}.hoursWorked`]: FieldValue.increment(hours),
        [`days.${today}.hoursWorkedByJob.${jobName}`]:
          FieldValue.increment(hours),
        ['totals.hoursWorked']: FieldValue.increment(hours),
        activities: FieldValue.arrayUnion(activityEntry),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    // 2. Add to house-activities
    const houseActivityRef = firestore
      .collection('house-activities')
      .doc(activityId);

    batch.set(houseActivityRef, {
      ...activityEntry,
      houseId: guest.houseId,
      guestId: guest.id,
      guestName: `${guest.firstName} ${guest.lastName.charAt(0)}.`,
      weekId,
      createdAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();
  }

  /**
   * Record chore completion
   */
  static async recordChoreCompleted(
    guest: Guest,
    choreName: string,
  ): Promise<void> {
    const weekId = getWeekId();
    const today = getTodaysDate();
    const activityId = uuid.v4() as string;
    const now = new Date().toISOString();

    const activityEntry: ActivityLogEntry = {
      id: activityId,
      type: 'chore_completed',
      date: today,
      createdAt: now,
      displayText: `Completed ${choreName} chore`,
      value: true,
      metadata: { choreName },
      disputeStatus: 'none',
      disputeCount: 0,
    };

    const batch = firestore.batch();

    // 1. Update week document
    const weekRef = getWeekRef(guest.id, weekId);
    batch.set(
      weekRef,
      {
        [`days.${today}.choreCompleted`]: true,
        ['totals.choresCompleted']: FieldValue.increment(1),
        activities: FieldValue.arrayUnion(activityEntry),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    // 2. Add to house-activities
    const houseActivityRef = firestore
      .collection('house-activities')
      .doc(activityId);

    batch.set(houseActivityRef, {
      ...activityEntry,
      houseId: guest.houseId,
      guestId: guest.id,
      guestName: `${guest.firstName} ${guest.lastName.charAt(0)}.`,
      weekId,
      createdAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();
  }

  /**
   * Record curfew check-in (GPS verified)
   */
  static async recordCurfewCheckin(
    guest: Guest,
    userLocation: { lat: number; lng: number },
    houseLocation: { lat: number; lng: number },
    curfewTime: string,
  ): Promise<void> {
    const weekId = getWeekId();
    const today = getTodaysDate();
    const activityId = uuid.v4() as string;
    const now = new Date().toISOString();

    // Calculate distance from house
    const distance = calculateDistance(userLocation, houseLocation);
    const verified = distance <= 100; // Within 100 meters

    const activityEntry: ActivityLogEntry = {
      id: activityId,
      type: 'curfew_checkin',
      date: today,
      createdAt: now,
      displayText: verified
        ? `Checked in for ${curfewTime} curfew`
        : `Curfew check-in failed (${Math.round(distance)}m from house)`,
      value: verified,
      metadata: {
        curfewTime,
        checkinTime: now,
        checkinLocation: userLocation,
        verified,
        verificationMethod: 'gps',
        verificationDistance: distance,
      },
      disputeStatus: 'none',
      disputeCount: 0,
    };

    const batch = firestore.batch();

    // 1. Update week document
    const weekRef = getWeekRef(guest.id, weekId);
    batch.set(
      weekRef,
      {
        [`days.${today}.curfewCheckedIn`]: verified,
        [`days.${today}.curfewCheckinTime`]: now,
        ['totals.curfewsMet']: verified
          ? FieldValue.increment(1)
          : FieldValue.increment(0),
        ['totals.curfewsMissed']: verified
          ? FieldValue.increment(0)
          : FieldValue.increment(1),
        activities: FieldValue.arrayUnion(activityEntry),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    // 2. Add to house-activities
    const houseActivityRef = firestore
      .collection('house-activities')
      .doc(activityId);

    batch.set(houseActivityRef, {
      ...activityEntry,
      houseId: guest.houseId,
      guestId: guest.id,
      guestName: `${guest.firstName} ${guest.lastName.charAt(0)}.`,
      weekId,
      createdAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();
  }

  /**
   * Request overnight (requires manager approval)
   */
  static async requestOvernight(
    guest: Guest,
    reason: string,
    location: string,
  ): Promise<string> {
    const weekId = getWeekId();
    const today = getTodaysDate();
    const activityId = uuid.v4() as string;
    const now = new Date().toISOString();

    const activityEntry: ActivityLogEntry = {
      id: activityId,
      type: 'overnight_request',
      date: today,
      createdAt: now,
      displayText: `Requested overnight: ${reason}`,
      value: false, // Pending approval
      metadata: {
        overnightReason: reason,
        overnightLocation: location,
      },
      disputeStatus: 'none',
      disputeCount: 0,
    };

    const batch = firestore.batch();

    // 1. Update week document
    const weekRef = getWeekRef(guest.id, weekId);
    batch.set(
      weekRef,
      {
        [`days.${today}.overnightApproved`]: false, // Pending
        activities: FieldValue.arrayUnion(activityEntry),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    // 2. Add to house-activities (managers will see this)
    const houseActivityRef = firestore
      .collection('house-activities')
      .doc(activityId);

    batch.set(houseActivityRef, {
      ...activityEntry,
      houseId: guest.houseId,
      guestId: guest.id,
      guestName: `${guest.firstName} ${guest.lastName.charAt(0)}.`,
      weekId,
      createdAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    return activityId; // Return for manager approval flow
  }

  /**
   * Approve overnight request (manager only)
   */
  static async approveOvernight(
    manager: Guest,
    guestId: string,
    activityId: string,
    approved: boolean,
  ): Promise<void> {
    // Get the activity
    const activityRef = firestore
      .collection('house-activities')
      .doc(activityId);
    const activityDoc = await activityRef.get();
    const activity = activityDoc.data() as HouseActivityDocument;

    const batch = firestore.batch();

    // 1. Update house-activities
    batch.update(activityRef, {
      value: approved,
      displayText: approved
        ? `Overnight approved by ${manager.firstName}`
        : `Overnight denied by ${manager.firstName}`,
      'metadata.approvedBy': `${manager.firstName} ${manager.lastName.charAt(
        0,
      )}.`,
    });

    // 2. Update week document
    const weekRef = firestore
      .collection('guests')
      .doc(guestId)
      .collection('weeks')
      .doc(activity.weekId);

    const weekDoc = await weekRef.get();
    const week = weekDoc.data() as WeekDocument;

    const updatedActivities = (week.activities || []).map(a =>
      a.id === activityId
        ? {
            ...a,
            value: approved,
            displayText: approved
              ? `Overnight approved by ${manager.firstName}`
              : `Overnight denied by ${manager.firstName}`,
            metadata: {
              ...a.metadata,
              approvedBy: `${manager.firstName} ${manager.lastName.charAt(0)}.`,
            },
          }
        : a,
    );

    const weekUpdate: any = {
      activities: updatedActivities,
      [`days.${activity.date}.overnightApproved`]: approved,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (approved) {
      weekUpdate['totals.overnightsUsed'] = FieldValue.increment(1);
    }

    batch.update(weekRef, weekUpdate);

    await batch.commit();
  }

  /**
   * Get current week stats (fast read from single document)
   */
  static async getWeekStats(guestId: string): Promise<WeekTotals> {
    const weekDoc = await getWeekRef(guestId, getWeekId()).get();

    if (!weekDoc.exists) {
      return {
        meetings: 0,
        hoursWorked: 0,
        choresCompleted: 0,
        supporterMet: false,
        medications: 0,
      };
    }

    return (weekDoc.data() as WeekDocument).totals;
  }

  /**
   * Get guest's activity log for current week
   */
  static async getGuestActivities(
    guestId: string,
  ): Promise<ActivityLogEntry[]> {
    const weekDoc = await getWeekRef(guestId, getWeekId()).get();

    if (!weekDoc.exists) return [];

    const week = weekDoc.data() as WeekDocument;
    return (week.activities || []).sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  /**
   * Get house-wide activity feed (main Activities Screen query)
   */
  static async getHouseActivityFeed(
    houseId: string,
    options: {
      limit?: number;
      startAfter?: Timestamp;
      type?: ActivityType;
    } = {},
  ): Promise<HouseActivityDocument[]> {
    let query = firestore
      .collection('house-activities')
      .where('houseId', '==', houseId)
      .orderBy('createdAt', 'desc')
      .limit(options.limit || 50);

    if (options.type) {
      query = query.where('type', '==', options.type);
    }

    if (options.startAfter) {
      query = query.startAfter(options.startAfter);
    }

    const snapshot = await query.get();
    return snapshot.docs.map(doc => doc.data() as HouseActivityDocument);
  }

  /**
   * Subscribe to house activity feed for real-time updates
   */
  static subscribeToHouseActivityFeed(
    houseId: string,
    onUpdate: (activities: HouseActivityDocument[]) => void,
    limit = 50,
  ): () => void {
    return firestore
      .collection('house-activities')
      .where('houseId', '==', houseId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .onSnapshot(snapshot => {
        const activities = snapshot.docs.map(
          doc => doc.data() as HouseActivityDocument,
        );
        onUpdate(activities);
      });
  }

  /**
   * Get recent weeks for historical display
   */
  static async getRecentWeeks(
    guestId: string,
    limit = 8,
  ): Promise<WeekDocument[]> {
    const snapshot = await firestore
      .collection('guests')
      .doc(guestId)
      .collection('weeks')
      .orderBy('startDate', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map(doc => doc.data() as WeekDocument);
  }
}

function getWeekRef(guestId: string, weekId: string) {
  return firestore
    .collection('guests')
    .doc(guestId)
    .collection('weeks')
    .doc(weekId);
}

function getWeekId(date?: Date): string {
  const d = date || new Date();
  const year = d.getFullYear();
  const week = getISOWeek(d);
  return `${year}-W${week.toString().padStart(2, '0')}`;
}
```

### 5.2 Dispute Service

```typescript
// src/services/disputeService.ts

export class DisputeService {
  /**
   * Dispute an activity
   * Updates both week.activities[], house-activities, and house.disputes
   */
  static async disputeActivity(
    disputer: Guest,
    activityId: string,
    reason: string,
  ): Promise<void> {
    // Get the activity from house-activities
    const activityRef = firestore
      .collection('house-activities')
      .doc(activityId);
    const activityDoc = await activityRef.get();

    if (!activityDoc.exists) {
      throw new Error('Activity not found');
    }

    const activity = activityDoc.data() as HouseActivityDocument;

    // Can't dispute your own activity
    if (activity.guestId === disputer.id) {
      throw new Error('Cannot dispute your own activity');
    }

    const disputeId = uuid.v4() as string;
    const batch = firestore.batch();

    // 1. Update house-activities document
    batch.update(activityRef, {
      disputeStatus: 'pending',
      disputeCount: FieldValue.increment(1),
    });

    // 2. Update the activity in the victim's week document
    // Note: Need to read the week, find the activity, update it, write back
    const weekRef = firestore
      .collection('guests')
      .doc(activity.guestId)
      .collection('weeks')
      .doc(activity.weekId);

    const weekDoc = await weekRef.get();
    const week = weekDoc.data() as WeekDocument;

    const updatedActivities = (week.activities || []).map(a =>
      a.id === activityId
        ? {
            ...a,
            disputeStatus: 'pending' as const,
            disputeCount: a.disputeCount + 1,
          }
        : a,
    );

    batch.update(weekRef, {
      activities: updatedActivities,
      [`days.${activity.date}.${getDisputeField(activity.type)}`]:
        FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 3. Create dispute record in house
    const houseRef = firestore.collection('houses').doc(activity.houseId);
    batch.update(houseRef, {
      [`disputes.${disputeId}`]: {
        id: disputeId,
        activityId,
        victimGuestId: activity.guestId,
        victimName: activity.guestName,
        disputerId: disputer.id,
        disputerName: `${disputer.firstName} ${disputer.lastName.charAt(0)}.`,
        type: activity.type,
        date: activity.date,
        displayText: activity.displayText,
        reason,
        status: 'pending',
        initiatedAt: FieldValue.serverTimestamp(),
      },
    });

    await batch.commit();
  }

  /**
   * Get pending disputes for a house
   */
  static async getPendingDisputes(houseId: string): Promise<DisputeRecord[]> {
    const houseDoc = await firestore.collection('houses').doc(houseId).get();
    const house = houseDoc.data() as House;

    const disputes = house.disputes || {};
    return Object.values(disputes).filter(d => d.status === 'pending');
  }
}

function getDisputeField(type: ActivityType): string {
  switch (type) {
    case 'meeting_attended':
      return 'meetingsUnderDispute';
    case 'hours_worked':
      return 'hoursUnderDispute';
    default:
      return 'activitiesUnderDispute';
  }
}
```

### 5.3 Cloud Functions

#### Health Score Trigger

```typescript
// functions/src/triggers/onWeekWrite.ts

export const onWeekWrite = functions.firestore
  .document('guests/{guestId}/weeks/{weekId}')
  .onWrite(async (change, context) => {
    if (!change.after.exists) return;

    const { guestId } = context.params;
    const weekData = change.after.data() as WeekDocument;

    // Get phase rules
    const guest = await db.collection('guests').doc(guestId).get();
    const guestData = guest.data() as Guest;
    const house = await db.collection('houses').doc(guestData.houseId).get();
    const phaseRules = house.data().phases[guestData.phase]?.rules;

    // Calculate health score
    const totals = weekData.totals;
    const meetingScore = Math.min(
      totals.meetings / (phaseRules?.meetings || 3),
      1,
    );
    const workScore = Math.min(
      totals.hoursWorked / (phaseRules?.work || 20),
      1,
    );
    const choreScore = totals.choresCompleted / 7;
    const supporterScore = totals.supporterMet ? 1 : 0;

    const healthScore = Math.ceil(
      ((meetingScore + workScore + choreScore + supporterScore) / 4) * 100,
    );

    // Update week document
    await change.after.ref.update({ healthScore });

    // Update house aggregate (optional - could batch this)
    await updateHouseHealth(guestData.houseId);
  });
```

#### House Score Calculation

The House Score is publicly visible and affects the house's directory listing. It's calculated from all guests' performance.

```typescript
// functions/src/triggers/calculateHouseScore.ts

/**
 * Recalculate house score when any guest's week is updated
 * This provides the publicly visible "House Score" for the directory
 */
export const updateHouseScore = functions.firestore
  .document('guests/{guestId}/weeks/{weekId}')
  .onWrite(async (change, context) => {
    if (!change.after.exists) return;

    const { guestId } = context.params;
    const guest = await db.collection('guests').doc(guestId).get();
    const guestData = guest.data() as Guest;

    // Debounce: only recalculate every 5 minutes per house
    const houseRef = db.collection('houses').doc(guestData.houseId);
    const house = (await houseRef.get()).data() as House;

    const lastCalculated = house.scoreLastCalculated?.toDate() || new Date(0);
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    if (lastCalculated > fiveMinutesAgo) {
      return; // Skip, recently calculated
    }

    // Get all guests in house
    const guests = await db
      .collection('guests')
      .where('houseId', '==', guestData.houseId)
      .get();

    // Get current week for each guest
    const currentWeekId = getWeekId();
    let totalScore = 0;
    let guestCount = 0;

    for (const guestDoc of guests.docs) {
      const weekDoc = await db
        .collection('guests')
        .doc(guestDoc.id)
        .collection('weeks')
        .doc(currentWeekId)
        .get();

      if (weekDoc.exists) {
        totalScore += weekDoc.data().healthScore || 0;
        guestCount++;
      }
    }

    const houseScore = guestCount > 0 ? Math.round(totalScore / guestCount) : 0;

    // Update house document
    await houseRef.update({
      currentWeekHealth: houseScore,
      [`health.${new Date().toISOString().split('T')[0]}`]: houseScore,
      scoreLastCalculated: FieldValue.serverTimestamp(),
    });
  });
```

#### Weekly Report Generation

```typescript
// functions/src/scheduled/weeklyReports.ts

export const generateWeeklyReports = functions.pubsub
  .schedule('0 2 * * 0') // Sunday 2 AM
  .timeZone('America/New_York')
  .onRun(async () => {
    const lastWeekId = getWeekId(
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    );

    const houses = await db.collection('houses').get();

    for (const houseDoc of houses.docs) {
      const guests = await db
        .collection('guests')
        .where('houseId', '==', houseDoc.id)
        .get();

      const batch = db.batch();

      for (const guestDoc of guests.docs) {
        const weekDoc = await db
          .collection('guests')
          .doc(guestDoc.id)
          .collection('weeks')
          .doc(lastWeekId)
          .get();

        if (weekDoc.exists) {
          const week = weekDoc.data() as WeekDocument;
          const reportRef = db.collection('guest-reports').doc();

          batch.set(reportRef, {
            id: reportRef.id,
            guestId: guestDoc.id,
            startDate: week.startDate,
            endDate: week.endDate,
            hoursWorked: week.totals.hoursWorked,
            meeting: week.totals.meetings,
            choreCompleted: week.totals.choresCompleted,
            metPrimarySupporter: week.totals.supporterMet,
            healthScore: week.healthScore,
            step: week.step,
            createdAt: FieldValue.serverTimestamp(),
          });
        }
      }

      await batch.commit();
    }
  });
```

#### Push Notifications Trigger

```typescript
// functions/src/triggers/onHouseActivityCreate.ts

/**
 * Send push notifications when certain activities occur
 * Covers: disputes, messages, end-of-day reminders
 */
export const onHouseActivityCreate = functions.firestore
  .document('house-activities/{activityId}')
  .onCreate(async (snapshot, context) => {
    const activity = snapshot.data() as HouseActivityDocument;

    // Get house members for notifications
    const guests = await db
      .collection('guests')
      .where('houseId', '==', activity.houseId)
      .get();

    const tokens: string[] = [];
    const guestIds: string[] = [];

    for (const guestDoc of guests.docs) {
      const guest = guestDoc.data() as Guest;
      if (guest.fcmToken && guestDoc.id !== activity.guestId) {
        tokens.push(guest.fcmToken);
        guestIds.push(guestDoc.id);
      }
    }

    if (tokens.length === 0) return;

    // Determine notification based on activity type
    let notification: { title: string; body: string } | null = null;

    switch (activity.type) {
      case 'dispute_initiated':
        // Only notify the victim
        const victim = guests.docs.find(
          g => g.id === activity.metadata?.disputedActivityId,
        );
        if (victim?.data().fcmToken) {
          notification = {
            title: 'Activity Disputed',
            body: `Someone has disputed your ${
              activity.metadata?.disputeReason || 'activity'
            }. You have 48 hours to respond.`,
          };
          // Send to victim only
          await admin.messaging().send({
            token: victim.data().fcmToken,
            notification,
            data: { activityId: context.params.activityId },
          });
        }
        return;

      case 'overnight_request':
        // Notify managers only
        const managers = guests.docs.filter(g => g.data().isAdmin);
        for (const manager of managers) {
          if (manager.data().fcmToken) {
            await admin.messaging().send({
              token: manager.data().fcmToken,
              notification: {
                title: 'Overnight Request',
                body: `${activity.guestName} is requesting an overnight: ${activity.metadata?.overnightReason}`,
              },
              data: { activityId: context.params.activityId },
            });
          }
        }
        return;

      case 'issue_reported':
        // Notify managers
        notification = {
          title: 'Issue Reported',
          body: `${activity.guestName} reported a ${activity.metadata?.issueType} issue`,
        };
        break;

      default:
        // No notification for routine activities
        return;
    }

    if (notification) {
      // Send to relevant recipients
      await admin.messaging().sendEachForMulticast({
        tokens,
        notification,
        data: { activityId: context.params.activityId },
      });
    }
  });

/**
 * End-of-day reminder to complete tasks
 * Runs at 9 PM in each house's timezone
 */
export const endOfDayReminder = functions.pubsub
  .schedule('0 21 * * *') // 9 PM (will need timezone handling)
  .onRun(async () => {
    const today = getTodaysDate();
    const houses = await db.collection('houses').get();

    for (const houseDoc of houses.docs) {
      const guests = await db
        .collection('guests')
        .where('houseId', '==', houseDoc.id)
        .get();

      const currentWeekId = getWeekId();

      for (const guestDoc of guests.docs) {
        const guest = guestDoc.data() as Guest;
        if (!guest.fcmToken) continue;

        // Check what's missing today
        const weekDoc = await db
          .collection('guests')
          .doc(guestDoc.id)
          .collection('weeks')
          .doc(currentWeekId)
          .get();

        const week = weekDoc.exists ? (weekDoc.data() as WeekDocument) : null;
        const dayStats = week?.days?.[today];

        const missing: string[] = [];
        if (!dayStats?.choreCompleted) missing.push('chore');
        if (!dayStats?.medication && guest.phase !== 'default')
          missing.push('medication');
        if (!dayStats?.curfewCheckedIn) missing.push('curfew check-in');

        if (missing.length > 0) {
          await admin.messaging().send({
            token: guest.fcmToken,
            notification: {
              title: 'Daily Reminder',
              body: `Don't forget to log your ${missing.join(', ')} today!`,
            },
          });
        }
      }
    }
  });
```

#### Dispute Resolution (Scheduled)

```typescript
// functions/src/scheduled/resolveDisputes.ts

/**
 * Auto-resolve disputes after 48 hours
 * Runs daily at 2 AM
 */
export const resolveExpiredDisputes = functions.pubsub
  .schedule('0 2 * * *') // Daily at 2 AM
  .timeZone('America/New_York')
  .onRun(async () => {
    const houses = await db.collection('houses').get();
    const cutoffTime = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours ago

    for (const houseDoc of houses.docs) {
      const house = houseDoc.data() as House;
      const disputes = house.disputes || {};

      for (const [disputeId, dispute] of Object.entries(disputes)) {
        if (dispute.status !== 'pending') continue;

        const initiatedAt = dispute.initiatedAt.toDate();
        if (initiatedAt > cutoffTime) continue; // Not yet expired

        // Default resolution: activity allowed (dispute rejected)
        // Admin can manually override before expiration
        await resolveDispute(houseDoc.id, disputeId, 'allowed');
      }
    }
  });

/**
 * Resolve a dispute
 * Updates house-activities, week.activities[], week stats, and house.disputes
 */
async function resolveDispute(
  houseId: string,
  disputeId: string,
  resolution: 'allowed' | 'overturned',
): Promise<void> {
  const houseDoc = await db.collection('houses').doc(houseId).get();
  const house = houseDoc.data() as House;
  const dispute = house.disputes[disputeId];

  if (!dispute || dispute.status !== 'pending') return;

  const batch = db.batch();

  // 1. Get the activity from house-activities
  const activityRef = db.collection('house-activities').doc(dispute.activityId);
  const activityDoc = await activityRef.get();
  const activity = activityDoc.data() as HouseActivityDocument;

  // 2. Get the week document
  const weekRef = db
    .collection('guests')
    .doc(dispute.victimGuestId)
    .collection('weeks')
    .doc(activity.weekId);
  const weekDoc = await weekRef.get();
  const week = weekDoc.data() as WeekDocument;

  const newDisputeStatus =
    resolution === 'allowed'
      ? ('resolved_for' as const)
      : ('resolved_against' as const);

  // 3. Update house-activities document
  batch.update(activityRef, {
    disputeStatus: newDisputeStatus,
  });

  // 4. Update week.activities[]
  const updatedActivities = (week.activities || []).map(a =>
    a.id === dispute.activityId ? { ...a, disputeStatus: newDisputeStatus } : a,
  );

  const weekUpdate: any = {
    activities: updatedActivities,
    updatedAt: FieldValue.serverTimestamp(),
  };

  // 5. If overturned (fraudulent), decrement stats
  if (resolution === 'overturned') {
    if (activity.type === 'meeting_attended') {
      weekUpdate[`days.${activity.date}.meetings`] = FieldValue.increment(-1);
      weekUpdate[`days.${activity.date}.meetingNames`] = FieldValue.arrayRemove(
        activity.metadata.meetingName,
      );
      weekUpdate['totals.meetings'] = FieldValue.increment(-1);
      weekUpdate[`days.${activity.date}.meetingsUnderDispute`] =
        FieldValue.increment(-1);
    } else if (activity.type === 'hours_worked') {
      const hours = activity.metadata.hours || 0;
      weekUpdate[`days.${activity.date}.hoursWorked`] = FieldValue.increment(
        -hours,
      );
      weekUpdate['totals.hoursWorked'] = FieldValue.increment(-hours);
      weekUpdate[`days.${activity.date}.hoursUnderDispute`] =
        FieldValue.increment(-1);
    } else if (activity.type === 'chore_completed') {
      weekUpdate[`days.${activity.date}.choreCompleted`] = false;
      weekUpdate['totals.choresCompleted'] = FieldValue.increment(-1);
    }
    // Add more activity types as needed
  } else {
    // If allowed, just remove the "under dispute" flag
    if (activity.type === 'meeting_attended') {
      weekUpdate[`days.${activity.date}.meetingsUnderDispute`] =
        FieldValue.increment(-1);
    } else if (activity.type === 'hours_worked') {
      weekUpdate[`days.${activity.date}.hoursUnderDispute`] =
        FieldValue.increment(-1);
    }
  }

  batch.update(weekRef, weekUpdate);

  // 6. Update house dispute record
  batch.update(db.collection('houses').doc(houseId), {
    [`disputes.${disputeId}.status`]: 'resolved',
    [`disputes.${disputeId}.resolution`]: resolution,
    [`disputes.${disputeId}.resolvedAt`]: FieldValue.serverTimestamp(),
  });

  await batch.commit();

  // 7. Health score will be recalculated by onWeekWrite trigger
}
```

---

## 6. Risk Assessment

### 6.1 Technical Risks

| Risk                                      | Probability | Impact   | Mitigation                                                         |
| ----------------------------------------- | ----------- | -------- | ------------------------------------------------------------------ |
| **Data loss during migration**            | Low         | Critical | Backup all data, keep old structure until verified, staged rollout |
| **Race conditions in concurrent updates** | Medium      | Medium   | Use FieldValue.increment() and arrayUnion() for atomic updates     |
| **Trigger execution delays**              | Medium      | Low      | Design for eventual consistency, show "updating..." in UI          |
| **Cloud Function timeouts**               | Low         | Medium   | Process in batches, use Cloud Tasks for long operations            |
| **Index limits exceeded**                 | Low         | Low      | Minimize indexes (only 3 needed), monitor usage                    |
| **Cost overruns**                         | Medium      | Medium   | Monitor costs weekly, set budget alerts                            |

### 6.2 Business Risks

| Risk                                 | Probability | Impact | Mitigation                                     |
| ------------------------------------ | ----------- | ------ | ---------------------------------------------- |
| **User confusion during transition** | Medium      | Low    | No UI changes, transparent migration           |
| **Dispute resolution bugs**          | Medium      | High   | Extensive testing, manual override capability  |
| **Historical data inaccessible**     | Low         | Medium | Migrate all data, keep old structure as backup |
| **Support burden increases**         | Low         | Low    | Document changes, train support team           |

### 6.3 Critical Constraints

1. **Firestore Transaction Limit:** Max 500 documents per transaction

   - Mitigation: Process migrations in batches of 100 guests

2. **Cloud Function Timeout:** Max 540 seconds

   - Mitigation: Use Cloud Tasks for large batch operations

3. **Firestore Document Size:** Max 1MB

   - Not an issue: Week documents are ~2KB max

4. **Index Limit:** Max 200 composite indexes
   - Only need 3 indexes for this system

---

## 7. Migration Strategy

### 7.1 Overview

**Total Duration:** 6-8 weeks
**Approach:** Parallel write with staged cutover
**Risk Level:** Low (no data loss, easy rollback)

### 7.2 Phase 1: Infrastructure Setup (Week 1-2)

#### Goals

- Create new collections and indexes
- Deploy Cloud Functions (triggers, scheduled)
- Implement parallel write in client

#### Tasks

1. **Create Firestore Indexes**
   ```bash
   firebase deploy --only firestore:indexes
   ```
2. **Deploy Cloud Functions**

   - `onWeekWrite` trigger for health scores
   - `generateWeeklyReports` scheduled function
   - Test with synthetic data

3. **Update Client Services**

   - Create `WeekService` class
   - Implement parallel write (old + new system)
   - Feature flag: `useNewActivitySystem: false`

4. **Update Security Rules**
   ```javascript
   match /guests/{guestId}/weeks/{weekId} {
     allow read, write: if isGuestOrAdmin(guestId);
   }
   match /guests/{guestId}/activities/{activityId} {
     allow read: if isGuestOrAdmin(guestId);
     allow create: if isAuthenticated();
     allow update: if isHouseAdmin(guestId);
   }
   ```

#### Deliverables

- [ ] Indexes deployed and active
- [ ] Cloud Functions deployed and tested
- [ ] Client writes to both old and new systems
- [ ] Security rules updated

#### Rollback

- Disable parallel writes via feature flag
- No impact on existing functionality

### 7.3 Phase 2: Parallel Operation & UI Migration (Week 3-4)

#### Goals

- Migrate UI components to read from new structure
- Verify data consistency between systems
- Begin gradual rollout to users

#### Tasks

1. **Migrate Stats Display Components**

   - `BaseStatSummary.tsx` - Read from week subcollection
   - `WeekStatSummary.tsx` - Use `WeekService.getWeekStats()`
   - `GuestProfile.tsx` - Read currentChore from guest doc

2. **Implement Consistency Checks**

   ```typescript
   // Development only: verify old vs new data matches
   async function verifyDataConsistency(guestId: string) {
     const oldStats = getStatsFromCurrentWeek(guest);
     const newStats = await WeekService.getWeekStats(guestId);

     if (!isEqual(oldStats, newStats)) {
       console.warn('Data mismatch', { old: oldStats, new: newStats });
       analytics.logEvent('migration_mismatch', { guestId });
     }
   }
   ```

3. **Staged Rollout**
   - Week 3: Enable for internal test house
   - Week 4: Enable for 3-5 beta houses
   - Monitor error rates and user feedback

#### Deliverables

- [ ] UI reads from new structure
- [ ] Consistency verification passing
- [ ] Beta houses using new system
- [ ] No increase in support tickets

#### Rollback

- Feature flag to read from old structure
- Old data still being written

### 7.4 Phase 3: Historical Migration & Cloud Functions (Week 5-6)

#### Goals

- Migrate historical week data to subcollections
- Update all Cloud Functions to use new structure
- Stop writing to old structure

#### Tasks

1. **Historical Data Migration**

   ```typescript
   // functions/src/migrations/migrateGuestWeeks.ts

   export const migrateGuestWeeks = functions.https.onCall(
     async (data: { guestId: string }) => {
       const guest = await db.collection('guests').doc(data.guestId).get();
       const guestData = guest.data() as Guest;

       // Migrate currentWeek
       if (guestData.currentWeek) {
         await migrateWeekToSubcollection(data.guestId, guestData.currentWeek);
       }

       // Migrate previousWeek
       if (guestData.previousWeek) {
         await migrateWeekToSubcollection(data.guestId, guestData.previousWeek);
       }

       // Migrate archived weeks
       const archivedWeeks = await db
         .collection('guest-weeks')
         .where('guestId', '==', data.guestId)
         .get();

       for (const weekDoc of archivedWeeks.docs) {
         await migrateWeekToSubcollection(data.guestId, weekDoc.data() as Week);
       }

       return { success: true };
     },
   );

   async function migrateWeekToSubcollection(guestId: string, oldWeek: Week) {
     const weekId = getWeekIdFromDate(oldWeek.startDate);
     const weekRef = db
       .collection('guests')
       .doc(guestId)
       .collection('weeks')
       .doc(weekId);

     // Transform old Day objects to new DayStats format
     const days: { [date: string]: DayStats } = {};
     let totals = {
       meetings: 0,
       hoursWorked: 0,
       choresCompleted: 0,
       supporterMet: false,
       medications: 0,
     };

     for (const [date, day] of Object.entries(oldWeek.days)) {
       days[date] = {
         meetings: day.meeting?.length || 0,
         meetingNames: day.meeting?.map(m => m.name) || [],
         hoursWorked: sumHoursWorked(day.hoursWorked),
         hoursWorkedByJob: day.hoursWorked || {},
         choreCompleted: day.choreCompleted || false,
         metSupporter: day.metPrimarySupporter || false,
         medication: day.medication || false,
         meetingsUnderDispute: 0,
         hoursUnderDispute: 0,
       };

       // Accumulate totals
       totals.meetings += days[date].meetings;
       totals.hoursWorked += days[date].hoursWorked;
       totals.choresCompleted += days[date].choreCompleted ? 1 : 0;
       totals.supporterMet = totals.supporterMet || days[date].metSupporter;
       totals.medications += days[date].medication ? 1 : 0;
     }

     await weekRef.set({
       id: weekId,
       startDate: oldWeek.startDate,
       endDate: oldWeek.endDate,
       chore: oldWeek.chore,
       primarySupporterId: oldWeek.primarySupporterId,
       primarySupporterName: oldWeek.primarySupporterName,
       step: oldWeek.step,
       days,
       totals,
       healthScore: 0, // Will be recalculated by trigger
       createdAt: Timestamp.now(),
       updatedAt: Timestamp.now(),
       migratedFromLegacy: true,
     });
   }
   ```

2. **Batch Migration Script**

   ```typescript
   // Run for each house
   async function migrateHouse(houseId: string) {
     const guests = await db
       .collection('guests')
       .where('houseId', '==', houseId)
       .get();

     // Process in parallel batches of 10
     const batches = chunk(guests.docs, 10);

     for (const batch of batches) {
       await Promise.all(
         batch.map(guestDoc => migrateGuestWeeks({ guestId: guestDoc.id })),
       );
     }
   }
   ```

3. **Update Cloud Functions**

   - Remove `transferStats` (no longer needed!)
   - Update dispute resolution to use activities subcollection
   - Update health calculations

4. **Stop Writing to Old Structure**
   - Remove parallel write code
   - Set feature flag: `useNewActivitySystem: true`

#### Deliverables

- [ ] All historical data migrated
- [ ] Cloud Functions using new structure
- [ ] Old write code removed
- [ ] Weekly transfer function removed

#### Rollback

- Re-enable parallel writes
- Historical data preserved in both locations

### 7.5 Phase 4: Cleanup & Optimization (Week 7-8)

#### Goals

- Remove deprecated code
- Optimize performance
- Document final architecture

#### Tasks

1. **Remove Deprecated Fields**

   ```typescript
   // Run once migration is verified
   async function removeOldWeekFields(guestId: string) {
     await db.collection('guests').doc(guestId).update({
       currentWeek: FieldValue.delete(),
       previousWeek: FieldValue.delete(),
       nextWeek: FieldValue.delete(),
     });
   }
   ```

2. **Remove Old Code**

   - Delete `src/util/week.ts`
   - Delete `src/services/weeks.tsx`
   - Remove Week/Day classes from entities
   - Remove old activity constructors

3. **Performance Optimization**

   - Review index usage
   - Implement caching where beneficial
   - Set up monitoring dashboards

4. **Documentation**
   - Update architecture docs
   - Create data model reference
   - Document new services

#### Deliverables

- [ ] Old fields removed from guest documents
- [ ] Deprecated code deleted
- [ ] Performance benchmarks met
- [ ] Documentation complete

#### Rollback

- Not applicable (migration complete)
- Keep code in separate branch for emergency

---

## 8. Cost Analysis

### 8.1 Firestore Pricing Reference

| Operation        | Price per 100K |
| ---------------- | -------------- |
| Document writes  | $0.18          |
| Document reads   | $0.06          |
| Document deletes | $0.02          |
| Storage          | $0.18/GB/month |

### 8.2 Current System Costs (1000 guests)

```
Weekly Operations:
- Guest document updates: 1000 guests × 50 updates/week = 50,000 writes
- Guest document reads: 1000 guests × 100 reads/week = 100,000 reads
- Weekly transfer: 1000 writes

Yearly:
- Writes: 50,000 × 52 = 2,600,000
- Reads: 100,000 × 52 = 5,200,000

Cost:
- Writes: 2.6M × $0.18/100K = $4.68
- Reads: 5.2M × $0.06/100K = $3.12
- Total: $7.80/year
```

### 8.3 New System Costs (Hybrid with House Activity Feed)

```
Weekly Operations:
- Week document updates: 1000 guests × 50 updates/week = 50,000 writes
- House-activities writes: 1000 guests × 50 activities/week = 50,000 writes
- Week document reads: 1000 guests × 100 reads/week = 100,000 reads
- House activity feed reads: 50,000/week (estimated feed views)
- Trigger reads: 50,000 (same as week writes)
- Trigger writes (health update): 50,000

Yearly:
- Writes: (50K + 50K + 50K) × 52 = 7,800,000
- Reads: (100K + 50K + 50K) × 52 = 10,400,000

Cost:
- Writes: 7.8M × $0.18/100K = $14.04
- Reads: 10.4M × $0.06/100K = $6.24
- Total: $20.28/year
```

### 8.4 Cost Comparison

| System                                | Annual Cost | Difference |
| ------------------------------------- | ----------- | ---------- |
| Current (nested)                      | $7.80       | Baseline   |
| Pure Activity Model (3 writes/action) | $26.00+     | +233% ❌   |
| **Hybrid with Activity Feed**         | $20.28      | +160% ⚠️   |
| Hybrid + Lazy Triggers                | $15.00      | +92% ✅    |

**Note:** The increased cost is justified by the new functionality:

- ✅ House-wide activity feed (new feature)
- ✅ Full activity log with timestamps
- ✅ Any activity disputable
- ✅ Real-time activity notifications

### 8.5 Cost Optimization Strategies

1. **Lazy Health Score Updates**

   - Only update health score on read if stale
   - Reduces trigger writes by 90%

2. **Batch Trigger Execution**

   - Debounce rapid stat updates
   - Aggregate multiple updates into single health recalculation

3. **Minimize Activity Documents**

   - Only create for verified/disputed activities
   - 90% of activities don't need audit trail

4. **Use Firestore Aggregation Queries**
   - count() and sum() for house-wide stats
   - Avoids reading all documents

**Optimized Annual Cost: ~$10-12** (acceptable 30-50% increase for improved architecture)

---

## 9. Testing & Validation

### 9.1 Unit Tests

```typescript
// __tests__/services/weekService.test.ts

describe('WeekService', () => {
  describe('recordMeeting', () => {
    it('should increment meeting count', async () => {
      await WeekService.recordMeeting(testGuestId, testMeeting);

      const stats = await WeekService.getWeekStats(testGuestId);
      expect(stats.meetings).toBe(1);
    });

    it('should create activity doc when verified', async () => {
      await WeekService.recordMeeting(testGuestId, testMeeting, {
        verified: true,
        userLocation: { lat: 40.7, lng: -74.0 },
      });

      const activities = await getActivities(testGuestId);
      expect(activities.length).toBe(1);
      expect(activities[0].metadata.verified).toBe(true);
    });

    it('should not create activity doc for unverified', async () => {
      await WeekService.recordMeeting(testGuestId, testMeeting);

      const activities = await getActivities(testGuestId);
      expect(activities.length).toBe(0);
    });
  });

  describe('getWeekStats', () => {
    it('should return zeros for new week', async () => {
      const stats = await WeekService.getWeekStats(newGuestId);

      expect(stats.meetings).toBe(0);
      expect(stats.hoursWorked).toBe(0);
    });
  });
});
```

### 9.2 Integration Tests

```typescript
// __tests__/integration/weekMigration.test.ts

describe('Week Migration', () => {
  it('should migrate old week structure correctly', async () => {
    // Create guest with old structure
    const oldGuest = createGuestWithOldWeek();

    // Run migration
    await migrateGuestWeeks({ guestId: oldGuest.id });

    // Verify new structure
    const weekDoc = await getWeekDocument(oldGuest.id);
    expect(weekDoc.totals.meetings).toBe(
      oldGuest.currentWeek.days.reduce(
        (sum, day) => sum + day.meeting.length,
        0,
      ),
    );
  });

  it('should trigger health score calculation', async () => {
    await WeekService.recordMeeting(testGuestId, testMeeting);

    // Wait for trigger
    await sleep(2000);

    const week = await getWeekDocument(testGuestId);
    expect(week.healthScore).toBeGreaterThan(0);
  });
});
```

### 9.3 Manual Testing Checklist

**Phase 1:**

- [ ] Create new week document by recording stat
- [ ] Verify week document structure
- [ ] Confirm trigger fires and updates health score
- [ ] Check security rules prevent unauthorized access

**Phase 2:**

- [ ] UI displays stats from new structure
- [ ] Historical weeks display correctly
- [ ] Phase requirements calculate properly
- [ ] No UI regressions

**Phase 3:**

- [ ] Historical data migrates completely
- [ ] Reports generate from new structure
- [ ] Disputes work with activities subcollection
- [ ] No data loss

**Phase 4:**

- [ ] Old fields removed successfully
- [ ] Performance meets benchmarks
- [ ] All tests pass
- [ ] Documentation accurate

---

## 10. Post-Migration Optimization

### 10.1 Performance Monitoring

Set up Firebase Performance Monitoring for:

- Week document read latency
- Stat recording latency
- Health score trigger duration
- UI component render times

### 10.2 Cost Monitoring

Set up budget alerts:

- Daily: $0.10 (anomaly detection)
- Weekly: $0.50
- Monthly: $5.00

### 10.3 Future Enhancements

Now possible with new architecture:

1. **Activity Timeline**

   - Query activities with exact timestamps
   - Build detailed activity history view

2. **Advanced Analytics**

   - Trend analysis across arbitrary date ranges
   - Predictive risk scoring

3. **Real-time Activity Feed** (Realtime Database)

   - House-wide activity stream
   - Social accountability features

4. **Detailed Reporting**

   - Custom date range reports
   - Activity-level audit trails

5. **Improved Dispute Resolution**
   - Activity-specific evidence
   - Clear audit trail

---

## Appendix A: Security Rules (Complete)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper functions
    function isAuthenticated() {
      return request.auth != null;
    }

    function isGuestOwner(guestId) {
      return isAuthenticated() &&
             request.auth.uid == get(/databases/$(database)/documents/guests/$(guestId)).data.userId;
    }

    function isHouseAdmin(guestId) {
      let guest = get(/databases/$(database)/documents/guests/$(guestId)).data;
      return isAuthenticated() &&
             guest.houseId in request.auth.token.admin;
    }

    function isGuestOrAdmin(guestId) {
      return isGuestOwner(guestId) || isHouseAdmin(guestId);
    }

    function isHouseMember(houseId) {
      return isAuthenticated() &&
             exists(/databases/$(database)/documents/guests/$(request.auth.uid)) &&
             get(/databases/$(database)/documents/guests/$(request.auth.uid)).data.houseId == houseId;
    }

    // Guest documents
    match /guests/{guestId} {
      allow read: if isGuestOrAdmin(guestId);
      allow create: if isAuthenticated();
      allow update: if isGuestOrAdmin(guestId);
      allow delete: if isHouseAdmin(guestId);

      // Week subcollection
      match /weeks/{weekId} {
        allow read: if isGuestOrAdmin(guestId);
        allow create, update: if isGuestOrAdmin(guestId);
        allow delete: if false; // Never delete weeks
      }
    }

    // House-wide activity feed
    match /house-activities/{activityId} {
      // Any house member can read activities in their house
      allow read: if isAuthenticated() &&
                     isHouseMember(resource.data.houseId);

      // Only the guest who owns the activity can create it
      allow create: if isAuthenticated() &&
                       request.resource.data.guestId == request.auth.uid;

      // Only house admins can update (for dispute status)
      allow update: if isAuthenticated() &&
                       resource.data.houseId in request.auth.token.admin;

      // Never delete activities
      allow delete: if false;
    }

    // House documents
    match /houses/{houseId} {
      allow read: if isAuthenticated();
      allow write: if houseId in request.auth.token.admin ||
                      houseId in request.auth.token.superAdmin;
    }

    // Guest reports (read-only for clients)
    match /guest-reports/{reportId} {
      allow read: if isAuthenticated();
      allow write: if false; // Server-only
    }
  }
}
```

---

## Appendix B: Quick Reference

### Key Document Paths

| Document       | Path                              | Purpose                                     |
| -------------- | --------------------------------- | ------------------------------------------- |
| Guest          | `guests/{guestId}`                | Profile, current assignments                |
| Week           | `guests/{guestId}/weeks/{weekId}` | Weekly stats, daily breakdown, activity log |
| House Activity | `house-activities/{activityId}`   | House-wide activity feed                    |
| House          | `houses/{houseId}`                | House config, disputes, health scores       |
| Report         | `guest-reports/{reportId}`        | Historical weekly summaries                 |

### Week ID Format

```
Format: YYYY-Www
Example: 2025-W48 (Week 48 of 2025)

Calculation:
const getWeekId = (date: Date) => {
  const year = date.getFullYear();
  const week = getISOWeek(date);
  return `${year}-W${week.toString().padStart(2, '0')}`;
};
```

### Stat Recording Patterns

| Stat       | Documents Written           | Activity Feed Entry |
| ---------- | --------------------------- | ------------------- |
| Meeting    | Week doc + house-activities | ✅ Always           |
| Work Hours | Week doc + house-activities | ✅ Always           |
| Chore      | Week doc + house-activities | ✅ Always           |
| Supporter  | Week doc + house-activities | ✅ Always           |
| Medication | Week doc + house-activities | ✅ Always           |

**Note:** Every activity is now recorded in both places:

1. `week.activities[]` - for guest's personal log and dispute reference
2. `house-activities/{id}` - for house-wide activity feed

---

**Document Version:** 2.0  
**Last Updated:** November 27, 2025  
**Author:** Migration Team  
**Status:** Ready for Implementation
