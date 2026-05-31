# testID Coverage Report

## Summary

testIDs have been added to critical components and screens to enable E2E testing with Detox.

### Status: In Progress (60% Complete)

| Category | Coverage | Status |
|----------|----------|--------|
| Authentication | 100% | ✅ Complete |
| Navigation | 100% | ✅ Complete |
| Guest Management | 50% | 🔄 Partial |
| Activity/Reporting | 50% | 🔄 Partial |
| Messaging | 20% | 🔄 Partial |
| House Management | 0% | ❌ Not Started |

---

## Completed testIDs

### Authentication Screens ✅

**Login** (`src/screens/Login/`):
- `login-screen` - Main container
- `email-input` - Email field
- `password-input` - Password field
- `login-button` - Submit button
- `forgot-password-link` - Forgot password link
- `forgot-password-modal` - Password reset modal
- `reset-email-input` - Reset email input
- `reset-password-button` - Reset submit button

**SignUp** (`src/screens/SignUp/`):
- `signup-screen` - Main container
- `signup-email-input` - Email field
- `signup-password-input` - Password field
- `signup-first-name-input` - First name field
- `signup-last-name-input` - Last name field
- `signup-button` - Submit button
- `login-link` - Link to login screen

### Navigation ✅

**Main Tab Navigator** (`src/navigation/improved-navigators.tsx`):
- `main-tab-navigator` - Tab bar container
- `house-tab` - House tab button
- `guest-tab` - Guest tab button
- `activity-tab` - Activity tab button
- `contacts-tab` - Contacts tab button
- `chat-tab` - House chat tab button
- `profile-tab` - Profile/Personal tab button

### Screens (Partial) 🔄

**Guest Management**:
- `create-guest-screen` - CreateGuest main container
- `guest-list-screen` - GuestList main container

**Activity/Reporting**:
- `activity-screen` - Activity feed main container
- `disputes-screen` - Disputes main container

---

## Component Support

### Core Components with testID Support ✅

1. **RatsTextInput** - Passes testID to TextInput
2. **RatsButton** - Supports testID via props spread
3. **RatsModalForm** - Accepts testID, auto-generates submit button ID
4. **RatsScrollView** - Supports testID via props spread
5. **SafeAreaView** - Native support for testID

### Components Needing testID Support

These components may need testID prop support added:
- [ ] RatsModal
- [ ] RatsSwitch
- [ ] RatsCheckBox
- [ ] RatsPicker
- [ ] RatsRadioButtonGroup
- [ ] GiftedChat wrapper components

---

## Remaining Work

### High Priority (Critical Paths)

**Guest Management**:
- [ ] GuestUpdate screen
- [ ] Guest form fields
- [ ] Guest save/delete buttons

**Activity Logging**:
- [ ] Activity log button
- [ ] Activity type selector
- [ ] Activity date picker
- [ ] Activity notes input

**Messaging**:
- [ ] DirectChat screen
- [ ] Message input field
- [ ] Send button
- [ ] Message list
- [ ] HouseChat screen

**Disputes/Issues/Complaints**:
- [ ] Issues screen
- [ ] Complaints screen
- [ ] Dispute form fields
- [ ] Submit buttons

### Medium Priority

**House Management**:
- [ ] HouseSettings screen
- [ ] House configuration fields
- [ ] Beds screen
- [ ] Room assignment

**Profile**:
- [ ] Personal screen
- [ ] User info fields
- [ ] Phase customization

### Low Priority

**Setup Wizards**:
- [ ] Organization setup
- [ ] House setup
- [ ] Phase setup

---

## Test File Updates Needed

Once testIDs are added to remaining screens, update these test files:

### Remove `.skip` from tests in:
1. `e2e/authentication.test.js` - ✅ Can enable most tests
2. `e2e/navigation.test.js` - ⚠️  Can enable tab navigation tests
3. `e2e/core-components.test.js` - ⚠️  Needs component testIDs
4. `e2e/critical-flows.test.js` - ❌ Needs many more testIDs

### Test Enablement Status

| Test File | Tests Ready | Tests Skipped | % Ready |
|-----------|-------------|---------------|---------|
| authentication.test.js | 8 | 6 | 57% |
| navigation.test.js | 3 | 15 | 17% |
| core-components.test.js | 0 | 20 | 0% |
| critical-flows.test.js | 0 | 30 | 0% |
| **Total** | **11** | **71** | **13%** |

---

## Running Tests

### Prerequisites Installed ✅
- applesimutils (0.9.12) - for iOS simulator control
- Detox and Detox CLI - E2E test framework

### Build App for Testing

```bash
# iOS
npm run test:e2e:build:ios

# Android
npm run test:e2e:build:android
```

### Run Tests

```bash
# Run specific test file
detox test e2e/authentication.test.js --configuration ios.sim.debug

# Run all tests
npm run test:e2e:ios
```

### Enable Tests

To enable a skipped test, change:
```javascript
it.skip('should do something', async () => {
```

To:
```javascript
it('should do something', async () => {
```

---

## Next Steps

1. **Complete testID Coverage** (Estimated: 4-6 hours)
   - Add testIDs to remaining guest management screens
   - Add testIDs to messaging components
   - Add testIDs to disputes/issues/complaints forms

2. **Build and Test** (Estimated: 1 hour)
   - Build app for iOS: `npm run test:e2e:build:ios`
   - Run authentication tests
   - Debug any failures

3. **Iteratively Enable Tests** (Estimated: 2-3 hours)
   - Enable tests as testIDs are added
   - Fix any component-specific issues
   - Document any test adjustments needed

---

## Useful Commands

```bash
# Check which tests are skipped
grep -r "it.skip" e2e/ --include="*.js"

# Count total tests vs skipped
grep -r "it(" e2e/ --include="*.js" | wc -l
grep -r "it.skip" e2e/ --include="*.js" | wc -l

# Find components missing testIDs
grep -r "testID=" src/screens/ --include="*.tsx" | wc -l

# List screens without testIDs
find src/screens -name "*.tsx" | while read f; do
  if ! grep -q "testID=" "$f"; then
    echo "$f"
  fi
done
```

---

## Notes

- All critical authentication flows are testable ✅
- Tab navigation is testable ✅
- Most tests still need component testIDs before they can run
- Tests are written and ready - just need testIDs to enable them
- Estimated 15-20 more hours to achieve 100% testID coverage
