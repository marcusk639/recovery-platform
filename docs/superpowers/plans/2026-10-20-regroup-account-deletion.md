# Regroup In-App Account Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Any signed-in user (resident, staff admin, or operator) can delete their account from the app's Personal screen. That removes their login and personal data and leaves the records the law or the house's finances require, stripped of contact and health details. This satisfies App Store guideline 5.1.1(v).

**Architecture:**

- A `deleteAccount` callable requires a recent sign-in (`auth_time` within 5 minutes), then runs an idempotent, step-recorded deletion: Stripe → role records → personal data → Storage → `users/{uid}` → Auth user.
- Progress is kept in `accountDeletions/{uid}` (server-only), so a failed run can be retried and resumes where it stopped.
- Auth is deleted last, so the user can still authenticate to retry.
- The mobile app re-authenticates with the password, calls the callable, and signs out.

**Tech Stack:** Firebase Functions v2, firebase-admin (Auth, Firestore, Storage), Stripe Node SDK via `util/stripe.createStripeClient`, React Native Firebase Auth (`EmailAuthProvider`, `reauthenticateWithCredential`), Jest.

**Spec:** `docs/launch-readiness/plan-regroup-recovery-api-2026-10-19.md`, item B3, with evidence REV-A2. Apple App Store Review Guideline 5.1.1(v).

## Decisions to confirm before Task 3

These are policy calls the repo can't answer. Each has a proposed default that the tasks implement. Change the default here before execution if it's wrong.

| #   | Question                                                                                                                                          | Proposed default                                                                                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | What happens to a resident's house records (guest doc, activities, drug tests, documents, EES, payments) when the resident deletes their account? | The house keeps its operational and financial records. The guest doc is discharged through the existing archive path (`guest-archive/{guestId}`, as `deleteGuest` does), with contact and health fields removed. `activities`, `drug-tests`, `documents`, `ees-records`, `week-summaries` and `payments` stay as house records.                      |
| D2  | What happens when an operator who owns houses deletes their account?                                                                              | The Stripe subscription is cancelled **immediately**, not at period end, and the Stripe customer is deleted. Each owned house gets `subscriptionStatus: "canceled"` and `closedAt`, so it follows the existing lapsed-house behaviour. The Connect account is unlinked but not deleted (v1 disconnect semantics). Residents keep their own accounts. |
| D3  | Which guest fields count as contact or health data to strip from the archive?                                                                     | `email`, `phoneNumber`, `avatar`, `displayName`, `sobrietyDate`, `drugOfChoice`, `step`, `dailyHabit`, `supporters`, `primarySupporterId`, `primarySupporterName`, `jobs`, `emergencyContactName`, `emergencyContactPhone`, `emergencyContactRelation`, `insuranceProvider`, `insurancePolicyNumber`, `referringCenterName`, `referringCenterContact`, `legalStatus`, `probationOfficer`, `probationOfficerPhone`, `intakeNotes`, `dischargeNotes`. Kept: `id`, `houseId`, `firstName`, `lastName`, `rentOwed`, `choreFees`, `moveInDate`, `moveOutDate`, `intakeDate` (field list from `regroup/mobile/src/entities/Guest.tsx`).                                                                                                                       |

## Global Constraints

- Work in a worktree off `origin/main`. Commit scopes: `regroup-functions`, `regroup-mobile`.
- Files stay at or under 300 lines. `Personal.tsx` (464 lines) must not grow; put the new UI in its own screen.
- Never log PII. Logs carry the uid, ids and step names only.
- Every step is idempotent. Running the deletion twice for the same uid must succeed and must not throw on already-deleted data.
- Stripe calls use the stored ids only. Stripe resources already missing (`isResourceMissing`, `util/stripe`) count as done.
- Tests: `cd regroup/functions && npx jest <path>`; `cd regroup/mobile && npx jest <path>`.

## Review Focus

1. **Retry after a mid-run failure.** If Stripe succeeds and the Storage delete throws, a second call skips the completed steps and finishes. (Task 6: `"resumes from the recorded step after a failure"`.)
2. **Stale sign-in.** A token whose `auth_time` is older than 5 minutes is refused with `failed-precondition` "Please sign in again to delete your account", and nothing is deleted. (Task 6: `"refuses a stale sign-in"`.)
3. **A user with several roles** (a resident in one house and staff admin in another, or an operator who is also a resident) has every role's records handled in one run. (Task 6: `"handles a user who is both resident and staff"`.)
4. **An operator with no subscription id**, or one whose subscription is already cancelled in Stripe, still deletes cleanly. (Task 2: `"treats a missing Stripe subscription as already cancelled"`.)
5. **Shared conversations.** Only the deleting user's own direct messages are removed; the other party's messages stay. (Task 5: `"deletes only messages the user sent"`.)

---

### Task 1: Stripe helpers for immediate cancellation and customer deletion

**Files:**

- Modify: `regroup/functions/src/api/stripe.ts` (next to `cancelSubscription`, line 102)
- Test: `regroup/functions/src/__tests__/api/stripe.deletion.test.ts`

**Interfaces:**

- Produces: `cancelSubscriptionNow(subscriptionId: string): Promise<void>`, which calls `stripe.subscriptions.cancel(id)`.
- Produces: `deleteCustomer(customerId: string): Promise<void>`, which calls `stripe.customers.del(id)`.
- Both resolve, rather than reject, when the resource is missing (`isResourceMissing(err)`).

- [ ] **Step 1: Write the failing tests:**
  - `"cancels a subscription immediately"`: `subscriptions.cancel` is called with the id.
  - `"treats a missing subscription as already cancelled"`: a `resource_missing` error resolves.
  - `"deletes a customer"`
  - `"treats a missing customer as already deleted"`
  - `"rethrows other Stripe errors"`
- [ ] **Step 2: Run the tests and confirm they fail.**
- [ ] **Step 3: Implement both helpers.**
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** with `feat(regroup-functions): add immediate-cancel and customer-delete Stripe helpers`.

### Task 2: Operator records (D2)

**Files:**

- Create: `regroup/functions/src/accountDeletion/operatorRecords.ts`
- Test: `regroup/functions/src/__tests__/accountDeletion/operatorRecords.test.ts`

**Interfaces:**

- Consumes: Task 1 helpers.
- Produces: `closeOperatorAccount(user: { id: string; subscriptionMetadata?: { subscriptionId?: string; customerId?: string } }, now: string): Promise<{ housesClosed: string[] }>`. It:
  1. calls `cancelSubscriptionNow` if a subscription id is present;
  2. calls `deleteCustomer` if a customer id is present;
  3. queries `houses where ownerId == user.id` and updates each with `{ subscriptionStatus: "canceled", closedAt: now, stripeAccountId: FieldValue.delete(), stripeStatus: "disconnected" }`.

- [ ] **Step 1: Write the failing tests:**
  - `"cancels the subscription now and deletes the customer"`
  - `"closes every owned house and unlinks Connect"`
  - `"treats a missing Stripe subscription as already cancelled"`
  - `"is a no-op for a user who owns nothing and has no subscription"`
- [ ] **Steps 2–4:** Run the tests (they fail), implement, run them again (they pass).
- [ ] **Step 5: Commit** with `feat(regroup-functions): close an operator's houses on account deletion`.

### Task 3: Resident and staff records (D1, D3)

**Files:**

- Create: `regroup/functions/src/accountDeletion/memberRecords.ts`
- Test: `regroup/functions/src/__tests__/accountDeletion/memberRecords.test.ts`

**Interfaces:**

- Produces: `GUEST_PII_FIELDS: readonly string[]`, the D3 list.
- Produces: `scrubGuestForArchive(guest: Record<string, unknown>, now: string): Record<string, unknown>` (pure). It removes `GUEST_PII_FIELDS` and sets `accountDeletedAt: now`, `userId: null`.
- Produces: `dischargeResident(guestId: string, now: string): Promise<void>`. In one transaction it:
  - writes `guest-archive/{guestId}` with the scrubbed guest;
  - deletes `guests/{guestId}`;
  - clears the guest's bed in `houses/{houseId}.rooms` and decrements `currentCapacity`, floored at 0.

  This is the server-side mirror of mobile `services/guest.tsx:242 deleteGuest`. It is a no-op if the guest doc is already gone.

- Produces: `removeStaffAdmin(adminId: string): Promise<void>`. It removes `adminId` from `adminIds` and `superAdminIds` on every house in the admin doc's `houseIds` (`FieldValue.arrayRemove`), then deletes `admins/{adminId}`. It is a no-op if the doc is already gone.

- [ ] **Step 1: Write the failing tests:**
  - `"strips contact and health fields from the archived guest"`: every `GUEST_PII_FIELDS` key is absent, and every D3 "Kept" field is present.
  - `"discharges the resident and frees the bed"`
  - `"never drives currentCapacity below zero"`
  - `"discharging an already-deleted guest is a no-op"`
  - `"removes a staff admin from every house and deletes the admin doc"`
- [ ] **Steps 2–4:** Run the tests (they fail), implement, run them again (they pass).
- [ ] **Step 5: Commit** with `feat(regroup-functions): discharge residents and remove staff on account deletion`.

### Task 4: Personal data and Storage

**Files:**

- Create: `regroup/functions/src/accountDeletion/personalData.ts`
- Test: `regroup/functions/src/__tests__/accountDeletion/personalData.test.ts`

**Interfaces:**

- Produces: `deletePersonalData(uid: string, guestIds: string[], houseIdsByGuest: Record<string, string>): Promise<void>`, which deletes, in batches of at most 400 writes:
  - `notifications where userId == uid`;
  - collection-group `applications where applicantUid == uid`;
  - collection-group `chat where senderId == uid`;
  - `guest-weeks where userId == uid`;
  - Storage `users/{uid}/avatar` and, per guest, the prefix `houses/{houseId}/guests/{guestId}/avatar/`.

  Missing files and empty queries are fine.

- [ ] **Step 1: Write the failing tests:**
  - `"deletes the user's notifications, applications and guest-weeks"`
  - `"deletes only messages the user sent"`: `chat` docs with `recipientId == uid` and another sender survive.
  - `"deletes avatars and tolerates missing files"`
  - `"pages through more than 400 documents"`
- [ ] **Steps 2–4:** Run the tests (they fail), implement, run them again (they pass). Add the two collection-group single-field index exemptions, if the emulator asks for them, to `regroup/mobile/firebase/firestore.indexes.json`.
- [ ] **Step 5: Commit** with `feat(regroup-functions): delete a user's personal data and files`.

### Task 5: Orchestrator with resumable steps

**Files:**

- Create: `regroup/functions/src/accountDeletion/index.ts`
- Test: `regroup/functions/src/__tests__/accountDeletion/index.test.ts`

**Interfaces:**

- Consumes: Tasks 2–4.
- Produces: `type DeletionStep = "operator" | "members" | "personal" | "userDoc" | "auth"`.
- Produces: `runAccountDeletion(uid: string, now?: string): Promise<{ completed: DeletionStep[] }>`. It:
  1. reads `accountDeletions/{uid}.completed` (default `[]`);
  2. loads `users/{uid}`, `guests where userId == uid` and `admins where userId == uid`;
  3. runs each step not yet completed in the order above, and appends the step to `completed` after it succeeds;
  4. for `userDoc`, deletes `users/{uid}`; for `auth`, runs `auth().deleteUser(uid)` (treat `auth/user-not-found` as done);
  5. on the first failure, records `{ lastError: <step>, failedAt }` (no message text) and rethrows.

  Users who own no houses skip the `operator` step; users with no guest or admin docs skip `members`.

- [ ] **Step 1: Write the failing tests:**
  - `"runs every step in order for a resident"`
  - `"runs the operator step only for house owners"`
  - `"handles a user who is both resident and staff"`
  - `"resumes from the recorded step after a failure"`
  - `"deletes the Auth user last"`
  - `"treats an already-deleted Auth user as done"`
- [ ] **Steps 2–4:** Run the tests (they fail), implement, run them again (they pass).
- [ ] **Step 5: Commit** with `feat(regroup-functions): resumable account deletion`.

### Task 6: `deleteAccount` callable

**Files:**

- Create: `regroup/functions/src/callable/account.ts`
- Modify: `regroup/functions/src/index.ts` (add `export { deleteAccount } from './callable/account';`)
- Test: `regroup/functions/src/__tests__/callable/account.test.ts`

**Interfaces:**

- Consumes: `runAccountDeletion` (Task 5).
- Produces: the `deleteAccount` callable, with `{ secrets: [STRIPE_SECRET_KEY] }`. It takes no input and returns `{ deleted: true }`. It throws:
  - `unauthenticated` when there is no auth;
  - `failed-precondition` "Please sign in again to delete your account" when `Date.now()/1000 - request.auth.token.auth_time > 300`;
  - `internal` "We couldn't finish deleting your account. Try again." if `runAccountDeletion` throws.

- [ ] **Step 1: Write the failing tests:**
  - `"rejects unauthenticated callers"`
  - `"refuses a stale sign-in"`: `runAccountDeletion` is not called.
  - `"deletes the caller's own account only"`: it's called with `request.auth.uid` and ignores any `uid` in the request data.
  - `"maps a deletion failure to a retryable error"`
- [ ] **Steps 2–4:** Run the tests (they fail), implement, run them again (they pass), and run `npx tsc --noEmit`.
- [ ] **Step 5: Commit** with `feat(regroup-functions): deleteAccount callable`.

### Task 7: Mobile Delete Account screen

**Files:**

- Create: `regroup/mobile/src/services/account.ts`
- Create: `regroup/mobile/src/screens/Personal/DeleteAccount.tsx`
- Modify: `regroup/mobile/src/navigation/types.ts` (add `Routes.DeleteAccount = 'deleteAccount'` and its param entry next to `TwoFactorSetup`, lines 77 and 232)
- Modify: `regroup/mobile/src/navigation/navigators.tsx:531` (register the screen beside `TwoFactorSetup`)
- Modify: `regroup/mobile/src/screens/Personal/Personal.tsx:351` (one menu item, "Delete account", navigating to `Routes.DeleteAccount`; net-zero lines if possible)
- Test: `regroup/mobile/src/services/__tests__/account.test.ts`, `regroup/mobile/src/screens/Personal/__tests__/DeleteAccount.test.tsx`

**Interfaces:**

- Produces: `deleteMyAccount(password: string): Promise<void>` in `services/account.ts`. It:
  1. re-authenticates with `EmailAuthProvider.credential(currentUser.email, password)` and `reauthenticateWithCredential`;
  2. forces a token refresh (`getIdToken(true)`) so `auth_time` is fresh;
  3. calls `functions.httpsCallable("deleteAccount")()`;
  4. signs out.

Screen copy (fixed text):

- Title: "Delete account"
- Body: "This permanently deletes your Regroup login and personal information. Your house keeps the records it needs for rent and compliance, without your contact or health details. If you own houses, your subscription is cancelled now and your houses are closed. This cannot be undone."
- Password field label: "Password"
- Destructive button: "Delete my account"
- On a wrong password: "That password is incorrect."
- On any other failure: "We couldn't delete your account. Try again."
- On success, navigate to `Routes.PriorAuth`, as `signOut` does at `Personal.tsx:295`.

- [ ] **Step 1: Write the failing tests:**
  - `"re-authenticates, refreshes the token, calls deleteAccount, then signs out"` (call order)
  - `"does not call deleteAccount when re-authentication fails"`
  - `"shows the incorrect-password message on auth/wrong-password and auth/invalid-credential"`
  - `"navigates to PriorAuth after deletion"`
  - `"disables the button while deleting"`
- [ ] **Steps 2–4:** Run the tests (they fail), implement, run them again (they pass), and run `npx tsc --noEmit`.
- [ ] **Step 5: Commit** with `feat(regroup-mobile): in-app account deletion`.

### Task 8: Emulator run per role

**Files:** none committed, unless a bug is found.

- [ ] **Step 1:** Seed three users in the emulators:
  - a resident with a guest doc, activities and an avatar;
  - a staff admin on two houses;
  - an operator owning one house with a test-mode subscription. Use `stripe-mock`, or point Stripe at test mode with `npm run stripe:listen` per `docs/operations/stripe-testing.md`.
- [ ] **Step 2:** As each user, sign in, call `deleteAccount`, and check that:
  - the Auth user is gone and `users/{uid}` is gone;
  - the role records match D1 and D2;
  - `accountDeletions/{uid}.completed` lists every applicable step.
- [ ] **Step 3:** Make the Storage delete throw for one run (rename the bucket in the emulator), check that the call fails, restore it, and call again. Expected: completes without repeating the Stripe step (check the Stripe request log).
