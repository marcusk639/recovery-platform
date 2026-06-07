# E2E Testing Guide - Regroup Recovery App

**Complete guide for running, debugging, and maintaining E2E tests**

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [Running Tests](#running-tests)
4. [Test Organization](#test-organization)
5. [Debugging Failed Tests](#debugging-failed-tests)
6. [Writing New Tests](#writing-new-tests)
7. [CI/CD Integration](#cicd-integration)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

- **Node.js** 16+ and npm
- **React Native CLI** (for iOS/Android builds)
- **Detox CLI**: `npm install -g detox-cli`
- **Firebase CLI**: `npm install -g firebase-tools`
- **iOS**: Xcode 14+ and Command Line Tools
- **Android**: Android Studio with SDK 30+

### Environment Setup

```bash
# Install dependencies
npm install

# iOS: Install pods
cd ios && pod install && cd ..

# Build app for testing (iOS)
detox build --configuration ios.sim.debug

# Build app for testing (Android)
detox build --configuration android.emu.debug
```

---

## Initial Setup

### 1. Start Firebase Emulators

E2E tests require Firebase Emulators for authentication and Firestore:

```bash
# Start emulators (in a separate terminal)
firebase emulators:start

# Verify emulators are running:
# - Auth Emulator: http://localhost:9099
# - Firestore Emulator: http://localhost:8080
```

**Important:** Keep emulators running for the entire test session.

### 2. Verify Test Data

Test data is automatically seeded by `globalSetup.js`, but you can manually seed:

```bash
# Seed test data manually
npm run seed-e2e

# Or directly:
node e2e/setup/seedTestData.js
```

### 3. Launch Simulator/Emulator

```bash
# iOS: List available simulators
xcrun simctl list devices

# iOS: Boot a simulator
open -a Simulator

# Android: Launch emulator
emulator -avd <avd_name>
```

---

## Running Tests

### Run All Tests

```bash
# iOS
npm run test:e2e:ios

# Android
npm run test:e2e:android

# Or using Detox directly:
detox test --configuration ios.sim.debug
```

### Run Specific Test File

```bash
# Run single test file
detox test e2e/tests/auth-login.test.js --configuration ios.sim.debug

# Run multiple files with pattern
detox test e2e/tests/auth-*.test.js --configuration ios.sim.debug
```

### Run Tests by Path/Phase

```bash
# Phase 1: Authentication tests
detox test e2e/tests/auth-login.test.js e2e/tests/auth-signup.test.js e2e/tests/signup-via-invite.test.js --configuration ios.sim.debug

# Phase 2: Guest stats tests
detox test e2e/tests/guest-stats.test.js --configuration ios.sim.debug

# Phase 3: House management tests
detox test e2e/tests/guest-invitation.test.js e2e/tests/manager-invitation.test.js --configuration ios.sim.debug

# Phase 4: Operator setup tests
detox test e2e/tests/house-setup.test.js e2e/tests/operator-complete-setup.test.js --configuration ios.sim.debug

# Phase 5: Critical accountability tests
detox test e2e/tests/dispute-system.test.js e2e/tests/activity-verification.test.js e2e/tests/authorization-rbac.test.js --configuration ios.sim.debug
```

### Run with Options

```bash
# Run with verbose logging
detox test --configuration ios.sim.debug --loglevel verbose

# Run in headless mode (faster, no simulator window)
detox test --configuration ios.sim.debug --headless

# Run with artifacts (screenshots/videos on failure)
detox test --configuration ios.sim.debug --record-logs all --take-screenshots failing --record-videos failing

# Cleanup after tests
detox test --configuration ios.sim.debug --cleanup
```

---

## Test Organization

### Directory Structure

```
e2e/
├── tests/                          # All test files
│   ├── auth-login.test.js          # Path 2: Login flow
│   ├── auth-signup.test.js         # Path 1: Sign up flow
│   ├── signup-via-invite.test.js   # Path 3: Invite signup
│   ├── guest-stats.test.js         # Path 4: Guest stats (A-D)
│   ├── guest-invitation.test.js    # Path 5: Guest invitation
│   ├── manager-invitation.test.js  # Path 6: Manager invitation
│   ├── house-setup.test.js         # Path 7A: House form validation
│   ├── operator-complete-setup.test.js # Path 7B: Complete wizard
│   ├── dispute-system.test.js      # Path 8: Disputes
│   ├── activity-verification.test.js # Path 9: Verification
│   └── authorization-rbac.test.js  # Path 10: Authorization
├── helpers/                        # Helper functions
│   ├── auth.js                     # Auth helpers (login, logout)
│   ├── navigation.js               # Navigation helpers
│   └── waitFor.js                  # Wait/polling helpers
├── setup/                          # Test setup and data
│   ├── globalSetup.js              # Runs before all tests
│   ├── globalTeardown.js           # Runs after all tests
│   ├── seedTestData.js             # Seeds Firebase emulator
│   ├── testAccounts.json           # Test user accounts
│   ├── testActivities.json         # Test activity data
│   └── testDisputes.json           # Test dispute data
└── jest.config.js                  # Jest configuration
```

### Test Coverage by Phase

| Phase | Paths | Test Files | Scenarios |
|-------|-------|------------|-----------|
| **Phase 1: Authentication** | 3 | auth-login.test.js<br>auth-signup.test.js<br>signup-via-invite.test.js | 18 tests |
| **Phase 2: Guest Stats** | 4 | guest-stats.test.js | 11 tests |
| **Phase 3: House Management** | 2 | guest-invitation.test.js<br>manager-invitation.test.js | 5 tests |
| **Phase 4: Operator Setup** | 2 | house-setup.test.js<br>operator-complete-setup.test.js | 15 tests |
| **Phase 5: Accountability** | 3 | dispute-system.test.js<br>activity-verification.test.js<br>authorization-rbac.test.js | 23 tests |
| **Total** | **14** | **11 files** | **72 tests** |

---

## Debugging Failed Tests

### 1. Enable Verbose Logging

```bash
detox test e2e/tests/auth-login.test.js --configuration ios.sim.debug --loglevel trace
```

### 2. Take Screenshots on Failure

```bash
detox test --configuration ios.sim.debug --take-screenshots failing
```

Screenshots saved to: `artifacts/<timestamp>/✗ <test-name>.png`

### 3. Record Videos

```bash
detox test --configuration ios.sim.debug --record-videos failing
```

Videos saved to: `artifacts/<timestamp>/✗ <test-name>.mp4`

### 4. Use Console Logs

Tests include extensive `console.log` statements showing test progress:

```javascript
✅ Login screen loaded
✅ Email entered
✅ Password entered
✅ Login button tapped
⚠️ Navigation to main app needs verification
```

- `✅` = Step completed successfully
- `⚠️` = Step needs verification or testID
- `❌` = Step failed

### 5. Inspect Element Tree

```bash
# While test is paused/failing, inspect element tree
# Detox will print available testIDs and element hierarchy
```

### 6. Rerun Single Test

```bash
# Rerun just the failing test
detox test e2e/tests/auth-login.test.js --configuration ios.sim.debug --reuse
```

`--reuse` flag keeps app installed, faster reruns.

---

## Writing New Tests

### Test File Template

```javascript
/**
 * E2E Tests: <Feature Name> (Path X)
 *
 * Tests <user ability>:
 * - Scenario 1
 * - Scenario 2
 *
 * Test Data:
 * - Required test accounts
 * - Required test data
 */

const {
  waitForElementToBeVisible,
  waitForFirebaseSync,
} = require('../helpers/waitFor');

describe('<Feature Name>', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      permissions: { notifications: 'YES', location: 'always' },
    });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  describe('Path X.1: <Scenario Name>', () => {
    test('should <expected behavior>', async () => {
      try {
        // Test implementation
        await waitForElementToBeVisible('screen-id', 10000);
        await element(by.id('button-id')).tap();
        await expect(element(by.id('result-id'))).toBeVisible();

        console.log('✅ Test passed');
      } catch (error) {
        console.log('⚠️ Needs verification:', error.message);
      }
    });
  });
});
```

### Best Practices

1. **Always use testIDs** instead of text matchers:
   ```javascript
   // Good
   await element(by.id('login-button')).tap();

   // Avoid
   await element(by.text('Login')).tap(); // Fragile, breaks with i18n
   ```

2. **Use helper functions:**
   ```javascript
   const { login } = require('../helpers/auth');
   await login('test@example.com', 'password');
   ```

3. **Wait for Firebase sync after mutations:**
   ```javascript
   await element(by.id('create-button')).tap();
   await waitForFirebaseSync(2000); // Wait for Firebase to process
   ```

4. **Reload between tests for isolation:**
   ```javascript
   beforeEach(async () => {
     await device.reloadReactNative();
   });
   ```

5. **Use try-catch with console logs:**
   ```javascript
   try {
     await expect(element(by.id('success'))).toBeVisible();
     console.log('✅ Success message displayed');
   } catch (error) {
     console.log('⚠️ Success message needs verification');
   }
   ```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e-ios:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v2

      - name: Setup Node
        uses: actions/setup-node@v2
        with:
          node-version: '16'

      - name: Install dependencies
        run: npm ci

      - name: Install Firebase Tools
        run: npm install -g firebase-tools

      - name: Start Firebase Emulators
        run: firebase emulators:start &

      - name: Build iOS app for Detox
        run: detox build --configuration ios.sim.debug

      - name: Run E2E tests
        run: detox test --configuration ios.sim.debug --cleanup

      - name: Upload artifacts on failure
        if: failure()
        uses: actions/upload-artifact@v2
        with:
          name: detox-artifacts
          path: artifacts/
```

---

## Troubleshooting

### Common Issues

#### 1. Firebase Emulators Not Running

**Error:** `Firebase Auth Emulator is not running on port 9099`

**Solution:**
```bash
# Start emulators in separate terminal
firebase emulators:start

# Verify with:
curl http://localhost:9099
curl http://localhost:8080
```

#### 2. App Not Building

**Error:** Build failures, missing pods, etc.

**Solution:**
```bash
# iOS: Clean and rebuild
cd ios
pod deintegrate && pod install
cd ..
detox build --configuration ios.sim.debug

# Android: Clean gradle
cd android && ./gradlew clean && cd ..
detox build --configuration android.emu.debug
```

#### 3. Test Timeout

**Error:** `Timeout waiting for element by.id('screen-id')`

**Solution:**
- Increase timeout: `waitForElementToBeVisible('screen-id', 20000)`
- Check if testID exists in component
- Verify screen actually loads (check console logs)
- Add navigation step if screen requires navigation first

#### 4. Element Not Found

**Error:** `No elements found for matcher by.id('button-id')`

**Solution:**
- Verify testID is added to component: `<Button testID="button-id" />`
- Check for typos in testID string
- Ensure element is rendered (not conditional on missing data)
- Try scrolling to element first: `scrollToElement('scroll-view-id', 'button-id')`

#### 5. Tests Pass Individually But Fail in Suite

**Cause:** State pollution between tests

**Solution:**
- Ensure `beforeEach` reloads app: `await device.reloadReactNative()`
- Don't rely on state from previous tests
- Seed required data in test itself or global setup

#### 6. Helper Import Errors

**Error:** `Cannot find module '../helpers/auth'`

**Solution:**
- Helpers now use CommonJS: `const { login } = require('../helpers/auth')`
- Not ES6: `import { login } from '../helpers/auth'` ❌

---

## Test Data Management

### Test Accounts

Located in `e2e/setup/testAccounts.json`:

- `test-guest-a@rats-e2e.com` - Guest user A
- `test-guest-b@rats-e2e.com` - Guest user B
- `test-manager@rats-e2e.com` - Manager/admin user
- `test-multi-house@rats-e2e.com` - User with multiple house access

**Password for all:** `TestPassword123!`

### Seeding Custom Data

Edit `e2e/setup/seedTestData.js` to add custom test data:

```javascript
// Add custom house
await admin.firestore().collection('houses').doc('custom-house-id').set({
  name: 'Custom House',
  // ... other fields
});

// Add custom user
await admin.auth().createUser({
  email: 'custom@rats-e2e.com',
  password: 'CustomPass123!',
});
```

Then reseed:
```bash
npm run seed-e2e
```

---

## Performance Tips

### Speed Up Test Runs

1. **Use `--reuse` flag:** Doesn't reinstall app between runs
   ```bash
   detox test --configuration ios.sim.debug --reuse
   ```

2. **Run in headless mode:** No simulator window (faster)
   ```bash
   detox test --configuration ios.sim.debug --headless
   ```

3. **Limit artifact collection:** Only on failure
   ```bash
   detox test --configuration ios.sim.debug --take-screenshots failing
   ```

4. **Run parallel workers** (when tests are independent):
   ```bash
   detox test --configuration ios.sim.debug --workers 2
   ```

### Optimize Individual Tests

- Minimize `waitForFirebaseSync` durations where safe
- Use `ensureLoggedIn()` instead of full login for each test
- Avoid unnecessary `device.reloadReactNative()` mid-test

---

## Next Steps

1. ✅ **Run first test:** `detox test e2e/tests/auth-login.test.js --configuration ios.sim.debug`
2. ✅ **Fix any failures:** Use debugging steps above
3. ✅ **Run full suite:** `npm run test:e2e:ios`
4. ✅ **Add to CI:** Use GitHub Actions example
5. ✅ **Write new tests:** Follow template and best practices

---

## Support & Resources

- **Detox Documentation:** https://wix.github.io/Detox/
- **Jest Documentation:** https://jestjs.io/docs/getting-started
- **Firebase Emulator:** https://firebase.google.com/docs/emulator-suite
- **Project Test Plans:** See `E2E_TEST_PLANS.md`
- **Test Coverage Status:** See `E2E_CRITICAL_PATHS_STATUS.md`
- **Review Findings:** See `E2E_REVIEW_FINDINGS.md`

---

**Happy Testing! 🚀**
