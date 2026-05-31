# P1 Code Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three P1 security and reliability issues: sponsorship authorization bypass, missing Stripe cancellation on account delete, and a daily reconciler for missed Stripe webhooks.

**Architecture:** Each task is a self-contained change to an existing callable or pubsub function. No new collections, no schema changes. The reconciler is a new pubsub trigger following the exact pattern of `scheduledRenewalReminders.ts`.

**Tech Stack:** Firebase Cloud Functions v1/v2, Firebase Admin SDK, Stripe SDK (already configured in `functions/src/utils/stripe.ts`), Jest with manual mocks

---

## File Map

| Action | File                                                               |
| ------ | ------------------------------------------------------------------ |
| Modify | `functions/src/callable/grantSponsorStepAccess.ts`                 |
| Modify | `functions/src/tests/grantSponsorStepAccess.test.ts`               |
| Modify | `functions/src/callable/deleteUserAccount.ts`                      |
| Create | `functions/src/triggers/pubsub/scheduledSubscriptionReconciler.ts` |
| Create | `functions/src/tests/scheduledSubscriptionReconciler.test.ts`      |
| Modify | `functions/src/index.ts` (add one export line)                     |

---

## Task 1: SEC-H5 — Verify active sponsorship in `grantSponsorStepAccess`

**Problem:** Any authenticated user can pass any `sponsorId` to gain or revoke access to another user's step progress, regardless of whether an actual sponsorship relationship exists.

**Fix:** Before updating the `stepProgress` document, query `sponsorships` to confirm an active relationship between the caller (sponsee) and the supplied `sponsorId`.

**Files:**

- Modify: `functions/src/callable/grantSponsorStepAccess.ts`
- Modify: `functions/src/tests/grantSponsorStepAccess.test.ts`

- [ ] **Step 1: Write the failing tests**

Open `functions/src/tests/grantSponsorStepAccess.test.ts`. Add `where` and `limit` to the Firestore mock (both mock sites), then add two new test cases and update the existing passing tests to include the sponsorship mock in their `mockGet` sequences.

```typescript
// --- MOCK UPDATES (both places in the file where firestoreMock is defined) ---
// Add to the firestoreMock objects:
//   where: jest.fn().mockReturnThis(),
//   limit: jest.fn().mockReturnThis(),

// --- NEW TEST 1 ---
it("throws permission-denied when no active sponsorship relationship exists", async () => {
  // sponsorship query returns empty
  mockGet.mockResolvedValueOnce({ empty: true, docs: [] });

  const request = makeRequest(CALLER_UID, {
    sponsorId: SPONSOR_UID,
    allow: true,
  });

  await expect(grantSponsorStepAccessHandler(request)).rejects.toMatchObject({
    code: "permission-denied",
    message: expect.stringContaining("No active sponsorship"),
  });
});

// --- NEW TEST 2 ---
it("throws permission-denied when sponsorship exists but is not active", async () => {
  // sponsorship query returns empty (wrong status filtered out by query)
  mockGet.mockResolvedValueOnce({ empty: true, docs: [] });

  const request = makeRequest(CALLER_UID, {
    sponsorId: SPONSOR_UID,
    allow: false,
  });

  await expect(grantSponsorStepAccessHandler(request)).rejects.toMatchObject({
    code: "permission-denied",
  });
});

// --- EXISTING TEST UPDATES ---
// All existing tests that call mockGet must prepend a sponsorship mock:
//   mockGet.mockResolvedValueOnce({ empty: false, docs: [{}] }); // active sponsorship
// before their first existing mockResolvedValueOnce call.
```

Full updated mock block (replace the two `firestoreMock` objects in both `jest.mock("firebase-admin", ...)` and `jest.mock("../utils/firebase", ...)`):

```typescript
const firestoreMock = {
  collection: jest.fn().mockReturnThis(),
  doc: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  get: mockGet,
  set: mockSet,
};
```

Full updated existing test `"throws not-found when sponsee has no step progress document"`:

```typescript
it("throws not-found when sponsee has no step progress document", async () => {
  mockGet
    .mockResolvedValueOnce({ empty: false, docs: [{}] }) // active sponsorship
    .mockResolvedValueOnce({ exists: false }); // stepProgress/current missing

  const request = makeRequest(CALLER_UID, {
    sponsorId: SPONSOR_UID,
    allow: true,
  });

  await expect(grantSponsorStepAccessHandler(request)).rejects.toMatchObject({
    code: "not-found",
  });
});
```

Full updated existing test `"updates stepProgress doc with allow=true and sends notification"`:

```typescript
it("updates stepProgress doc with allow=true and sends notification", async () => {
  const callerDoc = { exists: true, data: () => ({ displayName: "Alice" }) };
  const sponsorDoc = {
    exists: true,
    data: () => ({ displayName: "Bob", fcmTokens: ["token-abc"] }),
  };

  mockGet
    .mockResolvedValueOnce({ empty: false, docs: [{}] }) // active sponsorship
    .mockResolvedValueOnce({ exists: true }) // stepProgress/current
    .mockResolvedValueOnce(callerDoc) // users/{callerId}
    .mockResolvedValueOnce(sponsorDoc); // users/{sponsorId}

  mockSet.mockResolvedValue(undefined);
  mockSend.mockResolvedValue("message-id-001");

  const request = makeRequest(CALLER_UID, {
    sponsorId: SPONSOR_UID,
    allow: true,
  });
  const result = await grantSponsorStepAccessHandler(request);

  expect(result).toMatchObject({ success: true });
  expect(mockSet).toHaveBeenCalledTimes(1);
  const writePayload = mockSet.mock.calls[0][0];
  expect(writePayload).toMatchObject({
    sponsorId: SPONSOR_UID,
    allowSponsorAccess: true,
  });
});
```

Full updated existing test `"updates stepProgress doc with allow=false and does NOT send notification"`:

```typescript
it("updates stepProgress doc with allow=false and does NOT send notification", async () => {
  mockGet
    .mockResolvedValueOnce({ empty: false, docs: [{}] }) // active sponsorship
    .mockResolvedValueOnce({ exists: true }); // stepProgress/current

  mockSet.mockResolvedValue(undefined);

  const request = makeRequest(CALLER_UID, {
    sponsorId: SPONSOR_UID,
    allow: false,
  });
  const result = await grantSponsorStepAccessHandler(request);

  expect(result).toMatchObject({ success: true });
  expect(mockSet).toHaveBeenCalledTimes(1);
  const writePayload = mockSet.mock.calls[0][0];
  expect(writePayload).toMatchObject({
    sponsorId: SPONSOR_UID,
    allowSponsorAccess: false,
  });
  expect(mockSend).not.toHaveBeenCalled();
});
```

Full updated existing test `"still succeeds when sponsor has no FCM tokens"`:

```typescript
it("still succeeds when sponsor has no FCM tokens (no notification sent)", async () => {
  const callerDoc = { exists: true, data: () => ({ displayName: "Alice" }) };
  const sponsorDocNoTokens = {
    exists: true,
    data: () => ({ displayName: "Bob", fcmTokens: [] }),
  };

  mockGet
    .mockResolvedValueOnce({ empty: false, docs: [{}] }) // active sponsorship
    .mockResolvedValueOnce({ exists: true }) // stepProgress/current
    .mockResolvedValueOnce(callerDoc)
    .mockResolvedValueOnce(sponsorDocNoTokens);

  mockSet.mockResolvedValue(undefined);

  const request = makeRequest(CALLER_UID, {
    sponsorId: SPONSOR_UID,
    allow: true,
  });
  const result = await grantSponsorStepAccessHandler(request);

  expect(result).toMatchObject({ success: true });
  expect(mockSend).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the test file to confirm failures**

```bash
cd functions && npx jest src/tests/grantSponsorStepAccess.test.ts --no-coverage
```

Expected: new permission-denied tests FAIL (function doesn't check sponsorship yet), existing tests may fail due to mock sequence mismatch.

- [ ] **Step 3: Implement the sponsorship check in `grantSponsorStepAccess.ts`**

Open `functions/src/callable/grantSponsorStepAccess.ts`. After the `sponsorId` validation (line ~33) and before the `stepProgress` fetch, insert:

```typescript
// Verify an active sponsorship relationship exists before allowing access changes
const sponsorshipSnap = await db
  .collection("sponsorships")
  .where("sponseeId", "==", uid)
  .where("sponsorId", "==", sponsorId)
  .where("status", "==", "active")
  .limit(1)
  .get();

if (sponsorshipSnap.empty) {
  throw new HttpsError(
    "permission-denied",
    "No active sponsorship relationship found.",
  );
}
```

The full function body after this change (for the section between sponsorId check and progressRef):

```typescript
if (!sponsorId) {
  throw new HttpsError("invalid-argument", "sponsorId is required.");
}

// Verify an active sponsorship relationship exists before allowing access changes
const sponsorshipSnap = await db
  .collection("sponsorships")
  .where("sponseeId", "==", uid)
  .where("sponsorId", "==", sponsorId)
  .where("status", "==", "active")
  .limit(1)
  .get();

if (sponsorshipSnap.empty) {
  throw new HttpsError(
    "permission-denied",
    "No active sponsorship relationship found.",
  );
}

// Verify the caller has a stepProgress document
const progressRef = db
  .collection("users")
  .doc(uid)
  .collection("stepProgress")
  .doc("current");
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
cd functions && npx jest src/tests/grantSponsorStepAccess.test.ts --no-coverage
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/callable/grantSponsorStepAccess.ts functions/src/tests/grantSponsorStepAccess.test.ts
git commit -m "fix(functions): verify active sponsorship before granting step access"
```

---

## Task 2: CQ-M4 — Cancel Stripe subscription in `deleteUserAccount`

**Problem:** When a sole group admin deletes their account, the function removes them from Firestore and deletes their Auth account, but leaves the Stripe subscription active. This means Homegroups continues to bill (or the group is left in a broken state with an active subscription and no admin).

**Fix:** Before deleting the Auth account, identify groups where the user is the sole admin with an active or trialing Stripe subscription, and cancel those subscriptions.

**Files:**

- Modify: `functions/src/callable/deleteUserAccount.ts`

- [ ] **Step 1: Add the Stripe import**

In `deleteUserAccount.ts`, add `stripe` to the existing imports (after the existing imports at the top of the file):

```typescript
import { stripe } from "../utils/stripe";
```

- [ ] **Step 2: Write the Stripe cancellation block**

In `deleteUserAccount.ts`, locate the comment `// 10. Remove from admin/treasurer arrays in groups` (around line 244). The `adminGroupsQuery` is already fetched at line ~249.

Replace the entire step 10 block (from `// 10. Remove from admin/treasurer arrays...` through the logger.info for removed roles) with:

```typescript
// 10. Cancel Stripe subscriptions for groups where user is sole admin
//     then remove from admin/treasurer arrays
const adminGroupsQuery = await db
  .collection("groups")
  .where("admins", "array-contains", userId)
  .get();

for (const groupDoc of adminGroupsQuery.docs) {
  const groupData = groupDoc.data();
  const admins: string[] = groupData.admins ?? [];
  const subscriptionId: string | null = groupData.stripeSubscriptionId ?? null;
  const subStatus: string = groupData.subscriptionStatus ?? "";

  if (
    admins.length === 1 &&
    subscriptionId &&
    (subStatus === "active" || subStatus === "trialing")
  ) {
    try {
      await stripe.subscriptions.cancel(subscriptionId);
      functions.logger.info(
        `Cancelled Stripe subscription ${subscriptionId} for sole-admin group ${groupDoc.id}`,
      );
    } catch (stripeError: any) {
      functions.logger.warn(
        `Could not cancel Stripe subscription ${subscriptionId} for group ${groupDoc.id}: ${stripeError.message}`,
      );
    }
  }

  await groupDoc.ref.update({
    admins: admin.firestore.FieldValue.arrayRemove(userId),
  });
}

const treasurerGroupsQuery = await db
  .collection("groups")
  .where("treasurers", "array-contains", userId)
  .get();

for (const groupDoc of treasurerGroupsQuery.docs) {
  await groupDoc.ref.update({
    treasurers: admin.firestore.FieldValue.arrayRemove(userId),
  });
}

functions.logger.info(
  `Removed user from ${adminGroupsQuery.size} admin roles and ${treasurerGroupsQuery.size} treasurer roles`,
);
```

- [ ] **Step 3: Build to confirm no TypeScript errors**

```bash
cd functions && npm run build
```

Expected: exits 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add functions/src/callable/deleteUserAccount.ts
git commit -m "fix(functions): cancel Stripe subscription when sole admin deletes account"
```

---

## Task 3: AR-H5 — Daily subscription reconciler

**Problem:** Stripe webhooks can be missed (network errors, function cold starts, Stripe retries expiring). When a webhook is dropped, Firestore shows `subscriptionStatus: "trialing"` or `"active"` for a group whose subscription has actually expired. Admins see phantom active status; billing is already stopped but the app still grants paid features.

**Fix:** A daily cron that queries groups with a non-canceled subscription status AND an `subscriptionExpiresAt` in the past, then fetches the real status from Stripe and syncs it back.

**Files:**

- Create: `functions/src/triggers/pubsub/scheduledSubscriptionReconciler.ts`
- Create: `functions/src/tests/scheduledSubscriptionReconciler.test.ts`
- Modify: `functions/src/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `functions/src/tests/scheduledSubscriptionReconciler.test.ts`:

```typescript
/**
 * Tests for scheduledSubscriptionReconciler Cloud Function
 *
 * Run with:
 *   cd functions && npx jest src/tests/scheduledSubscriptionReconciler.test.ts --no-coverage
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockStripeSubscriptionsRetrieve = jest.fn();
const mockUpdate = jest.fn();

const mockDb: any = {
  collection: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  get: jest.fn(),
};

jest.mock("firebase-admin", () => ({
  apps: [{ name: "[DEFAULT]" }],
  initializeApp: jest.fn(),
  firestore: Object.assign(
    jest.fn(() => mockDb),
    {
      Timestamp: {
        now: jest.fn(() => ({ toMillis: () => Date.now() })),
        fromMillis: jest.fn((ms: number) => ({ _ms: ms })),
      },
      FieldValue: {
        serverTimestamp: jest.fn(() => "SERVER_TS"),
      },
    },
  ),
}));

jest.mock("firebase-functions/v1", () => ({
  pubsub: {
    schedule: jest.fn(() => ({
      timeZone: jest.fn(() => ({
        onRun: (handler: any) => handler,
      })),
    })),
  },
}));

jest.mock("firebase-functions", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock("../utils/stripe", () => ({
  stripe: {
    subscriptions: {
      retrieve: mockStripeSubscriptionsRetrieve,
    },
  },
}));

import { reconcileSubscriptions } from "../triggers/pubsub/scheduledSubscriptionReconciler";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("reconcileSubscriptions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does nothing when no groups have expired subscriptions", async () => {
    mockDb.get.mockResolvedValueOnce({ docs: [] });

    await reconcileSubscriptions();

    expect(mockStripeSubscriptionsRetrieve).not.toHaveBeenCalled();
  });

  it("marks group as canceled when stripeSubscriptionId is null", async () => {
    const groupRef = { update: mockUpdate };
    mockDb.get.mockResolvedValueOnce({
      docs: [
        {
          id: "group-1",
          ref: groupRef,
          data: () => ({
            subscriptionStatus: "trialing",
            stripeSubscriptionId: null,
          }),
        },
      ],
    });

    await reconcileSubscriptions();

    expect(mockStripeSubscriptionsRetrieve).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionStatus: "canceled" }),
    );
  });

  it("syncs group status when Stripe returns a different status", async () => {
    const groupRef = { update: mockUpdate };
    mockDb.get.mockResolvedValueOnce({
      docs: [
        {
          id: "group-2",
          ref: groupRef,
          data: () => ({
            subscriptionStatus: "trialing",
            stripeSubscriptionId: "sub_abc123",
          }),
        },
      ],
    });

    mockStripeSubscriptionsRetrieve.mockResolvedValueOnce({
      status: "canceled",
      current_period_end: 1700000000,
    });

    await reconcileSubscriptions();

    expect(mockStripeSubscriptionsRetrieve).toHaveBeenCalledWith("sub_abc123");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionStatus: "canceled" }),
    );
  });

  it("does not update when Stripe status matches Firestore status", async () => {
    const groupRef = { update: mockUpdate };
    mockDb.get.mockResolvedValueOnce({
      docs: [
        {
          id: "group-3",
          ref: groupRef,
          data: () => ({
            subscriptionStatus: "active",
            stripeSubscriptionId: "sub_xyz789",
          }),
        },
      ],
    });

    mockStripeSubscriptionsRetrieve.mockResolvedValueOnce({
      status: "active",
      current_period_end: 1800000000,
    });

    await reconcileSubscriptions();

    expect(mockStripeSubscriptionsRetrieve).toHaveBeenCalledWith("sub_xyz789");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("logs a warning and continues when Stripe API call fails for one group", async () => {
    const groupRef = { update: mockUpdate };
    mockDb.get.mockResolvedValueOnce({
      docs: [
        {
          id: "group-4",
          ref: groupRef,
          data: () => ({
            subscriptionStatus: "trialing",
            stripeSubscriptionId: "sub_fail",
          }),
        },
      ],
    });

    mockStripeSubscriptionsRetrieve.mockRejectedValueOnce(
      new Error("No such subscription"),
    );

    await expect(reconcileSubscriptions()).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd functions && npx jest src/tests/scheduledSubscriptionReconciler.test.ts --no-coverage
```

Expected: all 5 tests FAIL with "Cannot find module `../triggers/pubsub/scheduledSubscriptionReconciler`".

- [ ] **Step 3: Create the reconciler function**

Create `functions/src/triggers/pubsub/scheduledSubscriptionReconciler.ts`:

```typescript
import * as functions from "firebase-functions";
import * as functionsV1 from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { stripe } from "../../utils/stripe";

export async function reconcileSubscriptions(): Promise<void> {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();

  try {
    const snapshot = await db
      .collection("groups")
      .where("subscriptionStatus", "in", ["trialing", "active"])
      .where("subscriptionExpiresAt", "<", now)
      .get();

    functions.logger.info(
      `Reconciler: ${snapshot.docs.length} expired groups to check`,
    );

    for (const doc of snapshot.docs) {
      const group = doc.data();
      const stripeSubscriptionId: string | null =
        group.stripeSubscriptionId ?? null;

      if (!stripeSubscriptionId) {
        await doc.ref.update({
          subscriptionStatus: "canceled",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        functions.logger.info(
          `Reconciler: group ${doc.id} has no subscription ID, marked canceled`,
        );
        continue;
      }

      try {
        const subscription =
          await stripe.subscriptions.retrieve(stripeSubscriptionId);

        if (subscription.status !== group.subscriptionStatus) {
          await doc.ref.update({
            subscriptionStatus: subscription.status,
            subscriptionExpiresAt: (subscription as any).current_period_end
              ? admin.firestore.Timestamp.fromMillis(
                  (subscription as any).current_period_end * 1000,
                )
              : null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          functions.logger.info(
            `Reconciler: group ${doc.id} synced ${group.subscriptionStatus} → ${subscription.status}`,
          );
        }
      } catch (stripeError: any) {
        functions.logger.error(
          `Reconciler: Stripe fetch failed for ${stripeSubscriptionId}`,
          stripeError,
        );
      }
    }
  } catch (err) {
    functions.logger.error("reconcileSubscriptions failed", err);
  }
}

export const scheduledSubscriptionReconciler = functionsV1.pubsub
  .schedule("0 2 * * *")
  .timeZone("UTC")
  .onRun(async () => {
    await reconcileSubscriptions();
  });
```

- [ ] **Step 4: Export from `index.ts`**

Open `functions/src/index.ts`. Add the export immediately after the `scheduledRenewalReminders` export line:

```typescript
export { scheduledSubscriptionReconciler } from "./triggers/pubsub/scheduledSubscriptionReconciler";
```

- [ ] **Step 5: Run the tests to confirm they pass**

```bash
cd functions && npx jest src/tests/scheduledSubscriptionReconciler.test.ts --no-coverage
```

Expected: All 5 tests PASS.

- [ ] **Step 6: Build to confirm no TypeScript errors**

```bash
cd functions && npm run build
```

Expected: exits 0.

- [ ] **Step 7: Run the full test suite to confirm no regressions**

```bash
cd functions && npm test
```

Expected: All suites except `security-rules` pass (security-rules requires Firebase emulator and is expected to skip in CI).

- [ ] **Step 8: Commit**

```bash
git add functions/src/triggers/pubsub/scheduledSubscriptionReconciler.ts \
        functions/src/tests/scheduledSubscriptionReconciler.test.ts \
        functions/src/index.ts
git commit -m "feat(functions): add daily subscription reconciler for missed Stripe webhooks"
```

---

## Self-Review

**Spec coverage:**

- SEC-H5: Task 1 adds `sponsorships` query before allowing access grant — covered
- CQ-M4: Task 2 adds Stripe cancellation before auth deletion for sole-admin groups — covered
- AR-H5: Task 3 adds daily reconciler that syncs stale Firestore status from Stripe — covered

**No placeholders:** All steps include exact code, exact commands, and expected output.

**Type consistency:**

- `reconcileSubscriptions()` returns `Promise<void>` — consistent across test import and function export
- `stripe.subscriptions.cancel(subscriptionId)` in Task 2 and `stripe.subscriptions.retrieve(stripeSubscriptionId)` in Task 3 match the Stripe SDK API
- `admin.firestore.FieldValue.arrayRemove(userId)` in Task 2 matches the existing pattern in `deleteUserAccount.ts` line 101
