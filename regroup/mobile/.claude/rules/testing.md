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

- Unit tests → `__mocks__/firebase-setup.ts` (`moduleNameMapper` in `jest.config.js`)
- Integration tests → `src/integration/firebase-admin-setup.ts`

```bash
npm test                              # all unit tests
npx jest path/to/file.test.tsx        # single file
npx jest --testPathPattern="Oxford"   # pattern match
npm run test:coverage                 # with coverage report
```

## Integration Tests

Match `**/*.integration.test.ts`. They need the Firestore (8080) and Auth (9099) emulators. Run them through `emulators:exec` so the emulators are guaranteed, as in the "Emulator-backed suites" section of `regroup/mobile/CLAUDE.md`:

```bash
cd firebase && firebase emulators:exec --only firestore,auth \
  --project demo-test \
  "cd .. && npx jest --config jest.config.integration.js --no-coverage --forceExit"
```

`src/integration/setup.ts` points the Admin SDK at `localhost:8080` / `localhost:9099`, and `src/integration/firebase-admin-setup.ts` initializes project `rats-v2-test`. `src/config/firebase-emulator.ts` is the app's E2EEmulator wiring, not the integration tests'.

## E2E Tests — Maestro

Maestro is the only e2e runner; Detox has been retired. The plan of record is `docs/superpowers/specs/2026-11-06-regroup-launch-reboot-design.md` at the repo root; how to build and run is in `maestro/README.md`. Build the e2e app variants as described in the "Android e2e build types" section of `regroup/mobile/CLAUDE.md` — never run e2e against production Firebase.

```bash
# Install CLI. Use Java 21: firebase-tools >= 15 needs it for the emulators.
curl -Ls "https://get.maestro.mobile.dev" | bash

# From the repo root: start the demo-regroup-e2e emulators and seed them.
./scripts/test-prep.sh

# Re-seed (emulators up): maestro/scripts/reset-and-seed.sh -> maestro/scripts/seed/index.js.
npm run maestro:seed
npm run maestro:smoke:ios        # needs E2E_TEST_PASSWORD (e2e/SECURITY-test-credentials.md)
npm run maestro:ios              # all flows in maestro/flows/
```

**The production guard.** Maestro must never drive a production build: every launch or logout of `com.rats.dev` / `com.regroup.app` signs in anonymously against `phoenix-cleanhouse`. Every flow starts with `maestro/subflows/guard-e2e-app.yaml`, which refuses an `APP_ID` that doesn't end in `.e2e.emu` / `.e2e.stg` before anything launches. `run-flows.sh` and the `npm run maestro:*` scripts also run `maestro/scripts/e2e-build-guard.js`, which checks the installed bundle's E2E marker and refuses while `com.rats.dev` or `com.regroup.app` is installed on the device (a deep link could open it). Keep production builds off test simulators and emulators. A new flow must start with the guard subflow (`maestro/scripts/__tests__/flows-guarded.test.js` fails otherwise).

Flows live in `maestro/flows/` (shared steps in `maestro/subflows/`). `e2e/setup/testAccounts.json` supplies the seed's accounts (`maestro/scripts/seed/docs.js`); `testActivities.json` and `testDisputes.json` are not read by anything. The old `seed-e2e` script (it called a `seedTestData.js` that never existed) has been removed. CI runs no regroup Maestro flow (the old `maestro-smoke` job drove the production-config debug APK; it is build-only since 2026-11-06, as `regroup-android-build`). Reports go to `docs/e2e/reports/`.
