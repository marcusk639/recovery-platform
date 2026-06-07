# Regroup E2E Tests

End-to-end tests for the Regroup React Native application using Detox and Firebase Emulator.

## Overview

This test suite covers critical accountability features:
- **Dispute System**: Creating and resolving disputes on activities
- **Activity Verification**: Manager verification workflow
- **Authorization/RBAC**: Role-based access control

## Prerequisites

### Required Software
- Node.js 18+
- iOS Simulator (for iOS tests) or Android Emulator (for Android tests)
- Firebase CLI: `npm install -g firebase-tools`
- Detox CLI: `npm install -g detox-cli`

### Required Services
- Firebase Emulator (Auth + Firestore)

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. iOS Setup (macOS only)
```bash
cd ios
pod install
cd ..
```

### 3. Build App for Testing
```bash
# iOS
npm run test:e2e:build:ios

# Android
npm run test:e2e:build:android
```

## Running Tests

### Start Firebase Emulator First
```bash
firebase emulators:start --only auth,firestore
```

Keep this running in a separate terminal.

### Run All Tests
```bash
# Using test runner (recommended)
npm run test:e2e:run

# Or specify platform
npm run test:e2e:run:ios
npm run test:e2e:run:android
```

### Run Specific Test Suites
```bash
# Dispute system tests
npm run test:e2e:dispute

# Activity verification tests
npm run test:e2e:verification

# Authorization/RBAC tests
npm run test:e2e:auth
```

### Using Test Runner Script Directly
```bash
# Basic usage
./e2e/run-tests.sh --suite all --platform ios

# Run specific suite on Android
./e2e/run-tests.sh --suite dispute --platform android

# Skip build step (if app already built)
./e2e/run-tests.sh --suite all --platform ios --no-build

# Clean and reseed data
./e2e/run-tests.sh --cleanup

# Help
./e2e/run-tests.sh --help
```

## Test Data

Test data is automatically seeded before tests run. To manually seed:

```bash
npm run seed-e2e
```

### Test Accounts
- **Guest A**: `test-guest-a@rats-e2e.com` / `TestPassword123!`
- **Guest B**: `test-guest-b@rats-e2e.com` / `TestPassword123!`
- **Manager**: `test-manager@rats-e2e.com` / `TestPassword123!`
- **Multi-House User**: `test-multi-house@rats-e2e.com` / `TestPassword123!`

### Test Houses
- `test-house-123`: Main test house
- `test-house-a`: Multi-house user admin
- `test-house-b`: Multi-house user guest

## Test Structure

```
e2e/
├── tests/                      # Test files
│   ├── dispute-system.test.js
│   ├── activity-verification.test.js
│   └── authorization-rbac.test.js
├── helpers/                    # Reusable test utilities
│   ├── auth.js                # Authentication helpers
│   ├── navigation.js          # Navigation helpers
│   └── waitFor.js            # Wait/polling helpers
├── setup/                      # Test data and configuration
│   ├── testAccounts.json     # Test user accounts
│   ├── testActivities.json   # Test activities
│   ├── testDisputes.json     # Test disputes
│   ├── seedTestData.js       # Data seeding script
│   ├── globalSetup.js        # Jest global setup
│   └── globalTeardown.js     # Jest global teardown
├── run-tests.sh              # Test runner script
├── jest.config.js            # Jest configuration
└── README.md                 # This file
```

## CI/CD Integration

Tests run automatically on:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches
- Manual workflow dispatch

GitHub Actions workflow: `.github/workflows/e2e-tests.yml`

### Manual CI Run
Go to Actions → E2E Tests → Run workflow

## Troubleshooting

### Firebase Emulator Not Running
```bash
# Start emulator
firebase emulators:start --only auth,firestore

# Check if running
curl http://localhost:9099  # Auth Emulator
curl http://localhost:8080  # Firestore Emulator
```

### App Build Fails
```bash
# Clean and rebuild
npm run fresh-install
npm run pod:install
npm run test:e2e:build:ios
```

### Tests Fail with "Element not found"
- Check if testIDs are correctly added to components
- Verify app is in correct state before test actions
- Check Firebase data was seeded correctly

### iOS Simulator Issues
```bash
# Reset simulator
xcrun simctl erase all

# List available simulators
xcrun simctl list devices
```

### Android Emulator Issues
```bash
# List running emulators
adb devices

# Restart emulator
adb reboot
```

### Test Data Issues
```bash
# Reseed data manually
npm run seed-e2e

# Or restart Firebase Emulator (clears all data)
# Then seed again
```

## Writing New Tests

### Test File Template
```javascript
const { loginAsGuestA, logout } = require('../helpers/auth');
const { navigateToActivities } = require('../helpers/navigation');
const { waitForElementToBeVisible } = require('../helpers/waitFor');

describe('My Test Suite', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      permissions: { notifications: 'YES' },
    });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  afterAll(async () => {
    try {
      await logout();
    } catch (error) {
      console.log('Logout failed');
    }
  });

  test('should do something', async () => {
    await loginAsGuestA();
    await navigateToActivities();
    await waitForElementToBeVisible('my-element', 5000);
    await expect(element(by.id('my-element'))).toBeVisible();
  });
});
```

### Adding testIDs to Components
```typescript
// React Native components
<View testID="my-element">
  <Text testID="my-text">Hello</Text>
  <TouchableOpacity testID="my-button" onPress={handlePress}>
    <Text>Press Me</Text>
  </TouchableOpacity>
</View>
```

### Using Helper Functions
```javascript
// Authentication
await loginAsGuestA();
await loginAsManager();
await logout();

// Navigation
await navigateToActivities();
await navigateToHouse();
await navigateToProfile();

// Waiting
await waitForElementToBeVisible('element-id', 5000);
await waitForFirebaseSync(2000);
await waitForModalToOpen('modal-id', 5000);
```

## Best Practices

1. **Use testIDs**: Always use testIDs instead of text or other matchers
2. **Wait for elements**: Use `waitForElementToBeVisible` before interacting
3. **Clean state**: Use `beforeEach` to reload app for clean state
4. **Use helpers**: Leverage helper functions for common operations
5. **Firebase sync**: Add `waitForFirebaseSync` after data mutations
6. **Descriptive tests**: Write clear test descriptions and console logs
7. **Test isolation**: Each test should be independent
8. **Proper cleanup**: Always logout in `afterAll`

## Performance Tips

- Skip build with `--no-build` when app hasn't changed
- Run specific suites instead of all tests during development
- Use `device.reloadReactNative()` instead of relaunching app
- Leverage Firebase Emulator (much faster than production Firebase)

## Support

For issues or questions:
1. Check this README's Troubleshooting section
2. Review test output and error messages
3. Check if Firebase Emulator is running
4. Verify test data was seeded correctly
5. Consult the plan document: `docs/plans/phase-5-e2e-tests-implementation.md`
