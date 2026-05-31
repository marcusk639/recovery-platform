# Sprint 5 — Oxford Customer Acquisition Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the broken payment service, write the `setOxfordEnabled` Cloud Function that unlocks Oxford features, verify Stripe deployment, and automate weekly EES calculation so Oxford Houses can be acquired and onboarded end-to-end.

**Architecture:** Four independent parts. Parts 1–2 are correctness cleanup (delete wrong code). Part 3 writes the Cloud Function that sets `oxfordEnabled` and wires it into the upgrade button in `OxfordDashboard.tsx`. Part 4 writes a scheduled Cloud Function that auto-calculates EES weekly and on resident roster changes, with a Treasurer-facing expense input in `EESTracker.tsx`.

**Tech Stack:** TypeScript, Firebase Cloud Functions v1 (`firebase-functions`), Firestore Admin SDK (`firebase-admin`), React Native, `@testing-library/react-native`, Jest.

---

## Task 1: Reconcile payment services (delete `payment.ts`)

**Context:** `src/services/payment.ts` calls a Cloud Function named `createRentPaymentIntent` which does not exist. The correct Cloud Function is `createPaymentIntent` in `src/services/payments.ts`. However `payment.ts` also contains valid types and helpers (`RentPayment`, `paymentsCollection`, `recordRentPayment`, `getPaymentHistory`) imported by 7 files. We must move those into `payments.ts` then delete the wrong file.

**Files:**
- Modify: `src/services/payments.ts`
- Modify: `src/state/queries/paymentQueries.ts`
- Modify: `src/screens/RentPayment/PaymentRow.tsx`
- Modify: `src/screens/RentPayment/PaymentStatusBadge.tsx`
- Modify: `src/screens/RentPayment/__tests__/RentPaymentScreen.test.tsx`
- Modify: `src/screens/RentPayment/__tests__/PaymentRow.test.tsx`
- Modify: `src/state/queries/__tests__/paymentQueries.test.ts`
- Delete: `src/services/payment.ts`

---

**Step 1: Add missing exports to `payments.ts`**

Append to the bottom of `src/services/payments.ts`:

```typescript
import { firestore } from '../../firebase-setup';

// Re-exported from legacy payment.ts for callers that need Firestore-backed operations
export interface RentPayment {
  id: string;
  guestId: string;
  houseId: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
  stripePaymentIntentId?: string;
  description?: string;
}

export const paymentsCollection = firestore.collection('payments');

export async function recordRentPayment(
  guestId: string,
  houseId: string,
  amount: number,
  description: string = 'Rent Payment',
  stripePaymentIntentId?: string,
): Promise<RentPayment> {
  const docRef = paymentsCollection.doc();
  const payment: RentPayment = {
    id: docRef.id,
    guestId,
    houseId,
    amount,
    status: 'pending',
    createdAt: new Date().toISOString(),
    description,
    stripePaymentIntentId,
  };
  await docRef.set(payment);
  return payment;
}

export async function getPaymentHistory(guestId: string): Promise<RentPayment[]> {
  const snapshot = await paymentsCollection
    .where('guestId', '==', guestId)
    .orderBy('createdAt', 'desc')
    .get();
  if (!snapshot.docs.length) {
    return [];
  }
  return snapshot.docs.map(doc => doc.data() as RentPayment);
}
```

---

**Step 2: Update `paymentQueries.ts`**

Replace the two import lines at the top and fix the wrong function call:

Old:
```typescript
import * as paymentService from '../../services/payment';
import { RentPayment } from '../../services/payment';
```

New:
```typescript
import { createPaymentIntent, recordRentPayment, getPaymentHistory } from '../../services/payments';
import { RentPayment } from '../../services/payments';
```

In `usePaymentHistory`, replace:
```typescript
queryFn: () => paymentService.getPaymentHistory(guestId),
```
With:
```typescript
queryFn: () => getPaymentHistory(guestId),
```

In `useCreateRentPayment`, replace the entire `mutationFn` body:
```typescript
mutationFn: async ({ guestId, houseId, amount, description }) => {
  // createPaymentIntent args are (amount, guestId, houseId, description)
  const intentResult = await createPaymentIntent(amount, guestId, houseId, description);
  await recordRentPayment(guestId, houseId, amount, description ?? 'Rent Payment');
  return intentResult;
},
```

---

**Step 3: Update remaining import callers**

In each file below, change:
```typescript
import { RentPayment } from '../../services/payment';
// or
import { RentPayment } from '../../../services/payment';
// or
import * as paymentService from '../../../services/payment';
import { RentPayment, CreatePaymentIntentResult } from '../../../services/payment';
```
To point to `payments` (same path, just `payments` instead of `payment`):

- `src/screens/RentPayment/PaymentRow.tsx` line 5: `'../../services/payments'`
- `src/screens/RentPayment/PaymentStatusBadge.tsx` line 5: `'../../services/payments'`
- `src/screens/RentPayment/__tests__/RentPaymentScreen.test.tsx` line 92: `'../../../services/payments'`
- `src/screens/RentPayment/__tests__/PaymentRow.test.tsx` line 4: `'../../../services/payments'`
- `src/state/queries/__tests__/paymentQueries.test.ts` lines 15-16: change both to `'../../../services/payments'`. Remove `CreatePaymentIntentResult` import if unused after the change.

---

**Step 4: Run tests to verify no broken imports**

```bash
npx jest --testPathPattern="paymentQueries|PaymentRow|RentPaymentScreen|PaymentStatusBadge" --no-coverage
```

Expected: all tests pass (or same pre-existing failures as before).

---

**Step 5: Delete `payment.ts`**

```bash
rm src/services/payment.ts
```

Then verify no remaining imports:
```bash
grep -r "services/payment'" src/ --include="*.ts" --include="*.tsx"
```

Expected: no output.

---

**Step 6: Run full test suite**

```bash
npx jest --no-coverage 2>&1 | tail -5
```

Expected: same pass/fail count as before this task.

---

**Step 7: Commit**

```bash
git add -A
git commit -m "fix: consolidate payment services, delete wrong payment.ts with non-existent function name"
```

---

## Task 2: Remove `debug-deep-links.ts` and `DeepLinkTester.tsx`

**Files:**
- Delete: `src/services/debug-deep-links.ts`
- Delete: `src/components/DeepLinkTester.tsx`
- Verify: `src/screens/Splash/__tests__/Splash.test.tsx` (uses `debug-deep-links` indirectly)

---

**Step 1: Check all callers**

```bash
grep -r "debug-deep-links\|DeepLinkTester" src/ --include="*.ts" --include="*.tsx"
```

Note the files listed. Expected: `DeepLinkTester.tsx` imports `debug-deep-links.ts`, and `Splash.test.tsx` may import `DeepLinkTester`.

---

**Step 2: Delete both files**

```bash
rm src/services/debug-deep-links.ts
rm src/components/DeepLinkTester.tsx
```

---

**Step 3: Fix any broken imports from Step 1**

For each file that imported either deleted file: remove the import line and any usage of the deleted exports.

---

**Step 4: Run tests**

```bash
npx jest --no-coverage 2>&1 | tail -5
```

Expected: same pass/fail count as before.

---

**Step 5: Commit**

```bash
git add -A
git commit -m "fix: remove debug-deep-links and DeepLinkTester from production code"
```

---

## Task 3: `setOxfordEnabled` Cloud Function + upgrade button wire-up

**Context:** The `OxfordDashboard.tsx` upgrade button opens a web URL. After this task, tapping "Start 14-Day Free Trial" calls `setOxfordEnabled` which writes `oxfordEnabled: true` to the user's Firestore document, and the paywall immediately clears. This is the MVP unlock mechanism — billing management is handled separately in rats-web.

**Files:**
- Create: `functions/src/oxford/setOxfordEnabled.ts`
- Create: `functions/src/oxford/__tests__/setOxfordEnabled.test.ts`
- Modify: `functions/src/index.ts`
- Modify: `src/screens/Oxford/OxfordDashboard.tsx`

---

**Step 1: Write the failing test**

Create `functions/src/oxford/__tests__/setOxfordEnabled.test.ts`:

```typescript
/**
 * setOxfordEnabled Cloud Function Tests
 */
import * as admin from 'firebase-admin';

// ── Firebase Admin mock ────────────────────────────────────────────────────

const mockUpdate = jest.fn().mockResolvedValue(undefined);
const mockDocFn = jest.fn(() => ({ update: mockUpdate }));
const mockFirestore = { collection: jest.fn(() => ({ doc: mockDocFn })) };

jest.mock('firebase-admin', () => ({
  firestore: jest.fn(() => mockFirestore),
  initializeApp: jest.fn(),
  apps: ['app'],
}));

// ── firebase-functions mock ───────────────────────────────────────────────

const mockHttpsError = jest.fn((code: string, msg: string) => {
  const err = new Error(msg) as any;
  err.code = code;
  return err;
});

jest.mock('firebase-functions', () => ({
  https: {
    onCall: (fn: Function) => fn,
    HttpsError: mockHttpsError,
  },
}));

// ── Import after mocks ────────────────────────────────────────────────────

import { setOxfordEnabled } from '../setOxfordEnabled';

// ── Helpers ───────────────────────────────────────────────────────────────

const makeContext = (uid?: string) => ({
  auth: uid ? { uid } : undefined,
});

beforeEach(() => jest.clearAllMocks());

// ── Tests ─────────────────────────────────────────────────────────────────

describe('setOxfordEnabled', () => {
  it('throws unauthenticated when no auth context', async () => {
    await expect(
      setOxfordEnabled({ userId: 'u1', houseId: 'h1' }, makeContext()),
    ).rejects.toBeDefined();
    expect(mockHttpsError).toHaveBeenCalledWith('unauthenticated', expect.any(String));
  });

  it('throws unauthenticated when userId does not match auth uid', async () => {
    await expect(
      setOxfordEnabled({ userId: 'u1', houseId: 'h1' }, makeContext('different-uid')),
    ).rejects.toBeDefined();
    expect(mockHttpsError).toHaveBeenCalledWith('unauthenticated', expect.any(String));
  });

  it('throws invalid-argument when userId is missing', async () => {
    await expect(
      setOxfordEnabled({ userId: '', houseId: 'h1' }, makeContext('u1')),
    ).rejects.toBeDefined();
    expect(mockHttpsError).toHaveBeenCalledWith('invalid-argument', expect.any(String));
  });

  it('writes oxfordEnabled: true to user document on success', async () => {
    await setOxfordEnabled({ userId: 'u1', houseId: 'h1' }, makeContext('u1'));

    expect(mockFirestore.collection).toHaveBeenCalledWith('users');
    expect(mockDocFn).toHaveBeenCalledWith('u1');
    expect(mockUpdate).toHaveBeenCalledWith({
      'subscriptionMetadata.oxfordEnabled': true,
      'subscriptionMetadata.oxfordEnabledAt': expect.any(String),
    });
  });

  it('returns success: true on completion', async () => {
    const result = await setOxfordEnabled({ userId: 'u1', houseId: 'h1' }, makeContext('u1'));
    expect(result).toEqual({ success: true });
  });
});
```

---

**Step 2: Run the test to verify it fails**

```bash
cd functions && npx jest oxford/__tests__/setOxfordEnabled --no-coverage
cd ..
```

Expected: FAIL — "Cannot find module '../setOxfordEnabled'"

---

**Step 3: Implement `setOxfordEnabled`**

Create `functions/src/oxford/setOxfordEnabled.ts`:

```typescript
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

export const setOxfordEnabled = functions.https.onCall(
  async (data: { userId: string; houseId: string }, context) => {
    // ── 1. Auth guard ────────────────────────────────────────────────────
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }

    const { userId, houseId } = data;

    if (!userId || !houseId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'userId and houseId are required',
      );
    }

    // ── 2. Caller can only enable Oxford for their own account ───────────
    if (context.auth.uid !== userId) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'You can only enable Oxford for your own account',
      );
    }

    // ── 3. Write the flag ────────────────────────────────────────────────
    await admin.firestore().collection('users').doc(userId).update({
      'subscriptionMetadata.oxfordEnabled': true,
      'subscriptionMetadata.oxfordEnabledAt': new Date().toISOString(),
    });

    return { success: true };
  },
);
```

---

**Step 4: Run tests — verify they pass**

```bash
cd functions && npx jest oxford/__tests__/setOxfordEnabled --no-coverage
cd ..
```

Expected: PASS (5 tests)

---

**Step 5: Export from `functions/src/index.ts`**

Add after the last export line:

```typescript
export { setOxfordEnabled } from './oxford/setOxfordEnabled';
```

---

**Step 6: Wire up the upgrade button in `OxfordDashboard.tsx`**

Add the following imports at the top of `src/screens/Oxford/OxfordDashboard.tsx`:

```typescript
import { useState } from 'react';
import { functions } from '../../../firebase-setup';
```

Add a `useAppSelector` call to get the current user's uid (already available via `state.userRTK.user`):
```typescript
const user = useAppSelector(state => state.userRTK.user);
```

Replace the upgrade paywall `return` block's `TouchableOpacity` upgrade button section.

Find:
```typescript
<TouchableOpacity
  testID="oxford-upgrade-button"
  onPress={() => Linking.openURL('https://regroup-app.com/my-account')}
  style={styles.upgradeButton}>
  <RatsText
    text="Start 14-Day Free Trial"
    style={styles.upgradeButtonText}
    translate={false}
  />
</TouchableOpacity>
```

Replace with:
```typescript
<TouchableOpacity
  testID="oxford-upgrade-button"
  onPress={async () => {
    if (!user?.id || !houseId) return;
    try {
      await functions.httpsCallable('setOxfordEnabled')({
        userId: user.id,
        houseId,
      });
    } catch (err) {
      // Flag write failed — user can retry
    }
  }}
  style={styles.upgradeButton}>
  <RatsText
    text="Start 14-Day Free Trial"
    style={styles.upgradeButtonText}
    translate={false}
  />
</TouchableOpacity>
```

Remove `Linking` from the imports in `OxfordDashboard.tsx` if no longer used elsewhere in the file.

---

**Step 7: Deploy the function**

```bash
cd functions && npm run build
firebase deploy --only functions:setOxfordEnabled
cd ..
```

Expected: "Deploy complete!"

---

**Step 8: Commit**

```bash
git add -A
git commit -m "feat(oxford): add setOxfordEnabled Cloud Function and wire upgrade button"
```

---

## Task 4: Stripe verification and `@ts-nocheck` fix

**Context:** Verify that `createPaymentIntent` and `stripeWebhook` are deployed to production and the Stripe webhook endpoint is registered. Then remove `@ts-nocheck` from `StripeSettingsScreen.tsx`.

**Files:**
- Modify: `src/screens/HouseSettings/StripeSettingsScreen.tsx`

---

**Step 1: Check deployed Cloud Functions**

Open Firebase console → Functions → verify these appear in the deployed list:
- `createPaymentIntent`
- `stripeWebhook`
- `listPayments`
- `connectStripeAccount`

If any are missing, deploy them:
```bash
cd functions && npm run build
firebase deploy --only functions
cd ..
```

---

**Step 2: Check Stripe webhook registration**

Open Stripe dashboard → Developers → Webhooks.

Verify there is an endpoint with:
- URL pointing to `https://<region>-<project>.cloudfunctions.net/stripeWebhook`
- Events: at minimum `payment_intent.succeeded` and `payment_intent.payment_failed`

If no webhook exists, click "Add endpoint" and register the URL above with those two events. Copy the webhook signing secret and verify it matches `functions.config().stripe.webhook_secret` in your Firebase Functions config.

To check current Firebase Functions config:
```bash
firebase functions:config:get
```

---

**Step 3: Remove `@ts-nocheck` from `StripeSettingsScreen.tsx`**

Delete line 1: `//@ts-nocheck`

---

**Step 4: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep StripeSettingsScreen
```

Expected: list of TypeScript errors to fix.

---

**Step 5: Fix TypeScript errors**

Work through each error. Common patterns to expect:
- Implicit `any` types on event handlers → add explicit types
- Missing properties on interfaces → check `StripeAccountStatus` entity
- `functions.httpsCallable` return type → cast with `as`

Run after each fix:
```bash
npx tsc --noEmit 2>&1 | grep StripeSettingsScreen
```

Goal: zero errors in `StripeSettingsScreen.tsx`.

---

**Step 6: Run tests**

```bash
npx jest --no-coverage 2>&1 | tail -5
```

Expected: same pass/fail as before.

---

**Step 7: Commit**

```bash
git add src/screens/HouseSettings/StripeSettingsScreen.tsx
git commit -m "fix(stripe): verify deployment, register webhook, remove @ts-nocheck from StripeSettingsScreen"
```

---

## Task 5: `calculateEES` Cloud Function

**Context:** Weekly scheduled function that reads `house.eesWeeklyExpenses` (a new field on the house document), divides by active resident count, creates `ees-records` in Firestore for the current week, and sends a push notification. Also triggers on guest roster changes.

**Files:**
- Create: `functions/src/oxford/calculateEES.ts`
- Create: `functions/src/oxford/__tests__/calculateEES.test.ts`
- Modify: `functions/src/index.ts`

---

**Step 1: Write the failing tests**

Create `functions/src/oxford/__tests__/calculateEES.test.ts`:

```typescript
/**
 * calculateEES Cloud Function Tests
 */

// ── Firestore mock ─────────────────────────────────────────────────────────

const mockBatchSet = jest.fn();
const mockBatchCommit = jest.fn().mockResolvedValue(undefined);
const mockBatch = { set: mockBatchSet, commit: mockBatchCommit };

let mockGuestDocs: any[] = [];
let mockHouseData: any = {};
let mockExistingRecords: any[] = [];

const mockFirestore = {
  batch: jest.fn(() => mockBatch),
  collection: jest.fn((name: string) => ({
    doc: jest.fn((id?: string) => ({
      id: id ?? 'generated-id',
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => mockHouseData,
      }),
    })),
    where: jest.fn(() => ({
      where: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({
          docs: name === 'guests' ? mockGuestDocs : mockExistingRecords,
          empty: (name === 'guests' ? mockGuestDocs : mockExistingRecords).length === 0,
        }),
      })),
    })),
  })),
};

jest.mock('firebase-admin', () => ({
  firestore: Object.assign(jest.fn(() => mockFirestore), {
    FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' },
  }),
  initializeApp: jest.fn(),
  apps: ['app'],
  messaging: jest.fn(() => ({ sendToTopic: jest.fn().mockResolvedValue(undefined) })),
}));

jest.mock('firebase-functions', () => ({
  pubsub: { schedule: jest.fn(() => ({ timeZone: jest.fn(() => ({ onRun: (fn: Function) => fn })) })) },
  firestore: { document: jest.fn(() => ({ onUpdate: (fn: Function) => fn })) },
  https: { HttpsError: jest.fn((c: string, m: string) => { const e = new Error(m) as any; e.code = c; return e; }) },
}));

import { calculateEESForHouse } from '../calculateEES';

beforeEach(() => {
  jest.clearAllMocks();
  mockGuestDocs = [];
  mockHouseData = {};
  mockExistingRecords = [];
});

describe('calculateEESForHouse', () => {
  it('returns zero EES when there are no residents', async () => {
    mockHouseData = { eesWeeklyExpenses: 1000 };
    mockGuestDocs = [];
    const result = await calculateEESForHouse('house1');
    expect(result.eesAmount).toBe(0);
    expect(result.residentCount).toBe(0);
    expect(mockBatchCommit).not.toHaveBeenCalled();
  });

  it('returns zero EES when eesWeeklyExpenses is zero', async () => {
    mockHouseData = { eesWeeklyExpenses: 0 };
    mockGuestDocs = [
      { id: 'g1', data: () => ({ id: 'g1', houseId: 'house1', status: 'active' }) },
    ];
    const result = await calculateEESForHouse('house1');
    expect(result.eesAmount).toBe(0);
  });

  it('calculates correct EES per resident and creates records', async () => {
    mockHouseData = { eesWeeklyExpenses: 1200 };
    mockGuestDocs = [
      { id: 'g1', data: () => ({ id: 'g1', houseId: 'house1', status: 'active' }) },
      { id: 'g2', data: () => ({ id: 'g2', houseId: 'house1', status: 'active' }) },
      { id: 'g3', data: () => ({ id: 'g3', houseId: 'house1', status: 'active' }) },
    ];
    mockExistingRecords = []; // no records for this week yet

    const result = await calculateEESForHouse('house1');

    expect(result.eesAmount).toBe(400); // 1200 / 3
    expect(result.residentCount).toBe(3);
    expect(mockBatchSet).toHaveBeenCalledTimes(3);
    expect(mockBatchCommit).toHaveBeenCalled();
  });

  it('rounds EES to two decimal places', async () => {
    mockHouseData = { eesWeeklyExpenses: 1000 };
    mockGuestDocs = [
      { id: 'g1', data: () => ({ id: 'g1' }) },
      { id: 'g2', data: () => ({ id: 'g2' }) },
      { id: 'g3', data: () => ({ id: 'g3' }) },
    ];

    const result = await calculateEESForHouse('house1');
    expect(result.eesAmount).toBe(333.33); // 1000 / 3, rounded
  });

  it('does not create duplicate records when records already exist for this week', async () => {
    mockHouseData = { eesWeeklyExpenses: 600 };
    mockGuestDocs = [
      { id: 'g1', data: () => ({ id: 'g1' }) },
      { id: 'g2', data: () => ({ id: 'g2' }) },
    ];
    mockExistingRecords = [
      { id: 'r1', data: () => ({ guestId: 'g1' }) },
    ]; // g1 already has a record

    const result = await calculateEESForHouse('house1');
    // Only creates record for g2 (g1 already has one)
    expect(mockBatchSet).toHaveBeenCalledTimes(1);
    expect(result.eesAmount).toBe(300); // 600 / 2
  });
});
```

---

**Step 2: Run the test to verify it fails**

```bash
cd functions && npx jest oxford/__tests__/calculateEES --no-coverage
cd ..
```

Expected: FAIL — "Cannot find module '../calculateEES'"

---

**Step 3: Implement `calculateEES`**

Create `functions/src/oxford/calculateEES.ts`:

```typescript
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

/**
 * Core EES calculation logic — exported for testing and reuse.
 *
 * 1. Gets eesWeeklyExpenses from house document
 * 2. Gets active resident count
 * 3. Creates ees-records for residents who don't have one this week
 * 4. Returns { eesAmount, residentCount }
 */
export async function calculateEESForHouse(
  houseId: string,
): Promise<{ eesAmount: number; residentCount: number }> {
  const db = admin.firestore();
  const weekStart = getWeekStart();

  // ── 1. Get house expenses ────────────────────────────────────────────────
  const houseSnap = await db.collection('houses').doc(houseId).get();
  if (!houseSnap.exists) {
    return { eesAmount: 0, residentCount: 0 };
  }
  const house = houseSnap.data() as { eesWeeklyExpenses?: number };
  const totalExpenses = house.eesWeeklyExpenses ?? 0;

  // ── 2. Get active residents ───────────────────────────────────────────────
  const guestsSnap = await db
    .collection('guests')
    .where('houseId', '==', houseId)
    .where('status', '==', 'active')
    .get();

  const residentCount = guestsSnap.docs.length;
  if (residentCount === 0 || totalExpenses === 0) {
    return { eesAmount: 0, residentCount };
  }

  const eesAmount = Math.round((totalExpenses / residentCount) * 100) / 100;

  // ── 3. Get existing records for this week (avoid duplicates) ──────────────
  const existingSnap = await db
    .collection('ees-records')
    .where('houseId', '==', houseId)
    .where('weekStart', '==', weekStart)
    .get();

  const existingGuestIds = new Set(existingSnap.docs.map(d => d.data().guestId));

  // ── 4. Create records for residents who don't have one yet ────────────────
  const newResidents = guestsSnap.docs.filter(d => !existingGuestIds.has(d.id));

  if (newResidents.length > 0) {
    const batch = db.batch();
    newResidents.forEach(guestDoc => {
      const ref = db.collection('ees-records').doc();
      batch.set(ref, {
        id: ref.id,
        guestId: guestDoc.id,
        houseId,
        weekStart,
        amount: eesAmount,
        paid: false,
        calculationMethod: 'auto',
        calculatedAt: new Date().toISOString(),
      });
    });
    await batch.commit();
  }

  return { eesAmount, residentCount };
}

/**
 * Returns the ISO date string for the start of the current week (Monday).
 */
function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // adjust to Monday
  const monday = new Date(now.setDate(diff));
  return monday.toISOString().split('T')[0];
}

/**
 * Scheduled function — runs every Monday at 08:00 Eastern.
 * Calculates EES for all Oxford houses.
 */
export const weeklyEESCalculation = functions.pubsub
  .schedule('every monday 08:00')
  .timeZone('America/New_York')
  .onRun(async () => {
    const db = admin.firestore();
    const housesSnap = await db
      .collection('houses')
      .where('houseType', '==', 'oxford')
      .get();

    await Promise.all(
      housesSnap.docs.map(doc => calculateEESForHouse(doc.id)),
    );
  });

/**
 * Firestore trigger — recalculates EES when a guest's status changes
 * (move-in or move-out) for an Oxford house.
 */
export const onGuestStatusChange = functions.firestore
  .document('guests/{guestId}')
  .onUpdate(async change => {
    const before = change.before.data() as { status?: string; houseId?: string; houseType?: string };
    const after = change.after.data() as { status?: string; houseId?: string; houseType?: string };

    if (before.status === after.status) {
      return; // No status change, nothing to do
    }

    if (!after.houseId) {
      return;
    }

    // Only recalculate for Oxford houses
    const houseSnap = await admin.firestore().collection('houses').doc(after.houseId).get();
    const house = houseSnap.data() as { houseType?: string };
    if (house?.houseType !== 'oxford') {
      return;
    }

    await calculateEESForHouse(after.houseId);
  });
```

---

**Step 4: Run tests — verify they pass**

```bash
cd functions && npx jest oxford/__tests__/calculateEES --no-coverage
cd ..
```

Expected: PASS (5 tests)

---

**Step 5: Export from `functions/src/index.ts`**

Add after the `setOxfordEnabled` export:

```typescript
export { weeklyEESCalculation, onGuestStatusChange } from './oxford/calculateEES';
```

---

**Step 6: Run all function tests**

```bash
cd functions && npx jest --no-coverage
cd ..
```

Expected: all tests pass.

---

**Step 7: Deploy**

```bash
cd functions && npm run build
firebase deploy --only functions:weeklyEESCalculation,functions:onGuestStatusChange
cd ..
```

---

**Step 8: Commit**

```bash
git add -A
git commit -m "feat(oxford): add calculateEES Cloud Function with weekly schedule and roster-change trigger"
```

---

## Task 6: Update `EESTracker.tsx` to support auto-calculation

**Context:** The Treasurer needs to be able to set `eesWeeklyExpenses` on the house (the Cloud Function reads this). The `EESTracker.tsx` also needs to display a badge distinguishing auto-calculated records from manually created ones. The `EESRecord` type in `src/services/oxford/ees.ts` needs a `calculationMethod` field.

**Files:**
- Modify: `src/services/oxford/ees.ts`
- Modify: `src/screens/Oxford/EESTracker.tsx`
- Create: `src/screens/Oxford/__tests__/EESTracker.test.tsx`

---

**Step 1: Write failing tests**

Create `src/screens/Oxford/__tests__/EESTracker.test.tsx`:

```typescript
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import configureStore from 'redux-mock-store';
import EESTracker from '../EESTracker';

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('../../../services/oxford/ees', () => ({
  getEESRecords: jest.fn().mockResolvedValue([]),
  markEESPaid: jest.fn().mockResolvedValue(undefined),
  calculateEES: jest.fn((expenses: number, count: number) =>
    count === 0 ? 0 : Math.round((expenses / count) * 100) / 100,
  ),
  createEESRecords: jest.fn().mockResolvedValue(undefined),
  setHouseWeeklyExpenses: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('moment', () => {
  const m = (d: any) => ({
    startOf: () => m(d),
    format: (f: string) => f === 'YYYY-MM-DD' ? '2024-01-15' : 'Jan 15, 2024',
  });
  m.isMoment = () => false;
  return m;
});

jest.mock('../../../components/screen-header', () => 'ScreenHeader');
jest.mock('../../../components/rats-scroll-view', () => 'RatsScrollView');
jest.mock('../../../components/rats-button/rats-button', () => 'RatsButton');
jest.mock('../../../components/rats-text', () => ({
  RatsText: ({ text }: any) => text,
}));

const mockStore = configureStore([]);

const makeStore = (houseId = 'house1', capacity = 3) =>
  mockStore({
    housesRTK: {
      selectedHouse: { id: houseId, currentCapacity: capacity, houseType: 'oxford' },
    },
    guestsRTK: { guests: {} },
  });

const renderTracker = (store = makeStore()) =>
  render(
    <Provider store={store}>
      <EESTracker navigation={{ navigate: jest.fn() } as any} />
    </Provider>,
  );

// ── Tests ──────────────────────────────────────────────────────────────────

describe('EESTracker', () => {
  it('renders the EES Tracker screen', async () => {
    const { getByTestId } = renderTracker();
    await waitFor(() => expect(getByTestId('ees-tracker-screen')).toBeTruthy());
  });

  it('shows an input for total house expenses', async () => {
    const { getByTestId } = renderTracker();
    await waitFor(() => expect(getByTestId('ees-expenses-input')).toBeTruthy());
  });

  it('displays AUTO badge on auto-calculated records', async () => {
    const { getEESRecords } = require('../../../services/oxford/ees');
    getEESRecords.mockResolvedValueOnce([
      { id: 'r1', guestId: 'g1', amount: 400, paid: false, calculationMethod: 'auto' },
    ]);
    const { getByTestId } = renderTracker();
    await waitFor(() => expect(getByTestId('ees-record-auto-badge-r1')).toBeTruthy());
  });

  it('does not show AUTO badge on manual records', async () => {
    const { getEESRecords } = require('../../../services/oxford/ees');
    getEESRecords.mockResolvedValueOnce([
      { id: 'r2', guestId: 'g2', amount: 400, paid: false, calculationMethod: 'manual' },
    ]);
    const { queryByTestId } = renderTracker();
    await waitFor(() => expect(queryByTestId('ees-record-auto-badge-r2')).toBeNull());
  });
});
```

---

**Step 2: Run the tests to verify they fail**

```bash
npx jest EESTracker --no-coverage
```

Expected: FAIL — missing `testID` props and `setHouseWeeklyExpenses` export.

---

**Step 3: Add `calculationMethod` and `setHouseWeeklyExpenses` to `ees.ts`**

In `src/services/oxford/ees.ts`, update the `EESRecord` interface:
```typescript
export interface EESRecord {
  guestId: string;
  amount: number;
  paid: boolean;
  paidAt?: string;
  weekStart: string;
  houseId: string;
  calculationMethod?: 'auto' | 'manual'; // add this field
  calculatedAt?: string;                  // add this field
}
```

Add a new export function at the bottom:
```typescript
export async function setHouseWeeklyExpenses(
  houseId: string,
  amount: number,
): Promise<void> {
  await firestore
    .collection('houses')
    .doc(houseId)
    .update({ eesWeeklyExpenses: amount });
}
```

---

**Step 4: Update `EESTracker.tsx`**

Add the following changes to `src/screens/Oxford/EESTracker.tsx`:

1. Import `setHouseWeeklyExpenses` and `TextInput` from react-native:
```typescript
import { View, FlatList, Alert, ActivityIndicator, TouchableOpacity, TextInput } from 'react-native';
import {
  EESRecord,
  getEESRecords,
  markEESPaid,
  calculateEES,
  createEESRecords,
  setHouseWeeklyExpenses,
} from '../../services/oxford/ees';
```

2. Add an expense input state variable after `const [totalExpenses, setTotalExpenses] = useState(0)`:
```typescript
const [expensesInput, setExpensesInput] = useState(totalExpenses.toString());
const [savingExpenses, setSavingExpenses] = useState(false);
```

3. Add `testID="ees-tracker-screen"` to the outer `RatsScrollView` or `View`.

4. In the summary card section, add an expense input below the header:
```typescript
<TextInput
  testID="ees-expenses-input"
  value={expensesInput}
  onChangeText={setExpensesInput}
  onEndEditing={async () => {
    const amount = parseFloat(expensesInput) || 0;
    setTotalExpenses(amount);
    if (!house?.id) return;
    setSavingExpenses(true);
    try {
      await setHouseWeeklyExpenses(house.id, amount);
    } finally {
      setSavingExpenses(false);
    }
  }}
  keyboardType="decimal-pad"
  style={{
    borderWidth: 1,
    borderColor: color.light_grey,
    borderRadius: 6,
    padding: normalize(8),
    fontSize: fontSize.regular,
    color: color.black,
    marginBottom: normalize(8),
  }}
  placeholder="Total weekly house expenses ($)"
/>
```

5. In `renderRecord`, add `testID` and the AUTO badge. After the status badge, add:
```typescript
{item.calculationMethod === 'auto' && (
  <View
    testID={`ees-record-auto-badge-${item.id}`}
    style={{
      backgroundColor: color.baby_blue,
      paddingHorizontal: normalize(6),
      paddingVertical: normalize(2),
      borderRadius: normalize(4),
      marginLeft: normalize(4),
    }}>
    <RatsText
      text="AUTO"
      style={{ color: color.white, fontSize: fontSize.extraSmall }}
    />
  </View>
)}
```

---

**Step 5: Run the tests — verify they pass**

```bash
npx jest EESTracker --no-coverage
```

Expected: PASS (4 tests)

---

**Step 6: Run full test suite**

```bash
npx jest --no-coverage 2>&1 | tail -5
```

Expected: same or better pass count.

---

**Step 7: Commit**

```bash
git add -A
git commit -m "feat(oxford): update EESTracker with expense input, auto-calculation badge, and calculationMethod field"
```

---

## Final: Push to origin

```bash
git push origin main
```

---

## Summary of deliverables

| Task | Outcome |
|---|---|
| 1 | `payment.ts` deleted, `paymentQueries.ts` calls correct Cloud Function |
| 2 | `debug-deep-links.ts` and `DeepLinkTester.tsx` deleted |
| 3 | Oxford upgrade button unlocks features; `setOxfordEnabled` deployed |
| 4 | Stripe webhook verified/registered; `StripeSettingsScreen` TypeScript-clean |
| 5 | EES auto-calculates weekly and on roster changes |
| 6 | EESTracker has expense input and shows AUTO badge on calculated records |
