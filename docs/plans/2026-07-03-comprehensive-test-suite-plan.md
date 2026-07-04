# Comprehensive Test Suite Plan — All Products

**Date:** 2026-07-03
**Scope:** `recovery-api`, `detox-recovery`, `homegroups` (functions, web, mobile), `regroup` (functions, web, mobile) — unit tests, integration tests, and the CI wiring to actually run them.
**Goal:** Build full-coverage unit + integration test suites for every app component across the platform, structured so that the concrete findings from the 2026-07-03 full-platform read (`docs/reviews/codebase-review-2026-07-03-full-platform-read.md`) — and defects of the same shape — get caught automatically going forward, not just this once by manual review.
**Audience:** Each phase below is self-contained and can be executed in a fresh chat session. Do not skip Phase 1 — every later phase assumes it's done.

---

## Why this plan exists

Product quality — crashes, wrong data, broken flows — is a direct lever on DAU/MAU/retention: every bug a user hits before a feature "just works" is a reason to open the app less. The 2026-07-03 full-platform read found 69 concrete issues across both products, ranging from a hardcoded house ID that silently misassigns every new resident to a WebView with no message-origin validation. None of these were caught by the existing test suites. This plan exists to close that gap — not just by writing more tests, but by fixing the test _infrastructure_ first, since two of the six product sub-apps currently cannot run their tests at all regardless of how many exist.

---

## Current state (grounded in source, 2026-07-03)

This section is the plan's "Phase 0" — facts gathered directly from config files, package.json scripts, and representative test files, not assumptions. Cite these files directly when implementing later phases; do not invent APIs or config shapes not confirmed here.

### The CI reality

Only **one** GitHub Actions workflow file actually executes: `/.github/workflows/ci.yml` at the repo root (GitHub Actions only discovers workflows in the true repository root's `.github/workflows/`). It has 5 jobs:

| Job                    | What it runs                                                                                                        | Caveat                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `recovery-api`         | `tsc --noEmit` + `npm test -- --passWithNoTests --forceExit`                                                        | `--passWithNoTests` = an empty suite still passes                                           |
| `homegroups-functions` | same pattern                                                                                                        | same caveat                                                                                 |
| `regroup-functions`    | same pattern                                                                                                        | same caveat                                                                                 |
| `detox-recovery`       | same pattern                                                                                                        | same caveat                                                                                 |
| `maestro-smoke`        | Builds a regroup Android APK, runs **one** Maestro Cloud flow (`e2e-maestro/regroup/login-and-view-dashboard.yaml`) | Gated on a secret being present; `continue-on-error: true` — **cannot ever fail the build** |

**`homegroups/web`, `homegroups/mobile`, `regroup/web`, and `regroup/mobile` have zero CI-enforced test execution today.** `homegroups/.github/workflows/*.yml`, `regroup/.github/workflows/*.yml`, and `regroup/mobile/.github/workflows/unit-tests.yml` all exist as tracked files and _describe_ reasonable-looking test jobs, but **none of them execute** — they're nested workflow files left over from when these products were presumably separate repositories before this monorepo was assembled. Anyone auditing "does CI run tests" by reading those files alone would reach the wrong conclusion.

There are two disjoint Maestro suites: the root `/e2e-maestro/` (2 placeholder-selector scaffold flows, one per product — this is the only one CI touches) and `regroup/mobile/maestro/` (17 real flows + 2 subflows, covering guest/operator/Oxford journeys in depth — never run in CI). Homegroups has no equivalent rich Maestro suite; its real e2e layer is Detox specs under `homegroups/mobile/e2e/screens/*.spec.js`, which also never run in CI.

No monorepo orchestration exists (no root `package.json`, no Turborepo/Nx/Lerna, no Husky/pre-commit hooks, no coverage aggregation/Codecov). Each CI job hardcodes its own `cd <dir> && npm ci`.

### Per-app test infrastructure

**`recovery-api`** — not deeply audited in this pass; `readiness-report.md:80` (2026-05-31) notes only `health.test.ts` exists, `referrals.ts`/`users.ts` are untested. Treat as a known gap already documented elsewhere; Phase 8 below picks it up.

**`homegroups/functions`** — **healthy foundation.** `jest.config.js` (ts-jest, node env, 30s timeout); 57 test files across `src/tests/` + `src/__tests__/` covering real business logic (Stripe webhooks, tiers, referrals, milestones). Dominant pattern: 49/57 files hand-roll `jest.mock("firebase-admin", …)` with an in-memory Firestore fake (canonical example: `src/__tests__/joinGroupByInviteCode.test.ts:19-82`) — **`firebase-functions-test` is a listed dependency but used by zero test files**; treat it as dead weight, not a pattern to extend. Security rules run only via `npm run test:rules` (`firebase emulators:exec --only firestore 'npm run test'`), which is not wired into the live CI job (the CI job runs plain `npm test`, so `security-rules.test.ts` is explicitly excluded via `testPathIgnorePatterns` and never runs in CI at all).

**`homegroups/web`** — **thin.** Uses CRA's built-in `react-scripts test` (Jest+jsdom, no custom config, no `setupTests.js`). Exactly 3 test files exist, **all content-integrity checks on marketing copy** (`src/pages/__tests__/AboutPage.test.js` etc. — asserting placeholder text isn't shown). Zero coverage of Stripe flows, auth, forms, or the facility dashboard. `homegroups/web/CLAUDE.md` itself says "No automated test suite — verify manually," which was true until these 3 files were added and is now merely misleading.

**`homegroups/mobile`** — **thin relative to surface area.** `jest.config.js` uses the `react-native` preset; `jest.setup.js` (338 lines) centrally mocks every `@react-native-firebase/*` module plus Stripe/navigation/storage — this is the pattern to extend, not replace. Only 10 unit test files exist against 26 Redux slices + 16 models. Detox e2e config lives inline in `package.json`'s `"detox"` key (no separate `.detoxrc.js`); specs live under `e2e/screens/*.spec.js`, keyed to testIDs, and — per the earlier full-platform read — lean heavily on try/catch-swallowed assertions that pass regardless of whether the seeded test account has the right role.

**`regroup/functions`** — **healthy foundation**, comparable to homegroups/functions. Jest config inline in `package.json` (ts-jest, node env, coverage collection configured but **no threshold enforced**). 31+ test files. Canonical Admin-SDK mock pattern: `src/__tests__/payments.test.ts:1-53` — mocks `firebase-functions/v2/https` and `firebase-admin`, but uses `jest.requireActual` to keep `HttpsError` and `Stripe.errors.*` as real classes so `instanceof` checks still work. This is the pattern to copy for new function tests.

**`regroup/web`** — **config broken, specs shallow, toolchain EOL.** `angular.json:85` requires `karma.conf.js`, which **does not exist on disk, in git, or on `origin/main`** — `ng test` cannot run as configured. Separately, the toolchain is Angular ~9.1 / Node-incompatible-without-`--openssl-legacy-provider` (a workaround for pre-Node-17 OpenSSL, itself a sign of an aging, near-EOL stack — `CODEBASE-REVIEW.md` flags Angular 9 / Node 10 EOL as a [H21]/[H18] finding). Existing specs (`auth-service.service.spec.ts`, `auth.guard.spec.ts`, `house.service.spec.ts`, etc.) are all "should be created" stubs — `TestBed` with stubbed dependencies and a single `expect(component).toBeTruthy()`, zero behavioral assertions.

**`regroup/mobile`** — **richest test content in the whole monorepo, but the config wiring is missing.** `package.json` references `jest.config.js`, `jest.config.integration.js`, `jest.config.rules.js`, `jest.setup.js`, and `__mocks__/firebase-setup.js` — **none of these exist**, verified against the working tree, `git ls-files`, and `origin/main`. There is no `jest` key in `package.json` either. Despite this, the test _content_ is substantial and worth preserving/restoring rather than rewriting:

- `src/integration/*.integration.test.ts` (5 files, ~750 lines) — genuine emulator-backed integration tests, bootstrapped by `src/integration/setup.ts` (sets `FIRESTORE_EMULATOR_HOST`/`FIREBASE_AUTH_EMULATOR_HOST`, mocks all `@react-native-firebase/*` modules to bridge to `firebase-admin`, wipes the emulator project `rats-v2-test` before each run) and `src/integration/firebase-admin-setup.ts` (34 lines, `admin.initializeApp({projectId:'rats-v2-test'})`).
- `firebase/__tests__/firestore.rules.test.ts` (1,778 lines) + `storage.rules.test.ts` (835 lines) — mature, thorough `@firebase/rules-unit-testing` emulator suites, bootstrapped correctly (`firebase/__tests__/firestore.rules.test.ts:12-60`).
- `maestro/` — 17 real flow YAMLs + 2 subflows, covering guest and operator/Oxford journeys, with genuine engineering behind the harness (`maestro/scripts/run-flows.sh` handles iOS simulator driver instability with a targeted retry).
- `regroup/mobile/.claude/testing.md` describes all of the above but is **aspirational, not descriptive** in several specifics (wrong emulator host, references a `.maestro/flows/` path that's empty, references config files that don't exist) — do not trust it as ground truth; trust the file-system facts above instead.

---

## Phase 1 — Restore the broken test foundations (BLOCKING)

**Do this before writing a single new test.** Two sub-apps cannot run tests at all right now; adding coverage on top of a broken foundation just produces more tests that silently never execute.

### 1a. Restore `regroup/mobile`'s Jest config layer

What to implement:

- `regroup/mobile/jest.config.js` — base config. Use `homegroups/mobile/jest.config.js` as the structural template (same stack: RN + `@react-native-firebase/*` + Redux Toolkit + React Query), since regroup/mobile shares the same native-module mocking needs. Must include: `preset: 'react-native'`, `transformIgnorePatterns` covering RN + `@react-navigation`, `react-redux`, `@reduxjs`, `@invertase` (React Query), `@stripe`, `date-fns-tz`; `setupFiles: ['react-native/jest/setup.js', './jest.setup.js']`; `testPathIgnorePatterns` excluding `src/integration/` and `firebase/__tests__/` (those need the separate integration/rules configs below) plus `<rootDir>/e2e/` and `<rootDir>/maestro/`.
- `regroup/mobile/jest.setup.js` — mock every `@react-native-firebase/*` module regroup/mobile actually imports (cross-check against `src/services/`: `app`, `auth`, `firestore`, `functions`, `messaging`, `storage` at minimum — confirm the full list via `grep -rl "@react-native-firebase" src/services src/state src/hooks`). Use `homegroups/mobile/jest.setup.js` (338 lines) as the pattern reference for shape (factory functions matching the `firestore()`/`auth()` call-style, statics attached to the mock function), not a copy — regroup's Firestore schema and collection names differ.
- `regroup/mobile/__mocks__/firebase-setup.js` — regroup/mobile's `src/services/*` import a `firebase-setup` module (confirmed: `src/integration/guestCRUD.integration.test.ts:7` imports `firestore` from `'../../firebase-setup'`). Build this mock to match whatever `src/firebase-setup.ts` (or equivalent — locate it first) actually exports.
- `regroup/mobile/jest.config.integration.js` — extends the base config; `moduleNameMapper` pointing `firebase-setup` → `src/integration/firebase-admin-setup.ts` (this is the missing link `research-rg-testinfra` identified); `testMatch: ['**/*.integration.test.ts']`; longer `testTimeout` (30-60s) for emulator round-trips.
- `regroup/mobile/jest.config.rules.js` — extends base; `testMatch: ['**/firestore.rules.test.ts', '**/storage.rules.test.ts']`; no RN preset needed for these (they run in plain Node against the emulator).

Anti-pattern guards:

- Do not invent a different mocking strategy than what the existing 300+ test files already assume (they were written against _some_ config that existed at some point in this project's history — check `git log --all --oneline -- regroup/mobile/jest.config.js` for a deleted version to recover the real prior config before reconstructing from scratch).
- Do not silently change `testMatch` patterns in a way that causes previously-passing (or previously-intended-to-pass) tests to stop being discovered.

Verification checklist:

- [ ] `git log --all --full-history -- regroup/mobile/jest.config.js regroup/mobile/jest.setup.js` — check for a deleted historical version before reconstructing from scratch; if found, recover and adapt rather than writing from nothing.
- [ ] `cd regroup/mobile && npm test` runs without a "no configuration found" error.
- [ ] `npm run test:integration` connects to a running Firestore/Auth emulator (start via `firebase emulators:start --only firestore,auth --project rats-v2-test` first) and passes.
- [ ] `npm run test:rules` passes against the emulator.
- [ ] Run the full unit suite and get an honest pass/fail count — do not assume all existing tests pass once config is restored; some may have rotted against current source.

### 1b. Restore `regroup/web`'s Karma config

What to implement:

- `regroup/web/karma.conf.js` — standard Angular 9 CLI-generated karma config (framework: jasmine, plugins: `karma-jasmine`, `karma-chrome-launcher`, `karma-jasmine-html-reporter`, `karma-coverage-istanbul-reporter`, `karma-angular-html-heat-map`; reporters `progress`/`kjhtml`; `coverageIstanbulReporter` output to `coverage/regroup-web`). This is boilerplate Angular CLI generates via `ng generate` — do not hand-invent custom config beyond the standard shape; if unsure of exact structure, run `npx @angular/cli@9 generate` in a scratch directory to get a reference file rather than guessing.

Decision point (surface to the user, don't decide unilaterally):

- `regroup/web` is on Angular ~9.1 with a Node-version workaround already in place. Before investing in new test coverage here, decide: (a) restore `karma.conf.js` and test against the current EOL stack as-is, or (b) treat the Angular upgrade as a prerequisite. Given `regroup/web`'s actual runtime footprint is thin (per the earlier full-platform read: it's a signup/billing funnel wrapped around a purchased landing-page theme, not a feature-rich app), option (a) is likely the pragmatic choice — flag this explicitly when starting this sub-phase rather than silently picking one.

Verification checklist:

- [ ] `cd regroup/web && npm test` (with `NODE_OPTIONS=--openssl-legacy-provider`) launches Karma and runs the existing stub specs without a config-not-found error.

### 1c. Clean up `homegroups/functions`'s unused `firebase-functions-test` dependency

What to implement: either (a) remove `firebase-functions-test` from `package.json` devDependencies since 0/57 tests use it and `CODEBASE-REVIEW.md` [H22] flags it as version-incompatible with the installed `firebase-functions` v7 anyway, or (b) if there's a reason to keep it (e.g. a planned migration), pin a compatible version and get one real test using it before keeping it in the tree. Don't leave a broken, unused, misleading dependency in place.

Verification checklist:

- [ ] `npm ls firebase-functions-test` no longer shows a version mismatch warning (or the dependency is removed).

### 1d. Confirm/deprecate the dead nested CI workflow files

What to implement: `homegroups/.github/workflows/*.yml`, `regroup/.github/workflows/*.yml`, and `regroup/mobile/.github/workflows/unit-tests.yml` don't execute (see Current State above). Either delete them (if genuinely dead and no longer useful as reference) or move them to a clearly-labeled `docs/archive/` location with a one-line note explaining they're pre-monorepo-merge artifacts kept for reference. Leaving them in `.github/workflows/` paths is actively misleading to anyone auditing CI coverage by grepping for workflow files.

Verification checklist:

- [ ] `find . -path '*/.github/workflows/*.yml' | xargs -I{} dirname {}` shows only the true root `.github/workflows` remaining, OR remaining nested files are clearly relocated/labeled as non-executing.

---

## Phase 2 — Wire real CI for every sub-app

Do this immediately after Phase 1, since there's no point writing new tests in Phases 3–8 if they'll join the pile of tests that never run.

What to implement, all in the single root `/.github/workflows/ci.yml`:

1. Add a `homegroups-web` job: `npm ci && npm test -- --watchAll=false` (CRA's test runner needs `--watchAll=false` in CI or it hangs waiting for file changes — this is a real CRA gotcha, not optional).
2. Add a `homegroups-mobile` job: `npm ci && npx tsc --noEmit && npm test` (the existing nested workflow already had the typecheck step right — just add the actual `npm test` invocation, which was missing).
3. Add a `regroup-web` job: `npm ci && npm test -- --watch=false --browsers=ChromeHeadless` (needs a headless Chrome launcher config in `karma.conf.js` from Phase 1b — `karma-chrome-launcher`'s `ChromeHeadless` flag, standard for CI).
4. Add a `regroup-mobile` job: `npm ci && npm test` at minimum; add `npm run test:integration` and `npm run test:rules` as separate steps/jobs once Phase 1a is confirmed stable, each spinning up the Firebase emulator first (`firebase emulators:exec --only firestore,auth --project rats-v2-test 'npm run test:integration'`).
5. Replace `e2e-maestro/regroup/login-and-view-dashboard.yaml` (the disconnected 2-flow scaffold) with the real `regroup/mobile/maestro/flows/smoke.yaml` (and progressively more of the 17-flow suite) as the CI Maestro target. Remove `continue-on-error: true` once the flow is confirmed stable — a Maestro failure should fail the build, not be advisory.
6. Remove `--passWithNoTests` from every job once each sub-app has at least one real test — an empty test directory should fail CI, not pass it silently.
7. homegroups has no equivalent to regroup's Maestro suite — its real e2e layer is Detox. Add a `homegroups-mobile-e2e` job running the existing Detox specs (`homegroups/mobile/e2e/screens/*.spec.js`) against an iOS simulator or Android emulator in CI (GitHub Actions macOS runners support iOS simulators natively).

Verification checklist:

- [ ] Every one of the 6 product sub-apps has a CI job that runs its actual test command (not just typecheck).
- [ ] No job uses `--passWithNoTests` once it has ≥1 real test.
- [ ] The Maestro job blocks the build on failure (no `continue-on-error`).
- [ ] A deliberately-broken test in each sub-app (temporarily add `expect(true).toBe(false)`, push, confirm CI goes red, then revert) proves each job actually gates merges.

---

## Phase 3 — homegroups/functions: close targeted gaps

This sub-app's foundation is healthy; focus on the specific behaviors the full-platform read flagged as unverified or drift-risk, using the existing `jest.mock("firebase-admin", …)` pattern (canonical reference: `src/__tests__/joinGroupByInviteCode.test.ts:19-82`).

What to implement (test names are suggestions, adapt to the actual callable/trigger names):

- `GroupModel.admins[] vs adminUids[] sync` — a test asserting that **every** admin-grant code path (instant claim, normal approval, direct assignment via `assignAdmin`) writes both arrays, not just the instant-claim path. This directly targets finding #8 from the review.
- A regression test for the `houses`-equivalent trust boundary already confirmed sound in regroup (guest self-elevation prevention) — homegroups should have the equivalent for `members/{groupId}_{userId}` writes: assert a non-admin member update cannot set `isAdmin`, `roles`, or other privileged fields via `firestore.rules`-level testing (homegroups' `security-rules.test.ts`, currently excluded from the default `npm test` run — see Phase 1's note that it only runs via `test:rules`; wire it into the new CI job from Phase 2 as its own step).
- Callable-level test for the `ElectionDetailScreen`/`closeElection` divergence (finding #5) — since the actual vulnerability is that the _client_ bypasses the callable, the functions-side test should assert `firestore.rules` reject a direct client write to `servicePositions`/election winner fields, forcing the callable path.

Verification checklist:

- [ ] `security-rules.test.ts` runs as part of the standard CI job, not only via the separate `test:rules` script.
- [ ] New tests fail against the _current_ rules/code (proving they'd have caught the finding) before any fix is applied, then pass after.

---

## Phase 4 — homegroups/web: from 3 files to real coverage

What to implement, using `@testing-library/react` (already a devDependency) + `@testing-library/jest-dom` (already present) — add `@testing-library/user-event` (currently missing) for interaction tests:

- **A content-scan test that directly catches finding #1** (the `admin@regroup-app.com` cross-product email leak): a single test file that greps every rendered page component's output for the string `regroup-app.com` (or more robustly, asserts the contact email matches a single source-of-truth constant) — cheap, high-value, exactly targeted at a real bug that shipped.
- **Pricing-consistency test targeting finding #18**: assert that every component displaying the group-admin price (`PricingSection.js`, `PricingPage.js`, `ClaimGroupPage.js`, `AdminValuePropScreen`-equivalent) renders the same value, sourced from one constant — this converts "two different numbers for the same plan" from a manual-review catch into an automated one.
- Stripe flow tests for `SubscribePage.js`, `ClaimGroupPage.js`, and `GroupDonationForm.js` — mock `@stripe/react-stripe-js`'s `useStripe`/`useElements`, assert the correct callable (`requestAdminAccessWithSubscription`, `createStripePaymentIntent`) is invoked with the right shape, and that a failed `createPaymentMethod` call surfaces an error rather than silently proceeding.
- A test for `NewsletterSignup.js` proving it does or doesn't actually submit anywhere (currently it's a no-op `console.log` — either fix it and test the fix, or write a test documenting the current (non-)behavior so a future "fix" doesn't silently break an intentional decision).

Verification checklist:

- [ ] `npm test -- --watchAll=false --coverage` shows non-zero coverage on `src/pages/SubscribePage.js`, `ClaimGroupPage.js`, `PricingPage.js` (currently 0%).
- [ ] The cross-product-email test fails if re-run against a version of the code with the bug reintroduced (verify by temporarily reverting the fix, confirming red, then re-applying).

---

## Phase 5 — homegroups/mobile: target the architecture-bypass + known-bug list

This is the largest lift in homegroups. Prioritize by what the full-platform read actually found, not by file-count coverage for its own sake.

What to implement, extending the existing `jest.setup.js` Firebase-mocking pattern and the per-file-override pattern shown in `src/store/slices/__tests__/groupsSlice.test.ts`:

**Direct regression tests for confirmed bugs:**

- `membersSlice.updateGroupMember` (#7) — a test asserting the thunk looks up the member by the composite `${groupId}_${userId}` key, not bare `userId`; should currently FAIL, proving the bug, then pass once fixed.
- `useInitialOnly` no-op (#10) — a test rendering `ProfileManagementScreen`, toggling the setting, saving, and asserting the dispatched payload actually reflects "initial only" rather than the full name.
- `GroupDonationScreen` unawaited `completeDonation` (#11) — a test asserting the success UI does NOT render until the `completeDonation` promise resolves; inject a rejected promise and assert an error state is shown instead of the success state.
- `AnnouncementsScreen`/`AnnouncementDetail` stub replacement (#12) — this is as much a "write the real feature" task as a testing task; once real CRUD is implemented, add tests asserting `updateAnnouncement`/`deleteAnnouncement` actually call the Firestore-backed thunk, not a `console.log`/simulated success. This is the single highest-value item in this phase since it's a fully non-functional admin feature currently shipping.
- `TreasurerHandoffScreen` listener leak (#14) — a test asserting `onSnapshot`'s returned unsubscribe function is called on unmount.
- `MeetingDetailScreen` favorite-state desync (#13) — a test asserting the favorite indicator reflects the user's persisted `favoriteMeetings` array after remount, not stale local state.

**Architecture-conformance tests** (targeting #17 — the 20+ screens bypassing the slices layer): rather than testing each screen individually, add a lightweight static check (a Node script run in CI, not a Jest test) that greps `src/screens/**/*.tsx` for direct `firestore()`/`@react-native-firebase/firestore` imports outside the `src/models/` and `src/store/` directories, and fails CI if the list grows beyond a checked-in baseline. This turns "don't add more architecture violations" into an enforced gate without requiring a full refactor first.

Verification checklist:

- [ ] Each regression test listed above is run once against the _current_ buggy code and confirmed to fail, before any production-code fix is applied.
- [ ] The architecture-conformance script's baseline list matches the count found in the full-platform read (~20 screens) and does not silently grow.

---

## Phase 6 — regroup/functions: close targeted gaps

Foundation is healthy; use `src/__tests__/payments.test.ts:1-53`'s `jest.requireActual` pattern for any test needing real `HttpsError`/`Stripe.errors.*` behavior.

What to implement:

- **EES dual-schema reconciliation test (#53)** — assert that `oxford/index.ts`'s `EESTransaction` writer and `oxford/ees.ts`'s `EESRecord` writer either converge on one shape, or that every reader correctly handles both. This is a data-model bug that will keep causing confusing production issues until it's pinned by a test either way.
- **`houses` delete-rule regression test (#34)** — once the dead rule is fixed (see Phase 1's rules restoration), a rules-emulator test asserting a house admin _can_ delete a house they own, and a non-admin _cannot_.
- Server-side test proving Oxford vote documents scope `individualVotes` correctly once the anonymity fix (Phase 9) lands — this is the highest-value new coverage in this phase given the severity of finding #30.

Verification checklist:

- [ ] `firestore.rules.test.ts` includes a passing `houses` delete test where none existed before.
- [ ] The EES reconciliation test is explicit about which schema is canonical going forward, not just "both are tolerated forever."

---

## Phase 7 — regroup/web: real coverage once Phase 1b unblocks it

Contingent on the Angular-version decision made in Phase 1b. Do not start this phase until `npm test` runs at all.

What to implement:

- Real behavioral tests for `auth-service.service.ts` (login/signup/claim-refresh — currently zero assertions beyond "is truthy") using Angular's `TestBed` with a mocked `AngularFireAuth`/`AngularFirestore`.
- A regression test for the `subscribeOperator()` no-rollback bug (#65) — assert that if the Stripe subscription callable throws after the Firebase user document is created, the flow either rolls back the user doc or surfaces a clear "partial signup" state rather than silently leaving an orphaned super-admin record.
- A test (or a decision to delete the dead code) for `RedirectComponent` (#66) — since it's never wired into routing today, either wire it in and test it, or remove it; don't leave hardened-but-unreachable security code as a false sense of coverage.
- Billing-info Stripe Elements test mirroring the homegroups/web Stripe test pattern from Phase 4.

Verification checklist:

- [ ] `auth-service.service.spec.ts` has at least one test that would fail if login stopped calling `signInWithEmailAndPassword` correctly (i.e., it's testing behavior, not just constructability).

---

## Phase 8 — regroup/mobile: the biggest and highest-stakes lift

This sub-app has the most severe findings from the full-platform read. Use the restored integration-test pattern (`src/integration/setup.ts` + `firebase-admin-setup.ts`) for anything touching Firestore writes, and the restored `jest.setup.js` for pure component/hook tests.

**Security-critical regression tests (write these first):**

- **`SignUpWebView` message-injection (#28)** — a test asserting `onMessage` rejects (or ignores) a payload whose originating URL is not in an explicit allowlist, mirroring `PaymentWebView`'s `isAllowedPaymentUrl` pattern (already tested in `RentPayment/__tests__/PaymentWebView.test.tsx` — copy that test's structure directly). Write the test to fail against current code first.
- **`SubscriptionHandler` PII injection (#29)** — a test asserting the WebView's injected `window.user` payload contains only an explicit allowlist of fields (or is removed entirely in favor of a token-based handoff, matching the `SubscribePage`/mobile-WebView pattern already used correctly elsewhere in this monorepo — see the homegroups `SubscriptionWebView` token/email/groupId pattern as a _better_ reference to converge toward).
- **`CreateGuestForm` hardcoded house ID (#31)** — the single most important regression test in this entire plan: assert that a guest created via this form is assigned to `selectedHouse.id`, not a literal string. Write it to fail against current code, confirming the bug is real and reachable, before fixing.
- **Oxford vote anonymity (#30)** — once the Firestore rules are updated (restructure `individualVotes` into an admin-only-readable subcollection, or drop the anonymity claim from the UI if a data-layer fix isn't feasible short-term), a rules-emulator test asserting a non-admin house member CANNOT read another guest's individual ballot on an anonymous vote, while still being able to read the aggregate tally.
- **`houses` delete rule (#34)** — covered in Phase 6 on the functions side; mirror with a client-side test if `regroup/mobile` has any UI path that attempts house deletion, asserting it surfaces a clear error rather than a silent no-op.

**Data-integrity regression tests:**

- `PhaseConfigForm` rename-only-first-guest bug (#41) — a test with 3+ guests on the same phase, renaming the phase, asserting ALL of them are remapped, not just the first `lodash.find` match.
- `AssignGuest.tsx` unawaited success notification (#37) — a test injecting a rejected assign/reassign call and asserting the UI shows an error state, not a success toast.
- `OrgSetup.tsx` swallowed error (#38) — a test injecting a failed `submitHouse()` call and asserting the user is NOT navigated to the main app.
- `AddManager.tsx` stale-validation bug (#39) — a test typing an invalid-then-valid email in sequence and asserting validation reflects the current value, not the previous keystroke.
- `Disputes.tsx` Rules-of-Hooks violation (#40) — a test rendering the screen with `house`/`user` initially null, then updating to defined values, asserting no crash (this is exactly the scenario the current code mishandles).
- `IntroHouseSummary` random certification badge (#42) and `NewMeeting` dead Type picker (#43) — both are "delete the placeholder logic" fixes; write the test first asserting deterministic, data-driven behavior, confirm it fails against the `Math.random()`/hardcoded-`'Custom'` code, then fix.
- `Voting.tsx` ignoring per-vote threshold (#45) — a test creating a vote with a non-default threshold (e.g. 60%) and asserting the pass/fail calculation uses it, not the hardcoded 80%.
- `EESTracker.tsx` capacity-vs-guestList mismatch (#46) — a test asserting the displayed summary total and the persisted record total are computed from the same source.
- Deep-link scheme mismatch (#48) — a test asserting `linking.ts`'s prefix matches the scheme actually used elsewhere in native deep-link handling (`regroup-app://`), or a decision to standardize on one and fix the other.

**Architecture-conformance:**

- The same "get current house" three-pattern inconsistency (#57) that plagued homegroups exists here too (`useSelectedHouse` vs. `DataContext.useData()` vs. legacy `connect()`). Add the same kind of static-check script from Phase 5 to prevent new instances, and pick one pattern to converge on for new code.
- A checked-in baseline + grep-based CI gate for hardcoded business-rule values that should come from the backend (#58 — officer term length, quorum percentage, stale-payment window, Oxford pricing) is lower ROI than the above since these are harder to "test" in the traditional sense; instead, prefer converting the most consequential ones (pricing, quorum) into values fetched from a shared config/callable, then test _that_ the client matches the fetched value rather than a hardcoded one.

Verification checklist:

- [ ] Every regression test above is confirmed red against current `main` before any fix lands, and green after.
- [ ] The Maestro `guest-rent-payment`, `oxford-dashboard`, and `operator-setup-wizard` flows (already covering the screens most of these bugs live in) are updated with additional assertions where a Maestro-level check is more appropriate than a unit test (e.g., the random-certification-badge bug is trivially catchable by a Maestro flow asserting the badge text is stable across repeated runs).

---

## Phase 9 — Cross-cutting: security credential rotation + traceability matrix

Two things that don't fit neatly into a single sub-app phase:

1. **Confirm/complete the credential rotation from finding #27.** `regroup/mobile/e2e/SECURITY-test-credentials.md` documents this is "awaiting a manual Firebase Console rotation" — this is an operational task, not a code change. Track it to actual completion; don't let it stay open indefinitely because it's outside the normal PR-review loop. Once rotated, also implement the doc's own prescribed fix: gate `scripts/create-e2e-auth-users.js` behind a required `E2E_PROD_PASSWORD` env var with no committed default, so this can't recur.

2. **Build a traceability matrix** — a simple table (can live at the bottom of `docs/reviews/codebase-review-2026-07-03-full-platform-read.md` or as a new `docs/reviews/2026-07-03-findings-test-coverage-matrix.md`) mapping every numbered finding from that report to the specific test file + test name that now covers it, plus a status column (not started / test written & red / fixed & green / not testable — manual-only). This is what makes "would this class of bug be caught going forward" a checkable claim rather than an aspiration. Update it as each phase above completes.

---

## Final Phase — Verification

1. Run the full test suite for all 6 sub-apps + recovery-api + detox-recovery locally and in CI; confirm green.
2. Confirm every regression test added in Phases 3–9 was verified red-then-green during implementation (spot-check a sample if not tracked individually).
3. Confirm the CI workflow (Phase 2) fails when any sub-app's tests fail — verify with one deliberate temporary breakage per sub-app, as described in Phase 2's checklist.
4. Review coverage reports across all sub-apps; they will not be uniformly high after this plan (that's not the goal), but the previously-zero-coverage areas identified in Current State should show meaningful non-zero coverage, and the specific bug classes in this session's findings report should each have a named test.
5. Revisit `docs/reviews/codebase-review-2026-07-03-full-platform-read.md`'s "Suggested priority order for follow-up" section and confirm items 1–5 are either resolved or explicitly tracked with an owner and date, not silently dropped.
6. Consider (as a follow-on, not part of this plan) introducing monorepo-level orchestration (Turborepo/Nx) and Husky pre-commit/pre-push hooks now that there's a real test suite worth gating on — `readiness-report.md:119-120` already recommends this independently; this plan makes it newly worthwhile.
