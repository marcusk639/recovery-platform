# Regroup - End-to-End Architecture

This document provides a comprehensive breakdown of the Regroup sober living management platform, covering the React Native mobile client, Firebase Cloud Functions backend, and Firestore data architecture.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Frontend: React Native Client](#2-frontend-react-native-client)
3. [Backend: Firebase Cloud Functions](#3-backend-firebase-cloud-functions)
4. [Firestore Data Architecture](#4-firestore-data-architecture)
5. [Authentication & Authorization](#5-authentication--authorization)
6. [Payment System (Stripe)](#6-payment-system-stripe)
7. [Real-Time & Offline Patterns](#7-real-time--offline-patterns)
8. [Oxford House Governance](#8-oxford-house-governance)
9. [Notification System](#9-notification-system)
10. [Testing Strategy](#10-testing-strategy)

---

## 1. System Overview

### High-Level Architecture

```
+---------------------+        +----------------------+        +------------------+
|  React Native App   | <----> |  Firebase Services   | <----> | External APIs    |
|  (regroup/mobile/)  |        |  (regroup/functions/) |        |                  |
+---------------------+        +----------------------+        +------------------+
| - iOS & Android     |        | - Cloud Functions    |        | - Stripe         |
| - React Navigation  |        | - Firestore          |        | - Google Maps    |
| - Redux Toolkit     |        | - Auth (custom claims)|        | - SendGrid       |
| - React Query       |        | - Cloud Messaging    |        | - AA/NA/CR APIs  |
| - Formik + Yup      |        | - Cloud Storage      |        | - Sentry         |
+---------------------+        +----------------------+        +------------------+
```

### Repository Structure

| Component                | Path                 | Purpose                                     | Key Tech                                                  |
| ------------------------ | -------------------- | ------------------------------------------- | --------------------------------------------------------- |
| **Regroup mobile**       | `regroup/mobile/`    | Mobile client + Firestore rules + E2E tests | React Native 0.72, TypeScript, Redux Toolkit, React Query |
| **Regroup functions**    | `regroup/functions/` | Cloud Functions backend                     | TypeScript, Firebase Admin SDK, Stripe SDK                |
| **Regroup web**          | `regroup/web/`       | Marketing/landing page + web portal         | Angular, TypeScript, Firebase Hosting                     |

### Data Flow Summary

```
User Action (tap, form submit)
  -> React Component
    -> Service Layer (src/services/)
      -> Firestore SDK or httpsCallable
        -> Firestore Document Write
          -> Cloud Function Trigger (optional)
            -> Side Effects (notifications, email, Stripe)
              -> Firestore Update
                -> onSnapshot / React Query refetch
                  -> UI Update
```

---

## 2. Frontend: React Native Client

### 2.1 Provider Tree (App.tsx)

The app wraps the component tree in a specific order. Each provider depends on its parent:

```
ErrorBoundary                         // Catches unhandled JS errors -> Sentry
  SafeAreaProvider                    // Safe area insets for notch/home bar
    StripeProvider                    // Stripe SDK context (publishable key)
      ThemeProvider                   // Light/dark theme via Redux
        DataProvider                  // Bridges Redux state -> React context
          NotificationProvider        // In-app toast/popup notifications
            ModalProvider             // Form modals and popovers
              Auth                    // Parses Firebase ID token claims -> roles
                RootNavigator         // React Navigation stack
```

The `RootNavigator` is memoized with a key derived from `${user?.uid}-${loggedIn}-${anonymous}`, which forces a full remount on auth state changes (login, logout, anonymous->authenticated transitions).

### 2.2 Navigation Architecture

React Navigation 7 with native stack. Three nested navigator layers:

```
RootStack
  ├── AuthStack (unauthenticated)
  │   ├── PriorAuth            # Entry decision screen
  │   ├── InitialLanding       # Welcome screen
  │   ├── Login                # Email/password login
  │   ├── Signup               # Account creation
  │   ├── NewAccount           # Profile setup
  │   ├── HouseSearch          # Browse & join houses
  │   ├── ManagerIntro         # Manager onboarding
  │   └── IntroHouseSummary    # First house view
  │
  ├── SetupStack (authenticated, no house yet)
  │   ├── OrgSetup             # Organization creation
  │   └── OperatorSetupWizard  # House configuration wizard
  │
  ├── MainTab (authenticated + house selected)
  │   ├── House                # House dashboard, bed assignments, disputes
  │   ├── Guest                # Guest profiles, compliance tracking
  │   ├── Activities           # Activity logging & history
  │   ├── Contacts             # House member directory
  │   ├── HouseChat            # House-wide group chat
  │   └── Personal             # Profile, settings, 2FA
  │
  └── Modals (presented over any tab)
      ├── NewMeeting, MeetingSearch
      ├── CreateGuest, GuestList
      ├── OxfordDashboard, Voting, BusinessMeetings
      ├── ResidentPayment, PaymentHistory
      ├── Notifications
      ├── HouseSettings, StripeSettings
      └── DirectChat
```

Route names are defined as a `Routes` enum in `src/navigation/types.ts`. Navigation state is calculated by `improvedNavigationService.getInitialNavigation(user, invitation)` which determines the starting screen based on auth state, role, and pending invitations.

### 2.3 State Management (Hybrid Architecture)

The app uses a dual state management approach, currently migrating from Redux-only to Redux + React Query:

#### Redux Toolkit (Client/UI State)

13 slices in `src/state/slices/`:

| Slice                | Purpose                 | Key Data                          |
| -------------------- | ----------------------- | --------------------------------- |
| `authSlice`          | Auth state machine      | token, loginStatus, error         |
| `userSlice`          | Current user entity     | user profile, subscription status |
| `housesSlice`        | Houses the user manages | house list, selected house        |
| `guestsSlice`        | Guests in current house | guest list, selected guest        |
| `meetingsSlice`      | Meeting search/check-in | search results, check-in status   |
| `adminSlice`         | Admin records           | admin list, selected admin        |
| `chatSlice`          | Messaging state         | conversations, active chat        |
| `setupSlice`         | Onboarding wizard       | current step, org config          |
| `cacheSlice`         | Entity cache with TTL   | cached guests/houses/meetings     |
| `notificationsSlice` | Notification state      | notification list, unread count   |
| `uiSlice`            | UI state flags          | loading, modal visibility, toast  |
| `themeSlice`         | Theme preference        | light/dark mode                   |
| `navigationSlice`    | Nav metadata            | screen title, modal state         |

Typed hooks: `useAppSelector` / `useAppDispatch` from `src/state/store.ts`.

#### React Query (Server Data)

Query files in `src/state/queries/` wrap service calls with caching, refetching, and optimistic updates:

| Query File            | Hooks                                                                                                 | staleTime |
| --------------------- | ----------------------------------------------------------------------------------------------------- | --------- |
| `activityQueries`     | `useActivities`, `useInfiniteActivities`, `useHouseActivities`, `useWeekSummary`, `useLogNewActivity` | 30s       |
| `guestQueries`        | `useGuests`, `useGuest`, `useUpdateGuest`, `useCreateGuest`                                           | 30s       |
| `houseQueries`        | `useHouse`, `useHouses`, `useNearbyHouses`, `useCreateHouse`, `useUpdateHouse`                        | 60s       |
| `paymentQueries`      | `usePaymentHistory`, `useCreateRentPayment`                                                           | 30s       |
| `oxfordQueries`       | `useOfficers`, `useBusinessMeetings`, `useMeetingVotes`, `useElections`, `useEESTransactions`         | 30s       |
| `disputeQueries`      | `useDisputes`                                                                                         | 30s       |
| `adminQueries`        | `useHouseAdmins`, `useAdmin`, `useUpdateAdmin`                                                        | 30s       |
| `notificationQueries` | `useNotifications`, `useMarkNotificationRead`                                                         | 30s       |

**Key factory pattern** (consistent across all query files):

```ts
export const activityKeys = {
  all: ['activities'],
  lists: () => [...activityKeys.all, 'list'],
  list: filters => [...activityKeys.lists(), filters],
  details: () => [...activityKeys.all, 'detail'],
  detail: id => [...activityKeys.details(), id],
};
```

**Optimistic update pattern** (used in mutation hooks):

```
onMutate:  snapshot previous state -> cancel refetches -> update cache optimistically
onError:   rollback to snapshot
onSettled: invalidate queries to refetch ground truth
```

### 2.4 Service Layer

`src/services/` encapsulates all Firestore reads/writes and Cloud Function invocations. Each service file exports a module-level collection reference and domain-specific functions:

| Service File             | Collection(s)                                    | Key Operations                                           |
| ------------------------ | ------------------------------------------------ | -------------------------------------------------------- |
| `house.tsx`              | `houses`                                         | CRUD, nearby search, admin management, batch create      |
| `guest.tsx`              | `guests`, `guest-archive`                        | CRUD with optimistic locking, transactions, stat merging |
| `activity.ts`            | `activities`, `week-summaries`                   | Log, update, paginate, subscribe, offline support        |
| `users.tsx`              | `users`                                          | Profile CRUD                                             |
| `admin.tsx`              | `admins`                                         | Admin record management                                  |
| `meeting.ts`             | `meetings`                                       | Search, check-in (calls Cloud Functions)                 |
| `message.tsx`            | `direct-conversations`, house chat subcollection | Send, load, mark read                                    |
| `payments.ts`            | `payments`                                       | Create payment intent, history (calls Cloud Functions)   |
| `notifications.tsx`      | `notifications`                                  | Fetch, mark read, FCM token registration                 |
| `complaints.ts`          | `complaints`                                     | CRUD                                                     |
| `issues.ts`              | `issues`                                         | CRUD                                                     |
| `storage.tsx`            | Cloud Storage                                    | Upload house photos, avatars                             |
| `offlineQueue.ts`        | N/A (AsyncStorage)                               | Queue failed writes, retry with backoff                  |
| `EnhancedAuthService.ts` | Firebase Auth                                    | Sign in/up with rate limiting + validation               |
| `crud.tsx`               | Generic                                          | Reusable CRUD operations                                 |

**Oxford House services** (in `src/services/oxford/`):

- `index.ts` — Officer management
- `businessMeetings.ts` — Business meeting CRUD
- `votes.ts` — Vote creation, casting (with transactions)
- `ees.ts` — Equal Expense Share calculations

### 2.5 Context Providers

| Context               | Hook                | Purpose                                                               |
| --------------------- | ------------------- | --------------------------------------------------------------------- |
| `DataContext`         | `useData()`         | currentUser, currentHouse, currentGuest, currentAdmin + loading flags |
| `ModalContext`        | `useModal()`        | showFormModal(), dismissFormModal(), showPopover()                    |
| `NotificationContext` | `useNotification()` | notify(header, content, buttons, status, timedDismiss)                |
| `AuthContext`         | via `auth.ts`       | token.claims, token.role for auth checks                              |

### 2.6 Component Library

All reusable UI components use the `rats-` prefix and live in `src/components/`:

**Form Controls:** `rats-text-input`, `rats-numeric-input`, `rats-datepicker`, `rats-picker`, `rats-checkbox`, `rats-switch`, `rats-radio-button-group`, `rats-search-bar`

**Layout:** `rats-flat-list`, `rats-scroll-view`, `rats-modal`, `rats-modal-form`, `rats-horizontal-rule`, `rats-step-indicator`

**Display:** `rats-text`, `rats-avatar`, `rats-icon`, `rats-image`, `rats-logo`, `rats-stat-card`, `rats-bar-graph`, `rats-loading-indicator`, `rats-loading-modal`, `rats-label`

**Interactive:** `rats-button`, `rats-list-item`, `rats-interactable-section`, `rats-popover`, `rats-search-filter`, `rats-image-picker`

### 2.7 Entity Types

TypeScript interfaces in `src/entities/` define Firestore document shapes. Key entities:

| Entity         | Key Fields                                                                                                       | Notes                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `User`         | uid, email, roles, housesOwned, subscriptionMetadata, messagingToken[]                                           | Keyed by Firebase Auth UID                           |
| `House`        | id, name, location (lat/lng/geohash), adminIds[], capacity, monthlyRent, stripeAccountId, phases, chores, health | Embedded disputes/issues/rooms                       |
| `Guest`        | id, userId, houseId, sobrietyDate, phase, step, status, rentOwed, supporters[]                                   | Optimistic locking via `version` field               |
| `Activity`     | id, guestId, houseId, type, timestamp, data, verified, status                                                    | Type: chore/meeting/work/medication/primarySupporter |
| `WeekSummary`  | id (guestId_startDate), stats, dailyStats, phaseRequirementsMet                                                  | Pre-aggregated weekly rollups                        |
| `Meeting`      | id, houseId, type (AA/NA/Custom), location, day, time                                                            | Both app-created and external API meetings           |
| `Admin`        | id, userId, houseIds[], email                                                                                    | Maps user to admin role                              |
| `Notification` | userId, subject, message, type, read, date                                                                       | Written by Cloud Functions                           |
| `Dispute`      | id, guestId, activityId, status, challenges[]                                                                    | Immutable resolution chain                           |

---

## 3. Backend: Firebase Cloud Functions

Cloud Functions live in the **regroup-functions** repository. They are organized into callable functions, triggers, scheduled jobs, HTTP handlers, and webhooks.

### 3.1 Callable Functions (httpsCallable)

These are invoked from the mobile client via `functions.httpsCallable('functionName')(payload)`:

#### Auth Functions (`src/callable/auth.ts`)

| Function                           | Purpose                                 |
| ---------------------------------- | --------------------------------------- |
| `addGuestAuthorization`            | Assigns guest custom claims for a house |
| `addAdminAuthorization`            | Assigns admin/superAdmin claims         |
| `deleteAdminAuthorization`         | Removes admin/superAdmin claims         |
| `promoteGuestsToAdmin`             | Batch promote guests to admin role      |
| `removePrivilegesForGuests`        | Batch remove role from guests           |
| `verifyUserEmail`                  | Triggers email verification             |
| `givePotentialSuperAdminPrivilege` | Grants potentialSuperAdmin flag         |

#### House Functions (`src/callable/houses.ts`)

| Function           | Purpose                                   |
| ------------------ | ----------------------------------------- |
| `addNewHouseAdmin` | Adds a user as admin to a house           |
| `searchForHouses`  | Geo-proximity search using geohash ranges |

#### Meeting Functions (`src/callable/meetings.ts`)

| Function                     | Purpose                                    | External API                             |
| ---------------------------- | ------------------------------------------ | ---------------------------------------- |
| `findMeetings`               | Search 12-step meetings by location & type | AA Meeting Guide, NA, Celebrate Recovery |
| `userIsAtMeeting`            | Verify user is within 200m of a meeting    | Google Maps                              |
| `narcoticsAnonymousMeetings` | Get NA meetings for a location             | NA database                              |
| `getCurrentAddress`          | Reverse geocode coordinates to address     | Google Maps                              |

#### Payment Functions (`src/callable/payments.ts`)

| Function                  | Purpose                                  | Stripe API                  |
| ------------------------- | ---------------------------------------- | --------------------------- |
| `createPaymentIntent`     | Create destination charge for rent       | PaymentIntents (2% app fee) |
| `listPayments`            | Get payment history for a guest          | PaymentIntents list         |
| `listHousePayments`       | Batch fetch all house payments           | PaymentIntents list         |
| `savePaymentMethod`       | Store card reference in Firestore        | PaymentMethods              |
| `connectStripeAccount`    | Create Express account + onboarding link | Accounts, AccountLinks      |
| `disconnectStripeAccount` | Disconnect Express account (idempotent)  | Accounts                    |
| `getStripeAccountStatus`  | Fetch + sync account status              | Accounts                    |

#### Subscription Functions (`src/callable/subscriptions.ts`)

| Function                         | Purpose                                                     |
| -------------------------------- | ----------------------------------------------------------- |
| `createOperatorSubscription`     | Initialize subscription (30-day trial, house + guest items) |
| `reactivateOperatorSubscription` | Reactivate cancelled/paused subscription                    |
| `cancelUserSubscription`         | Mark for cancellation at period end                         |
| `updateSubscriptionGuests`       | Adjust guest item quantity                                  |
| `updateSubscriptionHouses`       | Adjust house item quantity                                  |
| `sendInviteEmails`               | Send admin/guest invitation emails (SendGrid)               |
| `sendConfirmationEmail`          | Send onboarding confirmation email                          |

### 3.2 Firestore Triggers

These execute automatically when documents are created, updated, or deleted:

| Trigger                        | Document Path         | Event    | Side Effect                          |
| ------------------------------ | --------------------- | -------- | ------------------------------------ |
| `notify`                       | `/notifications/{id}` | onCreate | Sends FCM push notification          |
| `notifyNewHouseCreated`        | `/houses/{id}`        | onCreate | Emails admin                         |
| `sendContactEmail`             | `/contact/{id}`       | onCreate | Emails support team                  |
| `sendSubscriptionUpdateEmail`  | `/users/{id}`         | onUpdate | Emails on subscription status change |
| `reportBug`                    | `/bugs/{id}`          | onCreate | Emails dev team                      |
| `submitFeedback`               | `/feedback/{id}`      | onCreate | Emails product team                  |
| `addDeleteGuestAuthorization`  | `/guests/{id}`        | onDelete | Removes auth claims                  |
| `eesRecalculationOnGuestWrite` | `/guests/{id}`        | onWrite  | Recalculates EES for current week    |

**RTDB Trigger:**

| Trigger          | Path                                | Event          | Side Effect                     |
| ---------------- | ----------------------------------- | -------------- | ------------------------------- |
| `dmNotification` | `/direct-messages/{convId}/{msgId}` | onValueCreated | Sends push notification for DMs |

### 3.3 Scheduled Functions

| Function                          | Schedule    | Timezone            | Purpose                                              |
| --------------------------------- | ----------- | ------------------- | ---------------------------------------------------- |
| `updateDisputes`                  | `0 2 * * *` | UTC                 | Auto-resolves disputes older than 2 days             |
| `scheduledWeeklyTransferEST`      | `0 0 * * 0` | America/New_York    | Weekly stats transfer (current -> previous week)     |
| `scheduledWeeklyTransferCST`      | `0 0 * * 0` | America/Chicago     | Weekly stats transfer                                |
| `scheduledWeeklyTransferMST`      | `0 0 * * 0` | America/Denver      | Weekly stats transfer                                |
| `scheduledWeeklyTransferPST`      | `0 0 * * 0` | America/Los_Angeles | Weekly stats transfer                                |
| `scheduledWeeklyTransferFallback` | `0 0 * * 0` | UTC                 | Weekly transfer for houses without timezone          |
| `warmWebsite`                     | Every 5 min | N/A                 | Keeps Cloud Functions warm (prevents cold starts)    |
| `officerTermReminder`             | `0 8 * * *` | UTC                 | Notifies officers with terms expiring within 30 days |

### 3.4 HTTP Handlers & Webhooks

**HTTP Handlers:**

- `universal` — Health check endpoint (`/health`, `/healthz`)
- `stripeConnectReauth` — Handles expired Stripe AccountLinks; generates fresh onboarding link
- `stripeConnectReturn` — Stripe redirect post-onboarding; syncs account status to Firestore

**Stripe Webhook (`stripeWebhook`):**

- `payment_intent.succeeded` — Records payment in Firestore, decrements guest balance, notifies guest & admins
- `payment_intent.payment_failed` — Logs failure, records failure details, notifies guest & admins
- Connect account events — Syncs account status changes

### 3.5 Backend Utilities

| Utility            | File            | Purpose                                                                                    |
| ------------------ | --------------- | ------------------------------------------------------------------------------------------ |
| `claims.ts`        | Auth claims     | `createClaims()`, `deleteClaim()` — add/remove house IDs from role claims                  |
| `houseAuth.ts`     | Authorization   | `isHouseAdmin()`, `assertHouseAdmin()`, `checkIsMember()`, `assertHouseMemberFromClaims()` |
| `stripe.ts`        | Stripe helpers  | `createStripeClient()`, `mapStripeError()`, `isAlreadyDeauthorized()`                      |
| `notifications.ts` | FCM push        | `sendNotification()` — multicast to user's messagingToken[], cleans stale tokens           |
| `email.ts`         | SendGrid        | `sendEmail()` — transactional emails                                                       |
| `geohash.ts`       | Geo queries     | `getGeohashRange()`, `getQueriesForDocumentsAround()`                                      |
| `meetings.ts`      | External APIs   | AA/NA/Celebrate Recovery meeting search                                                    |
| `disputes.ts`      | Dispute logic   | `disputeResult()`, `runDisputeTransaction()`                                               |
| `guest.ts`         | Weekly transfer | `transferStats()` — moves current week -> previous, initializes new week                   |
| `date.ts`          | Date math       | Timezone-aware date calculations                                                           |

### 3.6 Error Handling Patterns

```
Callable Functions:  throw HttpsError(code, message)
                     Codes: unauthenticated, permission-denied, invalid-argument,
                            not-found, failed-precondition, internal

Triggers:            logger.error() + re-throw (enables Firebase retries)

Webhooks:            Log errors, continue processing (non-fatal for notifications)

External APIs:       try-catch -> return null/empty (graceful degradation)

Stripe:              mapStripeError(err) -> HttpsError with appropriate code
```

---

## 4. Firestore Data Architecture

### 4.1 Collection Map

```
Firestore Root
├── users/{userId}                              # User accounts (keyed by Auth UID)
├── guests/{guestId}                            # Guest/resident profiles
├── guest-archive/{guestId}                     # Archived guest records
├── admins/{adminId}                            # Admin user records
├── admin-archive/{adminId}                     # Archived admin records
├── houses/{houseId}                            # Physical house entities
│   ├── /chat/{chatId}                          # House-wide chat messages
│   ├── /officers/{officerId}                   # Oxford House officer roles
│   ├── /business-meetings/{meetingId}          # Oxford House meetings
│   ├── /votes/{voteId}                         # Oxford House governance votes (immutable)
│   └── /guests/{guestId}/
│       └── /paymentMethods/{pmId}              # Stripe payment methods (Cloud Functions only)
├── activities/{activityId}                     # Activity logs (chores, meetings, work, meds)
├── week-summaries/{guestId_startDate}          # Pre-aggregated weekly statistics
├── meetings/{meetingId}                        # Public 12-step meeting records
├── notifications/{notificationId}              # Push notification records
├── payments/{paymentId}                        # Stripe payment records
├── disputes/{disputeId}                        # Activity disputes
├── complaints/{complaintId}                    # User complaints
├── issues/{issueId}                            # House maintenance issues
├── direct-messages/{conversationId}/{msgId}    # DM storage (RTDB)
├── subscriptions/{subscriptionId}              # Operator subscription records
├── webhookEvents/{eventId}                     # Stripe webhook audit trail (server-only)
├── contact/{contactId}                         # Contact form submissions (public create)
├── beta-users/{docId}                          # Beta program signups (public create)
├── feedback/{feedbackId}                       # User feedback
├── bugs/{bugId}                                # Bug reports
├── ees-records/{eesId}                         # Equal Expense Share records
└── organizations/{orgId}                       # Multi-house organizations
```

### 4.2 Document Relationships

```
                    ┌──────────────┐
                    │   users      │
                    │   (Auth UID) │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              v            v            v
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │  admins   │ │  guests  │ │  houses  │
        │ .userId   │ │ .userId  │ │ .ownerId │
        │ .houseIds │ │ .houseId │ │ .adminIds│
        └──────────┘ └─────┬────┘ └────┬─────┘
                           │           │
              ┌────────────┼───────────┤
              │            │           │
              v            v           v
        ┌──────────┐ ┌──────────┐ ┌──────────────┐
        │activities │ │ disputes │ │ week-summaries│
        │ .guestId  │ │ .guestId │ │ .guestId     │
        │ .houseId  │ │ .houseId │ │ .houseId     │
        └──────────┘ │.activityId└──────────────┘
                     └──────────┘

  houses/{houseId}/
    ├── chat         (messages within a house)
    ├── officers     (Oxford House officers)
    ├── votes        (governance votes - immutable)
    ├── business-meetings (Oxford meetings)
    └── guests/{guestId}/paymentMethods (Stripe cards)
```

### 4.3 Write Source by Collection

Understanding which system writes to each collection is critical for debugging and security:

| Collection                  |        Client Writes        |     Cloud Function Writes      |   Trigger Writes   |
| --------------------------- | :-------------------------: | :----------------------------: | :----------------: |
| `users`                     |        Profile edits        | Subscription metadata, claims  |         --         |
| `guests`                    | Profile, status, activities | Weekly stats transfer, archive | EES recalculation  |
| `houses`                    |       CRUD, settings        |       Stripe status sync       |         --         |
| `activities`                |    Log, update, dispute     |               --               |         --         |
| `week-summaries`            |             --              |     Scheduled aggregation      |         --         |
| `notifications`             |          Mark read          |      Create notification       | FCM push on create |
| `payments`                  |             --              |       Payment recording        |         --         |
| `houses/.../paymentMethods` |             --              |       Stripe method sync       |         --         |
| `houses/.../chat`           |        Send messages        |               --               |         --         |
| `houses/.../votes`          |   Create only (immutable)   |               --               |         --         |
| `webhookEvents`             |           Denied            |      Webhook audit trail       |         --         |
| `contact`, `beta-users`     |        Public create        |               --               |  Email on create   |

### 4.4 Composite Indexes

Defined in `firebase/firestore.indexes.json`. Key indexes support the activity query patterns:

**activities collection** (8 composite indexes):

- `guestId` + `timestamp` (DESC) — Guest activity timeline
- `guestId` + `type` + `timestamp` (DESC) — Guest activities filtered by type
- `guestId` + `status` + `timestamp` (DESC) — Guest activities filtered by status
- `guestId` + `type` + `status` + `timestamp` (DESC) — Full filter
- `houseId` + `timestamp` (DESC) — House activity timeline
- `houseId` + `type` + `timestamp` (DESC) — House activities by type
- `houseId` + `status` + `timestamp` (DESC) — House activities by status
- `houseId` + `type` + `status` + `timestamp` (DESC) — Full filter

**week-summaries:** `guestId` + `houseId` + `startDate` (DESC)

**na-meetings:** `day` + `geohash` (for geo-proximity meeting search)

### 4.5 Pagination Pattern

Cursor-based pagination using Firestore's `startAfter`:

```ts
// Service layer (activity.ts)
async function getActivitiesPage(guestId, startDate, endDate, cursor, type) {
  let query = activitiesCollection
    .where('guestId', '==', guestId)
    .where('timestamp', '>=', startDate)
    .where('timestamp', '<=', endDate)
    .orderBy('timestamp', 'desc')
    .limit(pageSize + 1);  // +1 to detect if more pages exist

  if (cursor) query = query.startAfter(cursor);
  if (type) query = query.where('type', '==', type);

  const snapshot = await query.get();
  const hasMore = snapshot.docs.length > pageSize;
  const docs = hasMore ? snapshot.docs.slice(0, -1) : snapshot.docs;

  return {
    items: docs.map(mapActivityDoc),
    nextCursor: hasMore ? docs[docs.length - 1] : undefined,
  };
}

// React Query integration
const { data, fetchNextPage, hasNextPage } = useInfiniteQuery({
  queryKey: activityKeys.infiniteList(guestId, startDate, endDate, type),
  queryFn: ({ pageParam }) => getActivitiesPage(..., pageParam, type),
  initialPageParam: undefined,
  getNextPageParam: (lastPage) => lastPage.nextCursor,
});
```

---

## 5. Authentication & Authorization

### 5.1 Auth Flow

```
App Launch
  │
  ├── No auth session ──> AuthStack (Login / Signup)
  │                         │
  │                         ├── Email/password sign-in (EnhancedAuthService)
  │                         │     - Rate limited: 5 attempts per 60 seconds
  │                         │     - Email validation
  │                         │     - Password strength checks
  │                         │
  │                         └── Sign-up -> createUser() -> Firestore `users` doc
  │
  ├── Auth session, no house ──> SetupStack (OrgSetup / OperatorSetupWizard)
  │
  └── Auth session + house ──> MainTab (full app)
```

### 5.2 Custom Claims (Role System)

Firebase Auth custom claims are set by Cloud Functions (never by the client):

```ts
interface UserClaims {
  admin: string[]; // House IDs where user is admin
  guest: string[]; // House IDs where user is guest
  superAdmin: string[]; // House IDs where user is super admin
  potentialSuperAdmin?: boolean; // Flag for users who may become superAdmin
}
```

**Role hierarchy:** `superAdmin > admin > guest`

The `isAdmin()` helper in security rules returns true for both `admin` and `superAdmin` — always use it instead of checking individual roles.

**Claims staleness:** Claims are cached on ID tokens for up to 1 hour. For ground-truth checks (especially in Cloud Functions), use `checkIsMember()` which queries Firestore directly.

### 5.3 Security Rules Architecture

Rules live in `firebase/firestore.rules` (228 lines) with helper functions:

```
signedIn()                    → request.auth.uid != null
hasHouseRole()                → signedIn + token exists
roleExists(role)              → request.auth.token[role] != null
isHouseAdmin(houseId)         → houseId in request.auth.token.admin
isHouseSuperAdmin(houseId)    → houseId in superAdmin array
isHouseGuest(houseId)         → houseId in guest array
isAdmin(houseIds)             → admin OR superAdmin (hierarchical)
isSameUser(userId)            → request.auth.uid == userId
```

**Key security patterns:**

- **Ownership via `get()`:** For subcollection documents (payment methods), use `get()` to resolve the parent document's `userId` rather than relying on path parameters
- **Immutable documents:** Votes explicitly deny updates and deletes (`allow update, delete: if false`)
- **Server-only collections:** `webhookEvents` denies all client access; Cloud Functions use Admin SDK
- **Public forms:** `contact` and `beta-users` allow anonymous creates

### 5.4 Storage Rules

Storage rules (`firebase/storage.rules`) validate both content type and file size:

| Path                                                    | Max Size | Allowed Types | Access                   |
| ------------------------------------------------------- | -------- | ------------- | ------------------------ |
| `users/{userId}/avatar`                                 | 5 MB     | Images        | Owner only               |
| `houses/{houseId}/photo`                                | 10 MB    | Images        | Admin                    |
| `houses/{houseId}/logo/{file}`                          | 5 MB     | Images        | Admin                    |
| `houses/{houseId}/guests/{guestId}/avatar/{file}`       | 5 MB     | Images        | Admin                    |
| `houses/{houseId}/{week}/{day}/chores/{guestId}/{file}` | 10 MB    | Images        | House member             |
| `reports/{houseId}/{path=**}`                           | 20 MB    | PDFs          | Admin write, member read |
| `temp/{userId}/{path=**}`                               | 10 MB    | Any           | Owner only               |
| `/{allPaths=**}`                                        | --       | --            | Deny all (catch-all)     |

---

## 6. Payment System (Stripe)

### 6.1 Architecture Overview

```
┌─────────────┐      ┌──────────────────┐      ┌─────────────┐
│ Mobile App  │      │ Cloud Functions   │      │   Stripe    │
│             │      │                   │      │             │
│ Payment UI  │─────>│ createPaymentIntent│─────>│ PaymentIntent│
│             │      │   (2% app fee)    │      │  (dest charge)│
│             │      │                   │      │             │
│             │      │ stripeWebhook     │<─────│  Webhooks   │
│             │      │  (payment result) │      │             │
│             │      │                   │      │             │
│ Stripe      │─────>│ connectStripeAccount│────>│  Express    │
│ Settings UI │      │ getStripeAccountStatus│<──│  Accounts   │
│             │      │ disconnectStripeAccount│──>│             │
└─────────────┘      └──────────────────┘      └─────────────┘
```

### 6.2 Payment Flow

1. **House operator connects Stripe** via `connectStripeAccount` → Creates Express account → Onboarding link
2. **Guest initiates rent payment** → `createPaymentIntent` → Stripe destination charge with 2% app fee
3. **Stripe processes payment** → Webhook → `payment_intent.succeeded` or `payment_intent.payment_failed`
4. **Cloud Function records result** → Updates `payments` collection → Decrements `guest.rentOwed` → Sends notifications

### 6.3 Operator Subscription (SaaS Billing)

House operators pay per house and per guest:

```
Subscription
  ├── House item (quantity = number of houses managed)
  └── Guest item (quantity = total residents across all houses)
```

- 30-day free trial on creation
- Quantity adjustments via `updateSubscriptionGuests` / `updateSubscriptionHouses`
- Cancellation at period end (not immediate)
- Subscription metadata synced to `users.subscriptionMetadata`

---

## 7. Real-Time & Offline Patterns

### 7.1 Real-Time Listeners

Used for data that must stay live:

```ts
// House chat — real-time message stream
firestore
  .collection('houses')
  .doc(houseId)
  .collection('chat')
  .orderBy('sortKey', 'desc')
  .limit(50)
  .onSnapshot(
    snapshot => {
      const messages = snapshot.docs.map(mapMessageDoc);
      callback(messages);
    },
    error => logException(error),
  );
// Returns unsubscribe function — called on component unmount
```

**Where real-time is used:**

- House chat messages (`onSnapshot`)
- Guest status changes (`onSnapshot`)
- House activity feed (`subscribeToHouseActivities`)

### 7.2 Offline Queue

The `offlineQueue` service (`src/services/offlineQueue.ts`) handles write failures gracefully:

```
Write attempt
  │
  ├── Success → done
  │
  └── Network error detected → enqueue to AsyncStorage
                                  │
                                  └── On reconnect → flush queue
                                        │
                                        ├── Success → remove from queue
                                        └── Failure → increment retryCount
                                              │
                                              ├── retryCount < 3 → keep in queue
                                              └── retryCount >= 3 → drop item
```

**Network error detection:** Checks error `code` for `'unavailable'` or `'deadline-exceeded'`, or error message contains network-related strings.

**Storage:** Tries `@react-native-async-storage/async-storage` first, falls back to in-memory array.

### 7.3 Timestamp Handling

**Writes:** Use `FirebaseFirestore.FieldValue.serverTimestamp()` for audit fields. This ensures consistent timestamps regardless of client clock drift.

**Reads:** Always use the `.toDate()` fallback pattern because timestamps may arrive in different formats depending on cache state:

```ts
timestamp: doc.data().timestamp?.toDate?.() || doc.data().timestamp;
```

---

## 8. Oxford House Governance

Oxford House features are gated behind the `oxfordEnabled` subscription flag and implement democratic governance:

### 8.1 Feature Set

| Feature               | Subcollection                   | Key Operations                                                     |
| --------------------- | ------------------------------- | ------------------------------------------------------------------ |
| **Officers**          | `houses/{id}/officers`          | Elect, remove, term tracking, expiry reminders                     |
| **Business Meetings** | `houses/{id}/business-meetings` | Schedule, record attendance, quorum check, minutes                 |
| **Voting**            | `houses/{id}/votes`             | Create vote, cast ballot (transaction), tally, pass/fail threshold |
| **EES Tracking**      | `ees-records`                   | Calculate equal shares, track payments, adjustments                |

### 8.2 Vote Implementation

Votes are **immutable once created** (security rules deny updates/deletes). Vote casting uses Firestore transactions to prevent race conditions:

```ts
await firestore.runTransaction(async transaction => {
  const voteDoc = await transaction.get(voteRef);
  const voteData = voteDoc.data();
  const updatedResults = { ...voteData.results };

  // Undo previous vote if changing
  if (previousChoice) updatedResults[previousChoice]--;
  // Apply new vote
  updatedResults[choice]++;

  transaction.update(voteRef, {
    results: updatedResults,
    individualVotes: { ...voteData.individualVotes, [userId]: choice },
  });
});
```

The `isAnonymous` flag controls whether `individualVotes` is written (skipped when anonymous).

---

## 9. Notification System

### 9.1 Flow

```
Event (payment, dispute, invite, DM, officer term expiry)
  │
  ├── Client creates notification doc in Firestore
  │     └── Firestore trigger: notify() → FCM multicast
  │
  ├── Cloud Function creates notification doc
  │     └── Same trigger path
  │
  └── RTDB trigger (DMs only)
        └── dmNotification() → FCM to recipient
```

### 9.2 FCM Token Management

- Users register their FCM token to `users.messagingToken[]` (array — supports multiple devices)
- On send failure, stale/invalid tokens are automatically removed from the array
- Notifications use the Notifee JSON format for rich mobile display

---

## 10. Testing Strategy

### 10.1 Test Types

| Type                     | Location                | Framework                     | Coverage                                |
| ------------------------ | ----------------------- | ----------------------------- | --------------------------------------- |
| **Unit Tests**           | `__tests__/` co-located | Jest                          | Components, services, utilities         |
| **Integration Tests**    | `*.integration.test.ts` | Jest + Firebase Emulator      | Firestore operations against real rules |
| **Security Rules Tests** | `firebase/__tests__/`   | Jest + Firebase Rules Testing | Firestore + Storage rules               |
| **E2E Tests**            | `e2e/tests/`            | Detox                         | Critical user flows on iOS simulator    |

### 10.2 Firebase Mocking Strategy

Unit tests use globally mocked Firebase modules configured in `jest.setup.js`:

```
jest.setup.js
  └── Mocks @react-native-firebase/firestore
        - collection(), doc(), get(), set(), onSnapshot() stubs
  └── Mocks @react-native-firebase/auth
  └── Mocks @react-native-firebase/functions
  └── Mocks @react-native-firebase/messaging
```

The `firebase-setup` import is aliased:

- **Unit tests:** `__mocks__/firebase-setup.js` (stubs)
- **Integration tests:** `src/integration/firebase-admin-setup.ts` (real Firebase Admin SDK connected to emulator)

### 10.3 Emulator Configuration

```
Port 8080  — Firestore emulator
Port 9099  — Auth emulator
Port 9199  — Storage emulator
Port 4000  — Emulator hub UI
```

Important: Always use `127.0.0.1`, not `localhost` (IPv6 issues on macOS).

### 10.4 Key Test Patterns

- **Optimistic update tests:** Verify onMutate/onError/onSettled lifecycle
- **Transaction retry tests:** Verify exponential backoff on `'aborted'` errors
- **Security rules tests:** Test admin read, guest self-read, unauthorized denials, no-client-writes
- **Offline queue tests:** Verify enqueue on network error, flush on reconnect, max retry behavior

---

## Appendix: Key File Reference

| File                                  | Purpose                              |
| ------------------------------------- | ------------------------------------ |
| `App.tsx`                             | Root component, provider tree        |
| `firebase-setup.ts`                   | Firebase SDK initialization, exports |
| `src/config/firebase-emulator.ts`     | Emulator connection config           |
| `src/navigation/types.ts`             | Route names, param lists             |
| `src/navigation/navigators.tsx`       | Navigator components                 |
| `src/context/DataContext.tsx`         | Redux → Context bridge               |
| `src/components/auth/auth.tsx`        | Auth state + claims parsing          |
| `src/services/offlineQueue.ts`        | Offline write queue                  |
| `src/services/EnhancedAuthService.ts` | Auth with rate limiting              |
| `src/util/logging.ts`                 | `logException()` (Sentry wrapper)    |
| `firebase/firestore.rules`            | Firestore security rules             |
| `firebase/storage.rules`              | Storage security rules               |
| `firebase/firestore.indexes.json`     | Composite index definitions          |
| `jest.setup.js`                       | Global test mocks                    |

---
*Last reviewed: 2026-05-24 | Audience: developer | Type: reference*
