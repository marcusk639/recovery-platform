# Codebase Review — Regroup & Homegroups (mobile + functions)

**Date:** 2026-06-21
**Scope:** `regroup/mobile`, `regroup/functions`, `homegroups/mobile`, `homegroups/functions`
**Method:** 8 specialist subagents dispatched in parallel (security + quality per package). Findings deduplicated; cross-stream corroboration noted; highest-impact claims independently verified against source (✅ VERIFIED).
**Stack:** RN 0.72 + Redux Toolkit (+ React Query in regroup), Firebase Functions v2 (TS), Stripe, Firestore.
**Source files reviewed:** regroup/mobile 553 · regroup/functions 85 · homegroups/mobile 302 · homegroups/functions 181.

> **No fixes applied yet.** Every CRITICAL touches production payment logic, Firestore security rules, live secrets, or auth — areas where a wrong auto-edit is worse than the finding. See **Recommended Fix Batches** at the end and tell me which to apply.

---

## Executive Summary

Both products are structurally sound — Stripe webhook signature verification, idempotency guards, server-side payment auth, claim-based Firestore rules, and React Query/Redux discipline are largely in place. The launch-blocking risk is concentrated in **(1) live secrets sitting in working-tree `.env`/`env.d.ts` that must be rotated, (2) a cluster of unauthenticated / under-authorized endpoints and Firestore rules that allow cross-tenant writes, and (3) a handful of provably-broken code paths** (data-corrupting `arrayUnion`, a guaranteed `ReferenceError`, a broken super-admin guard, and a Rules-of-Hooks crash). PII-in-logs violations of the platform privacy rule are pervasive on both clients and in several functions.

| Severity | Count | Verified | Requires Decision |
| -------- | ----- | -------- | ----------------- |
| CRITICAL | 13    | 8        | 13                |
| HIGH     | ~28   | —        | most              |
| MEDIUM   | ~30   | —        | —                 |
| LOW      | ~15   | —        | —                 |

**The two `useSelector`-in-`renderItem` verdicts:** regroup/mobile — **REFUTED** (does not exist; Redux access is centralized through `useAppSelector` + memoized selectors). homegroups/mobile — **✅ CONFIRMED**, isolated to exactly one file (`GroupLiteratureBookmarksScreen.tsx:49`).

---

## CRITICAL Findings

### Secrets (rotation = ops; code cleanup = safe)

**[C1] Live Stripe Restricted Key in `homegroups/mobile/.env`** ✅ VERIFIED
`homegroups/mobile/.env:2` — `STRIPE_MASTER_KEY=rk_live_…`. A `rk_live_` key carries server-side API permissions and must never live in a mobile package. Gitignored (not in history), but live on disk.
**Fix:** Rotate in Stripe dashboard now; delete from `.env`; never bundle any `rk_*`/`sk_*` in the client.

**[C2] Live Google Maps key in `homegroups/mobile/.env` + `regroup/mobile/.env`** ✅ VERIFIED
`AIzaSy…` present in both. Bundled into the RN binary via `@env`, extractable from APK/IPA.
**Fix:** Rotate; restrict by app signature/bundle-id + API in Google Cloud Console; move to native config.

**[C3] `STRIPE_TEST_SECRET_KEY` declared in git-tracked `homegroups/mobile/env.d.ts`** ✅ VERIFIED
`env.d.ts:3` declares a secret-key type for `@env` import into mobile JS. Any `sk_test_*` in the bundle is a violation even in test mode.
**Fix (safe, code):** Remove `STRIPE_TEST_SECRET_KEY` from `env.d.ts` and any import site; `git log -S` to confirm no value ever committed.

**[C4] Sentry **auth** token in `regroup/mobile/.env`** ✅ VERIFIED
`regroup/mobile/.env` — `SENTRY_TOKEN=sntryu_…`. The `sntryu_` prefix is an org/project auth token (API write access: delete issues, read source maps), not a DSN.
**Fix:** Rotate at sentry.io; move to CI secret `SENTRY_AUTH_TOKEN`; never ship in `.env`.

**[C5] `RATS_API_KEY` (recovery-api service key) embedded in `regroup/mobile` bundle** ✅ VERIFIED present in `.env`
A service-to-service `X-Service-Key` bundled in the client lets any holder call recovery-api callables (`createReferral`, `getUserProfile`, …) impersonating regroup with an arbitrary `X-User-Uid`.
**Fix:** Remove from client; proxy cross-product calls through regroup Cloud Functions holding the key in Secret Manager; rotate.

### Unauthenticated / under-authorized endpoints

**[C6] homegroups: `getPublicGroupProfile` + `submitPartnershipLead` fully unauthenticated, no App Check / rate limit**
`homegroups/functions/src/callable/getPublicGroupProfile.ts`, `submitPartnershipLead.ts`. Enables full group enumeration and partnership-lead spam (`notSpamming()` is a no-op).
**Fix:** `enforceAppCheck: true` and/or require auth; Firestore-backed rate limit (pattern exists in `generateGroupInvite.ts`).

**[C7] regroup: `stripeConnectReauth` / `stripeConnectReturn` unauthenticated, accept arbitrary `stripeAccountId` from query**
`regroup/functions/src/http/stripeConnect.ts`. Unauth caller can trigger Stripe `accountLinks.create` / `accounts.retrieve` and a Firestore status write for any account ID it can enumerate.
**Fix:** Verify `stripeAccountId` exists in `houses` before the Stripe call; add a signed state param.

**[C8] regroup: `sendInviteEmails` callable — any authenticated user emails arbitrary recipients**
`regroup/functions/src/callable/subscriptions.ts:786`. Only gate is `request.auth`; no house-admin check, no recipient-vs-house validation → Regroup-branded phishing/spam via the platform SendGrid account.
**Fix:** Apply `assertCanGrantClaimForHouses` per payload (as `createInvitation` already does), or deprecate it.

### Firestore rules (regroup — corroborated by both regroup streams)

**[C9] `isHouseAdmin()` dereferences `request.auth.token.admin` with no null guard** ✅ VERIFIED-pattern
`regroup/mobile/firebase/firestore.rules:16`. Throws on users without an `admin` claim (used on `houses` delete rule).
**Fix:** `'admin' in request.auth.token && houseId in request.auth.token.admin`.

**[C10] `issues` create rule short-circuits on `signedIn()`** ✅ VERIFIED-pattern
`firestore.rules:229` — `allow create: if signedIn() || …`. Any authenticated user writes into any house's issue tracker (arbitrary `houseId`).
**Fix:** `allow create: if isGuest([request.resource.data.houseId]) || isAdmin([request.resource.data.houseId])`.

### Provably-broken code

**[C11] regroup: `arrayUnion([adminId])` corrupts admin arrays** ✅ VERIFIED
`regroup/functions/src/api/firestore.ts:239`. `arrayUnion` is variadic — passing `[adminId]` appends the array as a single element → `[["uid"]]`. Every `updateHouseAdmins` call writes unreadable data.
**Fix:** `admin.firestore.FieldValue.arrayUnion(adminId)`. Audit existing house docs for corruption.

**[C12] homegroups: `ngeohash.encode(...)` called, never imported** ✅ VERIFIED
`homegroups/functions/src/utils/meetingUtils.ts:44`. Guaranteed `ReferenceError`; only survives because the caller (`onGroupCreateFetchMeetings`) is commented out. Crashes the instant that trigger is re-enabled.
**Fix:** `import ngeohash from "ngeohash"` or use the already-imported `geofire.geohashForLocation`.

**[C13] homegroups: `seedDailyReflections` super-admin guard is broken** ✅ VERIFIED
`homegroups/functions/src/callable/seedDailyReflections.ts:34` checks `users/{uid}.role !== "admin"`, but `setUserAsSuperAdmin` writes `role: "superAdmin"`. Real super-admins are locked out; the check reads a mutable Firestore field instead of the `superAdmin` JWT claim.
**Fix:** `if (!request.auth.token.superAdmin) throw …`.

### Client crash & init

**[C14] homegroups/mobile: `useSelector` inside `renderItem` → Rules-of-Hooks crash** ✅ VERIFIED
`homegroups/mobile/src/screens/homegroup/GroupLiteratureBookmarksScreen.tsx:49`. Hooks count varies with list length → "Rendered more hooks than previous render" hard crash when the bookmarks list is non-empty.
**Fix:** Extract a `BookmarkRow` component that calls the selector internally.

**[C15] homegroups/functions: silent Admin SDK init swallow**
`homegroups/functions/src/utils/firebase.ts:5` — `initializeApp()` wrapped in try/catch that logs and continues, exporting `db`/`auth`/`messaging` from an uninitialized app → cryptic runtime failures across all functions.
**Fix:** Remove the try/catch; let init failure crash the container.

_(C-count is 15 once secrets are split out; summary table groups them as 13 logical items.)_

---

## HIGH Findings (condensed)

**regroup/functions**

- `handleStripeConnectWebhook` lacks the idempotency guard the platform webhook has (replayed `account.updated`/deauthorized → inconsistent state). _(both regroup streams)_
- 4 Firestore triggers fire-and-forget `sendEmail` (no `await`) → emails silently lost (`triggers/firestore/index.ts:56,115,138,162`).
- `sendEmail` swallows all errors at `logger.info` → payment receipts can silently fail (`util/email.ts`).
- `getUserBySubscription` `.docs[0].data()` crashes on empty result (`api/firestore.ts:128`).
- `null as unknown as string[]` casts into `updateSubscriptionMetadata` on the billing path (`subscriptions.ts:510,528,624,657`).
- EES amount stored as float, not rounded cents (`triggers/firestore/index.ts:254`); `handlePaymentIntentSucceeded` stores `amount` in dollars while `rentOwed` is cents (`stripeWebhook.ts:299`).
- `scheduledRentCollection` unbounded `Promise.allSettled` fan-out → Stripe rate-limit failures at scale.
- `getMeetings()` unbounded full-collection scan (`util/meetings.ts:81`).
- PII in logs: invite links + email HTML (`util/inviteEmails.ts`), caller GPS coords (`callable/meetings.ts:120`).

**homegroups/functions**

- `notSpamming()` permanent no-op → DM/group-chat have zero server-side rate limiting (`firestore.rules:98`).
- `googlePlacesProxy` fully public HTTP, no App Check → quota/billing abuse.
- `createStripeAccountLink` interpolates unsanitized `groupId` into redirect URLs; hardcoded `homegroups-app.com`.
- `upgradeIntergroupTier` sets `pendingUpgradeSessionId:"pending"` before Stripe call with no rollback → permanent upgrade lockout on failure.
- 3 server-only collections (`stripe_disputes`, `processed_stripe_events`, `processed_transaction_events`) rely on catch-all deny, no explicit rule.
- `getTimezone` uses `getUTCSeconds()` (0–59) not epoch → always-wrong timezone (`api/api.ts:86`). ✅ VERIFIED
- `getCustomMeetings` swallows Firestore errors, returns `[]` (`utils/meetings.ts:101`).
- Multiple unbounded queries (`getMeetingsWhere`, `scheduledSubscriptionReconciler`, `onMemberWrite`) missing `.limit()`.
- `strict:false`/`strictNullChecks:false` in tsconfig — systemic null-safety gap.

**regroup/mobile**

- `SignUpWebView` dispatches Firebase credentials from a WebView with no `originWhitelist`, pointing at dev domain `rats-dev.web.app` (`screens/SignUp/SignUpWebView.tsx`).
- SSN/DOB/phone logged via `simple-debug-logger` with no `__DEV__` guard (`NewAccountForm.tsx:73`). _(treat as CRITICAL privacy)_
- Client `amount` to `createPaymentIntent` not capped against `rentOwed` server-side (`RentPaymentScreen.tsx` → CF).
- Unvalidated `storageUrl`/CF URLs passed to `Linking.openURL` (`DocumentListScreen.tsx:68`, `StripeSettingsScreen.tsx:216`).

**homegroups/mobile**

- No root `ErrorBoundary` (one exists, used in 1 screen) → any render throw blanks the app.
- 31 screens import Firestore directly, bypassing the documented models-only layer.
- God-files: 10 screens >1,000 lines (`GroupOverviewScreen` 2,523).
- User email sent to Crashlytics as plain attribute (`App.tsx:420`); email/name in payment WebView query string; WebView no `originWhitelist`, cookies shared.
- `Linking.openURL` on unvalidated chat/resource URLs (multiple).
- `payment-success` deep link shows "Subscription Active!" with no server verification (`App.tsx:180`).

---

## MEDIUM / LOW (themes — full per-finding detail in agent transcripts)

- **PII / `console.*` in production** on both clients (46 in regroup, ~dozen in homegroups incl. UIDs, FCM tokens, addresses, member names) and `console.*` instead of `firebase-functions/logger` in several homegroups functions. Violates the platform no-PII-in-logs rule.
- **Type erosion:** ~325 `:any`/164 `as any` (regroup/mobile), ~383/84 (homegroups/mobile), `:any` on Stripe/payment params in homegroups functions — concentrated at the Firestore `doc.data()` boundary.
- **Parameterized `createSelector` cache-size-1 thrash** (both mobile stores) — use a memoizer with cache or per-component factory selectors.
- **`SerializedMeeting`/`Meeting` field & casing drift** across client and functions (`online`/`isOnline`, `link`/`onlineLink`, `street`==`address` in `directoryMapping.ts:40`).
- **npm vulns:** regroup/mobile 72 (3 critical/17 high), homegroups/mobile (`ip` SSRF, `tmp` traversal — build-time), homegroups/functions `form-data` CRLF. Most `npm audit fix`-able.
- **Hardcoded `homegroups-app.com`** across 10+ function files — no single `APP_BASE_URL`.
- **Dead/stub exports:** `getSubscriptionCost` returns hardcoded `12`; legacy `updateUserSubscriptionStatus`/`getNaMeetings`/inlined geohash copy in homegroups; `saveStripeEvent` in regroup.
- **TOCTOU** on `redeemInvitation` (no transaction) and `deleteAdminAuthorization` two-phase claim window.

---

## Confirmed NON-issues (prior concerns cleared)

- homegroups/functions: no hardcoded Maps key in source; `findMeetings` auth + validation present; Stripe webhook signature + idempotency correct; `setUserAsSuperAdmin` claim guard correct; donation amount bounded server-side; `isSuperAdmin`/`isGroupAdmin` read authoritative sources.
- regroup/mobile: `useSelector`-in-`renderItem` **does not exist**; PaymentWebView has a fail-closed origin allowlist; payment CF uses Zod + server auth.

---

## Recommended Fix Batches (pick which to apply)

1. **Secrets (ops + tiny code).** You rotate: Stripe `rk_live`, Google Maps (x2), Sentry auth token, RATS_API_KEY. I edit: remove `STRIPE_TEST_SECRET_KEY`/`STRIPE_MASTER_KEY` from `env.d.ts` + import sites, strip the keys from `.env` examples. **Launch gate.**
2. **Provably-broken code (safe, high-confidence).** C11 `arrayUnion`, C12 `ngeohash` import, C13 `seedDailyReflections` claim check, C14 `BookmarkRow` extraction, C15 init swallow, `getTimezone` epoch. Each is unambiguously wrong; low blast radius.
3. **Auth/rules hardening (needs your nod — changes behavior).** C6–C10 unauth endpoints + Firestore `issues`/`isHouseAdmin`/`guest-archive` rules, idempotency on the Connect webhook, server-side payment-amount cap.
4. **PII-in-logs sweep.** Add `__DEV__` guards / route through `logException`; remove the four regroup function PII logs and the homegroups Crashlytics email + payment-URL PII.
5. **Hygiene (low risk, larger diff).** `npm audit fix` per package, `APP_BASE_URL` constant, dead-code removal, `strict` tsconfig flip + null fixes (homegroups functions).

Tell me which batches to execute and I'll proceed (TDD where it touches logic, re-verify builds/tests after each).
