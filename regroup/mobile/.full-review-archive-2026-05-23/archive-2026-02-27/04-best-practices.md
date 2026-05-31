# Phase 4: Best Practices & Standards

## Framework & Language Best Practices Findings (from Phase 4A)

**Total: 19 findings — 3 Critical, 6 High, 7 Medium, 3 Low**

### Critical

**BPC-C1: Cloud Functions Sprint-5 Code Uses v1 Import Syntax — Project Is on v2 SDK**
`sprint-5-oxford-acquisition.md` (line 362), `ACTIVITY_SYSTEM_MIGRATION.md` (lines 1627, 1677, 1798): All Cloud Function code examples use `import * as functions from 'firebase-functions'` and `context.auth` — v1 API. `ACTIVE_PLAN.md` explicitly states the backend uses "firebase-functions v7.x, firebase-admin v13.x." The v2 SDK removes `context.auth` entirely; it becomes `request.auth`. A developer following sprint-5 as written will produce functions that do not compile against the deployed SDK.
_Fix: Replace all v1 patterns with v2 imports (`firebase-functions/v2/https`, `firebase-functions/v2/firestore`, `request.auth` instead of `context.auth`). Add a note at the top of all function code blocks: "Uses firebase-functions v2 SDK."_

**BPC-C2: E2E Xcode Guide Recommends Downgrading to Xcode 15.4 — Podfile Fix Supersedes This**
`E2E_XCODE_ISSUE.md` (lines 43–54, 115–117): Recommends downloading and switching to Xcode 15.4 as the "99% success rate" fix. The correct fix (a `post_install` header search path hook in `ios/Podfile`) is implemented and documented only in `MEMORY.md`. A developer following `E2E_XCODE_ISSUE.md` downloads an old Xcode version unnecessarily and may still hit the VFS overlay issue this document doesn't address.
_Fix: Update `E2E_XCODE_ISSUE.md` to mark Option 1 (downgrade) as superseded. Replace with the Podfile fix. Update `E2E_TESTING_GUIDE.md` Xcode prerequisite from "Xcode 14+" to "Xcode 15+ or Xcode 26 with Podfile post_install hook applied."_

**BPC-C3: CI/CD YAML in E2E Documentation Uses End-of-Life GitHub Actions Versions**
`E2E_TESTING_GUIDE.md` (lines 354–392), `ACTIVITY_SYSTEM_TEST_PLAN.md` (line 437): CI examples use `actions/checkout@v2`, `actions/setup-node@v2`, `actions/upload-artifact@v2` — all retired in 2024 (current: `@v4`). Node.js version specified is `16` — EOL September 2023; firebase-admin v13.x requires Node.js 18 minimum. E2E testing guide prerequisite also states "Node.js 16+" (line 24), contradicting the SDK minimum.
_Fix: Update all CI YAML examples to `@v4` actions, `node-version: '20'`. Update prerequisites to "Node.js 18+ (Node.js 20 LTS recommended)."_

---

### High

**BPC-H1: `IMPLEMENTATION_PLAN.md` Advises Against Strict TypeScript — Contradicts Completed Migration**
Lines 156–159, 524–526: "Don't obsess over 100% strict typing." Also recommends `mapStateToProps` — a pattern fully removed in the completed Redux migration (`useAppSelector` hooks replaced all `connect()` usage). The project's current direction is strict TypeScript enablement (`BATCH_18_SUMMARY.md`: 946/1043 errors fixed, targeting `strict: true`).
_Fix: Prefix with supersession banner. Update TypeScript guidance to "Target strict mode." Update Redux guidance to `useAppSelector`._

**BPC-H2: E2E Test Template Documents try/catch Swallowing as "Best Practice"**
`E2E_TESTING_GUIDE.md` (lines 293–347): Best Practices item 5 documents wrapping assertions in try/catch and logging `console.log('⚠️ Needs verification')` as the recommended pattern. This makes tests permanently pass regardless of whether assertions succeed or fail. Prior findings T-C1 and T-H3 already identify this as a root cause of the E2E suite's uselessness.
_Fix: Replace template with correct pattern — assertions propagate failures; only side-effect operations (taps, navigation) use try/catch with explicit re-throw._

**BPC-H3: E2E Helper Files CommonJS Fix Misses TypeScript-Native Detox Approach**
`E2E_REVIEW_FINDINGS.md` (lines 11–29): Documents fixing helpers with `module.exports = {}` instead of migrating to `.ts` files (which Detox 20+ supports natively). Writing E2E infrastructure in `.js` files in a TypeScript project creates a maintenance split and forgoes type checking for the test layer.
_Fix: Document the correct fix as converting helpers to `.ts` with `export` syntax and updating Detox/Jest E2E config to TypeScript transform._

**BPC-H4: Detox Guide Specifies Android SDK 30 — Play Store Requires SDK 34 Target**
`E2E_TESTING_GUIDE.md` (line 29): "Android SDK 30+" prerequisite. Google Play requires `targetSdkVersion 34` for all new submissions and updates as of 2024. Detox 20+ requires compileSdkVersion 33 minimum. An emulator at API 30 will produce test failures due to SDK mismatch.
_Fix: Update to "Android SDK 34+ (API 34 emulator recommended; minimum API 33 for React Native 0.72)."_

**BPC-H5: `react-native-push-notification` Documented as Active Library — Archived Since 2023**
`2026-02-23-sprint-3-revenue.md` (lines 7, 658, 746, 953): Full integration code for this library in the rent reminder sprint. The library is archived/unmaintained. Community standard replacement: `@notifee/react-native` (maintained by React Native Firebase team; similar API, actively developed).
_Fix: Replace sprint-3 push notification integration with `@notifee/react-native`. Add note that `react-native-push-notification` is archived._

**BPC-H6: `useFormik` Recommended for New Forms — Formik in Maintenance Mode Since 2023**
`CODEBASE_ANALYSIS_REWRITE_VS_REFACTOR.md` (lines 265–282): Recommends `useFormik` as the target for new forms. Formik entered maintenance mode in 2023 with the maintainer recommending migration to `react-hook-form`. Payment forms and Oxford House creation forms documented as future work should use `react-hook-form + zod`.
_Fix: Update to recommend `react-hook-form + zod` for new forms. Document `useFormik` as migration target for existing Formik code only._

---

### Medium (7)

- BPC-M1: Cloud Function code in `ACTIVITY_SYSTEM_MIGRATION.md` uses `any` typing (`let houseQuery: any`, untyped `document.data()`) — contradicts strict TypeScript target
- BPC-M2: `E2E_TESTING_GUIDE.md` instructs `npm install -g detox-cli` — global Detox CLI was deprecated in Detox 20; use `npx detox` instead; version not pinned
- BPC-M3: `IMPLEMENTATION_PLAN.md` documents `TypedUseSelectorHook` — deprecated in Redux Toolkit 2.0 (December 2023); modern pattern is `useSelector.withTypes<RootState>()`
- BPC-M4: `CODEBASE_ANALYSIS_REWRITE_VS_REFACTOR.md` frames `PureComponent` as positive — class components cannot use React 18 concurrent features (transitions, `useDeferredValue`); document as migration target not permanent state
- BPC-M5: `sprint-3-revenue.md` push notification code omits iOS permission request flow (`requestPermission()`) required before any local notifications deliver on iOS 14+
- BPC-M6: `FEATURE_PRIORITY_ROADMAP.md` uses Q1-Q4 2025 tier labels — 12+ months past; entire priority framework appears historical (flagged in Phase 1 as C-4, document unchanged)
- BPC-M7: `ACTIVITY_SYSTEM_MIGRATION.md` uses `FieldValue.increment()` without clarifying `@react-native-firebase` vs. web Firebase SDK syntax — copying web SDK examples into this codebase produces subtle runtime errors

---

### Low (3)

- BPC-L1: `ACTIVITY_SYSTEM_TEST_PLAN.md` uses `runs-on: ubuntu-latest` for iOS E2E test CI example — iOS builds require macOS runners
- BPC-L2: `IMPLEMENTATION_PLAN.md` completed 12-week timeline still listed under "Active Plans" in README.md — historical artifact presenting as forward plan
- BPC-L3: `CODEBASE_ANALYSIS_REWRITE_VS_REFACTOR.md` missing guidance to prefer React Query over new RTK `createAsyncThunk` thunks for server state — project already uses React Query; new async data fetching should default there

---

## CI/CD & DevOps Practices Findings (from Phase 4B)

**Total: 20 findings — 5 Critical, 6 High, 6 Medium, 3 Low**

### Critical

**CD-C1: Zero CI/CD for `regroup-functions` — 49 Cloud Functions Deployed Manually**
ACTIVE*PLAN Part 2 rates DevOps 72%: "CI for mobile (unit + E2E), no CI for regroup-functions, manual deploy." Sprint 9.3 allocates 1 day to add CI (future sprint). Every payment function, webhook handler, scheduled job, and auth function is deployed with no automated gate: no test run, no TypeScript check, no deploy approval, no post-deploy verification. A broken payment function deployment is invisible until users are affected.
\_Fix: Create `.github/workflows/deploy-functions.yml` in `regroup-functions` with gates: run 122 tests → TypeScript typecheck → deploy to staging → smoke test callables → production on manual approval. At minimum, document the manual procedure in `DEPLOYMENT.md` before CI exists.*

**CD-C2: No Documented Deployment Process for Any Component**
No `DEPLOYMENT.md` exists. The following are entirely undocumented: deploying Cloud Functions (which Firebase project, which service account, which command), deploying Firestore security rules, deploying Firestore indexes, iOS build submission to TestFlight, App Store production promotion, Android Play Store submission. Sprint 9.8 allocates 2 hours to "Document dual-repo deployment process" — after user acquisition is planned to begin.
_Fix: Create `/docs/DEPLOYMENT.md` before any production traffic. Include: target Firebase project per component, required CLI tools, step-by-step command sequences, and authorization requirements._

**CD-C3: Dual-Repo Deployment Could Silently Overwrite Production Payment Functions**
`functions/` in the mobile repo has been locally deleted (git status shows `D` prefix on 14 files) but the deletion is uncommitted. There is no ADR, no commit message, and ACTIVE*PLAN does not document the resolution. Running `firebase deploy --only functions` from the mobile repo before committing the deletion would deploy the old (potentially auth-vulnerable) payment functions, overwriting whatever is running from `regroup-functions`.
\_Fix: Commit the `functions/` deletion with an explicit message designating `regroup-functions` as canonical. Update ACTIVE_PLAN. Remove the `functions/` deploy target from `firebase.json` if present.*

**CD-C4: No Environment Separation — `phoenix-cleanhouse` Project Role Unresolved**
GTM action plan Section 10, Open Question 5: "Is `phoenix-cleanhouse` the production Firebase project or staging?" No document in the corpus answers this. No documentation of staging vs. production Stripe key configuration, environment-specific Firebase config, or whether CI pipelines target staging before production.
_Fix: Document which Firebase project is production. Create environment-specific deployment configs. Add the answer to DEPLOYMENT.md._

**CD-C5: No Documented Secrets Management — SECRETS.md Missing, Stripe Key Rotation Unverified**
Every required secret (Firebase credentials, Stripe publishable/secret/webhook keys, SendGrid, Google Maps) is undocumented. Sprint 5.6/5.7 tasks "Set real Stripe publishable key" and "Configure Stripe webhook secret" are unchecked with no documented procedure. Prior finding S-C5 noted a Stripe secret key in git history — rotation confirmation not documented anywhere.
_Fix: Create `/docs/SECRETS.md` listing all secrets, storage location, and provisioning procedure. Include explicit rotation confirmation for the git-history Stripe key._

---

### High

**CD-H1: Mobile CI Has Critical Quality Gates Missing**
`.github/workflows/unit-tests.yml`: (1) `--no-coverage` — no coverage threshold enforced; (2) `--passWithNoTests` — CI passes even if zero test files found; (3) no `tsc --noEmit` — TypeScript errors are invisible to CI; (4) no `npm audit` — security vulnerabilities in dependencies not caught; (5) E2E workflow exists (230 lines) but E2E tests have never produced a confirmed passing run (prior finding T-C1).
_Fix: Add `tsc --noEmit`, `npm audit --audit-level=high`, coverage threshold `--coverageThreshold='{"global":{"lines":70}}'`. Remove `--passWithNoTests`._

**CD-H2: No Documented iOS or Android Release Process**
No document describes version/build number incrementing, Xcode archive procedure, TestFlight upload, App Store submission checklist, or App Store review timeline. Same gap for Android Play Store. The app is described as live; its submission process is tribal knowledge.
_Fix: Add "Mobile App Release" section to `DEPLOYMENT.md` covering Xcode archive, TestFlight, and App Store review. Include Android equivalent._

**CD-H3: No Rollback Strategy for Cloud Functions, Mobile App, or Data Migrations**
No runbook exists for: rolling back a broken Cloud Function deployment (requires manually re-deploying prior version from git — procedure undocumented), App Store rollback (not possible; requires new submission), Firebase security rules rollback, or `migrate-full.ts` data migration rollback. Sprint 9.1 runs the data migration with no documented Firestore export pre-step.
_Fix: Document rollback procedures. Add `firebase firestore:export` as mandatory pre-step before running data migration._

**CD-H4: Monitoring and Observability Undocumented and Likely Non-Functional in Production**
Sentry "initialized" but Sprint 9.4 lists "Verify Sentry captures errors in production builds" as an unchecked future task. Zero Firebase Analytics events instrumented (GTM plan Section 6). No Cloud Monitoring dashboards or error rate alerts for payment functions. No oncall rotation.
_Fix: Add minimum viable monitoring to Sprint 9 as non-skippable: Sentry error budget, Cloud Monitoring alert per payment function error rate, Stripe Dashboard webhook event monitoring._

**CD-H5: Firebase IaC Fragmented — `database.rules.json` Status Ambiguous**
Mobile repo's `firebase.json` is emulator-only (no Firestore, no hosting sections). `database.rules.json` contains `.read: true, .write: true` — unclear whether this is a dev-only file or production configuration. `firestore.indexes.json` location unconfirmed (prior finding P-M8). No CI step validates or deploys rules/indexes.
_Fix: Establish canonical location for all Firebase IaC in `regroup-functions`. Add rules and indexes deployment to CI. Immediately clarify whether `database.rules.json` in the mobile repo is production._

**CD-H6: No Incident Response Procedures Documented**
No runbooks, no incident playbooks, no oncall procedures. No documented response for: payment processing outage, Firestore rules misconfiguration exposing health data, Cloud Function cost spike, Stripe secret key exposure, Firebase project accidental wipe.
_Fix: Create `/docs/RUNBOOKS.md` with at minimum: payment failure response, security rules emergency lockdown, secret key rotation._

---

### Medium (6)

- CD-M1: E2E CI workflow is aspirational — tests have never produced a confirmed passing CI run; workflow produces green status even with zero passing tests
- CD-M2: No staging-to-production promotion gate planned for Cloud Functions CI — single-step deploy to production from merged PRs
- CD-M3: No Android build CI gate — unit test workflow on ubuntu-latest cannot verify Android build; E2E Android path unconfirmed
- CD-M4: `migrate-full.ts` data migration has no documented backup procedure (Sprint 9.1); no dry-run verification criteria; no rollback path
- CD-M5: `agent-task.yml` workflow clones private repo via PAT as a documented temporary pattern committed without tracking issue; exposes `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` to all steps
- CD-M6: `firestore.indexes.json` not version-controlled or deployment-gated; composite indexes required for `house-activities` queries will fail silently in production (prior finding P-M8)

---

### Low (3)

- CD-L1: No pull request template or documented branch protection rules — no mandatory review or CI-passing requirement
- CD-L2: Test artifact retention (7 days unit, 30 days E2E) insufficient for potential compliance requirements given financial and health-adjacent data
- CD-L3: CI Node.js version inconsistent across workflows (Node 18 in unit/E2E, Node 20 in agent-task)

---

## Critical Issues for Phase 5 Context

The following findings from Phase 4 represent new critical gaps not previously captured:

1. **BPC-C1: v1 Cloud Function syntax in active sprint plans** — any developer following sprint-5 will write non-compiling functions; must be fixed before sprint-5 execution
2. **BPC-C2: Xcode downgrade advice actively harms new developer onboarding** — correct Podfile fix exists but is in MEMORY.md (session file) not in any project document
3. **BPC-H2: try/catch swallowing documented as E2E best practice** — root cause of the T-C1 finding that 0/7 tests pass; fixing documentation is prerequisite to fixing the test suite
4. **CD-C1 through CD-C5: Five CI/CD critical gaps** — no backend CI, no deployment docs, uncommitted deletion creating overwrite risk, unresolved production environment, undocumented secrets — all are pre-production blockers
5. **BPC-H5: `react-native-push-notification` is archived** — adding it as a new dependency in sprint-3 will create immediate maintenance debt
