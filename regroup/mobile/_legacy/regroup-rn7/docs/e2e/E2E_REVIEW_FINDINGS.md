> ⚠️ **Legacy document.** Carried over from the standalone `regroup-rn7` repository, archived on 2026-06-06. Historical reference only — may be outdated and is NOT part of current `mobile` documentation.

# E2E Testing Solution - Comprehensive Review Findings

**Date**: February 15, 2026
**Review Status**: In Progress

---

## Critical Issues (Must Fix)

### 1. Helper Files Using Incorrect Module System ⚠️ HIGH PRIORITY

**Files Affected:**
- `e2e/helpers/auth.js`
- `e2e/helpers/navigation.js`
- `e2e/helpers/waitFor.js`

**Issue:** All three helper files use ES6 `export` syntax, but Jest/Detox requires CommonJS `module.exports`.

**Impact:** Helper functions cannot be imported by test files, causing all tests to fail.

**Fix Required:**
```javascript
// Current (WRONG):
export async function login(email, password) { ... }

// Should be (CORRECT):
async function login(email, password) { ... }
module.exports = { login, logout, loginAsGuestA, ... };
```

**Priority:** CRITICAL - Must fix before any tests can run

---

### 2. Old/Obsolete Test Files in Root Directory

**Files to Remove:**
- `e2e/starter.test.js` - Example file from Detox setup
- `e2e/authentication.test.js` - Old test file (replaced by e2e/tests/auth-*.test.js)
- `e2e/navigation.test.js` - Old test file (replaced by organized tests)
- `e2e/core-components.test.js` - Old test file
- `e2e/critical-flows.test.js` - Old test file
- `e2e/login.smoke.test.js` - Old smoke test

**Issue:** These files will be picked up by Jest's testMatch pattern and may conflict with new tests.

**Impact:**
- Confusing test output
- Potential test failures from outdated testIDs
- Duplicate test coverage

**Fix Required:** Delete all 6 obsolete test files

**Priority:** HIGH - Clean up before running test suite

---

## Medium Priority Issues

### 3. Missing npm Scripts

**Issue:** `globalSetup.js` references `npm run seed-e2e` but this script may not exist in package.json

**Verification Needed:**
- Check if `seed-e2e` script exists in package.json
- Verify it points to the correct seeding script

**Fix if Missing:**
```json
{
  "scripts": {
    "seed-e2e": "node e2e/setup/seedTestData.js"
  }
}
```

**Priority:** MEDIUM - Required for test data seeding

---

### 4. Test Data Files Not Reviewed

**Files:**
- `e2e/setup/testAccounts.json`
- `e2e/setup/testActivities.json`
- `e2e/setup/testDisputes.json`
- `e2e/setup/seedTestData.js`

**Issue:** Haven't verified these files contain all required test data for all test scenarios

**Priority:** MEDIUM - Review after fixing critical issues

---

## Low Priority / Nice to Have

### 5. Missing testIDs for Steps 2-5 of Operator Wizard

**As noted in operator-complete-setup.test.js:**
- Step 2 (Manager Assignment) - needs testIDs
- Step 3 (Phase Configuration) - needs testIDs
- Step 4 (Chore Setup) - needs testIDs
- Step 5 (Guest Setup) - needs testIDs

**Impact:** Tests can validate basic flow but not detailed step-by-step interactions

**Priority:** LOW - Tests document expected behavior; testIDs can be added later

---

### 6. Deep Link Handler Not Implemented

**For Path 3 (Sign Up via Invite):**
- Deep link handler for `rats://invite` URLs not implemented
- Role confirmation screen doesn't exist
- Tests document expected behavior but features need implementation

**Priority:** LOW - Tests are ready when features are implemented

---

## Test Infrastructure Quality Assessment

### ✅ Strengths

1. **Well-Organized Structure:**
   - Clean separation of concerns (tests/, helpers/, setup/)
   - Comprehensive helper functions for common operations
   - Good use of global setup/teardown

2. **Comprehensive Coverage:**
   - 11 test files covering 14 critical paths
   - 72 test scenarios total
   - All major user journeys documented

3. **Good Documentation:**
   - Each test file has clear documentation headers
   - Implementation notes included
   - testID requirements documented

4. **Firebase Emulator Integration:**
   - Proper emulator verification in setup
   - Test data seeding approach
   - Environment isolation

### ⚠️ Weaknesses

1. **Module System Mismatch:** Helper files won't work as-is
2. **Old Files Not Cleaned Up:** Technical debt from earlier iterations
3. **Limited Actual Test Execution:** Many tests use `console.log` to document expected behavior rather than actual assertions
4. **Missing testIDs:** Some features have incomplete testID coverage

---

## Recommended Fix Order

### Phase 1: Critical Fixes (Required for ANY tests to run)
1. ✅ Fix helper file module system (auth.js, navigation.js, waitFor.js)
2. ✅ Remove obsolete test files
3. ✅ Verify/add npm scripts

### Phase 2: Validation & Testing
4. ✅ Review test data files
5. ✅ Run test suite to identify runtime issues
6. ✅ Fix any import/require issues in test files

### Phase 3: Enhancement
7. ✅ Add missing testIDs for wizard steps 2-5
8. ✅ Convert console.log tests to actual assertions where possible
9. ✅ Add more robust error handling

---

## Next Actions

1. **Immediate:** Fix helper file module exports
2. **Immediate:** Delete obsolete test files
3. **Before First Run:** Verify test data and npm scripts
4. **After First Run:** Address any runtime errors discovered
5. **Iterative:** Enhance tests with better assertions and coverage

---

**Review Status:** Identifying issues (Phase 1 of comprehensive review)
**Next Step:** Fix critical issues, then run test suite to validate
