# Regroup Mobile — Maestro E2E Runbook

Operational guide for running the Maestro E2E suite locally against the Firebase
emulators. The build and run reference of record is
[`maestro/README.md`](../maestro/README.md); this runbook adds detail on tags,
persistence checks and troubleshooting. The older design and phase plan,
[`maestro-e2e-testing-plan.md`](./maestro-e2e-testing-plan.md), is superseded.

All paths below are relative to `regroup/mobile/` unless noted. Run npm scripts
from `regroup/mobile/`.

---

## TL;DR (happy path, iOS)

```bash
# 0. one-time: install Maestro CLI + Java 21 (see Prerequisites)
export E2E_TEST_PASSWORD="$(cat ~/.config/regroup-e2e/e2e-test-password)"

# 1. terminal A — from the repo root: build functions, start the demo-regroup-e2e
#    emulators (plus the recovery-api directory emulator), seed, keep running
./scripts/test-prep.sh

# 2. terminal B — from regroup/mobile/: build + install the E2EEmulator app
#    (commands in maestro/README.md, "Which app build"), then run
maestro/scripts/run-flows.sh smoke --sim "$SIM_UDID"   # the smoke flow
maestro/scripts/run-flows.sh --sim "$SIM_UDID"         # the whole suite
```

Green smoke + the Emulator UI (`http://127.0.0.1:4000`) showing Firestore reads
during the run = the harness works.

---

## Prerequisites (one-time)

| Requirement       | Check / Install                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Maestro CLI       | `maestro --version` (expect ≥ 2.6.0). Install: `curl -fsSL "https://get.maestro.mobile.dev" \| bash`                                  |
| Java 21           | `java -version`. firebase-tools ≥ 15 needs JDK 21 for the emulators; `scripts/test-prep.sh` selects a Homebrew `openjdk@21` if found. |
| Firebase CLI      | `firebase --version`. Start the emulators with `scripts/test-prep.sh` (repo root), not a bare `firebase emulators:start`.             |
| iOS toolchain     | Xcode + `xcrun simctl` (iOS runs only).                                                                                               |
| Android toolchain | Android SDK + an AVD. Build `./gradlew assembleE2eEmulator`; see `maestro/README.md` for the Android steps.                           |
| Node deps         | `npm install` in `regroup/mobile/`; `npm ci` once in `recovery-api/` (test-prep.sh builds it).                                        |
| Test password     | `E2E_TEST_PASSWORD`, never committed (`e2e/SECURITY-test-credentials.md`).                                                            |

Verify a device is available before a run:

```bash
maestro list-devices          # Maestro's view
xcrun simctl list devices booted   # iOS sims that are booted
```

---

## How the emulator switch works (read this once)

E2E runs against the **local Firebase emulators**, not production. The switch is
the bundle-time `E2E_VARIANT`, not a launch argument or `__DEV__`:

1. The E2E build sets it. The Xcode `E2EEmulator` configuration (scheme
   `rats-e2e-emulator`) and the Gradle `e2eEmulator` build type bundle the JS with
   `E2E_VARIANT=emulator`; `e2eVariant()` (`src/config/env.ts`) reads the inlined value.
2. At startup `firebase-setup.ts` checks that the native Firebase project is the
   variant's own (`demo-regroup-e2e`) and that the Stripe key is not a live (`pk_live_`) key, then calls
   `connectToEmulators()` (`src/config/firebase-emulator.ts`) for Auth, Firestore,
   Storage and Functions on `127.0.0.1` (Android: `10.0.2.2`).
3. It fails closed: an unreachable emulator port rejects and the app stops. It never
   falls back to a real project.

So a run hits the emulators only when:

- the installed app is the **E2EEmulator** build (`com.rats.dev.e2e.emu` /
  `com.regroup.app.e2e.emu`), and
- the emulators are running and seeded.

**A Debug build (`com.rats.dev`) talks to production Firebase**, with or without
Metro. The guard subflow and `maestro/scripts/e2e-build-guard.js` refuse to drive it.

`IS_E2E_TEST` is something else. The flows' `launchApp` may pass it, and on iOS a
Debug build reads it (`src/util/e2e.ts`) only to relax automation-hostile UI, such as
the secure password field. It does not route Firebase anywhere.

---

## Step 1 — Start the emulators

From the repo root:

```bash
./scripts/test-prep.sh
```

It builds `regroup/functions` and `recovery-api`, starts the emulators from
`regroup/firebase.e2e.json` with `--project demo-regroup-e2e`, starts the recovery-api
directory emulator, seeds both, and stays running (`Ctrl-C` stops everything). Confirm
the UI at `http://127.0.0.1:4000`. Ports: Firestore `8080`, Functions `5001`, Auth
`9099`, Storage `9199`; recovery-api functions `5002`, Firestore `8082`.

`cd regroup && firebase emulators:start` is not a substitute: `regroup/firebase.json`
holds only the functions predeploy hook, and the default project is the production
`phoenix-cleanhouse`.

> Do not run another product's emulator (homegroups) at the same time — same ports.

## Step 2 — Seed test data

`test-prep.sh` seeds on start. To re-seed (emulators up, `E2E_TEST_PASSWORD` set),
from `regroup/mobile/`:

```bash
npm run maestro:seed     # = ./maestro/scripts/reset-and-seed.sh
```

This runs `maestro/scripts/seed/index.js`, which wipes the emulators and writes the
accounts from `e2e/setup/testAccounts.json` (uids `e2e-<id>`, with **map-shaped** role
claims so Firestore rules engage), the test and Oxford houses, activities, a dispute
and payments. It refuses any project that is not `demo-` and any non-loopback host
(`seed/guard.js`). Re-run any time to reset.

Accounts (password `$E2E_TEST_PASSWORD`):

| Email                               | Role  | House               |
| ----------------------------------- | ----- | ------------------- |
| `test-manager@rats-e2e.com`         | admin | `test-house-123`    |
| `test-guest-a@rats-e2e.com`         | guest | `test-house-123`    |
| `test-guest-b@rats-e2e.com`         | guest | `test-house-123`    |
| `test-oxford-operator@rats-e2e.com` | admin | `test-house-oxford` |

`testAccounts.json` also lists `test-multi-house@rats-e2e.com`, but the seed does not
create it.

## Step 3 — Build the E2EEmulator app

Follow "Which app build" in [`maestro/README.md`](../maestro/README.md): `xcodebuild`
the `rats-e2e-emulator` scheme with the `E2EEmulator` configuration, then
`xcrun simctl install`. On Android, `./gradlew assembleE2eEmulator` in `android/`. The
build embeds its JS bundle, so Metro is not needed.

Rebuild after native changes or JS changes. Pure flow/YAML edits do **not** need a
rebuild.

## Step 4 — Boot a simulator

```bash
xcrun simctl boot "$SIM_UDID"     # run-flows.sh boots it too (default: the E2E-iPhone sim)
```

## Step 5 — Run flows

```bash
maestro/scripts/run-flows.sh --sim "$SIM_UDID"          # whole suite, one flow at a time
npm run maestro:smoke:ios                               # just the smoke flow (fast sanity)
npm run maestro:suite:ios                               # maestro/flows/run-all.yaml
```

Under the hood these pass the per-platform appId:

```bash
maestro test -e APP_ID=com.rats.dev.e2e.emu      -e E2E_TEST_PASSWORD="$E2E_TEST_PASSWORD" maestro/flows/smoke.yaml   # iOS
maestro test -e APP_ID=com.regroup.app.e2e.emu   -e E2E_TEST_PASSWORD="$E2E_TEST_PASSWORD" maestro/flows/smoke.yaml   # Android
```

### Run a subset by tag

Flows are tagged (`smoke`, `operator`, `guest`, `payments`, `oxford`, and others):

```bash
maestro test -e APP_ID=com.rats.dev.e2e.emu --include-tags=smoke    maestro/flows/
maestro test -e APP_ID=com.rats.dev.e2e.emu --exclude-tags=payments maestro/flows/
```

### Run a single flow

```bash
maestro test -e APP_ID=com.rats.dev.e2e.emu maestro/flows/<flow>.yaml
```

---

## Step 6 — Verify persistence (black-box gap)

Maestro can't read app state. For flows that must prove data persisted (e.g. the P0-5
guest-edit path), assert the emulator document directly after the flow:

```bash
# doc exists with expected fields
node maestro/scripts/assert-firestore.js houses/test-house-123 id=test-house-123

# a guest edit persisted AND a sibling field was not lost
node maestro/scripts/assert-firestore.js guests/<uid> phone=555-9999 firstName=Test

# nested field (dot path); true/false/numbers are coerced
node maestro/scripts/assert-firestore.js guests/<uid> phase.current=2
```

Exit `0` = all assertions passed, `1` = mismatch/missing doc, `2` = bad usage. Wire these
into a flow's wrapper script or CI step right after `maestro test`.

---

## Authoring & debugging flows

```bash
maestro studio        # live inspector — see the accessibility tree + testIDs, build taps
maestro record        # record a session to video (handy for flaky-flow triage)
```

- **Selectors:** RN `testID` maps to Maestro `id`. `src/` has about 484 `testID=`
  occurrences in non-test files; prefer `id:` over `text:`. Both are **regex** (use
  `.*` for dynamic values).
- **Waits:** rely on `assertVisible` auto-wait (~7s) and `extendedWaitUntil` timeouts;
  avoid manual sleeps. Cold anonymous Firebase login can take 10–15s — login waits up to 60s.
- **Reusable steps:** `subflows/login.yaml` + `logout.yaml`. Invoke with env:
  ```yaml
  - runFlow:
      file: ../subflows/login.yaml
      env:
        EMAIL: test-manager@rats-e2e.com
        PASSWORD: $E2E_TEST_PASSWORD
  ```
- Every flow must start with `- runFlow: ../subflows/guard-e2e-app.yaml`.

### Output artifacts

JUnit reports + recordings land in `maestro/output/` (gitignored). Force a format:

```bash
maestro test -e APP_ID=com.rats.dev.e2e.emu --format=JUNIT maestro/flows/
```

---

## Troubleshooting

| Symptom                                         | Likely cause / fix                                                                                                                                                      |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App shows **prod** data / writes to prod        | Not the E2EEmulator build. Only `com.rats.dev.e2e.emu` / `com.regroup.app.e2e.emu` connect to the emulators; uninstall `com.rats.dev` / `com.regroup.app` from the sim. |
| App stops at startup (`E2EEmulatorUnreachable`) | The E2EEmulator build can't reach an emulator port. Start `./scripts/test-prep.sh` from the repo root.                                                                  |
| `maestro:seed` errors "Emulator not reachable"  | Emulator isn't running. From the repo root: `./scripts/test-prep.sh`.                                                                                                   |
| Login flow times out at `house-tab`             | Cold auth is slow; the 60s wait usually covers it. Verify the account was seeded (Emulator UI → Auth) and the emulator is reachable.                                    |
| Operator (admin) screens denied                 | Stale **array** claims. Re-run `npm run maestro:seed` (it mints map-shaped claims that the `.keys().hasAny` rules require).                                             |
| `assertVisible` can't find an element           | Open `maestro studio` to confirm the real `testID`; the element may need a missing `testID` added in `src/`.                                                            |
| No device found                                 | `xcrun simctl boot "<device>"`, then `maestro list-devices`.                                                                                                            |
| Build is stale after a JS change                | The E2EEmulator build embeds its bundle: rebuild and reinstall it.                                                                                                      |

---

## CI (future)

Not wired yet. CI runs no regroup Maestro flow (the old `maestro-smoke` job is
build-only since 2026-11-06, as `regroup-android-build`). Intended shape: install Java 21

- Maestro, build the E2EEmulator variant, boot a device, start the emulators + seed, then
  `maestro test --format JUNIT --include-tags=smoke maestro/flows/` on PRs, fuller tiers
  nightly. Android-on-Linux runners are cheapest; iOS needs a macOS runner. Never run E2E
  against prod from CI — emulator only.

---

## Known gaps

- **`run-flows.sh` is iOS-only.** On Android, run flows with `maestro --device …`
  directly (steps in `maestro/README.md`).
- **`testActivities.json` and `testDisputes.json`** in `e2e/setup/` are not read by
  anything; the seed builds its own activities and dispute (`maestro/scripts/seed/docs.js`).
  The seed itself is tracked in git under `maestro/scripts/seed/`.
