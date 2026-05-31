# RATS v2 — Current Roadmap

**Date:** 2026-05-23 (last reconciled 2026-05-25)
**Method:** Full doc audit (30+ docs) + codebase cross-reference against git HEAD
**Supersedes:** `2026-05-20-roadmap-from-docs-analysis.md`
**Source review:** `.full-review/` phases 1–5 (165 findings), all superpowers plans through 2026-05-23

---

## Executive Summary

The codebase has shipped significantly more than the 2026-05-20 roadmap anticipated. Application workflow, guest discharge, admin reporting, staff notes, document management, CSV exports, payment failure recovery, balance aging, and chore rotation are **all done**. The 2026-05-25 reconciliation found that the P0-SEC code fixes (guest-archive rule, SendGrid env var, `delete_auth_users.js` guards), the P1 bug fixes (`getOverallPercentage`, immutability), and two of three migrations (M1 BaseEntity, M3 meetingsSlice) have also shipped. **What genuinely remains before App Store submission:**

1. **Security MANUAL actions only** — key rotations, prod data deletion, BFG history purge (P0). Engineering portion already shipped.
2. **P1-M2 (ActivityType enum) — partial by design.** Verified 2026-05-25: legacy strings are live in Firestore and actively handled by `regroup-functions/util/disputes.ts`. Mobile-only removal would create read asymmetry. M2 acceptance criteria revised to ban NEW legacy uses (via ESLint) rather than zero-grep-hits.
3. **CI hardening** — no lint/type-check/audit/coverage gates in `unit-tests.yml` (P2)
4. **ESLint guardrails** to lock in M1/M3 and prevent M2 backsliding (P1-LINT)

---

## Section 1: Doc Audit Summary

| Document                                                                 | Date       | Verdict                                                                       |
| ------------------------------------------------------------------------ | ---------- | ----------------------------------------------------------------------------- |
| `docs/superpowers/specs/2026-05-19-release-readiness-audit.md`           | 2026-05-19 | Primary technical source — most items still apply                             |
| `docs/superpowers/specs/2026-05-20-roadmap-from-docs-analysis.md`        | 2026-05-20 | Superseded by this doc — P0-Eng and P1 items largely done                     |
| `docs/superpowers/plans/2026-05-23-migration-completions.md`             | 2026-05-23 | **Active** — all 3 migrations not yet started                                 |
| `docs/manual-tasks/2026-05-21-app-store-launch-checklist.md`             | 2026-05-21 | **Active** — all 8 manual tasks still pending                                 |
| `docs/superpowers/plans/2026-05-19-paywall-completion.md`                | 2026-05-19 | **DONE** — rules, backfill, entity default all shipped                        |
| `docs/superpowers/plans/2026-05-22-document-management.md`               | 2026-05-22 | **DONE** — entity, service, queries, screen, rules shipped                    |
| `docs/superpowers/plans/2026-05-22-staff-notes-shift-logs.md`            | 2026-05-22 | **DONE** — entity, queries, screen shipped                                    |
| `docs/superpowers/plans/2026-05-20-resident-application-workflow.md`     | 2026-05-20 | **DONE** — all 4 screens + service exist                                      |
| `docs/superpowers/plans/2026-05-20-guest-lifecycle-and-operations.md`    | 2026-05-20 | **DONE** — DischargeGuestModal + dischargeGuest service shipped               |
| `docs/superpowers/plans/2026-05-21-payment-failure-recovery.md`          | 2026-05-21 | **DONE** — FailedPaymentBanner + useFailedPayments shipped                    |
| `docs/superpowers/plans/2026-05-20-payment-ux-and-reporting.md`          | 2026-05-20 | **DONE** — exportPaymentHistoryCSV + exportEESHistoryCSV shipped              |
| `docs/superpowers/plans/2026-05-22-admin-reporting-dashboard.md`         | 2026-05-22 | **DONE** — AdminReportScreen wired into navigation                            |
| `docs/superpowers/plans/2026-05-22-chore-rotation-photo-evidence.md`     | 2026-05-22 | **DONE** — choreRotationQueries + service + entity exist                      |
| `docs/superpowers/plans/2026-05-22-multi-house-bundle-discount.md`       | 2026-05-22 | **DONE** — applyBundleDiscount callable wired                                 |
| `docs/superpowers/plans/2026-05-22-offline-payment-pending-indicator.md` | 2026-05-22 | **DONE** — StalePendingBanner shipped                                         |
| `docs/superpowers/plans/2026-04-13-redux-to-react-query-migration.md`    | 2026-04-13 | **PARTIAL** — meetingsSlice is the last remaining Redux-for-server-data slice |
| All other superpowers plans (pre-2026-05-19)                             | Various    | **DONE or STALE** — superseded                                                |

---

## Section 2: Implementation Status Matrix

### Migrations

| Migration                                                                     | Status                             | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BaseEntity timestamps (`createdDate`/`lastUpdated` → `createdAt`/`updatedAt`) | **DONE** (2026-05-25)              | All entity-class and service writes migrated. 3 surviving `.lastUpdated` writes in `useWeekSummary.ts` (lines 68, 124, 184) are the **explicit exclusion** noted in the M1 plan: they write the Firestore `WeekSummary` schema field directly, not the entity-class `updatedAt` property.                                                                                                                                                                                         |
| ActivityType enum (`'meeting'`/`'chore'`/etc. literals → `ActivityType.*`)    | **PARTIAL BY DESIGN** (2026-05-25) | Reconciliation found legacy strings (`meeting_attended`, `hours_worked`, `medication_taken`, `supporter_met`) are live in Firestore and actively branched on by `regroup-functions/util/disputes.ts` + declared in functions `Guest.ts` union. Mobile dual-handling (OR conditions, alias maps in `util/guest.tsx`, `util/display.tsx`, `useActivityMetadata.ts`) is intentional read-side compat. Full removal blocked on Firestore activity-type backfill (no plan exists yet). |
| meetingsSlice Redux → React Query                                             | **DONE** (verified 2026-05-25)     | `src/state/queries/meetingQueries.ts` exists; grep for `state.meetings.*` outside the slice returns zero hits.                                                                                                                                                                                                                                                                                                                                                                    |
| ESLint guardrails for above migrations                                        | **NOT DONE**                       | `.eslintrc.js` has no `no-restricted-syntax` rules; deprecated fields can silently re-enter. P1-LINT plan in §P1-LINT below.                                                                                                                                                                                                                                                                                                                                                      |

### Critical Bugs

| Bug                                                                      | Status                         | Evidence                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getOverallPercentage` hardcoded `return 0`                              | **DONE** (verified 2026-05-25) | `src/util/guest.tsx:267-289` now computes `min(100, round(actual/required*100))` from `WeekSummary` stats. The `return 0` only fires when `weekStats` is omitted — documented signal for callers that haven't migrated yet. Test mocks should be re-audited per §P2-TEST so they assert against real values, not mock 80. |
| Object mutation `delete partialHouse.disputes[dispute.id]`               | **DONE** (verified 2026-05-25) | `src/hooks/useBaseActivityScreen.ts:269-274` uses destructuring spread (`const { [id]: _removed, ...remaining } = …`); no `delete` remains.                                                                                                                                                                               |
| `guest-archive` Firestore rule allows any signed-in user to read SUD PII | **DONE** (verified 2026-05-25) | `firebase/firestore.rules:232` now reads `allow read: if isGuestOrAdmin([resource.data.houseId])`. Confirm rules test in `firebase/__tests__/firestore.rules.test.ts` covers the deny path before next deploy.                                                                                                            |

### Security Manual Actions (human-only unless noted)

| Action                                                                                 | Status                                                                                                                             |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Rotate SendGrid API key (`scripts/send-launch-emails.js`) — **engineering portion**    | **DONE** (verified 2026-05-25) — `scripts/send-launch-emails.js:14` uses `process.env.SENDGRID_API_KEY` with missing-var guard.    |
| Rotate SendGrid API key — **revoke + reissue in SendGrid dashboard**                   | **PENDING** (human-only)                                                                                                           |
| Rotate Sentry auth token (`ios/sentry.properties`)                                     | **PENDING** (human-only)                                                                                                           |
| Rotate 3 Firebase service account keys + BFG git history purge                         | **PENDING** (human-only)                                                                                                           |
| Delete 4 E2E test accounts from production Firebase Auth                               | **PENDING** (human-only)                                                                                                           |
| Fix `delete_auth_users.js` — add dry-run flag + production guard (engineering portion) | **DONE** (verified 2026-05-25) — `scripts/delete_auth_users.js:4,15-25` has `--dry-run` flag + `ALLOW_PRODUCTION_DELETE` env gate. |

### App Store Manual Actions (human-only)

| Action                                                                          | Status      |
| ------------------------------------------------------------------------------- | ----------- |
| HIPAA surface decision (legal consult)                                          | **PENDING** |
| Privacy policy + ToS hosted at stable HTTPS URL                                 | **PENDING** |
| Stripe subscription products created ($49/mo House, $79/mo Oxford)              | **PENDING** |
| IAP vs. direct billing architecture decision                                    | **PENDING** |
| App Store Connect: metadata, screenshots, age rating, IDFA, App Review notes    | **PENDING** |
| Google Play: Data Safety form, feature graphic, API 34, permissions declaration | **PENDING** |

### CI/CD

| Item                                           | Status                                                  |
| ---------------------------------------------- | ------------------------------------------------------- |
| Lint gate in CI (`npm run lint`)               | **MISSING** — `unit-tests.yml` only runs Jest           |
| Type-check gate (`tsc --noEmit`)               | **MISSING**                                             |
| `npm audit --audit-level=critical` gate        | **MISSING** — 2 critical vulns shipping                 |
| Security rules emulator job                    | **MISSING** — `test:rules` never called by any workflow |
| Coverage threshold (currently `--no-coverage`) | **MISSING**                                             |
| Deploy workflow for Firestore rules/indexes    | **MISSING**                                             |

### Feature Completeness

| Feature                                                  | Status                                                      | Evidence                                                                                           |
| -------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Application workflow (resident-facing + operator-facing) | **DONE**                                                    | `ApplyScreen`, `ApplicationStatusScreen`, `ApplicationListScreen`, `ApplicationDetailScreen` exist |
| Guest discharge / offboarding                            | **DONE**                                                    | `DischargeGuestModal`, `dischargeGuest()` service                                                  |
| Payment failure recovery UI                              | **DONE**                                                    | `FailedPaymentBanner`, `useFailedPayments`, wired in `PaymentDashboard`                            |
| CSV export (payment history + EES)                       | **DONE**                                                    | `exportPaymentHistoryCSV`, `exportEESHistoryCSV` in `reportExport.ts`                              |
| Admin reporting dashboard                                | **DONE**                                                    | `AdminReportScreen` wired into `HouseSettings` nav                                                 |
| Balance aging view                                       | **DONE**                                                    | `BalanceAgingView` in `BalanceDashboard`                                                           |
| Staff notes / shift logs                                 | **DONE**                                                    | `StaffNote` entity, service, queries, `StaffNotesFeed` screen                                      |
| Document management                                      | **DONE**                                                    | entity, service, queries, `DocumentListScreen`, security rules                                     |
| Chore rotation                                           | **DONE**                                                    | `choreRotationQueries`, `choreRotation` service, `ChoreRotation` entity                            |
| Multi-house bundle discount                              | **DONE**                                                    | `applyBundleDiscount` callable wired                                                               |
| Stale pending payment indicator                          | **DONE**                                                    | `StalePendingBanner`, `useStalePendingPayments`                                                    |
| Bulk guest CSV import                                    | **MISSING** — no `BulkImportScreen`, no `bulkCreateGuests`  |
| iOS PDF export                                           | **BLOCKED** — `isPDFExportAvailable()` returns false on iOS |

### Testing Gaps (from full review)

| Gap                                                                       | Severity |
| ------------------------------------------------------------------------- | -------- |
| `userSlice.login` thunk has zero unit test coverage                       | Critical |
| `useSubscriptionGate` / `usePaywallKillSwitch` untested                   | High     |
| Security rules excluded from CI (`testPathIgnorePatterns`)                | Critical |
| `getOverallPercentage` mocked to return 80 in tests, hiding hardcoded `0` | Critical |
| `applyBundleDiscount` billing-critical path has no tests                  | High     |
| `getTimeSober` calls `parseISO` without importing it (latent crash)       | Medium   |

---

## Section 3: Pruned Roadmap

**Excluded (DONE):** Application workflow, guest discharge, staff notes, documents, admin reporting, CSV export, payment failure UI, chore rotation, bundle discount, stale payment indicator, balance aging, paywall enforcement, Oxford governance suite, Redux→RQ migration (except meetingsSlice), all functions-repo plans

---

### P0 — Must complete before App Store submission

These block the release. **All engineering code changes are now shipped.** Remaining P0 items are human-only actions (key rotations, account cleanup, legal/store assets).

| Item                                                                                                                                             | Effort  | Type                 | Status                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | -------------------- | ----------------------------------------------------------------------------------------------------- |
| **P0-SEC-1**: Rotate SendGrid API key; remove from `scripts/send-launch-emails.js`; replace with `process.env.SENDGRID_API_KEY`                  | 30 min  | Engineering + human  | **CODE DONE** (verified 2026-05-25). Human still needs to revoke + reissue key in SendGrid dashboard. |
| **P0-SEC-2**: Rotate Sentry auth token; add `ios/sentry.properties` to `.gitignore`                                                              | 30 min  | Human + engineering  | **PENDING** (mostly human; confirm `.gitignore` entry).                                               |
| **P0-SEC-3**: Fix `guest-archive` Firestore rule — change `allow read: if signedIn()` → `allow read: if isGuestOrAdmin([resource.data.houseId])` | 15 min  | Engineering (1 line) | **DONE** (verified 2026-05-25, `firebase/firestore.rules:232`).                                       |
| **P0-SEC-4**: Rotate 3 Firebase service account keys; BFG git history purge (see `2026-05-21-app-store-launch-checklist.md` Step A)              | 2-4 hrs | Human                | **PENDING** (human-only).                                                                             |
| **P0-SEC-5**: Delete 4 E2E test accounts from prod Firebase Auth + Firestore test houses                                                         | 1 hr    | Human                | **PENDING** (human-only).                                                                             |
| **P0-SEC-6**: Fix `delete_auth_users.js` — add dry-run flag + production project guard before accidental execution                               | 1 hr    | Engineering          | **DONE** (verified 2026-05-25, `scripts/delete_auth_users.js:4,15-25`).                               |
| **P0-LEGAL-1**: HIPAA surface decision (legal consult) — sober living + medication/sobriety tracking may trigger BAA                             | 2-4 hrs | Legal                | **PENDING** (legal-only).                                                                             |
| **P0-LEGAL-2**: Privacy Policy + Terms of Service hosted at stable HTTPS URL (draft exists in `docs/`)                                           | 4-6 hrs | Human                | **PENDING** (depends on P0-LEGAL-1).                                                                  |
| **P0-STORE-1**: Stripe subscription products created ($49/mo House, $79/mo Oxford) in Stripe Dashboard                                           | 2 hrs   | Human                | **PENDING** (depends on P0-STORE-2 decision).                                                         |
| **P0-STORE-2**: IAP vs. direct billing decision (Apple guidelines §3.1.1) — recommendation: Option A (web-only, already built)                   | 2 hrs   | Decision             | **PENDING** (decision-only).                                                                          |
| **P0-STORE-3**: App Store Connect — metadata, screenshots, age rating, IDFA, App Review notes                                                    | 6-8 hrs | Human                | **PENDING** (human-only).                                                                             |
| **P0-STORE-4**: Play Store — Data Safety form, feature graphic, API 34, permissions declaration                                                  | 2-3 hrs | Human                | **PENDING** (human-only).                                                                             |

**Ordering constraint:** P0-LEGAL-1 before P0-LEGAL-2 (HIPAA outcome affects privacy policy content). P0-STORE-2 before P0-STORE-1.

---

### P1 — Migration completions + critical bug fixes

Engineering work. **As of 2026-05-25, 5 of 6 items are DONE.** Only P1-LINT remains as an active engineering task.

| Item                                                                  | Effort       | Status                                    | Details                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------- | ------------ | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1-M1**: BaseEntity timestamp migration                             | M (2 days)   | **DONE** (verified 2026-05-25)            | Entity classes, services, hooks, and screen reads/writes all migrated. `useWeekSummary.ts` writes to the Firestore `lastUpdated` schema field per explicit M1 exclusion — not a regression.                                                    |
| **P1-M2**: ActivityType enum migration                                | S (1 day)    | **PARTIAL BY DESIGN** (locked 2026-05-25) | Verified the dual-string handling is intentional compat with live Firestore data and `regroup-functions/util/disputes.ts`. Acceptance criteria revised: no NEW switch arms on legacy strings (enforced via P1-LINT) instead of zero-grep-hits. |
| **P1-M3**: meetingsSlice Redux → React Query                          | S (1 day)    | **DONE** (verified 2026-05-25)            | `src/state/queries/meetingQueries.ts` exists; zero `state.meetings.*` reads outside the slice.                                                                                                                                                 |
| **P1-LINT**: ESLint guardrails for M1/M2/M3                           | S (0.5 day)  | **ACTIVE** — next engineering task        | `no-restricted-syntax` rules banning new deprecated field writes + new legacy activity-type arms. M2 rules scoped to forbid _new_ uses only; existing OR-conditions and alias maps must remain functional.                                     |
| **P1-BUG-1**: Fix `getOverallPercentage` returning hardcoded `0`      | M (1-2 days) | **DONE** (verified 2026-05-25)            | `src/util/guest.tsx:267-289` computes from `WeekSummary` stats. P2-TEST-1 should re-audit test mocks to assert against real values.                                                                                                            |
| **P1-BUG-2**: Fix object mutation `delete` in `useBaseActivityScreen` | S (30 min)   | **DONE** (verified 2026-05-25)            | `src/hooks/useBaseActivityScreen.ts:269-274` uses destructuring spread.                                                                                                                                                                        |

**Sequencing:** Only P1-LINT remains — no prerequisites. M2 lint rules require care: ban `case 'meeting_attended':` (new) but preserve existing `if (type === 'meeting_attended' || type === ActivityType.MEETING)` patterns by scoping rules to `SwitchCase > Literal` selectors only.

---

### P2 — CI hardening + test coverage

| Item                                                                                                 | Effort     | Status                                                                                                                             |
| ---------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **P2-CI-1**: Add lint job to `unit-tests.yml` (`npm run lint`)                                       | S          | **DONE** (advisory, 3168641)                                                                                                       |
| **P2-CI-2**: Add type-check job (`npx tsc --noEmit`); fix any surfaced errors                        | S-M        | **DONE** (advisory, 3168641)                                                                                                       |
| **P2-CI-3**: Add `npm audit --audit-level=critical` gate                                             | S          | **DONE** (advisory, 3168641)                                                                                                       |
| **P2-CI-4**: Add security-rules job (Firebase emulator + `npm run test:rules`)                       | M          | **DONE** 2026-05-26 (f64a2d0) — separate job, `testPathIgnorePatterns` intentionally kept (regular Jest has no emulator)           |
| **P2-CI-5**: Enable coverage in CI; add `coverageThreshold: { global: { lines: 50 } }` as ratchet    | S          | **DONE** (30% ratchet, 3168641)                                                                                                    |
| **P2-TEST-1**: Add `userSlice.login` thunk tests (success, wrong-password, network error)            | M          | **DONE** 2026-05-26 (cafc6bb) — 6 tests in `src/state/__tests__/userSlice.test.ts`                                                 |
| **P2-TEST-2**: Add `useSubscriptionGate` / `usePaywallKillSwitch` tests                              | M          | **DONE** 2026-05-26 (41ea192) — 19 tests in `src/hooks/__tests__/useSubscriptionGate.test.ts`                                      |
| **P2-TEST-3**: Add `getTimeSober` test coverage (`parseISO` import already shipped in prior session) | S          | **DONE** 2026-05-26 (cafc6bb) — 7 tests in `src/util/__tests__/guest.test.ts`; pinned Math.abs-on-future-date quirk as known issue |
| **P2-TEST-4**: Add `applyBundleDiscount` billing tests                                               | S          | **DONE** 2026-05-26 (41ea192) — 4 tests appended to `src/services/__tests__/subscription.test.ts`                                  |
| **P2-FEAT-1**: Bulk guest CSV import (`BulkImportScreen` + `bulkCreateGuests` batch write)           | M (3 days) | open (gated on operator demand)                                                                                                    |

---

### P3 — Backlog

| Item                                                                         | Notes                                                                                 |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| iOS PDF export                                                               | Blocked by RN 0.72 / platform limitation; unblock with RN upgrade                     |
| ACH payments                                                                 | Stripe ACH integration; high operator value                                           |
| Automated payment reminders                                                  | Scheduled Cloud Function (month 2 post-launch)                                        |
| React Native 0.72 → 0.74+ upgrade (BP-C1)                                    | EOL; enables Hermes improvements; required for `react-native-keyboard-spacer` removal |
| TypeScript `noImplicitAny` ratchet (546 `any` types) (BP-C3)                 | Incremental; start with `useBaseActivityScreen.ts` selectors                          |
| `moment` + `moment-timezone` removal (BP-M2)                                 | `npm uninstall moment moment-timezone` — zero usages in `src/`                        |
| `zod` removal (BP-M3)                                                        | `npm uninstall zod` — zero usages; Yup is active                                      |
| Lodash removal / tree-shaking (BP-M1)                                        | ~72KB gzip; replace with native array methods                                         |
| 683 inline style objects → `StyleSheet.create` (BP-M4)                       | Start with most-rendered list rows                                                    |
| `perf-crit-1`: `updateWeekSummary` N+1 reads                                 | Optimize to single transaction read                                                   |
| `perf-crit-2`: N+1 Firestore reads on GuestList                              | Batch read with `getDocs` + `in` query                                                |
| SEC-CRIT-4: Wire `EnhancedAuthService` rate limiting into production sign-in | Currently dead code; production has no rate limiting                                  |
| 2FA (Firebase MFA enrollment)                                                | Security; not launch-critical                                                         |
| Oxford House Inc. enterprise conversation                                    | Start at month 6                                                                      |
| AI features (Meeting Verifier, Chore Rotation AI, Dispute Summarizer)        | Month 2+ post-launch                                                                  |
| Automated consequence workflows                                              | Post-launch                                                                           |
| Outcomes analytics dashboard                                                 | Post-launch; pairs with HUD reporting                                                 |

---

## Section 4: Implementation Plans (P0-Engineering + P1)

### P0-SEC-1: Rotate SendGrid Key

**Status:** MISSING | **Effort:** S | **File:** `scripts/send-launch-emails.js`

- [ ] Remove hardcoded `const API_KEY = 'SG.ECM4m6TPTve4...'`
- [ ] Replace with `const API_KEY = process.env.SENDGRID_API_KEY`
- [ ] Add guard: `if (!API_KEY) throw new Error('SENDGRID_API_KEY env var required')`
- [ ] Rotate the key in SendGrid Dashboard → Settings → API Keys → Revoke + Create New
- [ ] Store new key in `.env.local` (gitignored) and CI secrets

---

### P0-SEC-3: Fix guest-archive Firestore rule (1-line fix, CVSS 8.6)

**Status:** ACTIVE BUG | **Effort:** S | **File:** `firebase/firestore.rules:231`

Current:

```
match /guest-archive/{guestId} {
  allow read: if signedIn();
```

Fix:

```
match /guest-archive/{guestId} {
  allow read: if isGuestOrAdmin([resource.data.houseId]);
```

- [ ] Make the edit
- [ ] Add test to `firebase/__tests__/firestore.rules.test.ts`: DENY read when `userId` not in `houseId`
- [ ] Deploy: `firebase deploy --only firestore:rules`

---

### P1-M1: BaseEntity Timestamp Migration

**Status:** NOT STARTED | **Effort:** M (2 days) | **Source:** `2026-05-23-migration-completions.md` §M1

Full step-by-step plan already written. Summary of scope:

- **Entities to fix (own-property removal):** `Guest.tsx` (lines 68-69, 89), `Complaint.ts` (line 11), `Issue.ts` (line 39)
- **Services to fix (write sites):** `guest.tsx` (lines 98, 302), `activity.ts` (lines 298, 389), `guestImport.ts` (lines 112-113), `phaseAdvancement.ts` (line 144), `house.tsx` (line 178)
- **Hook to fix:** `useBaseActivityScreen.ts` (line 190)
- **Screen writes to fix:** `Personal.tsx` (lines 157, 226)
- **Screen reads (add fallback):** `Complaints.tsx` (lines 160, 283, 383-384), `GuestList.tsx` (line 181), `Issues.tsx` (lines 226, 470)
- **Do not touch:** `WeekSummary.ts`, `useWeekSummary.ts` — these read Firestore schema fields, not entity class fields

**Acceptance criteria:**

- [ ] `grep -rn "\.createdDate\s*=" src --include="*.ts" --include="*.tsx" | grep -v test | grep -v BaseEntity` → no output
- [ ] `grep -rn "\.lastUpdated\s*=" src --include="*.ts" --include="*.tsx" | grep -v test | grep -v WeekSummary` → no output
- [ ] All existing tests pass

---

### P1-M2: ActivityType Enum Migration

**Status:** NOT STARTED | **Effort:** S (1 day) | **Source:** `2026-05-23-migration-completions.md` §M2

- **`src/screens/Activity/ActivityFilterForm.tsx`**: Replace local `ActivityTypeFilters` string union + `activityTypeItems` map with `ActivityType` enum values; fix `'supporter'` → `ActivityType.PRIMARY_SUPPORTER` bug
- **`src/util/guest.tsx:146-169`**: Remove legacy `meeting_attended`/`hours_worked`/`medication_taken`/`supporter_met` switch arms; use only `ActivityType.*` values
- **`src/screens/HouseOverview/HouseActivity/HouseActivity.tsx`**: Replace `getActivityLabel` string switch with `ActivityType.*`; remove `// @ts-nocheck`
- **`src/screens/Profile/GuestHome.tsx:278,286`**: Replace `'meeting'`/`'medication'` literals with `ActivityType.MEETING`/`ActivityType.MEDICATION`

**Acceptance criteria:**

- [ ] `grep -rn "case 'meeting':\|case 'chore':\|case 'work':\|case 'medication':\|case 'primary_supporter':" src | grep -v test` → no output
- [ ] `grep -rn "meeting_attended\|hours_worked\|medication_taken\|supporter_met" src | grep -v test` → no output

---

### P1-M3: meetingsSlice → React Query

**Status:** NOT STARTED | **Effort:** S (1 day) | **Source:** `2026-05-23-migration-completions.md` §M3

- **Create:** `src/state/queries/meetingQueries.ts` — `useSearchMeetings()`, `useCheckIntoMeeting()`, `useAddMeeting()` mutations
- **Migrate:** `MeetingSearch.tsx` + `useMeetingSearch.ts` — remove `useAppSelector(state => state.meetings.*)` reads; use React Query mutations
- **Migrate:** `NewMeeting.tsx` — remove Redux thunk dispatch; use `useAddMeeting()`
- **Mark deprecated:** Add `@deprecated` JSDoc to `meetingsSlice.ts`

**Acceptance criteria:**

- [ ] `grep -rn "state\.meetings\." src | grep -v "meetingsSlice\|test\|spec"` → no output
- [ ] `meetingQueries.test.ts` passes for search + check-in + add mutations

---

### P1-LINT: ESLint Migration Guardrails

**Status:** NOT STARTED | **Effort:** S (0.5 day)

Add to `.eslintrc.js` after all three migrations complete:

```js
'no-restricted-syntax': [
  'error',
  // M1: deprecated timestamp field writes
  { selector: "AssignmentExpression[left.type='MemberExpression'][left.property.name='createdDate']", message: "Use 'createdAt'" },
  { selector: "AssignmentExpression[left.type='MemberExpression'][left.property.name='lastUpdated']", message: "Use 'updatedAt'" },
  { selector: "Property[key.name='createdDate'][parent.type='ObjectExpression']", message: "Use 'createdAt'" },
  { selector: "Property[key.name='lastUpdated'][parent.type='ObjectExpression']", message: "Use 'updatedAt'" },
  // M2: raw activity type string literals in switch/case
  { selector: "SwitchCase > Literal[value='meeting']", message: "Use ActivityType.MEETING" },
  { selector: "SwitchCase > Literal[value='chore']", message: "Use ActivityType.CHORE" },
  { selector: "SwitchCase > Literal[value='work']", message: "Use ActivityType.WORK" },
  { selector: "SwitchCase > Literal[value='medication']", message: "Use ActivityType.MEDICATION" },
  { selector: "SwitchCase > Literal[value='primary_supporter']", message: "Use ActivityType.PRIMARY_SUPPORTER" },
]
```

---

### P1-BUG-2: Fix object mutation in useBaseActivityScreen

**Status:** NOT DONE | **Effort:** S (30 min) | **File:** `src/hooks/useBaseActivityScreen.ts:270`

Current:

```typescript
delete partialHouse.disputes[dispute.id];
```

Fix:

```typescript
const { [dispute.id]: _removed, ...remainingDisputes } =
  partialHouse.disputes ?? {};
return {
  partialHouse: { ...partialHouse, disputes: remainingDisputes },
  resolvedDispute,
};
```

---

## Section 5: Confidence Notes

| Item                                               | Confidence | Recommendation                                                                                                  |
| -------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------- |
| Application workflow screens wired into navigation | Medium     | Verify routing in navigators.tsx and HouseSearch result card                                                    |
| Subscription paywall end-to-end                    | Medium     | Test `canceled` status redirects with emulator before TestFlight                                                |
| Oxford gate in emulator                            | Medium     | `useOxfordGate` noted as needing emulator test                                                                  |
| iOS PDF export                                     | Low        | `isPDFExportAvailable()` returns false on iOS — do not promise in App Store listing                             |
| FCM token refresh cycle                            | Low        | Noted in release audit as untested                                                                              |
| Deep-link invite URL                               | Low        | Release audit notes "deep-link invite URL not tested"                                                           |
| Guest discharge auth claim revocation              | Medium     | Cloud Function to remove `houseId` claim on discharge — verify CF exists in regroup-functions                   |
| `getOverallPercentage` implementation              | Low        | The function body (lines 266-282) exists but returns `0` — verify if partial implementation exists or pure stub |

---

## Quick Reference: What to do next

_Updated 2026-05-25 to reflect actual code state._

1. **Today (engineering, ~1 hr):** P1-LINT — add `no-restricted-syntax` guardrails to `.eslintrc.js`. Then P2-CI-1/2/3/5 — add lint, type-check, npm audit, and coverage gates to `unit-tests.yml`.
2. **This week (human-only, blocking App Store):**
   - BFG git history purge (P0-SEC-4)
   - SendGrid + Sentry + Firebase service-key rotations (revoke + reissue in dashboards)
   - E2E test account deletion (P0-SEC-5)
   - HIPAA legal consult (P0-LEGAL-1)
3. **Next sprint (engineering, P2):**
   - ~~P2-TEST-1: `userSlice.login` thunk tests~~ — DONE 2026-05-26 (cafc6bb)
   - ~~P2-TEST-3: `getTimeSober` `parseISO` import fix + tests~~ — DONE 2026-05-26 (cafc6bb)
   - ~~P2-CI-4: security-rules emulator job in CI~~ — DONE 2026-05-26 (f64a2d0)
   - ~~P2-TEST-2: `useSubscriptionGate` / `usePaywallKillSwitch` tests~~ — DONE 2026-05-26
   - ~~P2-TEST-4: `applyBundleDiscount` billing tests~~ — DONE 2026-05-26
   - P2-FEAT-1: Bulk guest CSV import (if operator demand)
   - Follow-up: fix `getTimeSober` Math.abs-on-future-date quirk surfaced by P2-TEST-3 (pinned as regression test for now)
4. **Pre-TestFlight (human):** App Store assets (P0-STORE-3/4) + Stripe products (P0-STORE-1) — gated on P0-STORE-2 decision.
5. **Future (separate plan needed):** Full ActivityType normalization — Firestore audit query + backfill of legacy `meeting_attended`/`hours_worked`/etc. activity docs, then remove dual-handling from both `regroup-rn7` and `regroup-functions`.
