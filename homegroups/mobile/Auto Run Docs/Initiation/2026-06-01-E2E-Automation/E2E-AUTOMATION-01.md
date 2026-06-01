# Phase 01: Security Fix & Env-Var Credential Foundation

The E2E test suite currently has plaintext production credentials hardcoded directly in `e2e/helpers.js` and re-declared in `e2e/screens/auth/auth.spec.js` — the real password `sublime1qaz!QAZ` is committed to source control. This phase eliminates that exposure and wires all credential references through environment variables, leaving the tests fully runnable with a `.env.e2e` file that stays out of git. By the end, the test suite executes identically to before but without secrets in the repo.

## Tasks

- [ ] Audit all E2E files for hardcoded credentials:
  - Run `grep -rn "sublime1qaz\|marcusk639\|TEST_EMAIL\|TEST_PASSWORD" e2e/` to find every occurrence
  - List every file that declares or uses these constants (at minimum: `helpers.js`, `auth.spec.js`)
  - Note whether any other spec files re-declare credentials directly (check all 18 spec files under `e2e/screens/`)

- [ ] Create `e2e/env.js` — centralised env-var loader with fail-fast errors:

  ```js
  // e2e/env.js
  // Loads test credentials from process.env (populated from .env.e2e via detox CLI or dotenv)
  function requireEnv(name) {
    const val = process.env[name];
    if (!val)
      throw new Error(
        `E2E env var ${name} is required but not set. Copy e2e/.env.e2e.example to e2e/.env.e2e and fill in values.`,
      );
    return val;
  }
  module.exports = {
    TEST_EMAIL: requireEnv('E2E_TEST_EMAIL'),
    TEST_PASSWORD: requireEnv('E2E_TEST_PASSWORD'),
  };
  ```

- [ ] Update `e2e/helpers.js` to import from `env.js` and remove hardcoded constants:
  - Replace the `const TEST_EMAIL = ...` and `const TEST_PASSWORD = ...` lines at the top with `const { TEST_EMAIL, TEST_PASSWORD } = require('./env');`
  - No other changes to helper logic needed

- [ ] Update `e2e/screens/auth/auth.spec.js` to remove its own hardcoded credential re-declarations:
  - Remove the `const TEST_EMAIL = ...` and `const TEST_PASSWORD = ...` lines at the top of that file
  - Add `const { TEST_EMAIL, TEST_PASSWORD } = require('../../env');` instead
  - Verify the three tests that reference these constants still compile

- [ ] Create `e2e/.env.e2e.example` — documented template that gets committed to git:

  ```
  # E2E test credentials — copy to e2e/.env.e2e (gitignored) and fill in values
  # For local dev: use your personal Firebase test account
  # For CI: populate from GitHub Actions secrets (see Phase 03)
  E2E_TEST_EMAIL=your-test-account@example.com
  E2E_TEST_PASSWORD=your-test-password
  ```

- [ ] Add `e2e/.env.e2e` to `.gitignore` (root-level `.gitignore` at `mobile/.gitignore`):
  - Append `e2e/.env.e2e` if not already present
  - Also append `e2e/.env.e2e.local` as a second variant

- [ ] Update `package.json` test scripts to load `.env.e2e` before running Detox:
  - Change `"test:e2e:test"` from `"detox test -c ios.sim.debug"` to `"dotenv -e e2e/.env.e2e -- detox test -c ios.sim.debug"`
  - Change `"test:e2e:test:android"` similarly
  - If `dotenv-cli` is not already a devDependency, add it: `npm install --save-dev dotenv-cli`
  - Alternatively, if dotenv-cli causes issues, use `"env $(cat e2e/.env.e2e | xargs) detox test -c ios.sim.debug"` as fallback

- [ ] Verify no plaintext credentials remain and env loading works:
  - Run `grep -rn "sublime1qaz\|marcusk639" e2e/` — output must be empty
  - Run `grep -rn "TEST_EMAIL\|TEST_PASSWORD" e2e/` — only `env.js` and the two updated spec files should appear, all using `require`
  - Create a local `e2e/.env.e2e` with the real credentials (do NOT commit this file) and confirm `npm run test:e2e:test -- --listTests` exits without the "env var required" error
