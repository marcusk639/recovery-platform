# Cloud Function Audit: RATS v2 Usage Analysis

**Date:** February 2026
**Analyzed against:** RATS v2 mobile app (`/Users/marcusklein/dev/rats-v2`)
**Scope:** All exported functions in `functions/src/index.ts` and `functions/src/api/`

---

## Summary

The repo contains **46 exported Cloud Functions** across callable, trigger-based, scheduled, and webhook categories. After cross-referencing every function against the RATS v2 mobile app's service layer, state management, and screens:

- **44 functions should be kept** — either directly called by the app, automatically triggered by app data operations, or run on critical schedules.
- **1 function should be removed** — `onboardStripeConnectUser` (explicitly legacy, fully superseded).
- **1 function is borderline** — `adHocTransfer` (dev/ops utility only, never called from the app UI).

Additionally, **1 critical bug** was found in `index.ts`: the export block on lines 72–79 imports from `./api/stripeConnect`, a file that does not exist.

---

---

## Function-by-Function Verdict

### Resident Payment Functions (`src/api/payments.ts`)

| Function | Verdict | Justification |
|---|---|---|
| `createPaymentIntent` | **KEEP** | Called by app when a resident pays rent. Core payment flow. |
| `listPayments` | **KEEP** | Called by app to show payment history. Core payment flow. |
| `savePaymentMethod` | **KEEP** | Called by app to save a card for future payments. Core payment flow. |

### Stripe Connect Functions (`src/api/connectStripeAccount.ts`, etc.)

| Function | Verdict | Justification |
|---|---|---|
| `connectStripeAccount` | **KEEP** | Called by app when a house operator sets up Stripe to receive rent. Core monetization flow. Properly uses Express accounts, Firestore transactions, admin verification from Firestore (not client claims), and URL scheme validation. |
| `disconnectStripeAccount` | **KEEP** | Called by app to remove a Stripe connection. Idempotent — handles already-disconnected accounts gracefully. |
| `getStripeAccountStatus` | **KEEP** | Called by app to display Stripe status to the operator. Syncs live Stripe data back to Firestore. Also performs a membership check so residents can see payment status. |
| `handleStripeConnectWebhook` | **MISSING** | Referenced in `index.ts` but does not exist. Needs to be implemented or removed from the export block. |
| `stripeConnectReturn` | **MISSING** | Referenced in `index.ts` but does not exist. Needs to be implemented or removed. |
| `stripeConnectReauth` | **MISSING** | Referenced in `index.ts` but does not exist. Needs to be implemented or removed. |

### Location & Meeting Functions (`src/index.ts`)

| Function | Verdict | Justification |
|---|---|---|
| `searchForHouses` | **KEEP** | Called by app on the house discovery screen. Required for onboarding. |
| `findMeetings` | **KEEP** | Called by app to find AA/NA/CR/Custom meetings. Core resident feature for logging meeting attendance. Runs in Cloud Function to hide API keys and aggregate multiple external sources. |
| `userIsAtMeeting` | **KEEP** | Called by app to GPS-verify a resident is physically at a meeting before logging attendance. Server-side verification is intentional — prevents residents from logging fake meeting attendance. |
| `narcoticsAnonymousMeetings` | **KEEP** | Called by app as a focused NA meeting lookup. Calls Google Maps reverse geocode + NA meeting database. Same API-key-hiding rationale as `findMeetings`. |
| `getCurrentAddress` | **KEEP** | Called by app when displaying the current location to the user. Wraps Google Maps reverse geocode to hide the API key. |

### Authorization & Claims Functions (`src/index.ts`)

| Function | Verdict | Justification |
|---|---|---|
| `addGuestAuthorization` | **KEEP** | Called by app when a new resident joins a house. Sets Firebase Auth custom claims. Must be a Cloud Function — clients cannot set their own claims. |
| `addDeleteGuestAuthorization` | **KEEP** | Firestore trigger: fires when a guest document is deleted. Cleans up Firebase Auth claims automatically. Required to prevent stale access tokens. |
| `addAdminAuthorization` | **KEEP** | Called by app when adding an admin. Sets admin + superAdmin claims. Same rationale as `addGuestAuthorization`. |
| `deleteAdminAuthorization` | **KEEP** | Called by app when removing an admin. Revokes Firebase Auth claims. |
| `givePotentialSuperAdminPrivilege` | **KEEP** | Called by app during operator onboarding to mark the user as a potential superAdmin. Needed before they can create a house. |
| `promoteGuestsToAdmin` | **KEEP** | Called by app when promoting a resident to house manager. Batch claim update. |
| `removePrivilegesForGuests` | **KEEP** | Called by app when demoting a user or removing their role. Batch claim cleanup. |
| `addNewHouseAdmin` | **KEEP** | Called by app to add an admin to the house document in Firestore. |

### Notification Functions (`src/index.ts`)

| Function | Verdict | Justification |
|---|---|---|
| `dmNotification` | **KEEP** | Realtime Database trigger: fires when a direct message is written to `/direct-messages/{conversationId}/{messageId}`. Sends a push notification to the recipient. The app writes DMs to the Realtime Database, so this trigger is active in production. |
| `notify` | **KEEP** | Firestore trigger: fires when a notification document is created in `/notifications`. The app and other functions write notification documents; this delivers the actual push notification. |

### Invitation Function (`src/index.ts`)

| Function | Verdict | Justification |
|---|---|---|
| `sendInviteEmails` | **KEEP** | Called by app to send invitation emails to new admins and residents. Handles both admin and guest invite types, sends HTML email via SendGrid, notifies existing admins, and constructs safe deep links for the app. |

### Operator Subscription Functions (`src/index.ts`)

| Function | Verdict | Justification |
|---|---|---|
| `createOperatorSubscription` | **KEEP** | Called by app when an operator subscribes. Creates Stripe Customer + Subscription with a 30-day trial. Core monetization. |
| `reactivateOperatorSubscription` | **KEEP** | Called by app when an operator reactivates after cancelling. Handles both "cancelling" (not yet expired) and fully cancelled states. |
| `updateSubscriptionGuests` | **KEEP** | Called by app when a guest is added or removed. Adjusts the guest count line item in Stripe. Required for per-seat billing. |
| `updateSubscriptionHouses` | **KEEP** | Called by app when a house is added or removed. Adjusts both house and guest seat counts in Stripe. Required for per-house billing. |
| `getPaymentMethod` | **KEEP** | Called by app in the subscription management screen to display the operator's saved payment method. |
| `updatePaymentInfo` | **KEEP** | Called by app when the operator updates their payment card. |
| `cancelUserSubscription` | **KEEP** | Called by app when the operator cancels. Sets `cancel_at_period_end` in Stripe so access continues until the billing period ends. |

### Webhook Function (`src/index.ts`)

| Function | Verdict | Justification |
|---|---|---|
| `stripeEvents` | **KEEP** | HTTP endpoint that Stripe calls for subscription lifecycle events: payment succeeded, payment failed, payment action required, subscription deleted. Required to keep Firestore subscription status in sync when events happen outside the app (e.g., payment failure, chargebacks). Validates the Stripe signature before processing. |

### Admin Notification Triggers (`src/index.ts`)

| Function | Verdict | Justification |
|---|---|---|
| `sendContactEmail` | **KEEP** | Firestore trigger on `/contact` collection. App writes a document when user submits the contact form; this delivers the email to the admin. |
| `reportBug` | **KEEP** | Firestore trigger on `/bugs` collection. App writes a document when user files a bug report; this delivers it to the admin. |
| `submitFeedback` | **KEEP** | Firestore trigger on `/feedback` collection. Same pattern as `reportBug`. |
| `notifyNewHouseCreated` | **KEEP** | Firestore trigger on `/houses` collection. Notifies the admin email when a new sober living house is registered. Useful for business awareness and fraud detection. |
| `sendSubscriptionUpdateEmail` | **KEEP** | Firestore trigger on `/users` collection. Fires only when `subscriptionMetadata.status` changes. Provides the admin with real-time subscription change awareness without requiring polling. |

### Scheduled Functions (`src/index.ts`)

| Function | Verdict | Justification |
|---|---|---|
| `updateDisputes` | **KEEP** | Runs daily at 2 AM UTC. Automatically resolves disputes that are more than 2 days old. Core business rule: disputes that go unchallenged are considered valid. Cannot be done client-side — requires trusted server execution. |
| `scheduledWeeklyTransferEST` | **KEEP** | Runs every Sunday at midnight Eastern. Processes weekly stat transfers for EST houses. See note below. |
| `scheduledWeeklyTransferCST` | **KEEP** | Runs every Sunday at midnight Central. Processes CST houses. |
| `scheduledWeeklyTransferMST` | **KEEP** | Runs every Sunday at midnight Mountain. Processes MST houses. |
| `scheduledWeeklyTransferPST` | **KEEP** | Runs every Sunday at midnight Pacific. Processes PST houses. |
| `scheduledWeeklyTransferFallback` | **KEEP** | Runs every Sunday at midnight UTC. Catches houses with no timezone configured. |

**Note on weekly transfer functions:** These are critical operational functions that transfer guest stats from the current week to the previous week and initialize the new week's tracking structure. They run in 5 timezone variants to ensure houses experience the reset at local midnight, not UTC midnight. These have retry logic and idempotency protections.

### Dev/Ops Utility (`src/index.ts`)

| Function | Verdict | Justification |
|---|---|---|
| `adHocTransfer` | **BORDERLINE — KEEP for now** | Callable function that manually triggers the weekly transfer for a specific house by `houseId`. Never called from the app UI. Used for: (a) recovering from a failed scheduled transfer, (b) testing the transfer logic without waiting for Sunday midnight, (c) customer support when a house's stats get stuck. Low risk to keep since it requires a valid authenticated call. Could be moved to a separate admin-only deploy if desired. |

### Legacy Functions (`src/index.ts`)

| Function | Verdict | Justification |
|---|---|---|
| `onboardStripeConnectUser` | **REMOVED** | This was the original web-based Stripe Connect onboarding endpoint, written before the mobile app existed. It creates a Stripe **standard** account (not an Express account), redirects via HTTP 303 to Stripe using the request's `origin` header, and expects a `success.html` return URL — none of which apply to the React Native app. The replacement `connectStripeAccount` (in `connectStripeAccount.ts`) creates an Express account, uses callable function semantics, validates URLs against open-redirect attacks, uses Firestore transactions to prevent race conditions, and performs proper admin authorization checks. There is no path in the mobile app that calls `onboardStripeConnectUser`. |

---

---

## Data Model Note: Activity System Migration

The `CLOUD_FUNCTIONS_REVIEW.md` in `rats-v2/docs/` identifies that several functions still operate on the legacy Week/Day data model (`guest.currentWeek`, `guest.previousWeek`), which is being phased out in favor of the activity-based system. The affected functions are:

- `scheduledWeeklyTransfer*` (all 5 variants) — call `transferStats()` in `util/guest.ts`
- `adHocTransfer` — also calls `transferStats()`
- `updateDisputes` — calls `runDisputeTransaction()` which touches Week/Day structures

These functions will need to be updated as part of the activity system migration outlined in `rats-v2/docs/CLOUD_FUNCTIONS_REVIEW.md`. They should be kept now and updated in-place; do not remove them.

---

## Entities and Utilities

The entity files (`src/entities/`) and utility files (`src/util/`) are all supporting code for the functions above. None appear to be orphaned. The `Week.ts` and `Day.ts` entities are still referenced by the weekly transfer and dispute functions and should be kept (but marked as deprecated once the activity migration is complete, per the migration plan).

The `src/scripts/migrateGuestWeeks.ts` is a one-time migration script, not a Cloud Function. It is safe to keep for historical reference or remove once the migration is confirmed complete.
