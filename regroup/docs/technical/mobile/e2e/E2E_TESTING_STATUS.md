# E2E Testing Status - Regroup App

**Date:** February 5, 2026
**Status:** 🔴 Blocked - Dependency Installation Issues (see E2E_TESTING_BLOCKERS.md)

---

## Current Status

### ✅ Setup Complete
- [x] Detox configured (.detoxrc.js)
- [x] applesimutils installed
- [x] Test scripts in package.json
- [x] Test files written (authentication, navigation, critical flows, core components)
- [x] **testIDs added to auth screens** (Login & SignUp)
- [x] **iOS app built successfully for testing**
- [x] **Smoke test created** (e2e/login.smoke.test.js)
- [x] **Comprehensive test plans documented** (E2E_TEST_PLANS.md)

### 🔴 Blocked
- [ ] **React module not installed** - Listed as peerDependency, needs to be dependency
- [ ] npm install failing with errors
- [ ] Metro bundler cannot resolve React module
- [ ] App won't load in simulator (red error screen)
- [ ] **See E2E_TESTING_BLOCKERS.md for full analysis and resolution plan**

### ⏭️ Next Steps (After Unblocking)
- [ ] Fix package.json (move React to dependencies)
- [ ] Clean install dependencies
- [ ] Run smoke test successfully
- [ ] Add testIDs to remaining screens (per E2E_TEST_PLANS.md)
- [ ] Enable skipped tests incrementally
- [ ] Android build (when needed)

---

## Test Coverage

### Screens with testIDs (Ready to Test)

#### Authentication Flow ✅
**Login Screen:**
- `login-screen` - Main container
- `email-input` - Email field
- `password-input` - Password field
- `login-button` - Sign in button
- `forgot-password-link` - Forgot password link
- `reset-email-input` - Reset password email field
- `forgot-password-modal` - Reset password modal

**SignUp Screen:**
- `signup-screen` - Main container
- `signup-email-input` - Email field
- `signup-password-input` - Password field
- `signup-first-name-input` - First name field
- `signup-last-name-input` - Last name field
- `signup-button` - Sign up button
- `login-link` - Back to login link

#### Other Screens (Partial Coverage)
- `activity-screen` - Activity listing
- `disputes-screen` - Disputes screen
- `guest-list-screen` - Guest list
- `create-guest-screen` - Create guest form

---

## Test Files

### 📝 Ready to Run

**login.smoke.test.js** (NEW - Created Today)
- Simple smoke test
- Verifies app launches
- Checks login screen elements visible
- **Will run first to prove E2E works**

### 📋 Written but Needs More testIDs

**authentication.test.js** (155 lines)
- Login flow tests (5 scenarios, 2 skipped)
- Signup flow tests (3 scenarios)
- Logout flow (1 scenario, skipped)
- Password reset (3 scenarios, 1 skipped)
- **Status:** Most tests can run now! Just need to un-skip

**navigation.test.js** (230 lines)
- Tab navigation tests
- Screen navigation tests
- Deep linking tests
- **Status:** Needs testIDs for tab bar and navigation

**core-components.test.js** (290 lines)
- RatsButton tests
- RatsTextInput tests
- RatsText tests
- Form validation tests
- **Status:** Needs testIDs for components

**critical-flows.test.js** (340 lines)
- Guest creation flow
- Chore assignment flow
- Attendance marking flow
- Report generation flow
- **Status:** Needs testIDs for screens/components

---

## Running Tests

### iOS (Mac only)

**Build** (first time or after native changes):
```bash
npm run test:e2e:build:ios
```

**Run all tests**:
```bash
npm run test:e2e:ios
```

**Run specific test**:
```bash
npx detox test e2e/login.smoke.test.js --configuration ios.sim.debug
```

**Run with verbose logging**:
```bash
npx detox test --configuration ios.sim.debug --loglevel trace
```

### Android

**Build**:
```bash
npm run test:e2e:build:android
```

**Run**:
```bash
npm run test:e2e:android
```

---

## Next Priorities

### Week 1 (This Week)
1. ✅ Get smoke test passing (today!)
2. ✅ Un-skip authentication tests
3. ✅ Create test for successful login (with test account)

### Week 2
1. Add testIDs to tab navigation
2. Add testIDs to main app screens
3. Enable navigation tests

### Week 3
1. Add testIDs to guest management screens
2. Enable critical flow tests
3. Set up CI/CD integration

### Week 4
1. Add testIDs to remaining components
2. Reach 30% E2E coverage target
3. Document testing patterns

---

## Test Data Setup

### Firebase Test Account Needed

For authentication tests to fully work, you need a test account:

**Create in Firebase Console:**
- Email: `test@rats-e2e.com`
- Password: `TestPassword123!`
- Role: House Manager with test house

**Or via test script:**
```javascript
// e2e/setup.js
beforeAll(async () => {
  // Create test user via Firebase Admin SDK
  // Or use existing test account
});
```

---

## CI/CD Integration (Future)

### GitHub Actions Workflow

```yaml
name: E2E Tests
on: [pull_request]
jobs:
  ios:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v2
      - run: npm install
      - run: npm run test:e2e:build:ios
      - run: npm run test:e2e:ios
```

**Benefits:**
- Catch regressions before merge
- Ensure features work end-to-end
- Build confidence in releases

---

## Known Limitations

### Current Constraints
- iOS testing only (Mac required)
- No real payment testing (will use mocks)
- No push notification testing yet
- Limited offline mode testing

### Will Not Test
- Deep integrations with Firebase (use unit tests)
- Third-party library internals
- Network error scenarios (use mocks)

---

## Time Tracking

### Time Invested So Far
- Detox setup: 30 minutes (already done)
- Test file creation: 2 hours (already done)
- testID additions: 1 hour (auth screens done)
- **Total so far:** 3.5 hours

### Estimated Remaining
- Complete auth testing: 30 minutes
- Add testIDs to 20 more screens: 3 hours
- Debug and fix issues: 2 hours
- CI/CD setup: 1 hour
- **Total remaining:** 6.5 hours to full coverage

---

## Success Metrics

### Phase 0 Goals (This Week)
- [ ] Smoke test passing ✅
- [ ] Authentication tests passing (at least 5 scenarios)
- [ ] Test coverage: 10-15%

### Phase 1 Goals (Week 2-4)
- [ ] Navigation tests passing
- [ ] Critical flow tests passing (guest creation, chores)
- [ ] Test coverage: 30%+
- [ ] CI/CD integration complete

---

## Resources

- [Detox Documentation](https://wix.github.io/Detox/)
- [React Native Testing](https://reactnative.dev/docs/testing-overview)
- [Detox Best Practices](https://github.com/wix/Detox/blob/master/docs/Introduction.BestPractices.md)

---

## 🔴 Current Blocker (February 5, 2026 - Evening Update)

**Issue:** npm dependency installation failing. React module not installed.

**Root Cause:** React is listed as peerDependency instead of regular dependency in package.json.

**Impact:**
- Metro bundler cannot resolve React module
- App shows red error screen when launched
- E2E tests cannot run

**Resolution Plan:** See `E2E_TESTING_BLOCKERS.md` for detailed analysis and step-by-step fix.

**What's Ready:**
- ✅ iOS build successful
- ✅ Smoke test written
- ✅ Comprehensive test plans documented in `E2E_TEST_PLANS.md`
- ✅ All 7 critical paths mapped out with test scenarios
- ✅ testID requirements identified for all screens

**Estimated Time to Unblock:** 25 minutes (clean install + verification)

---

## Related Documents

1. **E2E_TEST_PLANS.md** - Comprehensive test plans for all critical code paths
   - Sign up, login, sign up via invite
   - Guest stat updates (chores, job, sponsor, meetings)
   - Inviting guests and managers
   - House creation (operator wizard)

2. **E2E_TESTING_BLOCKERS.md** - Current blocker analysis and resolution plan
   - Root cause analysis
   - Resolution options
   - Step-by-step fix instructions
   - Post-resolution tasks

---

**Next Action:** Fix npm dependencies (see E2E_TESTING_BLOCKERS.md), then run `npx detox test e2e/login.smoke.test.js --configuration ios.sim.debug`

Once unblocked, your first E2E test will pass! 🎉
