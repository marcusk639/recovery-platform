# CLAUDE.md

RATS (Regroup) is a React Native 0.72 sober living house management app for iOS and Android, backed by Firebase (Firestore, Auth, Functions, Messaging). Cloud Functions live in `../functions/` (sibling directory within the recovery-platform monorepo).

## Commands

```bash
# Tests
npm test                              # unit tests
npx jest path/to/file.test.tsx        # single file
npm run test:coverage                 # with coverage
npm run test:integration              # needs emulator (see .claude/testing.md)
npm run test:e2e:build:ios            # build for E2E
npm run test:e2e:ios                  # run E2E on iOS simulator

# Dev
npm run ios                           # iPhone 14 Pro simulator
npm run android
npm run pod:install                   # CocoaPods
npm run lint
```

## Universal Rules

**Error logging** — Always `logException(error)` from `src/util/logging.ts`. Never `console.error` or `console.log` in production code.

**Imports** — No `@/` path alias in source files; use relative paths. `@/` works in Jest tests only.

**Firebase auth singleton** — `auth.currentUser` (not `auth().currentUser`). `auth` is a pre-initialized singleton from `firebase-setup.ts`.

## Detailed Guidelines

- [Architecture](.claude/architecture.md) — provider tree, state management, navigation, entities, domain concepts
- [Firebase / Firestore](.claude/firebase.md) — collection refs, timestamps, transactions, React Query, security rules
- [Testing](.claude/testing.md) — Jest setup, Firebase mocks, integration tests, Detox E2E
- [Conventions](.claude/conventions.md) — commits, component patterns, imports, selectors, known gotchas
