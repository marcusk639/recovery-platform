# Regroup Codebase Review

**Date:** 2026-06-21
**Scope:** `regroup/` — mobile (RN), functions (Cloud Functions), web (Angular)
**Stack detected:** React Native 0.72 + RTK + React Query + Sentry/Crashlytics (mobile); firebase-functions ^7.2.5 (v2) + firebase-admin ^13.6 + Stripe ^20.3 + Zod ^4.4 (functions); Angular ~9.1 + TS ~3.8 + Angular Universal SSR (web)
**Source files reviewed:** ~506 mobile + ~85 functions + ~151 web (vendor bundles in `web/public/` excluded)
**Method:** 5 parallel specialist reviewers (security, functions TS/arch, mobile RN, web Angular, docs+deps) → deduplicated + cross-referenced.

---

## Executive Summary

The Regroup backend is functionally complete and its payment/auth happy-paths are sound (ownership verified on payments, Stripe platform webhook signature-verified + idempotent, no real secret keys in production source). But the review surfaced a cluster of **launch-relevant defects concentrated in three areas**: (1) a hardcoded **Stripe TEST key in the web app** that will silently process zero real payments in production, (2) several **Firestore security-rule gaps** that let any authenticated user read/write cross-house data, and (3) **silent error-swallowing** across email, activity-logging, and meeting paths that hides failures from users and Sentry. PII handling has one confirmed violation (now fixed) plus a production-unguarded mobile debug logger.

| Severity | Count | Auto-fixed | Requires Decision |
| -------- | ----- | ---------- | ----------------- |
| CRITICAL | 8     | 1          | 7                 |
| HIGH     | 19    | 0          | 19                |
| MEDIUM   | 21    | 0          | 21                |
| LOW      | 13    | 0          | 13                |
| Docs gap | 7     | 0          | 7                 |

**Verdict: BLOCK before launch** — the web Stripe key (revenue-blocking), the open redirect, and the cross-house Firestore rule gaps must be resolved.

---

## Cross-Confirmed Findings (flagged by ≥2 independent reviewers — highest confidence)

| Finding                                                                                          | Reviewers                       | Severity                                     |
| ------------------------------------------------------------------------------------------------ | ------------------------------- | -------------------------------------------- |
| GPS coordinates of recovery attendees logged in `meetings.ts`                                    | Security CRIT-3 + TS LOW-2      | CRITICAL → **FIXED**                         |
| `sendInviteEmails` — no authz **and** swallows all delivery failures                             | Security CRIT-1 + TS HIGH-5     | CRITICAL                                     |
| Multiple divergent Stripe client init paths; `STRIPE_API_VERSION` unset → `undefined` apiVersion | TS MED-1/LOW-1/LOW-4 + Docs 3.4 | HIGH                                         |
| Raw Stripe error messages returned to clients/HTTP                                               | TS CRIT-1 + Security MED-1      | HIGH                                         |
| Angular 9 / EOL web dependency stack                                                             | Web MED + Docs 3.1              | HIGH (risk, not blocker per launch decision) |

---

## CRITICAL Findings

### [C1] GPS coordinates of recovery attendees logged to Cloud Functions logs — **FIXED**

**Domain:** Security / PII · **File:** `functions/src/callable/meetings.ts:203` · **Confidence:** 98
`userIsAtMeeting` logged exact user + meeting GPS coordinates via `logger.info`. Precise location of a person in addiction recovery is PII and violates the platform "never log PII" rule.
**Fix applied:** Removed the coordinate log lines; replaced with a `logger.debug("Meeting proximity check", { distanceMeters })` that logs only the non-identifying computed distance.

### [C2] Web app ships a Stripe **TEST** publishable key — revenue-blocking

**Domain:** Security / Revenue · **File:** `web/src/app/app.module.ts:213` · **Confidence:** 99
`NgxStripeModule.forRoot("pk_test_PHY9XItnPuSWxhpixEkULA0o00DfMn6uns")` is hardcoded and bundled into prod. Real cards will not be charged via the web billing path.
**Fix needed:** Move to `environment.stripePublishableKey`; inject the live key from the CI build env (not committed). Cross-references the platform launch-readiness "verify `pk_live_`" item (I-5).

### [C3] Open redirect in deep-link handler

**Domain:** Security · **File:** `web/src/app/components/redirect/redirect.component.ts:204-218` · **Confidence:** 95
`?url=` is `decodeURIComponent`-ed and assigned to `window.location.href`/`window.open` with no validation — accepts any scheme/domain (`javascript:`, external phishing). Exploitable via any invite-email / SMS / push link.
**Fix needed:** Allowlist schemes (`regroup-app://`, `com.rats.dev://`) before acting; otherwise redirect to `/`.

### [C4] `sendConfirmationEmail` / `sendInviteEmails` — any authenticated user can send email to arbitrary addresses

**Domain:** Security / Abuse · **File:** `functions/src/callable/subscriptions.ts:786,838` · **Confidence:** 95
`sendConfirmationEmail` sends to a caller-controlled `email` with caller-controlled `name`/`link` and no check it matches `request.auth.token.email`. `sendInviteEmails` has no house-admin check. Abuses Regroup's SendGrid sender reputation; also swallows failures (see H-fns-5).
**Fix needed:** Enforce email-ownership on confirmation; require house-admin claims on invites (or route through `createInvitation`, which does enforce).

### [C5] `guest-archive` writable by any house member (residents can overwrite discharge/financial records)

**Domain:** Security / Firestore rules · **File:** `mobile/firebase/firestore.rules:261` · **Confidence:** 92
`allow write: if isGuestOrAdmin([request.resource.data.houseId])` lets a resident create/update/delete archived discharge records (sensitive recovery + financial data).
**Fix needed:** `allow write: if isAdmin(...)`; residents read-only at most.

### [C6] Fire-and-forget `sendEmail` in 4 Firestore triggers — silent email loss + unhandled rejections

**Domain:** Correctness / Error handling · **File:** `functions/src/triggers/firestore/index.ts:56,115,138,158` · **Confidence:** 98
`notifyNewHouseCreated`, `sendSubscriptionUpdateEmail`, `reportBug`, `submitFeedback` call `sendEmail(...)` with no `await`/`.catch`. Rejections are swallowed; the trigger reports success while the email is lost.
**Fix needed:** `await` (inside try/catch) or attach `.catch(err => logger.error(...))`.

### [C7] `getUserBySubscription` throws `TypeError` on no match instead of returning null

**Domain:** Correctness · **File:** `functions/src/api/firestore.ts:128-133` · **Confidence:** 97
`result.docs[0].data()` throws when empty. Called from legacy subscription-status webhook paths; masks real subscription state.
**Fix needed:** `if (result.empty) return null;` and handle null in callers.

### [C8] Mobile `DebugLogger` writes full user objects (SSN/DOB/phone per its own comment) to device storage + console in production

**Domain:** PII · **File:** `mobile/src/util/debug-logger.ts:16-49` · **Confidence:** 98
No `__DEV__` guard (unlike the sibling `SimpleDebugLogger`). Persists PII to `debug-logs.json` on-device and to console unconditionally. `logInfo/logWarn/logError/logDebug` are exported and name-collide with the guarded logger — any import of the wrong one leaks PII in prod.
**Fix needed:** Add `if (!__DEV__) return;` at top of `DebugLogger.log()`; gate/remove `saveToFile()`; consolidate the two debug loggers; route real errors through `logException` (Sentry).

---

## HIGH Findings

### Functions / Backend

- **[H-fns-1]** `scheduledRentCollection.ts:65` — `guest.rentOwed` read from Firestore and passed to Stripe without integer validation; a float (`149.5`) is rejected by Stripe. Wrap in `Math.round`/Zod. (conf 90)
- **[H-fns-2]** `api/firestore.ts:191` — `updateUser` uses `JSON.parse(JSON.stringify(values))`, silently converting `FieldValue.serverTimestamp()/increment()/delete()` to `{}` and `Date`→ISO string. Latent footgun. (conf 99)
- **[H-fns-3]** `payments.ts:697,748` — `stripeLastSyncAt: Date.now()` instead of `serverTimestamp()`; mixes `number` and `Timestamp` types across `houses` docs. (conf 85)
- **[H-fns-4]** `webhooks/stripeWebhook.ts:1130-1197` — Connect webhook handler has **no** idempotency check (platform webhook does). Apply `checkAndMarkEventProcessed`. (conf 95)
- **[H-fns-5]** `subscriptions.ts:822-832` — `sendInviteEmails` catch logs but does not re-throw; client sees success when all emails failed. Use `Promise.allSettled` + surface partial failure. (conf 96)
- **[H-fns-6]** `tsconfig.json:6` — `noUnusedLocals: false` weakens strict mode; enable and resolve. (conf 90)
- **[H-fns-7]** `subscriptions.ts:515-537` — any Stripe error (rate-limit/network) triggers the Firestore-only fallback, permanently diverging Firestore occupancy from Stripe billing. Gate fallback on `resource_missing` only. (conf 88)
- **[H-fns-8]** `api/firestore.ts:66` — `shapeHouses(docs: any[])` disables type-checking for the primary house-shaping path. Type as `QueryDocumentSnapshot[]`. (conf 95)
- **[H-fns-9]** `meetings.ts:165-168` — `findMeetings` catches all errors and returns `[]`; backend failures look like "no results." Re-throw as `HttpsError`. (conf 92)

### Security / Firestore rules

- **[H-sec-1]** `payments.ts:58,499` — `connectStripeAccount` `returnUrl`/`refreshUrl` have **no origin allowlist** (only blocks `javascript:`), unlike the billing portal. Open redirect on a sensitive Stripe onboarding link. Reuse `ALLOWED_PORTAL_RETURN_ORIGINS`. (conf 88)
- **[H-sec-2]** `firestore.rules:224,235` — `complaints`/`disputes` write rules key on client-controlled `request.resource.data.houseId`; split into create/update/delete and pin `houseId` immutable on update. (conf 85)
- **[H-sec-3]** `firestore.rules:148` — `bugs` collection: `allow read, write: if signedIn()` — any user reads/writes all houses' bug reports (may contain resident PII). Scope to reporter/admin. (conf 95)
- **[H-sec-4]** `firestore.rules:250` — `feedback` collection: same unrestricted `signedIn()` read/write. Scope to submitter/admin. (conf 95)
- **[H-sec-5]** `firestore.rules:73,88` — `contact` + `beta-users` allow unauthenticated unlimited `create` (spam/quota-drain, SendGrid cost amplification) and `signedIn()` read of others' PII submissions. Add size limits; restrict reads to admin; consider a rate-limited Cloud Function. (conf 90)
- **[H-sec-6]** `auth.ts:204,235` — `promoteGuestsToAdmin`/`removePrivilegesForGuests` pass `targetUid: request.auth.uid` (== caller) to `assertCanGrantClaimForHouses`, collapsing the delegation branch; bulk ops aren't independently re-validated against Firestore house membership. (conf 80)

### Web

- **[H-web-1]** `redirect.component.ts:17-34,209` — `?debug=true` exposes an unauthenticated prod debug panel (full deep-link URL, UA, scheme-probe buttons). Gate on `!environment.production`. (conf 92)
- **[H-web-2]** `auth-service.service.ts:255-272` + `cloud-function.service.ts:26-30` — `initializeSubscription` ships the full `User` PII object alongside the payment-method id to the function. Send only `{ userId, paymentMethodId }`. (conf 90)
- **[H-web-3]** `redirect.component.ts:243-318` — 12 unguarded `console.log`s emit full deep-link URLs (token/path data) in prod. Remove/gate. (conf 98)
- **[H-web-4]** `my-account.component.ts:122-136` — `updateUser` spreads the entire form value onto the user's own Firestore doc with no field allowlist (future fields like `isAdmin` could be overwritten). Allowlist explicit fields. (conf 87)

### Mobile

- **[H-mob-1]** `state/queries/activityQueries.ts:269-273` — `useLogNewActivity` `onError` only `console.error`s: no Sentry, no user feedback, not `__DEV__`-guarded; a lost check-in/drug-test is silent. Use `logException` + notify + optional offline-enqueue. (conf 97)
- **[H-mob-2]** `hooks/useBaseActivityScreen.ts:210,219,306,350` — dispute/verify/resolve Firestore writes are `.catch(console.warn)` fire-and-forget; UI shows resolved while DB is unchanged. Use `logException` + notify or `await` in try/catch. (conf 96)
- **[H-mob-3]** `util/debug-logger.ts` vs `simple-debug-logger.ts` — duplicate `logInfo/...` exports, one guarded one not (see C8). Consolidate. (conf 90)
- **[H-mob-4]** `screens/GuestList/GuestList.tsx:167-200` — guests rendered via `.map()` inside `RatsScrollView` (no virtualization); 30+ residents → 30+ compliance-dot queries + unvirtualized views at mount. Use `FlatList`/`FlashList`. (conf 85)
- **[H-mob-5]** `components/rats-text-input/rats-text-input.tsx:227-237` — `useEffect` reads `values`/`pathToAddress` but deps only `[value]`; address can stale. Fix deps. (conf 92)

---

## MEDIUM Findings (condensed)

**Functions:** two/three Stripe client patterns + Proxy reads unset `STRIPE_API_VERSION` (`api/stripe.ts` vs `util/stripe.ts` vs `scheduledRentCollection.ts`) [MED]; `as unknown as` casts bypass Zod output types in `subscriptions.ts` [MED]; user-controlled `inviteLink` concatenated unescaped into HTML email (`util/inviteEmails.ts:70`) [MED]; ESLint non-functional, still using abandoned TSLint [MED]; deprecated `plan:` instead of `price:` in `api/stripe.ts:89` `createSubscription` [MED]; `addNotification` mutates caller's object [MED]; `webhookEvents` collection has no TTL/cleanup (unbounded growth) [MED]; `webhook` 400 echoes raw Stripe error [MED]; `listPayments`/`listHousePayments` use up-to-1hr-stale JWT claims for financial-data authz [MED]; `peekInvitation` unauthenticated and returns `invitedEmail` PII [MED]; `drug-tests` read rule grants observer (not the tested resident) [MED]; no per-user rate limiting on any callable [MED].

**Web:** `innerHTML` for terms/privacy bypasses sanitizer (static today) [MED]; unterminated RxJS subscriptions in `signup.component.ts:57` and billing `billing-info.component.ts:125` (billing-critical) [MED]; `NO_ERRORS_SCHEMA` on root `AppModule` suppresses template type-checks [MED]; EOL dependency stack — Firebase JS 7, `domino`, `ws` 7.3, `ngx-stripe` 9 [MED].

**Mobile:** `subscribeToGuest` error path `console.warn` not `logException` (listener dies silently) [MED]; `useHouseActivities` `refetchInterval: 30000` polls + drains battery in background, redundant with snapshot pattern [MED]; `DirectChat` passes 8 inline arrow-function props (hot re-render path) [MED]; `NotificationContext.notify` missing `dismissNotification` dep (fragile) [MED]; `useHouseActivities` query key omits `limit` → cache collisions [MED]; chat writes full name to message docs (intentional, but must never hit the unguarded logger) [MED]; `setup-wizard.ts:163` mutates `operatorAdmin.houseIds/superAdmin` in place [MED].

---

## Notable LOW Findings

- `DirectChat` has **no realtime subscription** at all — DMs only show messages loaded at mount (no `subscribeToDirectChat` in the tree). _(Originally filed C2 by the mobile reviewer; reclassified — it's a missing-feature/UX bug, not a leak. Verify against product intent.)_
- Crashlytics SDK has **zero production call sites** (only a Jest mock at `mobile/src/integration/setup.ts:74`) — safe to remove in one PR (aligns with the D-6 "keep Sentry" decision).
- `web/.../my-account/test.ts` — stray non-spec file committed; verify + delete.
- 4× `@ts-ignore` in web billing-critical code (`billing-info`, `auth-service`, `signup`).
- `STRIPE_API_VERSION` `!` assertion masks the unset env var (LOW dup of MED).
- `subscriptions.ts:259,320` hardcoded `admin@regroup-app.com`; `"cancelling"` vs `"canceled"` status spelling drift.

---

## Priority 1: Docs ↔ Code Discrepancies

### Requires human decision

| Finding                                 | Doc says                                                      | Code does                                                                                           | Recommendation                                                          |
| --------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `regroup/CLAUDE.md` Stack table         | "Cloud Functions **v1**"                                      | v2 (`onCall`/`HttpsError` from `firebase-functions/v2`; 36 v2 imports; `firebase-functions ^7.2.5`) | Update to "v2 (some v1 legacy triggers)"                                |
| `regroup/CLAUDE.md` Cross-Product Rules | Subscription model = "per-house and per-guest … `houses` map" | 6-tier flat-fee `SUBSCRIPTION_TIERS` gated by `TIER_BILLING_ENABLED`; per-guest is legacy fallback  | Rewrite to tier model + legacy fallback + `isTierBillingEnabled()` gate |
| `docs/go-to-market/monetization.md:63`  | SSOT = `../_shared/pricing.md` (RG-MON-1…7)                   | File does not exist                                                                                 | Create it, or repoint to `functions/src/config.ts`                      |
| `monetization.md:44`                    | Lists rejected pricing variant                                | Not in code (historical)                                                                            | Confirm "NOT ADOPTED" framing is prominent                              |

### Verified-correct claims (no action)

2% `application_fee_amount` (`payments.ts:151`) ✓; bundle coupons 3+/5+ (`api/stripe.ts:31`) ✓; 6 tiers Trad 69/129/249 + Oxford 49/89/299 (`config.ts:46`) ✓; iOS `com.rats.dev` / Android `com.regroup.app` ✓; Stripe API `2026-01-28.clover` (`util/stripe.ts:11`) ✓.

---

## Dependencies / Environment

- **HIGH** `web`: Angular 9.1 (~8 majors behind) + TS 3.8 + RxJS 6.5 + Firebase 7 + deprecated `protractor` + `--openssl-legacy-provider`. EOL, unpatched. (Launch decision: keep, rewrite post-revenue — prioritize `domino`/`ws` SSR-side bumps.)
- **HIGH** `functions`: no `functions/.env.example`; `STRIPE_API_VERSION` + ~12 price/config env vars (`STRIPE_PRICE_*`, `RECOVERY_API_BASE_URL`, `TIER_BILLING_ENABLED`) undocumented; `STRIPE_CONNECT_WEBHOOK_SECRET` missing from the secret-setup runbook header in `config.ts`.
- **MEDIUM** `functions`: `axios ^0.19` (known CVEs), `tslint` (abandoned), git-URL dep `tabletojson` (unpinned fork — supply-chain risk). `RATS_API_KEY` `defineSecret`'d but read nowhere (dead secret — remove or restore consumer).
- **MEDIUM** `mobile`: RN 0.72; unpinned git-fork `react-native-best-viewpager`; overlapping notification stacks (`react-native-push-notification` + `@notifee/react-native` + FCM) — confirm which is live.
- **Clean:** no real `sk_live`/`sk_test` keys in production source (only test mocks + comment placeholders). Firebase web/mobile API keys are committed (expected) — verify GCP key restrictions as a launch-checklist item.

---

## Actions Taken

- [x] **C1 — Fixed:** removed GPS-coordinate PII logging in `functions/src/callable/meetings.ts:203`.
- [x] **C2 — Fixed (code):** web Stripe key now reads `environment.stripePublishableKey`; `environment.prod.ts` carries a `pk_live_REPLACE_ME` placeholder. **DECISION/ACTION REQUIRED:** set the real `pk_live_` key in `environment.prod.ts` (or CI build env) before production deploy.
- [x] **C3 — Fixed:** open-redirect closed in `redirect.component.ts` via a case-insensitive deep-link scheme allowlist; unknown URLs fall back to `/`.
- [x] **C4 — Fixed:** `sendInviteEmails` gated to house operators; `sendConfirmationEmail` enforces caller email-ownership.
- [x] **C5 — Fixed:** `guest-archive` create/update/delete restricted to admins (residents read-only); +7 rules tests.
- [x] **C6 — Fixed:** the 4 fire-and-forget `sendEmail` trigger calls now `await` inside try/catch with `logger.error`.
- [x] **C7 — Fixed:** `getUserBySubscription` returns `null` on no match; both callers guard the null case.
- [x] **C8 — Fixed:** mobile `DebugLogger.log()` early-returns outside `__DEV__`.
- [x] **H-fns-5 — Fixed:** `sendInviteEmails` uses `Promise.allSettled` and surfaces partial delivery failure as an `HttpsError`.
- [x] **H-sec-2 — Fixed:** `complaints`/`disputes` write rules split into create/update/delete; membership keyed on the existing `resource.data.houseId` and `houseId` pinned immutable on update (no re-parenting); delete restricted to admins.
- [x] **H-sec-3 — Fixed:** `bugs` scoped to the `reporter` (pinned to caller on create); reads/updates/deletes restricted to that user. Devs triage via Admin SDK.
- [x] **H-sec-4 — Fixed:** `feedback` scoped to the submitter (`reviewer`, pinned on create) or a house admin; app-level feedback (`houseId == ''`) is submitter-only.
- [x] **H-sec-5 — Fixed:** `contact` create is size-bounded (field-count + message/email length caps) and all client reads/updates/deletes denied; `beta-users` locked to server-only (no client read/write path exists).
- [x] **H-sec-1 — Fixed:** `connectStripeAccount` `returnUrl`/`refreshUrl` validated by the shared `safeReturnUrlSchema` origin allowlist (open redirect on the Stripe Connect onboarding link closed).
- [x] **H-sec-6 — Fixed:** `promoteGuestsToAdmin`/`removePrivilegesForGuests` authorize each target user against the specific house(s) being modified (no longer self-targeted, which collapsed the delegation branch and skipped per-house re-validation).
- [x] **H-fns-1 — Fixed:** `scheduledRentCollection` `Math.round`s `guest.rentOwed` before the PaymentIntent (a stray non-integer cents value was silently rejected by Stripe, skipping auto-pay). +1 regression test.
- [x] **H-fns-2 — Fixed:** `updateUser` no longer `JSON.parse(JSON.stringify())`s values (`stripUndefinedDeep` preserves `FieldValue` sentinels / `Date`).
- [ ] **H-fns-3 — WON'T FIX (reclassified):** `payments.ts` `stripeLastSyncAt: Date.now()`. The `House` entity types both `stripeConnectedAt` and `stripeLastSyncAt` as `number` (epoch millis) and `payments.ts` uses `serverTimestamp()` nowhere, so the writes are already consistent; `Date.now()` inside a Cloud Function is server-side time. Switching to `serverTimestamp()` would introduce the Timestamp/number mix the finding warns against. Left as-is.
- [x] **H-fns-4 — Already fixed (pricing commit):** Connect webhook handler now runs `checkAndMarkEventProcessed` (idempotent), mirroring the platform handler.
- [x] **H-fns-7 — Fixed:** `updateSubscriptionGuests` Firestore-only fallback gated to `resource_missing`; other Stripe errors re-throw (no silent Firestore↔Stripe drift).
- [x] **H-fns-8 — Fixed:** `shapeHouses` typed `QueryDocumentSnapshot[]` (was `any[]`).
- [x] **H-fns-9 — Fixed:** `findMeetings` re-throws `HttpsError` on backend failure instead of returning `[]`.
- [x] **H-web-1 — Fixed:** `redirect.component.ts` `?debug=true` panel gated behind `!environment.production`.
- [x] **H-web-2 — Fixed:** `initializeSubscription` forwards only `{ id, email, subscriptionMetadata }` + paymentMethod (matches the callable's Zod schema; full `User` PII no longer transmitted).
- [x] **H-web-3 — Fixed:** removed the ~12 prod `console.log`s emitting deep-link URLs (token/path data).
- [x] **H-web-4 — Fixed:** `my-account` `updateUser` writes an explicit field allowlist (`contact → phoneNumber`).
- [x] **H-mob-1 — Fixed:** `useLogNewActivity` `onError` uses `logException` + user `Alert` (lost check-in/drug-test no longer silent).
- [x] **H-mob-2 — Fixed:** dispute/verify/resolve writes in `useBaseActivityScreen` awaited in try/catch with `logException` + `Alert`; dispute re-throws so the UI can't show false success.
- [x] **H-mob-3 — Fixed:** deleted the unguarded `debug-logger.ts` (+test); all callers use the `__DEV__`-guarded `simple-debug-logger`.
- [x] **H-mob-4 — Fixed:** `GuestList` renders via virtualized `FlatList` (header/empty-state/refresh preserved).
- [x] **H-mob-5 — Fixed:** `rats-text-input` address `useEffect` deps corrected (no stale address).

**Deferred:** **H-fns-6** (`tsconfig noUnusedLocals: false`) — enabling it surfaces many unused-locals across existing + pricing code; needs a dedicated cleanup pass.

604 functions tests pass; Firestore rules suite expanded to 105 tests (was 58) — all pass (+47 allow/deny tests for H-sec-2/3/4/5); mobile changed-suite jest green (122 tests); web `tsc --noEmit` clean. (Rules/storage emulators now require JDK 21 — global `firebase-tools` dropped Java 17 support; `storage.rules.test.ts` updated for the `mockUserToken` `uid`→`sub` API change.)

## Recommended Next Steps (launch-ordered)

1. **C2 web Stripe test key** + **C3 open redirect** — revenue-blocking + phishing surface; both ~1-line fixes.
2. ~~**Firestore rules pass** — C5 (`guest-archive`), H-sec-3/4/5 (`bugs`/`feedback`/`contact`), H-sec-2 (`complaints`/`disputes`). Add allow/deny rules tests for each.~~ ✅ **Done** — see Actions Taken (H-sec-2/3/4/5).
3. ~~**C4 email-abuse authz** + **C6 fire-and-forget email** + **H-fns-5 swallowed failures**~~ ✅ **Done.**
4. ~~**C8 mobile debug-logger** `__DEV__` guard (PII) + **H-mob-1/H-mob-2** error reporting via `logException`.~~ ✅ **Done.**
5. ~~**C7** + **H-fns-7** subscription-state correctness (Firestore↔Stripe drift).~~ ✅ **Done.**
6. Tech-debt batch (remaining): consolidate Stripe clients + pin `STRIPE_API_VERSION`, add `functions/.env.example`, remove Crashlytics, fix the 4 doc discrepancies, enable `tsconfig noUnusedLocals` (H-fns-6), and the MEDIUM findings.

**All CRITICAL and HIGH findings are now resolved** except the deliberately deferred **H-fns-6** (lint cleanup) and remaining MEDIUM/LOW items. Action still required from a human: set the real `pk_live_` Stripe key (C2) before production deploy.
