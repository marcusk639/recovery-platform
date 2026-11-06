---
description: Jest setup, Firebase mocks, integration tests, Maestro E2E
paths: '**/__tests__/**,**/*.test.*,e2e/**,jest.*'
---

# Testing

## Test Locations

Tests live in `__tests__/` directories co-located with source files.

## Unit Tests (Jest)

Firebase modules are globally mocked in `jest.setup.js` — provides `collection`, `doc`, `get`, `set`, `onSnapshot` stubs.

`firebase-setup` imports are aliased:

- Unit tests → `__mocks__/firebase-setup.js`
- Integration tests → `src/integration/firebase-admin-setup.ts`

```bash
npm test                              # all unit tests
npx jest path/to/file.test.tsx        # single file
npx jest --testPathPattern="Oxford"   # pattern match
npm run test:coverage                 # with coverage report
```

## Integration Tests

Match `**/*.integration.test.ts`. Require Firebase emulator on ports 8080 (Firestore) and 9099 (Auth).

```bash
firebase emulators:start --only firestore,auth   # start first
npm run test:integration
```

Emulator must use `127.0.0.1` (not `localhost`) — see `src/config/firebase-emulator.ts`.

## E2E Tests — Maestro

Maestro is the only e2e runner; Detox has been retired. The plan of record is the launch-gate design, `docs/superpowers/specs/2026-10-20-regroup-e2e-launch-gate-design.md` at the repo root (it lands with the `docs/regroup-e2e-launch-gate` branch). Build the e2e app variants as described in the "Android e2e build types" section of `regroup/mobile/CLAUDE.md` — never run e2e against production Firebase.

```bash
# Install CLI (Java 17+ required)
curl -Ls "https://get.maestro.mobile.dev" | bash

# Run flows. There is no working seed step: `npm run maestro:seed` is BROKEN
# (it calls e2e/setup/seedTestData.js, which has never existed). Seeding is
# unresolved until the launch-gate walking skeleton lands.
npm run maestro:smoke:ios        # needs E2E_TEST_PASSWORD (e2e/SECURITY-test-credentials.md)
npm run maestro:ios              # all flows in maestro/flows/
```

**The production guard.** Maestro must never drive a production build: every launch or logout of `com.rats.dev` / `com.regroup.app` signs in anonymously against `phoenix-cleanhouse`. Every flow starts with `maestro/subflows/guard-e2e-app.yaml`, which refuses an `APP_ID` that doesn't end in `.e2e.emu` / `.e2e.stg` before anything launches. `run-flows.sh` and the `npm run maestro:*` scripts also run `maestro/scripts/e2e-build-guard.js`, which checks the installed bundle's E2E marker. A new flow must start with the guard subflow (`maestro/scripts/__tests__/flows-guarded.test.js` fails otherwise).

Flows live in `maestro/flows/` (shared steps in `maestro/subflows/`). `e2e/setup/` holds unused JSON fixtures; nothing reads them yet. CI runs no regroup Maestro flow (the old `maestro-smoke` job drove the production-config debug APK; it is build-only since 2026-11-06, as `regroup-android-build`). Reports go to `docs/e2e/reports/`.
