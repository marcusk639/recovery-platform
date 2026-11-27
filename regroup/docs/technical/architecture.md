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
| - React Query       |        | - Cloud Messaging    |        | - recovery-api   |
| - Formik + Yup      |        | - Cloud Storage      |        | - Sentry         |
+---------------------+        +----------------------+        +------------------+
```

### Repository Structure

| Component             | Path                 | Purpose                                     | Key Tech                                                                   |
| --------------------- | -------------------- | ------------------------------------------- | -------------------------------------------------------------------------- |
| **Regroup mobile**    | `regroup/mobile/`    | Mobile client + Firestore rules + E2E tests | React Native 0.88.1, TypeScript, Redux Toolkit, React Query, RNFirebase 26 |
| **Regroup functions** | `regroup/functions/` | Cloud Functions backend                     | TypeScript, Firebase Admin SDK, Stripe SDK                                 |
| **Regroup web**       | `regroup/web/`       | Marketing/landing page + web portal         | Angular, TypeScript, Firebase Hosting                                      |

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
  │   └── Personal             # Profile, settings, account deletion
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

10 slices in `src/state/slices/` (there is no `cacheSlice`, `uiSlice` or `navigationSlice`):

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
| `notificationsSlice` | Notification state      | notification list, unread count   |
| `themeSlice`         | Theme preference        | light/dark mode                   |

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
  list: (filters) => [...activityKeys.lists(), filters],
  details: () => [...activityKeys.all, 'detail'],
  detail: (id) => [...activityKeys.details(), id],
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

Cloud Functions live in `regroup/functions/` in this monorepo (the old standalone `regroup-functions` repository is archived in `regroup/_legacy/regroup-functions/`). `src/index.ts` re-exports 63 deployed functions: callables, Firestore triggers, scheduled jobs, HTTP handlers and two Stripe webhooks. `regroup/FUNCTION_AUDIT.md` is the generated inventory (source file, path or schedule, bound secrets), and `regroup/scripts/deploy-batched.sh` `ALL_FUNCTIONS` lists the same names (a test keeps it equal to the exports). The web app's SSR function is a separate codebase; see §3.7.

### 3.1 Callable Functions (httpsCallable)

These are invoked from the mobile client (and the web operator portal) via `httpsCallable('functionName')(payload)`. Every callable rejects an unauthenticated caller except `getTierCatalog` (public pricing), `getAppConfig` (the minimum app version, read before sign-in) and `peekInvitation` (the invitation token is the credential). Contracts for the billing and payment callables are in `regroup/functions/CLAUDE.md` ("Callable contracts").

#### Auth Functions (`src/callable/auth.ts`)

| Function                           | Purpose                                                                                                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `addGuestAuthorization`            | Grants the guest claim for a house; with `isAdmin`, also admin (peer leader). Writes the `house-roles` record                                               |
| `addAdminAuthorization`            | Grants admin (manager), or admin + superAdmin (co-owner; primary owner only)                                                                                |
| `deleteAdminAuthorization`         | Removes admin/superAdmin claims and re-derives the record                                                                                                   |
| `promoteGuestsToAdmin`             | Batch-promotes residents to peer leader (admin claim)                                                                                                       |
| `removePrivilegesForGuests`        | Batch-removes a role from residents                                                                                                                         |
| `verifyUserEmail`                  | Sets `emailVerified: true` directly on the caller's own Auth account (`util/user.ts` `_verifyUserEmail`); sends no email and checks nothing else            |
| `givePotentialSuperAdminPrivilege` | Merges `potentialSuperAdmin: true` into the caller's claims; refused when the caller already holds any `admin` or `superAdmin` claim (token or live claims) |

#### House, Invitation and Account Functions

| Function              | File                              | Purpose                                                                                                                            |
| --------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `createHouses`        | `callable/houses.ts`              | Creates the operator's houses in one transaction (house type from the plan, primary owner record, property cap, tombstone check)   |
| `finishOperatorSetup` | `callable/finishOperatorSetup.ts` | Recovers a half-finished operator setup: re-grants missing house claims for houses with the caller's primary owner record (max 25) |
| `myHouseTiers`        | `callable/myHouseTiers.ts`        | The caller's own tier per house, for the operator portal's display                                                                 |
| `getAppConfig`        | `callable/getAppConfig.ts`        | **Unauthenticated.** `{ minVersion: { ios, android } }` from server-only `config/app` (cached 60 s); the app's minimum-version gate |
| `createInvitation`    | `callable/invitations.ts`         | Issues a server-side invitation token (7-day expiry) and emails the link (SendGrid)                                                |
| `peekInvitation`      | `callable/invitations.ts`         | **Unauthenticated.** Returns `houseId`, `role`, `invitedEmail`, `initialPhase` and `expiresAt` for a usable token                  |
| `redeemInvitation`    | `callable/invitations.ts`         | Grants the invited role's claims and tier record once the gates pass                                                               |
| `deleteAccount`       | `callable/account.ts`             | In-app account deletion (recent sign-in required; resumable orchestrator in `accountDeletion/`)                                    |

#### Meeting Functions (`src/callable/meetings.ts`)

| Function          | Purpose                                                    | Source                                                                                                                                                                  |
| ----------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `findMeetings`    | Search 12-step meetings by location & type (auth required) | Shared directory types: recovery-api `fetchDirectoryMeetings` (`api/recoveryApi.ts`, 10 km radius). `Custom`: regroup Firestore. `AL-ANON` and `Religious`: always `[]` |
| `userIsAtMeeting` | Verify the user is within 200 m of a meeting               | Google Maps geocoding                                                                                                                                                   |

#### Payment Functions (`src/callable/payments.ts`)

| Function                  | Purpose                                                                    | Stripe API                                                                                  |
| ------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `createPaymentIntent`     | Create destination charge for rent                                         | PaymentIntents; method-aware fee from `computeApplicationFee` (`util/rentFee.ts`), USD only |
| `listPayments`            | Payment history for one resident (the resident or a house admin)           | `charges.list` on the house's connected account; amounts returned in dollars                |
| `listHousePayments`       | All of a house's payments (house admins only)                              | `charges.list` on the house's connected account; amounts returned in dollars                |
| `getPaymentMethod`        | The caller's Stripe customer's default payment method                      | Customers, PaymentMethods                                                                   |
| `updatePaymentInfo`       | Attach a payment method and make it the default                            | PaymentMethods, Customers                                                                   |
| `connectStripeAccount`    | Create house account (v1 by default, v2 behind a switch) + onboarding link | Accounts v1/v2, AccountLinks                                                                |
| `disconnectStripeAccount` | Unlink (v1) or close (v2) the house account (idempotent)                   | Accounts v1/v2                                                                              |
| `getStripeAccountStatus`  | Fetch + sync account status with the house's own API                       | Accounts v1/v2                                                                              |

#### Subscription and Billing Functions (`src/callable/subscriptions.ts` unless noted)

| Function                         | Purpose                                                                                                                                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createOperatorSubscription`     | Single-item tier subscription with a trial (`TRIAL_PERIOD_DAYS`); monthly or annual. Refused while `TIER_BILLING_ENABLED` is off or the sales switch is closed                                                    |
| `reactivateOperatorSubscription` | `active`/`trialing`: returned as is. `cancelling`: un-cancelled in Stripe. `canceled`: a **new** tier subscription (tier billing on, a stored tier, sales open). `past_due`/`unpaid`/other: `failed-precondition` |
| `cancelUserSubscription`         | Mark for cancellation at period end                                                                                                                                                                               |
| `updateSubscriptionGuests`       | No Stripe call: records resident occupancy in `subscriptionMetadata.houses` against the tier's `maxResidents`                                                                                                     |
| `updateSubscriptionHouses`       | No Stripe call: adds or removes houses in `subscriptionMetadata.houses` against the tier's `maxProperties`                                                                                                        |
| `applyBundleDiscount`            | Legacy per-house bundle coupon; a no-op for every tier subscription                                                                                                                                               |
| `createBillingPortalSession`     | Stripe billing portal URL for the caller's customer                                                                                                                                                               |
| `sendConfirmationEmail`          | Send onboarding confirmation email                                                                                                                                                                                |
| `getTierCatalog`                 | `callable/getTierCatalog.ts`. **Unauthenticated** public price list (prices from Stripe, cached 1 h; `salesOpen`, `trialDays`)                                                                                    |
| `setOxfordEnabled`               | `callable/oxford.ts`. Refuses any traditional↔Oxford switch: the plan chosen at checkout sets the house type, and no tier is in both catalogs                                                                     |
| `castOxfordVote`                 | `callable/oxford.ts`. The only writer of `votes/{voteId}` (see §8.2)                                                                                                                                              |
| `complianceExport`               | `callable/compliance.ts`. Tier-gated court/drug-court export, `format: csv` (default) or `pdf` (`pdfBase64`)                                                                                                      |
| `rentRoiMetrics`                 | `callable/analytics.ts`. Tier-gated rent-collection ROI metrics                                                                                                                                                   |

### 3.2 Firestore Triggers

These execute automatically when documents are created, updated, or deleted:

| Trigger                              | Document Path                       | Event    | Side Effect                                                                                                                         |
| ------------------------------------ | ----------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `notify`                             | `/notifications/{id}`               | onCreate | Sends FCM push notification                                                                                                         |
| `notifyNewHouseCreated`              | `/houses/{id}`                      | onCreate | Emails admin                                                                                                                        |
| `setHouseSubscriptionStatusOnCreate` | `/houses/{id}`                      | onCreate | Stamps `house.subscriptionStatus` from the operator's subscription status (`canceled` when it is unrecognised)                      |
| `notifyOperatorOnApplication`        | `/houses/{id}/applications/{appId}` | onCreate | Notifies house staff of a new application (`triggers/firestore/applicationNotice.ts`)                                               |
| `onHouseRentSettingsWrite`           | `/houses/{id}`                      | onWrite  | Stamps or clears `rentHouseStates/{id}` (the day rent charging turned on) when rent fields, timezone or house type change           |
| `onHouseDeleted`                     | `/houses/{id}`                      | onDelete | Writes `houseTombstones/{id}` (createHouses refuses the id) and frees the owner's subscription house slot                           |
| `onGuestWrite`                       | `/guests/{id}`                      | onWrite  | Departures and moves revoke the old house's claims; creates settle the admission ticket; every write re-splits the house's EES week |
| `onGuestLinkedRestamp`               | `/guests/{id}`                      | onWrite  | Fills empty `residentUid` stamps on the guest's activities when its `userId` is linked or changed                                   |
| `onActivityWritten`                  | `/activities/{id}`                  | onWrite  | Recomputes week-summaries; stamps `residentUid`; dispute notifications, live dispute list, decision log and archive                 |
| `sendContactEmail`                   | `/contact/{id}`                     | onCreate | Emails support team                                                                                                                 |
| `sendSubscriptionUpdateEmail`        | `/users/{id}`                       | onUpdate | Emails on subscription status change                                                                                                |
| `onUserAdminProfileSync`             | `/users/{id}`                       | onUpdate | Copies the user's current name and phone onto every `admins` record with that `userId` when they change                             |
| `reportBug`                          | `/bugs/{id}`                        | onCreate | Emails dev team                                                                                                                     |
| `submitFeedback`                     | `/feedback/{id}`                    | onCreate | Emails product team                                                                                                                 |

There is no RTDB trigger: `dmNotification` (and the older `addDeleteGuestAuthorization` and `eesRecalculationOnGuestWrite`) are no longer exported; `onGuestWrite` covers the last two.

### 3.3 Scheduled Functions

| Function                  | Schedule          | Timezone | Purpose                                                                                                                   |
| ------------------------- | ----------------- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| `updateDisputes`          | `0 2 * * *`       | UTC      | Old dispute model: resolves `house.disputes` entries via `runDisputeTransaction` (`util/disputes.ts`)                     |
| `weeklyTransfers`         | `0 8 * * 0`       | UTC      | Weekly week-stat rollover, one pass per supported timezone plus a fallback pass; no Stripe calls                          |
| `warmWebsite`             | `every 5 minutes` | —        | Logs a line and makes no outbound call, so it warms nothing but itself: a no-op and a deletion candidate                  |
| `officerTermReminder`     | `0 8 * * *`       | UTC      | Notifies officers with terms expiring within 30 days                                                                      |
| `overdueRentNotification` | `0 9 * * *`       | UTC      | Notifies each house's admins of residents with rent overdue                                                               |
| `scheduledRentCollection` | `0 10 * * *`      | UTC      | Auto-pay: a Stripe PaymentIntent for each resident with `autoPayEnabled` and `rentOwed > 0`                               |
| `rentCharges`             | `5 * * * *`       | UTC      | Hourly rent charging (540 s timeout): charges each resident whose next chargeable day has come, on the house's local date |

The five per-timezone `scheduledWeeklyTransfer*` jobs were consolidated into `weeklyTransfers`.

### 3.4 HTTP Handlers & Webhooks

**HTTP Handlers:**

- `universal` — Health check endpoint (`/health`, `/healthz` → 200; anything else 404). Not the SSR function.
- `stripeConnectReauth` — Handles expired Stripe AccountLinks; generates fresh onboarding link
- `stripeConnectReturn` — Stripe redirect post-onboarding; a read-only status page that shows `house.stripeStatus` and writes nothing. The status itself is synced by the `account.updated` webhook.

**Stripe webhooks** (`src/webhooks/stripeWebhook.ts`, both signature-verified with live and test secrets):

- **`stripeEvents`** (exported from the module as `stripeWebhook`, deployed as `stripeEvents`), the platform endpoint: `payment_intent.succeeded` / `payment_intent.payment_failed` (record the payment in cents, decrement `rentOwed`, notify), `charge.refunded`, `charge.refund.updated`, `charge.dispute.created`, `charge.dispute.closed`, `invoice.payment_succeeded`, `invoice.payment_failed`, `invoice.payment_action_required`, `customer.subscription.created` / `updated` / `deleted` / `trial_will_end`, `account.updated` and `payout.failed`. The endpoint event list to subscribe is in `regroup/scripts/stripe-product-values.md` §4a.
- **`handleStripeConnectWebhook`**, the Connect endpoint: `account.updated` (syncs `house.stripeStatus`) and `account.application.deauthorized`.

### 3.5 Backend Utilities

| Utility            | File            | Purpose                                                                                                                                 |
| ------------------ | --------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `claims.ts`        | Auth claims     | `createClaims()`, `deleteClaim()` — add/remove house IDs from role claims                                                               |
| `houseAuth.ts`     | Authorization   | `isHouseAdmin()`, `assertHouseAdmin()`, `checkIsMember()`, `assertHouseMemberFromClaims()`                                              |
| `stripe.ts`        | Stripe helpers  | `createStripeClient()`, `mapStripeError()`, `isAlreadyDeauthorized()`                                                                   |
| `notifications.ts` | FCM push        | `sendNotification()` — multicast to user's messagingToken[], cleans stale tokens                                                        |
| `email.ts`         | SendGrid        | `sendEmail()` — transactional emails                                                                                                    |
| `geohash.ts`       | Geo queries     | `getGeohashRange()`, `getQueriesForDocumentsAround()`                                                                                   |
| `meetings.ts`      | Meetings        | `getCustomMeetings()` (regroup's own meetings), `geocodeNAMeeting()`; directory search goes through recovery-api (`api/recoveryApi.ts`) |
| `disputes.ts`      | Dispute logic   | `disputeResult()`, `runDisputeTransaction()`                                                                                            |
| `guest.ts`         | Weekly transfer | `transferStats()` — moves current week -> previous, initializes new week                                                                |
| `date.ts`          | Date math       | Timezone-aware date calculations                                                                                                        |

### 3.6 Error Handling Patterns

```
Callable Functions:  throw HttpsError(code, message)
                     Codes: unauthenticated, permission-denied, invalid-argument,
                            not-found, failed-precondition, internal

Triggers:            logger.error() + re-throw (enables Firebase retries)

Stripe webhooks:     two-phase claim per event id (webhookEvents/{eventId}):
                       already done           -> 200 (duplicate)
                       another delivery busy  -> 409 (Stripe retries)
                       handler throws         -> claim released, 500 (Stripe retries)
                       PermanentWebhookError  -> logged, marked done, 200 (no retry)
                       secret not configured  -> 500

External APIs:       try-catch -> return null/empty (graceful degradation)

Stripe:              mapStripeError(err) -> HttpsError with appropriate code
```

### 3.7 Web App Runtime (`regroup/web/`)

The Angular app is served by Firebase Hosting from `web/firebase.json`, a separate deploy from the backend. Its server-side rendering runs in the function **`ssr`** (`web/functions/src/index.ts`, Node 22), deployed from its own functions codebase **`web`** (`"codebase": "web"`), not from `regroup/functions/`. Hosting rewrites `/connect/stripe-return` to `stripeConnectReturn` and `/connect/stripe-refresh` to `stripeConnectReauth` (both in `regroup/functions/`, us-central1), and every other path (`**`) to `ssr`. Details: `regroup/web/CLAUDE.md`.

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
│   ├── /business-meetings/{meetingId}          # Oxford House business (house) meetings
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
    ├── business-meetings (Oxford house business meetings)
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
  admin: { [houseId: string]: true }; // houses where the user is staff (owner, manager or peer leader)
  guest: { [houseId: string]: true }; // houses where the user is a resident
  superAdmin: { [houseId: string]: true }; // houses the user owns or co-owns
  potentialSuperAdmin?: boolean; // an operator who may create houses
}
```

Each role claim is a map keyed by house id (`functions/src/util/claims.ts`; older array-shaped claims are read and rewritten as maps).

**Authority comes from house tiers, not from the claim alone:** owner > manager > peer leader > resident, recorded server-side in `house-roles/{houseId}_{uid}` (the owner is the record with `primary: true`). A superAdmin claim marks the primary owner or a co-owner; managers and peer leaders hold the same `admin` claim and differ only by their record. The tier model (grants, ranks, revokes) is in `regroup/functions/CLAUDE.md` ("Invitations, admission tickets and house tiers").

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
│             │      │ (method-aware fee)│      │  (dest charge)│
│             │      │                   │      │             │
│             │      │ stripeEvents      │<─────│  Webhooks   │
│             │      │  (payment result) │      │             │
│             │      │                   │      │             │
│ Stripe      │─────>│ connectStripeAccount│────>│  Express    │
│ Settings UI │      │ getStripeAccountStatus│<──│  Accounts   │
│             │      │ disconnectStripeAccount│──>│             │
└─────────────┘      └──────────────────┘      └─────────────┘
```

### 6.2 Payment Flow

1. **House operator connects Stripe** via `connectStripeAccount` → Creates the house's connected account (Accounts v1 controller properties by default; a v2 recipient when `CONNECT_ACCOUNTS_API=v2`), Express dashboard → Onboarding link
2. **Guest initiates rent payment** → `createPaymentIntent` → Stripe destination charge; the application fee is method-aware (`computeApplicationFee` in `functions/src/util/rentFee.ts`: card = 0.75% platform margin plus the estimated 2.9% + 30¢ Stripe cost; ACH = $2 plus the estimated min(0.8%, $5) Stripe cost; rates env-overridable in `functions/src/config.ts` `RENT_FEE`)
3. **Stripe processes payment** → Webhook (`stripeEvents`) → `payment_intent.succeeded` or `payment_intent.payment_failed`
4. **Cloud Function records result** → Updates `payments` collection (`amount` in integer cents) → Decrements `guest.rentOwed` → Sends notifications

### 6.3 Operator Subscription (SaaS Billing)

House operators pay a flat fee for one of six tiers (`SUBSCRIPTION_TIERS` in `functions/src/config.ts`), monthly or annual, when `TIER_BILLING_ENABLED=true`:

```
Subscription
  └── One tier item (quantity 1): price from STRIPE_PRICE_<TIER> or STRIPE_PRICE_<TIER>_ANNUAL

Traditional: Starter $69 (10 residents, 1 house), Professional $129 (20, 3), Enterprise $249 (no caps)
Oxford:      Standard $49 (15, 1), Plus $89 (25, 1), Network $299 (no caps; not for sale)
```

- Trial on creation (`TRIAL_PERIOD_DAYS`, `functions/src/api/stripe.ts`)
- With the flag off, or the sales switch (`config/sales.open`) closed, `createOperatorSubscription` refuses; there is no fallback to the old per-house + per-guest items. That legacy two-item code is still in `api/stripe.ts` but unreachable from checkout and reactivation
- Caps, not quantities: `updateSubscriptionGuests` / `updateSubscriptionHouses` make no Stripe call; they record occupancy in `subscriptionMetadata.houses` against the tier's `maxResidents` / `maxProperties`
- The plan sets the house type (traditional or Oxford); `setOxfordEnabled` refuses a switch
- Cancellation at period end (not immediate); reactivation un-cancels a `cancelling` subscription or creates a new one for a `canceled` one (see §3.1)
- Subscription state is synced to `users.subscriptionMetadata`, the `subscriptions` doc and the houses by the subscription webhooks, which re-read the subscription from Stripe
- Checkout and plan management happen only on the web. The mobile app links out to `/pricing` or `/my-account` with `?from=app` in the system browser (`mobile/src/services/webBilling.ts`); it has no billing WebView and collects no card details (launch design A6)

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
    (snapshot) => {
      const messages = snapshot.docs.map(mapMessageDoc);
      callback(messages);
    },
    (error) => logException(error),
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
await firestore.runTransaction(async (transaction) => {
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
  └── Cloud Function creates notification doc, or pushes directly
        └── through functions/src/util/notifications.ts (FCM)

(There is no RTDB DM trigger: dmNotification is no longer exported.)
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

_Last reviewed: 2026-05-24 | Audience: developer | Type: reference_
