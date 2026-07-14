# Homegroups Wave 1 (P0 Critical) Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the 12 code-fixable P0 Critical findings from the 2026-07-07 comprehensive review (`.full-review/05-final-report.md`) of `homegroups/mobile` and `homegroups/functions`. This is Wave 1 of a wave-by-wave remediation plan; P1/P2/P3 findings are out of scope here and will be planned separately after this wave lands.

**Architecture:** No new services. Twelve independent, mostly single-file fixes: two Firestore-trigger idempotency hardenings, one fan-out batching fix, three callable security fixes, one PII-logging cleanup sweep, one cron-job index/reliability fix, one resource-sizing addition, one Redux store-registration fix, one listener-leak fix, one write/listener amplification fix, and one CI-safety-net addition.

**Tech Stack:** Firebase Cloud Functions v1/v2 (TypeScript, Node 22), Jest + ts-jest, React Native 0.72 + Redux Toolkit, GitHub Actions.

## Global Constraints

- All paths relative to `/Users/marcusklein/dev/recovery-platform/homegroups/` unless stated otherwise.
- No new npm dependencies for any task.
- Functions: client-facing errors use `HttpsError` from `firebase-functions/v2/https`; server-side logs use `firebase-functions/logger` (`logger.info`/`.warn`/`.error`), never `console.log`/`console.error`, per this repo's own coding rule and the pattern already used in `getPublicGroupProfile.ts`.
- No PII (email addresses, display names, precise geolocation) in any log line, per the root `CLAUDE.md` cross-cutting rule — this is the explicit subject of Task 6.
- Preserve each file's existing test-mocking conventions (module-scope `jest.fn()` instances referenced from `jest.mock(...)` factories) exactly as already established in that file — do not introduce a new mocking style.
- Every task must leave `npx tsc --noEmit` clean and the full existing test suite green (functions: `npm test -- --passWithNoTests --forceExit`; mobile: `npm test`) in addition to its own new/changed tests.
- Money/counter logic (Task 1) must remain within Firestore's transaction constraints: all reads before all writes inside `db.runTransaction(...)`.

---

## File Structure

| File                                                           | Task | Change                                                                                                  |
| -------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------- |
| `functions/src/triggers/firestore/onTransactionWrite.ts`       | 1    | Lock-claim + increment converted to one atomic `db.runTransaction`                                      |
| `functions/src/__tests__/onTransactionWrite.test.ts`           | 1    | D-5 idempotency tests adapted to the transaction model                                                  |
| `functions/src/triggers/firestore/onMilestoneWrite.ts`         | 1    | Same atomic-transaction fix                                                                             |
| `functions/src/__tests__/onMilestoneWrite.test.ts`             | 1    | D-6 idempotency tests adapted                                                                           |
| `functions/src/triggers/firestore/onMemberCreate.ts`           | 2    | Batch the per-member user-doc fan-out using `onMeetingInstanceUpdate.ts`'s pattern                      |
| `functions/src/__tests__/onMemberCreate.test.ts` (new)         | 2    | New test file                                                                                           |
| `functions/src/callable/sendMentionNotifications.ts`           | 3    | Require caller group membership; derive sender identity from `request.auth`                             |
| `functions/src/__tests__/sendMentionNotifications.test.ts`     | 3    | New tests for membership gating and server-derived identity                                             |
| `functions/src/callable/searchGroupsByLocation.ts`             | 4    | Field allow-list + `publicProfileEnabled` filter                                                        |
| `functions/src/__tests__/searchGroupsByLocation.test.ts`       | 4    | New tests for field leakage and opt-out                                                                 |
| `functions/src/callable/deleteUserAccount.ts`                  | 5    | Report partial failure instead of unconditional success                                                 |
| `functions/src/__tests__/deleteUserAccount.test.ts`            | 5    | New Auth-deletion-failure test                                                                          |
| `functions/src/utils/email.ts`                                 | 6    | Remove email address from log line                                                                      |
| `functions/src/triggers/auth/onUserCreated.ts`                 | 6    | Remove email domain from log line                                                                       |
| `functions/src/triggers/pubsub/scheduledMilestoneCheck.ts`     | 6    | Remove display name from 2 log lines                                                                    |
| `functions/src/triggers/pubsub/scheduledMilestoneReminders.ts` | 6    | Remove display name from log line                                                                       |
| `functions/src/callable/findMeetings.ts`                       | 6    | Remove location from 2 log lines                                                                        |
| `functions/src/triggers/pubsub/scheduledPositionReminders.ts`  | 7    | (no code change — index fix only, verified via this file's existing try/catch)                          |
| `functions/src/triggers/pubsub/scheduledMeetingReminders.ts`   | 7    | Add outer try/catch matching `scheduledPositionReminders.ts`'s pattern                                  |
| `functions/firestore.indexes.json`                             | 7    | Add missing `servicePositions` collection-group index; add corrected `meetingInstances` composite index |
| `functions/src/triggers/pubsub/scheduledGroupBackups.ts`       | 8    | Add `memory`/`timeoutSeconds` to `onSchedule` options                                                   |
| `functions/src/callable/generateTreasuryReport.ts`             | 8    | Add options object with `memory`/`timeoutSeconds` to `onCall`                                           |
| `mobile/src/store/index.ts`                                    | 9    | Register `intergroupSlice` and `brandingSlice` reducers                                                 |
| `mobile/src/store/__tests__/index.test.ts` (new)               | 9    | New test asserting all slice files are registered                                                       |
| `mobile/src/screens/homegroup/TreasurerHandoffScreen.tsx`      | 10   | Capture and return the `onSnapshot` unsubscribe from the `useEffect`                                    |
| `mobile/src/screens/homegroup/GroupChatScreen.tsx`             | 11   | Debounce the typing-indicator Firestore write                                                           |
| `mobile/src/screens/homegroup/GroupOverviewScreen.tsx`         | 11   | Scope the unread-count listener away from the typing field                                              |
| `.github/workflows/ci.yml`                                     | 12   | Add `firestore-rules` job; add mobile Jest step                                                         |

---

## Task 1: Atomic Idempotency for Treasury and Milestone Counters

**Files:**

- Modify: `functions/src/triggers/firestore/onTransactionWrite.ts`
- Modify: `functions/src/__tests__/onTransactionWrite.test.ts`
- Modify: `functions/src/triggers/firestore/onMilestoneWrite.ts`
- Modify: `functions/src/__tests__/onMilestoneWrite.test.ts`

**Interfaces:** No exported signatures change — `onTransactionWrite` and `onMilestoneWrite` keep their existing trigger signatures. Internal behavior changes: the lock-claim and the counter increment become one atomic `db.runTransaction(...)` instead of two separate writes.

**Context:** The current code claims a lock via `lockRef.create()`, then does a separate `overviewRef.set(...)`/`statsRef.set(...)` write, and on any downstream failure deletes the lock before rethrowing. If the increment write actually lands on Firestore's server but the acknowledgment is lost (timeout/OOM after commit), the code treats it as a failure, deletes the lock, and a subsequent retry re-applies the increment a second time. Separately, a non-`ALREADY_EXISTS` lock-claim failure (e.g. Firestore transiently unavailable) currently lets the increment proceed with zero protection. Wrapping both the lock check and the increment in one Firestore transaction eliminates both gaps: either the whole thing commits together, or Firestore's transaction retry (not the Cloud Function's own re-invocation) handles contention — there is no window where the lock and the counter can diverge.

- [ ] **Step 1: Rewrite `onTransactionWrite.ts`'s trigger body**

Replace the entire body of the exported `onTransactionWrite` handler (currently `functions/src/triggers/firestore/onTransactionWrite.ts:60-245`) with:

```typescript
export const onTransactionWrite = functionsV1.firestore
  .document("transactions/{transactionId}")
  .onWrite(async (change, context) => {
    const { transactionId } = context.params;
    const eventId = context.eventId;

    const beforeData = change.before.exists
      ? (change.before.data() as TransactionDocument)
      : null;
    const afterData = change.after.exists
      ? (change.after.data() as TransactionDocument)
      : null;

    const groupId = afterData?.groupId ?? beforeData?.groupId;
    if (!groupId) {
      functions.logger.warn(
        `onTransactionWrite: no groupId found for transaction ${transactionId}. Skipping.`,
      );
      return null;
    }

    const signedContribution = (doc: TransactionDocument | null): number => {
      if (!doc) return 0;
      return doc.type === "income" ? doc.amount : -doc.amount;
    };

    const balanceDelta =
      signedContribution(afterData) - signedContribution(beforeData);
    const monthlyIncomeDelta =
      (afterData?.type === "income" ? afterData.amount : 0) -
      (beforeData?.type === "income" ? beforeData.amount : 0);
    const monthlyExpensesDelta =
      (afterData?.type === "expense" ? afterData.amount : 0) -
      (beforeData?.type === "expense" ? beforeData.amount : 0);

    if (
      balanceDelta === 0 &&
      monthlyIncomeDelta === 0 &&
      monthlyExpensesDelta === 0
    ) {
      functions.logger.debug(
        `onTransactionWrite: no balance change for transaction ${transactionId}. Skipping.`,
      );
      return null;
    }

    const lockRef = db.collection("processed_transaction_events").doc(eventId);
    const overviewRef = db.collection("treasury_overviews").doc(groupId);

    // ------------------------------------------------------------------
    // Idempotency guard, made atomic with the increment (D-5 hardening).
    //
    // The lock check and the counter update now happen inside a single
    // Firestore transaction: either both commit together, or neither
    // does. This closes the gap the previous lock-create/set/delete
    // dance had — if the increment write landed on Firestore's server
    // but the client never got the acknowledgment, the old code deleted
    // the lock and let a retry double-apply the increment. A Firestore
    // transaction has no such window: a retry either sees the lock
    // already committed (skip) or re-runs the whole transaction cleanly.
    // ------------------------------------------------------------------
    await db.runTransaction(async (tx) => {
      const lockSnap = await tx.get(lockRef);
      if (lockSnap.exists) {
        functions.logger.info(
          `onTransactionWrite: event ${eventId} (transaction ${transactionId}) already processed; skipping.`,
        );
        return;
      }

      const overviewSnap = await tx.get(overviewRef);
      const overviewData = overviewSnap.exists
        ? (overviewSnap.data() as TreasuryOverviewDocument)
        : null;

      const lastMonthReset = overviewData?.lastMonthReset?.toDate();
      const needsMonthlyReset = isNewMonth(lastMonthReset);
      const now = new Date();

      const updates: Record<string, unknown> = {
        groupId,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (needsMonthlyReset) {
        updates.monthlyIncome = monthlyIncomeDelta > 0 ? monthlyIncomeDelta : 0;
        updates.monthlyExpenses =
          monthlyExpensesDelta > 0 ? monthlyExpensesDelta : 0;
        updates.lastMonthReset = admin.firestore.Timestamp.fromDate(now);
        functions.logger.info(
          `onTransactionWrite: resetting monthly stats for group ${groupId} ` +
            `(lastMonthReset was ${lastMonthReset?.toISOString() ?? "never"})`,
        );
      } else {
        if (monthlyIncomeDelta !== 0) {
          updates.monthlyIncome =
            admin.firestore.FieldValue.increment(monthlyIncomeDelta);
        }
        if (monthlyExpensesDelta !== 0) {
          updates.monthlyExpenses =
            admin.firestore.FieldValue.increment(monthlyExpensesDelta);
        }
      }

      if (balanceDelta !== 0) {
        updates.balance = admin.firestore.FieldValue.increment(balanceDelta);
      }

      tx.set(lockRef, {
        transactionId,
        eventType: change.after.exists
          ? change.before.exists
            ? "update"
            : "create"
          : "delete",
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "processed",
      });
      tx.set(overviewRef, updates, { merge: true });

      functions.logger.info(
        `onTransactionWrite: updated treasury_overviews/${groupId} ` +
          `balanceDelta=${balanceDelta} ` +
          `monthlyIncomeDelta=${monthlyIncomeDelta} ` +
          `monthlyExpensesDelta=${monthlyExpensesDelta} ` +
          `monthlyReset=${needsMonthlyReset}`,
      );
    });

    return null;
  });
```

Keep the file's existing imports, the `TransactionDocument`/`TreasuryOverviewDocument` interfaces, and the `isNewMonth` helper exactly as they are — only the exported handler body changes.

- [ ] **Step 2: Adapt `onTransactionWrite.test.ts`'s "D-5 idempotency" describe block**

Read the full existing test file first (`functions/src/__tests__/onTransactionWrite.test.ts`, especially the mock setup in lines 1-547 that this task brief did not fully capture) to see the exact `makeChange`/`context`/`capturedHandler` helpers already established, and preserve that style. Replace the `describe("D-5 idempotency", ...)` block (currently lines 548-677, using `mockLockCreate`/`mockLockUpdate`/`mockLockDelete`/`mockSet`) with a version testing the new transaction-based flow. Add these mocks near the file's other module-scope mock declarations:

```typescript
const mockTxGet = jest.fn();
const mockTxSet = jest.fn();
const mockRunTransaction = jest.fn(async (fn: any) =>
  fn({ get: mockTxGet, set: mockTxSet }),
);
```

Update the `jest.mock("../../utils/firebase", ...)` factory to add `runTransaction: mockRunTransaction` alongside the existing `collection: mockCollection`. Update `mockCollection`'s `.doc(id)` implementation so returned refs carry an identifiable `__collection` tag (e.g. `mockCollection.mockImplementation((name: string) => ({ doc: jest.fn((id: string) => ({ id, __collection: name })) }))`), so tests can assert which collection a given `tx.get`/`tx.set` call targeted.

Replace the block with:

```typescript
describe("D-5 idempotency (atomic transaction)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunTransaction.mockImplementation(async (fn: any) =>
      fn({ get: mockTxGet, set: mockTxSet }),
    );
  });

  it("first delivery: no existing lock, applies the increment and writes a processed lock", async () => {
    mockTxGet.mockImplementation(async (ref: any) => ({
      exists: false,
    }));

    const change = makeChange(null, {
      groupId: "group-1",
      type: "income",
      amount: 50,
    });

    await capturedHandler(change, context);

    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
    expect(mockTxSet).toHaveBeenCalledWith(
      expect.objectContaining({
        __collection: "processed_transaction_events",
      }),
      expect.objectContaining({
        transactionId: "tx-001",
        status: "processed",
      }),
    );
    expect(mockTxSet).toHaveBeenCalledWith(
      expect.objectContaining({ __collection: "treasury_overviews" }),
      expect.anything(),
      { merge: true },
    );
  });

  it("duplicate delivery: lock already exists, skips the increment entirely", async () => {
    mockTxGet.mockImplementation(async (ref: any) => {
      if (ref.__collection === "processed_transaction_events") {
        return { exists: true };
      }
      return { exists: false };
    });

    const change = makeChange(null, {
      groupId: "group-1",
      type: "income",
      amount: 50,
    });

    await capturedHandler(change, context);

    expect(mockTxSet).not.toHaveBeenCalled();
  });

  it("a failed transaction rethrows and leaves no partial state to clean up", async () => {
    mockRunTransaction.mockRejectedValueOnce(new Error("Firestore contention"));

    const change = makeChange(null, {
      groupId: "group-1",
      type: "income",
      amount: 50,
    });

    await expect(capturedHandler(change, context)).rejects.toThrow(
      /Firestore contention/,
    );
  });

  it("uses context.eventId as the lock document ID", async () => {
    mockTxGet.mockResolvedValue({ exists: false });
    const lockDocSpy = jest.fn((id: string) => ({
      id,
      __collection: "processed_transaction_events",
    }));
    mockCollection.mockImplementation((name: string) => {
      if (name === "processed_transaction_events") {
        return { doc: lockDocSpy };
      }
      return {
        doc: jest.fn((id: string) => ({ id, __collection: name })),
      };
    });

    const change = makeChange(null, {
      groupId: "group-1",
      type: "income",
      amount: 50,
    });

    await capturedHandler(change, {
      ...context,
      eventId: "specific-event-id-xyz",
    });

    expect(lockDocSpy).toHaveBeenCalledWith("specific-event-id-xyz");
  });
});
```

- [ ] **Step 3: Run the adapted test file to verify it passes**

Run: `cd functions && npx jest src/__tests__/onTransactionWrite.test.ts`
Expected: PASS, all tests including the new D-5 block.

- [ ] **Step 4: Apply the identical fix to `onMilestoneWrite.ts`**

Replace the entire body of the exported `onMilestoneWrite` handler (currently `functions/src/triggers/firestore/onMilestoneWrite.ts:25-144`) with:

```typescript
export const onMilestoneWrite = onDocumentWritten(
  "groups/{groupId}/milestones/{memberId}",
  async (event) => {
    const groupId = event.params.groupId;
    const memberId = event.params.memberId;
    const eventId = event.id;

    const beforeData = event.data?.before?.data();
    const afterData = event.data?.after?.data();

    const beforeCount = (beforeData?.milestones || []).length;
    const afterCount = (afterData?.milestones || []).length;
    const delta = afterCount - beforeCount;

    if (delta === 0) return;

    const lockRef = db.collection("processed_milestone_events").doc(eventId);

    await db.runTransaction(async (tx) => {
      const lockSnap = await tx.get(lockRef);
      if (lockSnap.exists) {
        logger.info(
          `onMilestoneWrite: event ${eventId} already processed; skipping.`,
        );
        return;
      }

      // Get the group to check for orgId
      const groupSnap = await tx.get(db.collection("groups").doc(groupId));
      if (!groupSnap.exists) return;
      const groupData = groupSnap.data()!;

      const orgId: string | undefined = groupData.orgId;
      if (!orgId) return; // Not affiliated with any intergroup

      // Check that the intergroup is a treatment center
      const intergroupSnap = await tx.get(
        db.collection("intergroups").doc(orgId),
      );
      if (!intergroupSnap.exists) return;
      if (intergroupSnap.data()?.type !== "treatment_center") return;

      const statsRef = db
        .collection("intergroups")
        .doc(orgId)
        .collection("facilityStats")
        .doc("current");

      const updates: Record<string, any> = {
        totalMilestonesAwarded: admin.firestore.FieldValue.increment(delta),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        generatedBy: "onMilestoneWrite",
      };

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfYear = new Date(now.getFullYear(), 0, 1);

      if (delta > 0 && afterData?.milestones) {
        const newMilestones = afterData.milestones.slice(beforeCount);
        const thisMonthNew = newMilestones.filter((m: any) => {
          const chipDate = m.chipGivenAt?.toDate?.() ?? new Date(0);
          return chipDate >= startOfMonth;
        }).length;
        if (thisMonthNew > 0) {
          updates.milestonesThisMonth =
            admin.firestore.FieldValue.increment(thisMonthNew);
        }

        const thisYearNew = newMilestones.filter((m: any) => {
          const chipDate = m.chipGivenAt?.toDate?.() ?? new Date(0);
          return chipDate >= startOfYear;
        }).length;
        if (thisYearNew > 0) {
          updates.milestonesThisYear =
            admin.firestore.FieldValue.increment(thisYearNew);
        }
      }

      tx.set(lockRef, {
        groupId,
        memberId,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "processed",
      });
      tx.set(statsRef, updates, { merge: true });

      logger.info(
        `Facility stats updated for intergroup ${orgId}: delta=${delta}`,
      );
    });
  },
);
```

Note: unlike the original, group/intergroup lookups now happen via `tx.get(...)` inside the transaction (Firestore transactions require reads through the transaction object once any read has started via `tx`), and there is no separate outer try/catch with a lock-delete-on-failure path — a failed transaction simply rethrows and Firestore's own retry re-runs the whole thing.

- [ ] **Step 5: Adapt `onMilestoneWrite.test.ts`'s "D-6 idempotency" describe block**

Same transformation as Step 2, applied to `functions/src/__tests__/onMilestoneWrite.test.ts`'s `describe("D-6 idempotency", ...)` block (currently lines 200-281, using `mockLockCreate`/`mockLockUpdate`/`mockLockDelete`/`mockStatsSet`). Read the file's existing `setupCollections`/`makeEvent`/`capturedHandler` helpers (lines 1-193) first and preserve that style. Add `mockTxGet`/`mockTxSet`/`mockRunTransaction` the same way as Step 2, and update `setupCollections` (or add a transaction-aware variant) so `db.runTransaction` and `db.collection(...).doc(...)` both route through the new mocks. Write four tests mirroring Step 2's shape: (1) first delivery with no lock → applies the increment and writes a processed lock; (2) lock already exists → `mockTxSet` never called; (3) failed transaction → rethrows; (4) lock doc ID equals `event.id`.

- [ ] **Step 6: Run both adapted test files together**

Run: `cd functions && npx jest src/__tests__/onTransactionWrite.test.ts src/__tests__/onMilestoneWrite.test.ts`
Expected: PASS, all tests in both files.

- [ ] **Step 7: Typecheck and run the full functions suite**

Run: `cd functions && npx tsc --noEmit && npm test -- --passWithNoTests --forceExit`
Expected: both exit 0.

- [ ] **Step 8: Commit**

```bash
cd functions
git add src/triggers/firestore/onTransactionWrite.ts src/__tests__/onTransactionWrite.test.ts src/triggers/firestore/onMilestoneWrite.ts src/__tests__/onMilestoneWrite.test.ts
git commit -m "fix(homegroups-functions): make treasury/milestone counter idempotency atomic"
```

---

## Task 2: Batch `onMemberCreate`'s Per-Member Fan-Out

**Files:**

- Modify: `functions/src/triggers/firestore/onMemberCreate.ts`
- Create: `functions/src/__tests__/onMemberCreate.test.ts`

**Interfaces:** No exported signature changes. Internal: the unchunked `Promise.all` of one `.get()` per existing member is replaced with the batched `in`-query pattern already used by `onMeetingInstanceUpdate.ts`'s `getGroupMemberTokens`.

**Context:** `onMemberCreate.ts` currently fires one `db.collection("users").doc(userId).get()` per existing group member via an unchunked `Promise.all` — cumulative cost grows O(N²) as a group grows. `onMeetingInstanceUpdate.ts` already solves this exact problem for the same `members`→`users` FCM-token lookup, batching via `in`-queries of 10. `onMemberCreate` uses a different notification-settings field (`newMemberNotifications` vs. `meetings`) — preserve that field name, only copy the batching mechanics.

- [ ] **Step 1: Write a failing test for batched token collection**

Create `functions/src/__tests__/onMemberCreate.test.ts`:

```typescript
export {}; // Ensure isolated module

jest.mock("firebase-functions", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("firebase-functions/v1", () => ({
  firestore: {
    document: (path: string) => ({
      onCreate: (handler: any) => handler,
    }),
  },
}));

const mockSendEachForMulticast = jest
  .fn()
  .mockResolvedValue({ successCount: 0, failureCount: 0 });
const mockCollection = jest.fn();

jest.mock("../../utils/firebase", () => ({
  db: { collection: mockCollection },
  messaging: { sendEachForMulticast: mockSendEachForMulticast },
}));

import { onMemberCreate } from "../../triggers/firestore/onMemberCreate";

function makeUserDoc(id: string, fcmTokens: string[] = ["tok"]) {
  return {
    exists: true,
    id,
    data: () => ({
      fcmTokens,
      notificationSettings: {
        allowPushNotifications: true,
        newMemberNotifications: true,
      },
    }),
  };
}

describe("onMemberCreate — batched FCM token lookup", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSendEachForMulticast.mockResolvedValue({
      successCount: 0,
      failureCount: 0,
    });
  });

  it("batches user lookups in groups of 10 via 'in' queries instead of one get() per member", async () => {
    // 25 existing members + the new joining member = 26 member docs.
    const memberDocs = Array.from({ length: 26 }, (_, i) => ({
      data: () => ({ userId: `user-${i}`, groupId: "group-1" }),
    }));
    const membersGet = jest.fn().mockResolvedValue({
      size: 26,
      docs: memberDocs,
    });
    const usersWhereGet = jest.fn().mockResolvedValue({ docs: [] });

    mockCollection.mockImplementation((name: string) => {
      if (name === "groups") {
        return {
          doc: () => ({
            get: jest
              .fn()
              .mockResolvedValue({
                exists: true,
                data: () => ({ name: "Test Group" }),
              }),
          }),
        };
      }
      if (name === "members") {
        return { where: () => ({ get: membersGet }) };
      }
      if (name === "users") {
        return { where: () => ({ get: usersWhereGet }) };
      }
      throw new Error(`Unexpected collection: ${name}`);
    });

    const snap = { data: () => ({ userId: "user-0", groupId: "group-1" }) };
    const context = { params: { memberId: "group-1_user-0" } };

    await (onMemberCreate as any)(snap, context);

    // 25 existing members (user-1..user-24 + none excluded further) batched
    // into chunks of 10 => 3 batched 'in' query calls, never 25 individual gets.
    expect(usersWhereGet).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd functions && npx jest src/__tests__/onMemberCreate.test.ts`
Expected: FAIL — the current implementation calls `db.collection("users").doc(userId).get()` per member, never `db.collection("users").where(...)`, so `usersWhereGet` is never called (0 calls, not 3).

- [ ] **Step 3: Rewrite the fan-out section of `onMemberCreate.ts`**

Replace lines 71-105 (from `// Get all members of the group...` through the `Promise.all(userPromises)` line) with:

```typescript
// Get all members of the group from top-level members collection
const membersSnapshot = await db
  .collection("members")
  .where("groupId", "==", groupId)
  .get();

if (membersSnapshot.size <= 1) {
  // Only the new member exists, no one to notify
  functions.logger.info(
    `No other members in group ${groupId} to notify about new member`,
  );
  return;
}

// Collect existing members' user IDs (excluding the new member)
const existingMemberUserIds: string[] = [];
for (const memberDoc of membersSnapshot.docs) {
  const memberData = memberDoc.data() as MemberData;
  if (memberData.userId !== newMemberData.userId) {
    existingMemberUserIds.push(memberData.userId);
  }
}

if (existingMemberUserIds.length === 0) {
  functions.logger.info("No existing members to notify");
  return;
}

// Fetch user documents in batches of 10 (Firestore 'in' query limit)
// instead of one get() per member — see onMeetingInstanceUpdate.ts's
// getGroupMemberTokens for the same pattern applied elsewhere.
const tokens: string[] = [];
for (let i = 0; i < existingMemberUserIds.length; i += 10) {
  const batch = existingMemberUserIds.slice(i, i + 10);
  if (batch.length === 0) continue;

  const usersSnapshot = await db
    .collection("users")
    .where("__name__", "in", batch)
    .get();

  usersSnapshot.docs.forEach((userDoc) => {
    const userData = userDoc.data() as UserData;
    const pushEnabled =
      userData.notificationSettings?.allowPushNotifications !== false;
    const newMemberNotificationsEnabled =
      userData.notificationSettings?.newMemberNotifications !== false;

    if (
      pushEnabled &&
      newMemberNotificationsEnabled &&
      userData.fcmTokens?.length
    ) {
      tokens.push(...userData.fcmTokens);
    }
  });
}
```

This replaces both the old per-member `.get()` fan-out AND the old separate `for (const userDoc of userDocs)` filtering loop (previously lines 107-120) — the filtering now happens inline inside the batch loop above. Delete the old standalone filtering loop entirely; the `tokens` array is now fully populated by the code above.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd functions && npx jest src/__tests__/onMemberCreate.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and run the full functions suite**

Run: `cd functions && npx tsc --noEmit && npm test -- --passWithNoTests --forceExit`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
cd functions
git add src/triggers/firestore/onMemberCreate.ts src/__tests__/onMemberCreate.test.ts
git commit -m "fix(homegroups-functions): batch onMemberCreate's FCM token lookup to avoid O(N^2) fan-out"
```

---

## Task 3: Fix `sendMentionNotifications` — Require Membership, Derive Identity Server-Side

**Files:**

- Modify: `functions/src/callable/sendMentionNotifications.ts`
- Modify: `functions/src/__tests__/sendMentionNotifications.test.ts`

**Interfaces:** `sendMentionNotifications` keeps its existing `onCall` signature and `SendMentionData` input shape. New behavior: throws `HttpsError("permission-denied", ...)` if the caller is not a member of `groupId`; `senderId`/`senderName` are now derived from `request.auth` instead of trusted from `request.data.message`.

**Context:** The callable currently trusts `senderId`, `senderName`, `text`, and `mentionedUserIds` entirely from client-supplied `request.data.message`, with only a bare `request.auth != null` check — any logged-in user can push a spoofed notification to any other user. Fix: verify the caller is a member of `groupId` (query the `members` collection, matching the doc-ID pattern `{groupId}_{uid}` used elsewhere in this codebase), and derive `senderId` from `request.auth.uid` and `senderName` from the caller's own `users/{uid}` document rather than from client input.

- [ ] **Step 1: Write failing tests**

In `functions/src/__tests__/sendMentionNotifications.test.ts`, extend the existing `mockCollection` mock (already established in the file per the "proceeds past auth check" test) to also handle a `"members"` collection lookup, and add these two tests inside (or alongside) the existing `describe("sendMentionNotifications auth check (FH-2)", ...)` block:

```typescript
it("throws permission-denied when the caller is not a member of the group", async () => {
  jest.resetModules();
  mockCollection.mockImplementation((name: string) => {
    if (name === "members") {
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue({ exists: false }),
        })),
      };
    }
    return { doc: jest.fn(() => ({ get: jest.fn() })) };
  });
  const { sendMentionNotifications: fn } =
    await import("../callable/sendMentionNotifications");
  const request = {
    auth: { uid: "caller-uid" },
    data: {
      groupId: "group-1",
      messageId: "msg-1",
      message: {
        id: "msg-1",
        senderId: "caller-uid",
        senderName: "Caller",
        text: "hi @someone",
        sentAt: {},
        groupId: "group-1",
        mentionedUserIds: ["victim-uid"],
      },
    },
  };
  await expect((fn as any)(request)).rejects.toMatchObject({
    code: "permission-denied",
  });
});

it("derives senderId from request.auth.uid, ignoring a spoofed senderId in message data", async () => {
  jest.resetModules();
  mockCollection.mockImplementation((name: string) => {
    if (name === "members") {
      return {
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue({ exists: true }),
        })),
      };
    }
    if (name === "users") {
      return {
        doc: jest.fn((uid: string) => ({
          get: jest.fn().mockResolvedValue({
            exists: true,
            id: uid,
            data: () => ({
              displayName: "Real Caller",
              fcmTokens: ["tok"],
              notificationSettings: {
                allowPushNotifications: true,
                groupChatMentions: true,
              },
            }),
          }),
        })),
      };
    }
    if (name === "groups") {
      return {
        doc: jest.fn(() => ({
          get: jest
            .fn()
            .mockResolvedValue({ exists: true, data: () => ({ name: "G" }) }),
        })),
      };
    }
    return { doc: jest.fn(() => ({ get: jest.fn() })) };
  });
  const { sendMentionNotifications: fn } =
    await import("../callable/sendMentionNotifications");
  const request = {
    auth: { uid: "real-caller-uid" },
    data: {
      groupId: "group-1",
      messageId: "msg-1",
      message: {
        id: "msg-1",
        senderId: "spoofed-uid",
        senderName: "Spoofed Name",
        text: "hi @victim",
        sentAt: {},
        groupId: "group-1",
        mentionedUserIds: ["victim-uid"],
      },
    },
  };
  await (fn as any)(request);
  expect(mockSendEachForMulticast).toHaveBeenCalledWith(
    expect.objectContaining({
      notification: expect.objectContaining({
        body: expect.stringContaining("Real Caller"),
      }),
    }),
  );
});
```

(`mockSendEachForMulticast` should already exist in this test file per the fact-gathering pass — reuse it; do not redeclare.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd functions && npx jest src/__tests__/sendMentionNotifications.test.ts`
Expected: FAIL — no membership check exists yet, and `senderName` currently comes from client data, not the `users` doc lookup.

- [ ] **Step 3: Rewrite `sendMentionNotifications.ts`'s handler body**

Replace the section from the auth check through the `senderName`/`recipients` derivation (currently lines 27-88) with:

```typescript
export const sendMentionNotifications = onCall(
  async (request: CallableRequest<SendMentionData>) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated.");
    }
    const callerId = request.auth.uid;

    const snap = request.data;
    if (!snap || !snap.groupId || !snap.messageId || !snap.message) {
      logger.error("Invalid mention notification request data");
      throw new HttpsError(
        "invalid-argument",
        "Missing required mention data.",
      );
    }

    if (typeof snap.groupId !== "string" || snap.groupId.trim() === "") {
      throw new HttpsError("invalid-argument", "Invalid groupId.");
    }
    if (typeof snap.messageId !== "string" || snap.messageId.trim() === "") {
      throw new HttpsError("invalid-argument", "Invalid messageId.");
    }

    const { groupId, messageId } = snap;

    // Verify the caller is a member of the group before trusting anything
    // else about this request — membership doc IDs are {groupId}_{userId}.
    const memberSnap = await db
      .collection("members")
      .doc(`${groupId}_${callerId}`)
      .get();
    if (!memberSnap.exists) {
      throw new HttpsError(
        "permission-denied",
        "You are not a member of this group.",
      );
    }

    // Derive sender identity server-side — never trust client-supplied
    // senderId/senderName, which would let any caller spoof another user.
    const callerDoc = await db.collection("users").doc(callerId).get();
    const senderName = callerDoc.data()?.displayName || "Someone";
    const messageText = snap.message.text || "";

    logger.info(
      `New message ${messageId} in group ${groupId}. Checking for mentions.`,
    );

    // mentionedUserIds still comes from client data (the message payload),
    // but recipients are cross-checked against actual group membership below
    // so an attacker can't target arbitrary UIDs outside the group.
    const rawMentionedUserIds = snap.message.mentionedUserIds ?? [];
    const candidateRecipients = rawMentionedUserIds.filter(
      (uid) => uid !== callerId,
    );
    if (candidateRecipients.length === 0) {
      logger.info("No valid recipients found for mention notification.");
      return { success: true, sentCount: 0 };
    }

    const recipientMemberSnaps = await Promise.all(
      candidateRecipients.map((uid) =>
        db.collection("members").doc(`${groupId}_${uid}`).get(),
      ),
    );
    const recipients = candidateRecipients.filter(
      (_, i) => recipientMemberSnaps[i].exists,
    );
    if (recipients.length === 0) {
      logger.info("No valid in-group recipients found for mention notification.");
      return { success: true, sentCount: 0 };
    }
    logger.info(`Recipients for notification: ${recipients.join(", ")}`);
```

Keep everything from the token-collection loop onward (the existing `const tokens: string[] = []; ... const userPromises = recipients.map(...)` block through the end of the function) exactly as it is today — only the identity/membership derivation above it changes. Remove the now-unused `mentionRegex`/`mentionedNames` fallback block entirely (it was dead-end logging only, per the original code's own comment "Mention lookup by name not fully implemented").

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd functions && npx jest src/__tests__/sendMentionNotifications.test.ts`
Expected: PASS, including all pre-existing tests in the file (re-verify the "proceeds past auth check" happy-path test still passes with the new membership-check mock in place — it may need its `mockCollection` updated to also return an existing `members` doc, since membership is now checked before that test's zero-recipients early return).

- [ ] **Step 5: Typecheck and run the full functions suite**

Run: `cd functions && npx tsc --noEmit && npm test -- --passWithNoTests --forceExit`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
cd functions
git add src/callable/sendMentionNotifications.ts src/__tests__/sendMentionNotifications.test.ts
git commit -m "fix(homegroups-functions): require group membership and derive sender identity server-side in sendMentionNotifications"
```

---

## Task 4: Fix `searchGroupsByLocation` — Field Allow-List + Opt-Out Filter

**Files:**

- Modify: `functions/src/callable/searchGroupsByLocation.ts`
- Modify: `functions/src/__tests__/searchGroupsByLocation.test.ts`

**Interfaces:** `searchGroupsByLocation` keeps its existing `onCall` signature and input shape. Return type narrows from "the entire raw group document plus `id`/`distanceInM`" to an explicit allow-listed subset; groups with `publicProfileEnabled === false` are excluded.

**Context:** The callable currently spreads `...groupData` (the entire raw Firestore document) into each search result with no field allow-list and no `publicProfileEnabled` check, leaking `stripeCustomerId`, `stripeSubscriptionId`, admin/treasurer lists, and any other internal field. `getPublicGroupProfile.ts` already has the correct allow-list pattern for a very similar public group-search use case — mirror it here (fields relevant to a location search result: `id`, `name`, `type`, `placeName`, `city`, `state`, `isClaimed`, plus this callable's own `distanceInM`).

- [ ] **Step 1: Write failing tests**

In `functions/src/__tests__/searchGroupsByLocation.test.ts`, extend the existing happy-path test setup (the file already mocks `geofire-common` and `mockCollection` per the fact-gathering pass) and add two new tests inside the existing `describe("searchGroupsByLocation auth check (FH-3)", ...)` block (or a new adjacent `describe`):

```typescript
it("does not leak internal fields (stripeCustomerId, admins, etc.) in search results", async () => {
  jest.resetModules();
  const rawGroupData = {
    name: "Test Group",
    type: "AA",
    placeName: "Church Hall",
    city: "Phoenix",
    state: "AZ",
    isClaimed: true,
    lat: 33.45,
    lng: -112.07,
    geohash: "abc",
    publicProfileEnabled: true,
    stripeCustomerId: "cus_secret",
    stripeSubscriptionId: "sub_secret",
    admins: ["admin-uid"],
    treasurers: ["treasurer-uid"],
  };
  mockCollection.mockImplementation((name: string) => {
    if (name === "groups") {
      return {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        startAt: jest.fn().mockReturnThis(),
        endAt: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({
          docs: [{ id: "group-1", data: () => rawGroupData }],
        }),
      };
    }
    return {};
  });
  const { searchGroupsByLocation: fn } =
    await import("../callable/searchGroupsByLocation");
  const request = {
    auth: { uid: "caller-uid" },
    data: { lat: 33.45, lng: -112.07, radius: 10 },
  };
  const result = await (fn as any)(request);
  expect(result).toHaveLength(1);
  const leaked = [
    "stripeCustomerId",
    "stripeSubscriptionId",
    "admins",
    "treasurers",
    "lat",
    "lng",
    "geohash",
  ];
  for (const field of leaked) {
    expect(result[0]).not.toHaveProperty(field);
  }
  expect(result[0]).toMatchObject({
    id: "group-1",
    name: "Test Group",
    type: "AA",
    placeName: "Church Hall",
    city: "Phoenix",
    state: "AZ",
    isClaimed: true,
  });
});

it("excludes groups with publicProfileEnabled set to false", async () => {
  jest.resetModules();
  mockCollection.mockImplementation((name: string) => {
    if (name === "groups") {
      return {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        startAt: jest.fn().mockReturnThis(),
        endAt: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({
          docs: [
            {
              id: "hidden-group",
              data: () => ({
                name: "Hidden Group",
                lat: 33.45,
                lng: -112.07,
                publicProfileEnabled: false,
              }),
            },
          ],
        }),
      };
    }
    return {};
  });
  const { searchGroupsByLocation: fn } =
    await import("../callable/searchGroupsByLocation");
  const request = {
    auth: { uid: "caller-uid" },
    data: { lat: 33.45, lng: -112.07, radius: 10 },
  };
  const result = await (fn as any)(request);
  expect(result).toHaveLength(0);
});
```

Adjust the mocked `geofire.geohashQueryBounds`/`distanceBetween` return values if needed to match the file's existing mock (per the fact-gathering pass: `geohashQueryBounds` returns `[["a","z"]]`, `distanceBetween` returns `1000` meters — 1000m is within a 10km radius, so these tests' groups will pass the distance filter).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd functions && npx jest src/__tests__/searchGroupsByLocation.test.ts`
Expected: FAIL — current code spreads all fields and never checks `publicProfileEnabled`.

- [ ] **Step 3: Rewrite the result-construction section of `searchGroupsByLocation.ts`**

Add an allow-list interface and picker function near the top of the file (after the existing `SearchGroupsData` interface, before `calculateDistanceMeters`):

```typescript
export interface PublicSearchResult {
  id: string;
  name: string;
  type: string;
  placeName?: string;
  city?: string;
  state?: string;
  isClaimed: boolean;
  distanceInM: number;
}

function pickPublicSearchFields(
  groupData: Record<string, unknown>,
  id: string,
  distanceInM: number,
): PublicSearchResult {
  return {
    id,
    name: (groupData.name as string) ?? "",
    type: (groupData.type as string) ?? "",
    placeName: groupData.placeName as string | undefined,
    city: groupData.city as string | undefined,
    state: groupData.state as string | undefined,
    isClaimed: groupData.isClaimed === true,
    distanceInM,
  };
}
```

Then replace the result-building block inside the `for (const doc of snap.docs)` loop (currently lines 100-124) with:

```typescript
const groupData = doc.data();
const groupLat = groupData?.lat;
const groupLng = groupData?.lng;

// Ensure the group has valid coordinates
if (groupLat !== undefined && groupLng !== undefined) {
  const distanceInM = calculateDistanceMeters(
    latitude,
    longitude,
    groupLat,
    groupLng,
  );

  if (distanceInM <= radiusInM) {
    const publicEnabled = groupData?.publicProfileEnabled ?? true;
    if (publicEnabled !== false) {
      matchingGroups.push(
        pickPublicSearchFields(groupData, doc.id, Math.round(distanceInM)),
      );
    }
  }
}
```

Also change the `matchingGroups: any[]` declaration (currently line 96) to `const matchingGroups: PublicSearchResult[] = [];`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd functions && npx jest src/__tests__/searchGroupsByLocation.test.ts`
Expected: PASS, including the pre-existing tests in the file.

- [ ] **Step 5: Typecheck and run the full functions suite**

Run: `cd functions && npx tsc --noEmit && npm test -- --passWithNoTests --forceExit`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
cd functions
git add src/callable/searchGroupsByLocation.ts src/__tests__/searchGroupsByLocation.test.ts
git commit -m "fix(homegroups-functions): allow-list fields and honor publicProfileEnabled in searchGroupsByLocation"
```

---

## Task 5: Fix `deleteUserAccount` — Accurate Success Reporting

**Files:**

- Modify: `functions/src/callable/deleteUserAccount.ts`
- Modify: `functions/src/__tests__/deleteUserAccount.test.ts`

**Interfaces:** `DeleteAccountResponse`'s `success` field now reflects whether Auth deletion actually succeeded, not just whether the earlier Firestore steps completed. No new fields are added — `deletedData.authAccount` already exists and already correctly reflects the true/false state; the bug is that the top-level `success`/`message` ignore it.

**Context:** Currently, if `auth.deleteUser(userId)` throws (for any reason — not just "already deleted"), the error is logged and swallowed, `deletedData.authAccount` stays `false`, but the function still unconditionally returns `success: true` with a message claiming the account was successfully deleted. A "deleted" user can still log in. Fix: when Auth deletion fails, return `success: false` (not `true`) with a message that accurately reflects partial completion, while still returning the `deletedData` breakdown so the client can see exactly what did and didn't complete.

- [ ] **Step 1: Write a failing test**

In `functions/src/__tests__/deleteUserAccount.test.ts`, add a new test near the other top-level tests (using the existing `makeAuthRequest`/`makeDoc` helpers and the existing `duaMockDeleteUser` mock, per the fact-gathering pass):

```typescript
it("reports success: false when Firebase Auth deletion fails, without discarding completed Firestore cleanup", async () => {
  duaMockDeleteUser.mockRejectedValueOnce(
    new Error("Auth service unavailable"),
  );

  const request = makeAuthRequest(
    "user-1",
    "user@example.com",
    "user@example.com",
  );
  const result = await (deleteUserAccount as any)(request);

  expect(result.success).toBe(false);
  expect(result.deletedData?.authAccount).toBe(false);
  expect(result.message).not.toMatch(/successfully deleted/i);
});
```

(Adjust `makeAuthRequest`'s exact argument order/shape if it differs from this guess — the fact-gathering pass confirmed the helper exists at `deleteUserAccount.test.ts:115-118` as `makeAuthRequest(uid, email, confirmEmail)`, matching the call above.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd functions && npx jest src/__tests__/deleteUserAccount.test.ts -t "reports success: false"`
Expected: FAIL — `result.success` is currently always `true`.

- [ ] **Step 3: Fix the final return statement in `deleteUserAccount.ts`**

Replace lines 313-320 (from `logger.info(\`Account deletion complete...\``through the closing`};` of the return statement) with:

```typescript
const message = deletedData.authAccount
  ? "Your account and data have been successfully deleted. Some data may have been anonymized to preserve group history."
  : "Your account data has been deleted, but we could not remove your login credentials. Please contact support to complete account closure.";

logger.info(`Account deletion complete for user: ${userId}`, {
  ...deletedData,
  success: deletedData.authAccount,
});

return {
  success: deletedData.authAccount,
  message,
  deletedData,
};
```

This keeps all the Firestore-side cleanup (which already completed successfully by this point in the function) intact and still reported via `deletedData`, but stops claiming total success when the user's login credentials are still active.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd functions && npx jest src/__tests__/deleteUserAccount.test.ts`
Expected: PASS, including all pre-existing tests in the file (verify none of them asserted `result.success === true` unconditionally in a way that's now broken by this change — if any did, they were implicitly relying on the bug and should be updated to mock `duaMockDeleteUser` succeeding, which is already its default per the fact-gathering pass).

- [ ] **Step 5: Typecheck and run the full functions suite**

Run: `cd functions && npx tsc --noEmit && npm test -- --passWithNoTests --forceExit`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
cd functions
git add src/callable/deleteUserAccount.ts src/__tests__/deleteUserAccount.test.ts
git commit -m "fix(homegroups-functions): deleteUserAccount reports partial failure instead of false success"
```

---

## Task 6: Stop Logging PII

**Files:**

- Modify: `functions/src/utils/email.ts`
- Modify: `functions/src/triggers/auth/onUserCreated.ts`
- Modify: `functions/src/triggers/pubsub/scheduledMilestoneCheck.ts`
- Modify: `functions/src/triggers/pubsub/scheduledMilestoneReminders.ts`
- Modify: `functions/src/callable/findMeetings.ts`

**Interfaces:** No signature changes anywhere — only log-line content changes. No new tests required (these are pure log-content edits with no behavioral branch to test; existing tests that assert on function behavior are unaffected since none of them assert on log message content).

**Context:** Five files log PII in violation of the root `CLAUDE.md` cross-cutting rule ("Never log PII to Cloud Functions logs, server logs, or client console in any product"): a full email address, a user's display name (paired with sobriety-milestone context — the most sensitive category for this product), and precise caller geolocation. Replace each with either nothing, a non-PII identifier (UID, doc ID), or a boolean/count.

- [ ] **Step 1: Fix `email.ts:28`**

Change:

```typescript
console.log(`Email sent successfully to ${to}`);
```

to:

```typescript
logger.info("Email sent successfully");
```

(Add `import * as logger from "firebase-functions/logger";` near the top of the file if not already imported — check first; this also fixes the pre-existing `console.log` rule violation in the same line.)

- [ ] **Step 2: Fix `onUserCreated.ts:74`**

Change:

```typescript
console.log(
  `SSO: auto-joined user ${user.uid} (domain: ${domain}) to group ${autoJoinGroupId} via intergroup ${intergroupId}`,
);
```

to:

```typescript
console.log(
  `SSO: auto-joined user ${user.uid} to group ${autoJoinGroupId} via intergroup ${intergroupId}`,
);
```

(Removes only the `(domain: ${domain})` segment — the email domain is a PII quasi-identifier per the review finding. Leave line 36's `console.log` as-is; it already logs only `user.uid` and `autoJoinGroupId`, no PII. Note: this file uses raw `console.log`, not `firebase-functions/logger` — leave that as a separate, lower-priority best-practices cleanup, not in scope for this PII-only task, unless the file already imports `logger` elsewhere, in which case match the existing import.)

- [ ] **Step 3: Fix `scheduledMilestoneCheck.ts:184` and `:188`**

Change:

```typescript
    functions.logger.info(
      `Sent personal milestone notification to ${userData.displayName}`,
    );
  } catch (error) {
    functions.logger.error(
      `Error sending personal milestone notification to ${userData.displayName}:`,
      error,
    );
  }
```

to:

```typescript
    functions.logger.info(
      "Sent personal milestone notification",
    );
  } catch (error) {
    functions.logger.error(
      "Error sending personal milestone notification:",
      error,
    );
  }
```

(If `userData` has an available non-PII identifier such as a UID already in scope at this point in the function, e.g. a `userId` variable, include it instead of dropping context entirely — check the surrounding function body for one; if none is in scope, the above is sufficient.)

- [ ] **Step 4: Fix `scheduledMilestoneReminders.ts:132`**

Change:

```typescript
functions.logger.info(
  `scheduledMilestoneReminders: sent reminder for ${displayName} (${daysLabel}) in group ${groupId} to ${tokens.length} admin token(s)`,
);
```

to:

```typescript
functions.logger.info(
  `scheduledMilestoneReminders: sent reminder (${daysLabel}) in group ${groupId} to ${tokens.length} admin token(s)`,
);
```

- [ ] **Step 5: Fix `findMeetings.ts:270-273` and `:281-286`**

Change:

```typescript
logger.info("findMeetings called with request:", {
  filters: request.data?.filters,
  criteria: request.data?.criteria,
});
```

to:

```typescript
logger.info("findMeetings called with request:", {
  hasLocationFilter: Boolean(request.data?.filters?.location),
  criteria: request.data?.criteria,
});
```

And change:

```typescript
logger.info("Processing meeting search with:", {
  type,
  dayFilter,
  location,
  criteria: meetingInput.criteria,
});
```

to:

```typescript
logger.info("Processing meeting search with:", {
  type,
  dayFilter,
  hasLocation: Boolean(location),
  criteria: meetingInput.criteria,
});
```

- [ ] **Step 6: Fix `findMeetings.ts:404`**

Change:

```typescript
        request: {
          filters: request.data?.filters,
          criteria: request.data?.criteria,
        },
```

to:

```typescript
        request: {
          hasLocationFilter: Boolean(request.data?.filters?.location),
          criteria: request.data?.criteria,
        },
```

- [ ] **Step 7: Typecheck and run the full functions suite**

Run: `cd functions && npx tsc --noEmit && npm test -- --passWithNoTests --forceExit`
Expected: both exit 0 (no test should have asserted on the removed PII in log calls, since logger calls aren't spied on for content in this codebase's existing tests per the fact-gathering pass — if any test unexpectedly fails, read it before changing test code, since a test asserting on logged PII would itself be a finding worth flagging, not silently working around).

- [ ] **Step 8: Commit**

```bash
cd functions
git add src/utils/email.ts src/triggers/auth/onUserCreated.ts src/triggers/pubsub/scheduledMilestoneCheck.ts src/triggers/pubsub/scheduledMilestoneReminders.ts src/callable/findMeetings.ts
git commit -m "fix(homegroups-functions): stop logging PII (emails, display names, precise location)"
```

---

## Task 7: Fix Silently-Failing Cron Jobs (Index Gaps)

**Files:**

- Modify: `functions/firestore.indexes.json`
- Modify: `functions/src/triggers/pubsub/scheduledMeetingReminders.ts`

**Interfaces:** No signature changes. `scheduledMeetingReminders`'s handler gains an outer try/catch matching `scheduledPositionReminders.ts`'s existing pattern, so a query failure is logged instead of propagating as an uncaught, unhandled invocation error.

**Context:** `scheduledPositionReminders.ts` queries `collectionGroup("servicePositions")` with a `termEndDate` range filter, but `firestore.indexes.json` has no index at all for `servicePositions` — collection-group range queries are never auto-indexed, so this almost certainly throws `FAILED_PRECONDITION` on every run (caught by the file's own try/catch and logged as an error, invisible without someone reading logs). `scheduledMeetingReminders.ts` queries `meetingInstances` with an equality filter (`isCancelled`) plus a range filter (`scheduledAt`); the only existing composite index for this collection lists fields in the order `[scheduledAt ASC, isCancelled ASC]` — range before equality, which Firestore composite indexes require in the opposite order for this query shape. Fix both by adding correct indexes, and add a missing try/catch to `scheduledMeetingReminders.ts` so future index/query failures are visible in logs rather than surfacing as raw uncaught errors.

- [ ] **Step 1: Add the missing `servicePositions` collection-group index**

In `functions/firestore.indexes.json`, add a new entry to the `indexes` array (anywhere in the array is fine; append near the end, immediately before the closing `]`):

```json
{
  "collectionGroup": "servicePositions",
  "queryScope": "COLLECTION_GROUP",
  "fields": [
    {
      "fieldPath": "termEndDate",
      "order": "ASCENDING"
    }
  ]
}
```

Note: this needs to be the LAST entry before the closing `],` of the `indexes` array, or otherwise correctly comma-separated from its neighbors — check the surrounding entries' exact comma placement before inserting (the file has a known unusual formatting quirk with a stray comma-on-its-own-line pattern around line 714; match whatever comma style the entry immediately before your insertion point uses).

- [ ] **Step 2: Add a corrected `meetingInstances` composite index**

In `functions/firestore.indexes.json`, add a new entry with the correct field order for `scheduledMeetingReminders.ts`'s actual query (equality field `isCancelled` before range field `scheduledAt`):

```json
{
  "collectionGroup": "meetingInstances",
  "queryScope": "COLLECTION",
  "fields": [
    {
      "fieldPath": "isCancelled",
      "order": "ASCENDING"
    },
    {
      "fieldPath": "scheduledAt",
      "order": "ASCENDING"
    }
  ]
}
```

Do NOT remove the existing incorrect entry at lines 267-280 (`[scheduledAt ASC, isCancelled ASC]`) — leave it in place. Removing an index is a separate, riskier operation (could affect an unknown caller relying on that exact field order) and isn't necessary to fix this bug; an extra unused index costs a small amount of storage/build time, not correctness.

- [ ] **Step 3: Add an outer try/catch to `scheduledMeetingReminders.ts`**

Wrap the handler body (currently `functions/src/triggers/pubsub/scheduledMeetingReminders.ts:19-131`, from `const now = new Date();` through the final `return null;`) in a try/catch matching `scheduledPositionReminders.ts`'s pattern:

```typescript
  .onRun(async () => {
    try {
      const now = new Date();
      const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

      // ... (all existing handler body content stays exactly as-is here) ...

      return null;
    } catch (error) {
      functions.logger.error(
        "Error during meeting reminder check:",
        error,
      );
      return null;
    }
  });
```

Every line of the existing handler body between `const now = new Date();` and the final `return null;` moves inside the `try` block unchanged — only the wrapping try/catch is new. Take care with the two existing early `return null;` statements inside the loop body (empty-results guard at the original lines 31-34, and it's actually a top-level early return, not inside the per-instance loop — verify placement when editing) — they stay as direct returns from within the try block, which is valid.

- [ ] **Step 4: Typecheck**

Run: `cd functions && npx tsc --noEmit`
Expected: exit 0. (`firestore.indexes.json` is not compiled, so no test/build step directly validates its JSON syntax — visually double-check it after editing, e.g. `python3 -m json.tool functions/firestore.indexes.json > /dev/null` or `node -e "JSON.parse(require('fs').readFileSync('functions/firestore.indexes.json'))"` to confirm valid JSON before committing.)

- [ ] **Step 5: Run the functions test suite**

Run: `cd functions && npm test -- --passWithNoTests --forceExit`
Expected: exit 0, including `scheduledMeetingReminders.ts`'s existing test file (per the review, this file has 6 existing tests that mock Firestore at the query-builder level — they test the reminder-window/cancelled-exclusion/token-collection logic, not real index behavior, so they should still pass unchanged since the try/catch wraps existing logic without altering it).

- [ ] **Step 6: Commit**

```bash
cd functions
git add firestore.indexes.json src/triggers/pubsub/scheduledMeetingReminders.ts
git commit -m "fix(homegroups-functions): add missing servicePositions index, correct meetingInstances index field order, guard scheduledMeetingReminders with try/catch"
```

**Follow-up note (not part of this task, flag to the user in the final wave report):** After this deploys, check Cloud Functions production logs for `scheduledPositionReminders` and `scheduledMeetingReminders` to confirm the `FAILED_PRECONDITION` errors stop appearing, and quantify how long the bug was live — this can only be verified against a real deployment, not locally.

---

## Task 8: Add Resource Config to Highest-Risk Functions

**Files:**

- Modify: `functions/src/triggers/pubsub/scheduledGroupBackups.ts`
- Modify: `functions/src/callable/generateTreasuryReport.ts`

**Interfaces:** No signature changes — only the `onSchedule`/`onCall` options objects gain explicit `memory`/`timeoutSeconds` values, following the exact pattern already used correctly by `getFacilityEngagementMetrics.ts`.

**Context:** Both functions run on Firebase's 256MiB/60s defaults today. `scheduledGroupBackups` iterates every active group monthly, doing 7 Firestore reads + a Storage write per group in batches of 10 — a realistic timeout/OOM candidate as group count grows. `generateTreasuryReport`'s `generatePDF` buffers an entire PDF in memory with no override at all (not even an options object). `getFacilityEngagementMetrics.ts:212-215` already proves the correct v2 syntax for this exact class of fix in this codebase.

- [ ] **Step 1: Add resource config to `scheduledGroupBackups.ts`**

Change the `onSchedule` call (currently lines 29-34):

```typescript
export const scheduledGroupBackups = onSchedule(
  {
    schedule: "0 2 1 * *",
    timeZone: "UTC",
    region: "us-central1",
  },
  async () => {
```

to:

```typescript
export const scheduledGroupBackups = onSchedule(
  {
    schedule: "0 2 1 * *",
    timeZone: "UTC",
    region: "us-central1",
    memory: "512MiB",
    timeoutSeconds: 540,
  },
  async () => {
```

(540 seconds is Cloud Functions v2's practical maximum for a non-min-instance function on the default 2nd-gen tier; this is a monthly job with real per-group I/O, so headroom matters more than cost here.)

- [ ] **Step 2: Add resource config to `generateTreasuryReport.ts`**

Change the `onCall` export (currently lines 39-40):

```typescript
export const generateTreasuryReport = onCall(
  async (request: CallableRequest<GenerateTreasuryReportData>) => {
```

to:

```typescript
export const generateTreasuryReport = onCall(
  { region: "us-central1", memory: "512MiB", timeoutSeconds: 120 },
  async (request: CallableRequest<GenerateTreasuryReportData>) => {
```

Confirm the file's existing `onCall` import already supports the two-argument `(options, handler)` form (it does — this is the same v2 `onCall` import used throughout the codebase, per `functions/CLAUDE.md`'s documented v2 pattern). Verify the region matches whatever region the rest of this callable's sibling functions in the same file/product use (default to `us-central1` per the reference pattern in `getFacilityEngagementMetrics.ts` unless you find evidence elsewhere in this specific file of a different region already in use).

- [ ] **Step 3: Typecheck**

Run: `cd functions && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Run the functions test suite**

Run: `cd functions && npm test -- --passWithNoTests --forceExit`
Expected: exit 0 (these are pure config additions with no behavioral change the existing tests would need to know about — if `generateTreasuryReport.ts`'s test file mocks `onCall` in a way that assumes single-argument calling, e.g. `jest.mock("firebase-functions/v2/https", ...)`'s `onCall` mock returning `arg1` when only one arg is a function, verify it also correctly returns `arg2` when the first arg is an options object, matching the pattern already used by other test files like `getPublicGroupProfile.test.ts`'s local `onCall` mock).

- [ ] **Step 5: Commit**

```bash
cd functions
git add src/triggers/pubsub/scheduledGroupBackups.ts src/callable/generateTreasuryReport.ts
git commit -m "fix(homegroups-functions): add explicit memory/timeout config to scheduledGroupBackups and generateTreasuryReport"
```

---

## Task 9: Register `intergroupSlice` and `brandingSlice` in the Redux Store

**Files:**

- Modify: `mobile/src/store/index.ts`
- Create: `mobile/src/store/__tests__/index.test.ts`

**Interfaces:** `RootState` gains two new top-level keys: `intergroup` and `branding`. Every existing `(state as any).intergroup?.field` / `(state as any).branding?.field` selector cast in `intergroupSlice.ts`/`brandingSlice.ts` now resolves against real, populated state instead of always-undefined state — this is the actual bug fix; the casts themselves are not touched by this task (removing them is a separate, lower-priority type-safety cleanup, not required to fix the functional bug).

**Context:** `intergroupSlice.ts` and `brandingSlice.ts` exist, export a default reducer each, and are actively dispatched-to/selected-from by `IntergroupDashboardScreen.tsx` and branding-consuming screens — but neither is registered in `store/index.ts`'s `configureStore` call. Dispatched thunks (e.g. `loadIntergroup`) succeed and fetch real data, but the result is silently discarded because no reducer exists to store it, so the screen shows "Intergroup not found" forever even though the network call worked.

- [ ] **Step 1: Write a failing test asserting the production store has all slice keys**

Create `mobile/src/store/__tests__/index.test.ts`:

```typescript
import { store } from "../index";

describe("production store configuration", () => {
  it("registers a reducer for every known slice, including intergroup and branding", () => {
    const expectedKeys = [
      "auth",
      "groups",
      "transactions",
      "treasury",
      "meetings",
      "announcements",
      "members",
      "chat",
      "servicePositions",
      "sponsorship",
      "reports",
      "treasurerHandoff",
      "businessMeetings",
      "directMessages",
      "dashboard",
      "adminRemoval",
      "recurringTransactions",
      "engagement",
      "referral",
      "stepWork",
      "reflections",
      "literature",
      "groupResources",
      "groupHealth",
      "intergroup",
      "branding",
    ];
    const actualKeys = Object.keys(store.getState());
    for (const key of expectedKeys) {
      expect(actualKeys).toContain(key);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd mobile && npx jest src/store/__tests__/index.test.ts`
Expected: FAIL — `actualKeys` is missing `intergroup` and `branding`.

- [ ] **Step 3: Register both slices in `store/index.ts`**

Add two import lines after the existing `import groupHealthReducer from './slices/groupHealthSlice';` (currently line 26):

```typescript
import intergroupReducer from "./slices/intergroupSlice";
import brandingReducer from "./slices/brandingSlice";
```

Add two entries to the `reducer: { ... }` object (currently lines 30-55), after the existing `groupHealth: groupHealthReducer,` line:

```typescript
    intergroup: intergroupReducer,
    branding: brandingReducer,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd mobile && npx jest src/store/__tests__/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and run the full mobile suite**

Run: `cd mobile && npx tsc --noEmit && npm test`
Expected: both exit 0. If `npx tsc --noEmit` surfaces new errors specifically tied to `RootState` now genuinely including `intergroup`/`branding` (e.g. a screen that previously relied on `(state as any)` now has a real, differently-shaped type available and TypeScript flags a mismatch), read the specific error before changing anything — this would indicate the slice's actual runtime shape doesn't match its own selector assumptions, which is worth surfacing as a new finding rather than silently patching around it. Report any such finding in the task report rather than guessing a fix.

- [ ] **Step 6: Commit**

```bash
cd mobile
git add src/store/index.ts src/store/__tests__/index.test.ts
git commit -m "fix(homegroups-mobile): register intergroupSlice and brandingSlice in the Redux store"
```

---

## Task 10: Fix `TreasurerHandoffScreen` Listener Leak

**Files:**

- Modify: `mobile/src/screens/homegroup/TreasurerHandoffScreen.tsx`

**Interfaces:** No signature changes — `subscribeToHandoffChanges` now returns its cleanup function through the `useEffect`, instead of the cleanup being silently discarded.

**Context:** `subscribeToHandoffChanges` (a local function defined inside the component, not a model/service function) already builds and returns an `unsubscribe` closure internally, but the `useEffect` that calls it (lines 81-84) calls it as a bare statement and never captures or returns that cleanup — so `onSnapshot`'s underlying listener is never torn down on unmount or `groupId` change, accumulating open listeners on repeated navigation.

- [ ] **Step 1: Fix the `useEffect`**

Change (currently `TreasurerHandoffScreen.tsx:81-84`):

```typescript
useEffect(() => {
  loadData();
  subscribeToHandoffChanges();
}, [groupId]);
```

to:

```typescript
useEffect(() => {
  loadData();
  return subscribeToHandoffChanges();
}, [groupId]);
```

This works because `subscribeToHandoffChanges` (lines 129-145) already returns `() => unsubscribe()` as its own return value — the only change needed is propagating that return through the `useEffect`'s cleanup slot via `return subscribeToHandoffChanges();`.

- [ ] **Step 2: Add a regression test**

If `mobile/src/screens/homegroup/__tests__/TreasurerHandoffScreen.test.tsx` does not exist, create it; if it exists, add this test to it. Check the file's existing Firestore-mocking conventions first (this codebase mocks `@react-native-firebase/firestore` per-file, per the established pattern seen in other screen tests like `GroupTreasuryScreen.test.tsx`) and match that style. Test intent:

```typescript
it('unsubscribes from the group snapshot listener on unmount', () => {
  const mockUnsubscribe = jest.fn();
  const mockOnSnapshot = jest.fn().mockReturnValue(mockUnsubscribe);
  // Wire mockOnSnapshot into this file's existing firestore().collection().doc().onSnapshot mock,
  // matching however this codebase's other screen tests mock chained Firestore calls.

  const { unmount } = render(<TreasurerHandoffScreen /* ...required props/navigation context per this screen's existing test setup... */ />);

  expect(mockOnSnapshot).toHaveBeenCalled();
  unmount();
  expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
});
```

Adapt the exact mock wiring and required test-rendering scaffolding (navigation/route context, Redux provider, etc.) to match whatever this codebase's other `homegroup/__tests__/*.test.tsx` files already establish — do not invent a new test-harness pattern for this one screen.

- [ ] **Step 3: Run the test to verify it passes**

Run: `cd mobile && npx jest src/screens/homegroup/__tests__/TreasurerHandoffScreen.test.tsx`
Expected: PASS.

- [ ] **Step 4: Typecheck and run the full mobile suite**

Run: `cd mobile && npx tsc --noEmit && npm test`
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
cd mobile
git add src/screens/homegroup/TreasurerHandoffScreen.tsx src/screens/homegroup/__tests__/TreasurerHandoffScreen.test.tsx
git commit -m "fix(homegroups-mobile): fix TreasurerHandoffScreen Firestore listener leak"
```

---

## Task 11: Fix Chat Typing-Indicator Write/Listener Amplification Chain

**Files:**

- Modify: `mobile/src/screens/homegroup/GroupChatScreen.tsx`
- Modify: `mobile/src/screens/homegroup/GroupOverviewScreen.tsx`

**Interfaces:** No signature changes. `handleTyping` now debounces its Firestore write (only writes if the last write was ≥1.5s ago) instead of writing on every keystroke. `GroupOverviewScreen`'s unread-count listener switches from a whole-document `onSnapshot` to one scoped via `docChanges()` filtering, so a `typing` field change alone no longer triggers `fetchUnreadCount`.

**Context:** Every keystroke in `GroupChatScreen`'s message input calls `handleTyping`, which writes to `group_chats/{groupId}.typing.{uid}` on every call with zero debounce on the write itself (only the "clear typing after 5s" timeout is debounced). `GroupOverviewScreen` (which stays mounted underneath `GroupChatScreen` since this codebase's navigators don't set `unmountOnBlur`) has an `onSnapshot` listener on the entire `group_chats/{groupId}` document that fires `fetchUnreadCount` on ANY change to that document — including the typing writes. Net effect: every keystroke of every typing member triggers a live Firestore write, which fans out to a full unread-count query. Fix both ends: debounce the typing write, and scope the listener so typing-only changes don't trigger the unread-count fetch.

- [ ] **Step 1: Debounce the typing-indicator write in `GroupChatScreen.tsx`**

Add a ref to track the last write time near the existing `typingTimerRef` declaration (currently `GroupChatScreen.tsx:109`):

```typescript
const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
const lastTypingWriteRef = useRef<number>(0);
```

Change `handleTyping` (currently lines 625-658):

```typescript
const handleTyping = (text: string) => {
  setMessageText(text);

  if (!currentUser || !groupId) return;

  // Write typing indicator (non-critical, ignore errors) — debounced to
  // at most once per 1.5s to avoid a Firestore write on every keystroke,
  // which was fanning out into GroupOverviewScreen's unread-count listener
  // on every change to this document.
  const now = Date.now();
  if (now - lastTypingWriteRef.current >= 1500) {
    lastTypingWriteRef.current = now;
    firestore()
      .collection("group_chats")
      .doc(groupId)
      .set(
        {
          typing: {
            [currentUser.uid]: {
              name: currentUser.displayName || "Someone",
              at: firestore.Timestamp.now(),
            },
          },
        },
        { merge: true },
      )
      .catch(() => {});
  }

  // Clear own typing entry after 5s of inactivity
  if (typingTimerRef.current) {
    clearTimeout(typingTimerRef.current);
  }
  typingTimerRef.current = setTimeout(() => {
    firestore()
      .collection("group_chats")
      .doc(groupId)
      .update({ [`typing.${currentUser.uid}`]: firestore.FieldValue.delete() })
      .catch(() => {});
  }, 5000);
};
```

- [ ] **Step 2: Scope `GroupOverviewScreen`'s unread-count listener away from typing changes**

Change the listener (currently `GroupOverviewScreen.tsx:236-250`):

```typescript
// Listen for new messages in real-time to update unread badge
useEffect(() => {
  const currentUser = auth().currentUser;
  if (!currentUser) {
    return;
  }
  const unsubscribe = firestore()
    .collection("group_chats")
    .doc(groupId)
    .onSnapshot((snapshot) => {
      if (snapshot.exists) {
        dispatch(fetchUnreadCount(groupId));
      }
    });
  return unsubscribe;
}, [groupId, dispatch]);
```

to:

```typescript
// Listen for new messages in real-time to update unread badge.
// Scoped to lastMessageAt so typing-indicator writes to the same document
// (which touch a different field, `typing`) don't trigger an unread-count
// refetch on every keystroke of every typing member.
useEffect(() => {
  const currentUser = auth().currentUser;
  if (!currentUser) {
    return;
  }
  let lastKnownMessageAt: number | null = null;
  const unsubscribe = firestore()
    .collection("group_chats")
    .doc(groupId)
    .onSnapshot((snapshot) => {
      if (!snapshot.exists) return;
      const data = snapshot.data();
      const lastMessageAt = data?.lastMessageAt?.toMillis?.() ?? null;
      if (lastMessageAt !== null && lastMessageAt !== lastKnownMessageAt) {
        lastKnownMessageAt = lastMessageAt;
        dispatch(fetchUnreadCount(groupId));
      }
    });
  return unsubscribe;
}, [groupId, dispatch]);
```

This assumes `group_chats/{groupId}` has a `lastMessageAt` field updated on real messages (not on typing writes) — verify this field exists on the document by checking `ChatModel.ts` or wherever `group_chats` documents are written on message send (e.g. near `GroupChatScreen.tsx`'s send-message logic, which per the file's grep results is distinct from `handleTyping`). If no such field currently exists, add `lastMessageAt: firestore.FieldValue.serverTimestamp()` to whatever write happens on actual message send (not the typing write) as part of this same task, so the listener has a real signal to key off. Report which of these two cases applied in your task report.

- [ ] **Step 3: Write regression tests**

In `GroupChatScreen.tsx`'s existing test file, add a test asserting `handleTyping` called twice within 1.5s only writes once:

```typescript
it("debounces the typing-indicator Firestore write to at most once per 1.5s", () => {
  jest.useFakeTimers();
  // ...render GroupChatScreen per its existing test setup...
  // simulate two rapid onChangeText calls on the message input
  // fireEvent.changeText(input, 'h');
  // fireEvent.changeText(input, 'he');
  expect(mockSet).toHaveBeenCalledTimes(1); // wire to this file's existing group_chats doc().set mock
  jest.useRealTimers();
});
```

In `GroupOverviewScreen.tsx`'s existing test file, add a test asserting the listener ignores a typing-only change:

```typescript
it("does not refetch unread count when only the typing field changes", () => {
  // simulate the onSnapshot callback firing with a snapshot whose data has
  // an unchanged lastMessageAt but a new `typing` field
  // expect(mockFetchUnreadCountDispatch).not.toHaveBeenCalled();
});
```

Adapt both to each file's already-established test-rendering/mocking scaffolding (Redux provider setup, `@react-native-firebase/firestore` mock shape) — read each file's existing tests first rather than inventing new harness code.

- [ ] **Step 4: Run both test files to verify they pass**

Run: `cd mobile && npx jest src/screens/homegroup/__tests__/GroupChatScreen.test.tsx src/screens/homegroup/__tests__/GroupOverviewScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck and run the full mobile suite**

Run: `cd mobile && npx tsc --noEmit && npm test`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
cd mobile
git add src/screens/homegroup/GroupChatScreen.tsx src/screens/homegroup/GroupOverviewScreen.tsx
git commit -m "fix(homegroups-mobile): debounce chat typing-indicator writes and scope the unread-count listener"
```

---

## Task 12: Add CI Safety Net — Firestore Rules Tests + Mobile Jest

**Files:**

- Modify: `.github/workflows/ci.yml`

**Interfaces:** Two additions to the root CI workflow: a new `firestore-rules` job, and a new mobile-jest step. No changes to any of the four existing jobs (`recovery-api`, `homegroups-functions`, `regroup-functions`, `detox-recovery`) or to `maestro-smoke`.

**Context:** `functions/jest.config.js` excludes `security-rules.test.ts` (needs a Firestore emulator), and the script that would run it (`npm run test:rules`, which wraps `firebase emulators:exec --only firestore 'npm run test'`) is never invoked anywhere in CI. `homegroups/mobile` has zero CI presence at all today — not even a typecheck job. This task closes both gaps so every fix in Tasks 1-11 is protected against regression going forward, and so is everything else in this codebase already covered by the existing (currently unrun) test files.

- [ ] **Step 1: Add a `firestore-rules` job**

In `.github/workflows/ci.yml`, add a new job after the existing `homegroups-functions` job (currently ending around line 45), before `regroup-functions`:

```yaml
homegroups-firestore-rules:
  name: homegroups/functions — Firestore security rules
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: "22"
        cache: "npm"
        cache-dependency-path: homegroups/functions/package-lock.json
    - uses: actions/setup-java@v4
      with:
        distribution: "temurin"
        java-version: "17"
    - name: Install dependencies
      run: cd homegroups/functions && npm ci
    - name: Run Firestore rules tests
      run: cd homegroups/functions && npm run test:rules
```

(Java is required because `firebase emulators:exec` runs the Firestore emulator, which is JVM-based — confirmed via `functions/package.json`'s `test:rules` script wrapping `firebase emulators:exec --only firestore`.)

- [ ] **Step 2: Add a mobile Jest job**

Add a second new job immediately after `homegroups-firestore-rules`:

```yaml
homegroups-mobile:
  name: homegroups/mobile — test
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: "22"
        cache: "npm"
        cache-dependency-path: homegroups/mobile/package-lock.json
    - name: Install dependencies
      run: cd homegroups/mobile && npm ci
    - name: Test
      run: cd homegroups/mobile && npm test -- --ci
```

Note: `mobile/package.json` has no `typecheck`/`tsc` script (confirmed during fact-gathering) and its `tsc --noEmit` was previously noted elsewhere as having pre-existing latent type errors — this task adds `npm test` (Jest) only, per the plan's scope. Do not add a `tsc --noEmit` step here; that's a separate follow-up (fixing the latent type errors first) outside this task.

- [ ] **Step 3: Update the `maestro-smoke` job's `needs` list if appropriate**

Check the existing `maestro-smoke` job's `needs: [recovery-api, homegroups-functions, regroup-functions, detox-recovery]` (currently around line 83). Since `maestro-smoke` builds and tests `regroup/mobile` specifically (not `homegroups`), the two new homegroups jobs are not a correctness dependency for it — leave `needs` unchanged. Do not add the new jobs to this list.

- [ ] **Step 4: Validate the YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` (or `node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/ci.yml', 'utf8'))"` if `js-yaml` is available; if neither tool is available in this environment, visually verify indentation matches the existing jobs exactly — 2-space indent, `jobs:` → job name → `name:`/`runs-on:`/`steps:` all at consistent depth matching the four existing jobs).

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(homegroups): add Firestore security rules test job and mobile Jest job"
```

**Note for the controller:** this task cannot be fully verified locally (GitHub Actions runners aren't available in this environment) — the task reviewer should check the YAML is syntactically valid and structurally consistent with the existing jobs, but actual execution can only be confirmed once this branch's CI run completes on GitHub. Flag this in the task report rather than claiming full verification.

---

## Self-Review Notes

- **Spec coverage:** all 12 P0 Critical, code-fixable findings from `.full-review/05-final-report.md` are covered by exactly one task each (Task 1 covers both the treasury and milestone counter findings, which share one root cause and fix pattern). The two P0 items NOT covered here are intentionally out of scope: the Firestore self-join policy question (user decided to keep it as-is) and standing up a staging Firebase project (an infrastructure/ops action, not a code change — tracked for a future wave).
- **Placeholder scan:** no TBD/"add error handling"/"similar to Task N" language present. A few steps (Tasks 10 and 11's test-file creation, Task 5's `makeAuthRequest` argument order) explicitly instruct the implementer to read an existing file's established conventions first rather than guessing blind, since the research pass for this plan did not capture 100% of every test file's boilerplate — this is a deliberate, bounded exception noted inline at each occurrence, not an open-ended placeholder.
- **Type consistency:** `PublicSearchResult` (Task 4) and the transaction-based rewrite (Task 1) reuse existing types (`TransactionDocument`, `TreasuryOverviewDocument`) without renaming any field. `sendMentionNotifications.ts` (Task 3)'s `SendMentionData`/`ChatMessage` interfaces are unchanged — only handler logic changes.
