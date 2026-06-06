> ⚠️ **Legacy document.** Carried over from the standalone `regroup-functions` repository, archived on 2026-06-06. Historical reference only — may be outdated and is NOT part of current `regroup` documentation.

# Consolidate Guest Write Triggers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge `addDeleteGuestAuthorization` (`onDocumentDeleted`) and `eesRecalculationOnGuestWrite` (`onDocumentWritten`) — both watching the top-level `guests/{guestId}` collection — into a single `onGuestWrite` export using `onDocumentWritten`. Reduces deployed function count by 1, freeing ~0.334 vCPU of Cloud Run quota (0.167 × maxInstances:2).

**Architecture:** Replace the two separate exports with one `onDocumentWritten("guests/{guestId}")` handler that:

1. Always runs EES recalculation (fires on create, update, and delete — same as current `eesRecalculationOnGuestWrite`).
2. Conditionally runs auth claims cleanup only when the event is a delete (`event.data.after.exists === false`).

Both operations run independently inside the same invocation — a failure in one does not prevent the other from running.

**Tech Stack:** `firebase-functions/v2/firestore` (`onDocumentWritten`), TypeScript, Jest, `firebase-admin` auth + firestore.

---

## Corrections to the Phase 2 description in the consolidate-weekly-transfers plan

The prior plan described these triggers as watching `/houses/{houseId}/guests/{guestId}`.
**This is wrong.** The actual paths are:

- `addDeleteGuestAuthorization` → `onDocumentDeleted("/guests/{guestId}")` (leading slash, top-level collection)
- `eesRecalculationOnGuestWrite` → `onDocumentWritten("guests/{guestId}")` (no leading slash, same top-level collection)

Both watch the same flat `guests` collection. The merged function will use `guests/{guestId}` (no leading slash, matching Firebase v2 convention).

---

## Context & Background

### Current state

**`addDeleteGuestAuthorization`** (lines 168–188 of `src/triggers/firestore/index.ts`):

- Trigger: `onDocumentDeleted("/guests/{guestId}")`
- On delete: reads the deleted guest document via `event.data?.data()`, calls `deleteClaim()` twice (once for "guest" role, once for "admin" role), then calls `auth().setCustomUserClaims()` with the combined result.
- Error handling: no try/catch — errors propagate naturally and Firebase will retry.
- Tests: 2 behavioral tests (happy path + missing data guard). Well covered.

**`eesRecalculationOnGuestWrite`** (lines 201–267 of `src/triggers/firestore/index.ts`):

- Trigger: `onDocumentWritten("guests/{guestId}")`
- On any write: reads `houseId` from the guest document (preferring `after`, falling back to `before` for deletes), queries the `guests` collection to count active residents, queries `ees-records` for the current ISO week, and batch-updates `amount` and `residentCount` on all unpaid EES records for that house.
- Active guest filter: excludes docs where `moveOutDate` is set, or `status` is `"inactive"` or `"expelled"`.
- Error handling: full try/catch — logs the error and **re-throws** so Firebase can retry the invocation.
- Tests: **1 smoke test only** (checks `typeof triggers.eesRecalculationOnGuestWrite === "function"`). No behavioral tests exist.

### Why no behavioral tests for EES yet

The current `firebase-admin` mock in `src/__tests__/triggers/firestore.test.ts` only provides a minimal `firestore()` mock:

```typescript
firestore: jest.fn(() => ({
  collection: jest.fn(() => ({
    doc: jest.fn(() => ({ update: jest.fn() })),
  })),
})),
```

This does not support the chained `.where().where().get()` calls or `.batch()` that `eesRecalculationOnGuestWrite` uses. Behavioral tests were deferred. **This plan adds them before the merge.**

### Merge design decisions

| Question                            | Decision                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Which trigger type?                 | `onDocumentWritten` — superset of deleted, so auth cleanup can be conditionally gated                                                      |
| How to detect delete?               | `!event.data.after.exists` — Firebase's authoritative flag                                                                                 |
| Auth cleanup source data on delete? | `event.data.before.data()` — the pre-deletion snapshot                                                                                     |
| Error isolation?                    | Yes — auth cleanup and EES recalculation each have their own try/catch; a failure in one logs and continues rather than aborting the other |
| Re-throw on error?                  | Re-throw only if **both** operations fail; if only one fails, log and continue so the other's work is not lost on retry                    |
| Export name?                        | `onGuestWrite` — replaces both old exports                                                                                                 |
| Collection path?                    | `guests/{guestId}` (no leading slash, Firebase v2 convention)                                                                              |

### Quota impact

Current: 2 separate Cloud Run function slots × (0.167 cpu × 2 maxInstances) = 0.668 vCPU drawn.
After: 1 slot × 0.334 vCPU drawn.
**Net saving: 0.334 vCPU** headroom toward the 20 vCPU ceiling.

---

## File Structure

```
functions/
└── src/
    ├── triggers/
    │   └── firestore/
    │       └── index.ts          # MODIFIED — remove 2 exports, add 1
    └── __tests__/
        └── triggers/
            └── firestore.test.ts # MODIFIED — add EES behavioral tests + merge tests
```

No new files required. The firestore mock infrastructure already exists in the test file and needs only to be extended.

---

## Task 1: Add behavioral tests for `eesRecalculationOnGuestWrite`

Before merging, the EES function must have real test coverage. Writing tests first also confirms the current implementation behaves correctly and gives a regression baseline.

**Files:**

- Modify: `functions/src/__tests__/triggers/firestore.test.ts`

- [ ] **Step 1: Extend the `firebase-admin` mock to support Firestore queries and batch writes**

In `firestore.test.ts`, replace the current minimal `firestore` mock with one that supports chained `.where().get()` and `.batch()`. Place this near the top of the file, alongside the existing mock declarations:

```typescript
// ─── Firestore query + batch mock ────────────────────────────────────────────
const mockBatchUpdate = jest.fn();
const mockBatchCommit = jest.fn().mockResolvedValue(undefined);
const mockBatch = { update: mockBatchUpdate, commit: mockBatchCommit };

const mockGuestsGet = jest.fn();
const mockEesGet = jest.fn();

// Returns a chainable query builder. The final .get() is replaced by whichever
// mock is set for that collection.
function makeQueryChain(getFn: jest.Mock) {
  const chain = {
    where: jest.fn().mockReturnThis(),
    get: getFn,
  };
  return chain;
}

jest.mock("firebase-admin", () => ({
  auth: jest.fn(() => mockAuthInstance),
  app: jest.fn(() => ({})),
  firestore: jest.fn(() => ({
    collection: jest.fn((name: string) => {
      if (name === "guests") return makeQueryChain(mockGuestsGet);
      if (name === "ees-records") return makeQueryChain(mockEesGet);
      return makeQueryChain(jest.fn().mockResolvedValue({ docs: [] }));
    }),
    batch: jest.fn(() => mockBatch),
  })),
  messaging: jest.fn(() => ({ sendEachForMulticast: jest.fn() })),
  initializeApp: jest.fn(),
}));
```

Update the `beforeEach` block to also clear the new mocks:

```typescript
beforeEach(() => {
  jest.clearAllMocks();
  mockBatchCommit.mockResolvedValue(undefined);
});
```

- [ ] **Step 2: Add the `eesRecalculationOnGuestWrite` import to the main import line**

Change:

```typescript
import {
  notify,
  notifyNewHouseCreated,
  sendContactEmail,
  sendSubscriptionUpdateEmail,
  reportBug,
  submitFeedback,
  addDeleteGuestAuthorization,
} from "../../triggers/firestore";
```

To:

```typescript
import {
  notify,
  notifyNewHouseCreated,
  sendContactEmail,
  sendSubscriptionUpdateEmail,
  reportBug,
  submitFeedback,
  addDeleteGuestAuthorization,
  eesRecalculationOnGuestWrite,
} from "../../triggers/firestore";
```

- [ ] **Step 3: Add a helper for `onDocumentWritten` events**

Add alongside the existing `makeEvent` and `makeUpdatedEvent` helpers:

```typescript
/** Simulates an onDocumentWritten event (create, update, or delete). */
const makeWrittenEvent = (
  beforeData: any,
  afterData: any,
  guestId = "guest-1",
) => ({
  data: {
    before: { data: () => beforeData, exists: beforeData !== null },
    after: { data: () => afterData, exists: afterData !== null },
  },
  params: { guestId },
});
```

- [ ] **Step 4: Replace the smoke test with full behavioral tests**

Delete the existing single-assertion `eesRecalculationOnGuestWrite` describe block and replace it with:

```typescript
describe("eesRecalculationOnGuestWrite", () => {
  const activeGuest = {
    houseId: "house-1",
    status: "active",
    moveOutDate: undefined,
  };
  const inactiveGuest = { houseId: "house-1", status: "inactive" };
  const expelledGuest = {
    houseId: "house-1",
    status: "expelled",
    moveOutDate: "2026-01-01",
  };

  function makeGuestSnap(guests: any[]) {
    return { docs: guests.map((d) => ({ data: () => d })) };
  }

  function makeEesSnap(records: any[]) {
    return {
      empty: records.length === 0,
      docs: records.map((r, i) => ({
        data: () => r,
        ref: { id: `ees-${i}` },
      })),
    };
  }

  it("recalculates EES when a guest is updated", async () => {
    mockGuestsGet.mockResolvedValue(
      makeGuestSnap([activeGuest, activeGuest]), // 2 active guests
    );
    mockEesGet.mockResolvedValue(
      makeEesSnap([{ houseId: "house-1", totalExpenses: 200, paid: false }]),
    );

    const event = makeWrittenEvent(activeGuest, { ...activeGuest, step: 2 });
    await (eesRecalculationOnGuestWrite as Function)(event);

    expect(mockBatchUpdate).toHaveBeenCalledWith(expect.anything(), {
      amount: 100,
      residentCount: 2,
    });
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });

  it("excludes inactive and expelled guests from the active count", async () => {
    mockGuestsGet.mockResolvedValue(
      makeGuestSnap([activeGuest, inactiveGuest, expelledGuest]),
    );
    mockEesGet.mockResolvedValue(
      makeEesSnap([{ houseId: "house-1", totalExpenses: 100, paid: false }]),
    );

    const event = makeWrittenEvent(activeGuest, activeGuest);
    await (eesRecalculationOnGuestWrite as Function)(event);

    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { amount: 100, residentCount: 1 }, // only 1 active
    );
  });

  it("uses the before snapshot houseId on a delete event", async () => {
    mockGuestsGet.mockResolvedValue(makeGuestSnap([activeGuest]));
    mockEesGet.mockResolvedValue(
      makeEesSnap([{ houseId: "house-1", totalExpenses: 50, paid: false }]),
    );

    // delete: after is null
    const event = makeWrittenEvent(activeGuest, null);
    await (eesRecalculationOnGuestWrite as Function)(event);

    expect(mockBatchUpdate).toHaveBeenCalledWith(expect.anything(), {
      amount: 50,
      residentCount: 1,
    });
  });

  it("returns early when no EES records exist for the current week", async () => {
    mockGuestsGet.mockResolvedValue(makeGuestSnap([activeGuest]));
    mockEesGet.mockResolvedValue(makeEesSnap([]));

    const event = makeWrittenEvent(activeGuest, activeGuest);
    await (eesRecalculationOnGuestWrite as Function)(event);

    expect(mockBatchCommit).not.toHaveBeenCalled();
  });

  it("returns early when activeCount is zero", async () => {
    mockGuestsGet.mockResolvedValue(
      makeGuestSnap([inactiveGuest, expelledGuest]),
    );

    const event = makeWrittenEvent(activeGuest, activeGuest);
    await (eesRecalculationOnGuestWrite as Function)(event);

    expect(mockEesGet).not.toHaveBeenCalled();
    expect(mockBatchCommit).not.toHaveBeenCalled();
  });

  it("returns early when event data is entirely missing", async () => {
    const event = { data: undefined, params: { guestId: "g-1" } };
    await (eesRecalculationOnGuestWrite as Function)(event);
    expect(mockGuestsGet).not.toHaveBeenCalled();
  });

  it("re-throws on Firestore failure so Firebase can retry", async () => {
    mockGuestsGet.mockRejectedValue(new Error("Firestore unavailable"));

    const event = makeWrittenEvent(activeGuest, activeGuest);
    await expect(
      (eesRecalculationOnGuestWrite as Function)(event),
    ).rejects.toThrow("Firestore unavailable");
  });
});
```

- [ ] **Step 5: Run the new EES tests**

```bash
cd functions && npx jest src/__tests__/triggers/firestore.test.ts --testNamePattern="eesRecalculation"
```

Expected: All 7 new EES tests pass. If any fail, fix the test helpers (mock shape) before proceeding — do **not** change production code at this step.

- [ ] **Step 6: Run the full trigger test suite to confirm no regressions**

```bash
cd functions && npx jest src/__tests__/triggers/firestore.test.ts
```

Expected: All tests pass including the original `addDeleteGuestAuthorization` tests.

- [ ] **Step 7: Commit**

```bash
git add functions/src/__tests__/triggers/firestore.test.ts
git commit -m "test(triggers): add behavioral tests for eesRecalculationOnGuestWrite"
```

---

## Task 2: Write failing tests for the merged `onGuestWrite` handler

- [ ] **Step 1: Add failing tests for the merged export at the bottom of `firestore.test.ts`**

```typescript
// ─── onGuestWrite (merged) ────────────────────────────────────────────────────
// These tests will fail until Task 3 implements the export.

describe("onGuestWrite (merged handler)", () => {
  const guest = { userId: "user-1", houseId: "house-1", status: "active" };

  beforeEach(() => {
    mockDeleteClaim
      .mockResolvedValueOnce({ guest: [] })
      .mockResolvedValueOnce({ admin: [] });
    mockGuestsGet.mockResolvedValue({
      docs: [{ data: () => guest }],
    });
    mockEesGet.mockResolvedValue({ empty: true, docs: [] });
  });

  it("runs EES recalculation on a create event", async () => {
    const { onGuestWrite } = require("../../triggers/firestore");
    const event = makeWrittenEvent(null, guest);

    await (onGuestWrite as Function)(event);

    expect(mockGuestsGet).toHaveBeenCalledTimes(1);
    expect(mockDeleteClaim).not.toHaveBeenCalled(); // no auth change on create
  });

  it("runs EES recalculation on an update event", async () => {
    const { onGuestWrite } = require("../../triggers/firestore");
    const event = makeWrittenEvent(guest, { ...guest, step: 2 });

    await (onGuestWrite as Function)(event);

    expect(mockGuestsGet).toHaveBeenCalledTimes(1);
    expect(mockDeleteClaim).not.toHaveBeenCalled(); // no auth change on update
  });

  it("runs both EES recalculation and auth cleanup on a delete event", async () => {
    const { onGuestWrite } = require("../../triggers/firestore");
    mockEesGet.mockResolvedValue({
      empty: false,
      docs: [{ data: () => ({ totalExpenses: 100, paid: false }), ref: {} }],
    });
    const event = makeWrittenEvent(guest, null);

    await (onGuestWrite as Function)(event);

    expect(mockGuestsGet).toHaveBeenCalledTimes(1); // EES ran
    expect(mockDeleteClaim).toHaveBeenCalledTimes(2); // auth cleanup ran
    expect(mockSetCustomUserClaims).toHaveBeenCalledTimes(1);
  });

  it("still runs EES if auth cleanup fails on delete", async () => {
    const { onGuestWrite } = require("../../triggers/firestore");
    mockDeleteClaim.mockRejectedValue(new Error("Auth service down"));
    mockGuestsGet.mockResolvedValue({ docs: [{ data: () => guest }] });
    mockEesGet.mockResolvedValue({ empty: true, docs: [] });

    const event = makeWrittenEvent(guest, null);
    // Should not throw — EES still completes even if auth cleanup failed
    await expect((onGuestWrite as Function)(event)).resolves.toBeUndefined();
    expect(mockGuestsGet).toHaveBeenCalledTimes(1);
  });

  it("still runs auth cleanup if EES fails on delete", async () => {
    const { onGuestWrite } = require("../../triggers/firestore");
    mockGuestsGet.mockRejectedValue(new Error("Firestore down"));

    const event = makeWrittenEvent(guest, null);
    await expect((onGuestWrite as Function)(event)).resolves.toBeUndefined();
    expect(mockDeleteClaim).toHaveBeenCalledTimes(2); // auth cleanup still ran
  });
});
```

- [ ] **Step 2: Run to confirm the tests fail**

```bash
cd functions && npx jest src/__tests__/triggers/firestore.test.ts --testNamePattern="onGuestWrite"
```

Expected: FAIL — `onGuestWrite` is not exported yet.

- [ ] **Step 3: Commit the failing tests**

```bash
git add functions/src/__tests__/triggers/firestore.test.ts
git commit -m "test(triggers): add failing tests for merged onGuestWrite handler"
```

---

## Task 3: Implement the merged `onGuestWrite` handler

**Files:**

- Modify: `functions/src/triggers/firestore/index.ts`

- [ ] **Step 1: Add `onGuestWrite` export and remove the two old exports**

In `src/triggers/firestore/index.ts`, delete the entire `addDeleteGuestAuthorization` export block (lines 168–188) and the entire `eesRecalculationOnGuestWrite` export block (lines 201–267). Replace both with:

```typescript
// ─────────────────────────────────────────────────────────────────────────────
// onGuestWrite
//
// Merged handler replacing addDeleteGuestAuthorization + eesRecalculationOnGuestWrite.
// Fires on every create, update, or delete of a document in guests/{guestId}.
//
// On DELETE only: removes the departed guest's Firebase Auth custom claims.
// On ALL writes:  recalculates the Equal Expense Share (EES) amount for the
//                 house based on the updated active resident count.
//
// Both operations run independently — a failure in one is logged and does not
// abort the other. This preserves the retry semantics of the original EES
// function while also preventing a flaky Auth service from blocking EES updates.
// ─────────────────────────────────────────────────────────────────────────────
export const onGuestWrite = onDocumentWritten(
  "guests/{guestId}",
  async (event) => {
    const isDelete = !event.data?.after?.exists;
    const guestData = event.data?.after?.data() ?? event.data?.before?.data();
    if (!guestData) return;

    let authError: Error | null = null;
    let eesError: Error | null = null;

    // ── Auth claims cleanup (delete events only) ──────────────────────────────
    if (isDelete) {
      try {
        const guest = event.data!.before.data() as Guest;
        const userClaims = await deleteClaim(
          guest.userId,
          [guest.houseId],
          "guest",
        );
        const adminClaims = await deleteClaim(
          guest.userId,
          [guest.houseId],
          "admin",
        );
        await auth().setCustomUserClaims(guest.userId, {
          ...userClaims,
          ...adminClaims,
        });
      } catch (err) {
        authError = err as Error;
        logger.error("onGuestWrite: auth claims cleanup failed", {
          guestId: event.params.guestId,
          error: authError.message,
        });
      }
    }

    // ── EES recalculation (all write types) ───────────────────────────────────
    try {
      const houseId = guestData.houseId as string | undefined;
      if (!houseId) return;

      const db = admin.firestore();

      const guestsSnap = await db
        .collection("guests")
        .where("houseId", "==", houseId)
        .get();

      const activeCount = guestsSnap.docs.filter(
        (d) =>
          !d.data().moveOutDate &&
          d.data().status !== "inactive" &&
          d.data().status !== "expelled",
      ).length;
      if (activeCount === 0) return;

      const weekStart = new Date();
      const day = weekStart.getDay();
      weekStart.setDate(weekStart.getDate() - (day === 0 ? 6 : day - 1));
      const weekStartStr = weekStart.toISOString().slice(0, 10);

      const eesSnap = await db
        .collection("ees-records")
        .where("houseId", "==", houseId)
        .where("weekStart", "==", weekStartStr)
        .where("paid", "==", false)
        .get();

      if (eesSnap.empty) return;

      const firstRecord = eesSnap.docs[0].data();
      const totalExpenses = (firstRecord.totalExpenses as number) ?? 0;
      const newAmount = totalExpenses > 0 ? totalExpenses / activeCount : 0;

      const batch = db.batch();
      eesSnap.docs.forEach((doc) => {
        batch.update(doc.ref, {
          amount: newAmount,
          residentCount: activeCount,
        });
      });
      await batch.commit();

      logger.info(
        `onGuestWrite: EES recalculated for house ${houseId}: ${activeCount} residents, $${newAmount.toFixed(2)} each`,
      );
    } catch (err) {
      eesError = err as Error;
      logger.error("onGuestWrite: EES recalculation failed", {
        guestId: event.params.guestId,
        error: eesError.message,
      });
    }

    // Re-throw only if the EES operation failed — auth claim failures are
    // non-retryable (a deleted guest doc won't trigger this again).
    if (eesError) throw eesError;
  },
);
```

- [ ] **Step 2: Remove the `onDocumentDeleted` import if no longer used**

Check whether any other export in the file uses `onDocumentDeleted`. If not, remove it from the import:

```typescript
// Before
import {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentDeleted,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";

// After (if onDocumentDeleted is unused)
import {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
```

- [ ] **Step 3: Run the merged handler tests**

```bash
cd functions && npx jest src/__tests__/triggers/firestore.test.ts --testNamePattern="onGuestWrite"
```

Expected: All 5 `onGuestWrite` tests pass.

- [ ] **Step 4: Run the full trigger test suite**

```bash
cd functions && npx jest src/__tests__/triggers/firestore.test.ts
```

Expected: All tests pass. The old `addDeleteGuestAuthorization` and `eesRecalculationOnGuestWrite` describe blocks should now fail to import those names — update them:

- Rename the `addDeleteGuestAuthorization` describe block to reflect that the behavior is now tested via `onGuestWrite` (it's already covered by the merged tests), and remove the now-dead import.
- Delete or comment out the old `eesRecalculationOnGuestWrite` describe block (replaced by the new EES tests in Task 1 and merged tests in Task 2).
- Remove `addDeleteGuestAuthorization` and `eesRecalculationOnGuestWrite` from the top-level import.

- [ ] **Step 5: Run the full test suite**

```bash
cd functions && npm test
```

Expected: All tests pass, no regressions.

- [ ] **Step 6: TypeScript build check**

```bash
cd functions && npm run build
```

Expected: Clean compile. If there are type errors from the removed exports, fix them before committing.

- [ ] **Step 7: Commit**

```bash
git add functions/src/triggers/firestore/index.ts functions/src/__tests__/triggers/firestore.test.ts
git commit -m "refactor(triggers): merge guest delete + EES triggers into onGuestWrite

Replaces addDeleteGuestAuthorization (onDocumentDeleted) and
eesRecalculationOnGuestWrite (onDocumentWritten) with a single
onGuestWrite (onDocumentWritten) handler on guests/{guestId}.

Auth claims cleanup runs only on delete events. EES recalculation
runs on all write types. Both operations fail independently so a
flaky Auth service cannot block EES updates, and vice versa.

Saves one Cloud Run function slot (~0.334 vCPU toward the 20 vCPU ceiling)."
```

---

## Task 4: Deploy and clean up

- [ ] **Step 1: Deploy only the affected functions to minimise blast radius**

```bash
cd /Users/marcusklein/dev/regroup-functions
firebase deploy --only functions:onGuestWrite
```

Expected: `✔ functions[onGuestWrite(us-central1)] Successful create operation.`

- [ ] **Step 2: Delete the two old deployed functions**

```bash
firebase functions:delete addDeleteGuestAuthorization eesRecalculationOnGuestWrite \
  --region us-central1 --force
```

Expected: 2 successful delete operations.

- [ ] **Step 3: Verify the merge in the deployed function list**

```bash
firebase functions:list 2>&1 | grep -E "addDelete|eesRecalc|onGuestWrite"
```

Expected: Only `onGuestWrite` appears. The two old names are gone.

- [ ] **Step 4: Verify quota draw decreased**

```bash
firebase functions:list 2>&1 | grep -c "us-central1"
```

Expected: Total function count decreased by 1 vs pre-merge count.

---

## Acceptance Criteria

- [ ] `onGuestWrite` is the only export in `src/triggers/firestore/index.ts` that handles guest document writes.
- [ ] `addDeleteGuestAuthorization` and `eesRecalculationOnGuestWrite` are removed from source.
- [ ] Both old deployed functions are deleted from the Firebase project.
- [ ] `onGuestWrite` is deployed and active.
- [ ] On delete events: auth claims are cleaned up AND EES is recalculated.
- [ ] On create/update events: only EES is recalculated (no auth change).
- [ ] Auth failure does not abort EES recalculation; EES failure is re-thrown for Firebase retry.
- [ ] All Jest tests pass (`npm test`).
- [ ] TypeScript build is clean (`npm run build`).
- [ ] `firebase functions:list` shows one fewer function than before.

---

## Rollback Plan

If `onGuestWrite` misbehaves in production:

1. Re-deploy the previous `src/triggers/firestore/index.ts` from git: `git show <prior-commit>:functions/src/triggers/firestore/index.ts`. Firebase will re-create both old triggers.
2. Delete the `onGuestWrite` function: `firebase functions:delete onGuestWrite --region us-central1 --force`.
3. Verify both old functions are active again via `firebase functions:list`.

The window where neither old function nor `onGuestWrite` is active is the duration of the deploy (~60s). During that window, guest deletes will not trigger auth claim cleanup or EES recalculation. This is acceptable given the low frequency of guest deletions.
