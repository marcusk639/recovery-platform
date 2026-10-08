# Meeting Attendance Privacy (N1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `meetingInstances` from exposing which users attended a 12-step meeting, without breaking public meeting discovery or a member's own attendance history.

**Architecture:** Expand-contract. Introduce a per-user reverse index at
`users/{uid}/meetingAttendance/{instanceId}`, readable only by its owner. Dual-write it
alongside the legacy `meetingInstances.attendees` array, backfill, cut every reader over,
then delete the array and drop it from rules-readable data. `meetingInstances` keeps
`attendeeCount` and stays publicly readable for discovery.

**Tech Stack:** Firebase Functions v2 (TypeScript), Firestore security rules,
`@firebase/rules-unit-testing`, Jest, React Native (homegroups/mobile).

**Spec:** `docs/reviews/codebase-review-2026-10-07-reverify-delta.md` § N1

---

## Global Constraints

- Source files capped at **300 lines** (pre-commit blocks new files over cap).
- Commit scopes must name the product: `fix(homegroups-functions):`,
  `fix(homegroups-mobile):`, never bare `fix(functions):`. Enforced by `commit-msg` hook.
- Audit timestamps use `admin.firestore.FieldValue.serverTimestamp()`, never `new Date()`.
- **Never log PII** — no user IDs tied to meeting attendance in any logger call.
- Firestore rules helper for ownership in this product is **`isOwner(userId)`**
  (`homegroups/firestore.rules:17`). `isSameUser` is regroup's helper and does not exist here.
- New collection name is **`meetingAttendance`** (not `attendance`) in every task.
- Rules tests run via `homegroups/functions` Jest config against the emulator.

## DO NOT TOUCH — there are FOUR unrelated `attendees` concepts

Five declarations of `attendees` exist in homegroups. **Only two are in scope.** Verified
against `origin/main`; an earlier draft of this plan had this mapping wrong and would have
sent you into `EventDocument`.

| Interface | Location | In scope? |
| --------- | -------- | --------- |
| `MeetingInstanceDocument` | `homegroups/mobile/src/types/schema.ts:609` | **YES** |
| `MeetingInstance extends Meeting` | `homegroups/mobile/src/types/index.ts:647` | **YES** |
| `EventDocument` | `homegroups/mobile/src/types/schema.ts:309` | **NO** |
| `BusinessMeetingDocument` | `homegroups/mobile/src/types/schema.ts:383` | **NO** |
| `RecoveryCelebration` | `homegroups/mobile/src/types/domain/recovery.ts:22` | **NO** |

The two in-scope declarations are identifiable by the neighbouring `attendeeCount?: number`
and `chairpersonId` fields. If the `attendees` line you are about to edit has no
`attendeeCount` beside it, you are in the wrong interface.

Files that touch only out-of-scope fields and must **not** be modified:
`homegroups/mobile/src/models/BusinessMeetingModel.ts`,
`homegroups/mobile/src/screens/homegroup/BusinessMeetingDetailScreen.tsx`,
`homegroups/mobile/src/store/slices/businessMeetingsSlice.ts`,
`homegroups/mobile/src/types/domain/business-meeting.ts`.

`EventDocument` and `RecoveryCelebration` carry no leak: events are member-gated at
`homegroups/firestore.rules:208-212`. Leave both alone.

## Ground Truth About `checkInToMeeting` (verified, read it before Task 3)

Task 3 rewrites the write path, so these four facts about the CURRENT code at
`homegroups/functions/src/callable/checkInToMeeting.ts` are load-bearing:

1. **`attendeeCount` already uses `FieldValue.increment(1)`** (not set-from-array-length).
   The plan's transaction therefore PRESERVES existing counting semantics. This was the
   single biggest suspected risk to live data and it is resolved: no count migration needed.

2. **The existing idempotency guard is a non-transactional TOCTOU race.** The code reads
   `instance.attendees` into `existingAttendees`, checks `.includes(userId)`, and only then
   calls `.update()`. Two concurrent check-ins by the same user both pass the guard; the
   `arrayUnion` is idempotent but **both `increment(1)` calls land**, so `attendeeCount`
   drifts above `attendees.length`. **Production counts may already be wrong.** Task 3's
   transaction fixes this going forward. Consequence for Task 4: if the backfill reports a
   `recordsWritten` total that disagrees with the sum of `attendeeCount`, that is this
   pre-existing drift, NOT a backfill bug — do not "fix" it by rewriting counts without
   asking, because `attendeeCount` is the publicly-readable discovery number and
   `attendees.length` is the ground truth being retired.

3. **PII LEAK — remove it in Task 3.** The current code logs:
   `logger.info(\`User ${userId} checked in to meeting instance ${instanceId}. Count: ${newCount}\`)`
   That writes a user ID joined to a specific 12-step meeting into Cloud Functions logs —
   the same violation class as register findings H4 and H15, in the same file this plan
   already touches. It is a second, independent disclosure of the exact data N1 is about,
   and log retention puts it outside Firestore rules entirely. Task 3's test
   ("does not log the attending user id") pins it. Replace with a non-identifying line or
   drop it; do not log `userId` or `instanceId` together.

4. **There is a third write to preserve.** After updating the instance, the callable also
   updates `users/{userId}` with `activityLog.lastMeetingAttendance` and `lastActivityAt`
   (both `serverTimestamp()`). It is idempotent and on the user's own doc, so leave it
   outside the transaction and DO NOT delete it — activity tracking depends on it.

Also note the callable returns `attendeeCount: existingAttendees.length + 1`, arithmetic on
a stale read. Under the race in (2) that return value can be wrong. Task 3 should return the
count the transaction actually produced, or omit the exact number.

## Review Focus

1. **Check-in idempotency** — double-tapping check-in must not double-increment
   `attendeeCount`. The legacy `arrayUnion` was naturally idempotent; a separate
   counter increment is not. Covered in Task 3.
2. **Backfill re-run safety** — the migration must be re-runnable without
   duplicating docs or re-incrementing counters. Covered in Task 4.
3. **A user with zero attendance** — `MyRecoveryJourneyScreen` and
   `getMeetingAttendance` must return an empty list, not error, when the
   subcollection does not exist. Covered in Tasks 5 and 6.
4. **Cross-user read denial** — user A must be denied reading user B's
   attendance, and an unauthenticated caller must be denied entirely.
   Covered in Task 2.
5. **`attendeeCount` still publicly readable after contract** — closing the
   array must not accidentally gate discovery. Covered in Task 7.

---

## File Structure

| File | Responsibility |
| ---- | -------------- |
| `homegroups/firestore.rules` | Add `users/{userId}/meetingAttendance/{instanceId}` block |
| `homegroups/firestore.indexes.json` | Composite index for Task 5's query |
| `homegroups/functions/src/utils/meetingAttendance.ts` | **Create** — record/path helpers |
| `homegroups/functions/src/__tests__/meetingAttendance.test.ts` | **Create** — helper unit tests |
| `homegroups/functions/src/__tests__/meetingAttendance-security-rules.test.ts` | **Create** — allow/deny matrix. Name MUST end `security-rules.test.ts` (see below) |
| `homegroups/functions/src/callable/checkInToMeeting.ts` | Transactional dual-write; drop the array guard; drop the PII log |
| `homegroups/functions/src/__tests__/meetingEnhancements.test.ts` | **Modify** `:534-800` — existing checkInToMeeting tests; add `runTransaction` to the admin mock |
| `homegroups/functions/src/scripts/backfillMeetingAttendance.ts` | **Create** — idempotent paged backfill |
| `homegroups/functions/src/__tests__/backfillMeetingAttendance.test.ts` | **Create** |
| `homegroups/functions/src/http/getMeetingAttendance.ts` | Read from the reverse index |
| `homegroups/functions/src/__tests__/getMeetingAttendance.test.ts` | **Modify** — this file ALREADY EXISTS; do not create a third one |
| `homegroups/mobile/src/models/MeetingInstanceModel.ts` | Stop projecting `attendees` |
| `homegroups/mobile/src/screens/profile/MyRecoveryJourneyScreen.tsx` | Query own subcollection |
| `homegroups/mobile/src/screens/homegroup/EditMeetingInstanceScreen.tsx` | Derive `checkedIn` from own doc |

## Test Harness Reality — read before writing any test

Four facts that invalidate the obvious approach:

1. **The functions test layout is FLAT.** `homegroups/functions/src/__tests__/*.test.ts`,
   with `api/` as the only subdirectory. There is no `rules/`, `callable/`, `http/` or
   `scripts/` subdir. Do not invent them.
2. **These are pure-mock tests, not emulator tests.** `meetingEnhancements.test.ts:29`
   does `jest.mock("firebase-admin", ...)` with a hand-rolled mock exposing only
   `FieldValue.arrayUnion`, `FieldValue.increment` and `serverTimestamp`. **It has no
   `runTransaction`.** Task 3 must add one to the mock or every test in the file throws a
   TypeError. Assertions are of the form "`instanceRef.update` was called with X"
   (`:620-624`), not "read the doc back".
3. **A rules test file MUST be named `*security-rules.test.ts`.**
   `homegroups/functions/jest.config.js` `testPathIgnorePatterns` excludes emulator tests
   **by filename substring only** — `security-rules.test.ts` and
   `security-rules-storage.test.ts`, each gated on `FIRESTORE_EMULATOR_HOST` /
   `FIREBASE_STORAGE_EMULATOR_HOST`. A file called `meetingAttendance.rules.test.ts`
   matches neither, so it runs with no emulator and fails. That is not merely annoying:
   `homegroups/firebase.json` sets
   `functions.predeploy: ["cd functions && npm run build && npm test -- --passWithNoTests"]`,
   so a failing test **breaks every `firebase deploy --only functions`**.
4. **Run rules tests with the emulator script, never bare `npx jest`.**
   `npm run test:rules` = `firebase emulators:exec --only firestore 'npm run test'`, which
   sets `FIRESTORE_EMULATOR_HOST` and thereby un-ignores the file. Before starting the
   emulator, check port 8080 is free (see the `monorepo-run-check` skill) — two products'
   emulators cannot run at once.

### Task 1: Define the attendance record shape

**Files:**
- Create: `homegroups/functions/src/utils/meetingAttendance.ts`
- Test: `homegroups/functions/src/__tests__/meetingAttendance.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `MEETING_ATTENDANCE_SUBCOLLECTION = "meetingAttendance"`;
  `attendanceDocPath(userId: string, instanceId: string): string`;
  `buildAttendanceRecord(args: { instanceId: string; meetingId: string | null; groupId: string; scheduledAt: admin.firestore.Timestamp | null }): Record<string, unknown>`.

- [ ] **Step 1: Write the failing test**

```typescript
import * as admin from "firebase-admin";
import {
  MEETING_ATTENDANCE_SUBCOLLECTION,
  attendanceDocPath,
  buildAttendanceRecord,
} from "../utils/meetingAttendance";

describe("meetingAttendance helpers", () => {
  it("builds a deterministic doc path keyed by instanceId", () => {
    expect(attendanceDocPath("user-1", "inst-9")).toBe(
      "users/user-1/meetingAttendance/inst-9",
    );
    expect(MEETING_ATTENDANCE_SUBCOLLECTION).toBe("meetingAttendance");
  });

  it("stamps attendedAt with a server timestamp sentinel, never a client clock", () => {
    const record = buildAttendanceRecord({
      instanceId: "inst-9",
      meetingId: "meet-3",
      groupId: "group-7",
      scheduledAt: null,
    });
    expect(record.attendedAt).toEqual(
      admin.firestore.FieldValue.serverTimestamp(),
    );
    expect(record.attendedAt instanceof Date).toBe(false);
  });

  it("carries groupId and instanceId so the index is queryable without a join", () => {
    const record = buildAttendanceRecord({
      instanceId: "inst-9",
      meetingId: "meet-3",
      groupId: "group-7",
      scheduledAt: null,
    });
    expect(record).toMatchObject({
      instanceId: "inst-9",
      meetingId: "meet-3",
      groupId: "group-7",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd homegroups/functions && npx jest src/__tests__/meetingAttendance.test.ts`
Expected: FAIL — `Cannot find module '../utils/meetingAttendance'`

- [ ] **Step 3: Write minimal implementation**

```typescript
import * as admin from "firebase-admin";

export const MEETING_ATTENDANCE_SUBCOLLECTION = "meetingAttendance";

export function attendanceDocPath(userId: string, instanceId: string): string {
  return `users/${userId}/${MEETING_ATTENDANCE_SUBCOLLECTION}/${instanceId}`;
}

export function buildAttendanceRecord(args: {
  instanceId: string;
  meetingId: string | null;
  groupId: string;
  scheduledAt: admin.firestore.Timestamp | null;
}): Record<string, unknown> {
  return {
    instanceId: args.instanceId,
    meetingId: args.meetingId,
    groupId: args.groupId,
    scheduledAt: args.scheduledAt,
    attendedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd homegroups/functions && npx jest src/__tests__/meetingAttendance.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add homegroups/functions/src/utils/meetingAttendance.ts \
        homegroups/functions/src/__tests__/meetingAttendance.test.ts
git commit -m "feat(homegroups-functions): add meetingAttendance record helpers"
```

---

### Task 2: Rules for the owner-only subcollection

**Files:**
- Modify: `homegroups/firestore.rules` (add a block beside the existing `users/{userId}` match)
- Test: `homegroups/functions/src/__tests__/meetingAttendance-security-rules.test.ts` (create)

**Interfaces:**
- Consumes: `MEETING_ATTENDANCE_SUBCOLLECTION` from Task 1.
- Produces: the deny guarantees every later task depends on.

**Why client writes are denied:** check-in must go through `checkInToMeeting`, which
also maintains `attendeeCount`. A client that could write its own attendance doc could
claim attendance it never had — the same self-certification flaw already fixed on
regroup's compliance path.

- [ ] **Step 1: Write the failing test**

```typescript
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import * as fs from "fs";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "homegroups-rules-attendance",
    firestore: { rules: fs.readFileSync("../firestore.rules", "utf8") },
  });
});

afterAll(async () => await testEnv.cleanup());
beforeEach(async () => await testEnv.clearFirestore());

const PATH = "users/user-a/meetingAttendance/inst-1";

describe("users/{uid}/meetingAttendance", () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(PATH).set({ instanceId: "inst-1", groupId: "g1" });
    });
  });

  it("lets the owner read their own attendance", async () => {
    const db = testEnv.authenticatedContext("user-a").firestore();
    await assertSucceeds(db.doc(PATH).get());
  });

  it("DENIES another signed-in user reading it", async () => {
    const db = testEnv.authenticatedContext("user-b").firestore();
    await assertFails(db.doc(PATH).get());
  });

  it("DENIES an unauthenticated read", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.doc(PATH).get());
  });

  it("DENIES the owner writing their own attendance (server-only)", async () => {
    const db = testEnv.authenticatedContext("user-a").firestore();
    await assertFails(db.doc("users/user-a/meetingAttendance/inst-2").set({ instanceId: "inst-2" }));
  });

  it("DENIES the owner deleting an attendance record", async () => {
    const db = testEnv.authenticatedContext("user-a").firestore();
    await assertFails(db.doc(PATH).delete());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd homegroups/functions && npm run test:rules -- src/__tests__/meetingAttendance-security-rules.test.ts`
Expected: FAIL — the owner-read case is DENIED, because with no matching rule Firestore
denies by default, so `assertSucceeds` rejects.

Do NOT run this with bare `npx jest`: without `FIRESTORE_EMULATOR_HOST` the file is not
ignored (its name ends `security-rules.test.ts`, which jest.config excludes only when the
emulator env var is ABSENT — so bare jest skips it and reports a false green). Check port
8080 is free first; two products' emulators cannot run simultaneously.

- [ ] **Step 3: Add the rule**

Insert inside `match /databases/{database}/documents { ... }`, immediately after the
existing `match /users/{userId} { ... }` block closes:

```
    // Per-user reverse index of 12-step meeting check-ins. Owner-readable only:
    // meetingInstances is publicly readable for discovery, so attendance must
    // NOT live there. Writes are server-only (checkInToMeeting), because the
    // callable also maintains meetingInstances.attendeeCount and a
    // client-writable record would let a user assert attendance they never had.
    match /users/{userId}/meetingAttendance/{instanceId} {
      allow read: if isOwner(userId);
      allow write: if false;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd homegroups/functions && npm run test:rules -- src/__tests__/meetingAttendance-security-rules.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add homegroups/firestore.rules \
        homegroups/functions/src/__tests__/meetingAttendance-security-rules.test.ts
git commit -m "feat(homegroups): owner-only rules for meetingAttendance reverse index"
```

---

### Task 3: Transactional dual-write, sole guard, no PII log

**Files:**
- Modify: `homegroups/functions/src/callable/checkInToMeeting.ts` — the array guard at
  `:89-97`, the update at `:99-103`, the log at `:114-116`, the return at `:118-122`
- Modify: `homegroups/functions/src/__tests__/meetingEnhancements.test.ts` (`:534-800`,
  plus the `firebase-admin` mock at `:29`)

**Interfaces:**
- Consumes: `attendanceDocPath`, `buildAttendanceRecord` (Task 1).
- Produces: attendance docs Tasks 5/6 read; an unchanged callable response shape
  `{ success, attendeeCount, alreadyCheckedIn }`.

**This task must remove the old array guard, not just add a transaction.** The existing
early-return at `:89-97` checks `instance.attendees.includes(userId)` from a stale read.
If it survives:
- Task 3's mutation check is **vacuous** — the array guard short-circuits the double tap,
  so deleting the transaction's `existing.exists` check still leaves the test green.
- Task 7 **silently breaks the callable** — once `attendees` stops being written,
  `existingAttendees` is always `[]`, so every check-in returns
  `attendeeCount: 1, alreadyCheckedIn: false` forever.

So: the transaction becomes the single source of idempotency, and the returned count comes
from the transaction rather than `existingAttendees.length + 1`.

- [ ] **Step 1: Add `runTransaction` to the test's firebase-admin mock**

`meetingEnhancements.test.ts:29` mocks `firebase-admin` with a hand-rolled object that has
no `runTransaction`, so Task 3 would throw a TypeError in every test in the file. Add a
transaction shim that records writes and lets the test control whether the attendance doc
already exists. Inline the mock VALUES in the factory — do NOT import them from a helper:
jest hoists the factory above imports, and an imported binding throws
`ReferenceError: Cannot access '<helper>_1' before initialization`.

```javascript
const mockTxnGet = jest.fn();
const mockTxnSet = jest.fn();
const mockTxnUpdate = jest.fn();
const mockRunTransaction = jest.fn(async (fn) =>
  fn({ get: mockTxnGet, set: mockTxnSet, update: mockTxnUpdate }),
);
// inside the firestore() mock object, beside collection/doc:
//   runTransaction: mockRunTransaction,
```

- [ ] **Step 2: Write the failing tests**

```javascript
it("records attendance in the per-user index and increments the count once", async () => {
  mockTxnGet.mockResolvedValue({ exists: false });
  const res = await checkInToMeeting.run({ data: { instanceId: "inst-1", groupId: "g1" }, auth: { uid: "user-a" } });

  expect(mockTxnSet).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ instanceId: "inst-1", groupId: "g1" }),
  );
  expect(mockTxnUpdate).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ attendeeCount: expect.anything() }),
  );
  expect(res.alreadyCheckedIn).toBe(false);
});

it("is a no-op when the attendance doc already exists, and says so", async () => {
  mockTxnGet.mockResolvedValue({ exists: true });
  const res = await checkInToMeeting.run({ data: { instanceId: "inst-1", groupId: "g1" }, auth: { uid: "user-a" } });

  expect(mockTxnSet).not.toHaveBeenCalled();
  expect(mockTxnUpdate).not.toHaveBeenCalled();
  expect(res.alreadyCheckedIn).toBe(true);
});

it("never logs the attending user id or the instance id", async () => {
  const spy = jest.spyOn(logger, "info");
  mockTxnGet.mockResolvedValue({ exists: false });
  await checkInToMeeting.run({ data: { instanceId: "inst-1", groupId: "g1" }, auth: { uid: "user-a" } });

  const logged = JSON.stringify(spy.mock.calls);
  expect(logged).not.toContain("user-a");
  expect(logged).not.toContain("inst-1");
});
```

Also UPDATE the existing assertion at `:620-624`, which currently requires
`instanceRef.update` to be called with `{ attendees, attendeeCount }`. It must now assert
the write happens via `mockTxnUpdate`. Leaving it as-is makes it a test that ratifies the
behaviour this task is replacing.

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd homegroups/functions && npx jest src/__tests__/meetingEnhancements.test.ts`
Expected: FAIL — the no-op test fails (`mockTxnUpdate` was never called because the code
does not use a transaction yet), and the PII test fails on `"user-a"` being present.

- [ ] **Step 4: Implement**

Delete the early-return block at `:89-97` entirely. Replace the update at `:99-103` with:

```typescript
const attendanceRef = db.doc(attendanceDocPath(userId, instanceId));
let newCount = (instance.attendeeCount as number) ?? 0;
const applied = await db.runTransaction(async (txn) => {
  const existing = await txn.get(attendanceRef);
  if (existing.exists) {
    return false;
  }
  txn.set(
    attendanceRef,
    buildAttendanceRecord({
      instanceId,
      meetingId: (instance.meetingId as string) ?? null,
      groupId: instance.groupId as string,
      scheduledAt: (instance.scheduledAt as admin.firestore.Timestamp) ?? null,
    }),
  );
  txn.update(instanceRef, {
    attendees: admin.firestore.FieldValue.arrayUnion(userId),
    attendeeCount: admin.firestore.FieldValue.increment(1),
  });
  return true;
});
if (applied) {
  newCount += 1;
}
```

Replace the log at `:114-116` with a non-identifying line, or delete it:

```typescript
logger.info("Meeting check-in recorded", { applied });
```

Change the return at `:118-122` to `{ success: true, attendeeCount: newCount, alreadyCheckedIn: !applied }`.

Leave the `users/{userId}` `activityLog.lastMeetingAttendance` update at `:105-109`
untouched — it is idempotent, on the user's own doc, and activity tracking depends on it.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd homegroups/functions && npx jest src/__tests__/meetingEnhancements.test.ts`
Expected: PASS, whole file green.

- [ ] **Step 6: Mutation check — prove the idempotency test can fail**

Delete `if (existing.exists) { return false; }`, re-run, and confirm the no-op test FAILS.
Restore it. With the array guard gone (Step 4) the transaction is the only guard, so this
check is now meaningful. This repo has twice shipped tests that ratified the exact defect
they should have caught; a test that passes either way is worthless.

- [ ] **Step 7: Commit**

```bash
git add homegroups/functions/src/callable/checkInToMeeting.ts \
        homegroups/functions/src/__tests__/meetingEnhancements.test.ts
git commit -m "fix(homegroups-functions): record attendance per-user, transactionally, without logging PII"
```

---

### Task 4: Idempotent backfill script

**Files:**
- Create: `homegroups/functions/src/scripts/backfillMeetingAttendance.ts`
- Test: `homegroups/functions/src/__tests__/backfillMeetingAttendance.test.ts`

**Interfaces:**
- Consumes: `attendanceDocPath`, `buildAttendanceRecord` (Task 1).
- Produces: `backfillMeetingAttendance(db, opts?: { pageSize?: number }): Promise<{ instancesScanned: number; recordsWritten: number; recordsSkipped: number }>`

**Why paged:** `meetingInstances` is unbounded; H16/M13 in the register are both
unbounded-query findings. Page with `startAfter`, never load the collection at once.

- [ ] **Step 1: Write the failing test**

```typescript
it("creates one attendance doc per attendee and is safe to re-run", async () => {
  await seedInstance("inst-1", { groupId: "g1", attendees: ["u1", "u2"] });

  const first = await backfillMeetingAttendance(db);
  expect(first.recordsWritten).toBe(2);

  const second = await backfillMeetingAttendance(db);
  expect(second.recordsWritten).toBe(0);
  expect(second.recordsSkipped).toBe(2);

  expect((await db.doc("users/u1/meetingAttendance/inst-1").get()).exists).toBe(true);
  expect((await db.doc("users/u2/meetingAttendance/inst-1").get()).exists).toBe(true);
});

it("never mutates attendeeCount", async () => {
  await seedInstance("inst-1", { groupId: "g1", attendees: ["u1"], attendeeCount: 1 });
  await backfillMeetingAttendance(db);
  await backfillMeetingAttendance(db);
  expect((await db.doc("meetingInstances/inst-1").get()).get("attendeeCount")).toBe(1);
});

it("tolerates an instance with no attendees field", async () => {
  await seedInstance("inst-2", { groupId: "g1" });
  const res = await backfillMeetingAttendance(db);
  expect(res.recordsWritten).toBe(0);
  expect(res.instancesScanned).toBe(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd homegroups/functions && npx jest src/__tests__/backfillMeetingAttendance.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the backfill**

```typescript
import * as admin from "firebase-admin";
import { attendanceDocPath, buildAttendanceRecord } from "../utils/meetingAttendance";

export async function backfillMeetingAttendance(
  db: admin.firestore.Firestore,
  opts: { pageSize?: number } = {},
): Promise<{ instancesScanned: number; recordsWritten: number; recordsSkipped: number }> {
  const pageSize = opts.pageSize ?? 200;
  let cursor: admin.firestore.QueryDocumentSnapshot | undefined;
  let instancesScanned = 0;
  let recordsWritten = 0;
  let recordsSkipped = 0;

  for (;;) {
    let q = db.collection("meetingInstances").orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize);
    if (cursor) q = q.startAfter(cursor);
    const page = await q.get();
    if (page.empty) break;

    for (const snap of page.docs) {
      instancesScanned += 1;
      const data = snap.data();
      const attendees: string[] = Array.isArray(data.attendees) ? data.attendees : [];
      for (const userId of attendees) {
        const ref = db.doc(attendanceDocPath(userId, snap.id));
        if ((await ref.get()).exists) {
          recordsSkipped += 1;
          continue;
        }
        await ref.set(
          buildAttendanceRecord({
            instanceId: snap.id,
            meetingId: (data.meetingId as string) ?? null,
            groupId: data.groupId as string,
            scheduledAt: (data.scheduledAt as admin.firestore.Timestamp) ?? null,
          }),
        );
        recordsWritten += 1;
      }
    }
    cursor = page.docs[page.docs.length - 1];
    if (page.size < pageSize) break;
  }

  return { instancesScanned, recordsWritten, recordsSkipped };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd homegroups/functions && npx jest src/__tests__/backfillMeetingAttendance.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add homegroups/functions/src/scripts/backfillMeetingAttendance.ts \
        homegroups/functions/src/__tests__/backfillMeetingAttendance.test.ts
git commit -m "feat(homegroups-functions): idempotent backfill for meetingAttendance"
```

---

### Task 5: Cut `getMeetingAttendance` over to the index

**Files:**
- Modify: `homegroups/functions/src/http/getMeetingAttendance.ts:66-85`
- Test: `homegroups/functions/src/__tests__/getMeetingAttendance.test.ts` — **this file
  already exists; MODIFY it.** A second copy also exists at
  `homegroups/functions/src/tests/` (different directory); do not create a third.

**Interfaces:**
- Consumes: attendance docs from Tasks 3 and 4.
- Produces: unchanged JSON response shape — `{ checkIns: [{ instanceId, meetingId, scheduledAt, attendeeCount }] }`.

**Keep the response identical.** Only the data source changes. `attendeeCount` still
comes from the instance doc, so the handler fetches those by id after the index query.

- [ ] **Step 1: Write the failing test**

```typescript
it("returns the user's check-ins for a group from the reverse index", async () => {
  await db.doc("users/u1/meetingAttendance/inst-1").set({
    instanceId: "inst-1", meetingId: "m1", groupId: "g1", scheduledAt: ts("2026-01-02"),
  });
  await db.doc("users/u1/meetingAttendance/inst-2").set({
    instanceId: "inst-2", meetingId: "m2", groupId: "OTHER", scheduledAt: ts("2026-01-03"),
  });
  await db.doc("meetingInstances/inst-1").set({ groupId: "g1", attendeeCount: 4 });

  const res = await call({ userId: "u1", groupId: "g1" });

  expect(res.checkIns).toHaveLength(1);
  expect(res.checkIns[0]).toMatchObject({ instanceId: "inst-1", attendeeCount: 4 });
});

it("returns an empty list for a user with no attendance subcollection", async () => {
  const res = await call({ userId: "ghost", groupId: "g1" });
  expect(res.checkIns).toEqual([]);
});

it("does not read meetingInstances.attendees", async () => {
  // the index is the only source; an instance whose legacy array disagrees must not leak
  await db.doc("meetingInstances/inst-9").set({ groupId: "g1", attendeeCount: 1, attendees: ["u1"] });
  const res = await call({ userId: "u1", groupId: "g1" });
  expect(res.checkIns).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd homegroups/functions && npx jest src/__tests__/getMeetingAttendance.test.ts`
Expected: FAIL — the third test fails, because the handler still uses `array-contains`.

- [ ] **Step 3: Replace the query**

```typescript
    const RESULT_LIMIT = 100;
    const db = admin.firestore();
    const indexSnap = await db
      .collection(`users/${userId}/${MEETING_ATTENDANCE_SUBCOLLECTION}`)
      .where("groupId", "==", groupId)
      .orderBy("scheduledAt", "desc")
      .limit(RESULT_LIMIT)
      .get();

    const instanceRefs = indexSnap.docs.map((d) =>
      db.doc(`meetingInstances/${d.get("instanceId")}`),
    );
    const instances = instanceRefs.length ? await db.getAll(...instanceRefs) : [];
    const countById = new Map(
      instances.map((s) => [s.id, (s.get("attendeeCount") as number) ?? 0]),
    );

    const checkIns = indexSnap.docs.map((d) => {
      const scheduledAt: Date | null = d.get("scheduledAt")?.toDate?.() ?? null;
      return {
        instanceId: d.get("instanceId") as string,
        meetingId: (d.get("meetingId") as string) ?? null,
        scheduledAt: scheduledAt ? scheduledAt.toISOString() : null,
        attendeeCount: countById.get(d.get("instanceId") as string) ?? 0,
      };
    });
```

Add the import: `import { MEETING_ATTENDANCE_SUBCOLLECTION } from "../utils/meetingAttendance";`

- [ ] **Step 4: Run test to verify it passes**

Run: `cd homegroups/functions && npx jest src/__tests__/getMeetingAttendance.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add homegroups/functions/src/http/getMeetingAttendance.ts \
        homegroups/functions/src/__tests__/getMeetingAttendance.test.ts
git commit -m "fix(homegroups-functions): read attendance from the per-user index"
```

---

### Task 6: Cut the mobile clients over

**Files:**
- Modify: `homegroups/mobile/src/screens/profile/MyRecoveryJourneyScreen.tsx:105-112`
- Modify: `homegroups/mobile/src/screens/homegroup/EditMeetingInstanceScreen.tsx:98-103`
- Modify: `homegroups/mobile/src/models/MeetingInstanceModel.ts:14,67`
- Test: `homegroups/mobile/src/screens/profile/__tests__/MyRecoveryJourneyScreen.test.tsx`

**Interfaces:**
- Consumes: attendance docs from Tasks 3 and 4.
- Produces: nothing downstream.

- [ ] **Step 1: Write the failing test**

```typescript
it("reads the signed-in user's own attendance subcollection, not meetingInstances", async () => {
  renderScreen({ uid: "u1" });
  await waitFor(() => expect(firestore().collection).toHaveBeenCalledWith(
    "users/u1/meetingAttendance",
  ));
  expect(arrayContainsQueryWasUsed()).toBe(false);
});

it("renders an empty state rather than throwing when there is no attendance", async () => {
  mockEmptySubcollection();
  renderScreen({ uid: "ghost" });
  await waitFor(() => expect(screen.getByText(/no meetings yet/i)).toBeTruthy());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd homegroups/mobile && npx jest src/screens/profile/__tests__/MyRecoveryJourneyScreen.test.tsx`
Expected: FAIL — the screen still calls `.where('attendees','array-contains', uid)`.

- [ ] **Step 3: Make the three edits**

`MyRecoveryJourneyScreen.tsx` — replace the `meetingInstances` + `array-contains` query:

```typescript
            .collection(`users/${uid}/meetingAttendance`)
            .orderBy('scheduledAt', 'desc')
```

`EditMeetingInstanceScreen.tsx` — derive `checkedIn` from the user's own record
instead of the instance's array:

```typescript
  useEffect(() => {
    if (!instance?.id || !currentUser) return;
    let cancelled = false;
    firestore()
      .doc(`users/${currentUser.uid}/meetingAttendance/${instance.id}`)
      .get()
      .then((snap) => { if (!cancelled) setCheckedIn(snap.exists); })
      .catch(() => { if (!cancelled) setCheckedIn(false); });
    return () => { cancelled = true; };
  }, [instance?.id, currentUser]);
```

`MeetingInstanceModel.ts` — delete the `attendees?: string[];` field at `:14` and the
`attendees: data.attendees ?? [],` projection at `:67`. Leave `attendeeCount` intact.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd homegroups/mobile && npx jest src/screens/profile src/screens/homegroup/__tests__/EditMeetingInstanceScreen.test.tsx src/models`
Expected: PASS. Then `npx tsc --noEmit` must report no NEW errors.

- [ ] **Step 5: Commit**

```bash
git add homegroups/mobile/src/screens/profile/MyRecoveryJourneyScreen.tsx \
        homegroups/mobile/src/screens/homegroup/EditMeetingInstanceScreen.tsx \
        homegroups/mobile/src/models/MeetingInstanceModel.ts \
        homegroups/mobile/src/screens/profile/__tests__/MyRecoveryJourneyScreen.test.tsx
git commit -m "fix(homegroups-mobile): read own attendance from the per-user index"
```

---

### Task 7: Contract — stop writing and expose the array

**Do not start this task until Task 4's backfill has been run against production and
`recordsWritten` is 0 on a second run.** This task is irreversible for old data.

**Files:**
- Modify: `homegroups/functions/src/callable/checkInToMeeting.ts` (drop the `attendees` write)
- Create: `homegroups/functions/src/scripts/dropMeetingInstanceAttendees.ts`
- Modify: `homegroups/functions/src/__tests__/meetingInstances-security-rules.test.ts`

**Interfaces:**
- Consumes: a fully backfilled index.
- Produces: `meetingInstances` documents with no `attendees` field.

- [ ] **Step 1: Write the failing test**

```typescript
it("keeps meetingInstances publicly readable for discovery", async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  await assertSucceeds(db.doc("meetingInstances/inst-1").get());
});

it("no longer stores an attendees array on check-in", async () => {
  await checkIn({ instanceId: "inst-1", userId: "user-a" });
  const snap = await db.doc("meetingInstances/inst-1").get();
  expect(snap.get("attendees")).toBeUndefined();
  expect(snap.get("attendeeCount")).toBe(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd homegroups/functions && npm run test:rules -- src/__tests__/meetingInstances-security-rules.test.ts src/__tests__/meetingEnhancements.test.ts`
Expected: FAIL — `attendees` is still written.

- [ ] **Step 3: Drop the write and add the cleanup script**

In `checkInToMeeting.ts`, remove `attendees: admin.firestore.FieldValue.arrayUnion(userId),`
from the transaction's `txn.update`, leaving only the `attendeeCount` increment. The stale
array guard and the `existingAttendees.length + 1` arithmetic were already removed in
Task 3, so nothing else in this file depends on the array — verify with
`grep -n attendees homegroups/functions/src/callable/checkInToMeeting.ts`, which must
return no hits after this edit.

Create `dropMeetingInstanceAttendees.ts` — same paged loop as Task 4, applying
`{ attendees: admin.firestore.FieldValue.delete() }` to each instance that has the field,
returning `{ instancesScanned, fieldsDeleted }`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd homegroups/functions && npx jest src/__tests__`
Expected: PASS, full suite green.

- [ ] **Step 5: Commit**

```bash
git add homegroups/functions/src
git commit -m "fix(homegroups-functions): stop storing attendee ids on meeting instances"
```

---

## Deployment Order

The expand phase is safe to deploy in one go; the contract phase is not.

1. Deploy Tasks 1-3. Rules: `firebase deploy --only firestore:rules,storage` from
   `homegroups/`. Old readers still work off the array.
2. Run Task 4's backfill. Re-run until `recordsWritten` is 0.
3. Deploy the composite index FIRST — `firebase deploy --only firestore:indexes` from
   `homegroups/`. **`--only firestore:rules,storage` does NOT deploy indexes**; they are a
   separate target, and Task 5's query throws `FAILED_PRECONDITION` without it. Wait for
   the index to finish building in the console, then deploy Tasks 5-6 (readers) and verify
   `MyRecoveryJourneyScreen` and `getMeetingAttendance` against real data.
4. **Only then** deploy Task 7 and run the field-drop script.

**Rules deployment is available for homegroups, but is manual.** Verified:
`homegroups/firebase.json` declares `firestore.rules`, `firestore.indexes.json` AND
`storage.rules`, and `homegroups/firestore.indexes.json` exists. So
`firebase deploy --only firestore:rules,storage` works when run **from the
`homegroups/` directory**. Two caveats:
- There is **no npm script and no CI job** that deploys rules or indexes for homegroups,
  so this step is manual and easy to forget. The security fix does nothing until it runs.
- `firebase deploy --only storage:rules` is **invalid syntax** — colon sub-filters are
  documented only for `functions` and `dataconnect`. The combined form above is correct.
- Do not generalize the known "rules never get deployed in this monorepo" problem to
  homegroups: that finding is about **regroup**, whose `firebase.json` declares no
  firestore sections at all.

Task 5 queries a subcollection (`users/{uid}/meetingAttendance`) with one equality
(`groupId`) plus one `orderBy` (`scheduledAt desc`). Confirm whether Firestore requires a
composite index for that shape before adding one — a single-field equality plus a sort on a
different field does require a composite index, so add it to
`homegroups/firestore.indexes.json` in Task 5 and deploy it BEFORE step 3, or the query
throws `FAILED_PRECONDITION` at runtime. Note this is a collection query, not a
`collectionGroup` query, so the index must not be declared with
`"queryScope": "COLLECTION_GROUP"`.

## Self-Review

**Spec coverage:** N1's two exposures are both closed — unauthenticated (Task 2 deny
tests) and cross-user authenticated (same). Public discovery preserved (Task 7 step 1).
`MyRecoveryJourneyScreen` preserved (Task 6). Admin visibility unchanged, still via
admin-SDK callables.

**Placeholders:** none — every code step carries real code.

**Type consistency:** `MEETING_ATTENDANCE_SUBCOLLECTION`, `attendanceDocPath`,
`buildAttendanceRecord` are defined in Task 1 and used with those exact names in
Tasks 3, 4, 5. The subcollection is spelled `meetingAttendance` throughout.

**Review Focus coverage:** idempotency → Task 3 steps 1 and 5; backfill re-run →
Task 4; empty attendance → Tasks 5 and 6; cross-user/anon denial → Task 2;
`attendeeCount` still public → Task 7.

**Known gap:** `getPublicEvents` is an `onCall` with no visible `request.auth` gate.
It does not reference `attendees`, so it is out of scope here, but its field
projection should be confirmed separately — an unauthenticated callable could leak
this data regardless of the rules.
