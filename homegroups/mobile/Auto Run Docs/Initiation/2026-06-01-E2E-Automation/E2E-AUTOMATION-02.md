# Phase 02: Firebase Emulator Integration

Currently every E2E test run hits production Firebase Auth — a real account is logged in, real Firestore documents may be read, and a network failure or auth rate-limit can break the entire suite. This phase wires the test suite to the local Firebase Auth emulator instead, seeds a dedicated test user at startup, and ensures tests are completely isolated from production data. After this phase, `E2E_USE_EMULATOR=true` selects the safe, fast emulator path while the production path remains available for smoke tests.

## Tasks

- [ ] Audit existing Firebase emulator configuration:
  - Read `../firebase.json` (at `homegroups/firebase.json`) to see which emulators are already declared
  - Confirm the Auth emulator is listed (port 9099 per monorepo convention in root CLAUDE.md)
  - If Auth emulator is missing from the `emulators` block, add it: `"auth": { "port": 9099 }`
  - Read `e2e/init.js` to understand the current Detox setup/teardown lifecycle

- [ ] Create `e2e/setup/seed-auth-user.js` — script that creates the E2E test user in the Auth emulator:
  - Uses the Firebase Auth REST emulator endpoint (`http://localhost:9099`) to create a user via fetch — no Firebase Admin SDK needed
  - Reads `E2E_TEST_EMAIL` and `E2E_TEST_PASSWORD` from `require('../env')`
  - Idempotent: if the user already exists (409 response), silently continues
  - Exports an async `seedTestUser()` function
  - Example shape:
    ```js
    const {TEST_EMAIL, TEST_PASSWORD} = require('../env');
    const EMULATOR_AUTH_URL =
      'http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key';
    async function seedTestUser() {
      const res = await fetch(EMULATOR_AUTH_URL, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
          returnSecureToken: true,
        }),
      });
      if (!res.ok && res.status !== 400)
        throw new Error(`Seed failed: ${res.status}`);
    }
    module.exports = {seedTestUser};
    ```

- [ ] Create `e2e/setup/emulator-utils.js` — checks that the Auth emulator is reachable before tests begin:
  - Export `async function assertEmulatorReachable()` that fetches `http://localhost:9099` with a 3-second timeout
  - If unreachable, throws a clear error: "Firebase Auth emulator not running on :9099. Start it with: firebase emulators:start --only auth,firestore"
  - Export `const USE_EMULATOR = process.env.E2E_USE_EMULATOR === 'true'`

- [ ] Update `e2e/init.js` `beforeAll` to conditionally seed the emulator:
  - Import `{ USE_EMULATOR, assertEmulatorReachable }` from `./setup/emulator-utils`
  - Import `{ seedTestUser }` from `./setup/seed-auth-user`
  - In `beforeAll`, after `detox.init(config)`: if `USE_EMULATOR`, call `assertEmulatorReachable()` then `seedTestUser()`
  - This keeps non-emulator runs (production smoke tests) completely unaffected

- [ ] Add `E2E_USE_EMULATOR` and emulator URL env vars to `e2e/.env.e2e.example`:
  - Append these lines with comments:
    ```
    # Set to 'true' to run against local Firebase emulators instead of production
    E2E_USE_EMULATOR=false
    # Emulator base URL (only used when E2E_USE_EMULATOR=true)
    FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
    ```

- [ ] Add emulator npm scripts to `package.json`:
  - `"test:e2e:emulator"`: `"E2E_USE_EMULATOR=true dotenv -e e2e/.env.e2e -- detox test -c ios.sim.debug"`
  - This gives a single command to run the full suite against the emulator

- [ ] Document the emulator test workflow in `e2e/README.md` (create if it doesn't exist):
  - Section 1: **Quick Start (Production)** — copy `.env.e2e.example`, fill in credentials, `npm run test:e2e:test`
  - Section 2: **Emulator Mode (Recommended for CI)** — start emulators with `firebase emulators:start`, then `npm run test:e2e:emulator`
  - Section 3: **Environment Variables** — table listing every `E2E_*` var, whether it's required, and its purpose
