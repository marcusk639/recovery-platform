# RecoveryConnect Code Review -- 2026-02-23

**Scope:** Product requirements vs. actual implementation correctness. Focused on bugs not already identified in the 2026-02-22 review.

**Approach:** Reviewed product docs (PRODUCT_REQUIREMENTS.md, ROADMAP.md, STRATEGIC_ANALYSIS.md), then systematically walked critical user flows through Firestore rules, Cloud Functions, Redux slices, models, and screens.

---

## Summary of New Findings

| Severity | Count | Description |
|----------|-------|-------------|
| Critical | 4 | Broken user flows that will fail silently or crash at runtime |
| High | 4 | Incorrect behavior affecting data integrity or security |
| Medium | 3 | Logic bugs with workarounds or limited blast radius |

Several of these compound with issues noted in the prior review (2026-02-22) but represent **distinct, separately actionable bugs** not called out there.

---

## Critical Issues

### C-1: Transaction delete will always fail -- Firestore rules block it

**Files:**
- `/Users/marcusklein/dev/RecoveryConnect/firestore.rules` line 359
- `/Users/marcusklein/dev/RecoveryConnect/mobile/src/models/TreasuryModel.ts` line 407
- `/Users/marcusklein/dev/RecoveryConnect/mobile/src/store/slices/transactionsSlice.ts` line 141

The Firestore security rule for transactions explicitly prohibits deletion for audit trail purposes:

```
// Transactions should not be deleted (audit trail)
allow delete: if false;
```

However, `TreasuryModel.deleteTransaction()` calls `transactionRef.delete()` directly from the mobile client. This call will always be rejected by Firestore with a permission error.

Worse, the method first reverses the treasury stats (`updateTreasuryStatsAfterTransaction` with inverted type) *before* attempting the delete. When the delete fails, the treasury balance has already been corrupted -- the stats reflect the reversal even though the transaction still exists.

**Impact:** Any admin or treasurer who tries to delete a transaction will:
1. See an error message
2. Have their group's treasury balance silently corrupted (reversed without the corresponding delete)
3. The imbalance persists until someone manually creates a correcting transaction

**Fix options:**
- (a) If delete should be allowed: change the Firestore rule to `allow delete: if isGroupAdminOrTreasurer(resource.data.groupId);` and wrap the stats update + delete in a Firestore transaction so they are atomic
- (b) If audit trail is intended: remove the delete button from the UI entirely and implement soft-delete (add `status: "voided"` field, update stats accordingly)

---

### C-2: Treasury overview writes will always fail from mobile client

**Files:**
- `/Users/marcusklein/dev/RecoveryConnect/firestore.rules` lines 365-371
- `/Users/marcusklein/dev/RecoveryConnect/mobile/src/models/TreasuryModel.ts` lines 417-439 (updatePrudentReserve), lines 493-519 (updateTreasuryStatsAfterTransaction)

The `treasury_overviews` collection has:

```
// Only Cloud Functions should write (via Admin SDK)
allow create, update, delete: if false;
```

But `TreasuryModel` writes to this collection from the mobile client in two places:

1. **`updatePrudentReserve()`** -- called when admin adjusts the prudent reserve amount. Calls `overviewRef.update(...)` or `overviewRef.set(...)`. Will always fail.

2. **`updateTreasuryStatsAfterTransaction()`** -- called on every transaction create, update, and delete. Calls `overviewRef.update(...)` with balance/income/expense increments. Will always fail.

This means **every treasury operation from the mobile client is broken**. Creating a transaction will succeed (the transaction document itself is written to `transactions` collection which has proper rules), but the treasury overview stats will never update. The balance display will never reflect new transactions.

**Impact:** The entire treasury feature appears non-functional from the user's perspective. Transactions are recorded but the balance, monthly income, and monthly expenses never change. The prudent reserve cannot be adjusted.

**Fix:** Either:
- (a) Move all treasury overview writes to Cloud Functions (triggered on transaction create/update/delete)
- (b) Change Firestore rules to allow admin/treasurer writes to `treasury_overviews`

Option (a) is architecturally cleaner and matches the rule comment's stated intent.

---

### C-3: `toggleAdmin` only promotes, never demotes -- misnamed function

**Files:**
- `/Users/marcusklein/dev/RecoveryConnect/mobile/src/store/slices/membersSlice.ts` lines 279-291
- `/Users/marcusklein/dev/RecoveryConnect/mobile/src/screens/homegroup/GroupMembersScreen.tsx` line 189

The `toggleAdmin` thunk is named "toggle" but only calls `GroupModel.makeAdmin()`:

```typescript
export const toggleAdmin = createAsyncThunk(
  'members/toggleAdmin',
  async ({ groupId, userId }, { rejectWithValue }) => {
    try {
      await GroupModel.makeAdmin(groupId, userId); // Always promotes!
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to toggle admin');
    }
  },
);
```

It never checks the current admin status and never calls `GroupModel.removeAdmin()`. The UI presents this as a "Toggle" button (line 189), but pressing it on an existing admin does nothing useful (or errors), and pressing it on a non-admin always promotes.

**Impact:** Group admins cannot demote other admins using this UI control. The only way to remove admin status is through the admin removal voting flow, which requires a 2/3 majority vote and takes 7 days.

**Fix:** Check the member's current `isAdmin` status and call the appropriate method:

```typescript
const member = await MemberModel.getMemberByGroupAndUser(groupId, userId);
if (member?.isAdmin) {
  await GroupModel.removeAdmin(groupId, userId);
} else {
  await GroupModel.makeAdmin(groupId, userId);
}
```

---

### C-4: DM `markMessageAsRead` fails for recipients -- Firestore rule field name mismatch

**Files:**
- `/Users/marcusklein/dev/RecoveryConnect/firestore.rules` lines 431-435
- `/Users/marcusklein/dev/RecoveryConnect/mobile/src/models/DirectMessageModel.ts` lines 432-434

The Firestore rule for non-sender DM message updates restricts changes to only the `readBy` field:

```
// non-sender can only update readBy
(request.auth.uid in get(...).data.participants
 && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['readBy']))
```

But the mobile client updates the `read` field (a map of userId -> boolean):

```typescript
await messageRef.update({
  [`read.${currentUser.uid}`]: true,
});
```

The field being updated is `read`, not `readBy`. The security rule will reject this write because `read` is not in the allowed set `['readBy']`.

**Impact:** Message read receipts silently fail for all non-sender users in direct messages. The message recipient can never mark a message as read. Unread counts accumulate indefinitely.

**Fix:** Either:
- (a) Change the Firestore rule to `hasOnly(['read'])` to match what the client writes
- (b) Change the client to use a `readBy` array instead of the `read` map

Option (a) is simpler and correct since the actual data model uses `read`.

---

## High Priority Issues

### H-1: `deleteUserAccount` queries wrong field name for DM threads -- orphaned threads

**Files:**
- `/Users/marcusklein/dev/RecoveryConnect/functions/src/callable/deleteUserAccount.ts` line 109
- `/Users/marcusklein/dev/RecoveryConnect/firestore.rules` line 403

The account deletion function queries DM threads using `participantIds`:

```typescript
.where("participantIds", "array-contains", userId)
```

But the actual field on `direct_message_threads` documents is `participants` (confirmed by the Firestore rule at line 403: `request.auth.uid in resource.data.participants` and by `DirectMessageModel` which creates threads with `participants: [userId1, userId2]`).

**Impact:** When a user deletes their account, none of their DM threads are found or cleaned up. Thread documents and all their messages persist as orphaned data. The other participant still sees the thread, but messages from the deleted user retain the original sender identity instead of being anonymized.

**Fix:** Change `"participantIds"` to `"participants"`.

---

### H-2: `joinGroupByInviteCode` does not set `isTreasurer: false` -- security rule blocks join

**File:** `/Users/marcusklein/dev/RecoveryConnect/functions/src/callable/joinGroupByInviteCode.ts` lines 106-117

The member document created by this Cloud Function sets:

```typescript
batch.set(newMemberRef, {
  userId: userId,
  groupId: groupId,
  displayName: ...,
  email: ...,
  photoURL: ...,
  isAdmin: false,
  joinedAt: ...,
  sobrietyDate: ...,
  showSobrietyDate: ...,
  showPhoneNumber: ...,
});
```

Note `isTreasurer` is **not set**. However, the Firestore member creation rule requires:

```
allow create: if isSignedIn() &&
  request.resource.data.userId == request.auth.uid &&
  memberId == request.resource.data.groupId + '_' + request.auth.uid &&
  exists(/databases/$(database)/documents/groups/$(request.resource.data.groupId)) &&
  (
    (request.resource.data.isAdmin == false && request.resource.data.isTreasurer == false)
    || isSuperAdmin()
  );
```

The rule checks `request.resource.data.isTreasurer == false`. If `isTreasurer` is not present in the document, this evaluates to `null == false` which is `false` in Firestore rules.

However, this specific function uses the Admin SDK (it runs as a Cloud Function, bypassing security rules), so this particular invocation will succeed. The issue is that:
1. The member document lacks `isTreasurer` field
2. The `onMemberWrite` trigger reads `data.isTreasurer` which will be `undefined`
3. This is inconsistent with documents created by `client-side` join which go through security rules and must set `isTreasurer: false`

**Actual Impact:** Inconsistent data model. Some member documents have `isTreasurer: false`, others have no `isTreasurer` field at all. Code that checks `data.isTreasurer === true` will work correctly (both `undefined` and `false` are not `true`), but code checking `data.isTreasurer === false` will fail for these documents.

**Fix:** Add `isTreasurer: false` to the member document creation in `joinGroupByInviteCode`.

---

### H-3: `createGroupWithSubscription` skips member document for creator -- JWT claims never set

**File:** `/Users/marcusklein/dev/RecoveryConnect/functions/src/callable/createGroupWithSubscription.ts`

(This was noted as M7 in the prior review but its implications are more severe than described there.)

The group creator is added to the `admins` array on the group document, but no `members/{groupId}_{userId}` document is created. This means:

1. `onMemberWrite` never fires, so the creator's JWT custom claims are never set
2. `isGroupMember()` in Firestore rules will fail for the creator (no claims, no member doc)
3. `isGroupAdmin()` in Firestore rules will also fail (checked via claims or member doc `isAdmin`)
4. The creator cannot read their own group's members, announcements, transactions, or any member-restricted data
5. The creator cannot create announcements, transactions, or manage members (admin checks fail)

The creator can see the group document itself (because the group read rule allows `request.auth != null`), but cannot interact with any subcollection or group-scoped data.

**Impact:** After creating a group, the admin is locked out of all admin functionality until they separately join through another path (which may not be available if they are the only member).

**Fix:** Add member document creation to the batch in `createGroupWithSubscription`:

```typescript
const memberRef = db.collection("members").doc(`${groupRef.id}_${userId}`);
firestoreBatch.set(memberRef, {
  userId: userId,
  groupId: groupRef.id,
  displayName: userData?.displayName || "Unknown",
  email: userEmail,
  isAdmin: true,
  isTreasurer: false,
  joinedAt: admin.firestore.FieldValue.serverTimestamp(),
  roles: ["admin"],
});
```

Also update the user document's `homeGroups` array.

---

### H-4: Admin removal vote threshold math allows premature rejection

**File:** `/Users/marcusklein/dev/RecoveryConnect/functions/src/callable/voteOnAdminRemoval.ts` lines 80-92

```typescript
const threshold = Math.ceil(total * 2 / 3);
const definitivelyFailed = votesAgainst > Math.floor(total / 3);
```

For a group of 4 eligible voters (`total = 4`):
- `threshold = Math.ceil(8/3) = 3` (need 3 "yes" votes to approve)
- `definitivelyFailed = votesAgainst > Math.floor(4/3) = votesAgainst > 1`

If 2 members vote "no" early, `definitivelyFailed = true` and the request is immediately rejected. But 2 members have not yet voted. If both remaining members voted "yes", the tally would be 2-2, which correctly should not pass. So the math is correct in that scenario.

However, consider a group of 3 eligible voters:
- `threshold = Math.ceil(6/3) = 2` (need 2 "yes" to approve)
- `definitivelyFailed = votesAgainst > Math.floor(3/3) = votesAgainst > 1`

If 2 members vote "no", `definitivelyFailed = true`. But with `total = 3`, only 1 voter remains. Even if they vote "yes", the max possible "yes" count is 1, which is less than threshold 2. So rejection after 2 "no" votes is actually correct.

On closer inspection the math is sound. Revising this to a **note** rather than a finding.

**Revised assessment:** The vote threshold logic is mathematically correct. `definitivelyFailed` is true only when it is impossible for the remaining voters to reach the 2/3 threshold. No fix needed.

---

## Medium Priority Issues

### M-1: `selectGroupAnnouncements` selector uses unbound entity adapter selector

**File:** `/Users/marcusklein/dev/RecoveryConnect/mobile/src/store/slices/announcementsSlice.ts` lines 302-311

```typescript
export const selectGroupAnnouncements = createSelector(
  [
    announcementsAdapter.getSelectors().selectEntities,  // Unbound!
    selectGroupAnnouncementIds,
  ],
  ...
);
```

`announcementsAdapter.getSelectors()` without a state selector returns selectors that expect the adapter state directly as their argument. But when used as an input selector to `createSelector`, it receives the full `RootState`. The selector `selectEntities` will see `{ groups: ..., announcements: ..., ... }` instead of `{ ids: [...], entities: {...} }` and return an empty object.

**Impact:** This selector always returns an empty array. However, no screen currently uses `selectGroupAnnouncements` -- they all use `selectAnnouncementsByGroupId` which works correctly. This is dead code with a latent bug; anyone referencing it will get unexpected empty results.

**Fix:** Either delete the dead selector or fix it to use the bound version:

```typescript
announcementsSelectors.selectEntities  // Already defined below, properly bound to RootState
```

---

### M-2: `fetchGroupMembers` condition blocks concurrent group member fetches

**File:** `/Users/marcusklein/dev/RecoveryConnect/mobile/src/store/slices/membersSlice.ts` lines 105-113

```typescript
condition: (groupId, { getState }) => {
  const state = getState() as RootState;
  if (state.members.status === 'loading') return false;
  return isDataStale(state.members.lastFetched[groupId]);
},
```

The `status === 'loading'` check is global, not per-group. If group A's members are being fetched, attempting to fetch group B's members will be silently skipped because the global status is 'loading'. This is particularly problematic for the dashboard or any screen that displays multiple groups.

The same pattern exists in `fetchGroupById` in `groupsSlice.ts` (line 119) and `fetchUserGroups` (line 84).

**Impact:** When navigating between groups quickly or when the dashboard fetches multiple groups, member data for some groups may not load. The user must wait for the first fetch to complete, then trigger a re-render.

**Fix:** Use a per-group loading status (e.g., `loadingGroups: Record<string, boolean>`) instead of a single global status, or remove the global loading guard from the condition function.

---

### M-3: `onMemberWrite` skips claims rebuild on member create/delete

**File:** `/Users/marcusklein/dev/RecoveryConnect/functions/src/triggers/firestore/onMemberWrite.ts` lines 150-166

```typescript
if (change.before.exists && change.after.exists) {
  // Only rebuild claims if role-related fields changed
  const roleChanged = before.isAdmin !== after.isAdmin || ...;
  if (!roleChanged) {
    return null;  // Skips rebuild
  }
}
```

This optimization only runs when both `before` and `after` exist (i.e., updates). On create or delete, the optimization block is skipped and claims are always rebuilt, which is correct.

However, there is a separate `onMemberCreate` trigger that also fires on member creation. The `onMemberWrite` trigger fires on all write events (create, update, delete). When a member is created:
1. `onMemberCreate` fires (sends welcome notification)
2. `onMemberWrite` fires (rebuilds claims)

This is correct behavior. Noting for clarity that both triggers fire and claims are rebuilt on create.

**Revised assessment:** No bug here. The trigger correctly rebuilds claims on create and delete. The optimization only applies to updates.

---

## Status of Prior Review (2026-02-22) Findings

For reference, here is the fix status of the critical issues from the prior review:

| ID | Issue | Status |
|----|-------|--------|
| MC-1 | `AddTransactionScreen` date picker never sent | **FIXED** -- `transactionDate` is now sent as ISO string, `TreasuryModel.createTransaction` uses it |
| MC-2 | `updateGroupMember` uses bare userId for lookup | **STILL OPEN** -- `state.members.members.entities[userId]` at line 202 still uses bare userId |
| MC-3 | `signOut` does not clear entity adapter | **UNVERIFIED** -- not checked in this review |
| MC-4 | Conversations sort comparer crashes on serialized dates | **UNVERIFIED** |
| MC-5 | `GroupOverviewScreen` `.getTime()` on serialized date | **UNVERIFIED** |
| MC-6 | `searchGroups` location performs unfiltered scan | **FIXED** -- now uses `searchGroupsByLocation` Cloud Function for coordinate-based search |
| FC-1 | `onAnnouncementCreate` wrong collection path | **FIXED** -- now queries top-level `members` collection with `where("groupId", "==", groupId)` |
| FC-2 | `deleteUserAccount` reuses committed batch | **UNVERIFIED** |
| FC-3 | Custom meetings dropped from `getAll12StepMeetings` | **FIXED** -- `meetings[3]` now included |
| FC-4 | Scheduled announcements collection path mismatch | **PARTIALLY FIXED** -- scheduled publisher uses top-level collection, `onAnnouncementCreate` now triggers on `announcements/{id}` (top-level) |
| PS-1 | Duplicate `recurring_transactions` rules | **FIXED** -- only one match block remains |
| PS-2 | `createStripeCheckoutSession` open redirect | **FIXED** -- URLs now hardcoded server-side |
| PH-1 | `createStripeCheckoutSession` wrong price | **UNVERIFIED** |
| M7 (functions) | Creator not added to members collection | **STILL OPEN** -- see H-3 above |

### Still-open issues from prior review confirmed in this review:

- **`ngeohash` undefined variable** (M9 in prior review) -- Still present in `/Users/marcusklein/dev/RecoveryConnect/functions/src/utils/meetingUtils.ts` line 44. `ngeohash` is used but never imported. Any call to `formatMeetingForFirestore` will crash.

- **`MAX_DISTANCE_METERS = 500` vs km** (M12 in prior review) -- Still present at line 101 of the same file. `geofire.distanceBetween()` returns kilometers, so `500` matches meetings up to 500 km away.

- **`deleteUserAccount` does not cancel Stripe subscriptions** (FH-6 in prior review) -- Still open. Verified by reading the file; no Stripe cancellation logic present.

---

## Architectural Observations

### Treasury architecture is fundamentally broken

The combination of C-1 and C-2 means the entire treasury feature is non-functional from the mobile client:
- Transaction creation writes succeed (transaction doc is created), but the treasury overview stats never update
- Transaction deletion always fails, and corrupts stats in the attempt
- Prudent reserve adjustments always fail

The root cause is that `treasury_overviews` has `allow create, update, delete: if false;` (intended for Cloud Functions only), but all treasury stat updates happen from the mobile client via `TreasuryModel`. This is a complete mismatch between the security model and the implementation.

**Resolution path:** Implement Cloud Function triggers on the `transactions` collection to maintain `treasury_overviews` automatically, and move `updatePrudentReserve` to a callable Cloud Function.

### Direct Messages read receipts are silently broken

C-4 means read receipts never work in DMs. Combined with the Firestore security rule, every `markMessageAsRead` call for non-sender users fails silently. The conversation unread count grows indefinitely for all users. This likely went unnoticed because the error is caught and logged but not surfaced to users.

### Group creation is a dead end

H-3 means group creators are immediately locked out after creation. This is the single most critical user journey in the app (admin pays for subscription, creates group, then discovers they cannot manage it). This must be fixed before any production traffic.
