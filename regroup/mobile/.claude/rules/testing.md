---
description: Jest setup, Firebase mocks, integration tests, Maestro E2E
paths: "**/__tests__/**,**/*.test.*,e2e/**,jest.*"
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

# Seed the emulators (e2e/setup/ fixtures), then run flows
npm run maestro:seed
npm run maestro:smoke:ios        # needs E2E_TEST_PASSWORD (e2e/SECURITY-test-credentials.md)
npm run maestro:ios              # all flows in maestro/flows/
```

Flows live in `maestro/flows/` (shared steps in `maestro/subflows/`); seed fixtures in `e2e/setup/`. The CI `maestro-smoke` job runs the repo-root `e2e-maestro/regroup/` flows on Maestro Cloud. Reports go to `docs/e2e/reports/`.
