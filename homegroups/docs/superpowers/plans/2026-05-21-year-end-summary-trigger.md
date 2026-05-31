# Year-End Summary Push Notification Trigger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every November 1st, send a push notification to all admin users of groups that have been active subscribers for at least 10 months, prompting them to review their year-end treasury summary before the December business meeting.

**Architecture:** A new pub/sub scheduled Cloud Function (`scheduledYearEndSummary`) that runs on November 1 each year. It queries groups with `subscriptionStatus` in `["active", "trialing"]` that were created before February 1 of the current year (meaning 10+ months of potential data). For each qualifying group, it fetches admin FCM tokens and sends a notification via `sendEachForMulticast`. Follows the identical pattern used by `scheduledRenewalReminders.ts`.

**Tech Stack:** Firebase Cloud Functions v1 pubsub, Firebase Admin Messaging (FCM), Firestore, Jest.

---

## File Structure

| File                                                       | Action | Responsibility                                |
| ---------------------------------------------------------- | ------ | --------------------------------------------- |
| `functions/src/triggers/pubsub/scheduledYearEndSummary.ts` | Create | Scheduled function, Firestore query, FCM send |
| `functions/src/tests/scheduledYearEndSummary.test.ts`      | Create | Unit tests                                    |
| `functions/src/index.ts`                                   | Modify | Export new scheduled function                 |

---

### Task 1: Write failing tests

**Files:**

- Create: `functions/src/tests/scheduledYearEndSummary.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
// functions/src/tests/scheduledYearEndSummary.test.ts
const mockSendEach = jest.fn();
const mockMessagingGet = jest.fn();
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
        fromDate: jest.fn((d: Date) => ({ _date: d })),
      },
    },
  ),
  messaging: jest.fn(() => ({ sendEachForMulticast: mockSendEach })),
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
  logger: { info: jest.fn(), error: jest.fn() },
}));

import { sendYearEndSummaries } from "../triggers/pubsub/scheduledYearEndSummary";

describe("sendYearEndSummaries", () => {
  beforeEach(() => jest.clearAllMocks());

  it("does nothing when no qualifying groups", async () => {
    mockDb.get.mockResolvedValueOnce({ docs: [] });
    await sendYearEndSummaries();
    expect(mockSendEach).not.toHaveBeenCalled();
  });

  it("skips group when admin list is empty", async () => {
    mockDb.get.mockResolvedValueOnce({
      docs: [
        {
          id: "group-1",
          data: () => ({ name: "Sunday Group", admins: [] }),
        },
      ],
    });
    await sendYearEndSummaries();
    expect(mockSendEach).not.toHaveBeenCalled();
  });

  it("skips admin user when they have no FCM tokens", async () => {
    mockDb.get
      .mockResolvedValueOnce({
        docs: [
          {
            id: "group-1",
            data: () => ({ name: "Sunday Group", admins: ["admin-1"] }),
          },
        ],
      })
      .mockResolvedValueOnce({ exists: true, data: () => ({ fcmTokens: [] }) });
    await sendYearEndSummaries();
    expect(mockSendEach).not.toHaveBeenCalled();
  });

  it("sends FCM notification to admin with tokens", async () => {
    mockDb.get
      .mockResolvedValueOnce({
        docs: [
          {
            id: "group-1",
            data: () => ({
              name: "Sunday Group",
              admins: ["admin-1"],
            }),
          },
        ],
      })
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({ fcmTokens: ["token-abc"] }),
      });
    mockSendEach.mockResolvedValueOnce({ successCount: 1, failureCount: 0 });

    await sendYearEndSummaries();

    expect(mockSendEach).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: ["token-abc"],
        notification: expect.objectContaining({
          title: expect.stringContaining("Sunday Group"),
        }),
        data: expect.objectContaining({
          type: "YEAR_END_SUMMARY",
          groupId: "group-1",
        }),
      }),
    );
  });

  it("continues processing other groups when one admin FCM send fails", async () => {
    mockDb.get
      .mockResolvedValueOnce({
        docs: [
          { id: "g1", data: () => ({ name: "G1", admins: ["a1"] }) },
          { id: "g2", data: () => ({ name: "G2", admins: ["a2"] }) },
        ],
      })
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({ fcmTokens: ["token-1"] }),
      })
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({ fcmTokens: ["token-2"] }),
      });

    mockSendEach
      .mockRejectedValueOnce(new Error("FCM error"))
      .mockResolvedValueOnce({ successCount: 1, failureCount: 0 });

    await expect(sendYearEndSummaries()).resolves.not.toThrow();
    expect(mockSendEach).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
cd functions && npx jest src/tests/scheduledYearEndSummary.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../triggers/pubsub/scheduledYearEndSummary'`

---

### Task 2: Implement the scheduled function

**Files:**

- Create: `functions/src/triggers/pubsub/scheduledYearEndSummary.ts`

- [ ] **Step 3: Create the function**

```typescript
// functions/src/triggers/pubsub/scheduledYearEndSummary.ts
import * as functions from "firebase-functions";
import * as functionsV1 from "firebase-functions/v1";
import * as admin from "firebase-admin";

// Groups created before this date have had 10+ months to accumulate treasury data.
// Recomputed at runtime so the cutoff is always relative to the current year.
function tenMonthCutoff(): admin.firestore.Timestamp {
  const now = new Date();
  // Feb 1 of the current year = 10 months before Dec 1
  const cutoff = new Date(now.getFullYear(), 1, 1); // Jan is 0, Feb is 1
  return admin.firestore.Timestamp.fromDate(cutoff);
}

export async function sendYearEndSummaries(): Promise<void> {
  const db = admin.firestore();
  const cutoff = tenMonthCutoff();
  const currentYear = new Date().getFullYear();

  const snapshot = await db
    .collection("groups")
    .where("subscriptionStatus", "in", ["active", "trialing"])
    .where("createdAt", "<=", cutoff)
    .get();

  functions.logger.info(
    `Year-end summary: ${snapshot.docs.length} qualifying groups`,
  );

  for (const doc of snapshot.docs) {
    const group = doc.data();
    const groupName: string = group.name ?? "your group";
    const adminIds: string[] = group.admins ?? [];

    const userSnaps = await Promise.all(
      adminIds.map((uid) => db.collection("users").doc(uid).get()),
    );

    for (const userSnap of userSnaps) {
      if (!userSnap.exists) continue;
      const tokens: string[] = userSnap.data()?.fcmTokens ?? [];
      if (tokens.length === 0) continue;

      try {
        await admin.messaging().sendEachForMulticast({
          tokens,
          notification: {
            title: `${groupName}: Year-End Summary Ready`,
            body: `Your ${currentYear} treasury summary is ready. Review it now for your December business meeting.`,
          },
          data: {
            type: "YEAR_END_SUMMARY",
            groupId: doc.id,
            summaryYear: String(currentYear),
          },
          apns: {
            payload: {
              aps: { sound: "default", "interruption-level": "active" },
            },
          },
          android: {
            priority: "high",
            notification: { sound: "default" },
          },
        });
      } catch (err) {
        functions.logger.error(
          `Year-end FCM send failed for group ${doc.id}`,
          err,
        );
      }
    }
  }
}

// Runs November 1st at 10:00 AM UTC every year
export const scheduledYearEndSummary = functionsV1.pubsub
  .schedule("0 10 1 11 *")
  .timeZone("UTC")
  .onRun(async () => {
    await sendYearEndSummaries();
  });
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd functions && npx jest src/tests/scheduledYearEndSummary.test.ts --no-coverage
```

Expected: PASS — 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add functions/src/triggers/pubsub/scheduledYearEndSummary.ts functions/src/tests/scheduledYearEndSummary.test.ts
git commit -m "feat: add scheduledYearEndSummary FCM trigger for November treasury reminder"
```

---

### Task 3: Export and verify build

**Files:**

- Modify: `functions/src/index.ts`

- [ ] **Step 6: Add export to index.ts**

Find the pub/sub scheduled functions section (around line 123). Add:

```typescript
export { scheduledYearEndSummary } from "./triggers/pubsub/scheduledYearEndSummary";
```

Place it near the other scheduled reminder exports:

```typescript
export { scheduledTrialReminders } from "./triggers/pubsub/scheduledTrialReminders";
export { scheduledRenewalReminders } from "./triggers/pubsub/scheduledRenewalReminders";
export { scheduledYearEndSummary } from "./triggers/pubsub/scheduledYearEndSummary"; // add here
```

- [ ] **Step 7: Build**

```bash
cd functions && npm run build
```

Expected: clean.

- [ ] **Step 8: Run full test suite**

```bash
cd functions && npm test -- --no-coverage
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add functions/src/index.ts
git commit -m "feat: export scheduledYearEndSummary"
```

---

## Acceptance Criteria

- [ ] Function is scheduled for `0 10 1 11 *` (November 1, 10:00 UTC)
- [ ] Only groups with `subscriptionStatus` in `["active", "trialing"]` AND `createdAt` before Feb 1 of the current year receive notifications
- [ ] FCM failure for one group does not prevent others from being notified
- [ ] Notification data includes `type: "YEAR_END_SUMMARY"`, `groupId`, and `summaryYear`
- [ ] 5 unit tests pass
- [ ] `npm run build` clean
