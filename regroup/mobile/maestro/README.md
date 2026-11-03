# Regroup Maestro E2E

Black-box flows that drive the app on a simulator against the local Firebase emulators.

## Which app build

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

`run-flows.sh` re-seeds once up front (`--no-seed` skips it) and resets the simulator Keychain before each flow, because iOS keeps the Firebase session across `clearState`.

## Seed data

`maestro/scripts/reset-and-seed.sh` runs `maestro/scripts/seed/index.js`. It wipes the emulators and writes the accounts from `e2e/setup/testAccounts.json` (uids `e2e-<id>`), the test and Oxford houses, activities, a dispute, and payments. It refuses any project that is not `demo-` and any non-loopback emulator host (`seed/guard.js`).

Payments (`seed/docs.js`): resident A has card payments of $22.22, dated after the seed, and $11.11, five days old. Resident B has $77.77. They are stored as the webhook writes them, with a Timestamp `createdAt`.

## Writing flows

- iOS merges a row's child labels into one accessibility label, often prefixed with an icon glyph: match text with `.*Name.*`.
- A pushed screen covers the tab bar. To sign out from one, relaunch with `launchApp: { stopApp: true }` (the session is kept), wait for `house-tab`, then run `subflows/logout.yaml`.
- Elements below the fold need `scrollUntilVisible` before a tap.
