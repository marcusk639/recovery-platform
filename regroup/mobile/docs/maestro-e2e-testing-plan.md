# Regroup Mobile — Full E2E Testing Plan (Maestro)

**Goal:** A maintainable Maestro E2E suite that verifies all critical Regroup app
functionality (operator/admin + guest/resident flows) on iOS and Android, running
against the Firebase emulator locally and in CI.

**Status:** Phase 1 in progress (2026-06-16). Harness scaffolding landed: `maestro/`
(config + smoke flow + login/logout subflows + reset-and-seed + assert-firestore),
the dead-code emulator switch is now wired into startup, and the seed claim shape was
corrected to maps. The IS_E2E_TEST launch-arg **spike still needs a device run to
confirm** (see Phase 0.3 + Phase 1). Execute remaining phases consecutively; each phase
is self-contained with its own references and verification gate.

**Why Maestro (vs the existing Detox suite):** the current `e2e/` Detox suite is
broken (eslint globals undefined, asserts non-existent strings, `.detoxrc.js` config
keys `ios.debug`/`android.debug` don't match the `ios.sim.debug`/`android.emu.debug`
names in `package.json` scripts). Maestro is black-box YAML with auto-wait/retry and
near-zero native wiring — far lower maintenance. We **retire Detox flows** but
**reuse the Detox seed/test-account infrastructure** (see Phase 2).

---

## Phase 0 — Documentation Discovery (consolidated findings)

### 0.1 Allowed Maestro APIs (verified against https://docs.maestro.dev, 2026-06-16)

Docs domain is now **docs.maestro.dev** (old `maestro.mobile.dev` redirects). Each page
is fetchable as `<url>.md`; full corpus at `https://docs.maestro.dev/llms-full.txt`.

| Capability          | Exact syntax                                                                                                                                                                      | Source                                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------ |
| Install (mac/Linux) | `curl -fsSL "https://get.maestro.mobile.dev" \| bash` (needs Java 17+, `JAVA_HOME`)                                                                                               | maestro-cli/how-to-install-maestro-cli                                                                       |
| Run                 | `maestro test flows/` ; flags `--platform=<ios\|android>`, `--device=<udid>`, `-e KEY=val`, `--format=JUNIT`, `--include-tags`/`--exclude-tags`, `-s/--shards`                    | maestro-cli-commands-and-options                                                                             |
| Devices             | `maestro list-devices`, `maestro start-device`                                                                                                                                    | same                                                                                                         |
| Authoring           | `maestro studio` (inspector), `maestro record`                                                                                                                                    | same                                                                                                         |
| Flow header         | first line `appId: <bundleId>` then `---` then commands                                                                                                                           | (consistent across all examples)                                                                             |
| launchApp           | `launchApp: { clearState: true, clearKeychain: true, stopApp: false, permissions: {...}, arguments: {...} }`                                                                      | reference/commands-available/launchapp                                                                       |
| tapOn               | `tapOn: "text"` or `tapOn: { id: "testID", index, repeat, delay, retryTapIfNoChange, waitToSettleTimeoutMs }`                                                                     | tapon                                                                                                        |
| inputText           | `inputText: "x"` / `inputText: ${VAR}` ; helpers `inputRandomEmail`, `inputRandomPersonName`, `inputRandomNumber` (⚠ no Unicode on Android)                                       | inputtext                                                                                                    |
| assert              | `assertVisible: "x"` / `assertVisible: { text, id, enabled }` / `assertNotVisible:` — **auto-waits ~7s**                                                                          | assertvisible                                                                                                |
| scroll              | `scrollUntilVisible: { element: {id                                                                                                                                               | text}, direction: DOWN, timeout: 20000, speed, visibilityPercentage, centerElement }`; also`scroll`, `swipe` | scrolluntilvisible |
| subflows            | `runFlow: file.yaml` / `runFlow: { file, env: {K: v} }` / `runFlow: { commands: [...] }`                                                                                          | runflow                                                                                                      |
| conditions          | `when: { platform: Android\|iOS, visible: "x", notVisible: "x", true: ${expr} }` (multiple = AND)                                                                                 | conditions                                                                                                   |
| retry/flake         | `retry: { maxRetries: 0-3, commands: [...] }` (wrapping large blocks is an anti-pattern), `waitForAnimationToEnd`, `retryTapIfNoChange`                                           | retry                                                                                                        |
| workspace cfg       | `config.yaml` (root or `.maestro/`): `flows`, `includeTags`, `excludeTags`, `executionOrder.continueOnFailure`, `testOutputDir`, `platform.{ios,android}.disableAnimations: true` | workspace-configuration                                                                                      |
| CI (cloud)          | `uses: mobile-dev-inc/action-maestro-cloud@v2.0.2` with `api-key`, `project-id`, `app-file` — **Maestro Cloud is paid**                                                           | maestro-cloud/ci-cd-integration/github-actions                                                               |

**RN selector mapping (verified):** Maestro maps RN **`testID` → `id`**
(`get-started/supported-platform/react-native`). `text` matches visible text. Both are
**regex** (use `.*` for dynamic values). Selectors operate on the accessibility tree.

**Anti-patterns to guard against (do NOT do):**

- Inventing commands (e.g. `clickOn`, `expectVisible`) — only the keys in the table exist.
- Wrapping a whole flow in `retry:` (masks real flakiness — docs warn against it).
- Asserting on Redux/Firestore **state** directly — Maestro is **black-box, no JS bridge**.
  Verify data via UI assertions + a post-flow emulator read (Phase 2.4).
- Assuming `accessibilityLabel` resolves to `id` — docs only confirm `testID → id`.
  The app has **737 `testID`s vs 7 `accessibilityLabel`s**, so use `testID`.

### 0.2 Codebase facts (verified 2026-06-16, file:line evidence)

- **testID coverage is strong: 737 `testID=` occurrences** across `src/`. By area:
  Treasury 55, HouseSettings 47, Oxford 43, RentPayment 35, StatUpdates 30, HouseOverview
  29, Payments 27, Profile 26, SetupWizards 24, Login 19, Activity 18, SignUp 14,
  GuestList 12, StaffNotes 8, Documents 8, Contacts 8. → Most flows are drivable today.
- **Launch→login path (from `e2e/helpers/auth.js`):** `initial-landing-screen` → tap
  `sign-in-button` → `login-screen`; logged-in state shows `house-tab`. Anonymous
  Firebase login can take 10–15s cold (use generous `assertVisible`/scroll timeouts).
- **Routes** (`src/navigation/types.ts`, `enum Routes`): auth/pre-auth — `InitialLanding`,
  `Login`, `Signup`, `NewAccount`, `HouseSearch`, `OperatorSetupWizard`; app — `Main`,
  `House`, `Guest`, `Activities`, `Contacts`, `HouseChat`, `Personal`, `HouseDisputes`,
  `MeetingSearch`, `OxfordDashboard`/`OfficerManagement`/`EESTracker`/`BusinessMeetings`/
  `OxfordVoting`/`CharterCompliance`, `TreasuryDashboard`/`FinancialRecord*`, `ResidentPayment`,
  `Notifications`, `TwoFactorSetup`, etc.
- **Backend switch already exists** — `src/config/firebase-emulator.ts`:
  `isE2ETest = __DEV__ && Settings.get('IS_E2E_TEST') === '1'` → calls
  `auth().useEmulator('http://127.0.0.1:9099')`, `firestore().useEmulator('127.0.0.1', 8080)`,
  `storage().useEmulator('127.0.0.1', 9199)`. **This decouples E2E from the missing staging
  project (P0-7)** — Maestro can run entirely against the emulator.
- **Seed/test-account infra to reuse:** `e2e/setup/seedTestData.js` (`npm run seed-e2e`),
  `e2e/setup/testAccounts.json` (e.g. `test-guest-a@rats-e2e.com` / `TestPassword123!`,
  roles guest/manager, `houseId: test-house-123`), `e2e/setup/{testActivities,testDisputes}.json`,
  `scripts/create-e2e-auth-users.js`, `scripts/cleanup-e2e-accounts.js`.
- **App identity (per-platform appId differs):** iOS bundle `com.rats.dev`
  (`ios/rats.xcodeproj/project.pbxproj`), Android `applicationId 'com.regroup.app'`
  (`android/app/build.gradle`); `app.json` name/displayName = `rats`. Builds:
  iOS workspace `ios/rats.xcworkspace` scheme `rats` → `rats.app`; Android
  `./gradlew assembleDebug` → `app-debug.apk`.
- **Emulator ports** (`regroup/firebase.json`): Firestore 8080, Functions 5001, Auth 9099,
  Storage 9199, UI 4000.
- **Roles** (`src/util/roles.ts`): map-shaped claims `admin`/`guest`/`superAdmin` keyed by
  houseId (post-P0-1). Two driver personas: **operator/admin/staff** vs **guest/resident**.

### 0.3 Execution findings (discovered while starting Phase 1, 2026-06-16)

Three facts invalidated the plan's "the backend switch already exists" assumption. All three
are now addressed in code except the iOS/Android launch-arg spike, which needs a device run.

1. **`connectToEmulators()` was dead code — never called.** It is defined in
   `src/config/firebase-emulator.ts` but had **zero call sites** in the app (verified by grep).
   So Detox's `IS_E2E_TEST=1` launch arg connected nothing — the prior E2E "emulator strategy"
   never actually ran against the emulator. **Fixed:** `firebase-setup.ts` now calls
   `connectToEmulators()` at module init, guarded by `if (__DEV__)` (the function itself also
   re-checks `__DEV__ && Settings.get('IS_E2E_TEST') === '1'`, so production never connects and
   never logs). This must run before any Firestore/Auth usage — `firebase-setup.ts` is the
   earliest shared point.

2. **React Native `Settings` is iOS-only.** `Settings.get('IS_E2E_TEST')` always returns
   `undefined` on Android, so the emulator switch can **never** engage on Android via `Settings`.
   The iOS path works because iOS maps `-IS_E2E_TEST 1` launch args into the `NSUserDefaults`
   argument domain that `Settings` reads. **Android remains an open gap** — the cleanest fix is
   a small launch-arg reader (`react-native-launch-arguments`, reads Detox/Maestro args on both
   platforms) or a `react-native-config` build-time flag baked into a dedicated E2E debug build.
   Both require a native rebuild, which is acceptable since E2E needs a debug build anyway.
   **Until then, run Maestro on iOS first.**

3. **The seed minted array-shaped claims; rules require maps.** `e2e/setup/seedTestData.js`
   built `{ guest: [], admin: [], superAdmin: [] }` and `.push(houseId)`. But the Firestore
   rules (`mobile/firebase/firestore.rules:37/41/45`) use `.keys().hasAny(...)`, a **map-only**
   method that errors on arrays — so multi-house operator checks would deny in E2E. (Single-house
   `houseId in token.admin` happens to work on both shapes, which masked the issue.) **Fixed:**
   the seed now emits `{ houseId: true }` maps, matching the post-P0-1 canonical shape. The app's
   `fillRoleFromClaim` already tolerates both shapes, so this is strictly safer.

**Harness files added this session** (under `regroup/mobile/maestro/`): `config.yaml`;
`flows/smoke.yaml`; `subflows/login.yaml`, `subflows/logout.yaml`; `scripts/reset-and-seed.sh`
(seeds the _running_ emulator via `seedTestData.js`; does NOT call the prod-targeting
`create-e2e-auth-users.js`); `scripts/assert-firestore.js` (emulator-only post-flow doc assertion
for persistence-class coverage). npm scripts: `maestro:seed`, `maestro:ios`, `maestro:android`,
`maestro:smoke:{ios,android}`.

---

## Phase 1 — Maestro bootstrap + emulator-driven launch

**What to implement (copy from Phase 0.1 syntax):**

1. ~~Install Maestro CLI (Java 17+).~~ **Done** — Maestro 2.6.0 installed. `maestro/` created at
   `regroup/mobile/maestro/` with `config.yaml`, `flows/`, `subflows/`, `scripts/`.
2. ~~`maestro/config.yaml`~~ **Done** — `flows: ['flows/*']`, both `disableAnimations: true`,
   `testOutputDir: maestro/output`.
3. ~~Per-platform `appId` via env~~ **Done** — flow headers use `appId: ${APP_ID}`; npm scripts
   pass `-e APP_ID=com.rats.dev` (iOS) / `com.regroup.app` (Android).
4. **Spike (STILL OPEN — needs a device run):** the _wiring_ is now in place
   (`connectToEmulators()` is called from `firebase-setup.ts`; see Finding 0.3-1), so the only
   remaining unknown is whether Maestro's `launchApp: { arguments: { IS_E2E_TEST: "1" } }`
   surfaces in `Settings.get('IS_E2E_TEST')` **on iOS** (it maps to the `NSUserDefaults` argument
   domain). If it does not, fall back to a `react-native-config` build-time flag in a dedicated
   E2E debug build. **Android cannot use `Settings` at all (Finding 0.3-2)** — defer Android until
   a launch-arg lib or build flag is added. Run the spike before writing more flows.
5. ~~Add npm scripts~~ **Done** — `maestro:ios`, `maestro:android`, `maestro:smoke:{ios,android}`,
   `maestro:seed`.

**References:** Phase 0.1 (install, config.yaml, launchApp args); `src/config/firebase-emulator.ts`

- `firebase-setup.ts` (the `IS_E2E_TEST` contract + new call site); `package.json` scripts block.

**Verification checklist:**

- [x] `maestro --version` works (2.6.0). `maestro list-devices` — confirm a booted sim before runs.
- [ ] **Spike (iOS):** build the debug app, boot a sim, `npm run maestro:smoke:ios` while emulators
      run + seeded; confirm Firestore UI `127.0.0.1:4000` shows reads (app on emulator, not prod).
- [x] `flows/smoke.yaml` authored (`launchApp` + `assertVisible: { id: "initial-landing-screen" }`).
      Passing run still pending the spike.
- [ ] Android smoke — blocked on the launch-arg mechanism (Finding 0.3-2).

**Anti-pattern guards:** don't hardcode a single `appId` (breaks the other platform);
don't point flows at prod Firebase; don't skip the `IS_E2E_TEST` spike.

---

## Phase 2 — Test-data foundation + reusable auth subflows

**What to implement:**

1. **Reuse existing seed infra** (do not rebuild): a `maestro/scripts/reset-and-seed.sh` that
   (a) starts emulators from `regroup/` (`firebase emulators:start`), (b) runs
   `node e2e/setup/seedTestData.js` + `scripts/create-e2e-auth-users.js` to seed
   `testAccounts.json` users into the Auth + Firestore emulator.
2. **Login subflow** `subflows/login.yaml` — port the selector path from `e2e/helpers/auth.js`:
   launch → assert `initial-landing-screen` → tap `sign-in-button` → assert `login-screen` →
   `inputText` email/password (from `${EMAIL}`/`${PASSWORD}`) → tap login → assert `house-tab`.
   Parameterize the persona via env so operator and guest reuse it.
3. **Logout subflow** `subflows/logout.yaml` (tap `logout-button` on `profile-screen`).
4. **Post-flow data verification helper** `maestro/scripts/assert-firestore.js` — a Node
   script using firebase-admin against the emulator to assert documents after a flow (this is
   how we cover what Maestro's black-box model can't: e.g. confirm a guest edit actually
   persisted — the P0-5 class of bug).

**References:** `e2e/helpers/auth.js` (exact selectors + 30s landing timeout note);
`e2e/setup/testAccounts.json` (credentials/roles); `e2e/setup/seedTestData.js`;
`scripts/create-e2e-auth-users.js`, `scripts/cleanup-e2e-accounts.js`; Phase 0.1 `runFlow`/`inputText`.

**Verification checklist:**

- [ ] `reset-and-seed.sh` leaves the Auth emulator with all `testAccounts.json` users.
- [ ] `login.yaml` logs in `test-manager@rats-e2e.com` and `test-guest-a@rats-e2e.com` and lands on `house-tab`.
- [ ] `assert-firestore.js` can read `houses/test-house-123` from the emulator.

**Anti-pattern guards:** don't seed against prod; don't store real PII in fixtures (keep
`@rats-e2e.com` synthetic accounts); don't duplicate login steps in every flow — use the subflow.

---

## Phase 3 — Auth & RBAC flows (smoke tier)

**What to implement (one flow file each, tagged `smoke`):**

- `auth-login.yaml` — login happy path (operator + guest via env matrix).
- `auth-signup.yaml` — new-account creation (`SignUp` screen testIDs, 14 available).
- `auth-logout.yaml` — logout returns to `login-screen`/`initial-landing-screen`.
- `rbac.yaml` — assert a guest does **not** see operator-only controls (e.g. Treasury/HouseSettings
  tabs/buttons), mirroring the old `authorization-rbac.test.js` intent. Use `assertNotVisible`.

**References:** old specs `e2e/tests/auth-login.test.js`, `auth-signup.test.js`,
`authorization-rbac.test.js` (for the flow shape + selectors to port); Phase 0.1 assert/conditions.

**Verification checklist:** all four pass on both platforms; `rbac.yaml` fails if a guest
can see an operator-only `testID` (prove it catches a regression by temporarily relaxing a gate).

**Anti-pattern guards:** don't assert via state; RBAC checks must be UI-visible
`assertNotVisible`, not Firestore reads.

---

## Phase 4 — Operator / admin flows

**What to implement (tag `operator`), one flow per feature, each starting from `runFlow: login.yaml`
as the manager persona:**

- `house-setup.yaml` — operator setup wizard / house creation + config (`OperatorSetupWizard`,
  `HouseSettings` 47 testIDs, `HouseConfig`).
- `guest-management.yaml` — add/edit/remove a guest/resident (`GuestList`, `CreateGuest`,
  guest detail). **Pair with `assert-firestore.js`** to confirm the edit persisted (P0-5 guard).
- `staff-notes.yaml` — create/read a staff note (`StaffNotes`, 8 testIDs).
- `drug-testing.yaml` — record a drug test + view history (`DrugTesting`).
- `treasury.yaml` — create a financial record + view detail (`Treasury` 55, `FinancialRecord*`).
- `meetings.yaml` — meeting search/create (`MeetingSearch`, `BusinessMeetings`).
- `documents.yaml` — upload/list a house document (`Documents`, 8 testIDs).
- `disputes.yaml` — dispute create/resolve (port `dispute-system.test.js`).
- `oxford.yaml` _(if in launch scope)_ — Oxford dashboard/officer/EES/voting (`Oxford` 43 testIDs).

**References:** corresponding `e2e/tests/*.js` specs for selector/flow shape;
screen dirs under `src/screens/` named above; Phase 2 subflows + `assert-firestore.js`.

**Verification checklist:** each flow passes on both platforms; `guest-management.yaml` +
`treasury.yaml` confirm persistence via `assert-firestore.js`; suite tagged `operator` runs green
via `maestro test --include-tags=operator`.

**Anti-pattern guards:** keep each feature in its own file (shardable, isolatable); reset state
with `clearState: true` + re-seed between destructive flows.

---

## Phase 5 — Guest / resident flows

**What to implement (tag `guest`), each starting from `login.yaml` as a guest persona:**

- `profile-edit.yaml` — edit profile fields (`ProfileUpdate`); **verify persistence with
  `assert-firestore.js`** (directly exercises the just-fixed P0-5 data-loss path).
- `phase-customization.yaml` — change phase (`PhaseCustomization`); assert only the phase field
  changed (the P0-5 fix) via post-flow Firestore read.
- `guest-stats.yaml` — submit meeting/work/chore stats (`StatUpdates` 30 testIDs); port
  `guest-stats.test.js`.
- `guest-medication.yaml` — medication tracking (port `guest-medication.test.js`).
- `house-chat.yaml` — send/receive a house chat message (`HouseChat` 10 testIDs).

**References:** `e2e/tests/profile-update.test.js`, `guest-stats.test.js`, `guest-medication.test.js`;
memory of P0-5 fix (only the targeted field should change on write).

**Verification checklist:** all pass both platforms; phase/profile flows prove field-scoped writes
(no sibling-field loss) via Firestore assertion.

**Anti-pattern guards:** don't rely on Redux being in sync — assert what the UI shows + what
Firestore stored.

---

## Phase 6 — Rent payment / Stripe flow (special handling)

**Context:** D-11 chose **web-only billing** — the in-app upgrade/pay CTA opens a **WebView** to
web Stripe checkout. Maestro is black-box and WebView interaction is fragile.

**What to implement:**

- `rent-payment.yaml` (tag `payment`) — drive the native part (`RentPayment` 35 testIDs / `Payments` 27) up to the WebView boundary, assert the WebView/checkout screen appears.
- **Decide the checkout depth (spike):** (a) Maestro can sometimes drive WebView via `text`/coords
  with Stripe **test card 4242 4242 4242 4242** — attempt it; if flaky, (b) stop at the WebView
  boundary and verify the **webhook result** in the Functions/Firestore emulator (`subscriptionStatus`
  → `active`, payment record written) via `assert-firestore.js`.
- Mark this flow `flaky-allowed` / quarantined initially; do not block CI on the WebView leg.

**References:** `src/screens/RentPayment/*`, `src/screens/Payments/*`; Phase 0.1 (Maestro WebView
limits); regroup/functions Stripe webhook handlers; GTM RG-P0-2/3 (Stripe prices + real-card test).

**Verification checklist:** native portion green on both platforms; webhook-side assertion proves the
payment effect even if the WebView leg is skipped.

**Anti-pattern guards:** don't make the WebsView leg a hard CI gate; don't use real cards or live keys.

---

## Phase 7 — CI integration + flake management

**What to implement:**

1. **Flake config** (already partly via `config.yaml` `disableAnimations`): prefer `assertVisible`
   auto-wait (~7s) and `scrollUntilVisible` timeouts over manual sleeps; use targeted
   `retry: { maxRetries: 2 }` only on known-async taps; never wrap whole flows.
2. **CI choice:**
   - **Self-hosted (recommended first, free):** GitHub Actions workflow
     `.github/workflows/mobile-e2e.yml` — install Java 17 + Maestro CLI, build the debug app,
     boot an emulator/simulator (`maestro start-device`), start Firebase emulators + seed,
     run `maestro test --format JUNIT --include-tags=smoke,operator,guest maestro/flows/`.
     Android (emulator on Linux runners) is cheapest; add macOS runner for iOS.
   - **Maestro Cloud / Robin (`action-maestro-cloud@v2.0.2`):** device farm, paid — adopt only if
     self-hosted device management proves too costly.
3. **Tiering:** `smoke` on every PR; `operator`+`guest` nightly; `payment` quarantined.
4. **Artifacts:** upload `maestro/output` (JUnit + `maestro record` video on failure).

**References:** Phase 0.1 CI + flake rows; existing (absent) `.github/workflows/` — this is also the
first mobile CI (relates to launch-readiness "no CI" finding).

**Verification checklist:** PR triggers `smoke` tier green on Android in CI; JUnit + failure video
artifacts uploaded; nightly runs the full tier.

**Anti-pattern guards:** don't gate PRs on the full/payment suite (slow/flaky); don't run E2E against
prod from CI — emulator only.

---

## Phase 8 — Verification & coverage gate

1. **Coverage matrix:** a `maestro/COVERAGE.md` mapping every `Routes` value + GTM feature to a flow
   (or an explicit "not covered + why"). Target: every operator + guest critical path has a flow.
2. **API audit:** `grep -rnE 'clickOn|expectVisible|waitForElement' maestro/` returns nothing
   (no invented commands); every `id:` selector corresponds to a real `testID` in `src/`.
3. **Dual-platform proof:** full suite green on iOS and Android at least once.
4. **Retire Detox:** delete/relocate `e2e/tests/*` Detox specs and the broken `.detoxrc.js`/scripts
   **after** equivalent Maestro flows are green; keep `e2e/setup/*` seed fixtures (now used by Maestro).
5. **testID gap fixes:** for any flow blocked by a missing selector, add a `testID` following the
   existing convention (e.g. `src/screens/Landing/InitialLandingForm.tsx:146` `testID="sign-in-button"`)
   — kebab-case, stable, on the interactive element.

**Verification checklist:** COVERAGE.md has no unexplained gaps; grep audit clean; both platforms green;
Detox retired without losing seed infra.

---

## Open decisions / risks (resolve during execution)

1. **`IS_E2E_TEST` injection (Phase 1.4 spike)** — highest risk; the whole emulator strategy depends
   on Maestro being able to set the flag the app reads via `Settings.get`. Prove before writing flows.
2. **Per-platform `appId`** (`com.rats.dev` vs `com.regroup.app`) — handled via `${APP_ID}` env.
3. **WebView/Stripe depth (Phase 6)** — likely verify via webhook/emulator rather than driving checkout.
4. **iOS CI cost** — macOS runners are expensive; start Android-only in CI, run iOS locally/nightly.
5. **Staging (P0-7) not required** for this plan (emulator-based), but a staging project would later
   enable against-staging smoke tests pre-release.

## Suggested execution order

Phase 1 (incl. spike) → 2 → 3 (smoke, prove value early) → 4 → 5 → 6 → 7 → 8.
Each phase is a clean session boundary; carry forward `maestro/config.yaml`, the subflows, and
`assert-firestore.js` as the shared harness.
