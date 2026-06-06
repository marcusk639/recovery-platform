> ⚠️ **Legacy document.** Carried over from the standalone `regroup-functions` repository, archived on 2026-06-06. Historical reference only — may be outdated and is NOT part of current `regroup` documentation.

# Firebase Cloud Functions v2 Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate all 52 Cloud Functions from firebase-functions v1 (v4.4.1) to v2 (v6.x), reorganize by trigger type, replace `functions.config()` with Secret Manager, and enable TypeScript strict mode — with zero client-facing breaking changes.

**Architecture:** Phase 1 (sequential) sets up the new directory structure, bumps deps, and migrates shared utilities. Phase 2 dispatches parallel agents for each function group. Phase 3 integrates all exports, compiles, and verifies tests pass.

**Tech Stack:** TypeScript, firebase-functions v6.x, firebase-admin v12.x, `firebase-functions/params` for secrets, Node 20

**Design Doc:** `docs/plans/2026-02-23-v2-migration-design.md`

---

## PHASE 1 — Architecture Setup (sequential, must complete before Phase 2)

---

### Task 1: Update package.json dependencies

**Files:**
- Modify: `functions/package.json`

**Step 1: Update firebase-functions and firebase-admin**

Replace the current versions in `package.json`:

```json
"firebase-admin": "^12.0.0",
"firebase-functions": "^6.0.0",
```

**Step 2: Install updated dependencies**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions
npm install
```

Expected: No peer dependency errors. `firebase-functions` v6.x and `firebase-admin` v12.x installed.

**Step 3: Verify install**

```bash
cat node_modules/firebase-functions/package.json | grep '"version"'
```

Expected: `"version": "6.x.x"`

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: bump firebase-functions to v6 and firebase-admin to v12"
```

---

### Task 2: Enable TypeScript strict mode

**Files:**
- Modify: `functions/tsconfig.json`

**Step 1: Update tsconfig.json**

Change these fields:

```json
{
  "compilerOptions": {
    "strict": true,
    "strictNullChecks": true,
    "noImplicitReturns": true,
    "target": "es2020",
    "module": "commonjs",
    "outDir": "lib",
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

**Step 2: Verify compilation fails (expected — this is fine)**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions
npx tsc --noEmit 2>&1 | head -30
```

Expected: Many type errors — this is expected and will be fixed in Phase 3.

**Step 3: Commit**

```bash
git add tsconfig.json
git commit -m "chore: enable TypeScript strict mode"
```

---

### Task 3: Create new directory structure

**Files:**
- Create: `src/callable/.gitkeep`
- Create: `src/http/.gitkeep`
- Create: `src/triggers/firestore/.gitkeep`
- Create: `src/triggers/rtdb/.gitkeep`
- Create: `src/scheduled/.gitkeep`

**Step 1: Create directories**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions/src
mkdir -p callable http triggers/firestore triggers/rtdb scheduled
```

**Step 2: Commit**

```bash
git add src/
git commit -m "chore: create v2 directory structure"
```

---

### Task 4: Create src/config.ts with Secret Manager definitions

**Files:**
- Create: `src/config.ts`

**Step 1: Write config.ts**

```typescript
import { defineSecret } from 'firebase-functions/params';

export const SENDGRID_API_KEY = defineSecret('SENDGRID_API_KEY');
export const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
export const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');
export const STRIPE_CONNECT_WEBHOOK_SECRET = defineSecret('STRIPE_CONNECT_WEBHOOK_SECRET');
```

**Step 2: Document required secrets**

Add a comment at the top:

```typescript
/**
 * Firebase Secret Manager definitions.
 * Set each secret before deploying:
 *   firebase functions:secrets:set SENDGRID_API_KEY
 *   firebase functions:secrets:set STRIPE_SECRET_KEY
 *   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
 *   firebase functions:secrets:set STRIPE_CONNECT_WEBHOOK_SECRET
 *
 * In function options, declare which secrets a function uses:
 *   onCall({ secrets: [SENDGRID_API_KEY] }, async (request) => { ... })
 *
 * Access at runtime via process.env.SECRET_NAME
 */
```

**Step 3: Commit**

```bash
git add src/config.ts
git commit -m "feat: add Secret Manager config for v2"
```

---

### Task 5: Audit and update util/ files for v2 compatibility

**Files:**
- Read then modify: any file in `src/util/` that calls `functions.config()`

**Step 1: Find all functions.config() usages**

```bash
grep -r "functions.config()" /Users/marcusklein/dev/regroup-functions/functions/src/
```

**Step 2: For each file found, replace the pattern**

```typescript
// Before
import * as functions from 'firebase-functions';
const apiKey = functions.config().sendgrid.api_key;
const stripeKey = functions.config().stripe.secret_key;

// After
// No import needed — secrets are accessed via process.env at runtime
const apiKey = process.env.SENDGRID_API_KEY!;
const stripeKey = process.env.STRIPE_SECRET_KEY!;
```

**Step 3: Remove any unused `import * as functions from 'firebase-functions'` in util/**

Only remove the import if that file no longer uses anything else from `firebase-functions`.

**Step 4: Verify util/ compiles in isolation**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions
npx tsc --noEmit 2>&1 | grep "src/util"
```

Expected: Fewer or no errors in util/ files.

**Step 5: Commit**

```bash
git add src/util/
git commit -m "feat: replace functions.config() with process.env in util/"
```

---

## PHASE 2 — Parallel Function Migration

> These 4 tasks can be dispatched as parallel agents simultaneously after Phase 1 completes.
> Each agent works in a different directory. No file conflicts.

---

### Task 6: Migrate callable functions → src/callable/

**Files:**
- Read: `src/index.ts` (all onCall exports)
- Read: `src/api/*.ts` (callable function implementations)
- Create: `src/callable/auth.ts`
- Create: `src/callable/houses.ts`
- Create: `src/callable/meetings.ts`
- Create: `src/callable/payments.ts`
- Create: `src/callable/subscriptions.ts`

**v2 Callable Pattern:**

```typescript
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

// No more functions.https.onCall — use onCall directly
export const myFunction = onCall(async (request) => {
  // Auth check — request.auth replaces context.auth
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }

  // Data access — request.data replaces first arg
  const { field } = request.data as { field: string };
  const uid = request.auth.uid;

  // Logging — same API
  logger.info('myFunction called', { uid });

  return { result: 'value' };
});
```

**Step 1: Create src/callable/auth.ts**

Read `src/index.ts` to find these callable exports, then read their implementations:
- `addGuestAuthorization`
- `addAdminAuthorization`
- `deleteAdminAuthorization`
- `promoteGuestsToAdmin`
- `removePrivilegesForGuests`
- `verifyUserEmail`
- `givePotentialSuperAdminPrivilege`

Migrate each using the v2 pattern above. Group into `src/callable/auth.ts`.

**Step 2: Create src/callable/houses.ts**

Migrate:
- `addNewHouseAdmin`
- `searchForHouses`

**Step 3: Create src/callable/meetings.ts**

Migrate:
- `findMeetings`
- `userIsAtMeeting`
- `narcoticsAnonymousMeetings`
- `getCurrentAddress`

**Step 4: Create src/callable/payments.ts**

Read `src/api/payments.ts`, `src/api/stripe.ts`. Migrate:
- `createPaymentIntent`
- `listPayments`
- `savePaymentMethod`
- `getPaymentMethod`
- `updatePaymentInfo`
- `adHocTransfer`

If these functions use `STRIPE_SECRET_KEY`, declare it in options:

```typescript
import { STRIPE_SECRET_KEY } from '../config';

export const createPaymentIntent = onCall(
  { secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-01-28.clover' });
    // ...
  }
);
```

**Step 5: Create src/callable/subscriptions.ts**

Migrate:
- `createOperatorSubscription`
- `reactivateOperatorSubscription`
- `cancelUserSubscription`
- `updateSubscriptionGuests`
- `updateSubscriptionHouses`
- `connectStripeAccount` (from `src/api/connectStripeAccount.ts`)
- `disconnectStripeAccount` (from `src/api/disconnectStripeAccount.ts`)
- `getStripeAccountStatus` (from `src/api/getStripeAccountStatus.ts`)
- `sendInviteEmails`
- `sendConfirmationEmail`

**Step 6: Commit**

```bash
git add src/callable/
git commit -m "feat: migrate callable functions to v2"
```

---

### Task 7: Migrate HTTP and scheduled functions

**Files:**
- Read: `src/index.ts` (onRequest and scheduled exports)
- Create: `src/http/stripeConnect.ts`
- Create: `src/http/universal.ts`
- Create: `src/scheduled/index.ts`

**v2 HTTP Pattern:**

```typescript
import { onRequest } from 'firebase-functions/v2/https';

export const myHandler = onRequest(async (req, res) => {
  // Same req/res as Express — no change in handler body
  res.send({ ok: true });
});
```

**v2 Scheduled Pattern:**

```typescript
import { onSchedule } from 'firebase-functions/v2/scheduler';

export const myScheduled = onSchedule(
  { schedule: '0 0 * * 0', timeZone: 'America/New_York' },
  async (event) => {
    // Handler body unchanged
  }
);
```

**Step 1: Create src/http/stripeConnect.ts**

Migrate:
- `onboardStripeConnectUser` (currently `functions.https.onRequest`)
- `stripeConnectReauth`
- `stripeConnectReturn`

**Step 2: Create src/http/universal.ts**

Migrate:
- `universal`

**Step 3: Create src/scheduled/index.ts**

Migrate all scheduled functions. Example:

```typescript
import { onSchedule } from 'firebase-functions/v2/scheduler';

export const updateDisputes = onSchedule(
  { schedule: '0 2 * * *', timeZone: 'America/Chicago' },
  async (event) => {
    // existing handler body
  }
);

export const scheduledWeeklyTransferEST = onSchedule(
  { schedule: '0 0 * * 0', timeZone: 'America/New_York' },
  async (event) => {
    // existing handler body
  }
);

export const scheduledWeeklyTransferCST = onSchedule(
  { schedule: '0 0 * * 0', timeZone: 'America/Chicago' },
  async (event) => { /* ... */ }
);

export const scheduledWeeklyTransferMST = onSchedule(
  { schedule: '0 0 * * 0', timeZone: 'America/Denver' },
  async (event) => { /* ... */ }
);

export const scheduledWeeklyTransferPST = onSchedule(
  { schedule: '0 0 * * 0', timeZone: 'America/Los_Angeles' },
  async (event) => { /* ... */ }
);

export const scheduledWeeklyTransferFallback = onSchedule(
  { schedule: '5 0 * * 0', timeZone: 'UTC' },
  async (event) => { /* ... */ }
);

export const warmWebsite = onSchedule(
  { schedule: 'every 5 minutes' },
  async (event) => { /* ... */ }
);
```

**Step 4: Commit**

```bash
git add src/http/ src/scheduled/
git commit -m "feat: migrate HTTP and scheduled functions to v2"
```

---

### Task 8: Migrate Firestore and RTDB triggers

**Files:**
- Read: `src/index.ts` (all trigger exports)
- Create: `src/triggers/firestore/index.ts`
- Create: `src/triggers/rtdb/index.ts`

**v2 Firestore Trigger Patterns:**

```typescript
import {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentDeleted,
} from 'firebase-functions/v2/firestore';

// onCreate
export const notify = onDocumentCreated('/notifications/{notifId}', async (event) => {
  const notifId = event.params.notifId;
  const data = event.data?.data();        // event.data can be undefined in v2 — always check
  if (!data) return;
  // handler body
});

// onUpdate
export const sendSubscriptionUpdateEmail = onDocumentUpdated(
  '/users/{userId}',
  async (event) => {
    const userId = event.params.userId;
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    // handler body
  }
);

// onDelete
export const addDeleteGuestAuthorization = onDocumentDeleted(
  '/houses/{houseId}/guests/{guestId}',
  async (event) => {
    const { houseId, guestId } = event.params;
    // handler body
  }
);
```

**v2 RTDB Trigger Pattern:**

```typescript
import { onValueCreated } from 'firebase-functions/v2/database';

export const dmNotification = onValueCreated(
  '/directMessages/{conversationId}/messages/{messageId}',
  async (event) => {
    const val = event.data.val();
    const { conversationId, messageId } = event.params;
    // handler body
  }
);
```

**Step 1: Create src/triggers/firestore/index.ts**

Read `src/index.ts` to find Firestore trigger exports. Migrate each:
- `notify` (document.create)
- `notifyNewHouseCreated` (document.create)
- `sendContactEmail` (document.create)
- `sendSubscriptionUpdateEmail` (document.update)
- `reportBug` (document.create)
- `submitFeedback` (document.create)

**CRITICAL:** Always guard `event.data` with a null check — in v2, it can be undefined for failed writes.

**Step 2: Create src/triggers/rtdb/index.ts**

Migrate:
- `dmNotification` (from `functions.database.ref(...).onCreate`)

**Step 3: Commit**

```bash
git add src/triggers/
git commit -m "feat: migrate Firestore and RTDB triggers to v2"
```

---

### Task 9: Migrate Stripe webhook handlers

**Files:**
- Read: `src/webhooks/stripeWebhook.ts` (840 lines — read in full)
- Read: `src/index.ts` (stripeEvents, handleStripeConnectWebhook exports)
- Modify: `src/webhooks/stripeWebhook.ts`

**Step 1: Read the full webhook file**

This file is 840 lines. Read it completely before making changes.

**Step 2: Update imports at the top**

```typescript
// Remove:
import * as functions from 'firebase-functions';

// Add:
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_CONNECT_WEBHOOK_SECRET } from '../config';
```

**Step 3: Update function definitions**

```typescript
// Before
export const stripeEvents = functions.https.onRequest(async (req, res) => { ... });
export const handleStripeConnectWebhook = functions.https.onRequest(async (req, res) => { ... });

// After — declare secrets that this function needs
export const stripeEvents = onRequest(
  { secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] },
  async (req, res) => { ... }
);

export const handleStripeConnectWebhook = onRequest(
  { secrets: [STRIPE_SECRET_KEY, STRIPE_CONNECT_WEBHOOK_SECRET] },
  async (req, res) => { ... }
);
```

**Step 4: Replace functions.config() in webhook file**

```typescript
// Before
const stripe = new Stripe(functions.config().stripe.secret_key, { ... });
const endpointSecret = functions.config().stripe.webhook_secret;

// After
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { ... });
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;
```

**Step 5: Replace any HttpsError imports**

```typescript
// Before
throw new functions.https.HttpsError('invalid-argument', 'message');

// After
import { HttpsError } from 'firebase-functions/v2/https';
throw new HttpsError('invalid-argument', 'message');
```

**Step 6: Commit**

```bash
git add src/webhooks/
git commit -m "feat: migrate Stripe webhook handlers to v2"
```

---

## PHASE 3 — Integration (sequential, after all Phase 2 tasks complete)

---

### Task 10: Rewrite src/index.ts to export from new locations

**Files:**
- Read then rewrite: `src/index.ts`

**Step 1: Read current index.ts to understand all exports**

```bash
wc -l /Users/marcusklein/dev/regroup-functions/functions/src/index.ts
```

**Step 2: Replace entire index.ts with clean re-exports**

The new index.ts should ONLY re-export — no function definitions inline:

```typescript
// Callable functions
export * from './callable/auth';
export * from './callable/houses';
export * from './callable/meetings';
export * from './callable/payments';
export * from './callable/subscriptions';

// HTTP handlers
export * from './http/stripeConnect';
export * from './http/universal';

// Webhooks
export * from './webhooks/stripeWebhook';

// Triggers
export * from './triggers/firestore';
export * from './triggers/rtdb';

// Scheduled
export * from './scheduled';
```

**Step 3: Verify all 52 function names are exported**

Cross-reference with the deployed function list:
- adHocTransfer, addAdminAuthorization, addDeleteGuestAuthorization, addGuestAuthorization,
  addNewHouseAdmin, cancelUserSubscription, connectStripeAccount, createOperatorSubscription,
  createPaymentIntent, deleteAdminAuthorization, disconnectStripeAccount, dmNotification,
  findMeetings, getCurrentAddress, getPaymentMethod, getStripeAccountStatus,
  givePotentialSuperAdminPrivilege, handleStripeConnectWebhook, listPayments,
  narcoticsAnonymousMeetings, notify, notifyNewHouseCreated, onboardStripeConnectUser,
  promoteGuestsToAdmin, reactivateOperatorSubscription, removePrivilegesForGuests,
  reportBug, savePaymentMethod, scheduledWeeklyTransferCST, scheduledWeeklyTransferEST,
  scheduledWeeklyTransferFallback, scheduledWeeklyTransferMST, scheduledWeeklyTransferPST,
  searchForHouses, sendConfirmationEmail, sendContactEmail, sendInviteEmails,
  sendSubscriptionUpdateEmail, stripeConnectReauth, stripeConnectReturn, stripeEvents,
  submitFeedback, universal, updateDisputes, updatePaymentInfo, updateSubscriptionGuests,
  updateSubscriptionHouses, userIsAtMeeting, verifyUserEmail, warmWebsite

**Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: update index.ts to export from v2 module structure"
```

---

### Task 11: Fix TypeScript strict mode errors

**Files:**
- Various — fix as identified by tsc

**Step 1: Run tsc and collect errors**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions
npx tsc --noEmit 2>&1 | tee /tmp/tsc-errors.txt
wc -l /tmp/tsc-errors.txt
```

**Step 2: Fix errors by category — most common patterns**

**Null/undefined errors (most common with strictNullChecks):**
```typescript
// Before — error: Object is possibly 'undefined'
const name = user.displayName.toLowerCase();

// After
const name = user.displayName?.toLowerCase() ?? '';
// OR
if (!user.displayName) throw new HttpsError('invalid-argument', 'displayName required');
const name = user.displayName.toLowerCase();
```

**Implicit any errors:**
```typescript
// Before — error: Parameter 'data' implicitly has an 'any' type
const process = (data) => { ... };

// After
const process = (data: Record<string, unknown>) => { ... };
```

**Missing return types:**
```typescript
// Before — may error on noImplicitReturns
const getValue = (flag: boolean) => {
  if (flag) return 'yes';
  // missing return on else path
};

// After
const getValue = (flag: boolean): string => {
  if (flag) return 'yes';
  return 'no';
};
```

**Step 3: Iterate until clean**

```bash
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
```

Expected: 0 errors

**Step 4: Commit after each logical batch of fixes**

```bash
git add src/
git commit -m "fix: resolve TypeScript strict mode errors"
```

---

### Task 12: Run existing tests and verify

**Files:**
- Read: `src/__tests__/payments.test.ts`
- Read: `src/__tests__/stripeWebhook.test.ts`

**Step 1: Run the test suite**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions
npm test
```

Expected: All existing tests pass. If tests fail, fix the specific failure before proceeding.

**Step 2: Common test failures after v2 migration**

If `functions.https.onCall` mock patterns break:

```typescript
// Old test mock
jest.mock('firebase-functions', () => ({
  https: { onCall: (fn: Function) => fn },
}));

// New test mock
jest.mock('firebase-functions/v2/https', () => ({
  onCall: (_opts: unknown, fn: Function) => fn,
  HttpsError: class HttpsError extends Error {
    constructor(public code: string, message: string) { super(message); }
  },
}));
```

**Step 3: Commit any test fixes**

```bash
git add src/__tests__/
git commit -m "fix: update test mocks for v2 SDK"
```

---

### Task 13: Final verification and cleanup

**Step 1: Full build**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions
npm run build
```

Expected: Clean build with no errors. `lib/` directory populated.

**Step 2: Verify function count in compiled output**

```bash
ls lib/ && grep -r "exports\." lib/index.js | wc -l
```

Expected: ~52 exports

**Step 3: Remove old top-level function files that have been fully migrated**

After confirming all functions are in their new locations and `index.ts` re-exports them correctly, remove any dead code in `src/api/*.ts` that is no longer the source of truth (the function definitions moved to `src/callable/`). Keep `src/api/firestore.ts`, `src/api/stripe.ts`, `src/api/api.ts` as they contain shared helpers, not function definitions.

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete v2 migration - all functions migrated, tests passing"
```

---

## Secrets Setup Checklist (run before first deployment)

```bash
# Set all required secrets in Firebase
firebase functions:secrets:set SENDGRID_API_KEY
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
firebase functions:secrets:set STRIPE_CONNECT_WEBHOOK_SECRET
```

---

## Client Compatibility Notes

- All 52 function names are identical — `httpsCallable('functionName')` works unchanged
- `AngularFireFunctions` in rats-web: no changes needed
- `@react-native-firebase/functions` in rats-v2: no changes needed
- v2 callable functions are backward-compatible with all Firebase client SDKs

---

## Key v1 → v2 Reference

| v1 | v2 |
|----|----|
| `functions.https.onCall((data, ctx) => {})` | `onCall(async (req) => { req.data, req.auth })` |
| `functions.https.onRequest((req, res) => {})` | `onRequest(async (req, res) => {})` |
| `functions.pubsub.schedule(cron).timeZone(tz).onRun(() => {})` | `onSchedule({ schedule: cron, timeZone: tz }, async () => {})` |
| `functions.firestore.document(path).onCreate((snap, ctx) => {})` | `onDocumentCreated(path, (event) => { event.data?.data() })` |
| `functions.firestore.document(path).onUpdate((change, ctx) => {})` | `onDocumentUpdated(path, (event) => { event.data?.before, event.data?.after })` |
| `functions.database.ref(path).onCreate((snap) => {})` | `onValueCreated(path, (event) => { event.data.val() })` |
| `functions.config().key.secret` | `process.env.SECRET_NAME` (via `defineSecret`) |
| `context.auth` | `request.auth` |
| `context.params` | `event.params` |
| `new functions.https.HttpsError(code, msg)` | `new HttpsError(code, msg)` (imported from v2/https) |
| `functions.logger.info()` | `logger.info()` (from `firebase-functions`) |
