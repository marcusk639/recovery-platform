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
```

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
