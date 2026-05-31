# P1 Renewal Reminders & Trial Rate Limiting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent revenue loss from surprise renewals (add a 30-day pre-renewal push notification) and prevent abuse of the 7-day free trial (add a per-user trial limit of 2 per year).

**Architecture:** Two independent Cloud Function additions. The renewal reminder follows the exact same pattern as `scheduledTrialReminders.ts` (query Firestore → send FCM push). The rate limiter uses a `userTrialHistory/{userId}` Firestore collection to track trial timestamps, checked inside `createGroupSubscription.ts` before the Stripe API call.

**Tech Stack:** Firebase Cloud Functions (TypeScript), Firestore, Firebase Admin SDK (FCM), Jest

---

## File Structure

| Action | File                                                         | Responsibility                                              |
| ------ | ------------------------------------------------------------ | ----------------------------------------------------------- |
| Create | `functions/src/triggers/pubsub/scheduledRenewalReminders.ts` | Daily cron: push notification 30 days before renewal        |
| Modify | `functions/src/index.ts`                                     | Export the new scheduled function                           |
| Create | `functions/src/__tests__/scheduledRenewalReminders.test.ts`  | Unit test for renewal reminder query logic                  |
| Modify | `functions/src/callable/createGroupSubscription.ts`          | Check and record trial history before creating subscription |
| Create | `functions/src/__tests__/trialRateLimit.test.ts`             | Unit test for rate-limiting logic                           |

---

### Task 1: Create 30-day pre-renewal push notification

**Files:**

- Create: `functions/src/triggers/pubsub/scheduledRenewalReminders.ts`
- Modify: `functions/src/index.ts`
- Create: `functions/src/__tests__/scheduledRenewalReminders.test.ts`

`scheduledTrialReminders.ts` is the reference implementation. This task mirrors that pattern exactly.

- [ ] **Step 1: Write the failing test**

Create `functions/src/__tests__/scheduledRenewalReminders.test.ts`:

```typescript
import * as admin from "firebase-admin";

jest.mock("firebase-admin", () => ({
  firestore: jest.fn(() => mockDb),
  messaging: jest.fn(() => mockMessaging),
  initializeApp: jest.fn(),
}));

const mockGet = jest.fn();
const mockWhere = jest.fn(() => ({ where: mockWhere, get: mockGet }));
const mockCollection = jest.fn(() => ({ where: mockWhere }));
const mockDb = { collection: mockCollection };
const mockSendEachForMulticast = jest.fn(() =>
  Promise.resolve({ successCount: 1, failureCount: 0, responses: [] }),
);
const mockMessaging = { sendEachForMulticast: mockSendEachForMulticast };

jest.mock("firebase-functions", () => ({
  pubsub: { schedule: jest.fn(() => ({ onRun: jest.fn((fn) => fn) })) },
  logger: { info: jest.fn(), error: jest.fn() },
}));

import { sendRenewalReminders } from "../triggers/pubsub/scheduledRenewalReminders";

describe("sendRenewalReminders", () => {
  beforeEach(() => jest.clearAllMocks());

  it("queries groups with subscriptionStatus active and expiresAt in 29-31 days", async () => {
    mockGet.mockResolvedValue({ docs: [] });
    await sendRenewalReminders();
    expect(mockCollection).toHaveBeenCalledWith("groups");
    expect(mockWhere).toHaveBeenCalledWith(
      "subscriptionStatus",
      "==",
      "active",
    );
  });

  it("sends FCM push to each admin FCM token found", async () => {
    const thirtyDaysFromNow = Date.now() + 30 * 24 * 60 * 60 * 1000;
    mockGet
      .mockResolvedValueOnce({
        docs: [
          {
            id: "group1",
            data: () => ({
              name: "Test Group",
              admins: ["admin1"],
              subscriptionExpiresAt: thirtyDaysFromNow,
            }),
          },
        ],
      })
      .mockResolvedValueOnce({
        data: () => ({ fcmTokens: ["token-abc"] }),
        exists: true,
      });

    await sendRenewalReminders();

    expect(mockSendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: ["token-abc"],
        notification: expect.objectContaining({
          title: expect.stringContaining("renew"),
        }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd functions && npx jest scheduledRenewalReminders --no-coverage 2>&1 | tail -20
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `scheduledRenewalReminders.ts`**

Create `functions/src/triggers/pubsub/scheduledRenewalReminders.ts`:

```typescript
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const WINDOW_DAYS = 1; // check daily; send when 30 days remain (±1 day)
const REMINDER_DAYS = 30;

export async function sendRenewalReminders(): Promise<void> {
  const db = admin.firestore();
  const now = Date.now();
  const windowStart = now + (REMINDER_DAYS - WINDOW_DAYS) * 24 * 60 * 60 * 1000;
  const windowEnd = now + (REMINDER_DAYS + WINDOW_DAYS) * 24 * 60 * 60 * 1000;

  const snapshot = await db
    .collection("groups")
    .where("subscriptionStatus", "==", "active")
    .where("subscriptionExpiresAt", ">=", windowStart)
    .where("subscriptionExpiresAt", "<=", windowEnd)
    .get();

  functions.logger.info(
    `Renewal reminders: ${snapshot.docs.length} groups in window`,
  );

  for (const doc of snapshot.docs) {
    const group = doc.data();
    const groupName: string = group.name ?? "your group";
    const adminIds: string[] = group.admins ?? [];

    for (const adminId of adminIds) {
      const userSnap = await db.collection("users").doc(adminId).get();
      if (!userSnap.exists) continue;

      const tokens: string[] = userSnap.data()?.fcmTokens ?? [];
      if (tokens.length === 0) continue;

      try {
        await admin.messaging().sendEachForMulticast({
          tokens,
          notification: {
            title: "Time to renew",
            body: `Your ${groupName} subscription renews in ${REMINDER_DAYS} days. Make sure your payment info is up to date.`,
          },
          data: { type: "RENEWAL_REMINDER", groupId: doc.id },
        });
      } catch (err) {
        functions.logger.error(`FCM send failed for admin ${adminId}`, err);
      }
    }
  }
}

export const scheduledRenewalReminders = functions.pubsub
  .schedule("0 10 * * *")
  .onRun(async () => {
    await sendRenewalReminders();
  });
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd functions && npx jest scheduledRenewalReminders --no-coverage 2>&1 | tail -10
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Export from `functions/src/index.ts`**

Add the export alongside other pubsub exports:

```typescript
export { scheduledRenewalReminders } from "./triggers/pubsub/scheduledRenewalReminders";
```

- [ ] **Step 6: Build**

```bash
cd functions && npm run build 2>&1 | grep -i error
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add functions/src/triggers/pubsub/scheduledRenewalReminders.ts \
        functions/src/__tests__/scheduledRenewalReminders.test.ts \
        functions/src/index.ts
git commit -m "feat(functions): add 30-day pre-renewal push notification cron"
```

---

### Task 2: Rate-limit free trials to 2 per user per rolling year

**Files:**

- Modify: `functions/src/callable/createGroupSubscription.ts`
- Create: `functions/src/__tests__/trialRateLimit.test.ts`

Without this, a user can create and delete groups indefinitely to chain free trials. The guard writes a timestamp to `userTrialHistory/{userId}` on each trial start and rejects new trials if 2+ timestamps exist within the past 12 months.

- [ ] **Step 1: Write the failing test**

Create `functions/src/__tests__/trialRateLimit.test.ts`:

```typescript
import * as admin from "firebase-admin";

const mockGet = jest.fn();
const mockSet = jest.fn(() => Promise.resolve());
const mockDoc = jest.fn(() => ({ get: mockGet, set: mockSet }));
const mockCollection = jest.fn(() => ({ doc: mockDoc }));

jest.mock("firebase-admin", () => ({
  firestore: jest.fn(() => ({ collection: mockCollection })),
  initializeApp: jest.fn(),
}));
// FieldValue.arrayUnion needs to be a function that returns a sentinel
(admin.firestore as any).FieldValue = {
  arrayUnion: jest.fn((...args: any[]) => ({ _arrayUnion: args })),
};

jest.mock("firebase-functions", () => ({
  https: {
    HttpsError: class HttpsError extends Error {
      constructor(
        public code: string,
        message: string,
      ) {
        super(message);
      }
    },
  },
  logger: { info: jest.fn() },
}));

import { checkAndRecordTrial } from "../callable/createGroupSubscription";

describe("checkAndRecordTrial", () => {
  const now = Date.now();
  const elevenMonthsAgo = now - 11 * 30 * 24 * 60 * 60 * 1000;
  const thirteenMonthsAgo = now - 13 * 30 * 24 * 60 * 60 * 1000;

  beforeEach(() => jest.clearAllMocks());

  it("allows first trial (no history)", async () => {
    mockGet.mockResolvedValue({ exists: false });
    await expect(checkAndRecordTrial("user1")).resolves.not.toThrow();
    expect(mockSet).toHaveBeenCalled();
  });

  it("allows second trial when only one recent trial exists", async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({ trials: [elevenMonthsAgo] }),
    });
    await expect(checkAndRecordTrial("user1")).resolves.not.toThrow();
  });

  it("blocks third trial when two recent trials exist", async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({ trials: [elevenMonthsAgo, elevenMonthsAgo - 1000] }),
    });
    await expect(checkAndRecordTrial("user1")).rejects.toThrow(
      /Maximum of 2 free trials/,
    );
  });

  it("ignores trials older than 12 months", async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({ trials: [thirteenMonthsAgo, thirteenMonthsAgo - 1000] }),
    });
    await expect(checkAndRecordTrial("user1")).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd functions && npx jest trialRateLimit --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `checkAndRecordTrial` is not exported yet.

- [ ] **Step 3: Implement `checkAndRecordTrial` in `createGroupSubscription.ts`**

Add the following exported helper at the top of the module body (after imports) in `functions/src/callable/createGroupSubscription.ts`:

```typescript
import { https, logger } from "firebase-functions";

const MAX_TRIALS_PER_YEAR = 2;
const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Checks whether the user has exceeded the free-trial limit (2/year).
 * Throws HttpsError if limit is reached. Records the new trial on success.
 */
export async function checkAndRecordTrial(userId: string): Promise<void> {
  const db = admin.firestore();
  const ref = db.collection("userTrialHistory").doc(userId);
  const snap = await ref.get();
  const now = Date.now();
  const cutoff = now - TWELVE_MONTHS_MS;

  const recentTrials: number[] = snap.exists
    ? (snap.data()?.trials ?? []).filter((t: number) => t > cutoff)
    : [];

  if (recentTrials.length >= MAX_TRIALS_PER_YEAR) {
    throw new https.HttpsError(
      "resource-exhausted",
      "Maximum of 2 free trials per year reached. Please subscribe to continue.",
    );
  }

  await ref.set(
    { trials: admin.firestore.FieldValue.arrayUnion(now) },
    { merge: true },
  );
  logger.info(
    `Trial recorded for user ${userId}. Recent trials: ${recentTrials.length + 1}`,
  );
}
```

Then call it inside the main callable handler, before the Stripe subscription creation:

```typescript
// Inside the exported callable handler, before stripe.subscriptions.create:
await checkAndRecordTrial(request.auth!.uid);
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd functions && npx jest trialRateLimit --no-coverage 2>&1 | tail -10
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Run full functions test suite**

```bash
cd functions && npm test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 6: Build**

```bash
cd functions && npm run build 2>&1 | grep -i error
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add functions/src/callable/createGroupSubscription.ts \
        functions/src/__tests__/trialRateLimit.test.ts
git commit -m "feat(functions): rate-limit free trials to 2 per user per rolling year"
```

---

## Self-Review

**Spec coverage:**

- ✓ Task 1 — 30-day pre-renewal push notification, daily cron at 10:00, mirrors trial reminder pattern
- ✓ Task 2 — Trial rate limiting with `userTrialHistory` Firestore collection, 2-per-year rolling window

**Placeholder scan:** No TBD/TODO in any code block. All collection names, field names, and function names are explicit.

**Type consistency:** `checkAndRecordTrial(userId: string): Promise<void>` used consistently in the test (step 1) and implementation (step 3). `trials: number[]` is the field type throughout.
