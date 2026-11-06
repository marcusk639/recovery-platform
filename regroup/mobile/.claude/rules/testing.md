---
description: Jest setup, Firebase mocks, integration tests, Maestro E2E
paths: '**/__tests__/**,**/*.test.*,e2e/**,jest.*'
---

# Testing

## Test Locations

Tests live in `__tests__/` directories co-located with source files.

## Unit Tests (Jest)

Preset: `@react-native/jest-preset` (RN 0.88); setup file `jest.setup.js`.

`firebase-setup` imports are aliased (`moduleNameMapper`):

- Unit tests → `__mocks__/firebase-setup.ts`
- Integration tests → `src/integration/firebase-admin-setup.ts`

**Firebase operation log** (`__mocks__/firebase-modular/`): an in-memory Firestore that both the modular API (`getDoc(doc(firestore, 'x', 'y'))`) and, through `namespaced-adapter.js`, old namespaced-style mocks write to. Every call is logged as `{ op, path, data?, options?, constraints? }`; sentinels serialize as `{ __fv: 'serverTimestamp' | 'increment' | … }` and Timestamps as `{ __ts: <millis> }`. Queries evaluate `where` / `orderBy` / `limit` / cursors against the store. Money and integrity paths have `*.oplog.test.ts(x)` suites (51 files) that assert outcomes and log entries, not mock call chains; prefer that style for new service tests. Background: `docs/build/react-native-0.88-upgrade.md` §3.1.

App code uses only the modular API. Some older suites still mock the namespaced shape through the adapter; that test-mock layer is a known follow-up, not a pattern to copy.

```bash
npm test                              # all unit tests
npx jest path/to/file.test.tsx        # single file
npx jest --testPathPattern="Oxford"   # pattern match
npm run test:coverage                 # with coverage report
```

## Integration Tests

Match `**/*.integration.test.ts`. Require Firebase emulator on ports 8080 (Firestore) and 9099 (Auth).

```bash
cd firebase && firebase emulators:exec --only firestore,auth --project demo-test \
  "cd .. && npx jest --config jest.config.integration.js --runInBand --no-coverage --forceExit"
```

Integration suites seed through the Admin SDK and act as signed-in users, so the security rules apply. Run them `--runInBand`: the suite is order-dependent. Baseline after the RN 0.88 upgrade: 35 of 55 pass (decision record, Appendix A).

Emulator must use `127.0.0.1` (not `localhost`) — see `src/config/firebase-emulator.ts`.

## E2E Tests — Maestro

Maestro is the only e2e runner; Detox has been retired. The plan of record is the launch-gate design, `docs/superpowers/specs/2026-10-20-regroup-e2e-launch-gate-design.md` at the repo root (it lands with the `docs/regroup-e2e-launch-gate` branch). Build the e2e app variants as described in the "Android e2e build types" section of `regroup/mobile/CLAUDE.md` — never run e2e against production Firebase.

```bash
# Install CLI (Java 17+ required)
curl -Ls "https://get.maestro.mobile.dev" | bash

# From the repo root: start the demo-regroup-e2e emulators and seed them
./scripts/test-prep.sh
# Then, from regroup/mobile, with the E2EEmulator build installed:
maestro/scripts/run-flows.sh --sim "$SIM_UDID"   # iOS; re-seeds, resets the Keychain per flow
npm run maestro:smoke:ios        # needs E2E_TEST_PASSWORD (e2e/SECURITY-test-credentials.md)
```

Only the E2EEmulator build reaches the emulators; Debug and Release use real Firebase. Details, Android steps and the seed data: `maestro/README.md`.

**The production guard.** Maestro must never drive a production build: every launch or logout of `com.rats.dev` / `com.regroup.app` signs in anonymously against `phoenix-cleanhouse`. Every flow starts with `maestro/subflows/guard-e2e-app.yaml`, which refuses an `APP_ID` that doesn't end in `.e2e.emu` / `.e2e.stg` before anything launches. `run-flows.sh` and the `npm run maestro:*` scripts also run `maestro/scripts/e2e-build-guard.js`, which checks the installed bundle's E2E marker and refuses while `com.rats.dev` or `com.regroup.app` is installed on the device (a deep link could open it). Keep production builds off test simulators and emulators. A new flow must start with the guard subflow (`maestro/scripts/__tests__/flows-guarded.test.js` fails otherwise).

Flows live in `maestro/flows/` (shared steps in `maestro/subflows/`). The seed is `maestro/scripts/seed/` (identities from `e2e/setup/testAccounts.json`; the other JSON fixtures there are unused). CI runs no regroup Maestro flow (the old `maestro-smoke` job drove the production-config debug APK; it is build-only since 2026-11-06, as `regroup-android-build`). Reports go to `docs/e2e/reports/`.
