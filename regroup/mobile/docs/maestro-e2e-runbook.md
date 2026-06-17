# Regroup Mobile — Maestro E2E Runbook

Operational guide for running the Maestro E2E suite locally against the Firebase
emulator. For the design/rationale and phase plan, see
[`maestro-e2e-testing-plan.md`](./maestro-e2e-testing-plan.md).

All paths below are relative to `regroup/mobile/` unless noted. Run npm scripts
from `regroup/mobile/`.

---

## TL;DR (happy path, iOS)

```bash
# 0. one-time: install Maestro CLI + Java 17 (see Prerequisites)

# 1. terminal A — start the Firebase emulator (from regroup/)
cd ../  &&  firebase emulators:start          # Firestore 8080, Auth 9099, Storage 9199, UI 4000

# 2. terminal B — seed, build, boot, run (from regroup/mobile/)
npm run maestro:seed                           # seed test accounts + houses into the emulator
npm run test:e2e:build:ios                     # build the debug app (~15-20 min first time)
xcrun simctl boot "iPhone 14 Pro"              # boot a simulator (skip if already booted)
npm run maestro:smoke:ios                      # run the smoke flow
```

Green smoke + the Emulator UI (`http://127.0.0.1:4000`) showing Firestore reads
during the run = the harness works.

---

## Prerequisites (one-time)

| Requirement       | Check / Install                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| Maestro CLI       | `maestro --version` (expect ≥ 2.6.0). Install: `curl -fsSL "https://get.maestro.mobile.dev" \| bash` |
| Java 17+          | `java -version` (Maestro needs it). Set `JAVA_HOME` if unset.                                        |
| Firebase CLI      | `firebase --version`. Emulators run from `regroup/`.                                                 |
| iOS toolchain     | Xcode + `xcrun simctl` (iOS runs only).                                                              |
| Android toolchain | Android SDK + an AVD (Android runs — **currently blocked**, see Known Gaps).                         |
| Node deps         | `npm install` in `regroup/mobile/`.                                                                  |

Verify a device is available before a run:

```bash
maestro list-devices          # Maestro's view
xcrun simctl list devices booted   # iOS sims that are booted
```

---

## How the emulator switch works (read this once)

E2E runs against the **local Firebase emulator**, not production. The wiring:

1. Maestro launches the app with `arguments: { IS_E2E_TEST: "1" }` (set in every flow's
   `launchApp`).
2. On iOS that lands in `NSUserDefaults`, which React Native's `Settings` module reads.
3. `firebase-setup.ts` calls `connectToEmulators()` at startup (guarded by `__DEV__`).
   When `Settings.get('IS_E2E_TEST') === '1'`, it points Auth/Firestore/Storage at
   `127.0.0.1:{9099,8080,9199}`.

So three things must all be true for a run to hit the emulator:

- a **debug** build (`__DEV__` true),
- the flow sets `IS_E2E_TEST`,
- the emulator is running and seeded.

> **iOS only today.** RN `Settings` is iOS-only, so the launch arg does not reach the app
> on Android — see Known Gaps.

---

## Step 1 — Start the emulator

From `regroup/`:

```bash
firebase emulators:start
```

Leave it running. Confirm the UI at `http://127.0.0.1:4000`. Ports: Firestore `8080`,
Functions `5001`, Auth `9099`, Storage `9199`.

> Do not run another product's emulator (homegroups) at the same time — same ports.

## Step 2 — Seed test data

From `regroup/mobile/` (emulator must be up):

```bash
npm run maestro:seed     # = ./maestro/scripts/reset-and-seed.sh
```

This runs `e2e/setup/seedTestData.js` against the emulator and creates the
`testAccounts.json` users (with **map-shaped** role claims so Firestore rules engage),
plus houses/activities/disputes. Re-run any time to reset seeded entities.

Accounts (password `TestPassword123!`):

| Email                           | Role                                            | House            |
| ------------------------------- | ----------------------------------------------- | ---------------- |
| `test-manager@rats-e2e.com`     | admin                                           | `test-house-123` |
| `test-guest-a@rats-e2e.com`     | guest                                           | `test-house-123` |
| `test-guest-b@rats-e2e.com`     | guest                                           | `test-house-123` |
| `test-multi-house@rats-e2e.com` | admin (`test-house-a`) + guest (`test-house-b`) | —                |

## Step 3 — Build the debug app

```bash
npm run test:e2e:build:ios       # ios/build/.../rats.app  (first build ~15-20 min)
```

Rebuild only when native code or the JS bundle entry changes. Pure flow/YAML edits do
**not** need a rebuild.

## Step 4 — Boot a simulator

```bash
xcrun simctl boot "iPhone 14 Pro"     # or any installed device; must match a booted sim
```

## Step 5 — Run flows

```bash
npm run maestro:smoke:ios        # just the smoke flow (fast sanity)
npm run maestro:ios              # the whole maestro/flows/ directory
```

Under the hood these pass the per-platform appId:

```bash
maestro test -e APP_ID=com.rats.dev      maestro/flows/smoke.yaml   # iOS
maestro test -e APP_ID=com.regroup.app   maestro/flows/smoke.yaml   # Android
```

### Run a subset by tag

Flows are tagged (`smoke`, and later `operator`/`guest`/`payment`):

```bash
maestro test -e APP_ID=com.rats.dev --include-tags=smoke   maestro/flows/
maestro test -e APP_ID=com.rats.dev --exclude-tags=payment maestro/flows/
```

### Run a single flow

```bash
maestro test -e APP_ID=com.rats.dev maestro/flows/<flow>.yaml
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

- **Selectors:** RN `testID` maps to Maestro `id`. The app has ~737 `testID`s; prefer
  `id:` over `text:`. Both are **regex** (use `.*` for dynamic values).
- **Waits:** rely on `assertVisible` auto-wait (~7s) and `extendedWaitUntil` timeouts;
  avoid manual sleeps. Cold anonymous Firebase login can take 10–15s — login waits up to 60s.
- **Reusable steps:** `subflows/login.yaml` + `logout.yaml`. Invoke with env:
  ```yaml
  - runFlow:
      file: ../subflows/login.yaml
      env:
        EMAIL: test-manager@rats-e2e.com
        PASSWORD: TestPassword123!
  ```

### Output artifacts

JUnit reports + recordings land in `maestro/output/` (gitignored). Force a format:

```bash
maestro test -e APP_ID=com.rats.dev --format=JUNIT maestro/flows/
```

---

## Troubleshooting

| Symptom                                        | Likely cause / fix                                                                                                                                                    |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App shows **prod** data / writes to prod       | Not in emulator mode. Confirm it's a **debug** build, the flow sets `IS_E2E_TEST: "1"`, and the emulator is up. Check device logs for `[Firebase] E2E mode detected`. |
| `maestro:seed` errors "Emulator not reachable" | Emulator isn't running. `cd regroup && firebase emulators:start`.                                                                                                     |
| Login flow times out at `house-tab`            | Cold auth is slow; the 60s wait usually covers it. Verify the account was seeded (Emulator UI → Auth) and the emulator is reachable.                                  |
| Operator (admin) screens denied                | Stale **array** claims. Re-run `npm run maestro:seed` (it mints map-shaped claims that the `.keys().hasAny` rules require).                                           |
| `assertVisible` can't find an element          | Open `maestro studio` to confirm the real `testID`; the element may need a missing `testID` added in `src/`.                                                          |
| No device found                                | `xcrun simctl boot "<device>"`, then `maestro list-devices`.                                                                                                          |
| Build is stale after JS change                 | Metro caches; restart `npm start` or rebuild. Native changes always need `test:e2e:build:ios`.                                                                        |

---

## CI (future)

Not wired yet (see plan Phase 7). Intended shape: GitHub Actions installs Java 17 +
Maestro, builds the debug app, boots a device, starts the Firebase emulator + seeds, then
`maestro test --format JUNIT --include-tags=smoke maestro/flows/` on PRs, fuller tiers
nightly. Android-on-Linux runners are cheapest; iOS needs a macOS runner. Never run E2E
against prod from CI — emulator only.

---

## Known gaps

- **Android is blocked.** RN `Settings` is iOS-only, so `IS_E2E_TEST` never reaches the app
  on Android. Needs a launch-arg reader (`react-native-launch-arguments`) or a
  `react-native-config` build-time flag baked into a dedicated E2E debug build. The
  `maestro:android` scripts exist but won't connect to the emulator until then.
- **iOS launch-arg spike unconfirmed.** The wiring is in place; a device run still needs to
  confirm Maestro's `launchApp.arguments` surfaces in `Settings.get` on iOS. This is the
  first thing to validate (Step 1–5 above).
- **Seed fixtures untracked.** `e2e/setup/*.js` (incl. `seedTestData.js`) is gitignored by
  `regroup/.gitignore`'s blanket `**/*.js`; the seed lives only locally.
