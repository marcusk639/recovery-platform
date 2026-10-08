# Codebase Review

**Date:** 2026-05-31
**Scope:** Full monorepo — all products
**Stack detected:** React Native 0.72 (homegroups/mobile, regroup/mobile), Next.js 15 / React 19 (detox-recovery), Hono.js (recovery-api), Angular 9 (regroup/web), Firebase Cloud Functions v1 (homegroups/functions, regroup/functions)
**Source files reviewed:** ~1,920 (homegroups/mobile 309, homegroups/functions 232, homegroups/web 38, regroup/mobile 856, regroup/functions 114, regroup/web 314, detox-recovery 51, recovery-api 6)
**Docs reviewed:** 6 CLAUDE.md files, FUNCTION_AUDIT.md, architecture docs, firebase.json, firestore.rules (both products)

---

## Executive Summary

The platform's core data-isolation invariant is intact — no cross-product Firestore imports were found. detox-recovery is the healthiest product with exemplary TypeScript, a correctly abstracted security pipeline, and clean architecture. The most serious issues are concentrated in three places: (1) **regroup's auth callable functions** expose four privilege-escalation vectors that any authenticated user can exploit; (2) **regroup's Firestore rules** expose the `houses` and `admins` collections to all signed-in users; (3) **recovery-api's referral route** hardcodes the wrong `fromApp` and collapses all service-caller identity to `"system"`, corrupting the platform's one cross-product data path. Additionally, a Google Maps API key is hardcoded in committed source. On the code-quality front, 20+ homegroups/mobile screens bypass the documented model/thunk architecture, and regroup/web carries EOL dependencies that cannot be deployed to any current Firebase project.

| Severity | Count | Auto-fixed | Requires Decision |
| -------- | ----- | ---------- | ----------------- |
| CRITICAL | 8     | 0          | 8                 |
| HIGH     | 22    | 0          | 22                |
| MEDIUM   | 26    | 0          | 10                |
| LOW      | 15    | 0          | 3                 |
| Docs gap | 8     | 0          | 8                 |

---

## Priority 1: Docs vs Code Discrepancies

### Requires Human Decision

| Finding                            | Doc says                                                                                     | Code does                                                                                                                                                     | Recommendation                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| regroup calls homegroups directly  | "Cross-product flows via recovery-api only"                                                  | `regroup/functions/src/callable/homegroups.ts` makes direct HTTP calls to `https://us-central1-recovery-connect-prod.cloudfunctions.net/getMeetingAttendance` | Route through recovery-api, or explicitly document as an approved exception                |
| `fromApp` identity                 | Docs imply any ecosystem app can POST /api/referrals                                         | Code hardcodes `fromApp: "detox-recovery"` for every caller                                                                                                   | Fix the code (see CRITICAL C5)                                                             |
| homegroups/CLAUDE.md trigger count | "16 active + 1 commented out"                                                                | 17 active + 2 commented out                                                                                                                                   | Update doc: "17 active + 2 commented out (onGroupAdminUpdate, onGroupCreateFetchMeetings)" |
| API endpoint list                  | "POST /api/referrals, GET /api/referrals, GET /api/users/me, PUT /api/users/me"              | `GET /api/referrals/:id` also exists                                                                                                                          | Add to docs                                                                                |
| GET /api/referrals scope           | "list referrals" (implies all)                                                               | Filters `referredBy == uid` — user sees only their own                                                                                                        | Clarify: "list referrals submitted by the authenticated user"                              |
| API service name                   | Three names: `recovery-api` (dir), `recovery-shared-api` (logs/docs), `SHARED_API_URL` (env) | All refer to same service                                                                                                                                     | Standardize on `recovery-api`; rename env var to `RECOVERY_API_URL`                        |
| regroup/FUNCTION_AUDIT.md          | References `/Users/marcusklein/dev/rats-v2`                                                  | Codebase is now at `regroup/mobile/`                                                                                                                          | Mark as stale; re-audit against current location                                           |
| homegroups HTTP function count     | "2 HTTP functions"                                                                           | 3 exported: stripeWebhook, stripeConnectWebhook, getMeetingAttendance                                                                                         | Update to "3 HTTP functions"                                                               |

---

## CRITICAL Findings

### [C1] `deleteAdminAuthorization` — any authenticated user can strip admin claims from anyone

**Domain:** Security — Authorization
**File:** `regroup/functions/src/callable/auth.ts:158-178`
**Issue:** Verifies only that the caller is signed in, then strips admin/superAdmin claims from the target user with no check that the caller is an admin of the affected houses. Any resident can silently revoke another user's admin access across the entire platform.
**Evidence:**

```typescript
export const deleteAdminAuthorization = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required");
  // no assertCanGrantClaimForHouses or privilege check
  await deleteClaim(admin.userId, adminHouseIds, "admin");
  await auth().setCustomUserClaims(admin.userId, { ...userClaims });
```

**Fix needed:** Add `await assertCanGrantClaimForHouses(request.auth.uid, [...adminHouseIds, ...superAdminHouseIds])` as the first statement, matching the pattern already used in `addAdminAuthorization`.
**Confidence:** 97

---

### [C2] `promoteGuestsToAdmin` — any authenticated user can promote anyone to admin

**Domain:** Security — Authorization
**File:** `regroup/functions/src/callable/auth.ts:180-200`
**Issue:** Same missing auth check. Any Firebase-authenticated user (including regular residents) can grant admin claims for any house to any user, including themselves.
**Evidence:**

```typescript
export const promoteGuestsToAdmin = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required");
  // no house admin verification
  const claims = await createClaims(user.uid, [guest.houseId], "admin", false);
  return auth().setCustomUserClaims(user.uid, claims);
```

**Fix needed:** Call `assertCanGrantClaimForHouses` for every `guest.houseId` before processing.
**Confidence:** 97

---

### [C3] `removePrivilegesForGuests` — any authenticated user can revoke any resident's privileges

**Domain:** Security — Authorization
**File:** `regroup/functions/src/callable/auth.ts:202-222`
**Issue:** Third function in the same file with the same missing authorization check. Combined with C1, an adversary with any valid Firebase account can systematically revoke all admin access across the regroup platform.
**Fix needed:** Add `assertCanGrantClaimForHouses` before modifying any claims.
**Confidence:** 97

---

### [C4] `givePotentialSuperAdminPrivilege` — any user can self-grant a privileged JWT claim

**Domain:** Security — Privilege Escalation
**File:** `regroup/functions/src/callable/auth.ts:232-240`
**Issue:** Sets `potentialSuperAdmin: true` on the caller's own JWT claims with no privilege check. The claim is consumed by `createClaims()` in the auth pipeline.
**Evidence:**

```typescript
export const givePotentialSuperAdminPrivilege = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required");
  return auth().setCustomUserClaims(request.auth.uid, {
    ...current,
    potentialSuperAdmin: true, // self-granted, no guard
  });
});
```

**Fix needed:** Either remove this callable, or require the caller to already hold `superAdmin` claim.
**Confidence:** 88

---

### [C5] `fromApp` hardcoded as `"detox-recovery"` for all callers in recovery-api

**Domain:** Architecture — Data Integrity
**File:** `recovery-api/src/routes/referrals.ts:27`
**Issue:** Every referral created through `POST /api/referrals` — by any product, by any user — is stored with `fromApp: "detox-recovery"`, regardless of which app submitted it. This corrupts provenance of every cross-product referral. Confirmed independently by 3 separate agents.
**Evidence:**

```typescript
const ref = await db.collection("referrals").add({
  fromApp: "detox-recovery", // hardcoded, always wrong for service callers
  referredBy: uid,
  ...body,
});
```

**Fix needed:** Accept `fromApp` in the request body validated against a typed enum. Never hardcode.
**Confidence:** 95

---

### [C6] Google Maps API key hardcoded in committed source

**Domain:** Security — Secret Exposure
**File:** `homegroups/functions/src/api/api.ts:10`
**Issue:** `const API_KEY = "AIza<redacted-this-key-needs-rotating>"` is a literal string in committed TypeScript source. Maps API keys have per-project billing quotas and can be abused for unauthorized geocoding usage.
**Fix needed:** Move to `process.env.GOOGLE_MAPS_API_KEY`, provision via Firebase Secret Manager. If the key was ever pushed to a remote, rotate it immediately.
**Confidence:** 98

---

### [C7] regroup `admins` collection — world-readable to all signed-in users

**Domain:** Security — Firestore Rules
**File:** `regroup/mobile/firebase/firestore.rules:96`
**Issue:** Any Firebase-authenticated user can read every admin document, revealing which users administer which sober living houses. For a vulnerable population, this creates safety risks. The comment in the file acknowledges the issue.
**Evidence:**

```
match /admins/{adminId} {
  allow read: if signedIn(); // need to adjust house search...
```

**Fix needed:** `allow read: if isAdmin(resource.data.houseIds) || isSameUser(adminId);`
**Confidence:** 99

---

### [C8] regroup `houses` collection — fully readable by any signed-in user

**Domain:** Security — Firestore Rules
**File:** `regroup/mobile/firebase/firestore.rules:153`
**Issue:** Every house document — including `stripeAccountId`, monthly rent, resident count, and admin UIDs — is visible to any Firebase-authenticated user, not just house members.
**Evidence:**

```
match /houses/{houseId} {
  allow read: if signedIn();
```

**Fix needed:** `allow read: if isGuestOrAdmin([houseId]);`
**Confidence:** 98

---

## HIGH Findings

### [H1] `isHouseAdmin()` rule crashes if `admin` claim is absent

**File:** `regroup/mobile/firebase/firestore.rules:16-18`
`houseId in request.auth.token.admin` throws when `admin` claim is absent (null dereference). Fix: `return 'admin' in request.auth.token && houseId in request.auth.token.admin;`
**Confidence:** 95

---

### [H2] Balance decrement race condition — read-modify-write without transaction

**File:** `regroup/functions/src/webhooks/stripeWebhook.ts:326-336`
Non-atomic read/compute/write on guest balance. Concurrent Stripe event delivery (at-least-once) can double-decrement the balance. Fix: Wrap in `runTransaction` or use `FieldValue.increment(-amountCents)`.
**Confidence:** 85

---

### [H3] In-memory rate limiter ineffective across Cloud Run instances

**File:** `detox-recovery/lib/abuse-protection.ts:34`
`rateLimitState = new Map()` is instance-local. Requests routed to different Cloud Run instances bypass the rate limit. Fix: Distributed rate limiter (Upstash Redis, Firebase RTDB, Cloud Armor).
**Confidence:** 95

---

### [H4] PII logged to Cloud Functions logs (2 locations in regroup)

**Files:** `regroup/functions/src/callable/subscriptions.ts:289`, `regroup/functions/src/callable/auth.ts:54`
Full `User` and `Guest` objects (name, email, phone) passed to `logger.info()`. Fix: Log only `{ userId: user.id }` and `{ userId: guest.userId, houseId: guest.houseId }`.
**Confidence:** 90–95

---

### [H5] Guest balance stored as float dollars — floating-point arithmetic on financial data

**File:** `regroup/functions/src/webhooks/stripeWebhook.ts:311-335`
`paymentIntent.amount / 100` converts to float, then `currentBalance - amountDollars` applies float arithmetic. IEEE 754 rounding errors accumulate. Fix: Store balance as integer cents throughout; convert to dollars only at display boundary.
**Confidence:** 90

---

### [H6] `@ts-ignore` on Stripe customer retrieve — runtime crash on deleted customer

**File:** `regroup/functions/src/callable/payments.ts:288-293`
`stripe.customers.retrieve()` returns `Customer | DeletedCustomer`. The `@ts-ignore` suppresses the union, allowing `.invoice_settings` access on a deleted customer (which has no `invoice_settings`), throwing at runtime. Fix: `if ('deleted' in customer && customer.deleted) { throw new HttpsError('not-found', 'Customer deleted'); }`
**Confidence:** 95

---

### [H7] `paymentIntentParams: any` on live payment creation path

**File:** `homegroups/functions/src/callable/createStripePaymentIntent.ts:81`
Object typed as `any` fed directly to `stripe.paymentIntents.create()`. A misspelled field silently reaches Stripe. Fix: Type as `Stripe.PaymentIntentCreateParams`.
**Confidence:** 95

---

### [H8] `null as unknown as string[]` double-cast — runtime crash on array operations

**File:** `regroup/functions/src/callable/subscriptions.ts:330,348,395,428`
`updateSubscriptionMetadata` expects `string[]` but callers pass `null` via double-cast. Any `.map()`, `.filter()`, or `.length` inside the function throws. Fix: Change parameter type to `string[] | null` or pass `[]`.
**Confidence:** 85

---

### [H9] 26 homegroups/mobile screens bypass the model/thunk architecture with direct Firestore calls

**Files:** `GroupChatScreen.tsx`, `ElectionDetailScreen.tsx`, `ConversationsListScreen.tsx`, `DirectMessageScreen.tsx`, `SponsorChatScreen.tsx`, `TreasuryTrendsScreen.tsx`, `GroupPhoneListScreen.tsx`, `TermsDashboardScreen.tsx`, `MinutesArchiveScreen.tsx`, `EditMeetingMinutesScreen.tsx`, `EditMeetingInstanceScreen.tsx`, `GroupElectionsScreen.tsx`, `GroupConscienceScreen.tsx`, `TreasurerHandoffScreen.tsx`, `IntergroupReportHistoryScreen.tsx`, `GroupAnnouncementDetailsScreen.tsx`, `ProfileScreen.tsx`, `IntergroupReportScreen.tsx`, `MeetingTopicsScreen.tsx`, `GroupOverviewScreen.tsx`, `PendingAdminRequestsSection.tsx`, `InviteShareSheet.tsx`
CLAUDE.md says "All direct Firestore reads/writes go through [models]." These screens call `firestore().collection()` directly. Fix: Route through model layer and dispatch via `createAsyncThunk`. Consider ESLint rule banning `@react-native-firebase/firestore` imports under `src/screens/`.
**Confidence:** 99

---

### [H10] `auth().currentUser` used in regroup — violates documented singleton rule

**Files:** `regroup/mobile/src/screens/Personal/TwoFactorSetup.tsx:31`, `regroup/mobile/src/services/users.tsx:57,102,106`
regroup CLAUDE.md: "Firebase auth singleton — `auth.currentUser` (not `auth().currentUser`)." Fix: Import the pre-initialized singleton from `firebase-setup.ts`.
**Confidence:** 98

---

### [H11] regroup directly calls homegroups Cloud Functions — bypasses recovery-api isolation rule

**File:** `regroup/functions/src/callable/homegroups.ts`
Direct HTTP call to `https://us-central1-recovery-connect-prod.cloudfunctions.net/getMeetingAttendance`. Contradicts the "cross-product flows via recovery-api only" invariant. Fix: Route through recovery-api, or document as an approved exception.
**Confidence:** 95

---

### [H12] All service-to-service callers share `uid='system'` — cross-product referral PII exposure

**Files:** `recovery-api/src/routes/referrals.ts`, `recovery-api/src/middleware/auth.ts`
Any service-key holder can read ALL referrals from all other service-key callers (all share `'system'` uid). Fix: Assign per-app service identities; scope referral reads by `fromApp`/`toApp`.
**Confidence:** 80

---

### [H13] Stale closure: `markNewMessagesAsRead` missing from real-time listener dep array

**File:** `homegroups/mobile/src/screens/homegroup/GroupChatScreen.tsx:285`
Listener closes over `markNewMessagesAsRead` (which references `currentUser`) without including it in the `useEffect` dep array. Fix: Add `markNewMessagesAsRead` to the dep array.
**Confidence:** 95

---

### [H14] `GroupListScreen` useEffect reads reactive values with empty dep array

**File:** `homegroups/mobile/src/screens/homegroup/GroupListScreen.tsx:63`
`useEffect(() => { if (status === 'idle' ...) loadData(); }, [])` — `status` and `groups` are reactive but the effect never re-runs. Fix: Include `[status, groups.length]` in dep array.
**Confidence:** 90

---

### [H15] `banUser` callable logs free-text ban reason to Cloud Functions logs (PII risk)

**File:** `homegroups/functions/src/callable/banUser.ts:132-137`
`reason: data.reason` in `logger.info()` — reason is free text that may contain member names or health data. Fix: Remove `reason` from the log call.
**Confidence:** 88

---

### [H16] `deleteUserAccount` runs unbounded collectionGroup queries — timeout risk

**File:** `homegroups/functions/src/callable/deleteUserAccount.ts:142-144,224-226`
`collectionGroup('messages').where(...).get()` and `collectionGroup('transactions').where(...).get()` with no `.limit()`. Fix: Paginated cursor batches with `.limit(500)`; explicit `timeoutSeconds` override.
**Confidence:** 90

---

### [H17] All audit timestamps in regroup webhook use `new Date().toISOString()` instead of `FieldValue.serverTimestamp()`

**File:** `regroup/functions/src/webhooks/stripeWebhook.ts` (lines 579, 651, 652, 721, 722, 792, 793, 863, 929)
Client-generated timestamps have clock skew risk and produce non-queryable string fields. homegroups webhook already does this correctly. Fix: Replace with `admin.firestore.FieldValue.serverTimestamp()`.
**Confidence:** 97

---

### [H18] regroup/web targets Node 10 (EOL) — cannot be deployed to Firebase

**File:** `regroup/web/functions/package.json`
`"engines": { "node": "10" }` with `firebase-admin ^8.9.0` and `firebase-functions ^3.3.0`. Node 10 is end-of-life and unsupported by Firebase Cloud Functions. Fix: Upgrade to Node 18/22, `firebase-admin ^13.x`, `firebase-functions ^7.x`.
**Confidence:** 99

---

### [H19] `homegroups/functions` firebase-admin v11 — two major versions behind, no security patches

**File:** `homegroups/functions/package.json`
`"firebase-admin": "^11.11.1"` vs current v13.x. Fix: Upgrade to `^13.x`.
**Confidence:** 95

---

### [H20] axios v0.19 in regroup — known CSRF/SSRF CVEs

**Files:** `regroup/functions/package.json`, `regroup/web/functions/package.json`
axios 0.19.x has documented CVEs fixed in 1.x. Fix: Upgrade to `axios ^1.9.0`.
**Confidence:** 97

---

### [H21] Angular 9 + Firebase SDK v7 in regroup/web — both end-of-life

**File:** `regroup/web/package.json`
`@angular/core: ~9.1.0` (EOL 2021), `firebase: ^7.14.2` (unmaintained). Both have unpatched vulnerabilities. Fix: Plan upgrade path. At minimum upgrade Firebase SDK to v9+ as first step.
**Confidence:** 99

---

### [H22] `firebase-functions-test v0.2.0` incompatible with `firebase-functions v7`

**File:** `homegroups/functions/package.json`
v0.2.x test harness was designed for firebase-functions v3.x; does not support the v2 callable API. Fix: Upgrade to `firebase-functions-test ^3.x`.
**Confidence:** 99

---

## MEDIUM Findings

### [M1] regroup `bugs` and `feedback` — world-readable/writable to all signed-in users

**File:** `regroup/mobile/firebase/firestore.rules:148-149,250-251`
Fix: `allow read, write: if isGuestOrAdmin([resource.data.houseId]);`

### [M2] regroup `issues` — any signed-in user can create for any house

**File:** `regroup/mobile/firebase/firestore.rules:228-233`
`allow create: if signedIn() || ...` short-circuits the membership check. Fix: `allow create: if isGuestOrAdmin([request.resource.data.houseId]);`

### [M3] homegroups `meetings` and `meetingInstances` — unauthenticated read enabled

**File:** `homegroups/firestore.rules:288,305`
`allow read: if true` permits unauthenticated scraping. Meeting attendance is health-adjacent data. Fix: `allow read: if request.auth != null || resource.data.isPublic == true;`

### [M4] Oversized screen components mixing concerns

**Files:** `GroupTreasuryScreen.tsx` (800+ lines), `GroupChatScreen.tsx` (670+ lines)
Extract data orchestration into custom hooks; split modals into dedicated components.

### [M5] Module-level `Dimensions.get` across 16+ screens — stale on orientation/split-screen

**Files:** 10+ homegroups screens, 6 regroup screens including `BaseChat.tsx`
Replace with `useWindowDimensions()` hook inside the component body.

### [M6] `FlatList` nested inside `ScrollView` in `GroupListScreen` — virtualization disabled

**File:** `homegroups/mobile/src/screens/homegroup/GroupListScreen.tsx:287`
Replace outer ScrollView with a FlatList using `ListHeaderComponent`.

### [M7] regroup DataContext selects full user/guest/admin objects — all-consumer re-renders

**File:** `regroup/mobile/src/context/DataContext.tsx:76`
Use `createSelector` to derive a stable shape; select only needed fields per consumer.

### [M8] `key={index}` in 9+ dynamic list renders (homegroups/mobile)

**Files:** `GroupOverviewScreen.tsx`, `SecretaryToolkitScreen.tsx`, `OnboardingSlide.tsx`, `CreateConscienceVoteScreen.tsx`, `SubscriptionUpgradeScreen.tsx`, `GroupSponsorsScreen.tsx`, plus 3 others
Use stable unique identifiers from data items.

### [M9] Duplicated utility code across both Cloud Functions packages (`shared/` left empty)

**Files:** `homegroups/functions/src/utils/date.ts`, `regroup/functions/src/util/date.ts` (+ location, email, Stripe utils)
Publish as a workspace package from `shared/`. Start with `date.ts`.

### [M10] Git URL dependencies unpinned (supply chain risk)

**Files:** `regroup/functions/package.json` (`tabletojson`), `regroup/mobile/package.json` (`react-native-best-viewpager`)
Pin to specific commit SHAs.

### [M11] `@ts-ignore` on Stripe `apiVersion` in webhook handlers

**File:** `regroup/functions/src/webhooks/stripeWebhook.ts:952,1143`, `http/stripeConnect.ts:46,108`
Use `createStripeClient()` from `util/stripe.ts` consistently.

### [M12] Election nominees typed as `any[]` in 3 callables

**Files:** `castElectionVote.ts:79`, `nominateForElection.ts:94`, `closeElection.ts:102`
Define a `Nominee` interface; field typos become compile errors.

### [M13] `scheduledMilestoneReminders` and `scheduledInstanceGenerator` run unbounded collectionGroup queries

**Files:** `pubsub/scheduledMilestoneReminders.ts:16-20`, `scheduledInstanceGenerator.ts:17-41`
Add `.limit(500)` and implement cursor-based pagination.

### [M14] `recordMilestone` N+1 query — fetches each member's user doc in a loop

**File:** `homegroups/functions/src/callable/recordMilestone.ts:248-261`
Use `db.getAll(...refs)` batch read.

### [M15] Firebase Admin SDK init silently swallows initialization failures

**File:** `homegroups/functions/src/utils/firebase.ts:9-12`
Re-throw in the catch block — failed `initializeApp()` is unrecoverable.

### [M16] `tslint` (archived 2019) in use across all regroup packages

**Files:** `regroup/functions/package.json`, `regroup/web/package.json`, `regroup/web/functions/package.json`
Migrate to `eslint` with `@typescript-eslint/*`.

### [M17] `@types/moment-timezone` redundant in homegroups/functions

Remove — `moment-timezone` ships its own `.d.ts`.

### [M18] `@firebase/rules-unit-testing` in regroup/mobile production dependencies

Move to `devDependencies`.

### [M19] `@react-native-firebase` version gap: homegroups v18 vs regroup v17

Upgrade regroup/mobile to v18.x.

### [M20] detox-recovery error state communicated by color alone (a11y)

**Files:** `components/nav/NewsletterSignup.tsx`, `B2BLeadMagnet.tsx`
Add visible error icon or text prefix ("Error:") alongside red color.

### [M21] contact route `console.error` may echo submitted emails via Resend error object

**File:** `detox-recovery/app/api/contact/route.ts:147`
Log only `{ status, name }` not the full `reason` object.

### [M22] `Stripe apiVersion` non-null assertion silently passes `undefined` if env var missing

**File:** `regroup/functions/src/api/stripe.ts:12`
Add guard: `if (!process.env.STRIPE_API_VERSION) throw new Error('STRIPE_API_VERSION not set');`

### [M23] `GroupModel.getById` casts Firestore data as `any`

**File:** `homegroups/mobile/src/models/GroupModel.ts:210`
Change to `doc.data() as GroupDocument`.

### [M24] `getOnboardingStatus` in UserModel casts Firestore data as `any`

**File:** `homegroups/mobile/src/models/UserModel.ts:555`
Cast to `UserDocument` (already used elsewhere in the same class).

### [M25] Callable responses consumed without type guards in groupsSlice and dashboardSlice

**Files:** `homegroups/mobile/src/store/slices/groupsSlice.ts:154`, `dashboardSlice.ts:39,64`
Add a type cast or guard at callable response boundaries.

### [M26] `dynamic require()` inside async methods in GroupModel — types lost

**File:** `homegroups/mobile/src/models/GroupModel.ts:1340,1405`
Import `functions` from `@react-native-firebase/functions` at the top of the file.

---

## LOW Findings

| #   | File                                                                | Issue                                                                                    | Fix                                                                                    |
| --- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| L1  | homegroups/mobile (all 55+ screens)                                 | Zero `accessibilityLabel`/`accessibilityRole` on interactive elements                    | Add to all TouchableOpacity/Pressable; priority: send button, attach, reaction options |
| L2  | `detox-recovery/app/consulting/page.tsx:33`                         | Raw `<a href="/contact">` instead of Next.js `<Link>`                                    | Replace with `<Link href="/contact">`                                                  |
| L3  | `homegroups/web/package.json`                                       | `react-scripts` v5 (CRA deprecated)                                                      | Plan migration to Vite or Next.js                                                      |
| L4  | `regroup/functions/package.json`                                    | `x-ray` web-scraping library unmaintained since 2018                                     | Audit usage; migrate or vendor                                                         |
| L5  | `homegroups/mobile/package.json`                                    | Both `@react-native-community/clipboard` and `@react-native-clipboard/clipboard` present | Remove deprecated community package                                                    |
| L6  | `regroup/functions/package.json`                                    | Zod v4 while recovery-api uses v3 (breaking version mismatch)                            | Standardize on one version                                                             |
| L7  | `homegroups/mobile/src/store/slices/groupsSlice.ts:778`             | Untyped `.filter(Boolean)` — inferred as `(GroupEntity \| undefined)[]`                  | Use typed predicate: `.filter((g): g is GroupEntity => g !== undefined)`               |
| L8  | `homegroups/mobile/src/screens/homegroup/GroupMembersScreen.tsx:86` | `groupId` in `useMemo` dep array not used inside the memo                                | Remove `groupId` from dep array                                                        |
| L9  | `regroup/functions/src/util/location.ts:4,6`                        | Two `@ts-ignore` on unmaintained libraries                                               | Add local declaration files or use `@ts-expect-error` with reason                      |
| L10 | `regroup/mobile/src/context/DataContext.tsx`                        | Full user objects selected from Redux — needless re-renders                              | Select only required fields per consumer                                               |
| L11 | `homegroups/functions/src/utils/firebase.ts:8`                      | `console.log` in init                                                                    | Use `firebase-functions/logger`                                                        |
| L12 | `recovery-api/src/index.ts:24-26`                                   | `console.error(err)` logs full error — may include Firestore paths                       | Log only `err.message` via structured logger                                           |
| L13 | regroup/functions webhook/scheduled handlers                        | Stripe client instantiated per-request                                                   | Use `createStripeClient()` from `util/stripe.ts`                                       |
| L14 | `regroup/functions/src/scheduled/scheduledRentCollection.ts:65`     | Balance stored as float dollars, converted with `Math.round`                             | Root cause: store as integer cents                                                     |
| L15 | `homegroups/scripts/package.json`                                   | firebase-admin v11 in scripts                                                            | Upgrade to ^13.x                                                                       |

---

## Domain Summaries

### Security

Four callable functions in `regroup/functions/src/callable/auth.ts` have missing authorization checks — privilege escalation vectors exploitable by any authenticated user. Firestore rules for regroup expose `houses` and `admins` to all signed-in users, and `bugs`/`feedback`/`issues` without house scoping. The balance race condition in the webhook is exploitable under Stripe's at-least-once delivery. The in-memory rate limiter in detox-recovery provides no protection at Cloud Run scale. homegroups Firestore rules are generally well-structured — the main gap is unauthenticated access to `meetings` and `meetingInstances`.

### TypeScript

regroup/functions is most problematic: float arithmetic on financial data, `@ts-ignore` masking a real crash on deleted customers, `null as unknown as string[]` casts that break at runtime. homegroups/functions has `paymentIntentParams: any` on a live payment path. homegroups/mobile has widespread `any` casts at Firestore boundaries. **detox-recovery is exemplary** — no `any`, no `@ts-ignore`, proper error handling throughout.

### React / React Native

The 26 homegroups/mobile screens bypassing the model/thunk architecture is the largest single violation of the codebase's own documented conventions. Hook dependency errors in `GroupChatScreen` (stale closures, blanket lint-disables) and `GroupListScreen` (empty dep array on reactive values) are active bugs. Zero accessibility attributes across 55+ homegroups screens is a significant gap.

### State Management

Redux usage in homegroups is generally sound (entity adapters, `createAsyncThunk` uniformly). regroup's data-access architecture diverged from homegroups: most slices call services directly without thunks, and DataContext over-selects full objects causing broad re-render cascades.

### Firebase

homegroups/functions is structurally strong: Admin SDK initialized once, Stripe webhooks verify signatures, callables check `request.auth`, most use structured logging. Gaps: PII in `banUser` logs, unbounded queries in `deleteUserAccount`, `console.log` in the `onGroupCreate` trigger. regroup/functions has the `new Date()` vs `serverTimestamp` pattern throughout the webhook handler, and the Stripe client is re-instantiated per-request rather than at module level.

### Architecture & Quality

The cross-product data isolation invariant is intact — a significant positive. The recovery-api `fromApp` hardcode is the most impactful structural bug. `shared/` is empty despite clear candidates. The regroup direct call to homegroups Cloud Functions is an undocumented architecture exception. regroup/mobile (856 files) has diverged architecturally from homegroups in data-access patterns.

### Dependencies

regroup/web is most critical: Angular 9 (EOL 2021), Firebase SDK v7, functions targeting Node 10. Multiple packages carry known CVEs (axios v0.19), EOL versions (firebase-admin v8/v11), or incompatible test harnesses. Two git URL dependencies are unpinned to SHAs.

---

## Actions Taken

None auto-fixed (review-only pass).

- [ ] **Immediate — Security:** Fix `auth.ts` callables C1–C4 (privilege escalation)
- [ ] **Immediate — Security:** Fix Firestore rules C7, C8 (`houses`, `admins` world-readable)
- [ ] **Immediate — Security:** Rotate and remove Google Maps API key from `api.ts` (C6)
- [ ] **Immediate — Architecture:** Fix `fromApp` hardcode in `referrals.ts` (C5)
- [ ] **Requires decision:** regroup→homegroups direct call — route via recovery-api or document exception (H11)
- [ ] **Requires decision:** Shared `uid='system'` for service callers — design per-app identities (H12)
- [ ] **Requires plan:** regroup/web EOL upgrade path (H18, H21)
- [ ] **Docs:** Update homegroups/CLAUDE.md trigger count, add GET /api/referrals/:id, standardize API service name

---

## Recommended Next Steps

1. **This week — Security:** Fix the four `auth.ts` callables (C1–C4) — no design decisions needed, just add `assertCanGrantClaimForHouses`.
2. **This week — Security:** Fix regroup Firestore rules (C7, C8) — scope `houses` and `admins` reads to house members.
3. **This week — Secret:** Rotate and remove the Maps API key from `api.ts` (C6).
4. **This week — Data Integrity:** Fix `fromApp` hardcode in recovery-api (C5); decide on per-app service identities (H12).
5. **Next sprint — Financial:** Wrap regroup balance decrement in a Firestore transaction (H2); migrate balance storage to integer cents (H5); fix the `@ts-ignore` on deleted Stripe customer (H6).
6. **Next sprint — Dependencies:** Upgrade `homegroups/functions` firebase-admin to v13 (H19) and firebase-functions-test to v3 (H22); upgrade axios in regroup (H20); pin git URL dependencies (M10).
7. **Ongoing — Architecture:** Migrate homegroups screens out of direct Firestore access into the model layer (H9). Start with `GroupChatScreen` (highest complexity, most violations).
8. **Planning — Tech Debt:** Define the regroup/web EOL upgrade path; populate `shared/` with duplicated date/location utils as a workspace package; converge data-access patterns between homegroups and regroup mobile.
