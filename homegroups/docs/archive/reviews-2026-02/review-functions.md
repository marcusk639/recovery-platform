# Cloud Functions Code Review - RecoveryConnect / Homegroups

**Reviewer**: Claude Opus 4.6 (automated code review)
**Date**: 2026-02-22
**Scope**: `/functions/src/` -- All callable functions, triggers, scheduled functions, utilities, and webhook handlers

---

## Executive Summary

Reviewed 70+ TypeScript source files comprising the entire Firebase Cloud Functions backend. Identified **4 Critical**, **9 High**, **14 Medium**, and **12 Low** severity issues spanning security vulnerabilities, logic errors, data inconsistencies, and missing functionality.

The codebase is generally well-structured with good error handling patterns, proper auth checks on callable functions, and sensible Stripe integration. The most urgent issues involve a duplicate scheduled function export, a batch-write bug in `deleteUserAccount`, inconsistent collection paths for announcements, and potential infinite-loop triggers between `onGroupAdminUpdate` and `onGroupTreasurerUpdate`.

---

## Critical Issues

### C1. Duplicate `scheduledAnnouncementPublisher` -- Only One Deploys, Wrong Collection Path

**Files**:
- `/Users/marcusklein/dev/RecoveryConnect/functions/src/triggers/scheduled/scheduledAnnouncementPublisher.ts`
- `/Users/marcusklein/dev/RecoveryConnect/functions/src/triggers/pubsub/scheduledAnnouncementPublisher.ts`

**Lines**: Both entire files

**Description**: Two files export the same symbol `scheduledAnnouncementPublisher`. In `index.ts` (line 90), only the `triggers/scheduled/` version is imported. The `triggers/pubsub/` version is never deployed, making it dead code. However, the more serious issue is that **both** query a top-level `announcements` collection:

```typescript
// Both files query:
db.collection("announcements").where("status", "==", "scheduled")...
```

But `onAnnouncementCreate` (line 63-67) reads members from a **subcollection**:
```typescript
db.collection("groups").doc(groupId).collection("members").get();
```

While announcements appear to be stored in a top-level `announcements` collection (with a `groupId` field), the `onAnnouncementCreate` trigger listens on the **subcollection** path:
```typescript
// onAnnouncementCreate.ts line 36
.document("groups/{groupId}/announcements/{announcementId}")
```

This means:
1. Announcements created in `groups/{groupId}/announcements/` trigger `onAnnouncementCreate` push notifications
2. The scheduled publisher queries the top-level `announcements` collection -- a **different location**
3. Scheduled announcements must be stored in the top-level collection to be found by the publisher, but then `onAnnouncementCreate` will never fire for them when they transition to "published"

**Severity**: Critical

**Proposed Fix**: Unify the announcement storage location. Either:
- (a) Move the scheduled publisher to query `groups/{groupId}/announcements/` using a collectionGroup query, OR
- (b) Store all announcements in the top-level `announcements` collection and change `onAnnouncementCreate` to listen on `announcements/{announcementId}`

Also remove the dead duplicate file in `triggers/pubsub/`.

---

### C2. `deleteUserAccount` Batch Write Bug -- Batch Reuse After Commit

**File**: `/Users/marcusklein/dev/RecoveryConnect/functions/src/callable/deleteUserAccount.ts`
**Lines**: 135-153

**Description**: The anonymization of group chat messages creates a single `anonymizeBatch`, commits it every 400 operations, but then **continues adding to the same already-committed batch object**:

```typescript
const anonymizeBatch = db.batch(); // Created ONCE
let anonymizeCount = 0;
for (const msgDoc of groupChatsQuery.docs) {
  anonymizeBatch.update(msgDoc.ref, { ... }); // Added to same batch after commit!
  anonymizeCount++;
  if (anonymizeCount % 400 === 0) {
    await anonymizeBatch.commit(); // Commits, but batch object is now "used"
  }
}
if (anonymizeCount % 400 !== 0) {
  await anonymizeBatch.commit(); // Tries to commit the same object again
}
```

After a Firestore `WriteBatch` is committed, adding more operations to it and committing again is undefined behavior. In practice, Firestore may throw an error or silently do nothing, meaning messages beyond the first 400 will NOT be anonymized.

**Severity**: Critical

**Proposed Fix**: Create a new batch object after each commit:
```typescript
let anonymizeBatch = db.batch();
let anonymizeCount = 0;
for (const msgDoc of groupChatsQuery.docs) {
  anonymizeBatch.update(msgDoc.ref, { ... });
  anonymizeCount++;
  if (anonymizeCount % 400 === 0) {
    await anonymizeBatch.commit();
    anonymizeBatch = db.batch(); // Create fresh batch
  }
}
if (anonymizeCount % 400 !== 0) {
  await anonymizeBatch.commit();
}
```

---

### C3. `onAnnouncementCreate` Queries Wrong Members Collection

**File**: `/Users/marcusklein/dev/RecoveryConnect/functions/src/triggers/firestore/onAnnouncementCreate.ts`
**Lines**: 63-67

**Description**: This trigger queries members from a **subcollection** path `groups/{groupId}/members`, but the codebase stores members in the **top-level** `members` collection (with document IDs like `{groupId}_{userId}`). Every other function in the codebase uses `db.collection("members").where("groupId", "==", groupId)`.

```typescript
// WRONG -- reads from subcollection (which likely has zero documents)
const membersSnapshot = await db
  .collection("groups")
  .doc(groupId)
  .collection("members")
  .get();
```

This means **announcement push notifications are never sent** because `membersSnapshot` is always empty.

**Severity**: Critical

**Proposed Fix**: Change to query the top-level `members` collection:
```typescript
const membersSnapshot = await db
  .collection("members")
  .where("groupId", "==", groupId)
  .get();
```

---

### C4. `getAll12StepMeetings` Drops Custom Meetings from Return Value

**File**: `/Users/marcusklein/dev/RecoveryConnect/functions/src/utils/meetings.ts`
**Lines**: 438-457

**Description**: The function fetches 4 categories of meetings in parallel (AA, NA, Celebrate Recovery, Custom) but only returns the first 3:

```typescript
const meetings = await Promise.all(meetingPromises);
// Index: [0]=AA, [1]=NA, [2]=CelebrateRecovery, [3]=Custom
return [...meetings[0], ...meetings[1], ...meetings[2]];
// meetings[3] (Custom) is DROPPED!
```

Custom meetings are fetched but never included in the "all" results.

**Severity**: Critical

**Proposed Fix**:
```typescript
return [...meetings[0], ...meetings[1], ...meetings[2], ...meetings[3]];
```

---

## High Severity Issues

### H1. `onGroupAdminUpdate` Creates Duplicate Subscriptions on Every Admin Addition

**File**: `/Users/marcusklein/dev/RecoveryConnect/functions/src/triggers/firestore/onGroupAdminUpdate.ts`
**Lines**: 79-165 (currently commented out in `index.ts` line 69)

**Description**: This trigger is currently **commented out** in `index.ts`, but if re-enabled, it creates a new Stripe subscription every time an admin is added to a group -- even if the group already has a `trialing` subscription. The check on lines 87-95 only skips if status is exactly `"active"`, meaning groups with `"trialing"`, `"past_due"`, or `"incomplete"` status would get duplicate subscriptions created.

**Severity**: High (currently mitigated by being disabled)

**Proposed Fix**: If this trigger is ever re-enabled, broaden the subscription existence check:
```typescript
if (
  afterData.stripeSubscriptionId &&
  ["active", "trialing", "past_due", "incomplete"].includes(afterData.subscriptionStatus)
) {
  // Skip subscription creation
}
```

---

### H2. `onGroupTreasurerUpdate` and `onMemberWrite` Can Create Infinite Loop

**File**: `/Users/marcusklein/dev/RecoveryConnect/functions/src/triggers/firestore/onGroupTreasurerUpdate.ts`
**Lines**: 69-87

**Description**: `onGroupTreasurerUpdate` updates member documents when treasurer arrays change, which triggers `onMemberWrite`, which rebuilds claims. The `onMemberWrite` trigger has an optimization that only fires when role-related fields change (line 155-165), and `onGroupTreasurerUpdate` updates `isTreasurer` and `roles` fields, which ARE role-related fields. This means:

1. `onGroupTreasurerUpdate` fires and updates member doc (sets `isTreasurer`, modifies `roles`)
2. `onMemberWrite` fires because role fields changed
3. `onMemberWrite` calls `rebuildUserClaims` which reads member docs (fine, no loop)

The chain stops at step 3 because `rebuildUserClaims` does not write to member documents. However, the `onGroupTreasurerUpdate` also calls `rebuildUserClaims` directly (line 98), causing **duplicate claims rebuilds** for every affected user -- once from the direct call and once from the `onMemberWrite` trigger.

**Severity**: High (wasted compute, potential for race conditions on claims writes)

**Proposed Fix**: Remove the direct `rebuildUserClaims` call from `onGroupTreasurerUpdate` since `onMemberWrite` will handle it automatically:
```typescript
// Remove this line from onGroupTreasurerUpdate:
await rebuildUserClaims(userId);
```

---

### H3. `generateGroupInvite` Transaction Contains Non-Transactional Reads

**File**: `/Users/marcusklein/dev/RecoveryConnect/functions/src/callable/generateGroupInvite.ts`
**Lines**: 95-139

**Description**: The code runs a Firestore transaction but performs a non-transactional query inside it:

```typescript
await db.runTransaction(async (transaction) => {
  // This query does NOT use `transaction.get()` -- it bypasses the transaction
  const existingInviteSnap = await db
    .collection("groupInvites")
    .where("code", "==", code)
    .limit(1)
    .get(); // Regular get(), not transaction.get()

  // ...
  transaction.set(inviteRef, { ... }); // Transactional write
});
```

The uniqueness check for the invite code happens outside the transaction's read set, meaning two concurrent calls could generate the same code and both pass the uniqueness check. The `transaction.set()` at the end would succeed for both, creating duplicate invite codes.

**Severity**: High

**Proposed Fix**: Either use a deterministic document ID (the code itself) and `transaction.get()` on that specific document, or use a simple `set()` with the code as the document ID:
```typescript
const inviteRef = db.collection("groupInvites").doc(code);
await db.runTransaction(async (transaction) => {
  const existing = await transaction.get(inviteRef);
  if (existing.exists) { /* try another code */ }
  transaction.set(inviteRef, { ... });
});
```

---

### H4. `banUser` Does Not Check for Existing Bans Before Creating New Ones

**File**: `/Users/marcusklein/dev/RecoveryConnect/functions/src/callable/banUser.ts`
**Lines**: 106-121

**Description**: The function creates a new ban record without checking if an active ban already exists for the same user+group combination. This allows admins to create unlimited duplicate ban records.

**Severity**: High

**Proposed Fix**: Before creating the ban, query for existing active bans:
```typescript
const existingBan = await db
  .collection("user_bans")
  .where("userId", "==", data.userId)
  .where("groupId", "==", data.groupId || null)
  .where("isActive", "==", true)
  .limit(1)
  .get();

if (!existingBan.empty) {
  throw new HttpsError("already-exists", "User is already banned.");
}
```

---

### H5. `joinGroupByInviteCode` Does Not Check User Bans

**File**: `/Users/marcusklein/dev/RecoveryConnect/functions/src/callable/joinGroupByInviteCode.ts`
**Lines**: 63-133

**Description**: When a user joins a group via invite code, there is no check whether they are banned from that group. A banned user could rejoin immediately using another invite code.

**Severity**: High

**Proposed Fix**: After verifying the invite code is valid and before creating the member document, check for active bans:
```typescript
const banQuery = await db
  .collection("user_bans")
  .where("userId", "==", userId)
  .where("groupId", "==", groupId)
  .where("isActive", "==", true)
  .limit(1)
  .get();

if (!banQuery.empty) {
  throw new HttpsError("permission-denied", "You are banned from this group.");
}
```

---

### H6. `findMeetings` Does Not Require Authentication

**File**: `/Users/marcusklein/dev/RecoveryConnect/functions/src/callable/findMeetings.ts`
**Lines**: 143-271

**Description**: Unlike most other callable functions, `findMeetings` does not verify `request.auth`. Any unauthenticated client can call this function and perform expensive meeting searches (geohash queries, external API calls to NA/AA services). This creates a denial-of-service vector.

**Severity**: High

**Proposed Fix**: Add authentication check at the start:
```typescript
if (!request.auth) {
  throw new functions.https.HttpsError("unauthenticated", "User must be logged in.");
}
```

---

### H7. `sendMentionNotifications` Does Not Require Authentication

**File**: `/Users/marcusklein/dev/RecoveryConnect/functions/src/callable/sendMentionNotifications.ts`
**Lines**: 23-148

**Description**: This callable function does not check `request.auth`, nor does it verify the caller is a member of the group they claim to be sending mention notifications for. An unauthenticated or malicious user could trigger push notifications to any user by providing arbitrary `mentionedUserIds`.

**Severity**: High

**Proposed Fix**: Add auth check and verify group membership:
```typescript
if (!request.auth) {
  throw new HttpsError("unauthenticated", "Must be authenticated.");
}
// Also verify the caller is a member of the group
```

---

### H8. `searchGroupsByLocation` Does Not Require Authentication

**File**: `/Users/marcusklein/dev/RecoveryConnect/functions/src/callable/searchGroupsByLocation.ts`
**Lines**: 33-141

**Description**: While the `userId` is extracted from `request.auth?.uid` on line 36, there is no check to ensure the user is actually authenticated. The function proceeds to execute expensive geohash queries regardless.

**Severity**: High

**Proposed Fix**: Add authentication check.

---

### H9. `deleteUserAccount` Does Not Cancel Stripe Subscriptions

**File**: `/Users/marcusklein/dev/RecoveryConnect/functions/src/callable/deleteUserAccount.ts`
**Lines**: 237-257

**Description**: When a user account is deleted, the function removes the user from `admins` and `treasurers` arrays in groups, but does NOT cancel any Stripe subscriptions they own. If the deleted user was the billing admin for a group, the subscription will continue charging a payment method associated with a deleted account, potentially causing payment failures and support issues.

**Severity**: High

**Proposed Fix**: Before deleting the auth account, check for and cancel subscriptions on groups where the user is the sole admin:
```typescript
for (const groupDoc of adminGroupsQuery.docs) {
  const gData = groupDoc.data();
  if (gData.admins?.length === 1 && gData.stripeSubscriptionId) {
    try {
      await stripe.subscriptions.cancel(gData.stripeSubscriptionId);
    } catch (err) {
      functions.logger.warn(`Could not cancel subscription: ${err}`);
    }
  }
}
```

---

## Medium Severity Issues

### M1. `formatMeetingForFirestore` Has Dead Variable Assignment for `day`

**File**: `/Users/marcusklein/dev/RecoveryConnect/functions/src/utils/meetingUtils.ts`
**Lines**: 27-29

**Description**:
```typescript
const meeting: Partial<Meeting> = {};
let day = meeting.day || ""; // meeting was just created, meeting.day is always undefined
if (typeof day === "number") {  // day is always "", never a number
  day = moment.weekdays(day);   // Dead code
}
```

The `day` variable is never assigned a meaningful value from the `apiMeeting` input. Later, `meeting.day = day` sets day to an empty string for all formatted meetings, potentially breaking day-of-week filtering and meeting instance generation.

**Severity**: Medium

**Proposed Fix**:
```typescript
const dayIndex = apiMeeting.day;
let day = "";
if (typeof dayIndex === "number") {
  day = moment.weekdays(dayIndex).toLowerCase();
} else if (typeof dayIndex === "string") {
  day = dayIndex.toLowerCase();
}
```

---

### M2. `createStripeCheckoutSession` Uses `priceIdMember` Instead of Group Product Price

**File**: `/Users/marcusklein/dev/RecoveryConnect/functions/src/callable/createStripeCheckoutSession.ts`
**Lines**: 73-76

**Description**: The checkout session uses `priceIdMember` (a member-level price) instead of the group subscription price. This is inconsistent with `createGroupSubscription` and `createGroupWithSubscription` which use `getDefaultPriceForProduct(productIdGroup)`.

```typescript
line_items: [{
  price: priceIdMember, // Should this be the group price instead?
  quantity: 1,
}],
```

If `priceIdMember` is intentionally a different product (e.g., per-member pricing), the naming and inline comments ("flat rate subscription") are misleading. If it should be the group price, this is a billing error.

**Severity**: Medium

**Proposed Fix**: Clarify intent. If this checkout session is for group subscriptions, use `getDefaultPriceForProduct(productIdGroup)` consistently.

---

### M3. `onMeetingUpdate` Fire-and-Forget Batch Commits Can Silently Fail

**File**: `/Users/marcusklein/dev/RecoveryConnect/functions/src/triggers/firestore/onMeetingUpdate.ts`
**Lines**: 60-68, 181-188

**Description**: When batch limits are hit, commits are fired without awaiting the result in the delete path:

```typescript
deleteBatch.commit().catch((err) =>
  functions.logger.error("Batch delete error:", err)
);
deleteBatch = db.batch(); // New batch immediately, old commit still pending
```

The final `await deleteBatch.commit()` will execute while the intermediate commits are still in-flight. If an intermediate commit fails, the error is caught but processing continues -- leaving the data in an inconsistent state. Same pattern on lines 181-188 for updates.

**Severity**: Medium

**Proposed Fix**: Collect all intermediate commit promises and await them all:
```typescript
const commitPromises: Promise<any>[] = [];
// ...
if (deleteCount % 450 === 0) {
  commitPromises.push(deleteBatch.commit());
  deleteBatch = db.batch();
}
// ... at end:
commitPromises.push(deleteBatch.commit());
await Promise.all(commitPromises);
```

---

### M4. `voteOnAdminRemoval` Race Condition on Vote Tallying

**File**: `/Users/marcusklein/dev/RecoveryConnect/functions/src/callable/voteOnAdminRemoval.ts`
**Lines**: 57-96

**Description**: The vote is written, then all votes are re-read and tallied outside of a transaction. Two simultaneous votes could each read the tally before the other's write is visible, leading to incorrect counts and potentially missing the approval threshold. This could delay or prevent an admin removal that should have been approved.

**Severity**: Medium

**Proposed Fix**: Use a Firestore transaction to atomically read existing votes, write the new vote, and update the tally:
```typescript
await db.runTransaction(async (transaction) => {
  const voteRef = ...;
  transaction.set(voteRef, { ... });
  // Re-read all votes within transaction
  // Update tally atomically
});
```

---

### M5. `processReferralConversion` Uses `trial_end` to Extend Subscription Period

**File**: `/Users/marcusklein/dev/RecoveryConnect/functions/src/utils/stripeUtils.ts`
**Lines**: 488-494

**Description**: The referral reward sets `trial_end` to extend the subscription:

```typescript
await stripe.subscriptions.update(referrerSubscriptionId, {
  trial_end: newPeriodEnd,
  proration_behavior: "none",
});
```

Setting `trial_end` on an active (non-trialing) subscription will put it BACK into trial status, which means the subscriber temporarily loses their "active" status. This could trigger UI changes showing them as "trialing" and might affect feature access if the app checks for `subscriptionStatus === "active"`.

**Severity**: Medium

**Proposed Fix**: Instead of manipulating `trial_end`, consider creating a credit or applying a coupon to the next invoice via `stripe.invoices.create()` or `stripe.creditNotes.create()`.

---

### M6. `scheduledRecurringTransactions` Writes to Wrong Collection Path

**File**: `/Users/marcusklein/dev/RecoveryConnect/functions/src/triggers/pubsub/scheduledRecurringTransactions.ts`
**Lines**: 39-55

**Description**: Transactions are written to a top-level `transactions` collection, but in `handlePaymentIntentSucceeded` (stripeUtils.ts line 333-346), donation transactions are written to `groups/{groupId}/transactions` (a subcollection). This inconsistency means treasury data may be split across two different locations.

**Severity**: Medium

**Proposed Fix**: Decide on one canonical location for transactions and use it consistently.

---

### M7. `createGroupWithSubscription` Does Not Add Creator as Member

**File**: `/Users/marcusklein/dev/RecoveryConnect/functions/src/callable/createGroupWithSubscription.ts`
**Lines**: 219-260

**Description**: When creating a group with subscription, the creator is added to the `admins` array of the group document, but no member document is created in the top-level `members` collection (`members/{groupId}_{userId}`). This means:
- `onMemberWrite` will not fire to set up their JWT claims
- The user will not appear in member queries for the group
- The user's `homeGroups` array on their user document is not updated

**Severity**: Medium

**Proposed Fix**: Add member document creation to the batch:
```typescript
const creatorMemberRef = db.collection("members").doc(`${groupRef.id}_${userId}`);
firestoreBatch.set(creatorMemberRef, {
  userId: userId,
  groupId: groupRef.id,
  isAdmin: true,
  isTreasurer: false,
  joinedAt: admin.firestore.FieldValue.serverTimestamp(),
  displayName: userData?.displayName || "Admin",
  // ... other fields
});
```

---

### M8. `claims.ts` Is Entirely Commented Out

**File**: `/Users/marcusklein/dev/RecoveryConnect/functions/src/utils/claims.ts`
**Lines**: 1-31

**Description**: The entire file is commented out. While `onMemberWrite.ts` has its own implementation of claims management, this dead file may cause confusion for developers.

**Severity**: Medium (code hygiene)

**Proposed Fix**: Either delete the file or document why it exists (e.g., legacy reference).

---

### M9. `meetingUtils.ts` References Undefined `ngeohash` Variable

**File**: `/Users/marcusklein/dev/RecoveryConnect/functions/src/utils/meetingUtils.ts`
**Lines**: 44

**Description**:
```typescript
meeting.geohash = ngeohash.encode(
  apiMeeting.latitude,
  apiMeeting.longitude,
  GEOHASH_PRECISION
);
```

The variable `ngeohash` is never imported in this file. The file imports `geofire` and `generateMeetingHash` from `./meetings`, but not `ngeohash`. This would cause a runtime error when `formatMeetingForFirestore` is called.

**Severity**: Medium

**Proposed Fix**: Add the import:
```typescript
import ngeohash from "ngeohash";
```

Or use geofire:
```typescript
meeting.geohash = geofire.geohashForLocation([
  parseFloat(apiMeeting.latitude),
  parseFloat(apiMeeting.longitude)
]).substring(0, GEOHASH_PRECISION);
```

---

### M10. `onMeetingCreate` Queries Meetings from Top-Level Collection

**File**: `/Users/marcusklein/dev/RecoveryConnect/functions/src/triggers/firestore/onMeetingCreate.ts`
**Lines**: 12-14

**Description**: This trigger listens on `meetings/{meetingId}` (top-level collection), but `createGroupWithSubscription` creates meetings in a **subcollection** `groups/{groupId}/meetings/{meetingId}`. Meetings created via `createGroupWithSubscription` will NOT trigger `onMeetingCreate`, meaning no meeting instances are generated for them.

**Severity**: Medium

**Proposed Fix**: Either change `createGroupWithSubscription` to write to the top-level `meetings` collection, or add a parallel trigger for the subcollection path.

---

### M11. `email.ts` Fails Silently When SendGrid Key Is Missing

**File**: `/Users/marcusklein/dev/RecoveryConnect/functions/src/utils/email.ts`
**Lines**: 4

**Description**:
```typescript
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
```

If `SENDGRID_API_KEY` is undefined, `setApiKey` receives `undefined`. This will not throw immediately but will cause all email sends to fail with cryptic errors. There is no validation or warning at initialization.

**Severity**: Medium

**Proposed Fix**: Add validation:
```typescript
const apiKey = process.env.SENDGRID_API_KEY;
if (!apiKey) {
  console.warn("SENDGRID_API_KEY not configured. Email sending will fail.");
} else {
  sgMail.setApiKey(apiKey);
}
```

---

### M12. `findRelevantMeetings` Distance Check Uses Kilometers Instead of Meters

**File**: `/Users/marcusklein/dev/RecoveryConnect/functions/src/utils/meetingUtils.ts`
**Lines**: 101-137

**Description**: `MAX_DISTANCE_METERS` is set to 500, but `geofire.distanceBetween` returns distance in **kilometers**, not meters:

```typescript
const MAX_DISTANCE_METERS = 500;
// ...
const distance = geofire.distanceBetween(groupLocation, meetingLocation);
if (distance <= MAX_DISTANCE_METERS) { // 500km, not 500m!
  locationMatch = true;
}
```

This would match meetings up to 500 km away as "relevant", which is obviously too wide a radius.

**Severity**: Medium

**Proposed Fix**: Either rename to `MAX_DISTANCE_KM = 0.5` (500 meters = 0.5 km) and compare correctly, or convert the distance to meters:
```typescript
const MAX_DISTANCE_KM = 0.5;
if (distance <= MAX_DISTANCE_KM) {
  locationMatch = true;
}
```

---

### M13. `scheduledMeetingReminders` Displays Time in UTC Only

**File**: `/Users/marcusklein/dev/RecoveryConnect/functions/src/triggers/pubsub/scheduledMeetingReminders.ts`
**Lines**: 49-54

**Description**: The meeting reminder time is formatted in UTC:

```typescript
const timeStr = scheduledDate.toLocaleTimeString("en-US", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "UTC",
});
```

Users will receive reminders showing UTC time, which will be confusing for anyone not in the UTC timezone (i.e., most users). The meeting instance has a group timezone available via its group document.

**Severity**: Medium

**Proposed Fix**: Look up the group's timezone from Firestore and use it for formatting, or store the timezone on the meeting instance document.

---

### M14. `createGroupSubscription` Does Not Check for `trialing` Status

**File**: `/Users/marcusklein/dev/RecoveryConnect/functions/src/callable/createGroupSubscription.ts`
**Lines**: 67-75

**Description**: The duplicate subscription check only prevents creation when status is `"active"`:

```typescript
if (
  groupData.stripeSubscriptionId &&
  groupData.subscriptionStatus === "active"
) {
  throw new HttpsError("failed-precondition", "Group already has an active subscription.");
}
```

Groups with `trialing`, `past_due`, or `incomplete` subscriptions can have a second subscription created.

**Severity**: Medium

**Proposed Fix**: Expand the check:
```typescript
const activeStatuses = ["active", "trialing", "past_due", "incomplete"];
if (
  groupData.stripeSubscriptionId &&
  activeStatuses.includes(groupData.subscriptionStatus)
) {
  throw new HttpsError("failed-precondition", "Group already has an existing subscription.");
}
```

---

## Low Severity Issues

### L1. `onMemberWrite` Skips Claims Rebuild on Member Creation

**File**: `/Users/marcusklein/dev/RecoveryConnect/functions/src/triggers/firestore/onMemberWrite.ts`
**Lines**: 150-165

**Description**: The optimization to skip claims rebuild when "no role changes detected" checks `before.isAdmin !== after.isAdmin`, but on a **create** event, `change.before.exists` is false, so this block is skipped entirely and the claims are always rebuilt. This is correct behavior but worth noting that the optimization only applies to updates, not creates or deletes.

**Severity**: Low (correct behavior, just worth documenting)

---

### L2. `banUser` Double-Fetches Caller Document for Platform Bans

**File**: `/Users/marcusklein/dev/RecoveryConnect/functions/src/callable/banUser.ts`
**Lines**: 79-95

**Description**: For platform-wide bans, the caller's user document is fetched at line 79 to check permissions, then fetched again at line 92 to get the caller's name. These could be combined.

**Severity**: Low (minor performance)

---

### L3. `generateGroupInvite` Uses `Math.random()` for Code Generation

**File**: `/Users/marcusklein/dev/RecoveryConnect/functions/src/callable/generateGroupInvite.ts`
**Lines**: 23-31

**Description**: `Math.random()` is not cryptographically secure. For invite codes, this is acceptable since they are short-lived (7 days) and the collision check provides uniqueness. However, a determined attacker could predict codes.

**Severity**: Low

**Proposed Fix**: Use `crypto.randomBytes()` for stronger randomness if security is a concern.

---

### L4. `getQueriesForDocumentsAround` Uses `center.lon` Not `center.lng`

**File**: `/Users/marcusklein/dev/RecoveryConnect/functions/src/utils/meetings.ts`
**Lines**: 724-735

**Description**: The function uses `center.lon` but most of the codebase uses `center.lng` for longitude. If called with an object using `lng`, the geohash computation would use `undefined` for longitude.

**Severity**: Low (this function appears unused in the current codebase)

---

### L5. `onGroupMemberCountUpdate` Is a No-Op Trigger

**File**: `/Users/marcusklein/dev/RecoveryConnect/functions/src/triggers/firestore/onGroupMemberCountUpdate.ts`
**Lines**: 7-26

**Description**: This trigger fires on every group document update, checks if `memberCount` changed, and only logs. It consumes Cloud Functions invocations for zero business value.

**Severity**: Low

**Proposed Fix**: Remove from `index.ts` exports or delete the file entirely.

---

### L6. `getMeetingTime` Truncates Hours Incorrectly

**File**: `/Users/marcusklein/dev/RecoveryConnect/functions/src/utils/meetings.ts`
**Lines**: 59-67

**Description**:
```typescript
const hours = time / 100; // For time=830, hours=8.3 (not 8!)
```

For a time like `830`, `830/100 = 8.3`, which would produce `"08.3:30"` instead of `"08:30"`. Integer division is needed: `Math.floor(time / 100)`.

**Severity**: Low (NA meetings only)

**Proposed Fix**:
```typescript
const hours = Math.floor(time / 100);
```

---

### L7. Region Inconsistency Across Functions

**Files**: Multiple callable functions

**Description**: `joinGroupByInviteCode` uses `region: "us-west1"` while most other functions use `region: "us-central1"`. Cross-region calls between functions incur higher latency.

**Severity**: Low

**Proposed Fix**: Standardize all functions to the same region unless there is a specific reason.

---

### L8. `createGroupWithSubscription` Redundant `paymentMethodId` Check

**File**: `/Users/marcusklein/dev/RecoveryConnect/functions/src/callable/createGroupWithSubscription.ts`
**Lines**: 44-49, 91

**Description**: `paymentMethodId` is validated as required on line 44, but line 91 re-checks `if (paymentMethodId)` inside the existing customer branch. Since we already threw if it was falsy, this inner check is always true.

**Severity**: Low (code clarity)

---

### L9. `scheduledAdminRemovalExpiry` Does Not Batch-Limit

**File**: `/Users/marcusklein/dev/RecoveryConnect/functions/src/triggers/pubsub/scheduledAdminRemovalExpiry.ts`
**Lines**: 23-29

**Description**: If more than 500 admin removal requests expire simultaneously, the single batch commit will fail (Firestore batch limit is 500). In practice this is extremely unlikely.

**Severity**: Low

---

### L10. `exportUserData` Performance Issue with Sequential Queries

**File**: `/Users/marcusklein/dev/RecoveryConnect/functions/src/callable/exportUserData.ts`
**Lines**: 108-170

**Description**: The function performs sequential queries for each group the user belongs to (counting DMs, chat messages, transactions). For users in many groups, this could hit the 540-second Cloud Function timeout.

**Severity**: Low

**Proposed Fix**: Use `Promise.all()` to parallelize the per-group queries.

---

### L11. `handleSubscriptionDeleted` Field Naming: `subscriptionCancelledAt`

**File**: `/Users/marcusklein/dev/RecoveryConnect/functions/src/utils/stripeUtils.ts`
**Lines**: 235-241

**Description**: The field name `subscriptionCancelledAt` uses British spelling (two L's), while the project convention states Stripe-related statuses use American spelling (`canceled`, one L). The field name should be `subscriptionCanceledAt` for consistency with `subscriptionStatus: "canceled"`.

**Severity**: Low (naming consistency)

---

### L12. `createWebAuthToken` Claims `expiresIn: 3600` but Custom Tokens Actually Expire in 3600s

**File**: `/Users/marcusklein/dev/RecoveryConnect/functions/src/callable/createWebAuthToken.ts`
**Lines**: 25-38

**Description**: The custom claims `createdAt` and `tokenType` added to the token are NOT enforced as expiry mechanisms. Firebase custom tokens expire in 1 hour by default, and the `createdAt` claim is informational only. The comment says "expires in 1 hour" which is correct for the token itself, but the `createdAt` claim in the token payload does not enforce this.

**Severity**: Low (misleading comments)

---

## Summary Table

| Severity | Count | Key Areas |
|----------|-------|-----------|
| Critical | 4 | Collection path mismatch, batch reuse bug, dropped meetings data |
| High | 9 | Missing auth checks, no ban verification, subscription duplicates, race conditions |
| Medium | 14 | Wrong collection paths, dead code, distance unit errors, missing member creation |
| Low | 12 | Naming, performance, redundant code, minor logic issues |
| **Total** | **39** | |

---

## Recommended Priority Order

1. **C3** - Fix `onAnnouncementCreate` members collection path (announcements never notified)
2. **C4** - Fix `getAll12StepMeetings` to include Custom meetings
3. **C2** - Fix `deleteUserAccount` batch reuse bug
4. **C1** - Resolve announcement collection duplication
5. **H6, H7, H8** - Add auth checks to `findMeetings`, `sendMentionNotifications`, `searchGroupsByLocation`
6. **H5** - Add ban check to `joinGroupByInviteCode`
7. **M7** - Add member document creation in `createGroupWithSubscription`
8. **M9** - Fix `ngeohash` import in `meetingUtils.ts`
9. **M1** - Fix `day` variable assignment in `formatMeetingForFirestore`
10. **M12** - Fix distance units in `findRelevantMeetings`
