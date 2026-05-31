# Implementation Plan: Phase 5 E2E Tests (Critical Accountability Features)

**Date:** February 12, 2026
**Scope:** Implement E2E tests for 4 critical features with zero coverage
**Priority:** CRITICAL - These features are in production but untested
**Estimated Effort:** 2-3 days

---

## Overview

Implement comprehensive E2E tests for the critical accountability features that are fully implemented but have ZERO test coverage:

1. **Dispute/Challenge System** (Path 8) - Core accountability
2. **Activity Verification** (Path 9) - Phase progression
3. **Authorization/RBAC** (Path 10) - Security

**Note:** Medication Tracking (Path 11) is excluded from this implementation phase.

**Success Criteria:**

- All 20 test scenarios passing (6 + 6 + 8)
- Test coverage increases from ~5% to ~30%
- All critical accountability features validated (except Medication)

---

## Prerequisites

**Before starting:**

- ✅ E2E_TEST_PLANS.md complete with all test scenarios
- ✅ Firebase Emulator Suite configured
- ✅ Detox configuration verified (ios.sim.debug working)
- ✅ Login smoke test passing (baseline established)

**Required test data:**

- Test accounts (Guest A, Guest B, Manager, Operator, Multi-house user)
- Pre-created activities for dispute testing
- Pre-created disputes for resolution testing
- Test houses with proper configuration

---

## Task Breakdown

### Task 1: Add testIDs to Dispute System Components

**Goal:** Add all required testIDs to dispute screens and components for Path 8

**Files to modify:**

- `src/screens/Disputes/Disputes.tsx`
- `src/screens/Activity/BaseActivityScreen.tsx` (RenderActivities component)
- Dispute modal components

**testIDs to add:**

```typescript
// Disputes screen (already has disputes-screen)
dispute - item - { disputeId };
dispute - activity - type - { disputeId };
dispute - status - { disputeId };
dispute - message - { disputeId };

// Activity screen with dispute action
activity - item - { activityId };
dispute - activity - button - { activityId };
dispute - modal;
dispute - message - input;
dispute - submit - button;

// Dispute resolution
resolve - dispute - button - { disputeId };
reject - dispute - button - { disputeId };
resolution - modal;
resolution - message - input;
confirm - resolution - button;
confirm - rejection - button;
challenge - dispute - button - { disputeId };
challenge - modal;
challenge - message - input;
submit - challenge - button;
```

**Steps:**

1. Read Disputes.tsx and identify where to add testIDs
2. Add testIDs to dispute list items
3. Read BaseActivityScreen.tsx (RenderActivities component)
4. Add testIDs to activity items and dispute buttons
5. Add testIDs to dispute modal components
6. Add testIDs to resolution modal components
7. Verify no syntax errors: `npm run tsc`

**Verification:**

```bash
# Verify testIDs are present
grep -r "dispute-item-" src/screens/Disputes/
grep -r "activity-item-" src/screens/Activity/
```

**Acceptance:**

- All testIDs added without breaking existing functionality
- TypeScript compiles without errors
- App still runs (quick manual check)

---

### Task 2: Add testIDs to Activity Verification Components

**Goal:** Add all required testIDs for Path 9 (Activity Verification)

**Files to modify:**

- `src/screens/Activity/BaseActivityScreen.tsx`
- Activity filter components
- Verification modal components

**testIDs to add:**

```typescript
// Verification status and actions
activity - verification - badge - { activityId };
unverified - activities - filter;
verify - activity - button - { activityId };
reject - activity - button - { activityId };

// Batch verification
select - activity - { activityId };
batch - verify - button;
batch - reject - button;

// Verification modal
verification - modal;
verification - notes - input;
confirm - verify - button;
confirm - reject - button;
```

**Steps:**

1. Read BaseActivityScreen.tsx
2. Add verification badge testIDs to activity items
3. Add verify/reject button testIDs
4. Add batch selection checkboxes with testIDs
5. Add verification modal testIDs
6. Verify TypeScript: `npm run tsc`

**Verification:**

```bash
grep -r "verification-badge-" src/screens/Activity/
grep -r "verify-activity-button" src/screens/Activity/
```

**Acceptance:**

- All verification testIDs added
- No TypeScript errors
- App compiles and runs

---

### Task 3: Add testIDs to Authorization-Sensitive Components

**Goal:** Add testIDs for Path 10 (Authorization/RBAC testing)

**Files to modify:**

- Admin-only buttons throughout the app
- House settings screens
- SuperAdmin features

**testIDs to add:**

```typescript
// Admin-only features
verify - activities - button;
resolve - dispute - button;
house - settings - button;
invite - user - button;

// SuperAdmin-only features
create - organization - button;
subscription - management - button;
multi - house - admin - panel;

// Navigation/menu
menu - button;
settings - button;
house - selector - button;
house - option - { houseId };

// Member details
member - name;
member - phase;
member - phone;
member - email;
member - detailed - stats;
edit - member - button;
```

**Steps:**

1. Find admin-only buttons across the app (use grep for common patterns)
2. Add testIDs to admin action buttons
3. Add testIDs to SuperAdmin features
4. Add testIDs to navigation elements
5. Add testIDs to member detail screens
6. Verify: `npm run tsc`

**Verification:**

```bash
grep -r "house-settings-button" src/
grep -r "verify-activities-button" src/
```

**Acceptance:**

- Authorization-sensitive components have testIDs
- Can distinguish admin vs guest features
- TypeScript compiles

---

### Task 4: Create Firebase Test Data Setup Script

**Goal:** Create script to seed Firebase Emulator with required test data

**Files to create:**

- `e2e/setup/seedTestData.js`
- `e2e/setup/testAccounts.json`
- `e2e/setup/testActivities.json`
- `e2e/setup/testDisputes.json`

**Test data to create:**

- 4 test accounts (Guest A, Guest B, Manager, Multi-house user)
- 3 test houses (test-house-123, test-house-a, test-house-b)
- 10+ pre-created activities
- 3 pre-created disputes
- Phase requirements configuration

**Steps:**

1. Create `e2e/setup/` directory
2. Create testAccounts.json with all test user data
3. Create testActivities.json with pre-created activities
4. Create testDisputes.json with pre-created disputes
5. Create seedTestData.js script that:
   - Connects to Firebase Emulator
   - Creates test accounts in Auth
   - Seeds Firestore with test data
   - Sets up houses, activities, disputes
6. Add npm script: `"seed-e2e": "node e2e/setup/seedTestData.js"`
7. Test script: `npm run seed-e2e`

**Verification:**

```bash
# Run seed script
npm run seed-e2e

# Verify accounts created
firebase emulators:exec "curl http://localhost:9099/emulator/v1/projects/rats-dev/accounts"

# Verify Firestore data
firebase emulators:exec "curl http://localhost:8080/v1/projects/rats-dev/databases/(default)/documents"
```

**Acceptance:**

- Script successfully seeds all test data
- Test accounts exist in emulator
- Test houses, activities, disputes in Firestore
- Script is idempotent (can run multiple times)

---

### Task 5: Create Test Utilities and Helpers

**Goal:** Create reusable test utilities for E2E tests

**Files to create:**

- `e2e/helpers/auth.js` - Login/logout helpers
- `e2e/helpers/navigation.js` - Navigation helpers
- `e2e/helpers/waitFor.js` - Custom wait conditions
- `e2e/setup/globalSetup.js` - Before all tests
- `e2e/setup/globalTeardown.js` - After all tests

**Helpers to implement:**

```javascript
// auth.js
loginAsTestUser(email, password);
logout();
getCurrentUser();

// navigation.js
navigateToTab(tabId);
navigateToScreen(screenName);
goBack();

// waitFor.js
waitForText(text, timeout);
waitForElement(id, timeout);
waitForDisappear(id, timeout);
```

**Steps:**

1. Create `e2e/helpers/` directory
2. Implement auth.js helpers
3. Implement navigation.js helpers
4. Implement waitFor.js custom conditions
5. Create globalSetup.js:
   - Start Firebase Emulator
   - Seed test data
   - Build app if needed
6. Create globalTeardown.js:
   - Stop Firebase Emulator
   - Clean up test artifacts
7. Update jest.config.js to use global setup/teardown
8. Test helpers in isolation

**Verification:**

```bash
# Test helpers work
node -e "require('./e2e/helpers/auth').loginAsTestUser"
```

**Acceptance:**

- All helpers implemented and exported
- Global setup starts emulator and seeds data
- Global teardown cleans up
- Helpers are reusable across test files

---

### Task 6: Implement Dispute System Tests (Path 8)

**Goal:** Implement all 6 test scenarios for Dispute/Challenge System

**File to create:**

- `e2e/critical-paths/dispute-system.test.js`

**Test scenarios to implement:**

1. Guest creates dispute on another guest's activity
2. Admin resolves dispute (approve)
3. Admin rejects dispute
4. Guest cannot dispute own activity (negative case)
5. Guest cannot resolve disputes (negative case)
6. Dispute challenge flow

**Steps:**

1. Create test file with proper structure
2. Import helpers (auth, navigation, waitFor)
3. Implement beforeAll: seed test data
4. Implement afterAll: cleanup
5. Implement beforeEach: reset to known state
6. Implement test 1: Guest creates dispute
   - Login as Guest B
   - Navigate to Activities
   - Find Guest A's activity
   - Tap dispute button
   - Enter dispute reason
   - Submit
   - Verify success notification
   - Verify dispute in Disputes screen
7. Implement tests 2-6 following test plan scenarios
8. Run tests: `npx detox test e2e/critical-paths/dispute-system.test.js --configuration ios.sim.debug`

**Verification:**

```bash
# Run dispute tests
npx detox test e2e/critical-paths/dispute-system.test.js --configuration ios.sim.debug

# Should see 6/6 tests passing
```

**Acceptance:**

- All 6 test scenarios implemented
- All tests passing
- Tests follow Detox best practices
- Proper cleanup after each test

---

### Task 7: Implement Activity Verification Tests (Path 9)

**Goal:** Implement all 6 test scenarios for Activity Verification

**File to create:**

- `e2e/critical-paths/activity-verification.test.js`

**Test scenarios to implement:**

1. Admin verifies single activity
2. Admin rejects activity with reason
3. Batch verification of multiple activities
4. Guest cannot verify own activities (negative case)
5. Guest receives verification notification
6. Verified activities count toward phase requirements

**Steps:**

1. Create test file structure
2. Import helpers
3. Set up test data in beforeAll
4. Implement test 1: Admin verifies activity
   - Login as Manager
   - Navigate to Activities
   - Filter unverified
   - Verify activity
   - Add notes
   - Confirm
   - Verify badge updates
5. Implement tests 2-6 following test plan
6. Run tests: `npx detox test e2e/critical-paths/activity-verification.test.js --configuration ios.sim.debug`

**Verification:**

```bash
npx detox test e2e/critical-paths/activity-verification.test.js --configuration ios.sim.debug
# 6/6 tests passing
```

**Acceptance:**

- All 6 test scenarios passing
- Verification workflow validated
- Phase progression tested
- Notifications working

---

### Task 8: Implement Authorization/RBAC Tests (Path 10)

**Goal:** Implement all 8 test scenarios for Authorization & Role-Based Access Control

**File to create:**

- `e2e/critical-paths/authorization-rbac.test.js`

**Test scenarios to implement:**

1. Guest cannot access admin features (negative)
2. Guest cannot view other guests' private data (negative)
3. Admin can access admin features
4. Admin can view all guest data
5. Guest cannot modify house settings (negative)
6. Manager cannot access SuperAdmin features (negative)
7. SuperAdmin can access operator features
8. Role transitions when switching houses

**Steps:**

1. Create test file structure
2. Import helpers
3. Implement test 1: Guest restrictions
   - Login as Guest A
   - Verify admin features hidden
   - Verify house settings inaccessible
   - Verify cannot resolve disputes
4. Implement tests 2-8 following test plan
5. Test role transitions with multi-house user
6. Run tests: `npx detox test e2e/critical-paths/authorization-rbac.test.js --configuration ios.sim.debug`

**Verification:**

```bash
npx detox test e2e/critical-paths/authorization-rbac.test.js --configuration ios.sim.debug
# 8/8 tests passing
```

**Acceptance:**

- All 8 authorization scenarios passing
- Security enforcement validated
- Role transitions work correctly
- Data privacy protected

---

### Task 9: Create Test Suite Runner and CI Integration

**Goal:** Set up comprehensive test suite execution and CI integration

**Files to create/modify:**

- `e2e/run-phase-5-tests.sh` - Run all Phase 5 tests
- `.github/workflows/e2e-tests.yml` - GitHub Actions workflow
- `package.json` - Add test scripts

**Steps:**

1. Create run-phase-5-tests.sh:

   ```bash
   #!/bin/bash
   set -e

   echo "Starting Firebase Emulator..."
   npm run firebase:emulator &

   echo "Building app..."
   npx detox build --configuration ios.sim.debug

   echo "Running Phase 5 E2E Tests..."
   npx detox test e2e/critical-paths/dispute-system.test.js --configuration ios.sim.debug
   npx detox test e2e/critical-paths/activity-verification.test.js --configuration ios.sim.debug
   npx detox test e2e/critical-paths/authorization-rbac.test.js --configuration ios.sim.debug

   echo "All Phase 5 tests complete!"
   ```

2. Make script executable: `chmod +x e2e/run-phase-5-tests.sh`
3. Add npm scripts to package.json:
   ```json
   "test:e2e:phase5": "./e2e/run-phase-5-tests.sh",
   "test:e2e:all": "detox test --configuration ios.sim.debug"
   ```
4. Create GitHub Actions workflow (optional for CI)
5. Test suite runner: `npm run test:e2e:phase5`

**Verification:**

```bash
# Run all Phase 5 tests
npm run test:e2e:phase5

# Should see:
# dispute-system.test.js: 6/6 passing
# activity-verification.test.js: 6/6 passing
# authorization-rbac.test.js: 8/8 passing
# Total: 20/20 tests passing
```

**Acceptance:**

- All Phase 5 tests run in sequence
- Script handles emulator startup/shutdown
- All 20 tests passing
- CI workflow ready (if applicable)

---

### Task 10: Documentation and Reporting

**Goal:** Document test implementation and create coverage report

**Files to create/update:**

- `E2E_PHASE_5_STATUS.md` - Implementation status
- Update `E2E_TEST_PLANS.md` with completion status
- Create test coverage report

**Steps:**

1. Create E2E_PHASE_5_STATUS.md documenting:
   - All tests implemented
   - Test results summary
   - Coverage achieved
   - Known issues/limitations
2. Update E2E_TEST_PLANS.md:
   - Mark Phase 5 paths as ✅ IMPLEMENTED
   - Add links to test files
3. Generate coverage report (if tooling available)
4. Document how to run tests
5. Document test data requirements

**Verification:**

- Documentation is clear and complete
- Other developers can run tests following docs

**Acceptance:**

- Status document complete
- Test plan updated with implementation status
- Coverage documented
- Running instructions clear

---

## Execution Strategy

### Batch 1: Setup and testIDs (Tasks 1-3)

**Goal:** Add all testIDs to enable test implementation
**Time:** ~3-4 hours
**Review checkpoint:** Verify all testIDs added, app still works

### Batch 2: Test Infrastructure (Tasks 4-5)

**Goal:** Set up test data and helpers
**Time:** ~4-6 hours
**Review checkpoint:** Verify test data seeds, helpers work

### Batch 3: Core Tests (Tasks 6-7)

**Goal:** Implement Dispute and Verification tests
**Time:** ~6-8 hours
**Review checkpoint:** Verify 12/20 tests passing

### Batch 4: Security Tests (Task 8)

**Goal:** Implement Authorization/RBAC tests
**Time:** ~4-6 hours
**Review checkpoint:** Verify all 20/20 tests passing

### Batch 5: Integration and Documentation (Tasks 9-10)

**Goal:** Suite runner, CI, documentation
**Time:** ~2-4 hours
**Review checkpoint:** Complete Phase 5 implementation

**Total estimated time:** 19-28 hours over 2-3 days

---

## Success Metrics

**After Phase 5 completion:**

- ✅ 20 new test scenarios passing (6 + 6 + 8)
- ✅ Test coverage: ~30% (up from ~5%)
- ✅ Critical accountability features tested (Dispute, Verification, Authorization)
- ✅ Test suite runs reliably
- ✅ Documentation complete for future developers

**Note:** Medication Tracking (Path 11) deferred to future phase.

---

## Risk Mitigation

**Potential blockers:**

1. **TestIDs break existing functionality** - Mitigate: Test after each addition
2. **Firebase Emulator issues** - Mitigate: Document emulator setup carefully
3. **Detox timing issues** - Mitigate: Use proper waitFor conditions, not arbitrary timeouts
4. **Test data conflicts** - Mitigate: Use unique IDs, proper cleanup
5. **Missing screens/features** - Mitigate: Flag gaps early, adjust test plan

**Contingency:**

- If a test path is blocked, document and move to next
- If major testID changes needed, batch them and test together
- If emulator unstable, consider test environment alternatives

---

**Plan Status:** Ready for Execution
**Next Action:** Review plan, set up git worktree, execute Batch 1
