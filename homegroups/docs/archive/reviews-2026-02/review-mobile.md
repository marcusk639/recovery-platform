# Mobile App Code Review

**Date:** 2026-02-22
**Scope:** `/mobile/src/` -- screens, store/slices, navigation, services, types, components, models
**Reviewer:** Automated (Claude Opus 4.6)

---

## Summary

Reviewed the entire mobile source tree (66+ screen files, 20 Redux slices, 14 model files, navigation layer, type definitions, and services). Found **6 Critical**, **10 High**, **8 Medium**, and **7 Low** severity issues across types, state management, screens, and navigation.

| Severity | Count |
|----------|-------|
| Critical | 6 |
| High     | 10 |
| Medium   | 8 |
| Low      | 7 |

---

## Critical Issues

### C-1. `updateAnnouncement` returns stale (pre-update) data

**File:** `/mobile/src/store/slices/announcementsSlice.ts`, lines 138-176
**Description:** The `updateAnnouncement` thunk calls `AnnouncementModel.update()` to persist changes but then returns `currentAnnouncement` (the object fetched from the store *before* the update). The fulfilled reducer therefore writes the **old** data back into the entity adapter, silently reverting the user's edit in the Redux store until the next full fetch.
**Severity:** Critical
**Impact:** Any announcement edit (title, content, pin toggle) appears to succeed but the UI immediately reverts to pre-edit content. Users will see stale data until they force-refresh.
**Proposed Fix:**
```typescript
// Instead of returning currentAnnouncement, return merged data:
return {
  ...currentAnnouncement,
  ...updateData,
  updatedAt: new Date(),
};
```

---

### C-2. `MeetingScreen.onRefresh` does not await async fetch

**File:** `/mobile/src/screens/meetings/MeetingScreen.tsx`, lines 271-280
**Description:** The `onRefresh` callback sets `setRefreshing(true)`, fires `fetchMeetingsWithLocation()` (an async Redux thunk dispatch), then immediately calls `setRefreshing(false)`. Because the fetch is not awaited, the pull-to-refresh spinner disappears instantly and the user has no indication data is loading.
**Severity:** Critical
**Impact:** Broken pull-to-refresh UX on the primary meeting discovery screen -- the most-used screen for the "seeker" persona.
**Proposed Fix:**
```typescript
const onRefresh = async () => {
  setRefreshing(true);
  const locationToUse = usingCustomLocation ? customLocation : currentUserLocation;
  if (locationToUse) {
    await fetchMeetingsWithLocation(locationToUse);
  }
  setRefreshing(false);
};
```

---

### C-3. `AddTransactionScreen` ignores user-selected date

**File:** `/mobile/src/screens/homegroup/AddTransactionScreen.tsx`
**Description:** The screen renders a `DateTimePickerModal` and stores the selected date in `transactionDate` state, but this value is never passed to the `addTransaction` thunk. The dispatched transaction always uses the server timestamp from Firestore, meaning the date picker is purely cosmetic.
**Severity:** Critical
**Impact:** Treasurers cannot back-date or forward-date transactions. Every transaction is recorded at current time, breaking bookkeeping accuracy.
**Proposed Fix:** Add `transactionDate` (serialized as ISO string or timestamp) to the `addTransaction` thunk payload and persist it as `createdAt` in the Firestore document.

---

### C-4. `membersSlice.removeMemberFromGroup` uses wrong entity ID

**File:** `/mobile/src/store/slices/membersSlice.ts`, lines 388-420
**Description:** The fulfilled reducer receives `{ groupId, userId }` and calls `membersAdapter.removeOne(state.members, userId)`. However, the `GroupMember` entity uses a composite document ID format `{groupId}_{userId}` (visible in `GroupMember.id` definition and `MemberModel` usage). Since `userId` alone does not match any entity ID, the `removeOne` call silently does nothing.
**Severity:** Critical
**Impact:** After a member is removed server-side, their entry persists in the Redux store. The removed member continues to appear in the members list until the user force-refreshes.
**Proposed Fix:**
```typescript
// In the fulfilled reducer:
const memberId = `${groupId}_${userId}`;
membersAdapter.removeOne(state.members, memberId);
// Also filter groupMembers using memberId, not userId:
state.groupMembers[groupId] = state.groupMembers[groupId].filter(
  id => id !== memberId,
);
```

---

### C-5. Duplicate type declarations in `schema.ts` cause compilation ambiguity

**File:** `/mobile/src/types/schema.ts`
**Description:** Multiple types and interfaces are declared twice in the same file:
- `RecurrenceFrequency` (lines 30 and 71)
- `RecurringTransactionDocument` (lines 32-46 and 73-87)
- `AdminRemovalStatus` (lines 715-720 and 753-758)
- `AdminRemovalRequestDocument` (lines 722-740 and 760-780)
- `AdminRemovalVoteDocument` (lines 742-747 and 786-791)

TypeScript will use the last declaration (interface merging for interfaces, redeclaration error for type aliases unless `isolatedDeclarations` is off). This can produce unexpected merged types or compile errors depending on `tsconfig` strictness.
**Severity:** Critical
**Impact:** Potential compilation failures or silent type widening. The second `AdminRemovalRequestDocument` has additional comments but identical structure -- if fields diverge in the future, only one will be used silently.
**Proposed Fix:** Remove the duplicate declarations. Keep the more thoroughly commented versions (the later ones).

---

### C-6. Duplicate fields in `MeetingInstance` and `MeetingInstanceDocument`

**File:** `/mobile/src/types/index.ts`, lines 645-668; `/mobile/src/types/schema.ts`, lines 616-639
**Description:** Both `MeetingInstance` (in `index.ts`) and `MeetingInstanceDocument` (in `schema.ts`) declare `attendees` and `attendeeCount` twice each within the same interface. The first declaration is on lines 645-646 / 616-617 and the second is at lines 667-668 / 637-639 under a "V2.2: Attendance check-in" comment.
**Severity:** Critical
**Impact:** TypeScript interface merging means the duplicate properties are technically fine if types match, but it indicates copy-paste drift that will cause bugs when one is updated and the other is not.
**Proposed Fix:** Remove the duplicate field declarations. Keep one set with the proper comment.

---

## High Issues

### H-1. `signOut` does not clear user entity adapter state

**File:** `/mobile/src/store/slices/authSlice.ts`
**Description:** The `signOut.fulfilled` reducer clears `state.user` and `state.isAuthenticated` but does not call `usersAdapter.removeAll(state.users)`. Stale user data persists in the entity adapter after logout.
**Severity:** High
**Impact:** If a different user logs in on the same device, they may briefly see data from the previous user's session in selectors that read from `state.auth.users`.
**Proposed Fix:** Add `usersAdapter.removeAll(state.users)` to the `signOut.fulfilled` reducer.

---

### H-2. `chatSlice` sort comparer has dead branches

**File:** `/mobile/src/store/slices/chatSlice.ts`, lines 24-31
**Description:**
```typescript
const dateA = typeof a.sentAt === 'string' ? new Date(a.sentAt) : new Date(a.sentAt);
const dateB = typeof b.sentAt === 'string' ? new Date(b.sentAt) : new Date(b.sentAt);
```
Both branches of each ternary are identical (`new Date(a.sentAt)`). The type check provides no benefit.
**Severity:** High
**Impact:** If `sentAt` is ever a Firestore `Timestamp` object (which has a `toDate()` method, not a `Date` constructor), this will produce `Invalid Date` and break message ordering.
**Proposed Fix:** Handle all actual runtime types:
```typescript
const toMs = (v: any): number => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return new Date(v).getTime();
  if (v?.toDate) return v.toDate().getTime();
  return new Date(v).getTime();
};
const sortComparer = (a, b) => toMs(a.sentAt) - toMs(b.sentAt);
```

---

### H-3. `directMessagesSlice` conversation sort comparer assumes `Date` object

**File:** `/mobile/src/store/slices/directMessagesSlice.ts`, lines 57-61
**Description:** `conversationsAdapter` sorts by `b.updatedAt.getTime() - a.updatedAt.getTime()`. The `updatedAt` field is typed as `Date`, but Redux stores are serialized -- `Date` objects become strings after a store persist/rehydrate cycle. Additionally, `serializableCheck` is disabled, so Firestore `Timestamp` objects could also end up here.
**Severity:** High
**Impact:** Calling `.getTime()` on a string or Timestamp will throw at runtime, crashing the conversations list.
**Proposed Fix:** Use a defensive conversion similar to H-2.

---

### H-4. `createAnnouncement` thunk has duplicate `scheduledFor` parameter

**File:** `/mobile/src/store/slices/announcementsSlice.ts`, lines 95-135
**Description:** The thunk parameter type object declares `scheduledFor?: Date` twice (lines 103 and 106), and the data object passed to `AnnouncementModel.createAnnouncement` also includes `scheduledFor` twice (lines 118 and 121).
**Severity:** High
**Impact:** The second `scheduledFor` silently overrides the first during object construction. While currently both come from `data.scheduledFor` (so the values are identical), this is fragile -- any future change to one will be silently overridden by the other.
**Proposed Fix:** Remove the duplicate `scheduledFor` entries in both the type definition and the data object.

---

### H-5. Duplicate route definitions in `GroupStackParamList`

**File:** `/mobile/src/types/navigation/index.ts`, lines 90-91 and 124-125
**Description:** `ManageRecurring` and `YearEndSummary` routes are each defined twice in `GroupStackParamList` -- once at lines 90-91 under "Treasury screens" and again at lines 124-125 under "V2: Recurring transactions".
**Severity:** High
**Impact:** TypeScript will use the last declaration. If parameter types ever diverge between the two, one will silently win. This also causes confusion for developers navigating the codebase.
**Proposed Fix:** Remove the duplicate route definitions at lines 124-125.

---

### H-6. `searchGroups` location-only query fetches all groups with `.limit(100)`

**File:** `/mobile/src/store/slices/groupsSlice.ts`
**Description:** The `searchGroups` thunk, when given only a location (no text query), does `firestore().collection('groups').limit(100).get()`. With ~100k groups in the database, this returns an arbitrary 100 groups with no geographic filtering, then tries to distance-filter client-side.
**Severity:** High
**Impact:** Location-based group search returns essentially random results. It does not use the `searchGroupsByLocation` Cloud Function that exists in `GroupModel`.
**Proposed Fix:** Use the `searchGroupsByLocation` Cloud Function (which uses geohash-based queries) for location-only searches instead of a naive collection scan.

---

### H-7. Filename typo: `ForgotPosswordScreen.tsx`

**File:** `/mobile/src/screens/auth/ForgotPosswordScreen.tsx`
**Description:** The filename contains a typo -- "Possword" instead of "Password".
**Severity:** High
**Impact:** Confusing for developers, and any import paths or navigation registrations referencing this file will have the typo baked in. If the file is ever renamed, all references break.
**Proposed Fix:** Rename file to `ForgotPasswordScreen.tsx` and update all import references.

---

### H-8. `GroupOverviewScreen` calls `.getTime()` on potentially serialized `scheduledAt`

**File:** `/mobile/src/screens/homegroup/GroupOverviewScreen.tsx`, line 118
**Description:**
```typescript
.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
```
`MeetingInstance.scheduledAt` is typed as `Date` but after passing through Redux (with `serializableCheck: false`), it may be a string or Firestore Timestamp.
**Severity:** High
**Impact:** Will throw `TypeError: a.scheduledAt.getTime is not a function` if `scheduledAt` is serialized, crashing the GroupOverview screen.
**Proposed Fix:** Convert defensively: `new Date(a.scheduledAt).getTime()`.

---

### H-9. `sponsorshipSlice` `sponsorshipRequestsAdapter` sort comparer calls `.toDate()` on entity data

**File:** `/mobile/src/store/slices/sponsorshipSlice.ts`, lines 63-67
**Description:**
```typescript
sortComparer: (a, b) =>
  b.createdAt.toDate().getTime() - a.createdAt.toDate().getTime(),
```
The `createdAt` field on `SponsorshipRequestEntity` is typed as `Timestamp`. However, after data passes through Redux actions and reducers, the Firestore Timestamp may have been serialized to a plain object without the `toDate()` method.
**Severity:** High
**Impact:** Runtime crash when sorting sponsorship requests if the Timestamp has been serialized.
**Proposed Fix:** Either convert Timestamps to ISO strings before storing in Redux (consistent with other slices), or use a defensive conversion in the sort comparer.

---

### H-10. Duplicate and conflicting `User` type in `types/user.ts`

**File:** `/mobile/src/types/user.ts`
**Description:** This file exports a `User` interface and a `UserData` interface that conflict with the canonical `User` in `types/index.ts`. Key differences:
- `types/user.ts` `User.id` (string) vs `types/index.ts` `User.uid` (string)
- `types/user.ts` `User.createdAt` (string) vs `types/index.ts` `User.createdAt` (Date)
- `types/user.ts` `User.photoURL` vs `types/index.ts` `User.photoUrl`
- Different `notificationSettings` shapes (user.ts includes `sponsorship`, index.ts includes `groupChatMentions`, `allowPushNotifications`, `dailyReflections`)

The `authSlice.ts` defines yet another local `UserData` interface (line 37) with even more fields.
**Severity:** High
**Impact:** Depending on which `User` type is imported, code may silently have wrong field names or types. This is a maintenance hazard and source of bugs.
**Proposed Fix:** Consolidate into a single canonical `User` type. Delete `types/user.ts` if it is not used, or merge its additions into `types/index.ts`.

---

## Medium Issues

### M-1. `MeetingScreen` time-of-day filter is non-functional

**File:** `/mobile/src/screens/meetings/MeetingScreen.tsx`
**Description:** The screen maintains `selectedTimeFilter` state (morning/afternoon/evening/all) and renders a time filter UI, but the selected value is never passed to the `filterMeetings` dispatch call. Selecting a time filter updates the UI toggle but has no effect on the displayed results.
**Severity:** Medium
**Impact:** Users who filter by time of day see no change in results. The feature appears broken.
**Proposed Fix:** Include `selectedTimeFilter` in the `filterMeetings` dispatch payload and implement the filter logic in the reducer/thunk.

---

### M-2. `CreateGroupScreen` race condition with `setTimeout` for address updates

**File:** `/mobile/src/screens/homegroup/CreateGroupScreen.tsx`, ~line 1055-1067
**Description:** A `setTimeout` callback reads meeting state from a closure that may be stale by the time it executes. If the user rapidly edits the address, the timeout may apply an outdated address to the meeting.
**Severity:** Medium
**Impact:** Intermittent wrong address on group meetings during creation.
**Proposed Fix:** Use a `useRef` to always access the latest state, or debounce using `useCallback` with proper dependencies.

---

### M-3. `businessMeetingsSlice` sort comparer uses `Date` object methods in entity adapter

**File:** `/mobile/src/store/slices/businessMeetingsSlice.ts`, line 20
**Description:** `sortComparer: (a, b) => b.date.getTime() - a.date.getTime()` -- the `date` field is typed as `Date` but may be serialized in the Redux store.
**Severity:** Medium
**Impact:** Potential runtime crash when sorting business meetings.
**Proposed Fix:** Serialize `date` to ISO string before storing, or use defensive conversion in the comparer.

---

### M-4. `dashboardSlice` stores `new Date()` directly in Redux state

**File:** `/mobile/src/store/slices/dashboardSlice.ts`, line 70
**Description:** `state.lastFetched = new Date();` stores a non-serializable `Date` object in Redux state. While `serializableCheck` is disabled, this can cause issues with state persistence and time travel debugging.
**Severity:** Medium
**Impact:** Minor -- mostly a best-practices violation since the Date is only used locally. But it contributes to the pattern of non-serializable state.
**Proposed Fix:** Use `Date.now()` (number) instead of `new Date()`.

---

### M-5. `reportsSlice.reviewReport` stores `new Date()` in entity adapter

**File:** `/mobile/src/store/slices/reportsSlice.ts`, line 392
**Description:** The `reviewReport.fulfilled` reducer sets `reviewedAt: new Date()` which stores a non-serializable Date object in the entity adapter.
**Severity:** Medium
**Impact:** Same as M-4 -- non-serializable state.
**Proposed Fix:** Use ISO string: `reviewedAt: new Date().toISOString()`.

---

### M-6. `reportsSlice.revokeBan` stores `new Date()` in entity adapter

**File:** `/mobile/src/store/slices/reportsSlice.ts`, line 465
**Description:** The `revokeBan.fulfilled` reducer sets `revokedAt: new Date()` in the ban entity update.
**Severity:** Medium
**Impact:** Non-serializable Date in Redux state.
**Proposed Fix:** Use ISO string.

---

### M-7. `engagementSlice` selectors cast state as `any`

**File:** `/mobile/src/store/slices/engagementSlice.ts`, line 394
**Description:** `const selectEngagement = (state: RootState) => (state as any).engagement as EngagementState;` -- the `RootState` type should already include the `engagement` slice, making the `as any` cast unnecessary and type-unsafe.
**Severity:** Medium
**Impact:** Loss of type safety. If the slice key is renamed or removed from `RootState`, no compile error will be raised.
**Proposed Fix:** Remove the `as any` cast: `const selectEngagement = (state: RootState) => state.engagement;`.

---

### M-8. Duplicate `GratitudeEntry` type across slices

**File:** `/mobile/src/store/slices/engagementSlice.ts` (lines 15-19) and `/mobile/src/store/slices/gratitudeSlice.ts` (lines 7-13)
**Description:** Both slices define their own `GratitudeEntry` interface with different shapes:
- `engagementSlice`: `{ date: string; entries: string[]; createdAt: number }`
- `gratitudeSlice`: `{ id: string; date: string; entries: string[]; createdAt: string; updatedAt: string }`

Both slices also define `saveGratitudeEntry` thunks with different action type strings (`'engagement/saveGratitudeEntry'` vs `'gratitude/save'`).
**Severity:** Medium
**Impact:** Two parallel gratitude journal implementations exist. It is unclear which one the UI uses. Changes to one will not affect the other. Firestore writes could conflict.
**Proposed Fix:** Choose one implementation and remove the other. If both are intentionally used for different purposes, extract the shared `GratitudeEntry` type to a shared location.

---

## Low Issues

### L-1. `serializableCheck: false` in store configuration

**File:** `/mobile/src/store/index.ts`, line 50
**Description:** The entire serializable check middleware is disabled. This masks issues with storing `Date` objects, Firestore `Timestamp` objects, and other non-serializable values in the Redux store.
**Severity:** Low
**Impact:** Multiple slices store non-serializable data (Dates, Timestamps) which can break state persistence, time-travel debugging, and Redux DevTools. Many of the High/Medium issues above are caused by or masked by this setting.
**Proposed Fix:** Re-enable with targeted path ignores for intentionally non-serializable fields, and convert Dates/Timestamps to ISO strings or Unix milliseconds before storing in Redux.

---

### L-2. `auth.ts` `registerWithEmail` relies on `auth().currentUser` propagation timing

**File:** `/mobile/src/services/firebase/auth.ts`
**Description:** After `createUserWithEmailAndPassword`, the code calls `UserModel.create()` without explicitly passing the `uid`. `UserModel.create()` reads `firebase.auth().currentUser` -- but there is a brief window where auth state may not have propagated after creation.
**Severity:** Low
**Impact:** Rare race condition where user profile creation fails immediately after account creation. The retry logic in the auth service likely masks this.
**Proposed Fix:** Explicitly pass the `uid` from the `createUserWithEmailAndPassword` result to `UserModel.create()`.

---

### L-3. Hardcoded Google OAuth client ID

**File:** `/mobile/src/services/firebase/auth.ts`
**Description:** The Google Sign-In web client ID is hardcoded in the source file.
**Severity:** Low
**Impact:** Makes it harder to manage different environments (dev/staging/prod). The client ID is not a secret (it is embedded in the app binary), but it is a maintenance concern.
**Proposed Fix:** Move to environment configuration (e.g., `.env` or `google-services.json` auto-configuration).

---

### L-4. `GroupModel.deleteGroup` does not delete member subcollections

**File:** `/mobile/src/models/GroupModel.ts`, lines 497-541
**Description:** When deleting a group, the code removes the group document and updates users' `homeGroups`, but does not delete the member documents from the top-level `members` collection, nor does it delete meetings, announcements, chat messages, or other associated data.
**Severity:** Low
**Impact:** Orphaned data remains in Firestore after group deletion. This wastes storage and could cause confusion if group IDs are ever reused.
**Proposed Fix:** Delete all associated subcollection documents (members, meetings, announcements, chat, etc.) in a batched delete, or use a Cloud Function trigger on group deletion.

---

### L-5. `GroupModel.deleteGroup` batch write may exceed 500-operation limit

**File:** `/mobile/src/models/GroupModel.ts`, lines 522-533
**Description:** The batch write that removes the group from all members' `homeGroups` arrays does one update per member. Firestore batches are limited to 500 operations. A group with more than 500 members would cause this to fail.
**Severity:** Low
**Impact:** Group deletion would fail for large groups.
**Proposed Fix:** Split into multiple batches of 500 operations, or move to a Cloud Function that handles this server-side.

---

### L-6. `updateGroupMember` looks up member by `userId` in entity adapter

**File:** `/mobile/src/store/slices/membersSlice.ts`, line 202
**Description:** `const currentMember = state.members.members.entities[userId];` -- similar to C-4, the member entity uses a composite ID `{groupId}_{userId}`, not just `userId`.
**Severity:** Low
**Impact:** The member lookup will fail, causing the "Member not found" rejection. Less impactful than C-4 because this returns an error message to the caller rather than silently failing.
**Proposed Fix:** Use `const memberId = \`${groupId}_${userId}\`; const currentMember = state.members.members.entities[memberId];`.

---

### L-7. `GroupModel.toFirestore` mutates input by deleting `meetings`

**File:** `/mobile/src/models/GroupModel.ts`, lines 116-118
**Description:**
```typescript
if (group.meetings !== undefined) {
  delete group.meetings;
}
```
This mutates the input `Partial<HomeGroup>` object, which can cause unexpected side effects for callers who still need the `meetings` property.
**Severity:** Low
**Impact:** Callers passing a HomeGroup object to `toFirestore` will have their `meetings` field deleted as a side effect.
**Proposed Fix:** Create a shallow copy before deleting: `const result = {...group}; delete result.meetings;`.

---

## Architectural Observations

### A-1. Non-serializable state pervasive across all slices

Multiple slices store `Date` objects, Firestore `Timestamp` objects, and other non-serializable values directly in the Redux store. The root cause is `serializableCheck: false` in the store configuration. This should be addressed systematically by:
1. Converting all Date fields to ISO strings or Unix timestamps before dispatching to reducers
2. Re-enabling `serializableCheck` with targeted ignores

### A-2. Entity ID inconsistency in member management

The `GroupMember.id` uses a composite `{groupId}_{userId}` format, but several places in the codebase use bare `userId` for entity lookups (C-4, L-6). This pattern should be documented and enforced consistently.

### A-3. Three competing `User` type definitions

There are three distinct `User`/`UserData` definitions:
- `types/index.ts` -- the canonical one used by most of the app
- `types/user.ts` -- a competing definition with different field names/types
- `authSlice.ts` (local `UserData` interface) -- yet another shape used for the auth slice

These should be consolidated.

### A-4. Two parallel gratitude journal implementations

Both `engagementSlice` and `gratitudeSlice` implement gratitude journal functionality with different data shapes, different Firestore paths, and different thunk names. This duplication should be resolved.

---

## Files Reviewed

- **Type definitions:** `types/index.ts`, `types/schema.ts`, `types/user.ts`, `types/navigation/index.ts`, `types/domain/treasury.ts`, `types/sponsorship.ts`
- **Store slices (20):** `authSlice`, `groupsSlice`, `meetingsSlice`, `chatSlice`, `directMessagesSlice`, `announcementsSlice`, `membersSlice`, `transactionsSlice`, `treasurySlice`, `servicePositionsSlice`, `sponsorshipSlice`, `reportsSlice`, `treasurerHandoffSlice`, `businessMeetingsSlice`, `dashboardSlice`, `adminRemovalSlice`, `recurringTransactionsSlice`, `engagementSlice`, `referralSlice`, `gratitudeSlice`
- **Store root:** `store/index.ts`, `store/types.ts`
- **Navigation:** `AppNavigator.tsx`, `MainTabNavigator.tsx`, `types/navigation/index.ts`
- **Screens:** `MeetingScreen`, `CreateGroupScreen`, `AddTransactionScreen`, `ForgotPasswordScreen`, `GroupOverviewScreen`, `GroupChatScreen`, `GroupTreasuryScreen`, `SubscriptionUpgradeScreen`, `AdminRemovalRequestsScreen`, `OnboardingScreen`, `LoginScreen`, `LandingScreen`, `RegisterScreen`
- **Models:** `UserModel.ts`, `GroupModel.ts`, `MemberModel.ts`
- **Services:** `auth.ts`, `NotificationHandler.ts`
- **Components:** `EnterInviteCodeModal`, `SubscriptionWebView`
