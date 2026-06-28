# Running the Maestro E2E Flows

How to run the Regroup mobile end-to-end suite locally on the iOS simulator,
driven by [Maestro](https://maestro.dev) against the Firebase emulator suite.

> **TL;DR (automated path)**
>
> ```bash
> # Terminal 1 — emulators + seeded data (stays running):
> ./scripts/test-prep.sh
>
> # Terminal 2 — Metro bundler (stays running):
> cd regroup/mobile && npx react-native start
>
> # Terminal 3 — run the flows:
> cd regroup/mobile && maestro/scripts/run-flows.sh          # whole suite
> cd regroup/mobile && maestro/scripts/run-flows.sh smoke    # one flow
> ```

---

## How it fits together

E2E runs have **three long-lived pieces** plus the test driver. The first two
must already be running before you launch any flow:

| Piece                         | What it is                                                                    | Started by                                                   | Ports                                                        |
| ----------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| **Firebase emulators + seed** | Local Auth + Firestore + Storage with canonical test accounts/houses/disputes | `./scripts/test-prep.sh`                                     | UI `:4000`, Firestore `:8080`, Auth `:9099`, Storage `:9199` |
| **Metro bundler**             | Serves the app's JS to the Debug build; picks up source edits                 | `npx react-native start`                                     | `:8081`                                                      |
| **The app**                   | `com.rats.dev` Debug build installed on the simulator                         | `npx react-native run-ios` (one-time / after native changes) | —                                                            |
| **Maestro + XCUITest**        | Drives the app and asserts via accessibility (`testID`)                       | `maestro test …` / `run-flows.sh`                            | ephemeral                                                    |

The app reads the launch argument `IS_E2E_TEST=1` (via `Settings.get` →
`src/config/firebase-emulator.ts`) and, in `__DEV__`, points Firebase at the
local emulator instead of production. Maestro passes that argument on every
`launchApp`.

---

## One-time setup

| Requirement                                   | Check / install                                                                                 |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Xcode + command line tools                    | `xcode-select --install`                                                                        |
| **JDK 21+** (firebase-tools ≥ 15 requires it) | `brew install openjdk@21` — `test-prep.sh` auto-selects it                                      |
| Maestro CLI                                   | `curl -fsSL https://get.maestro.mobile.dev \| bash`                                             |
| Node deps                                     | `cd regroup/mobile && npm install`                                                              |
| CocoaPods                                     | `cd regroup/mobile/ios && pod install`                                                          |
| **App built + installed on the sim**          | `cd regroup/mobile && npx react-native run-ios --simulator="E2E-iPhone"` (first build 5–10 min) |

The suite targets the **`E2E-iPhone`** simulator
(UDID `809BD7B9-D9D5-45D2-AEA8-12F885F54407`). Override with `SIM_UDID=…` or
`--sim <udid>`. The iOS app id is **`com.rats.dev`** (Android: `com.regroup.app`).

You do **not** need to create Firebase accounts by hand — the seed script creates
them in the Auth emulator (see [Seeded test data](#seeded-test-data)).

---

## Step 1 — Emulators + seed (Terminal 1)

```bash
./scripts/test-prep.sh        # from the repo root
```

This starts Auth + Firestore + **Storage (:9199)** from
`regroup/mobile/firebase/firebase.json` (the only emulator config that defines
Storage), waits for the UI, seeds the canonical fixtures, and then **stays
running**. Leave the terminal open; `Ctrl-C` stops the emulators.

- If a suite is already running on `:4000`, the script re-seeds only and exits
  (it won't fight over ports). To get Storage when an auth/firestore-only suite
  is already up, stop it first, then re-run.
- Re-seed at any time without restarting emulators:
  `cd regroup/mobile && npm run maestro:seed`.

## Step 2 — Metro (Terminal 2)

```bash
cd regroup/mobile && npx react-native start
```

Keep it running — it serves the JS bundle to the Debug app on each launch and
hot-reloads your source edits. After a large source reorg (e.g. moving modules),
restart with `--reset-cache` to avoid a stale module graph.

## Step 3 — Run flows (Terminal 3)

**Automated runner (recommended):**

```bash
cd regroup/mobile
maestro/scripts/run-flows.sh                 # full suite, in order
maestro/scripts/run-flows.sh smoke           # a single flow (".yaml" optional)
maestro/scripts/run-flows.sh all --no-seed   # don't re-seed first
maestro/scripts/run-flows.sh all --no-reboot # don't reboot the sim first
```

`run-flows.sh` does the things that make local runs reliable:

1. **Preflight** — verifies Maestro, a booted sim, the emulator, Metro, and the
   installed app; prints exactly what's missing and how to fix it.
2. **Clean driver** — reboots the simulator once up front (the reliable fix for
   the XCUITest driver dropping between back-to-back runs).
3. **Fresh data** — re-seeds the emulator (skip with `--no-seed`).
4. **Sequential execution** — runs flows one at a time; if a flow fails with a
   driver-connection error it reboots and **retries once**.
5. **Summary** — prints PASS/FAIL and writes per-flow logs to `maestro/output/`.

**Plain Maestro (no orchestration):**

```bash
cd regroup/mobile
maestro test -e APP_ID=com.rats.dev maestro/flows/smoke.yaml      # one flow
maestro test -e APP_ID=com.rats.dev maestro/flows/run-all.yaml    # whole suite, one driver session
```

---

## npm script reference

<!-- AUTO-GENERATED: from regroup/mobile/package.json -->

| Script                          | Command                                                           |
| ------------------------------- | ----------------------------------------------------------------- |
| `npm run maestro:seed`          | `./maestro/scripts/reset-and-seed.sh`                             |
| `npm run maestro:smoke:ios`     | `maestro test -e APP_ID=com.rats.dev maestro/flows/smoke.yaml`    |
| `npm run maestro:ios`           | `maestro test -e APP_ID=com.rats.dev maestro/flows/`              |
| `npm run maestro:suite:ios`     | `maestro test -e APP_ID=com.rats.dev maestro/flows/run-all.yaml`  |
| `npm run maestro:smoke:android` | `maestro test -e APP_ID=com.regroup.app maestro/flows/smoke.yaml` |
| `npm run maestro:android`       | `maestro test -e APP_ID=com.regroup.app maestro/flows/`           |
| `npm run seed-e2e`              | `node e2e/setup/seedTestData.js`                                  |

> Note: `maestro:ios` points Maestro at the whole `flows/` directory, which also
> picks up `run-all.yaml` (itself a wrapper that re-runs every flow) — so flows
> execute twice. Prefer `run-flows.sh` or target individual flows.

<!-- END AUTO-GENERATED -->

---

## Flow catalog

<!-- AUTO-GENERATED: from regroup/mobile/maestro/flows/*.yaml headers -->

| Flow                      | Persona / login        | What it covers                                                    |
| ------------------------- | ---------------------- | ----------------------------------------------------------------- |
| `smoke`                   | none (clean launch)    | Harness sanity: app boots past Splash to `initial-landing-screen` |
| `signup`                  | none (creates account) | Landing → login → signup → new-account / org-setup                |
| `guest-home`              | `test-guest-a`         | Guest home dashboard renders stat cards                           |
| `guest-log-chore`         | `test-guest-a`         | Open chore summary and complete a chore                           |
| `guest-activity-dispute`  | `test-guest-a`         | Activity feed + dispute an activity                               |
| `guest-payment-history`   | `test-guest-a`         | Payment history (read-only)                                       |
| `guest-rent-payment`      | `test-guest-a`         | Rent payment up to the Stripe boundary                            |
| `operator-setup-wizard`   | `test-manager`         | Org setup wizard: add house + edit/delete                         |
| `operator-applications`   | `test-manager`         | Applications review → approve → intake                            |
| `operator-manage-guests`  | `test-manager`         | House summary → manage guests                                     |
| `operator-house-settings` | `test-manager`         | Open house settings (partial)                                     |
| `operator-disputes`       | `test-manager`         | View seeded disputes                                              |
| `oxford-dashboard`        | `test-oxford-operator` | Oxford dashboard → charter compliance (read)                      |
| `oxford-onboarding`       | `test-oxford-operator` | Oxford onboarding wizard                                          |

Not standalone: `run-all.yaml` (suite wrapper), `debug-login.yaml`,
`debug-signup.yaml` (diagnostics). Subflows in `maestro/subflows/`
(`login.yaml`, `logout.yaml`) are invoked via `runFlow`, never run directly.

<!-- END AUTO-GENERATED -->

---

## Seeded test data

`./scripts/test-prep.sh` (and `npm run maestro:seed`) run
`e2e/setup/seedTestData.js`, which targets the **emulator** via
`FIREBASE_AUTH_EMULATOR_HOST` / `FIRESTORE_EMULATOR_HOST` and creates:

| Account (`@rats-e2e.com`)      | Role                          |
| ------------------------------ | ----------------------------- |
| `test-guest-a`, `test-guest-b` | Residents of `test-house-123` |
| `test-manager`                 | Operator                      |
| `test-multi-house`             | Multi-property operator       |
| `test-oxford-operator`         | Oxford operator               |
| `applicant1`                   | Pending application           |

Password for all: `TestPassword123!`. It also seeds houses, activities,
disputes, and an application. Creation is idempotent (looks up by email first).

> A separate script, `scripts/create-e2e-auth-users.js`, writes to the **real** > `phoenix-cleanhouse` project — `reset-and-seed.sh` deliberately does not call
> it. Only use it for testing against live Firebase, which this harness doesn't.

---

## Artifacts

| Location                        | Contents                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------- |
| `maestro/output/<flow>.log`     | Per-flow console log (from `run-flows.sh`)                                        |
| `maestro/output/*.xml`          | JUnit reports (`testOutputDir` in `maestro/config.yaml`)                          |
| `~/.maestro/tests/<timestamp>/` | Screenshots (`❌…png` on failure), `maestro.log`, command JSON, XCTest runner log |

---

## Troubleshooting

| Symptom                                                               | Cause / fix                                                                                                                                                                                 |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `firebase-tools no longer supports Java version before 21`            | System Java < 21. `brew install openjdk@21`; `test-prep.sh` auto-selects it, or set `JAVA_HOME` to the openjdk@21 keg.                                                                      |
| `Failed to connect to /127.0.0.1:<port>` / `kAXErrorInvalidUIElement` | XCUITest driver dropped (common on back-to-back runs). Reboot the sim: `xcrun simctl shutdown <udid> && xcrun simctl boot <udid>`. `run-flows.sh` does this automatically and retries once. |
| Flow stuck asserting `initial-landing-screen`                         | App didn't leave Splash. Confirm Metro is up and the emulator is running; check the `❌` screenshot under `~/.maestro/tests/`.                                                              |
| `Element not found` mid-bundle (e.g. `Bundling 56%`)                  | App launched before Metro finished building. Warm the bundle once: `curl -s 'http://localhost:8081/index.bundle?platform=ios&dev=true&minify=false' >/dev/null`, then re-run.               |
| Storage-dependent flow fails, `:9199` down                            | Emulator started without Storage. Stop it and re-run `./scripts/test-prep.sh` (starts auth+firestore+storage together).                                                                     |
| Seeded persona can't log in                                           | Re-seed (`npm run maestro:seed`); ensure the same emulator instance is used by app and seed.                                                                                                |
| `App … is not installed`                                              | Build + install once: `npx react-native run-ios --simulator="E2E-iPhone"`.                                                                                                                  |
