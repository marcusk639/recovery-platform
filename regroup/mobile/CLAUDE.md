# CLAUDE.md

Regroup is a React Native 0.72 sober living house management app for iOS and Android, backed by Firebase (Firestore, Auth, Functions, Messaging). Cloud Functions live in `../functions/` (sibling directory within the recovery-platform monorepo).

> **Codename:** the app's internal name is `rats` (`app.json` `name`/`displayName`, iOS target) — a legacy identifier retained for App Store / Play Store / Firebase continuity. Canonical product name is **Regroup**; don't rename the `rats` identifier without coordinating native + store config changes.

## Commands

```bash
# Tests
npm test                              # unit tests
npx jest path/to/file.test.tsx        # single file
npm run test:coverage                 # with coverage
npm run test:integration              # needs emulators — see below
npm run test:rules                    # needs emulators — see below
npm run maestro:smoke:ios             # Maestro e2e smoke (needs E2E_TEST_PASSWORD); see below

# Dev
npm run ios                           # iPhone 14 Pro simulator
npm run android
npm run pod:install                   # CocoaPods
npm run lint
npm run typecheck                     # / typecheck:ratchet
npm run deploy:rules                  # firestore rules + storage ONLY
npm run deploy:indexes                # indexes are NOT in deploy:rules
npm run check:env                     # bundled env vars present (STRIPE_PUBLISHABLE_KEY)
npm run check:env:release             # + release-guard rules and GOOGLE_MAPS_API_KEY
```

`check:env` (`scripts/check-release-env.js`) checks the shell plus `.env`. Both modes fail if `E2E_VARIANT` is set, or if `STRIPE_PUBLISHABLE_KEY` is unset or not a `pk_` key. `--release` adds the release guard's Stripe-key rule (`pk_live_` only) and is the only check that `GOOGLE_MAPS_API_KEY` is set. No build runs it, so run it by hand before a store build.

## Android e2e build types

E2E runs on Maestro only (Detox was retired). The design of record is `../../docs/superpowers/specs/2026-11-06-regroup-launch-reboot-design.md`; flows are in `maestro/flows/`, and how to build and run them is in `maestro/README.md`. CI runs no regroup Maestro flow: the old `maestro-smoke` job drove the production-config debug APK and was made build-only on 2026-11-06 (`regroup-android-build`).

```bash
cd android && ./gradlew assembleE2eEmulator assembleE2eStaging assembleRelease
../scripts/verify-android-variants.sh   # checks package, label, bundle marker, Firebase project, cleartext
```

- `e2eEmulator` (`com.regroup.app.e2e.emu`, project `demo-regroup-e2e`, committed config) and `e2eStaging` (`com.regroup.app.e2e.stg`, project `regroup-e2e`) are release builds signed with the debug key. Each bundle task sets `E2E_VARIANT` itself; release bundles run with it removed. Never put `E2E_VARIANT` in `.env` (babel.config.js refuses it).
- `e2eStaging` copies its `google-services.json` from `~/.config/regroup-e2e/google-services.e2e-staging.json` and fails without it. So does `./gradlew assemble`, or any other task that covers all variants.
- Maestro refuses non-e2e builds: every flow starts with `maestro/subflows/guard-e2e-app.yaml`, and the runners call `maestro/scripts/e2e-build-guard.js` (app id, bundle marker, and no production build installed on the device). Never pass `APP_ID=com.rats.dev` or `com.regroup.app`.
- iOS: the configurations `E2EEmulator` (`com.rats.dev.e2e.emu`) and `E2EStaging` (`com.rats.dev.e2e.stg`), schemes `rats-e2e-emulator` / `rats-e2e-staging`; check builds with `scripts/verify-ios-variants.sh`. On iOS the emulator variant means the `E2EEmulator` configuration: `react-native-launch-arguments` is linked only into the e2e configurations (`react-native.config.js`), so a Debug build served by a Metro started with `E2E_VARIANT` fails with that module's LINKING_ERROR. `E2EStaging` copies `~/.config/regroup-e2e/GoogleService-Info.e2e-staging.plist` and fails without it.
- Release guard (`scripts/release-guard.js`): an Android `release` build (`assembleRelease`/`bundleRelease`) and every iOS configuration other than Debug and `E2E*` (Release, archives) fail unless the shipped Firebase config is `phoenix-cleanhouse` and `STRIPE_PUBLISHABLE_KEY` is `pk_live_…`, with `E2E_VARIANT` unset. The key is resolved as the bundle resolves it: exported in the build shell, then (iOS) `ios/.xcode.env.local`, then `.env`. Prefer exporting it for the store build: an e2e build refuses a `pk_live_` key (babel.config.js at bundle time, `E2ELiveStripeKey` at startup), so a live key left in `.env` breaks every e2e build until you export `STRIPE_PUBLISHABLE_KEY=pk_test_…` for it.
- Bundled values are a Gradle input: every Android bundle task takes `build/bundled-env/<variant>/bundled-env.sha256` (a digest of `STRIPE_PUBLISHABLE_KEY`, `RATS_WEB_URL`, `GOOGLE_MAPS_API_KEY` from the shell and `.env`; `scripts/bundled-env.js`), so changing one re-bundles. Metro has no such input: a Metro started with `E2E_VARIANT` (or a different key) keeps the old inlined values in its transform cache, so restart it with `npm start -- --reset-cache`.

## Release

Store builds are manual; no lane builds them.

| Platform | Bundle / package id | Version (build) | Source                                                                                |
| -------- | ------------------- | --------------- | ------------------------------------------------------------------------------------- |
| iOS      | `com.rats.dev`      | 1.53 (40)       | `ios/rats.xcodeproj/project.pbxproj` (`MARKETING_VERSION`, `CURRENT_PROJECT_VERSION`) |
| Android  | `com.regroup.app`   | 0.55 (39)       | `android/app/build.gradle` `defaultConfig` (`versionName`, `versionCode`)             |

- **fastlane** (`fastlane/Fastfile`, `Appfile`): three lanes. `ios metadata` (deliver, metadata and screenshots, no binary), `ios beta` (pilot uploads a prebuilt IPA from the hardcoded path `/tmp/regroup-export/rats.ipa`), and `android metadata` (supply, internal track, no APK/AAB). There is no build lane: archive and export the IPA yourself first. No App Store Connect auth is configured in the repo (no API key), so `deliver`/`pilot` need one from the environment or an interactive Apple ID sign-in. `beta` also passes `apple_id` an email address, where pilot expects the app's numeric Apple ID; check it before the first upload. The `screenshots/` directories the metadata lanes read are not committed. Android uses `fastlane/google-play-key.json` (gitignored).
- **Android upload signing**: the `release` signing config reads the Gradle properties `MYAPP_UPLOAD_STORE_FILE`, `MYAPP_UPLOAD_STORE_PASSWORD`, `MYAPP_UPLOAD_KEY_ALIAS` and `MYAPP_UPLOAD_KEY_PASSWORD` (e.g. in `~/.gradle/gradle.properties`). It is applied only when `MYAPP_UPLOAD_STORE_FILE` is set, so **without them `assembleRelease`/`bundleRelease` still succeed but produce an unsigned artifact**. Nothing reads an `android/keystore.properties`.
- **Sentry**: the DSN is hardcoded in `src/config/sentry.ts`; e2e builds get no DSN and `enabled: false`. iOS source-map and debug-file uploads (the "Bundle React Native code and images" and "Upload Debug Symbols to Sentry" phases in `project.pbxproj`) are skipped for `E2E*` configurations, when `SENTRY_DISABLE_AUTO_UPLOAD=true`, or when `ios/sentry.properties` is missing (it is not committed). Android disables the upload tasks for e2e build types (`build.gradle`). Android release uploads follow `@sentry/react-native/sentry.gradle` from `node_modules`, so check that before relying on them.
- Run `npm run check:env:release` before a store build; the release guard (above) also runs inside the build.

## Emulator-backed suites

Both configs exist again (they were unrunnable: `regroup/.gitignore` ignored all
JavaScript, so neither could be committed). Run them through `emulators:exec` so
the emulators are guaranteed rather than assumed:

```bash
# Security rules — 240 tests. Needs firestore, storage AND auth; with firestore
# alone the storage suite fails on grpc connection errors.
cd firebase && firebase emulators:exec --only firestore,storage,auth \
  --project demo-test \
  "cd .. && npx jest --config jest.config.rules.js --no-coverage --forceExit"

# Integration — needs firestore + auth. 24 of 48 currently fail; those suites
# had never executed before the runner was restored, so the failures are
# pre-existing and unverified, not regressions.
cd firebase && firebase emulators:exec --only firestore,auth \
  --project demo-test \
  "cd .. && npx jest --config jest.config.integration.js --no-coverage --forceExit"
```

Rules, storage rules and indexes live in `mobile/firebase/` (`firestore.rules`, `storage.rules`, `firestore.indexes.json`; rules tests in `firebase/__tests__/`). The project pin is `../.firebaserc`; there is no `.firebaserc` here. `firebase/firebase.json` references `database.rules.json`, which does not exist.

Integration tests alias `firebase-setup` to `src/integration/firebase-admin-setup.ts`;
unit tests alias it to the mock. Getting that wrong makes every integration test
fail on reads.

## Universal Rules

**Error logging** — Always `logException(error)` from `src/util/logging.ts`. Never `console.error` or `console.log` in production code.

**Debug loggers** — Use `src/util/simple-debug-logger.ts` (it is `__DEV__`-guarded). The old `debug-logger.ts`, which persisted full user objects to device storage (a PII leak), was deleted in e044fc5c; don't bring it back. Crashlytics is removed (zero call sites) — Sentry via `logException` is the only error sink.

**Imports** — No `@/` path alias in source files; use relative paths. `@/` works in Jest tests only.

**Firebase auth singleton** — `auth.currentUser` (not `auth().currentUser`). `auth` is a pre-initialized singleton from `firebase-setup.ts`.

## Detailed Guidelines

- [Architecture](.claude/rules/architecture.md) — provider tree, state management, navigation, entities, domain concepts
- [Firebase / Firestore](.claude/rules/firebase.md) — collection refs, timestamps, transactions, React Query, security rules
- [Testing](.claude/rules/testing.md) — Jest setup, Firebase mocks, integration tests, Maestro E2E
- [Conventions](.claude/rules/conventions.md) — commits, component patterns, imports, selectors, known gotchas
