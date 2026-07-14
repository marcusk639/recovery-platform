# Homegroups Wave 6 (Callable Auth/Validation Wrapper — Full Rollout) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish rolling out the `requireAuth`/`validateData` callable wrapper (built in Wave 2 Task 5, `homegroups/functions/src/utils/callableWrapper.ts`) across the remaining 88 of 91 Cloud Functions callables that still use ad-hoc `request.auth` checks, and add Zod `validateData` schemas to the 10 callables that pass unvalidated or under-validated client input into a Firestore write.

**Architecture:** No new services or files beyond one addition (a Zod schema block per Task 7 target file, inline in each existing callable, matching the pattern already established in `createGroupWithSubscription.ts`). This is a mechanical, file-by-file migration: swap each callable's ad-hoc `if (!request.auth) throw ...` guard for `const uid = requireAuth(request);` (or the equivalent optional-chaining/destructure variant), leaving every downstream authorization check (group-admin arrays, member-doc role flags, custom claims, ownership checks, `assertGroupActive`) completely untouched. `requireAuth` only replaces the base "is there a signed-in caller" guard — it does not, and must not, absorb business-specific authorization logic.

**Tech Stack:** Firebase Cloud Functions v2 (TypeScript) + Zod (already a dependency since Wave 2 Task 5). Jest + ts-jest for tests.

## Global Constraints

- All paths relative to `/Users/marcusklein/dev/recovery-platform/homegroups/functions/` unless stated otherwise.
- No new npm dependencies — `zod` is already installed (Wave 2 Task 5).
- Every task must leave `npx tsc --noEmit` clean and the full existing test suite green (`npm test -- --passWithNoTests --forceExit`) in addition to its own new/changed tests.
- **The migration rule, applied uniformly:** replace only the base auth-presence guard. Two source styles exist in this codebase today:

  **Style 1 — guard block:**

  ```typescript
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be authenticated.");
  }
  ```

  becomes:

  ```typescript
  const uid = requireAuth(request);
  ```

  (choose the variable name already used downstream in that file — some files use `uid`, others `userId`, others `callerId`; match the existing downstream usage exactly so you don't have to rename every call site, just the declaration.)

  **Style 2 — optional-chain single-line:**

  ```typescript
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError("unauthenticated", "...");
  }
  ```

  becomes:

  ```typescript
  const userId = requireAuth(request);
  ```

  **Style 3 — destructure-rename** (`const { data, auth: context } = request; if (!context) throw ...`, used by `initiateAdminRemoval.ts`, `submitAdminRemovalResponse.ts`, `voteOnAdminRemoval.ts`):

  ```typescript
  const { data, auth: context } = request;
  if (!context) {
    throw new HttpsError("unauthenticated", "...");
  }
  ```

  becomes:

  ```typescript
  const { data } = request;
  const callerId = requireAuth(request);
  ```

  then replace every downstream `context.uid` with `callerId` (there is no other use of `context` in these three files — verify this by reading the file before assuming it).

- **Add the import** `import { requireAuth } from "../utils/callableWrapper";` (adjust relative path if the file is not directly under `src/callable/`) to every file touched. If the file already imports from `"../utils/callableWrapper"` (i.e. it already uses `validateData`), add `requireAuth` to the existing named-import list instead of a second import line.
- **Never remove the `request.auth` reference if the file reads anything else off it downstream** — several files read `request.auth?.token?.email`, `request.auth?.token?.name`, or `request.auth?.token?.superAdmin` after the guard, or pass `request.auth?.token?.email` into Stripe customer creation. `requireAuth(request)` returns only the uid string; `request.auth` itself remains populated and accessible after the guard passes (the function only throws when it's absent), so these downstream reads are unaffected and must be left exactly as they are — do not try to route them through `requireAuth`'s return value.
- **Never touch any authorization logic beyond the base guard** — admin-array checks (`groupData.admins?.includes(uid)`), member-doc role checks (`isAdmin === true || roles.includes("admin")`), custom-claim checks (`request.auth?.token?.superAdmin`), ownership checks (`role === 'owner'`), `assertGroupActive(groupData)` calls, or any other business-specific authorization. These are separate concerns from "is there a signed-in caller" and are explicitly out of scope for this wave (see Deferred Work below).
- **Excluded files — do not add `requireAuth` to these; they are intentionally public/unauthenticated by design:**
  - `getPublicGroupProfile.ts` (public group profile page — confirmed by an in-file comment referencing `docs/superpowers/specs/2026-04-14-public-group-page-design.md`; uses `enforceRateLimit` instead of auth)
  - `submitPartnershipLead.ts` (public lead-gen form with honeypot bot-protection field, no login required)
- Two files with async two-step Stripe/transaction logic — `reactivateGroupSubscription.ts` and `requestAdminAccessWithSubscription.ts` — get the identical mechanical swap as everything else (their auth check is a plain guard, not itself complex), but run their full dedicated test files individually after the change and read the diff by hand before committing, since they're Tier A (Stripe/payment) per this repo's Model Tier Policy.

---

## File Structure

| File(s)                                                                                                                                                                                                                                                              | Task | Change                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------- |
| 15 files, Task 1 list                                                                                                                                                                                                                                                | 1    | Swap ad-hoc auth guard for `requireAuth(request)`                               |
| 16 files, Task 2 list (incl. `createGroupWithSubscription.ts`)                                                                                                                                                                                                       | 2    | Swap ad-hoc auth guard for `requireAuth(request)`                               |
| 15 files, Task 3 list                                                                                                                                                                                                                                                | 3    | Swap ad-hoc auth guard for `requireAuth(request)`                               |
| 14 files, Task 4 list (excludes `getPublicGroupProfile.ts`)                                                                                                                                                                                                          | 4    | Swap ad-hoc auth guard for `requireAuth(request)`                               |
| 15 files, Task 5 list                                                                                                                                                                                                                                                | 5    | Swap ad-hoc auth guard for `requireAuth(request)`                               |
| 14 files, Task 6 list (excludes `submitPartnershipLead.ts`)                                                                                                                                                                                                          | 6    | Swap ad-hoc auth guard for `requireAuth(request)`                               |
| `createIntergroup.ts`, `contributeLiterature.ts`, `banUser.ts`, `saveMeetingMinutes.ts`, `initiateAdminRemoval.ts`, `initiateTreasurerHandoff.ts`, `submitBranding.ts`, `sendIntergroupAnnouncement.ts`, `notifyAdminUpgradeRequest.ts`, `grantSponsorStepAccess.ts` | 7    | Add Zod `validateData` schema for the allow-listed client-input fields          |
| (verification only)                                                                                                                                                                                                                                                  | 8    | Full-suite typecheck + test run, `functions/CLAUDE.md` doc update, final commit |

All files are under `homegroups/functions/src/callable/` unless noted. Total: 89 auth-guard migrations (91 callables minus the 2 intentionally-public exclusions) + 10 validateData additions. `createGroupWithSubscription.ts` already has `validateData` from Wave 2 Task 6 — this wave only adds its still-missing `requireAuth` swap (folded into Task 2).

---

## Task 1: requireAuth Migration — Batch A

**Files (all in `src/callable/`):**

```
affiliateGroupToIntergroup.ts
applyReferralCode.ts
approveMeetingMinutes.ts
banUser.ts
bookmarkLiteratureForGroup.ts
cancelTreasurerHandoff.ts
castConscienceVote.ts
castElectionVote.ts
checkInToMeeting.ts
closeConscienceVote.ts
closeElection.ts
completeTreasurerHandoff.ts
configureSSO.ts
contributeLiterature.ts
contributeMeetingTopic.ts
```

**Interfaces:** No signature changes. Every file's exported callable keeps its existing name, input type, and return shape — only the internal auth-guard lines change.

**Special handling for this batch (read the file first to confirm before editing):**

- `banUser.ts`: uses `const context = request.auth; if (!context) throw ...` then later reads `context.uid` **and** `context.token?.superAdmin` (for the platform-wide-ban branch) **and** `context.token?.name`/`context.token?.email` if present. Since `requireAuth` only returns the uid, replace the guard with `const uid = requireAuth(request);` for the uid usages, but keep every `request.auth?.token?.X` read as-is (do not route them through `context` if `context` is fully removed — either keep a `const context = request.auth;` line after the `requireAuth` call for the token reads, or replace each `context.token?.X` with `request.auth?.token?.X` directly; pick whichever keeps the diff smaller by reading the actual file first).
- `configureSSO.ts`: single-line style `if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in");` — clean Style 1 swap. Downstream Firestore-owner-role check (`ownerMemberSnap.data()?.role !== 'owner'`) and `intergroupData.tier !== 'tier_b'` gate are untouched.
- `approveMeetingMinutes.ts`, `bookmarkLiteratureForGroup.ts`, `closeConscienceVote.ts`, `closeElection.ts`: each has a duplicated group-admin-check block (`isAdmin === true || roles.includes("admin")`) immediately after the auth guard — leave that block completely untouched, only swap the guard above it. These four files also use the `assertGroupActive` subscription-guard helper in some cases — also untouched.
- All other files in this batch: plain Style 1 guard, no additional role/claim logic, mechanical swap.

- [ ] **Step 1: Add the import to all 15 files**

For each file, add (or merge into an existing `callableWrapper` import):

```typescript
import { requireAuth } from "../utils/callableWrapper";
```

- [ ] **Step 2: Apply the guard swap to all 15 files**

Read each file, locate its auth guard (Style 1 in all 15 cases per the survey — verify against the actual current code, styles can drift), and replace it per the Global Constraints migration rule. Preserve the exact downstream variable name already in use (`userId`, `uid`, `context.uid`, etc.) so no other line in the file needs to change.

- [ ] **Step 3: Typecheck**

Run: `cd functions && npx tsc --noEmit`
Expected: exit 0. If a file fails because a downstream reference to the old guard variable wasn't updated, fix the reference (not the guard).

- [ ] **Step 4: Run the full test suite**

Run: `cd functions && npm test -- --passWithNoTests --forceExit`
Expected: all suites green. Pay particular attention to any existing test file for these 15 callables (check `src/__tests__/` for matches) — if a test mocks `request.auth` directly and asserts on the exact thrown error message, confirm `requireAuth`'s message (`"Must be authenticated."`) still matches what the test expects, or update the test's expected message to match (the behavior is unchanged — unauthenticated still throws `unauthenticated` — only the literal string may differ from a file's original custom message like `"Must be signed in"` vs `"Must be authenticated."`; this is not a functional regression but must be reflected in test assertions).

- [ ] **Step 5: Commit**

```bash
cd /Users/marcusklein/dev/recovery-platform
git add homegroups/functions/src/callable/affiliateGroupToIntergroup.ts homegroups/functions/src/callable/applyReferralCode.ts homegroups/functions/src/callable/approveMeetingMinutes.ts homegroups/functions/src/callable/banUser.ts homegroups/functions/src/callable/bookmarkLiteratureForGroup.ts homegroups/functions/src/callable/cancelTreasurerHandoff.ts homegroups/functions/src/callable/castConscienceVote.ts homegroups/functions/src/callable/castElectionVote.ts homegroups/functions/src/callable/checkInToMeeting.ts homegroups/functions/src/callable/closeConscienceVote.ts homegroups/functions/src/callable/closeElection.ts homegroups/functions/src/callable/completeTreasurerHandoff.ts homegroups/functions/src/callable/configureSSO.ts homegroups/functions/src/callable/contributeLiterature.ts homegroups/functions/src/callable/contributeMeetingTopic.ts
git commit -m "refactor(homegroups-functions): migrate batch A (15 callables) onto shared requireAuth guard"
```

(If any test files needed message-string updates per Step 4, add and include them in this commit.)

---

## Task 2: requireAuth Migration — Batch B

**Files (all in `src/callable/`):**

```
createConscienceVote.ts
createCustomerPortalSession.ts
createGroupSubscription.ts
createGroupWithSubscription.ts
createIntergroup.ts
createMultiGroupAnnouncement.ts
createStripeAccountLink.ts
createStripeCheckoutSession.ts
createStripePaymentIntent.ts
createWebAuthToken.ts
deaffiliateGroupFromIntergroup.ts
deleteGroupResource.ts
deleteUserAccount.ts
exportFacilityComplianceReport.ts
exportGroupData.ts
exportIntergroupData.ts
```

**Interfaces:** No signature changes.

**Special handling for this batch:**

- `createGroupWithSubscription.ts` already imports `validateData` from `"../utils/callableWrapper"` (Wave 2 Task 6) — add `requireAuth` to that same import line rather than a new import statement. Its current guard is `const userId = request.auth?.uid;` at line 86 (verify against current line numbers) — Style 2 swap.
- `deleteUserAccount.ts`: after the base guard, this file compares `data.confirmEmail` against `request.auth.token.email` as a second-factor-style re-auth check before proceeding with the cascading delete. This comparison must remain exactly as-is — only swap the initial `if (!userId) throw` guard, keep the `request.auth.token.email` read untouched. This is the largest/highest-blast-radius file in this batch (multi-collection cascade delete + Stripe subscription cancellation) — read the whole diff by hand after editing, don't just trust the mechanical swap.
- `createIntergroup.ts` also gets a `validateData` schema in Task 7 — do not add it here, this task is auth-only for this file. Its Style 1 guard (`if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in");`) is otherwise a clean swap.
- All other files: Style 2 (`const userId = request.auth?.uid; if (!userId) throw ...`) in most cases, or Style 1 — verify each file individually since the survey found a mix across this batch.

- [ ] **Step 1: Add/merge the `requireAuth` import in all 16 files**

- [ ] **Step 2: Apply the guard swap to all 16 files**

- [ ] **Step 3: Typecheck**

Run: `cd functions && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Run the full test suite, with extra scrutiny on `deleteUserAccount.ts` and `createGroupWithSubscription.ts`**

Run: `cd functions && npm test -- --passWithNoTests --forceExit`
Expected: all suites green, including `src/__tests__/createGroupWithSubscription.test.ts` (existing) — confirm its Task-6-era `validateData` tests still pass unchanged, since this task only touches the auth line, not the validation logic.

- [ ] **Step 5: Commit**

```bash
cd /Users/marcusklein/dev/recovery-platform
git add homegroups/functions/src/callable/createConscienceVote.ts homegroups/functions/src/callable/createCustomerPortalSession.ts homegroups/functions/src/callable/createGroupSubscription.ts homegroups/functions/src/callable/createGroupWithSubscription.ts homegroups/functions/src/callable/createIntergroup.ts homegroups/functions/src/callable/createMultiGroupAnnouncement.ts homegroups/functions/src/callable/createStripeAccountLink.ts homegroups/functions/src/callable/createStripeCheckoutSession.ts homegroups/functions/src/callable/createStripePaymentIntent.ts homegroups/functions/src/callable/createWebAuthToken.ts homegroups/functions/src/callable/deaffiliateGroupFromIntergroup.ts homegroups/functions/src/callable/deleteGroupResource.ts homegroups/functions/src/callable/deleteUserAccount.ts homegroups/functions/src/callable/exportFacilityComplianceReport.ts homegroups/functions/src/callable/exportGroupData.ts homegroups/functions/src/callable/exportIntergroupData.ts
git commit -m "refactor(homegroups-functions): migrate batch B (16 callables) onto shared requireAuth guard"
```

---

## Task 3: requireAuth Migration — Batch C

**Files (all in `src/callable/`):**

```
exportMeetingGuideFormat.ts
exportUserData.ts
favoriteGroupTopic.ts
findMeetings.ts
generateGroupInvite.ts
generateIntergroupReport.ts
generateReferralCode.ts
generateTreasuryReport.ts
getAttendanceAnalytics.ts
getCrossGroupSponsors.ts
getFacilityEngagementMetrics.ts
getFacilityStats.ts
getGroupDashboardMetrics.ts
getGroupHealthTimeSeries.ts
getGroupSubscriptionInfo.ts
```

**Interfaces:** No signature changes.

**Special handling for this batch:**

- `exportUserData.ts`: reads `request.auth?.token.email` downstream after the guard — keep that read untouched, only swap the guard (Style 2: `const userId = request.auth?.uid; if (!userId) throw ...`).
- `generateTreasuryReport.ts`: the current auth check runs _after_ an input-shape validation block (order flip from the usual pattern) and has multi-step role logic (`admins`/`treasurers` on the group doc, falling back to a member-doc `isAdmin`/`isTreasurer` check) immediately following it. Swap only the guard itself (`const auth = request.auth; if (!auth) throw ...`), keep its current position in the function and leave the multi-step role check completely untouched.
- `getFacilityEngagementMetrics.ts` and `getFacilityStats.ts`: both share the facility-admin gate (`intergroup.adminUids?.includes(uid)` + `type !== "treatment_center"` + subscription-status check) documented in `functions/CLAUDE.md`'s "Facility / Treatment-Center Dashboard" section — untouched, guard-only swap.
- `generateIntergroupReport.ts`, `generateReferralCode.ts`, `getAttendanceAnalytics.ts`, `getGroupDashboardMetrics.ts`, `getGroupHealthTimeSeries.ts`, `getGroupSubscriptionInfo.ts`: all share a near-identical `groupData.admins?.includes(uid)` check (most also call `assertGroupActive(groupData)` right after) — untouched, guard-only swap.
- All other files: plain Style 1 or Style 2 guard, no additional role logic.

- [ ] **Step 1: Add/merge the `requireAuth` import in all 15 files**

- [ ] **Step 2: Apply the guard swap to all 15 files**

- [ ] **Step 3: Typecheck**

Run: `cd functions && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Run the full test suite**

Run: `cd functions && npm test -- --passWithNoTests --forceExit`
Expected: all suites green.

- [ ] **Step 5: Commit**

```bash
cd /Users/marcusklein/dev/recovery-platform
git add homegroups/functions/src/callable/exportMeetingGuideFormat.ts homegroups/functions/src/callable/exportUserData.ts homegroups/functions/src/callable/favoriteGroupTopic.ts homegroups/functions/src/callable/findMeetings.ts homegroups/functions/src/callable/generateGroupInvite.ts homegroups/functions/src/callable/generateIntergroupReport.ts homegroups/functions/src/callable/generateReferralCode.ts homegroups/functions/src/callable/generateTreasuryReport.ts homegroups/functions/src/callable/getAttendanceAnalytics.ts homegroups/functions/src/callable/getCrossGroupSponsors.ts homegroups/functions/src/callable/getFacilityEngagementMetrics.ts homegroups/functions/src/callable/getFacilityStats.ts homegroups/functions/src/callable/getGroupDashboardMetrics.ts homegroups/functions/src/callable/getGroupHealthTimeSeries.ts homegroups/functions/src/callable/getGroupSubscriptionInfo.ts
git commit -m "refactor(homegroups-functions): migrate batch C (15 callables) onto shared requireAuth guard"
```

---

## Task 4: requireAuth Migration — Batch D

**Files (all in `src/callable/`):**

```
getMemberEngagementMetrics.ts
getMilestones.ts
getMultiGroupPricing.ts
getPublicEvents.ts
getReferralStats.ts
getStripeAccountDetails.ts
getStripeAccountInfo.ts
getStripeAccountMetrics.ts
getTreasuryTrends.ts
grantSponsorStepAccess.ts
initiateAdminRemoval.ts
initiateTreasurerHandoff.ts
joinGroupByInviteCode.ts
locationServices.ts
```

**Do NOT touch:** `getPublicGroupProfile.ts` — intentionally public (see Global Constraints).

**Interfaces:** No signature changes.

**Special handling for this batch:**

- `getStripeAccountDetails.ts`, `getStripeAccountInfo.ts`, `getStripeAccountMetrics.ts`: each has a second check after the base guard — `if (request.auth?.token?.superAdmin !== true) throw new HttpsError("permission-denied", ...)`. Keep that untouched; only swap the base guard.
- `getMilestones.ts`, `grantSponsorStepAccess.ts`: both export their handler function separately from the `onCall(...)` wrapper for testability (e.g. `export const getMilestonesHandler = async (request: ...) => {...}; export const getMilestones = onCall(getMilestonesHandler);`). Apply the guard swap inside the handler function body — the export shape itself does not change, and existing tests that import the handler directly keep working unmodified.
- `initiateAdminRemoval.ts`: uses Style 3 (destructure-rename — `const { data, auth: context } = request; if (!context) throw ...`). Apply the Style 3 transformation from Global Constraints. This file also gets a `validateData` schema in Task 7 — this task is auth-only.
- `initiateTreasurerHandoff.ts`: uses `const auth = request.auth; if (!auth) throw new HttpsError("unauthenticated", "User must be authenticated.");` — Style 1 variant (already named `auth`, not `context` — do not confuse with Style 3; this one keeps `auth.uid` reads that can be replaced 1:1 by the `requireAuth` return value, no destructure involved). Also gets a `validateData` schema in Task 7.
- `grantSponsorStepAccess.ts`: has a separate active-sponsorship-relationship check (`sponsorships` collection query) after the guard — untouched. Also gets a `validateData` schema in Task 7.

- [ ] **Step 1: Add/merge the `requireAuth` import in all 14 files**

- [ ] **Step 2: Apply the guard swap to all 14 files**

- [ ] **Step 3: Typecheck**

Run: `cd functions && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Run the full test suite, confirming `getMilestones.ts`'s and `grantSponsorStepAccess.ts`'s existing handler-level tests still pass unchanged**

Run: `cd functions && npm test -- --passWithNoTests --forceExit`
Expected: all suites green.

- [ ] **Step 5: Verify `getPublicGroupProfile.ts` was not touched**

Run: `git diff --stat homegroups/functions/src/callable/getPublicGroupProfile.ts`
Expected: empty output (no changes).

- [ ] **Step 6: Commit**

```bash
cd /Users/marcusklein/dev/recovery-platform
git add homegroups/functions/src/callable/getMemberEngagementMetrics.ts homegroups/functions/src/callable/getMilestones.ts homegroups/functions/src/callable/getMultiGroupPricing.ts homegroups/functions/src/callable/getPublicEvents.ts homegroups/functions/src/callable/getReferralStats.ts homegroups/functions/src/callable/getStripeAccountDetails.ts homegroups/functions/src/callable/getStripeAccountInfo.ts homegroups/functions/src/callable/getStripeAccountMetrics.ts homegroups/functions/src/callable/getTreasuryTrends.ts homegroups/functions/src/callable/grantSponsorStepAccess.ts homegroups/functions/src/callable/initiateAdminRemoval.ts homegroups/functions/src/callable/initiateTreasurerHandoff.ts homegroups/functions/src/callable/joinGroupByInviteCode.ts homegroups/functions/src/callable/locationServices.ts
git commit -m "refactor(homegroups-functions): migrate batch D (14 callables) onto shared requireAuth guard"
```

---

## Task 5: requireAuth Migration — Batch E

**Files (all in `src/callable/`):**

```
nominateForElection.ts
notifyAdminRequestResult.ts
notifyAdminUpgradeRequest.ts
openElection.ts
openElectionVoting.ts
postGroupDailyThought.ts
ratifyBylaws.ts
reactivateGroupSubscription.ts
recordCheckIn.ts
recordMilestone.ts
requestAdminAccessWithSubscription.ts
saveBylawDraft.ts
saveLiteratureItem.ts
saveMeetingMinutes.ts
searchGroupsByLocation.ts
```

**Interfaces:** No signature changes.

**Special handling for this batch — read carefully, this batch has the two Tier A (Stripe/payment) files:**

- `reactivateGroupSubscription.ts`: Style 2 guard (`const userId = request.auth?.uid; if (!userId) throw ...`). The rest of the function is Stripe API calls with server-computed values written to Firestore — no client-data passthrough. Swap only the guard. **Tier A per this repo's Model Tier Policy (Stripe/payment logic) — after the mechanical swap, read the full diff by hand and run its dedicated test file (if one exists under `src/__tests__/`) in isolation before moving to the next file.**
- `requestAdminAccessWithSubscription.ts`: Style 2 guard at the top (`const userId = request.auth?.uid; if (!userId) { throw new HttpsError("unauthenticated", "User must be logged in."); }`). This file already has a dedicated test suite at `src/__tests__/requestAdminAccessWithSubscription.test.ts` covering the payment-method-required-before-subscription-creation guard (a prior security fix, already shipped — this task does not change that logic, only the auth-presence check above it). **Tier A — after the swap, run `cd functions && npx jest src/__tests__/requestAdminAccessWithSubscription.test.ts` in isolation and read every assertion in that file to confirm none of them assert on the literal string `"User must be logged in."` in a way that would break after `requireAuth`'s message (`"Must be authenticated."`) replaces it — update any such assertion to match, the underlying behavior (reject unauthenticated calls) is unchanged.**
- `recordMilestone.ts`: exports its handler separately (`recordMilestoneHandler`) from the `onCall`-wrapped export, same pattern as `getMilestones.ts` in Task 4 — apply the swap inside the handler function.
- `notifyAdminUpgradeRequest.ts`: Style 2 guard (`const userId = request.auth?.uid; if (!userId) throw ...`). Also gets a `validateData` schema in Task 7 for its `featureName` field — this task is auth-only.
- `saveMeetingMinutes.ts`: Style 1 guard. Has a secretary-or-admin role check (`roles.includes("secretary")` OR admin) after the guard — untouched. Also gets a `validateData` schema in Task 7 (the strongest validateData case found in the whole survey — a nested, largely unvalidated `minutes` object) — this task is auth-only.
- All other files: plain Style 1 guard, no additional role logic beyond what's noted (`nominateForElection.ts`, `openElection.ts`, `openElectionVoting.ts`, `postGroupDailyThought.ts`, `ratifyBylaws.ts`, `saveBylawDraft.ts` share a duplicated inline `callerData.isAdmin === true || (callerData.roles || []).includes("admin")` check — untouched, guard-only swap).

- [ ] **Step 1: Add/merge the `requireAuth` import in all 15 files**

- [ ] **Step 2: Apply the guard swap to all 15 files**

- [ ] **Step 3: Typecheck**

Run: `cd functions && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Run `requestAdminAccessWithSubscription.test.ts` in isolation first**

Run: `cd functions && npx jest src/__tests__/requestAdminAccessWithSubscription.test.ts`
Expected: PASS. If any assertion fails on the exact error message, update the test's expected string (not the implementation) — the underlying rejection behavior for an unauthenticated call is unchanged, only the message text differs.

- [ ] **Step 5: Run the full test suite**

Run: `cd functions && npm test -- --passWithNoTests --forceExit`
Expected: all suites green.

- [ ] **Step 6: Commit**

```bash
cd /Users/marcusklein/dev/recovery-platform
git add homegroups/functions/src/callable/nominateForElection.ts homegroups/functions/src/callable/notifyAdminRequestResult.ts homegroups/functions/src/callable/notifyAdminUpgradeRequest.ts homegroups/functions/src/callable/openElection.ts homegroups/functions/src/callable/openElectionVoting.ts homegroups/functions/src/callable/postGroupDailyThought.ts homegroups/functions/src/callable/ratifyBylaws.ts homegroups/functions/src/callable/reactivateGroupSubscription.ts homegroups/functions/src/callable/recordCheckIn.ts homegroups/functions/src/callable/recordMilestone.ts homegroups/functions/src/callable/requestAdminAccessWithSubscription.ts homegroups/functions/src/callable/saveBylawDraft.ts homegroups/functions/src/callable/saveLiteratureItem.ts homegroups/functions/src/callable/saveMeetingMinutes.ts homegroups/functions/src/callable/searchGroupsByLocation.ts homegroups/functions/src/__tests__/requestAdminAccessWithSubscription.test.ts
git commit -m "refactor(homegroups-functions): migrate batch E (15 callables) onto shared requireAuth guard"
```

(Only include the test file in the `git add` if Step 4 actually required a change to it.)

---

## Task 6: requireAuth Migration — Batch F

**Files (all in `src/callable/`):**

```
seedDailyReflections.ts
sendAnnouncementNotification.ts
sendGroupInviteEmail.ts
sendIntergroupAnnouncement.ts
sendMentionNotifications.ts
setupSubscriptionPaymentMethod.ts
setUserAsSuperAdmin.ts
submitAdminRemovalResponse.ts
submitBranding.ts
syncUserClaims.ts
updateGroupMemberCount.ts
upgradeIntergroupTier.ts
uploadBrandingLogo.ts
voteOnAdminRemoval.ts
```

**Do NOT touch:** `submitPartnershipLead.ts` — intentionally public (see Global Constraints).

**Interfaces:** No signature changes.

**Special handling for this batch:**

- `seedDailyReflections.ts`: after the base guard, checks `request.auth.token.superAdmin` — untouched, guard-only swap.
- `setUserAsSuperAdmin.ts`: after the base guard, does an Admin-SDK lookup (`auth.getUser(callerUid).customClaims.superAdmin`) rather than reading `request.auth.token` directly — untouched. This is the highest-privilege callable in the codebase (grants/revokes superAdmin role) — Tier A, read the full diff by hand after the mechanical swap.
- `syncUserClaims.ts`: has a _conditional_ secondary check — only when the caller is targeting a different user than themselves does it check `callerToken.superAdmin`. Untouched, guard-only swap.
- `submitAdminRemovalResponse.ts`, `voteOnAdminRemoval.ts`: both use Style 3 (destructure-rename — `const { data, auth: context } = request; if (!context) throw ...`). Apply the Style 3 transformation from Global Constraints to both.
- `upgradeIntergroupTier.ts`: exports its handler separately (`upgradeIntergroupTierHandler`) from the `onCall`-wrapped export — apply the swap inside the handler function, same pattern as `getMilestones.ts`/`recordMilestone.ts`.
- `submitBranding.ts`: Style 1-ish inline guard (`if (!request.auth) throw new HttpsError(...)`). Also gets a `validateData` schema in Task 7 for its color/text fields — this task is auth-only.
- `sendIntergroupAnnouncement.ts`: inline Style 1 guard. Has a secondary intergroup-admin check after it — untouched. Also gets a `validateData` schema in Task 7 for `title`/`content` — this task is auth-only.
- All other files: plain Style 1 or Style 2 guard, no additional role logic.

- [ ] **Step 1: Add/merge the `requireAuth` import in all 14 files**

- [ ] **Step 2: Apply the guard swap to all 14 files**

- [ ] **Step 3: Typecheck**

Run: `cd functions && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Run the full test suite**

Run: `cd functions && npm test -- --passWithNoTests --forceExit`
Expected: all suites green.

- [ ] **Step 5: Verify `submitPartnershipLead.ts` was not touched**

Run: `git diff --stat homegroups/functions/src/callable/submitPartnershipLead.ts`
Expected: empty output (no changes).

- [ ] **Step 6: Commit**

```bash
cd /Users/marcusklein/dev/recovery-platform
git add homegroups/functions/src/callable/seedDailyReflections.ts homegroups/functions/src/callable/sendAnnouncementNotification.ts homegroups/functions/src/callable/sendGroupInviteEmail.ts homegroups/functions/src/callable/sendIntergroupAnnouncement.ts homegroups/functions/src/callable/sendMentionNotifications.ts homegroups/functions/src/callable/setupSubscriptionPaymentMethod.ts homegroups/functions/src/callable/setUserAsSuperAdmin.ts homegroups/functions/src/callable/submitAdminRemovalResponse.ts homegroups/functions/src/callable/submitBranding.ts homegroups/functions/src/callable/syncUserClaims.ts homegroups/functions/src/callable/updateGroupMemberCount.ts homegroups/functions/src/callable/upgradeIntergroupTier.ts homegroups/functions/src/callable/uploadBrandingLogo.ts homegroups/functions/src/callable/voteOnAdminRemoval.ts
git commit -m "refactor(homegroups-functions): migrate batch F (14 callables) onto shared requireAuth guard"
```

---

## Task 7: Add `validateData` Zod Schemas to Under-Validated Callables

**Files (all in `src/callable/`):** `createIntergroup.ts`, `contributeLiterature.ts`, `banUser.ts`, `saveMeetingMinutes.ts`, `initiateAdminRemoval.ts`, `initiateTreasurerHandoff.ts`, `submitBranding.ts`, `sendIntergroupAnnouncement.ts`, `notifyAdminUpgradeRequest.ts`, `grantSponsorStepAccess.ts`.

**Interfaces:** No callable signature changes — each file's input type stays the same at the TypeScript level. At runtime, the specific fields named below get Zod-validated (and allow-list-stripped, per Zod's default parsing mode) before being written to Firestore, closing the "unvalidated client text lands directly in a document" gap the survey found in each file.

**Context:** Every file below already does _some_ ad-hoc validation (truthy checks, regex, length caps) but either misses a field entirely (e.g. `tags` arrays never checked) or re-implements validation Zod does more robustly (hex-color regexes, date parsing). This task formalizes that validation as an explicit schema, run through the existing `validateData` helper from Wave 2 Task 5 — the same function `createGroupWithSubscription.ts` already uses.

- [ ] **Step 1: `createIntergroup.ts` — validate the 7 client-settable intergroup fields**

Read the file first to confirm current field names and the exact shape of the `intergroupRef.set({...})` call (approximately lines 215-223). Add:

```typescript
import { z } from "zod";
import { requireAuth, validateData } from "../utils/callableWrapper";

const createIntergroupSchema = z.object({
  name: z
    .string()
    .min(1)
    .refine((n) => !n.includes("@"), {
      message: "name must not contain '@'",
    }),
  type: z.enum(["intergroup", "district", "area", "treatment_center"]),
  tier: z.enum(["tier_a", "tier_b"]),
  description: z.string().optional(),
  contactEmail: z.string().email().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
});
```

Call `const validated = validateData(createIntergroupSchema, request.data);` immediately after the `requireAuth` call (from Task 2), then use `validated.name`, `validated.type`, etc. in place of the raw `request.data` destructure for these 7 fields only. **Do not touch** the existing `successUrl`/`cancelUrl` origin allow-list check — that stays as its own bespoke post-parse validation, not part of this schema (URLs need business-logic allow-list checking, not just type validation).

- [ ] **Step 2: `contributeLiterature.ts` — validate `type` enum and `tags` array**

Read the file first (current interface is at approximately lines 10-20). Add:

```typescript
import { z } from "zod";
import { validateData } from "../utils/callableWrapper";

const contributeLiteratureSchema = z.object({
  title: z.string().min(1),
  author: z.string().optional(),
  type: z.enum([
    "article",
    "guide",
    "pamphlet",
    "meditation",
    "prayer",
    "external_link",
  ]),
  summary: z.string().min(1).max(500),
  externalUrl: z.string().url().optional(),
  tags: z.array(z.string()).optional(),
  program: z.string().optional(),
});
```

Call `const validated = validateData(contributeLiteratureSchema, request.data);` and use `validated.type`, `validated.tags` in place of the current unvalidated `data.type` / `data.tags || []`. Keep the existing business-logic check `data.type === "external_link" && !data.externalUrl` (now `validated.type`/`validated.externalUrl`) — that's cross-field validation Zod's basic schema doesn't express, leave it as a separate check after `validateData` runs.

- [ ] **Step 3: `banUser.ts` — validate `reason`, `durationDays`, `reportId`**

Read the file first (current `banData` construction is at approximately lines 116-130). Add:

```typescript
import { z } from "zod";
import { validateData } from "../utils/callableWrapper";

const banUserSchema = z.object({
  userId: z.string().min(1),
  userName: z.string().min(1),
  reason: z.string().min(1).max(1000),
  durationDays: z.number().int().positive().max(3650).optional(),
  reportId: z.string().optional(),
  groupId: z.string().optional(),
});
```

Call `const validated = validateData(banUserSchema, request.data);` and use `validated.reason`, `validated.durationDays`, `validated.reportId` in place of the current raw `data.reason`/`data.durationDays`/`data.reportId`. **Do not touch** the existing server-side `userName` re-resolution logic that prevents client-name-injection (the file deliberately re-fetches the target user's display name server-side rather than trusting the client's `userName` for the stored ban record) — keep that pattern exactly as-is; the schema above validates `userName` only for the initial truthy/shape check, not as the value actually persisted if the file's existing logic overrides it.

- [ ] **Step 4: `saveMeetingMinutes.ts` — validate the nested `minutes` object**

Read the file first (current `minutesPayload` construction is at approximately lines 148-183). Add:

```typescript
import { z } from "zod";
import { validateData } from "../utils/callableWrapper";

const meetingMinutesSchema = z.object({
  groupId: z.string().min(1),
  minutes: z.object({
    chair: z.string().optional(),
    secretary: z.string().optional(),
    attendanceCount: z.number().int().nonnegative().optional(),
    memberQuorum: z.boolean().optional(),
    openingPrayer: z.boolean().optional(),
    closingPrayer: z.boolean().optional(),
    agendaItems: z
      .array(z.object({ topic: z.string(), notes: z.string().optional() }))
      .optional(),
    decisions: z
      .array(
        z.object({ description: z.string(), outcome: z.string().optional() }),
      )
      .optional(),
    openedAt: z.string().optional(),
    closedAt: z.string().optional(),
    guestsPresent: z.number().int().nonnegative().optional(),
    treasuryReport: z
      .object({
        openingBalance: z.number().optional(),
        income: z.number().optional(),
        expenses: z.number().optional(),
        closingBalance: z.number().optional(),
      })
      .optional(),
    nextMeetingDate: z.string().optional(),
    nextMeetingLocation: z.string().optional(),
    announcements: z.string().optional(),
  }),
});
```

Read the actual current shape of `agendaItems`/`decisions`/`treasuryReport` entries in the file before finalizing the nested schemas above — the plan's research captured the top-level field names from the destination `minutesPayload` object but not necessarily every nested key each array/object entry uses; adjust the inner `z.object({...})` shapes to match reality exactly, since a too-strict nested schema would silently strip legitimate fields via Zod's default stripping behavior. Call `const validated = validateData(meetingMinutesSchema, request.data);` and build `minutesPayload` from `validated.minutes.*` instead of `data.minutes.*`.

- [ ] **Step 5: `initiateAdminRemoval.ts` — validate `targetAdminName` and `reason`**

Read the file first (current `requestRef.set({...})` call is at approximately line 99). Add:

```typescript
import { z } from "zod";
import { validateData } from "../utils/callableWrapper";

const initiateAdminRemovalSchema = z.object({
  groupId: z.string().min(1),
  targetAdminId: z.string().min(1),
  targetAdminName: z.string().min(1).max(200),
  reason: z.string().min(1).max(1000),
});
```

Call `const validated = validateData(initiateAdminRemovalSchema, request.data);` and use `validated.targetAdminName`, `validated.reason.trim()` in place of the current raw `data.targetAdminName` / `data.reason.trim()`. Keep the existing pending-request dedupe query and membership/admin-array checks exactly as-is — those are business logic, not input-shape validation.

- [ ] **Step 6: `initiateTreasurerHandoff.ts` — validate `message`**

Read the file first (current usage is `const { groupId, toUserId, message } = data;` at approximately line 38). Add:

```typescript
import { z } from "zod";
import { validateData } from "../utils/callableWrapper";

const initiateTreasurerHandoffSchema = z.object({
  groupId: z.string().min(1),
  toUserId: z.string().min(1),
  message: z.string().max(1000).optional(),
});
```

Call `const validated = validateData(initiateTreasurerHandoffSchema, request.data);` and destructure `const { groupId, toUserId, message } = validated;` in place of the current unvalidated destructure from `data`. This closes the gap where `message` currently has zero type or length validation before being written into `pendingTreasurerHandoff.message`.

- [ ] **Step 7: `submitBranding.ts` — replace the ad-hoc hex-regex/length checks with a schema**

Read the file first (current manual checks are at approximately lines 28-47, `HEX_COLOR_REGEX` is defined at line 21). Add:

```typescript
import { z } from "zod";
import { validateData } from "../utils/callableWrapper";

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

const submitBrandingSchema = z.object({
  intergroupId: z.string().min(1),
  orgName: z.string().min(1),
  primaryColor: z.string().regex(HEX_COLOR_REGEX, "Must be a valid hex color"),
  accentColor: z.string().regex(HEX_COLOR_REGEX, "Must be a valid hex color"),
  backgroundColor: z
    .string()
    .regex(HEX_COLOR_REGEX, "Must be a valid hex color")
    .optional(),
  headerTextColor: z
    .string()
    .regex(HEX_COLOR_REGEX, "Must be a valid hex color")
    .optional(),
  welcomeMessage: z.string().max(140).optional(),
  logoUrl: z.string().url().optional(),
});
```

Call `const validated = validateData(submitBrandingSchema, request.data);` immediately, then delete the now-redundant manual `if (!HEX_COLOR_REGEX.test(...))` / `if (welcomeMessage && welcomeMessage.length > 140)` checks that follow (the schema now enforces the same constraints, with clearer aggregated error messages from `validateData`'s `HttpsError`). Keep the existing `HEX_COLOR_REGEX` constant if it's used elsewhere in the file; otherwise it can be inlined into the schema definition instead of kept as a separate module-level constant — read the file to confirm before deciding.

- [ ] **Step 8: `sendIntergroupAnnouncement.ts` — validate `title`/`content`**

Read the file first (current destructure is `const { intergroupId, title, content, targetGroupIds } = request.data;` at approximately line 22). Add:

```typescript
import { z } from "zod";
import { validateData } from "../utils/callableWrapper";

const sendIntergroupAnnouncementSchema = z.object({
  intergroupId: z.string().min(1),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(2000),
  targetGroupIds: z.array(z.string()).optional(),
});
```

Call `const validated = validateData(sendIntergroupAnnouncementSchema, request.data);` and destructure from `validated` instead of `request.data`. This adds length caps that don't currently exist (only a truthy check today).

- [ ] **Step 9: `notifyAdminUpgradeRequest.ts` — validate `featureName`**

Read the file first (current destructure is `const { groupId, featureName } = request.data;` at approximately line 20). Add:

```typescript
import { z } from "zod";
import { validateData } from "../utils/callableWrapper";

const notifyAdminUpgradeRequestSchema = z.object({
  groupId: z.string().min(1),
  featureName: z.string().min(1).max(100),
});
```

Call `const validated = validateData(notifyAdminUpgradeRequestSchema, request.data);` and destructure from `validated`. Keep the existing rate-limit logic untouched.

- [ ] **Step 10: `grantSponsorStepAccess.ts` — validate `sponsorId`/`allow`**

Read the file first (current destructure is `const { sponsorId, allow } = request.data;` at approximately line 32). Add:

```typescript
import { z } from "zod";
import { validateData } from "../utils/callableWrapper";

const grantSponsorStepAccessSchema = z.object({
  sponsorId: z.string().min(1),
  allow: z.boolean(),
});
```

Call `const validated = validateData(grantSponsorStepAccessSchema, request.data);` and destructure `const { sponsorId, allow } = validated;` in place of the current manual `if (!sponsorId) throw ...` / `if (typeof allow !== "boolean") throw ...` checks (which can now be deleted — the schema enforces both). Keep the active-sponsorship-relationship query that follows exactly as-is.

- [ ] **Step 11: Typecheck**

Run: `cd functions && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 12: Run the full test suite**

Run: `cd functions && npm test -- --passWithNoTests --forceExit`
Expected: all suites green. If any existing test for these 10 files sends a payload missing a now-required field (e.g. a test omitting `reason` from a `banUser` call expecting a specific custom error), it will now fail with `validateData`'s `invalid-argument` error instead — this is the intended tightening; update the test's expected error message/code rather than loosening the schema, unless the test reveals the schema is wrong (in which case fix the schema, re-verify against the file's actual runtime contract, and note the discrepancy in the commit message).

- [ ] **Step 13: Commit**

```bash
cd /Users/marcusklein/dev/recovery-platform
git add homegroups/functions/src/callable/createIntergroup.ts homegroups/functions/src/callable/contributeLiterature.ts homegroups/functions/src/callable/banUser.ts homegroups/functions/src/callable/saveMeetingMinutes.ts homegroups/functions/src/callable/initiateAdminRemoval.ts homegroups/functions/src/callable/initiateTreasurerHandoff.ts homegroups/functions/src/callable/submitBranding.ts homegroups/functions/src/callable/sendIntergroupAnnouncement.ts homegroups/functions/src/callable/notifyAdminUpgradeRequest.ts homegroups/functions/src/callable/grantSponsorStepAccess.ts
git commit -m "feat(homegroups-functions): add Zod validateData schemas to 10 callables with unvalidated client-input passthrough"
```

(Include any test files updated in Step 12 in this commit too.)

---

## Task 8: Final Verification and Documentation

**Files:**

- Modify: `homegroups/functions/CLAUDE.md`

**Interfaces:** None — verification and one doc line.

- [ ] **Step 1: Full clean typecheck and test run**

```bash
cd /Users/marcusklein/dev/recovery-platform/homegroups/functions
npx tsc --noEmit
npm test -- --passWithNoTests --forceExit
```

Expected: both exit 0.

- [ ] **Step 2: Confirm the rollout's actual coverage**

```bash
cd /Users/marcusklein/dev/recovery-platform/homegroups/functions/src
grep -rl "requireAuth" callable --include="*.ts" | grep -v __tests__ | wc -l
```

Expected: `89` (88 files migrated across Tasks 1-6, plus `createGroupWithSubscription.ts`). Cross-check the two intentional exclusions:

```bash
grep -c "requireAuth" callable/getPublicGroupProfile.ts callable/submitPartnershipLead.ts
```

Expected: `0` for both (confirms neither was accidentally touched).

- [ ] **Step 3: Update `functions/CLAUDE.md`**

Find the "Architecture" section's callable count line (currently states "90 total" — will need re-verification against current count since this plan doesn't add/remove callables, only modifies auth internals) and add a short note after the existing callable/trigger description:

```markdown
### Callable auth/validation

All callables use the shared `requireAuth`/`validateData` wrapper from `src/utils/callableWrapper.ts` (rolled out in Wave 6) for the base "is there a signed-in caller" check and, where client input is written to Firestore, Zod schema validation. Group-admin, role, ownership, and custom-claim checks remain individual per-callable business logic — the wrapper does not attempt to unify those. `getPublicGroupProfile.ts` and `submitPartnershipLead.ts` are intentionally unauthenticated by design and do not use `requireAuth`.
```

Read the surrounding section first to match its existing heading level and tone before inserting.

- [ ] **Step 4: Commit**

```bash
cd /Users/marcusklein/dev/recovery-platform
git add homegroups/functions/CLAUDE.md
git commit -m "docs(homegroups-functions): document the completed callable auth-wrapper rollout"
```

---

## Deferred Work (explicitly out of scope for this wave)

The survey that informed this plan found several duplicated authorization patterns that are good candidates for their _own_ shared helper(s) in a future wave — do not attempt these as part of this plan:

- A `requireGroupAdmin(request, groupId)` helper to collapse the repeated `groupData.admins?.includes(uid)` / member-doc `isAdmin === true || roles.includes("admin")` checks duplicated across at least 15 callables.
- A `requireFacilityAdmin(request, intergroupId)` helper for the 3-callable facility-dashboard admin gate documented in `functions/CLAUDE.md`.
- A `requireIntergroupOwner(request, intergroupId)` helper for the owner-role check duplicated in `deaffiliateGroupFromIntergroup.ts` and `exportIntergroupData.ts`.
- Consolidating the near-duplicate `notifyGroupMembers` FCM-broadcast helper across `approveMeetingMinutes.ts`, `closeConscienceVote.ts`, `closeElection.ts`.
- Consolidating the near-duplicate Stripe account-fetch logic across `getStripeAccountDetails.ts`, `getStripeAccountInfo.ts`, `getStripeAccountMetrics.ts`.

These are refactors of _authorization_ and _duplication_, not the _authentication_ base-guard this wave targets — bundling them in would blur this wave's review surface and its "same mechanical change everywhere" safety property.
