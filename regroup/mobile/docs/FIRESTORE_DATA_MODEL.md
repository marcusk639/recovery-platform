# RATS v2 (Mobile) — Firestore Data Model & Access Patterns

This document explains how the **core domain data** is modeled in **Firestore**, and how the **mobile app** reads/writes/queries it.

It focuses on: **guests**, **houses**, **phases**, **admins**, **users**, **activities**, and **stats** (chores/work/meetings/meds/supporter via activities + week summaries).

---

## Concise explanation (tl;dr)

- **`users/{uid}`** is the canonical per-auth-user profile document (doc ID == Firebase Auth UID). It stores role pointers like `guestId`, `adminId`, and `houseId`.
- **`admins/{adminId}`** and **`guests/{guestId}`** are the _role-specific_ domain records. A single person may have both (e.g., guest promoted to admin).
- **`houses/{houseId}`** is the canonical house record. It embeds **phase configuration** (`houses.phases`) and operational config like **rooms** and **chores**.
- **Phase rules** are not their own collection: they’re **embedded** under `houses/{houseId}.phases`, and guests store a `phase` key pointing into that map.
- **All “stats”** (chores done, work hours, meetings, etc.) are stored as **event documents** in **`activities`**.
- For performance, weekly rollups are stored in **`week-summaries/{guestId}_{YYYY-MM-DD}`** (week start) and are recomputed after activity writes.
- **Access control** is enforced primarily by Firebase custom claims mapping a user to house roles (`guest`, `admin`, `superAdmin`). Rules gate reads/writes based on the `houseId` field in docs.
- **Read paths** are mostly via **React Query** (keyed caches) + a small amount of Redux for “current selection” (selected house/guest IDs). `DataContext` orchestrates the initial fetch and selection.

---

## Where to look in code

- **Entities (document shapes)**: `src/entities/*`
- **Firestore reads/writes**: `src/services/*`
- **Caching & mutation flows**:
  - React Query: `src/state/queries/*`
  - Redux selection + some thunks: `src/state/slices/*`
  - Orchestration: `src/context/DataContext.tsx`
- **Security rules**: `firebase/firestore.rules`
- **Composite indexes** (match query patterns): `firebase/firestore.indexes.json`

---

## Firestore access control model (important context)

Firestore rules rely on:

- **Signed-in** requirement for most collections.
- **Custom claims** under `request.auth.token`:
  - `guest`: **map (object) keyed by `houseId`** where user is a guest (e.g. `{ "house123": true }`)
  - `admin`: **map (object) keyed by `houseId`** where user is an admin
  - `superAdmin`: **map (object) keyed by `houseId`** where user is a super admin
  - Note: these are **not** arrays — Firestore rules check membership via `request.auth.token.guest[houseId] == true`
- Helper predicates in `firebase/firestore.rules`:
  - `isGuest([houseId])`, `isAdmin([houseId])`, `isGuestOrAdmin([houseId])`, `isSameUser(userId)`

Practical implication:

- Most docs contain a **`houseId` field**, and rules use that to check membership/role.
- The mobile app must write the correct `houseId` consistently, or reads/writes will be denied.

---

## Core data model (collections, relationships, and shapes)

### 1) Users — `users/{userId}`

#### Purpose

Per-auth-user profile document keyed by **Firebase Auth UID**.

#### Document ID

- **Doc ID == Auth UID** (the `User` entity sets `this.id = uid`).

#### Key fields (typical)

- **Identity/profile**: name/email/phone, avatar, etc.
- **Role pointers**:
  - `guestId` (points to `guests/{guestId}`)
  - `adminId` (points to `admins/{adminId}`)
  - `houseId` (current/primary house for guest flows)
- **Role flags**: `isAdmin`, `isGuest`, `isSuperAdmin`
- **Operator metadata**: `housesOwned`, subscription metadata (operator billing)

#### Rules

- `match /users/{userId}`: **read/write only if same auth user** (`isSameUser(userId)`).

#### Mobile access patterns

- The auth flow populates Redux user state; `DataContext` reads it and decides which entity trees to fetch.
- `src/services/users.tsx` exposes the Firestore collection and helper queries (for example, finding house owners via `housesOwned array-contains`).

---

### 2) Admins — `admins/{adminId}` (+ `admin-archive/{adminId}` if used)

#### Purpose

Role-specific record for admins/operators/managers.

#### Key fields (typical)

- `userId` (Auth UID of the person)
- `houseIds[]` (houses the admin manages)
- `superAdmin[]` (houses where admin has super admin privileges; naming is legacy-ish but present in entity)
- Profile fields: name/email/phone, avatar

#### Rules

- `match /admins/{adminId}`: read requires signed in; create/update/delete require `isAdmin(request.resource.data.houseIds)` (admin in at least one of the listed houses).

#### Mobile access patterns

- `DataContext` (admin branch) fetches:
  - houses where `adminIds array-contains adminId`
  - admin detail by `adminId`
- Admin privilege changes are often mediated by callable functions (so that custom claims can be updated consistently).

---

### 3) Houses — `houses/{houseId}`

#### Purpose

Canonical house record + embedded “configuration” for the house.

#### Key embedded config fields (important)

- **Phases**: `phases: { [phaseName]: PhaseConfiguration }`
- **Chores**: `chores: { [choreName]: Chore }`
- **Rooms/Beds**: `rooms: Rooms` (bed occupancy is modeled here; a bed stores `guestId`)

Other important fields commonly used in queries/rules:

- `id` (mirrors doc ID)
- `geohash`, `lat`, `lng`, `timezone` (nearby search)
- `adminIds[]` (IDs of `admins` docs, used for `array-contains` queries)
- Stripe/subscription fields (gated in rules for guest updates)

#### Rules

- `match /houses/{houseId}`:
  - read: signed in
  - update: admins can update anything; guests can update but **cannot modify** certain keys like `stripeAccountId`, `stripeStatus`, `monthlyRent`, `weeklyRent`, `adminIds`, `ownerId`.
  - nested: `houses/{houseId}/chat/*` readable/writable by guest or admin in the house.

#### Mobile query patterns

- **House list for admin**: `where('adminIds','array-contains', adminId)`
- **Nearby house search**: geohash range query:
  - `where('geohash','>=', lower).where('geohash','<=', upper)`

#### Update patterns

- `updateHouse(...)`: single doc update (also “cleans” chores keys to avoid empty names)
- `updateHouseBatch(...)`: multi-entity batch update:
  - house changes
  - guest updates/deletes + archiving to `guest-archive`
  - admin updates/deletes
  - side-effects via callable functions:
    - promoting guests to admin
    - removing admin privileges
    - sending invite emails

---

### 4) Guests — `guests/{guestId}` (+ `guest-archive/{guestId}`)

#### Purpose

Role-specific record for resident guests; also stores operational state (phase, job, rent owed, supporters, etc.).

#### Key relationship fields

- `userId` (Auth UID)
- `houseId` (the house the guest belongs to)
- `phase` (string or number; acts as a key into `houses/{houseId}.phases`)

#### Rules

- `match /guests/{guestId}`:
  - read: `isGuest([resource.data.houseId]) || isAdmin([resource.data.houseId])`
  - create/update: same user (`request.resource.data.userId`) OR admin of that house
  - delete: same user (`resource.data.userId`) OR admin of that house

#### Mobile query patterns

- “Guests in a house”: `where('houseId','==', houseId)` (returned as a map keyed by guest `id`).

#### Update patterns (concurrency-sensitive)

- `updateGuest(...)` uses a **transaction** with:
  - read current guest doc
  - merge strategy to reduce lost updates for certain fields
  - incrementing `version`
  - retry/backoff on Firestore contention (`aborted`, `failed-precondition`)

> Note: `src/services/guest.tsx` includes a `subscribeToGuest(...)` listener; its error handler currently uses `console.warn`, which conflicts with the project’s general “use Sentry not console” convention. This is about logging hygiene, not the data model itself.

#### Delete/archival patterns

- `deleteGuest(...)` batch:
  - delete guest doc
  - write copy into `guest-archive`
  - update `houses/{houseId}.rooms` to clear the bed occupancy
  - update `houses/{houseId}.currentCapacity`
  - (also manipulates house phases in this flow; verify intent before relying on it—house phases are primarily “configuration”)

---

### 5) Phases — embedded in `houses/{houseId}.phases` (not its own collection)

#### Purpose

House-specific rules for compliance/progression (meetings required, curfew rules, work hours, chores, medication requirements, etc.).

#### Storage

- `houses/{houseId}` contains `phases`, a map:
  - key: phase name (string)
  - value: `PhaseConfiguration { name, order, rules }`
- `guests/{guestId}.phase` stores the current phase identifier (often compared against `PhaseConfiguration.name`).

#### Compliance/advancement

- Weekly compliance is evaluated by comparing:
  - **phase rules** from `houses.phases[guest.phase].rules`
  - against **week summary stats** from `week-summaries`
- The helper logic lives in:
  - `src/util/compliance.ts` (computes compliance)
  - `src/services/phaseAdvancement.ts` (queries recent weeks + decides advancement)

---

### 6) Activities — `activities/{activityId}`

#### Purpose

Event log for all “stats-like” actions: chores, work, meetings, meds, primary supporter check-ins, etc.

#### Document shape (high-level)

- `guestId`
- `houseId`
- `type` (enum-like string; e.g., `chore`, `work`, `meeting`, `medication`, `primary_supporter`)
- `timestamp` (event time; queried/sorted; stored as Date/Timestamp)
- `data` (type-specific payload)
- `loggedBy` (Auth UID of the logger)
- `loggedAt` (server timestamp; audit)
- `verified` (+ `verifiedBy`)
- `status` (active/deleted/disputed/resolved) + dispute fields

#### Rules

- `match /activities/{activityId}`:
  - read: guest/admin in `resource.data.houseId`
  - create: same user as `loggedBy` OR admin
  - update: same user as `loggedBy` OR admin
  - delete: admin only (though service uses “soft delete” via `status`)

#### Mobile query patterns

All of these must match composite indexes in `firebase/firestore.indexes.json`:

- By guest/date range:
  - `where('guestId','==', guestId)`
  - `where('timestamp','>=', startDate)`
  - `where('timestamp','<', endDate)`
  - `where('status','==','active')`
  - optional `where('type','==', type)`
  - `orderBy('timestamp','desc')`
- Paginated variant uses `startAfter(cursor)` + `limit(pageSize + 1)`
- House feed:
  - `where('houseId','==', houseId)`
  - `where('status','==','active')`
  - `orderBy('timestamp','desc')`
  - `limit(n)`
- Real-time feed:
  - same as house feed but uses `onSnapshot(...)`

#### Update implications

Any change to an activity that affects its week (create/update/delete/resolve) triggers a **week summary recomputation** for that guest/week.

---

### 7) Weekly Stats — `week-summaries/{guestId}_{weekStart}`

#### Purpose

Pre-aggregated weekly rollups to make dashboards/compliance fast and cheap to read.

#### Document ID

- `id = \`${guestId}_${weekStart}\``
- `weekStart` is a YYYY-MM-DD date string computed as “week start (Monday)”.

#### Stored fields

- `guestId`, `houseId`
- `startDate`, `endDate`
- `stats`: week totals:
  - chores completed
  - meetings attended
  - hours worked
  - medication taken
  - primary supporter met
- `dailyStats`: map keyed by date string (YYYY-MM-DD) with the same counters per day
- `lastUpdated` (server timestamp)
- `activityCount`

#### Rules

- `match /week-summaries/{summaryId}`:
  - read: guest/admin in `resource.data.houseId`
  - write: **admin only**

#### How week summaries are maintained

`src/services/activity.ts` implements:

- `logActivity(...)`:
  - writes a new activity doc
  - computes `weekStart` from the activity timestamp
  - calls `updateWeekSummary(guestId, houseId, weekStart)`
- `updateWeekSummary(...)`:
  - queries all activities for that guest/week (active only)
  - folds into totals + daily totals
  - upserts the summary doc with merge
- Update/delete of an activity also triggers `updateWeekSummary(...)`.

#### Offline behavior

`logActivityWithOfflineSupport(...)` enqueues the activity locally when the error looks like offline network failure. A separate hook (`useOfflineSync`) auto-flushes when possible.

---

## How the mobile app _actually_ fetches and keeps this data

### DataContext orchestration (role-aware)

`src/context/DataContext.tsx` is the entry point for “load what we need after login”:

- It reads `state.user.user` (Redux) which contains a _Partial<User>_.
- It uses React Query’s `queryClient.fetchQuery(...)` to prefetch:
  - **Admin path**:
    - houses list: `houseKeys.list({ attribute: 'adminIds', value: adminId })`
    - admin detail: `adminKeys.detail(adminId)`
    - then selects a house in Redux (`selectHouseById`) and fetches guests for that house (`guestKeys.list(houseId)`).
  - **Guest path**:
    - house detail (`houseKeys.detail(houseId)`)
    - guest detail (`guestKeys.detail(guestId)`, if present)
    - then writes selected IDs to Redux

### Redux vs React Query (division of labor)

- **React Query**: canonical server data cache (houses/guests/admins/activities/week summaries).
- **Redux**: app-level selection + UI state:
  - selected house ID
  - selected guest ID
  - auth state, flags, navigation, etc.

### Real-time listeners

- The activity service provides `subscribeToHouseActivities(...)` for live feeds.
- Guest doc also has `subscribeToGuest(...)` in the guest service.

---

## Indexes and why they matter

Firestore requires composite indexes for multi-`where` + `orderBy` queries.

The key indexes that support activity + stats workflows are declared in:

- `firebase/firestore.indexes.json`

Notably:

- `activities` indexed by:
  - `(guestId, timestamp desc)`
  - `(guestId, status, timestamp desc)`
  - `(guestId, type, timestamp desc)`
  - `(guestId, type, status, timestamp desc)`
  - and the same variants for `houseId`
- `week-summaries` indexed by `(guestId, houseId, startDate desc)`

If you add new filters/sorts to activity queries, you will likely need to add a matching index entry.

---

## Practical guide: “How do I answer X?” (using this model)

- **“What chores/work/meetings did a guest do this week?”**

  - Read `week-summaries/{guestId}_{weekStart}` for totals + day breakdown.
  - If you need drill-down to individual events, query `activities` by guest + date range + type.

- **“Is a guest compliant with their phase rules?”**

  - Read `houses/{houseId}` (phase rules embedded)
  - Read recent `week-summaries` for that guest
  - Run compliance logic (see `src/util/compliance.ts`)

- **“Show the house activity feed”**

  - `activities` where `houseId == ...` and `status == active`, order by timestamp desc, limit N
  - For live feed, subscribe with `onSnapshot`

- **“List all guests in a house”**
  - `guests` where `houseId == ...`

---

## Known “extra” collections related to these domains (for completeness)

These are present in rules and/or indexes, but are outside the strict scope of “guests/houses/phases/admins/users/activities/stats”:

- `meetings` (meeting records; attendance is tracked as `activities`)
- `payments` (Stripe + manual payments; heavily server-controlled)
- `disputes`, `issues`, `complaints`
- `notifications`
- `direct-messages/{thread}/chat/*` and `houses/{houseId}/chat/*`
- Oxford governance collections under `houses/{houseId}/*` (officers, votes, elections, etc.)
- `drug-tests`, `ees-records`
- `webhookEvents` (explicitly server-only; denied to clients)
- `documents/{documentId}` — admin-uploaded files scoped to a house or resident; see entity: `src/entities/Document.ts`; service: `src/services/documents.ts`; access: admin-only writes, admin-only reads (residents have no access); shape: `{ id, houseId, guestId?, fileName, storageUrl, storagePath, fileType, category, uploadedAt, uploadedBy }`; added 2026-05-22
- `staff-notes/{noteId}` — admin shift log entries; access: admin-only; shape: `{ id, houseId, authorId, authorName, body, createdAt }`; added 2026-05-22
  - **⚠️ No client-side Firestore rule is currently defined for `staff-notes`.** Reads and writes from the mobile app will return `PERMISSION_DENIED` until a rule is added to `firebase/firestore.rules`.

---

## Glossary

- **Auth UID**: Firebase Authentication user ID (string).
- **Role doc IDs**: `guestId`, `adminId` are Firestore document IDs in their respective collections; they are not guaranteed to equal Auth UID.
- **House role claims**: the canonical membership source for rules; stored in the ID token’s custom claims.
- **Week start**: Monday, computed from event timestamp; stored as `YYYY-MM-DD` string.

---
*Last reviewed: 2026-05-24 | Audience: developer | Type: reference*
