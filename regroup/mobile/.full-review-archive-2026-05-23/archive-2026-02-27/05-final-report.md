# Comprehensive Code Review Report — RATS (Regroup App for Tracking Sobriety)

## Review Target

`docs/` directory — 33 active documentation files covering strategy, implementation plans, E2E testing docs, type-fix summaries, and sprint plans for a React Native / Firebase / TypeScript sober living home management application.

**Review Date:** February 27, 2026
**Phases Completed:** 5 (Quality + Architecture, Security + Performance, Testing + Documentation, Best Practices + CI/CD, Consolidated Report)

---

## Executive Summary

The RATS documentation corpus describes a solo-developer React Native app that has made significant technical progress — Redux migration complete, TypeScript near strict-mode, 4310+ passing unit tests, 5 Oxford House screens implemented, Stripe Connect integrated. However, the documentation layer has **not kept pace with implementation**. The result is a documentation set that is actively harmful: it directs readers to superseded strategies, reports false coverage metrics, teaches anti-patterns as best practices, and obscures critical production readiness gaps.

Three categories of finding dominate this review:

1. **Safety-critical gaps with no sprint assignment**: Firebase RTDB completely open, payment functions with no authorization, 49 Cloud Functions deployed manually with no CI gate, no deployment runbook, and no incident response procedures.

2. **Documentation that actively misleads**: GAP_ANALYSIS reports 5% test coverage (actual: 92%); "100% E2E coverage" means test code written, not tests passing (actual: 0/7 passing); sprint-5 Cloud Function code uses v1 API (project is on v2 SDK); E2E guide teaches assertion-swallowing as a best practice.

3. **Structural fragmentation**: Four documents claim to be the authoritative source for "what to build next." README.md (the entry point) has 9 broken links. The `functions/` directory has been silently deleted locally without a commit, creating a production overwrite risk.

**Total findings: 149 across 8 categories. 31 Critical, 49 High, 50 Medium, 19 Low.**

---

## Findings by Priority

### P0 — Critical Issues (Must Fix Before Production Traffic)

All 31 Critical findings are listed below, grouped by theme.

#### Security & Data Protection (7)

**S-C1: Firebase RTDB Rules Completely Open** — `database.rules.json`: `.read: true, .write: true`. House group chat contains recovery status, drug test results, personal crises. Any person with the Firebase project ID (embedded in app binary) can read all messages. Documented as "1 hour fix" in PRODUCT_STRATEGY_ASSESSMENT but not in any sprint plan.

**S-C2: Payment Functions Have No Authorization** — `listPayments` and `savePaymentMethod` have zero auth checks. Any authenticated user can read any guest's full payment history or attach payment methods to other guests' accounts. ACTIVE_PLAN acknowledges: "Privacy violation, potential legal liability." Fix in unexecuted Sprint 5.3.

**S-C3: Oxford Subcollections Have Zero Firestore Rules** — `houses/{houseId}/officers`, `/meetings`, `/votes`, `/ees` have no security rules. Any signed-in user can read/write anonymous expulsion votes and EES financial records. ACTIVE_PLAN marks P0; fix is unexecuted Sprint 5.4.

**S-C4 / T-C4: `handleStripeConnectWebhook` Not Implemented** — Exported but body is empty. Operators who complete Stripe Express onboarding never transition from PENDING → ACTIVE. Resident payments fail. Silently failing for unknown number of billing cycles. Operators stuck in PENDING is confirmed in GTM plan.

**S-C5: Stripe Secret Key Rotation Unverified** — GAP*ANALYSIS documented a hardcoded `sk_live*\*`key in`regroup-functions/functions/src/api/stripe.ts`. ACTIVE_PLAN claims Secret Manager migration, but rotation in Stripe Dashboard is unconfirmed. Key may remain functional in git history.

**S-H1: No Privacy Framework for Sensitive Health-Adjacent Data** — App collects medication tracking, sobriety dates, drug tests (UA/BA), AA/NA attendance, mental health indicators, GPS location, SSN last 4, DoB, court placement status. No data classification, retention schedule, deletion procedures, or breach notification plan. HIPAA explicitly in Kill List as "Deferred." ToS/Privacy Policy are Sprint 9 tasks — after user acquisition begins.

**S-H2: `subscriptionIsActive()` Returns False for 'trialing'** — Every paywall guard blocks legitimate trialing operators. All call sites need auditing. Inverse risk: `past_due`/`unpaid` may not be checked, allowing continued access after payment failure. Zero test coverage for any non-`'active'` subscription status (T-C3).

#### CI/CD & Deployment (5)

**CD-C1: Zero CI/CD for `regroup-functions`** — 49 Cloud Functions handling payments, auth, and webhooks are deployed manually. No test gate, no TypeScript check, no deploy approval, no post-deploy verification. Sprint 9.3 adds CI — after user acquisition begins.

**CD-C2: No Deployment Documentation for Any Component** — No `DEPLOYMENT.md` exists. Deploying Cloud Functions, Firestore rules, Firestore indexes, iOS to TestFlight, App Store production, Android Play Store — all are entirely undocumented procedures.

**CD-C3: Dual-Repo Deployment Could Silently Overwrite Production Payment Functions** — `functions/` directory in mobile repo is locally deleted (14 files with `D` prefix in git status) but uncommitted. Running `firebase deploy --only functions` from mobile repo deploys old, potentially auth-vulnerable payment functions over production.

**CD-C4: No Environment Separation — Firebase Project Role Unresolved** — GTM plan Section 10, Open Question 5: "Is `phoenix-cleanhouse` production or staging?" No document answers this. No staging vs. production Stripe key documentation. No environment-specific deploy configs.

**CD-C5: No Documented Secrets Management — Stripe Key Rotation Unverified** — No SECRETS.md. Sprint 5.6/5.7 ("Set real Stripe publishable key," "Configure Stripe webhook secret") are unchecked with no procedure. Rotation of the git-history Stripe key is undocumented.

#### Documentation Structure (7)

**C-1: README.md Has 9 Broken Links** — Primary navigation document links to 9 non-existent files. `MIGRATION_STATUS.md` referenced 6 times as "Single Source of Truth" — does not exist. 3 of 4 links in "understand technical architecture" onboarding path are dead.

**C-2: GAP_ANALYSIS_PRODUCTION_READINESS.md Is Actively Misleading** — Reports 5% test coverage (actual: 92%), Oxford "Not started" (actual: 55%), hardcoded Stripe key (actual: in Secret Manager). Still listed as "Top Priority Document" in README.

**C-3: IMPLEMENTATION_PLAN.md Contradicts Current Architecture** — Recommends "KEEP embedded Week model" (reversed), describes Oxford as unbuilt (all 5 screens exist), uses `mapStateToProps` (replaced). Still listed as "Top Priority Document for Implementation Strategy."

**C-A1: Authority Fragmentation** — ACTIVE_PLAN.md, IMPLEMENTATION_PLAN.md, FEATURE_PRIORITY_ROADMAP.md, and GTM Action Plan simultaneously claim to be the authoritative "what to build next" source. Any document a developer opens other than ACTIVE_PLAN gives materially different guidance.

**D-C1: No Root README** — No `README.md` at the project root. Critical setup knowledge (Xcode 26 Podfile fix, node_modules symlink, iOS target 13.0) is only in `MEMORY.md` — a Claude session file, not a developer document.

**D-C4: Zero Cloud Functions API Documentation** — 49 deployed functions. Not one has documented input parameters, output schema, authorization requirements, or error contracts.

**D-C5: No Firestore Schema Reference** — Collections have zero field-level documentation. Schema must be reverse-engineered from TypeScript entity files. Unknown whether production Firestore still has legacy `guest.currentWeek` data.

#### Testing Infrastructure (4)

**T-C1: E2E Infrastructure Has Never Produced a Passing Test Run** — `E2E_FIRST_RUN_ISSUES.md` (Feb 15, 2026): "0/7 passing." `E2E_CRITICAL_PATHS_STATUS.md`: "100% Test Coverage Complete" — means 100% of scenarios were _written_, not executed. All 72 scenarios are untested at runtime.

**T-C2: Zero Payment E2E or Security Tests** — `listPayments` authorization vulnerability and `savePaymentMethod` cross-account access have zero test coverage. Stripe webhook `payment_intent.succeeded`, operator onboarding, cross-house payment access, and failed payment handling — none covered.

**D-C3: CLOUD_FUNCTIONS_REVIEW.md Is a Raw AI Transcript** — Opens with "I'll analyze the cloud functions... [15 tools called]". Describes entities with fields removed in `commit 022ba16`. Misleads on current function signatures and migration status.

**D-C6: No Development Setup Guide** — No `SETUP.md` or `CONTRIBUTING.md`. iOS build requires a specific Podfile post_install hook documented only in MEMORY.md. No documented commands to start the app, run tests, or deploy functions.

#### Framework (3)

**BPC-C1: Cloud Function Code in Active Sprint Plans Uses v1 Import Syntax** — `sprint-5-oxford-acquisition.md` and `ACTIVITY_SYSTEM_MIGRATION.md` use `import * as functions from 'firebase-functions'` and `context.auth` — v1 API. Backend is on firebase-functions v7.x (v2 SDK) which uses `firebase-functions/v2/https` and `request.auth`. Code in sprint-5 will not compile.

**BPC-C2: E2E Xcode Guide Recommends Downgrading to Xcode 15.4** — `E2E_XCODE_ISSUE.md` marks this as "99% success rate" primary fix. The correct solution (Podfile post_install hook) is already implemented but documented only in MEMORY.md.

**BPC-C3: CI/CD YAML Examples Use EOL GitHub Actions Versions and EOL Node.js 16** — `E2E_TESTING_GUIDE.md` CI examples use `actions/checkout@v2`, `actions/setup-node@v2`, `actions/upload-artifact@v2` (all retired 2024; use `@v4`). Node.js 16 (EOL September 2023) specified; firebase-admin v13.x requires Node.js 18 minimum.

---

### P1 — High Priority (Fix Before Next Release)

**49 findings across all categories.** Selected high-impact items:

**Security (7):**

- S-H3: Dual-repo deployment could overwrite production Cloud Functions — must resolve before any deployment
- S-H4: Stripe webhook signature verification status unconfirmed — forged webhooks could mark unpaid rent as paid
- S-H5: 2FA deferred to Sprint 9 — operators have full access to all resident health-adjacent data with no MFA
- S-H6: `phoenix-cleanhouse` environment ambiguity — real users may be entering a staging environment
- S-H7: Server-side rate limiting absent — all 49 Cloud Functions exposed to enumeration/billing DoS via Stripe intents

**Performance (7):**

- P-C1: N+1 Cloud Function calls on payment dashboard — 15 concurrent cold-start invocations → 5-10s load
- P-C2: Sequential per-guest subcollection reads in `onWeekWrite` — 170,000 sequential Firestore reads/day at scale
- P-H4: `endOfDayReminder` nested N sequential reads — 1,200 sequential reads per execution, approaches Function timeout
- P-H2: Activities array in Week document is unbounded — no overflow strategy documented
- P-M8: `firestore.indexes.json` not deployed — first production `house-activities` query will fail with runtime error

**Testing (4):**

- T-H3: Console.log swallowing documented as E2E best practice — suite cannot detect regressions by design
- T-H1: No performance tests despite documented 500ms query SLA — `waitForFirebaseSync(2000)` doesn't assert SLAs
- T-H2: Firebase emulator doesn't enforce composite index requirements — indexes pass locally, fail in production
- T-H4: Coverage claims inflated — "92% testing score" is based on 354 test files, not a coverage metric; 62% of features untested

**Documentation (8):**

- D-H1: `functions/` deleted locally but documented as active in ACTIVE_PLAN
- D-H2: IMPLEMENTATION_PLAN.md recommends opposite of current architecture — still listed as active
- D-H4: No DEPLOYMENT.md
- D-H5: No SECRETS.md
- D-H6: No SECURITY_RULES.md — custom claims structure undocumented
- D-H7: No DATA_PRIVACY.md — app collects PHI with no documented handling policy
- D-H8: No ARCHITECTURE.md — three repos, three clients, two databases; no system diagram
- D-H3: WeekSummary migration execution status unknown — production may still have legacy `guest.currentWeek` data

**Framework (6):**

- BPC-H1: IMPLEMENTATION_PLAN.md advises against strict TypeScript — contradicts completed migration direction
- BPC-H2: E2E test template teaches try/catch assertion swallowing — root cause of T-C1
- BPC-H5: `react-native-push-notification` is archived (2023) — sprint-3 adds it as new dependency
- BPC-H6: `useFormik` recommended for new forms — Formik in maintenance mode since 2023
- BPC-H4: E2E guide specifies Android SDK 30 — Play Store requires targetSdkVersion 34

**CI/CD (6):**

- CD-H1: Mobile CI has no coverage threshold, no `tsc --noEmit`, `--passWithNoTests` flag — CI green is not a quality signal
- CD-H2: No documented iOS or Android release process
- CD-H3: No rollback strategy for Cloud Functions, mobile app, or data migrations
- CD-H4: Monitoring undocumented and likely non-functional (Sentry unverified in production, zero analytics events)
- CD-H5: Firebase IaC fragmented across repos; `database.rules.json` status (dev vs. production) ambiguous
- CD-H6: No incident response procedures, no runbooks, no oncall documentation

---

### P2 — Medium Priority (Plan for Next Sprint)

**~50 findings.** Selected representative items by category:

**Code Quality:** Three documents with conflicting revenue projections, pricing in 3 places with incompatible numbers, two Sprint 5 documents that don't reference each other or ACTIVE_PLAN's Sprint 5 (different topic), GAP_ANALYSIS stale, sprint numbering collision (completed Feb 23 sprints and ACTIVE_PLAN forward sprints both start at 5).

**Security:** `admins` and `guest-reports` Firestore collections "overly permissive" (no specifics), ToS/Privacy Policy not published while app is live (Apple/Google policy violation, CCPA exposure), `oxfordEnabled` flag set via HTTP-callable without documented auth check.

**Performance:** `disputes` map in house document grows unboundedly, `subscriptionMetadata` loaded once at login never refreshed (lapsed subs show as active mid-session), 13 independent `useAppSelector` calls in App.tsx, wildcard lodash imports blocking Metro tree-shaking.

**Testing:** Activity system test plan (150-200 unit + 50-70 integration tests) entirely unimplemented — all checkboxes unchecked; test credentials committed to git (`TestPassword123!`); no per-test Firestore data cleanup; Oxford governance (OfficerManagement, BusinessMeetings, OxfordVoting, EESTracker) has 0 integration/E2E tests.

**Documentation:** Oxford screen implementation status ambiguous (ACTIVE_PLAN "unknown if implemented," GTM "ready now"); `payment.ts` and `payments.ts` both exist (Sprint 5 Task 1 incomplete); three incompatible pricing documents with no canonical designation; `ACTIVITY_SYSTEM_MIGRATION.md` status still reads "Final Recommendation" — should read "Completed" or "Abandoned."

**Framework:** Cloud Function code in `ACTIVITY_SYSTEM_MIGRATION.md` uses `any` typing inconsistent with strict TypeScript target; global Detox CLI install deprecated since Detox 20; `TypedUseSelectorHook` deprecated in RTK 2.0 (use `withTypes()`); `PureComponent` documented positively — blocks React 18 concurrent features; `@react-native-firebase` vs. web Firebase SDK syntax ambiguity in FieldValue examples.

**CI/CD:** No staging-to-production promotion gate for Cloud Functions; no Android build CI gate; `migrate-full.ts` has no documented backup procedure; `agent-task.yml` uses temporary private repo clone with broad secret scope; `firestore.indexes.json` not version-controlled or deployment-gated.

---

### P3 — Low Priority (Track in Backlog)

**~19 findings.** Selected items:

- CORE_REQUIREMENTS.md uses non-standard footnote citation syntax
- Sprint plans embed Claude-specific AI agent instructions in human-readable docs
- E2E Testing Guide specifies Node 16+, Xcode 14+, Android SDK 30+ (all outdated minimums)
- Test credentials (`CustomPass123!`) inlined in E2E documentation
- No CI/CD for regroup-functions means no security audit trail for role changes and payment operations
- `ubuntu-latest` CI runner in iOS E2E test example — requires macOS
- Test artifact retention (7 days unit, 30 days E2E) insufficient for potential compliance requirements
- CI Node.js version inconsistent across workflows (Node 18 vs Node 20)
- No PR template or documented branch protection rules
- React Query should be preferred over new RTK `createAsyncThunk` thunks for server state (guidance missing)
- Path 3 deep-link invite flow E2E tests written for unimplemented feature — should be `test.skip()`

---

## Findings by Category

| Category           | Total   | Critical | High   | Medium | Low    |
| ------------------ | ------- | -------- | ------ | ------ | ------ |
| Code Quality       | 26      | 4        | 9      | 8      | 5      |
| Architecture       | 10      | 2        | 4      | 3      | 1      |
| Security           | 21      | 5        | 7      | 6      | 3      |
| Performance        | 18      | 2        | 5      | 9      | 3      |
| Testing            | 13      | 4        | 4      | 4      | 1      |
| Documentation      | 22      | 6        | 8      | 7      | 1      |
| Framework/Language | 19      | 3        | 6      | 7      | 3      |
| CI/CD & DevOps     | 20      | 5        | 6      | 6      | 3      |
| **Total**          | **149** | **31**   | **49** | **50** | **20** |

---

## Recommended Action Plan

Actions are ordered by risk/blocking impact, not necessarily sprint order. Items within a group can be parallelized.

### Immediate (Before Next Developer Session or User Acquisition)

1. **Commit the `functions/` deletion** in the mobile repo with an explicit commit message: "Remove embedded functions/ — regroup-functions is canonical source." Update ACTIVE_PLAN to confirm. _(Small — 15 minutes; resolves CD-C3, D-H1)_

2. **Lock RTDB rules** — Replace `.read: true, .write: true` with authenticated, house-scoped rules. Documented as a "1 hour fix." _(Small — 1-2 hours; resolves S-C1)_

3. **Add authorization to `listPayments` and `savePaymentMethod`** — Verify `request.auth.uid` matches the requested guest's userId, or restrict to house admin/operator. _(Small-Medium — Sprint 5.3)_

4. **Add Firestore rules for Oxford subcollections** — Officers, meetings, votes, ees subcollections need rules scoped to house members and role-based access. _(Small-Medium — Sprint 5.4)_

5. **Implement `handleStripeConnectWebhook`** — The function signature exists; the body is empty. Stripe `account.updated` handler needs to flip operator status from PENDING → ACTIVE in Firestore. _(Medium — Sprint 6 priority)_

6. **Fix `subscriptionIsActive()` for 'trialing'** — Add `|| status === 'trialing'` to every paywall guard that calls this function. Audit all call sites. _(Small — Sprint 5.2)_

### Before Any Production Traffic

7. **Create `/docs/DEPLOYMENT.md`** — Document: which Firebase project is production, CLI commands for Functions/rules/indexes deployment, iOS TestFlight process, Android Play Store process. _(Medium — 4-8 hours)_

8. **Create `/docs/SECRETS.md`** — List all secrets, storage location (Secret Manager vs. env), provisioning procedure. Explicitly confirm Stripe key rotation from git history. _(Small — 2-3 hours)_

9. **Confirm `phoenix-cleanhouse` project role** — Answer GTM Section 10 Open Question 5. Document in DEPLOYMENT.md. _(Small — 1 hour investigation)_

10. **Create `/docs/SETUP.md`** — Minimum: Xcode 26 Podfile hook, node_modules symlink, Firebase emulator setup, `pod install` location, how to run tests. Move content out of MEMORY.md. _(Small-Medium — 2-3 hours)_

11. **Deploy `firestore.indexes.json`** — Add composite indexes for `house-activities` collection (WHERE + orderBy combinations). Deploy before first production user reaches the activity feed. _(Small — 30 minutes)_

### Documentation Sprint (Can Be Batched)

12. **Archive misleading documents** — Move `GAP_ANALYSIS_PRODUCTION_READINESS.md`, `IMPLEMENTATION_PLAN.md`, `FEATURE_PRIORITY_ROADMAP.md` to `docs/archive/` with supersession banners pointing to ACTIVE_PLAN.md. Rewrite `docs/README.md` to fix 9 broken links. _(Small — 2-3 hours)_

13. **Fix all Cloud Function code examples** — Update `sprint-5-oxford-acquisition.md` and `ACTIVITY_SYSTEM_MIGRATION.md` to use v2 SDK imports (`firebase-functions/v2/https`, `request.auth`). _(Small — 1-2 hours; must be done before sprint-5 execution)_

14. **Replace E2E test template** — Remove the try/catch assertion-swallowing pattern from `E2E_TESTING_GUIDE.md`. Update CI YAML examples to use `@v4` actions and Node.js 20. Update Android SDK prerequisite from 30 to 34. _(Small — 1 hour)_

15. **Add CI quality gates to mobile workflow** — Add `tsc --noEmit`, `npm audit --audit-level=high`, coverage threshold. Remove `--passWithNoTests`. _(Small — 1 hour)_

### Sprint Improvements

16. **Replace `react-native-push-notification` in sprint-3** — Substitute `@notifee/react-native` for local notifications. `react-native-push-notification` is archived. _(Small — affects sprint-3 plan; no code written yet)_

17. **Add CI for `regroup-functions`** — GitHub Actions workflow with test gate + TypeScript check + staging deploy + production deploy on approval. ACTIVE_PLAN Sprint 9.3. _(Large — move to earlier sprint given critical risk)_

18. **Verify and document Sentry in production** — Sprint 9.4 lists this as a future task; it should be verified immediately. Add Cloud Monitoring alert for payment function error rates. _(Small — 2 hours)_

19. **Create `/docs/RUNBOOKS.md`** — Payment failure response, security rules lockdown, secret rotation. Minimum viable incident response. _(Medium — 4-6 hours)_

20. **Add `subscriptionIsActive()` tests** — Cover `'trialing'`, `'past_due'`, `'canceled'`, `'incomplete'` statuses. This is the minimal test safety net for paywall logic. _(Small — 2 hours)_

---

## Review Metadata

- **Review date:** February 27, 2026
- **Phases completed:** Pre-flight, 1A (Code Quality), 1B (Architecture), 2A (Security), 2B (Performance), 3A (Testing), 3B (Documentation), 4A (Framework/Language), 4B (CI/CD), 5 (Consolidated Report)
- **Flags applied:** None (security_focus: false, performance_critical: false, strict_mode: false)
- **Framework:** React Native 0.72 / Firebase SDK v2 / TypeScript / Redux Toolkit / React Query / Stripe Connect Express / Detox
- **Files reviewed:** 33 active docs (excluding 57 archived historical session summaries)
- **Total findings:** 149 (31 Critical, 49 High, 50 Medium, 20 Low)
