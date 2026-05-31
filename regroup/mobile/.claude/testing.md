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

## E2E Tests (Detox)

Device: iOS simulator `iPhone 15-Detox`. The global setup aborts if emulators aren't reachable — never run E2E against production Firebase.

```bash
npm run test:e2e:build:ios    # build app for simulator
npm run test:e2e:ios          # run tests
npm run test:e2e:run          # via helper script
```

E2E test files: `e2e/tests/`. Setup: `e2e/setup/globalSetup.js` (includes emulator connectivity guard).
