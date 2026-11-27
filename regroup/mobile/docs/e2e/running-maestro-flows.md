# Running the Maestro E2E Flows

How to run the Regroup mobile end-to-end suite locally on the iOS simulator,
driven by [Maestro](https://maestro.dev) against the Firebase emulator suite.
The build and run reference of record is [`maestro/README.md`](../../maestro/README.md).

> **TL;DR (automated path)**
>
> ```bash
> # Terminal 1 — emulators + seeded data (stays running):
> ./scripts/test-prep.sh
>
> # Once, and after app changes: build + install the E2EEmulator app
> # (xcodebuild commands in maestro/README.md, "Which app build"). It embeds
> # its JS bundle, so there is no Metro step.
>
> # Terminal 2 — run the flows (E2E_TEST_PASSWORD exported):
> cd regroup/mobile && maestro/scripts/run-flows.sh          # whole suite
> cd regroup/mobile && maestro/scripts/run-flows.sh smoke    # one flow
> ```

---

## How it fits together

E2E runs have **two long-lived pieces** plus the test driver. Both must be in
place before you launch any flow:

| Piece                         | What it is                                                                                                                                          | Started by                                                                                         | Ports                                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Firebase emulators + seed** | Local Auth + Firestore + Storage + Functions with canonical test accounts, houses, a dispute and payments; plus the recovery-api directory emulator | `./scripts/test-prep.sh`                                                                           | UI `:4000`, Firestore `:8080`, Auth `:9099`, Storage `:9199`, Functions `:5001`; directory `:5002`/`:8082` |
| **The app**                   | `com.rats.dev.e2e.emu` **E2EEmulator** build installed on the simulator; embeds its JS bundle (no Metro)                                            | `xcodebuild` the `rats-e2e-emulator` scheme, then `xcrun simctl install` (see `maestro/README.md`) | —                                                                                                          |
| **Maestro + XCUITest**        | Drives the app and asserts via accessibility (`testID`)                                                                                             | `maestro test …` / `run-flows.sh`                                                                  | ephemeral                                                                                                  |

Only the E2EEmulator build talks to the emulators. Its bundle is built with
`E2E_VARIANT=emulator`, and `firebase-setup.ts` then connects Auth, Firestore,
Storage and Functions to them (`src/config/firebase-emulator.ts`), failing closed
if one is unreachable. **A Debug build (`com.rats.dev`) uses production
Firebase**, so never run flows against it; the guard subflow and
`maestro/scripts/e2e-build-guard.js` refuse it. The `IS_E2E_TEST` launch argument
only relaxes automation-hostile UI in an iOS Debug build (`src/util/e2e.ts`); it
does not route Firebase.

---

## One-time setup

| Requirement                                      | Check / install                                                                                                      |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Xcode + command line tools                       | `xcode-select --install`                                                                                             |
| **JDK 21+** (firebase-tools ≥ 15 requires it)    | `brew install openjdk@21` — `test-prep.sh` auto-selects it                                                           |
| Maestro CLI                                      | `curl -fsSL https://get.maestro.mobile.dev \| bash`                                                                  |
| Node deps                                        | `cd regroup/mobile && npm install`                                                                                   |
| CocoaPods                                        | `cd regroup/mobile/ios && pod install`                                                                               |
| **E2EEmulator app built + installed on the sim** | `xcodebuild … -scheme rats-e2e-emulator -configuration E2EEmulator …` + `xcrun simctl install` (`maestro/README.md`) |

The suite targets the **`E2E-iPhone`** simulator
(UDID `809BD7B9-D9D5-45D2-AEA8-12F885F54407`). Override with `SIM_UDID=…` or
`--sim <udid>`. The iOS app id is **`com.rats.dev.e2e.emu`** (Android:
`com.regroup.app.e2e.emu`). `e2e-build-guard.js` refuses to run while the
production `com.rats.dev` / `com.regroup.app` is installed on the device.

You do **not** need to create Firebase accounts by hand — the seed script creates
them in the Auth emulator (see [Seeded test data](#seeded-test-data)).

---

## Step 1 — Emulators + seed (Terminal 1)

```bash
./scripts/test-prep.sh        # from the repo root
```

This builds `regroup/functions` and `recovery-api`, starts Auth + Firestore +
Storage + Functions from `regroup/firebase.e2e.json` with `--project
demo-regroup-e2e`, starts the recovery-api directory emulator, waits for the UI,
seeds the canonical fixtures, and then **stays running**. Leave the terminal
open; `Ctrl-C` stops the emulators. (The payment suite in `regroup/e2e` uses a
separate config, `regroup/firebase.payments.json`, project
`demo-regroup-payments`; see `maestro/README.md`.)

- If a suite is already running on `:4000`, the script re-seeds only and exits
  (it won't fight over ports). It must be the `demo-regroup-e2e` suite from this
  script; the seed refuses any other project.
- Re-seed at any time without restarting emulators:
  `cd regroup/mobile && npm run maestro:seed`.

## Step 2 — Build + install the E2EEmulator app

Follow "Which app build" in [`maestro/README.md`](../../maestro/README.md). The
build embeds its JS bundle, so Metro is not used; rebuild and reinstall after
source changes.

## Step 3 — Run flows (Terminal 2)

**Automated runner (recommended):**

```bash
cd regroup/mobile
maestro/scripts/run-flows.sh                 # full suite, in order
maestro/scripts/run-flows.sh smoke           # a single flow (".yaml" optional)
maestro/scripts/run-flows.sh all --no-seed   # don't re-seed first
maestro/scripts/run-flows.sh all --no-reboot # don't reboot the sim first
```

`run-flows.sh` does the things that make local runs reliable:

1. **Preflight** — verifies `E2E_TEST_PASSWORD`, Maestro, a booted sim, the
   emulator and the installed app, then runs `e2e-build-guard.js`; prints
   exactly what's missing and how to fix it.
2. **Clean driver** — reboots the simulator once up front (the reliable fix for
   the XCUITest driver dropping between back-to-back runs).
3. **Fresh data** — re-seeds the emulator (skip with `--no-seed`).
4. **Sequential execution** — runs flows one at a time; if a flow fails with a
   driver-connection error it reboots and **retries once**.
5. **Summary** — prints PASS/FAIL and writes per-flow logs to `maestro/output/`.

**Plain Maestro (no orchestration):** use this only to debug a single flow. It
skips `e2e-build-guard.js`, so nothing checks the installed bundle's e2e marker
or that no production build (`com.rats.dev`, `com.regroup.app`) is installed on
the device. The flows' guard subflow still refuses a non-e2e `APP_ID`. Prefer
`run-flows.sh` or the npm scripts below, which run the guard first.

```bash
cd regroup/mobile
maestro test -e APP_ID=com.rats.dev.e2e.emu maestro/flows/smoke.yaml      # one flow (the guard subflow refuses any non-e2e APP_ID)
maestro test -e APP_ID=com.rats.dev.e2e.emu maestro/flows/run-all.yaml    # whole suite, one driver session
```

---

## npm script reference

<!-- AUTO-GENERATED: from regroup/mobile/package.json -->

With several simulators or emulators booted, set `E2E_DEVICE` to a UDID (iOS) or
serial (Android): the scripts pass it as `--device` to both the guard and Maestro,
so the device the guard checks is the device Maestro drives. Unset, both pick
the booted device as before.

| Script                          | Command                                                                                                                |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `npm run maestro:seed`          | `./maestro/scripts/reset-and-seed.sh`                                                                                  |
| `npm run maestro:smoke:ios`     | `node maestro/scripts/e2e-build-guard.js … && maestro test -e APP_ID=com.rats.dev.e2e.emu maestro/flows/smoke.yaml`    |
| `npm run maestro:ios`           | `node maestro/scripts/e2e-build-guard.js … && maestro test -e APP_ID=com.rats.dev.e2e.emu maestro/flows/`              |
| `npm run maestro:suite:ios`     | `node maestro/scripts/e2e-build-guard.js … && maestro test -e APP_ID=com.rats.dev.e2e.emu maestro/flows/run-all.yaml`  |
| `npm run maestro:suite:full`    | identical to `maestro:suite:ios`                                                                                       |
| `npm run maestro:smoke:android` | `node maestro/scripts/e2e-build-guard.js … && maestro test -e APP_ID=com.regroup.app.e2e.emu maestro/flows/smoke.yaml` |
| `npm run maestro:android`       | `node maestro/scripts/e2e-build-guard.js … && maestro test -e APP_ID=com.regroup.app.e2e.emu maestro/flows/`           |

> Note: `maestro:ios` points Maestro at the whole `flows/` directory, which also
> picks up `run-all.yaml` (itself a wrapper that re-runs every flow) — so flows
> execute twice. Prefer `run-flows.sh` or target individual flows. Every
> `maestro:*` script except `maestro:seed` first checks `E2E_TEST_PASSWORD` and
> passes it with `-e`. The old `seed-e2e` script (it called an
> `e2e/setup/seedTestData.js` that never existed) has been removed.

<!-- END AUTO-GENERATED -->

---

## Flow catalog

<!-- AUTO-GENERATED: from regroup/mobile/maestro/flows/*.yaml headers -->

| Flow                      | Persona / login                | What it covers                                                                  |
| ------------------------- | ------------------------------ | ------------------------------------------------------------------------------- |
| `smoke`                   | none (clean launch)            | Harness sanity: app boots past Splash to `initial-landing-screen`               |
| `signup`                  | none (creates account)         | Landing → login → signup → new-account / org-setup                              |
| `guest-home`              | `test-guest-a`                 | Guest home dashboard renders stat cards                                         |
| `guest-log-chore`         | `test-guest-a`                 | Open chore summary and complete a chore                                         |
| `guest-activity-dispute`  | `test-guest-a`                 | Activity feed + dispute an activity                                             |
| `guest-payment-history`   | `test-guest-a`                 | Payment history (read-only)                                                     |
| `guest-rent-history`      | `test-guest-a`                 | Own payment history on Pay Rent, newest first; no other resident's              |
| `guest-rent-payment`      | `test-guest-a`                 | Rent payment up to the Stripe boundary                                          |
| `operator-setup-wizard`   | `test-manager`                 | Org setup wizard: add house + edit/delete                                       |
| `operator-applications`   | `test-manager`                 | Applications review → approve → intake                                          |
| `operator-manage-guests`  | `test-manager`                 | House summary → manage guests                                                   |
| `operator-house-settings` | `test-manager`                 | Open house settings (partial)                                                   |
| `operator-disputes`       | `test-manager`                 | View seeded disputes                                                            |
| `operator-manual-payment` | `test-manager`, `test-guest-a` | Record a manual payment; it lists in date order (needs `E2E_STRIPE_ACCOUNT_ID`) |
| `oxford-dashboard`        | `test-oxford-operator`         | Oxford dashboard → charter compliance (read)                                    |
| `oxford-onboarding`       | `test-oxford-operator`         | Oxford onboarding wizard                                                        |

Not standalone: `run-all.yaml` (suite wrapper), `debug-login.yaml`,
`debug-signup.yaml` (diagnostics). Subflows in `maestro/subflows/`
(`guard-e2e-app.yaml`, which every flow runs first, `login.yaml`, `logout.yaml`,
`open-rent-history.yaml`) are invoked via `runFlow`, never run directly.

<!-- END AUTO-GENERATED -->

---

## Seeded test data

`./scripts/test-prep.sh` (and `npm run maestro:seed`) run
`maestro/scripts/seed/index.js`, which wipes the **emulators** (it refuses any
non-`demo-` project or non-loopback host, `seed/guard.js`) and creates, from the
identities in `e2e/setup/testAccounts.json` (uids `e2e-<id>`):

| Account (`@rats-e2e.com`)      | Role                          |
| ------------------------------ | ----------------------------- |
| `test-guest-a`, `test-guest-b` | Residents of `test-house-123` |
| `test-manager`                 | Operator of `test-house-123`  |
| `test-oxford-operator`         | Oxford operator               |
| `test-oxford-new`              | Oxford operator, not onboarded yet (`test-house-oxford-new`) |
| `test-lapsed-operator`         | Operator whose subscription ended (`test-house-lapsed`, `subscriptionStatus: canceled`); billing flows |

Password for all: `$E2E_TEST_PASSWORD`. It also seeds the test and Oxford
houses, activities, a dispute, and payments. Each run wipes and recreates
everything. (`testAccounts.json` also lists `test-multi-house`, which the seed
does not create.)

> Nothing in this harness writes to live Firebase: the seed's guard refuses any
> project that is not `demo-` or any host that is not loopback.

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
| Flow stuck asserting `initial-landing-screen`                         | App didn't leave Splash. Confirm the emulators are running (an E2EEmulator build stops with `E2EEmulatorUnreachable` without them); check the `❌` screenshot under `~/.maestro/tests/`.    |
| `Element not found` mid-bundle (e.g. `Bundling 56%`)                  | A Metro-served Debug build is installed. Install the E2EEmulator build, which embeds its bundle.                                                                                            |
| Storage-dependent flow fails, `:9199` down                            | Emulator started without Storage. Stop it and re-run `./scripts/test-prep.sh` (starts auth+firestore+storage+functions together).                                                           |
| Seeded persona can't log in                                           | Re-seed (`npm run maestro:seed`); ensure the same emulator instance is used by app and seed.                                                                                                |
| `App … is not installed`                                              | Build + install the E2EEmulator app (`maestro/README.md`, "Which app build").                                                                                                               |
| A run must be stopped                                                 | Stop Maestro by PID (`pgrep -f 'maestro test'`, then `kill <pid>`). Never `pkill -f maestro`: it also kills the MCP servers' `npm exec` processes, whose PATH carries `.maestro/bin`.             |
