> ⚠️ **Legacy document.** Carried over from the standalone `regroup-functions` repository, archived on 2026-06-06. Historical reference only — may be outdated and is NOT part of current `regroup` documentation.

# Firebase Cloud Functions v2 Migration Design

**Date:** 2026-02-23
**Status:** Approved
**Scope:** Migrate all 52 functions from firebase-functions v1 (v4.4.1) to v2 (v6.x), refactor for clarity and organization

---

## Goals

1. Migrate all functions to Firebase Cloud Functions v2 SDK
2. Reorganize by trigger type for clarity
3. Replace `functions.config()` with `defineSecret()` (Google Cloud Secret Manager)
4. Enable TypeScript strict mode
5. Retain 100% functional compatibility with `rats-v2` and `rats-web` clients
6. No changes required in client codebases

---

## New Directory Structure

```
src/
├── callable/              # 29 onCall functions
│   ├── auth.ts            # addGuestAuthorization, addAdminAuthorization, promoteGuestsToAdmin,
│   │                      #   removePrivilegesForGuests, addDeleteGuestAuthorization, verifyUserEmail,
│   │                      #   givePotentialSuperAdminPrivilege
│   ├── houses.ts          # addNewHouseAdmin, searchForHouses, addGuestAuthorization (house-level)
│   ├── meetings.ts        # findMeetings, userIsAtMeeting, narcoticsAnonymousMeetings,
│   │                      #   getCurrentAddress
│   ├── payments.ts        # createPaymentIntent, listPayments, savePaymentMethod,
│   │                      #   getPaymentMethod, updatePaymentInfo, adHocTransfer
│   └── subscriptions.ts   # createOperatorSubscription, reactivateOperatorSubscription,
│                          #   cancelUserSubscription, updateSubscriptionGuests,
│                          #   updateSubscriptionHouses, connectStripeAccount,
│                          #   disconnectStripeAccount, getStripeAccountStatus,
│                          #   sendInviteEmails, sendConfirmationEmail
├── http/                  # 6 onRequest functions
│   ├── stripeConnect.ts   # onboardStripeConnectUser, stripeConnectReauth, stripeConnectReturn
│   └── universal.ts       # universal
├── triggers/
│   ├── firestore/         # 6 Firestore document triggers
│   │   └── index.ts       # notify, notifyNewHouseCreated, sendContactEmail,
│   │                      #   sendSubscriptionUpdateEmail, reportBug, submitFeedback
│   └── rtdb/              # 1 Realtime Database trigger
│       └── index.ts       # dmNotification
├── scheduled/             # 7 onSchedule functions
│   └── index.ts           # updateDisputes, scheduledWeeklyTransferEST/CST/MST/PST/Fallback,
│                          #   warmWebsite
├── webhooks/
│   └── stripeWebhook.ts   # handleStripeConnectWebhook, stripeEvents (migrated separately)
├── config.ts              # All defineSecret() declarations
├── util/                  # Unchanged shared utilities (email, notifications, location, etc.)
├── entities/              # Unchanged data models
└── index.ts               # Re-exports all functions
```

---

## SDK Changes

### Imports
```typescript
// Before (v1)
import * as functions from 'firebase-functions';

// After (v2)
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentCreated, onDocumentUpdated, onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { onValueCreated } from 'firebase-functions/v2/database';
import { logger } from 'firebase-functions';
```

### Callable functions
```typescript
// Before (v1)
export const myFn = functions.https.onCall(async (data: InputType, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  const uid = context.auth.uid;
  return result;
});

// After (v2)
export const myFn = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in');
  const uid = request.auth.uid;
  const data = request.data as InputType;
  return result;
});
```

### Secrets
```typescript
// Before (v1)
const apiKey = functions.config().sendgrid.api_key;

// After (v2) — src/config.ts
import { defineSecret } from 'firebase-functions/params';
export const SENDGRID_API_KEY = defineSecret('SENDGRID_API_KEY');
export const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
export const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');

// In function definition:
export const myFn = onRequest({ secrets: [SENDGRID_API_KEY] }, async (req, res) => {
  const key = process.env.SENDGRID_API_KEY;
});
```

### Firestore triggers
```typescript
// Before (v1)
export const handler = functions.firestore.document('/col/{id}').onCreate(async (snap, context) => {
  const id = context.params.id;
  const data = snap.data();
});

// After (v2)
export const handler = onDocumentCreated('/col/{id}', async (event) => {
  const id = event.params.id;
  const data = event.data?.data();
});
```

### RTDB triggers
```typescript
// Before (v1)
export const handler = functions.database.ref('/path/{id}').onCreate(async (snap) => {
  const val = snap.val();
});

// After (v2)
export const handler = onValueCreated('/path/{id}', async (event) => {
  const val = event.data.val();
});
```

### Scheduled functions
```typescript
// Before (v1)
export const handler = functions.pubsub.schedule('0 0 * * 0').timeZone('America/New_York').onRun(async () => {});

// After (v2)
export const handler = onSchedule({ schedule: '0 0 * * 0', timeZone: 'America/New_York' }, async () => {});
```

---

## TypeScript

Enable strict mode in `tsconfig.json`:
```json
{
  "strict": true,
  "strictNullChecks": true
}
```

All type errors surfaced by strict mode must be resolved as part of the migration.

---

## Secrets Setup

Secrets to migrate from `functions.config()` to Secret Manager:
- `SENDGRID_API_KEY` (currently `functions.config().sendgrid.api_key`)
- `STRIPE_SECRET_KEY` (currently `functions.config().stripe.secret_key`)
- `STRIPE_WEBHOOK_SECRET` (currently `functions.config().stripe.webhook_secret`)
- Any additional config keys found during migration

Set secrets via CLI before deployment:
```bash
firebase functions:secrets:set SENDGRID_API_KEY
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
```

---

## Parallel Agent Execution Plan

### Phase 1 — Architecture Setup (sequential, unblocks all others)
- Bump `firebase-functions` to v6.x
- Enable TypeScript strict mode
- Create new directory structure (empty files)
- Create `src/config.ts` with all `defineSecret()` declarations
- Migrate `util/` — replace `functions.config()` calls

### Phase 2 — Parallel migration (4 agents simultaneously)
- **Agent A**: `src/callable/` — 29 callable functions in 5 domain files
- **Agent B**: `src/http/` + `src/scheduled/` — 13 non-trigger functions
- **Agent C**: `src/triggers/` — 7 trigger functions (6 Firestore + 1 RTDB)
- **Agent D**: `src/webhooks/stripeWebhook.ts` — complex webhook, isolated

### Phase 3 — Integration (sequential, after Phase 2)
- Update `src/index.ts` to re-export from new locations
- Run `tsc --noEmit` and fix all type errors
- Run existing Jest tests

---

## Client Compatibility

Function names are unchanged. All `httpsCallable('functionName')` calls in clients continue to work. v2 callable functions are fully compatible with:
- `AngularFireFunctions` (rats-web)
- `@react-native-firebase/functions` (rats-v2)
- Firebase Web SDK
- All Firebase client SDKs

**No changes required in `rats-v2` or `rats-web`.**

---

## Dependencies

```json
{
  "firebase-functions": "^6.0.0",
  "firebase-admin": "^12.0.0"
}
```

Node engine remains `node: 20`.
