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
npm run test:e2e:build:ios            # build for E2E
npm run test:e2e:ios                  # run E2E on iOS simulator

# Dev
npm run ios                           # iPhone 14 Pro simulator
npm run android
npm run pod:install                   # CocoaPods
npm run lint
npm run typecheck                     # / typecheck:ratchet
npm run deploy:rules                  # firestore rules + storage ONLY
npm run deploy:indexes                # indexes are NOT in deploy:rules
```

## Android e2e build types

```bash
cd android && ./gradlew assembleE2eEmulator assembleE2eStaging assembleRelease
../scripts/verify-android-variants.sh   # checks package, label, bundle marker, Firebase project, cleartext
```

- `e2eEmulator` (`com.regroup.app.e2e.emu`, project `demo-regroup-e2e`, committed config) and `e2eStaging` (`com.regroup.app.e2e.stg`, project `regroup-e2e`) are release builds signed with the debug key. Each bundle task sets `E2E_VARIANT` itself; release bundles run with it removed. Never put `E2E_VARIANT` in `.env` (babel.config.js refuses it).
- `e2eStaging` copies its `google-services.json` from `~/.config/regroup-e2e/google-services.e2e-staging.json` and fails without it. So does `./gradlew assemble`, or any other task that covers all variants.

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

**Debug loggers** — Use `simple-debug-logger.ts` (it is `__DEV__`-guarded). Do NOT use `debug-logger.ts` — it persists full user objects to device storage + console unconditionally (PII leak). Both export `logInfo/logWarn/logError/logDebug`, so importing the wrong one is easy. Crashlytics is removed (zero call sites) — Sentry via `logException` is the only error sink.

**Imports** — No `@/` path alias in source files; use relative paths. `@/` works in Jest tests only.

**Firebase auth singleton** — `auth.currentUser` (not `auth().currentUser`). `auth` is a pre-initialized singleton from `firebase-setup.ts`.

## Detailed Guidelines

- [Architecture](.claude/rules/architecture.md) — provider tree, state management, navigation, entities, domain concepts
- [Firebase / Firestore](.claude/rules/firebase.md) — collection refs, timestamps, transactions, React Query, security rules
- [Testing](.claude/rules/testing.md) — Jest setup, Firebase mocks, integration tests, Detox E2E
- [Conventions](.claude/rules/conventions.md) — commits, component patterns, imports, selectors, known gotchas
