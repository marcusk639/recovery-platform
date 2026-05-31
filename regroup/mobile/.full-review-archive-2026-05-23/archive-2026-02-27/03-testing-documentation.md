# Phase 3: Testing & Documentation Review

## Test Coverage Findings (from Phase 3A)

**Total: 13 findings — 4 Critical, 4 High, 4 Medium, 1 Low**

### Key headline finding

The "100% E2E coverage" claim in documentation refers to test _code written_, not tests _passing_. As of Feb 15, 2026 (most recent session), **0/7 E2E tests were passing** due to an unresolved Detox/splash-screen bug. Additionally, many "passing" tests swallow failures via try/catch — the suite cannot fail on broken behavior by design.

---

### Critical

**T-C1: E2E Infrastructure Has Never Produced a Passing Test Run**
`E2E_FIRST_RUN_ISSUES.md` (Feb 15, 2026): "0/7 passing — all login tests failing." Root cause: splash screen `appIsReadyCheck()` returns false in E2E mode; `global.__DETOX__` propagation unverified. `E2E_CRITICAL_PATHS_STATUS.md` claims "100% Test Coverage Complete" — this means 100% of planned scenarios were _written_, not executed. All 72 scenarios are untested at runtime. Xcode 26.2 compatibility with `RNDateTimePicker` also unresolved.

**T-C2: Zero Payment E2E or Security Tests**
`listPayments` (any auth user can read any guest's payments) and `savePaymentMethod` (any user can save payment methods for other guests) have documented authorization vulnerabilities with **zero test coverage**. Stripe webhook `payment_intent.succeeded`, operator onboarding flow, cross-house payment access, and failed payment handling — none are covered. Payment and subscription management are listed as HIGH PRIORITY uncovered features in `E2E_UNCOVERED_FEATURES.md`.

**T-C3: `subscriptionIsActive()` Returns False for 'trialing' — No Test Coverage**
Every paywall guard that calls this function blocks legitimate trialing operators. Zero test exists for `status === 'trialing'`, `'past_due'`, `'canceled'`, `'incomplete'`, or any non-`'active'` status. Sprint 3 and 5 payment tests check `oxfordEnabled: true/false` only.

**T-C4: `handleStripeConnectWebhook` Not Implemented — Untestable**
The function that transitions operators from PENDING → ACTIVE doesn't exist. Every E2E test for operator setup tests only the form UI, not the business outcome. Nothing to test until the function is implemented.

---

### High

**T-H1: No Performance Tests Despite Documented 500ms Query SLA**
`ACTIVITY_SYSTEM_TEST_PLAN.md` specifies "All queries <500ms, writes <200ms" but zero test asserts timing. `waitForFirebaseSync(2000)` helpers simply wait 2 seconds — they don't assert SLAs. The N+1 payment dashboard (5-10s load for 15 residents) has no regression test. Dashboard <2s SLA is in ACTIVE_PLAN success metrics but not enforced by any test.

**T-H2: Firestore Indexes Not Deployed — Tests Don't Catch Missing Indexes**
Firebase emulator doesn't enforce composite index requirements. Integration tests pass locally but the compound query on `house-activities` (`houseId + date + activityType`) will fail in production with a "requires an index" error. No CI step validates `firestore.indexes.json` is deployed.

**T-H3: Console.log Swallowing Converts E2E Suite Into Documentation**
`E2E_TESTING_GUIDE.md` documents this as a _best practice_:

```javascript
try {
  await expect(element(by.id('success'))).toBeVisible();
  console.log('✅ Success message displayed');
} catch (error) {
  console.log('⚠️ Needs verification'); // failure swallowed, test passes
}
```

Tests that can't find elements log warnings and pass. The suite cannot reliably detect regressions.

**T-H4: Coverage Claims Are Inflated — Documentation vs. Reality Mismatch**
`E2E_CRITICAL_PATHS_STATUS.md` (Feb 13): "100% Test Coverage Complete." `E2E_FIRST_RUN_ISSUES.md` (Feb 15): "0/7 passing." ACTIVE_PLAN: 92% testing score based on 354 test _files_ — not a coverage metric. `E2E_UNCOVERED_FEATURES.md`: 62% of features untested (18 feature areas with zero tests: all messaging, all reporting, all notification logic, all subscription management, all Oxford governance, all offline functionality).

---

### Medium

- T-M1: Activity system test plan (150-200 unit + 50-70 integration tests) is entirely unimplemented — all checkboxes unchecked; unclear if the underlying migration was completed
- T-M2: TDD practice applies only to feature code — no tests written for Firestore security rules, Cloud Function authorization, or E2E infrastructure changes
- T-M3: Test credentials (`TestPassword123!`) committed to git in `e2e/setup/testAccounts.json`; no per-test Firestore data cleanup (tests can pollute each other)
- T-M4: Oxford governance entirely absent from test plans — OfficerManagement, BusinessMeetings, OxfordVoting quorum logic, EESTracker all have 0 integration/E2E tests

---

### Low

- T-L1: Path 3 (deep link invite flow) tests are written for an unimplemented feature and counted in coverage percentages; should be `test.skip()` with implementation reference

---

## Documentation Findings (from Phase 3B)

**Total: ~22 findings — 6 Critical, 8 High, several Medium**

### Critical

**D-C1: No Root README**
No `README.md` at the project root. A developer cloning from GitHub sees nothing. Critical setup knowledge (Xcode 26 Podfile fix, node_modules symlink to rats/node_modules, iOS target bump to 13.0) exists only in `MEMORY.md` — a Claude session file, not a developer document.

**D-C2: GAP_ANALYSIS Wrong on Every Metric — Still Listed as Primary Navigation**
Reports 5% test coverage (actual: 92%), Oxford "Not started" (actual: 55%), hardcoded Stripe key (actual: migrated). Still listed as first stop on "what needs to be done" path in `docs/README.md`. Actively misleading every reader.

**D-C3: CLOUD_FUNCTIONS_REVIEW.md Is a Raw AI Transcript**
Opens with "I'll analyze the cloud functions... [15 tools called]". Describes `Guest` entity with `currentWeek`/`previousWeek` fields that were removed in `commit 022ba16`. Creates false impressions about current entity shapes and migration status.

**D-C4: Zero Cloud Functions API Documentation**
49 deployed functions. Not one has documented input parameters, output schema, authorization requirements, or error contracts. ACTIVE_PLAN identifies authorization gaps in `listPayments`/`savePaymentMethod` — but without a contract document, there's no spec to fix against.

**D-C5: No Firestore Schema Reference**
Collections (`houses`, `guests`, `activities`, `week-summaries`, `payments`, Oxford subcollections, `na-meetings`) have zero field-level documentation. Schema must be reverse-engineered from TypeScript entity files. Critically: it's unclear whether production Firestore still has legacy `guest.currentWeek` data or has been fully migrated.

**D-C6: No Development Setup Guide**
No `SETUP.md` or `CONTRIBUTING.md`. iOS build requires a specific Podfile post_install hook for Xcode 26 (documented only in MEMORY.md). No documented commands to start the app, run tests, or deploy functions. New developer onboarding is impossible from docs alone.

---

### High

**D-H1: Embedded `functions/` Deleted Locally But Still Documented as Active**
Git status shows `D` prefix on all `functions/` files (staged or unstaged deletion). ACTIVE_PLAN documents the embedded `functions/` as "an active component with 7 Cloud Functions and 90% test coverage." Either the deletion was intentional (resolving dual-repo conflict) or accidental — neither is documented. This is the most critical documentation-vs-reality gap.

**D-H2: IMPLEMENTATION_PLAN.md Recommends Opposite of Current Architecture**
Prominently states "Key Decision: KEEP the embedded Week model." Current approach normalized away from embedded Week model. Still listed under "Active Plans" in docs/README.md.

**D-H3: WeekSummary Migration Execution Status Unclear**
Code migration is done but `ACTIVE_PLAN` Sprint 9.1 lists "Execute `migrate-full.ts` data migration" as an unchecked future task. Cannot determine if legacy `guest.currentWeek` data still exists in production Firestore without checking the database directly.

**D-H4: No DEPLOYMENT.md**
No documented process for deploying Cloud Functions to Firebase. Given the dual-repo situation and the fact that both repos could overwrite each other, this is a critical operational gap.

**D-H5: No SECRETS.md**
Secret Manager is described as the current approach in ACTIVE_PLAN, but there's no document listing required secrets, their names, and how to provision them. A developer setting up a new Firebase project would have no guidance.

**D-H6: No SECURITY_RULES.md**
Firestore security rules and custom claims structure are not documented anywhere. Rules must be read from `firestore.rules` directly. Custom claim structure (adminHouseIds, superAdminHouseIds, guestHouseIds) is documented only in code.

**D-H7: No DATA_PRIVACY.md**
App collects medication tracking, drug test results, meeting attendance, court placement status, GPS location, SSN last 4. No document describes data classification, retention, deletion, or handling. "HIPAA: Deferred" in kill list is not a privacy policy.

**D-H8: No ARCHITECTURE.md**
Three repos (rats-v2, regroup-functions, rats-web), three clients (mobile, web portal, Stripe webhooks), two databases (Firestore + RTDB) — no system diagram or architectural overview document exists. ADRs for the four major architectural decisions (Week model migration, single vs. dual app, Stripe Connect Express, dual-repo resolution) have no written record.

---

### Medium

- D-M1: Oxford screen implementation status ambiguous — ACTIVE_PLAN says "unknown if implemented," GTM says "ready now"; neither manually E2E verified
- D-M2: Sprint 5 Task 1 (delete `payment.ts`) incomplete — both `payment.ts` and `payments.ts` still exist; `createRentPaymentIntent` (mobile) has no matching backend function
- D-M3: `ACTIVITY_SYSTEM_MIGRATION.md` status still reads "Final Recommendation" — should read "Completed" or "Abandoned"
- D-M4: No ADR trail for four major architectural decisions
- D-M5: Three incompatible pricing documents, no canonical designation
- D-M6: `ACTIVE_PLAN.md` Part 1 not updated to reflect `functions/` deletion state
- D-M7: Sprint 1-4 files show unchecked checklists despite ACTIVE_PLAN claiming "executed"
