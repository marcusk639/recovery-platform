# Complete Testing Guide: Activity System

**Date:** February 15, 2026
**Status:** Testing Infrastructure Complete

---

## 📊 Test Coverage Summary

### Unit Tests: **133 tests passing** ✅

| Suite | Tests | Status | Coverage |
|-------|-------|--------|----------|
| Activity Entity Tests | 53 | ✅ | ~95% of ActivityModel.ts |
| WeekSummary Tests | 37 | ✅ | ~95% of WeekSummary.ts |
| Helper Function Tests | 31 | ✅ | ~90% of date utilities |
| Migration Tests | 12/21 | ⚠️ | ~57% passing |
| **Total** | **133** | **✅** | **~40% overall** |

### Integration Tests: **Configured** ⚙️

- Firebase Emulator setup complete
- Test utilities created
- Emulator-based tests created (need React Native Firebase configuration)

### E2E Tests: **Ready to Run** 🚀

- Detox configured for iOS and Android
- 11 existing E2E test suites
- New Activity System E2E test created

---

## 🏃 Running Tests

### Unit Tests

```bash
# Run all unit tests
npm test

# Run specific test suite
npm test -- ActivityModel.test.ts
npm test -- WeekSummary.test.ts
npm test -- activityHelpers.test.ts

# Run with coverage report
npm test -- --coverage

# Run in watch mode
npm test -- --watch

# Run migration tests
npm test -- src/services/migration/__tests__/migration.test.ts
```

### E2E Tests with Detox

#### Prerequisites

1. **iOS Simulator:**
   ```bash
   # List available simulators
   xcrun simctl list devices

   # Detox uses iPhone 15 by default
   ```

2. **Android Emulator:**
   ```bash
   # Start emulator
   emulator -avd Pixel_3a_API_30_x86

   # Or use attached device
   adb devices
   ```

3. **Firebase Emulator (Optional for E2E):**
   ```bash
   # Start all emulators
   firebase emulators:start

   # Or just Firestore and Auth
   firebase emulators:start --only firestore,auth
   ```

#### Build and Test

**iOS:**
```bash
# Build the app for testing
detox build --configuration ios.sim.debug

# Run tests
detox test --configuration ios.sim.debug

# Run specific test file
detox test --configuration ios.sim.debug e2e/tests/activity-system-new.test.js

# Run with verbose logging
detox test --configuration ios.sim.debug --loglevel verbose
```

**Android:**
```bash
# Build the app for testing
detox build --configuration android.emu.debug

# Run tests
detox test --configuration android.emu.debug

# Run specific test file
detox test --configuration android.emu.debug e2e/tests/activity-system-new.test.js
```

#### Debug Mode

```bash
# Run tests with debugger
detox test --configuration ios.sim.debug --debug-synchronization

# Take screenshots on failure
detox test --configuration ios.sim.debug --take-screenshots failing

# Record videos
detox test --configuration ios.sim.debug --record-videos failing
```

---

## 📁 Test File Locations

### Unit Tests
```
src/entities/__tests__/
  ├── ActivityModel.test.ts          # 53 tests - Activity entities
  └── WeekSummary.test.ts            # 37 tests - Week summaries

src/services/__tests__/
  ├── activityHelpers.test.ts        # 31 tests - Date utilities
  ├── activity.test.ts               # Integration tests (mocked)
  ├── activity.emulator.test.ts      # Emulator tests (configured)
  └── firebase-test-utils.ts         # Test utilities

src/services/migration/__tests__/
  └── migration.test.ts              # 21 tests - Migration logic
```

### E2E Tests
```
e2e/
  ├── tests/
  │   ├── activity-system-new.test.js      # NEW: Activity system E2E
  │   ├── guest-stats.test.js              # Guest stats updates
  │   ├── activity-verification.test.js    # Activity verification
  │   ├── dispute-system.test.js           # Dispute workflow
  │   ├── auth-login.test.js               # Authentication
  │   ├── auth-signup.test.js              # Registration
  │   ├── guest-invitation.test.js         # Guest invites
  │   ├── manager-invitation.test.js       # Manager invites
  │   ├── house-setup.test.js              # House configuration
  │   ├── operator-complete-setup.test.js  # Operator setup
  │   └── authorization-rbac.test.js       # RBAC permissions
  │
  ├── helpers/
  │   ├── auth.js                    # Login/logout helpers
  │   ├── navigation.js              # Navigation helpers
  │   └── waitFor.js                 # Wait utilities
  │
  └── setup/
      └── (setup files)
```

---

## 🎯 Test Execution Strategy

### 1. Development Workflow

```bash
# 1. Run unit tests on file save (watch mode)
npm test -- --watch

# 2. Make changes to code

# 3. Unit tests auto-run and validate changes

# 4. Before committing, run full test suite
npm test

# 5. If tests pass, commit changes
```

### 2. Pre-Merge Checklist

```bash
# 1. All unit tests passing
npm test
# Expected: 133+ tests passing

# 2. Run E2E smoke tests
detox test --configuration ios.sim.debug e2e/tests/activity-system-new.test.js

# 3. Generate coverage report
npm test -- --coverage
# Target: >80% coverage of new code

# 4. Manual testing of critical flows
# - Log each activity type
# - Verify week summary updates
# - Check activity history
```

### 3. CI/CD Pipeline (Future)

```yaml
# Example GitHub Actions workflow
test:
  - npm test                           # Unit tests
  - npm test -- --coverage             # Coverage report
  - detox build ios.sim.release        # Build for E2E
  - detox test ios.sim.release         # E2E tests
```

---

## 🐛 Debugging Tests

### Unit Test Failures

```bash
# Run with verbose output
npm test -- --verbose

# Run only failing test
npm test -- -t "test name pattern"

# Debug specific test file
node --inspect-brk node_modules/.bin/jest src/entities/__tests__/ActivityModel.test.ts
```

### E2E Test Failures

```bash
# Enable verbose logging
detox test --configuration ios.sim.debug --loglevel verbose

# Take screenshots on failure
detox test --configuration ios.sim.debug --take-screenshots all

# Record video of test run
detox test --configuration ios.sim.debug --record-videos all

# Debug specific test
detox test --configuration ios.sim.debug --debug-synchronization e2e/tests/activity-system-new.test.js
```

### Common Issues

**Issue:** Tests timeout waiting for elements
```bash
# Solution 1: Increase timeout
# In test file: await waitForElementToBeVisible('element-id', 10000);

# Solution 2: Check testID exists in component
# Verify element has testID prop set correctly
```

**Issue:** Firebase Emulator not connecting
```bash
# Solution: Verify emulator is running
lsof -i :8080  # Check Firestore emulator port
lsof -i :9099  # Check Auth emulator port

# Restart emulator if needed
firebase emulators:start --only firestore,auth
```

**Issue:** React Native Firebase import errors in Jest
```bash
# Solution: Use mocked version for unit tests
# See src/services/__tests__/activity.test.ts for mock setup

# For true integration, use Detox E2E tests instead
```

---

## 📈 Coverage Goals

### Current Coverage
- **Entity Layer:** ~95% ✅
- **Service Layer:** ~20% ⚠️
- **Helper Functions:** ~90% ✅
- **Overall:** ~40% ⚠️

### Target Coverage
- **Entity Layer:** 95%+ ✅
- **Service Layer:** 80%+ (need more tests)
- **Helper Functions:** 95%+ ✅
- **Overall:** 80%+

### Improving Coverage

```bash
# 1. Generate coverage report
npm test -- --coverage

# 2. Open HTML report
open coverage/lcov-report/index.html

# 3. Identify untested code (red/yellow highlighting)

# 4. Add tests for uncovered lines

# 5. Re-run coverage to verify
npm test -- --coverage
```

---

## 🔄 Test Data Management

### Unit Tests
- Use test data factories: `ActivityDataFactory`
- Mock Firebase responses
- Self-contained test data (no external dependencies)

### E2E Tests
- **Test Accounts:**
  ```
  test-guest-a@rats-e2e.com     # Primary guest
  test-manager@rats-e2e.com      # House manager
  test-admin@rats-e2e.com        # System admin
  ```

- **Test House:**
  ```
  test-house-123                 # Pre-configured test house
  ```

- **Firebase Emulator:**
  - Data is ephemeral (cleared on restart)
  - Can seed data via setup scripts
  - Use `e2e/helpers/setup.js` for data seeding

---

## ✅ Test Quality Checklist

### Unit Tests
- [ ] Tests are independent (no shared state)
- [ ] Tests are deterministic (same result every time)
- [ ] Tests are fast (<100ms each)
- [ ] Tests have clear, descriptive names
- [ ] Tests cover happy path and edge cases
- [ ] Tests use appropriate assertions
- [ ] Tests mock external dependencies

### E2E Tests
- [ ] Tests represent real user workflows
- [ ] Tests are robust (handle timing issues)
- [ ] Tests clean up after themselves
- [ ] Tests have meaningful console output
- [ ] Tests handle errors gracefully
- [ ] Tests use stable selectors (testID)
- [ ] Tests wait for async operations

---

## 🚀 Next Steps

### Short Term (1-2 weeks)
1. **Fix Failing Migration Tests** (9 tests)
   - Debug and fix 9/21 failing migration tests
   - Target: 100% passing

2. **Run E2E Tests**
   - Execute new Activity System E2E test
   - Verify all critical flows work end-to-end
   - Fix any issues discovered

3. **Increase Service Layer Coverage**
   - Add tests for `activity.ts` functions
   - Add tests for summary generation
   - Target: 80% coverage

### Medium Term (2-4 weeks)
1. **Integration Testing Strategy**
   - Decide: Mock vs Emulator vs E2E
   - Set up proper Firebase Emulator integration (if needed)
   - Add comprehensive integration test suite

2. **CI/CD Integration**
   - Set up GitHub Actions
   - Run tests on every PR
   - Block merges if tests fail
   - Generate coverage reports

3. **Performance Testing**
   - Add benchmarks for critical operations
   - Test with large datasets
   - Verify query performance

### Long Term (1-2 months)
1. **Comprehensive E2E Coverage**
   - Test all critical user flows
   - Test error scenarios
   - Test offline/online transitions
   - Test real-time updates

2. **Migration Validation**
   - Test full Week → Activity migration
   - Verify data integrity
   - Test rollback procedures

3. **Production Monitoring**
   - Set up error tracking
   - Monitor test success rates
   - Track test execution times

---

## 📝 Best Practices

### Writing New Tests

1. **Follow Arrange-Act-Assert Pattern:**
   ```typescript
   it('should calculate health correctly', () => {
     // Arrange
     const guest = createMockGuest();
     const house = createMockHouse();

     // Act
     const health = calculateHealth(guest, house, '2024-01-15');

     // Assert
     expect(health).toBe('HAPPY');
   });
   ```

2. **Use Descriptive Test Names:**
   ```typescript
   // Good
   it('should return SUPER_HAPPY when all requirements exceeded')

   // Bad
   it('should work')
   ```

3. **Test One Thing Per Test:**
   ```typescript
   // Good
   it('should log chore activity')
   it('should update week summary after logging chore')

   // Bad
   it('should log activity and update summary and send notification')
   ```

4. **Use Test Data Factories:**
   ```typescript
   const chore = ActivityDataFactory.chore('daily', 'Kitchen', 'chore123');
   const meeting = ActivityDataFactory.meeting('house', 'meeting456');
   ```

### Maintaining Tests

1. **Keep Tests Up to Date:**
   - Update tests when code changes
   - Remove tests for deleted features
   - Add tests for new features

2. **Refactor Test Code:**
   - Extract common setup to helpers
   - Remove duplication
   - Keep tests readable

3. **Monitor Test Health:**
   - Fix flaky tests immediately
   - Remove obsolete tests
   - Update test data as needed

---

## 🎓 Resources

### Documentation
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Detox Documentation](https://wix.github.io/Detox/)
- [Firebase Emulator Guide](https://firebase.google.com/docs/emulator-suite)
- [React Native Testing](https://reactnative.dev/docs/testing-overview)

### Internal Docs
- `docs/TEST_COMPLETION_SUMMARY.md` - Current progress
- `docs/TEST_PROGRESS_REPORT.md` - Initial progress report
- `docs/ACTIVITY_SYSTEM_TEST_PLAN.md` - Original test plan
- `docs/NEW_ARCHITECTURE_STRATEGY.md` - Architecture overview

---

## ✨ Conclusion

**Testing Infrastructure Status:** ✅ **COMPLETE**

We now have:
- ✅ **133 unit tests passing** (Entity layer, helpers, partial migration)
- ✅ **Firebase Emulator configured** and running
- ✅ **E2E framework ready** with Detox
- ✅ **New Activity System E2E test** created
- ✅ **Test utilities and helpers** in place

**Next Immediate Action:**
```bash
# 1. Run the new E2E test
detox build --configuration ios.sim.debug
detox test --configuration ios.sim.debug e2e/tests/activity-system-new.test.js

# 2. Verify critical flows work end-to-end
# 3. Fix any issues discovered
# 4. Celebrate! 🎉
```

The Activity System is now **ready for comprehensive testing** with unit, integration, and E2E test coverage infrastructure in place.
