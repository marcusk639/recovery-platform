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

## A new test house

With the manual-testing emulators running (`scripts/test-prep.sh`), this creates a new house with three residents and prints their sign-in emails. Each run makes a new house, and the password is `E2E_TEST_PASSWORD`.

```sh
cd regroup/e2e && E2E_TEST_PASSWORD=<the local password> npm run e2e:new-house
```

It goes through the real signup path (`createHouses`, invitations, `redeemInvitation`, then the app's writes through the security rules). Only the operator's subscription is seeded. Its test is `npm run test:payments -- newHouseWithGuests`.

## Credentials

Flows read the shared test password from `E2E_TEST_PASSWORD`; it is never committed. Export it before running, e.g. `export E2E_TEST_PASSWORD="$(cat ~/.config/regroup-e2e/e2e-test-password)"`, and pass `-e E2E_TEST_PASSWORD="$E2E_TEST_PASSWORD"` to `maestro test`.

Flows that load Stripe data (the payment dashboard in `operator-manual-payment`, the PaymentSheet in `guest-rent-payment`) also need:

- `regroup/functions/.secret.local` (gitignored) with the **e2e sandbox's** `STRIPE_SECRET_KEY`, read by the functions emulator. The payment suite below needs the **regroup-local** values in this same file, and refuses to start with anything else, so switch them back after Maestro testing;
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

Staging and production read the same `RECOVERY_API_BASE_URL` setting, pointing at the deployed directory on `recovery-platform-e6cb3`, and need `RECOVERY_PLATFORM_API_KEY` in their Secret Manager.

## Payment suite (server layer)

Real Stripe objects against the emulators, with events delivered by the test, so duplicates, ordering and late delivery are all testable locally. Plan: `docs/superpowers/plans/2026-11-08-regroup-launch-p6-payment-suites.md`. Rows: `SUB-*` and `RENT-*` in `docs/e2e/coverage-matrix.md`.

**One-time setup:**

1. Create a Stripe sandbox named `regroup-local` with Connect on and **no webhook endpoints**. The e2e sandbox's endpoints point at staging, so its events would write there. `assertLocalSandbox` refuses any other account and any endpoint.
2. Save its secret key to `~/.config/regroup-e2e/stripe-local-secret-key.txt` and any long random `whsec_` value to `~/.config/regroup-e2e/stripe-local-webhook-secret.txt`, both mode 600.
3. In the worktree's `regroup/functions/.secret.local`, set `STRIPE_SECRET_KEY` to that key, and `STRIPE_TEST_WEBHOOK_SECRET` and `STRIPE_CONNECT_TEST_WEBHOOK_SECRET` to that value. Leave out `SENDGRID_API_KEY`, so tests can't send email. `npm run test:payments` checks all three against the files from step 2 before it starts anything: the emulator charges with this file, not the harness's.

**Run:**

```sh
cd regroup/e2e
npm ci
(cd ../functions && npm ci)
npm run test:payments              # everything
npm run test:payments -- harness   # files matching a name
```

The first run provisions prices, a test Connect account and `functions/.env.demo-regroup-e2e` (`scripts/stripe-local-setup.ts`). A new Connect account can take a few minutes to verify. The suite has its own emulator ports (`regroup/firebase.payments.json`), so the emulators from `test-prep.sh` can stay up.

**Time:** a Stripe test clock moves Stripe's time only. Functions and the app keep reading `Date.now()`, so test expiry by writing a past deadline to Firestore.

**`admin.firestore.FieldValue` under the emulator:** firebase-tools hands out `admin.firestore` through `.bind()`, which drops its properties, so webhook handlers and `getStripeAccountStatus` throw there. Production has no such wrapper. `regroup/e2e/emulator/preserve-admin-statics.js` restores them through `NODE_OPTIONS`.
