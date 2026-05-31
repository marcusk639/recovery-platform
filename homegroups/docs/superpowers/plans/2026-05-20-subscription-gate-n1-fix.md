# Subscription Gate + getUserGroups N+1 Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Enforce subscription gating on all admin-only callables so expired groups lose access to core features; (2) eliminate the N parallel meetings queries in `getUserGroups` by using a single batched Firestore query.

**Architecture:**

- A thin `assertGroupActive(groupData)` helper in `utils/subscriptionGuard.ts` throws `HttpsError('failed-precondition', ...)` when subscription is not `active` or `trialing`. Every admin-only callable imports and calls it after its admin check.
- Pattern A callables (already load group doc before the admin check) add one import + one call. Pattern B callables (load member doc only) parallelise the group doc fetch with the existing member doc fetch using `Promise.all`, then call the guard.
- `getUserGroups` replaces N per-group meetings queries with one batched `where('groupId', 'in', chunk)` query per 30-group window.

**Tech Stack:** Firebase Cloud Functions v1/v2 (TypeScript), Firestore, Jest, React Native (GroupModel)

---

## File Map

| Action | File                                                   | Responsibility                                |
| ------ | ------------------------------------------------------ | --------------------------------------------- |
| Create | `functions/src/utils/subscriptionGuard.ts`             | `assertGroupActive()` helper                  |
| Create | `functions/src/__tests__/subscriptionGuard.test.ts`    | Unit tests for the helper                     |
| Modify | `functions/src/callable/getAttendanceAnalytics.ts`     | Add guard (Pattern A)                         |
| Modify | `functions/src/callable/getGroupHealthTimeSeries.ts`   | Add guard (Pattern A)                         |
| Modify | `functions/src/callable/getMemberEngagementMetrics.ts` | Add guard (Pattern A)                         |
| Modify | `functions/src/callable/getTreasuryTrends.ts`          | Add guard (Pattern A)                         |
| Modify | `functions/src/callable/generateReferralCode.ts`       | Add guard (Pattern A)                         |
| Modify | `functions/src/callable/getGroupDashboardMetrics.ts`   | Add guard (Pattern A)                         |
| Modify | `functions/src/callable/recordMilestone.ts`            | Add guard (Pattern A/B hybrid)                |
| Modify | `functions/src/callable/postGroupDailyThought.ts`      | Parallel fetch + guard (Pattern B)            |
| Modify | `functions/src/callable/saveMeetingMinutes.ts`         | Parallel fetch + guard (Pattern B)            |
| Modify | `functions/src/callable/saveBylawDraft.ts`             | Parallel fetch + guard (Pattern B)            |
| Modify | `functions/src/callable/approveMeetingMinutes.ts`      | Parallel fetch + guard (Pattern B)            |
| Modify | `functions/src/callable/ratifyBylaws.ts`               | Parallel fetch + guard (Pattern B)            |
| Modify | `functions/src/callable/createConscienceVote.ts`       | Parallel fetch + guard (Pattern B)            |
| Modify | `functions/src/callable/closeConscienceVote.ts`        | Parallel fetch + guard (Pattern B)            |
| Modify | `functions/src/callable/openElection.ts`               | Parallel fetch + guard (Pattern B)            |
| Modify | `functions/src/callable/closeElection.ts`              | Parallel fetch + guard (Pattern B)            |
| Modify | `functions/src/callable/openElectionVoting.ts`         | Parallel fetch + guard (Pattern B)            |
| Modify | `functions/src/callable/deleteGroupResource.ts`        | Parallel fetch + guard (Pattern B)            |
| Modify | `functions/src/callable/bookmarkLiteratureForGroup.ts` | Parallel fetch + guard (Pattern B)            |
| Modify | `functions/src/callable/affiliateGroupToIntergroup.ts` | Add guard after existing groupSnap load       |
| Modify | `functions/src/callable/banUser.ts`                    | Add guard (already loads group doc)           |
| Modify | `functions/src/callable/initiateAdminRemoval.ts`       | Parallel fetch + guard (Pattern B)            |
| Modify | `mobile/src/models/GroupModel.ts`                      | Replace N meetings queries with batched query |

---

### Task 1: Create `assertGroupActive` helper and unit tests

**Files:**

- Create: `functions/src/utils/subscriptionGuard.ts`
- Create: `functions/src/__tests__/subscriptionGuard.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// functions/src/__tests__/subscriptionGuard.test.ts
export {};
import { assertGroupActive } from "../utils/subscriptionGuard";

describe("assertGroupActive", () => {
  it("does not throw for status 'active'", () => {
    expect(() =>
      assertGroupActive({ subscriptionStatus: "active" }),
    ).not.toThrow();
  });

  it("does not throw for status 'trialing'", () => {
    expect(() =>
      assertGroupActive({ subscriptionStatus: "trialing" }),
    ).not.toThrow();
  });

  it.each(["canceled", "past_due", "incomplete", "unpaid"])(
    "throws HttpsError for status '%s'",
    (status) => {
      expect(() => assertGroupActive({ subscriptionStatus: status })).toThrow();
    },
  );

  it("throws HttpsError when subscriptionStatus is undefined", () => {
    expect(() => assertGroupActive({})).toThrow();
  });

  it("throws HttpsError when subscriptionStatus is null", () => {
    expect(() => assertGroupActive({ subscriptionStatus: null })).toThrow();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (module not found)**

```bash
cd functions && npm test -- --testPathPattern=subscriptionGuard -t "assertGroupActive"
```

Expected output: `Cannot find module '../utils/subscriptionGuard'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// functions/src/utils/subscriptionGuard.ts
import { HttpsError } from "firebase-functions/v1/https";

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export function assertGroupActive(groupData: Record<string, unknown>): void {
  const status = groupData.subscriptionStatus as string | undefined;
  if (!status || !ACTIVE_STATUSES.has(status)) {
    throw new HttpsError(
      "failed-precondition",
      "This group's subscription is not active. Please renew to continue.",
    );
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd functions && npm test -- --testPathPattern=subscriptionGuard
```

Expected: All 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add functions/src/utils/subscriptionGuard.ts functions/src/__tests__/subscriptionGuard.test.ts
git commit -m "feat(functions): add assertGroupActive subscription guard helper"
```

---

### Task 2: Apply guard to Pattern A callables (group doc already loaded)

**Files:**

- Modify: `functions/src/callable/getAttendanceAnalytics.ts`
- Modify: `functions/src/callable/getGroupHealthTimeSeries.ts`
- Modify: `functions/src/callable/getMemberEngagementMetrics.ts`
- Modify: `functions/src/callable/getTreasuryTrends.ts`
- Modify: `functions/src/callable/generateReferralCode.ts`
- Modify: `functions/src/callable/getGroupDashboardMetrics.ts`

All six files follow the same pattern: group doc is fetched, `groupData.admins` is checked, and the business logic follows. The change in each file is:

1. Add the import at the top.
2. Add one `assertGroupActive(groupData)` call immediately after the `if (!admins.includes(userId))` block.

- [ ] **Step 1: Edit `getAttendanceAnalytics.ts`**

Add to imports (top of file):

```typescript
import { assertGroupActive } from "../utils/subscriptionGuard";
```

After the existing admin check (currently ends at the `if (!admins.includes(userId)) { throw ... }` block around line 74), add:

```typescript
assertGroupActive(groupData);
```

- [ ] **Step 2: Edit `getGroupHealthTimeSeries.ts`**

Same two changes — add import and `assertGroupActive(groupData)` after admin check.

- [ ] **Step 3: Edit `getMemberEngagementMetrics.ts`**

Same two changes — the admin check is around line 46. Add after it:

```typescript
assertGroupActive(groupData);
```

- [ ] **Step 4: Edit `getTreasuryTrends.ts`**

Same two changes — the groupSnap/groupData/admins block is around line 99–108.

- [ ] **Step 5: Edit `generateReferralCode.ts`**

Same two changes — group doc is loaded in a `Promise.all` around line 55. Add after the admin check block at ~line 67:

```typescript
assertGroupActive(groupData);
```

- [ ] **Step 6: Edit `getGroupDashboardMetrics.ts`**

Same two changes — group doc load and admin check are already present after the fix applied in the prior session. Add `assertGroupActive(groupData)` after the permission-denied throw.

- [ ] **Step 7: Run tests**

```bash
cd functions && npm test
```

Expected: all previously passing suites still pass, no new failures.

- [ ] **Step 8: Commit**

```bash
git add functions/src/callable/getAttendanceAnalytics.ts \
        functions/src/callable/getGroupHealthTimeSeries.ts \
        functions/src/callable/getMemberEngagementMetrics.ts \
        functions/src/callable/getTreasuryTrends.ts \
        functions/src/callable/generateReferralCode.ts \
        functions/src/callable/getGroupDashboardMetrics.ts
git commit -m "feat(functions): enforce subscription gate on analytics + dashboard callables"
```

---

### Task 3: Apply guard to `recordMilestone.ts` (Pattern A/B hybrid)

**Files:**

- Modify: `functions/src/callable/recordMilestone.ts`

This callable loads the group doc (for existence check and admin check via `groupData.admins`) AND also loads the caller's member doc for a fallback admin check. The group doc load already happens before the admin check, so this is Pattern A.

- [ ] **Step 1: Add import**

```typescript
import { assertGroupActive } from "../utils/subscriptionGuard";
```

- [ ] **Step 2: Add guard after the admin check block**

The admin check ends with `if (!isAdmin) { throw new HttpsError("permission-denied", ...) }` around line 112. Immediately after that block, add:

```typescript
assertGroupActive(groupData);
```

- [ ] **Step 3: Run tests**

```bash
cd functions && npm test -- --testPathPattern=recordMilestone 2>/dev/null || echo "no dedicated test"; npm test
```

Expected: all suites pass.

- [ ] **Step 4: Commit**

```bash
git add functions/src/callable/recordMilestone.ts
git commit -m "feat(functions): enforce subscription gate on recordMilestone"
```

---

### Task 4: Apply guard to governance callables (Pattern B — parallel fetch)

**Files:**

- Modify: `functions/src/callable/postGroupDailyThought.ts`
- Modify: `functions/src/callable/saveMeetingMinutes.ts`
- Modify: `functions/src/callable/saveBylawDraft.ts`
- Modify: `functions/src/callable/approveMeetingMinutes.ts`
- Modify: `functions/src/callable/ratifyBylaws.ts`

Pattern B callables only load the member doc for the admin check, so there is no group doc in scope. The fix: use `Promise.all` to fetch both the member doc and the group doc in one round trip, then check admin (from member doc) and subscription (from group doc) before proceeding.

The refactored auth block for every Pattern B callable looks like this:

```typescript
import { assertGroupActive } from "../utils/subscriptionGuard";

// Replace the sequential member-doc-then-admin-check block with:
const [memberDoc, groupSnap] = await Promise.all([
  db.collection("members").doc(`${data.groupId}_${callerId}`).get(),
  db.collection("groups").doc(data.groupId).get(),
]);

if (!groupSnap.exists) {
  throw new HttpsError("not-found", "Group not found.");
}
if (!memberDoc.exists) {
  throw new HttpsError(
    "permission-denied",
    "You are not a member of this group.",
  );
}

const memberData = memberDoc.data()!;
// keep the existing isAdmin / roles logic unchanged, e.g.:
const isAdmin =
  memberData.isAdmin === true || (memberData.roles || []).includes("admin");
if (!isAdmin) {
  throw new HttpsError("permission-denied", "<original message unchanged>");
}

assertGroupActive(groupSnap.data()!);
```

- [ ] **Step 1: Edit `postGroupDailyThought.ts`**

Replace the sequential member doc fetch + admin check (lines ~47–66) with the parallel pattern shown above. The `data.groupId` variable is already in scope from input validation.

- [ ] **Step 2: Edit `saveMeetingMinutes.ts`**

Replace lines ~82–100 (member doc fetch + secretary/admin check) with the parallel pattern. The `data.groupId` variable is already in scope. Note: this callable also allows secretaries (`roles.includes("secretary")`), preserve that check:

```typescript
const isAdmin = callerData.isAdmin === true || roles.includes("admin");
const isSecretary = roles.includes("secretary");
if (!isAdmin && !isSecretary) {
  throw new HttpsError(
    "permission-denied",
    "Only secretaries and admins can record minutes.",
  );
}
assertGroupActive(groupSnap.data()!);
```

- [ ] **Step 3: Edit `saveBylawDraft.ts`**

Replace the member doc fetch + admin check with the parallel pattern.

- [ ] **Step 4: Edit `approveMeetingMinutes.ts`**

Read the current admin check pattern. Apply the parallel pattern. Add `assertGroupActive(groupSnap.data()!)` after the admin check.

- [ ] **Step 5: Edit `ratifyBylaws.ts`**

Read the current admin check pattern. Apply the parallel pattern. Add `assertGroupActive(groupSnap.data()!)` after the admin check.

- [ ] **Step 6: Run tests**

```bash
cd functions && npm test
```

Expected: all previously passing suites still pass.

- [ ] **Step 7: Commit**

```bash
git add functions/src/callable/postGroupDailyThought.ts \
        functions/src/callable/saveMeetingMinutes.ts \
        functions/src/callable/saveBylawDraft.ts \
        functions/src/callable/approveMeetingMinutes.ts \
        functions/src/callable/ratifyBylaws.ts
git commit -m "feat(functions): enforce subscription gate on governance callables"
```

---

### Task 5: Apply guard to election and vote callables (Pattern B)

**Files:**

- Modify: `functions/src/callable/createConscienceVote.ts`
- Modify: `functions/src/callable/closeConscienceVote.ts`
- Modify: `functions/src/callable/openElection.ts`
- Modify: `functions/src/callable/closeElection.ts`
- Modify: `functions/src/callable/openElectionVoting.ts`

These callables each load a member doc for the admin check. Some also load the group doc later (e.g. to fetch the group name). In those cases, move the group doc load up into the `Promise.all` and remove the duplicate load below.

Apply the same parallel fetch pattern from Task 4 to each file. The key change in each:

1. Add `import { assertGroupActive } from "../utils/subscriptionGuard";`
2. Wrap the member doc fetch in `Promise.all([memberDoc, groupSnap])`
3. If the group doc was also loaded later in the function, remove that second load and use `groupSnap` instead
4. Add `assertGroupActive(groupSnap.data()!)` after the admin check

- [ ] **Step 1: Edit `createConscienceVote.ts`**

The group doc is loaded around line 90 to get the group name. Move this load into `Promise.all` at the top of the auth section alongside the member doc.

```typescript
const [memberDoc, groupSnap] = await Promise.all([
  db.collection("members").doc(`${data.groupId}_${callerId}`).get(),
  db.collection("groups").doc(data.groupId).get(),
]);
// ... admin check ...
assertGroupActive(groupSnap.data()!);
// Remove the separate groupSnap load further down; use groupSnap.data()?.name instead
```

- [ ] **Step 2: Edit `closeConscienceVote.ts`**

Apply the same pattern. Add import + parallel fetch + guard.

- [ ] **Step 3: Edit `openElection.ts`**

Apply the parallel pattern. If a group doc load exists later, consolidate.

- [ ] **Step 4: Edit `closeElection.ts`**

Apply the same pattern.

- [ ] **Step 5: Edit `openElectionVoting.ts`**

Apply the same pattern.

- [ ] **Step 6: Run tests**

```bash
cd functions && npm test
```

Expected: all previously passing suites still pass.

- [ ] **Step 7: Commit**

```bash
git add functions/src/callable/createConscienceVote.ts \
        functions/src/callable/closeConscienceVote.ts \
        functions/src/callable/openElection.ts \
        functions/src/callable/closeElection.ts \
        functions/src/callable/openElectionVoting.ts
git commit -m "feat(functions): enforce subscription gate on election and vote callables"
```

---

### Task 6: Apply guard to remaining admin callables

**Files:**

- Modify: `functions/src/callable/deleteGroupResource.ts`
- Modify: `functions/src/callable/bookmarkLiteratureForGroup.ts`
- Modify: `functions/src/callable/affiliateGroupToIntergroup.ts`
- Modify: `functions/src/callable/banUser.ts`
- Modify: `functions/src/callable/initiateAdminRemoval.ts`

- [ ] **Step 1: Edit `deleteGroupResource.ts`** (Pattern B)

Apply the parallel fetch pattern from Task 4: `Promise.all([memberDoc, groupSnap])`, admin check, then `assertGroupActive(groupSnap.data()!)`.

- [ ] **Step 2: Edit `bookmarkLiteratureForGroup.ts`** (Pattern B)

Read the file to identify the admin check block. Apply the parallel fetch pattern. Add `assertGroupActive`.

- [ ] **Step 3: Edit `affiliateGroupToIntergroup.ts`** (group doc already loaded)

This callable loads `groupSnap` around line 60 to get the group name (after the intergroup admin check and the member doc admin check). Add import and move the `groupSnap` load up to a `Promise.all` with the member doc, or keep it sequential and add the guard right after `groupSnap` is fetched:

```typescript
// After: const groupSnap = await db.collection("groups").doc(groupId).get();
// and:   if (!groupSnap.exists) { throw ... }
// Add:
assertGroupActive(groupSnap.data()!);
```

Also add the import.

- [ ] **Step 4: Edit `banUser.ts`** (group doc was NOT loaded in the prior session's fix)

Read the current file to check whether a group doc load was added. If not, apply the parallel fetch pattern and add `assertGroupActive`.

- [ ] **Step 5: Edit `initiateAdminRemoval.ts`** (Pattern B)

Read the file to identify the admin check block. Apply the parallel fetch pattern. Add `assertGroupActive`.

- [ ] **Step 6: Run tests**

```bash
cd functions && npm test
```

Expected: all previously passing suites still pass.

- [ ] **Step 7: Commit**

```bash
git add functions/src/callable/deleteGroupResource.ts \
        functions/src/callable/bookmarkLiteratureForGroup.ts \
        functions/src/callable/affiliateGroupToIntergroup.ts \
        functions/src/callable/banUser.ts \
        functions/src/callable/initiateAdminRemoval.ts
git commit -m "feat(functions): enforce subscription gate on remaining admin callables"
```

---

### Task 7: Fix `getUserGroups` N+1 meetings query (PERF-C3)

**Files:**

- Modify: `mobile/src/models/GroupModel.ts` (lines 829–845)

Currently each group triggers an independent `where('groupId', '==', group.id)` query. With N groups that is N queries. The fix: collect all group IDs, split into chunks of 30 (Firestore `in` operator limit), run one query per chunk, then map meetings back to their groups.

- [ ] **Step 1: Write the failing test**

In `mobile/src/__tests__/GroupModel.test.ts` (or wherever GroupModel is tested), add:

```typescript
it("getUserGroups issues at most 2 queries to meetings collection for a 35-group user", async () => {
  // Arrange: mock 35 member docs, 35 group docs, and a single batched meetings query
  // (the mock should track how many times collection('meetings').where(...).get() is called)

  // Assert: the meetings collection was queried no more than ceil(35/30) = 2 times
  // This verifies the batch query replaces the N individual queries
  expect(mockMeetingsWhere).toHaveBeenCalledTimes(2);
});
```

> Note: the exact mock wiring depends on how GroupModel tests are structured in this codebase. Read `mobile/src/__tests__/GroupModel.test.ts` (if it exists) or the closest test file for GroupModel before writing this test to follow the existing mock pattern. If no test file exists, create `mobile/src/__tests__/GroupModel.getUserGroups.test.ts`.

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd mobile && npm test -- --testPathPattern=GroupModel
```

Expected: The batched-query call count assertion fails (actual count = N).

- [ ] **Step 3: Implement the batched meetings query**

Replace lines 829–845 in `mobile/src/models/GroupModel.ts`:

```typescript
// BEFORE (N queries):
const promises = groups.map(async (group) => {
  const meetingsSnapshot = await firestore()
    .collection("meetings")
    .where("groupId", "==", group.id)
    .get();
  const meetings = meetingsSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Meeting[];
  return { ...group, meetings };
});
const groupsWithMeetings = await Promise.all(promises);

// AFTER (ceil(N/30) queries):
const BATCH_SIZE = 30;
const allMeetings: Meeting[] = [];
for (let i = 0; i < groupIds.length; i += BATCH_SIZE) {
  const chunk = groupIds.slice(i, i + BATCH_SIZE);
  const meetingsSnap = await firestore()
    .collection("meetings")
    .where("groupId", "in", chunk)
    .get();
  allMeetings.push(
    ...meetingsSnap.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
        }) as Meeting,
    ),
  );
}
const meetingsByGroupId = new Map<string, Meeting[]>();
for (const meeting of allMeetings) {
  const gid = (meeting as any).groupId as string;
  const list = meetingsByGroupId.get(gid) ?? [];
  list.push(meeting);
  meetingsByGroupId.set(gid, list);
}
const groupsWithMeetings = groups.map((group) => ({
  ...group,
  meetings: meetingsByGroupId.get(group.id) ?? [],
}));
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd mobile && npm test -- --testPathPattern=GroupModel
```

Expected: The batched-query count assertion passes.

- [ ] **Step 5: Run full mobile test suite**

```bash
cd mobile && npm test
```

Expected: all suites pass (or same failures as before this change).

- [ ] **Step 6: Commit**

```bash
git add mobile/src/models/GroupModel.ts
git commit -m "perf(mobile): batch meetings queries in getUserGroups to eliminate N+1 pattern"
```

---

## Self-Review

### Spec coverage

| Requirement                                            | Covered by    |
| ------------------------------------------------------ | ------------- |
| AR-C1: expired groups cannot use admin features        | Tasks 1–6     |
| PERF-C3: getUserGroups N+1 eliminated                  | Task 7        |
| `assertGroupActive` helper is tested in isolation      | Task 1        |
| Pattern A callables (group doc already loaded)         | Task 2–3      |
| Pattern B callables (member doc only) — parallel fetch | Tasks 4–6     |
| Firestore `in` limit (30) handled                      | Task 7 step 3 |

### Type consistency

- `assertGroupActive` accepts `Record<string, unknown>` — all callables pass `groupSnap.data()!` or `groupData` (both are `DocumentData = Record<string, any>`), compatible.
- `meetingsByGroupId` keys are `string` (groupId field from meeting doc). Groups are mapped by `group.id` (Firestore doc ID). These must be the same value — confirm meetings have a `groupId` field matching the group's doc ID before applying the fix (based on the existing single-group query `where('groupId', '==', group.id)`, they do).

### Placeholder scan

No placeholders. Every step contains either exact code or explicit instructions to read the current file before editing (for callables where line numbers may shift).
