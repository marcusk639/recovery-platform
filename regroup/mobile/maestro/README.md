# Regroup Maestro E2E

Black-box flows that drive the app on a simulator against the local Firebase emulators.

## Coverage

What the suite must prove is listed in [`docs/e2e/coverage-matrix.md`](../docs/e2e/coverage-matrix.md), the launch acceptance checklist. Update a row's `Status` and `Covered by` in the same PR as the flow that covers it; `node scripts/coverage-matrix-check.js` validates it.

## Which app build

**The production guard.** Maestro must never drive a production build: every launch or logout of `com.rats.dev` / `com.regroup.app` signs in anonymously against `phoenix-cleanhouse`. Every flow starts with `maestro/subflows/guard-e2e-app.yaml`, which refuses an `APP_ID` that doesn't end in `.e2e.emu` / `.e2e.stg` before anything launches. `run-flows.sh` and the `npm run maestro:*` scripts also run `maestro/scripts/e2e-build-guard.js`, which checks the installed bundle's E2E marker and refuses while `com.rats.dev` or `com.regroup.app` is installed on the device (a deep link could open it). Keep production builds off test simulators and emulators. A new flow must start with the guard subflow (`maestro/scripts/__tests__/flows-guarded.test.js` fails otherwise).

Only the **E2EEmulator** build (`com.rats.dev.e2e.emu`, Firebase project `demo-regroup-e2e`) connects to the emulators (`src/config/firebase-emulator.ts`, fail-closed). Debug and Release builds use real Firebase, so never run these flows against them: they would sign the test accounts in to production.

Build and install it on the simulator (it embeds its JS bundle, so Metro is not needed):

```sh
xcodebuild -workspace ios/rats.xcworkspace -scheme rats-e2e-emulator -configuration E2EEmulator \
  -sdk iphonesimulator -destination "platform=iOS Simulator,id=$SIM_UDID" -derivedDataPath build/e2e build
xcrun simctl install "$SIM_UDID" build/e2e/Build/Products/E2EEmulator-iphonesimulator/rats.app
```

## Credentials

Flows read the shared test password from `E2E_TEST_PASSWORD`; it is never committed. Export it before running, e.g. `export E2E_TEST_PASSWORD="$(cat ~/.config/regroup-e2e/e2e-test-password)"`, and pass `-e E2E_TEST_PASSWORD="$E2E_TEST_PASSWORD"` to `maestro test`.

Flows that load Stripe data (the payment dashboard in `operator-manual-payment`, the PaymentSheet in `guest-rent-payment`) also need:

- `regroup/functions/.secret.local` (gitignored) with the **e2e sandbox's** `STRIPE_SECRET_KEY`, read by the functions emulator;
- `E2E_STRIPE_ACCOUNT_ID`, a test-mode connected account in that sandbox, exported before seeding. Without it the seed uses a placeholder and says so, and those screens fail to load.

## Run

```sh
./scripts/test-prep.sh                        # repo root: builds functions, starts the
                                              # demo-regroup-e2e emulators, seeds, keeps running
cd regroup/mobile
maestro/scripts/run-flows.sh --sim "$SIM_UDID"                       # whole suite
maestro/scripts/run-flows.sh guest-rent-history --sim "$SIM_UDID"    # one flow
```

On Android (`run-flows.sh` is iOS-only), build `./gradlew assembleE2eEmulator` in `android/`, install `app/build/outputs/apk/e2eEmulator/app-e2eEmulator.apk` (`com.regroup.app.e2e.emu`, reaches the host emulators through `10.0.2.2`), seed with `maestro/scripts/reset-and-seed.sh`, then run a flow with `maestro --device emulator-5554 test -e APP_ID=com.regroup.app.e2e.emu -e E2E_TEST_PASSWORD="$E2E_TEST_PASSWORD" maestro/flows/<flow>.yaml`.

`run-flows.sh` re-seeds once up front (`--no-seed` skips it) and resets the simulator Keychain before each flow, because iOS keeps the Firebase session across `clearState`.

## Seed data

`maestro/scripts/reset-and-seed.sh` runs `maestro/scripts/seed/index.js`. It wipes the emulators and writes the accounts from `e2e/setup/testAccounts.json` (uids `e2e-<id>`), the test and Oxford houses, activities, a dispute, and payments. It refuses any project that is not `demo-` and any non-loopback emulator host (`seed/guard.js`).

Payments (`seed/docs.js`): resident A has card payments of $22.22, dated 30 days after the seed, and $11.11, five days old. Resident B has $77.77. They are stored as the webhook writes them, with a Timestamp `createdAt`.

## Writing flows

- iOS merges a row's child labels into one accessibility label, often prefixed with an icon glyph: match text with `.*Name.*`.
- A pushed screen covers the tab bar. To sign out from one, relaunch with `launchApp: { stopApp: true }` (the session is kept), wait for `house-tab`, then run `subflows/logout.yaml`.
- Elements below the fold need `scrollUntilVisible` before a tap.
- Android leaves some text out of the accessibility tree (the manual payment modal's title, for one). Wait on a testID, and branch with `runFlow: when: platform:` where the platforms need different steps.
- The emulators bind to `127.0.0.1` only (`regroup/firebase.e2e.json`); they have no auth and the functions emulator holds the sandbox Stripe key.

## Meeting directory

The meeting finder searches recovery-api's directory. `scripts/test-prep.sh` starts a local recovery-api emulator (functions :5002, firestore :8082, project `demo-recovery-api`) and seeds fake meetings from `maestro/scripts/seed/directory.js`, near Austin and Cupertino, for every provider and day. Regroup's emulator reaches it through `RECOVERY_API_BASE_URL` in `regroup/e2e/launch-config.json` and a made-up shared `RECOVERY_PLATFORM_API_KEY`. Test runs never touch the real directory. Run `recovery-api`'s `npm ci` once per checkout, and set a simulator's location with `xcrun simctl location <udid> set 30.2672,-97.7431`.

Staging always searches the real directory, never the fake one. `launch-config.json` refuses any other `e2e-staging` value, and `npm run e2e:preflight` checks that the directory still accepts staging's key. Production reads the same `RECOVERY_API_BASE_URL` setting. Both need a `RECOVERY_PLATFORM_API_KEY` in Secret Manager that matches `recovery-platform-e6cb3`'s, and a changed key takes effect when `findMeetings` is next deployed.
