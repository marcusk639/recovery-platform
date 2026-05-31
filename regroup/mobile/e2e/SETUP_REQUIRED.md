# E2E Test Setup Required

## ⚠️ Current Status: NOT READY TO RUN

The E2E tests have been created but require additional setup before they can run.

## Missing Dependencies

### 1. applesimutils (iOS Testing)
Required for controlling iOS simulators.

**Install via Homebrew**:
```bash
brew tap wix/brew
brew install applesimutils
```

### 2. App Build for Testing
The app needs to be built specifically for Detox testing.

**Build for iOS**:
```bash
npm run test:e2e:build:ios
```

This will take 5-10 minutes on first run.

### 3. testID Props Missing
The tests reference elements by `testID` (e.g., `by.id('login-screen')`), but these IDs haven't been added to components yet.

**Example - Current Component**:
```tsx
<View>
  <TextInput placeholder="Email" />
</View>
```

**Needs to become**:
```tsx
<View testID="login-screen">
  <TextInput testID="email-input" placeholder="Email" />
</View>
```

**Estimated effort**: 50+ components need testIDs added.

## Setup Steps (In Order)

### Step 1: Install applesimutils
```bash
brew tap wix/brew
brew install applesimutils
```

### Step 2: Build the app for testing
```bash
# iOS
npm run test:e2e:build:ios

# Android (requires emulator running)
npm run test:e2e:build:android
```

### Step 3: Add testIDs to components

Priority files to update:
1. **Auth screens**: Login, SignUp, NewAccount
2. **Main navigation**: Tab bar, navigation headers
3. **Core components**: RatsTextInput, RatsButton, RatsText
4. **Guest flows**: CreateGuest, GuestUpdate, GuestList
5. **Activity screens**: ActivityScreen, ActivityFilterForm

Example changes needed in `src/screens/Login/LoginForm.tsx`:
```diff
- <View style={styles.container}>
+ <View testID="login-screen" style={styles.container}>
-   <TextInput />
+   <TextInput testID="email-input" />
-   <TextInput />
+   <TextInput testID="password-input" />
-   <TouchableOpacity onPress={handleLogin}>
+   <TouchableOpacity testID="login-button" onPress={handleLogin}>
```

### Step 4: Run a simple test
```bash
# Start with the starter test (modify it to match actual app structure)
npx detox test e2e/starter.test.js --configuration ios.sim.debug
```

### Step 5: Incrementally enable real tests
Remove `.skip` from tests as testIDs are added:
```javascript
// Currently skipped:
it.skip('should display login screen', async () => {

// Enable after testID added:
it('should display login screen', async () => {
```

## Time Estimates

| Task | Time | Priority |
|------|------|----------|
| Install applesimutils | 5 min | High |
| Build app for testing | 10 min | High |
| Add testIDs to auth screens | 30 min | High |
| Add testIDs to core components | 1 hour | Medium |
| Add testIDs to all screens | 3-4 hours | Medium |
| Debug and fix tests | 2-3 hours | Low |
| **Total** | **6-8 hours** | - |

## Quick Start (Minimal Viable Testing)

To get **some** tests working quickly:

1. Install applesimutils (5 min)
2. Add testIDs to Login screen only (15 min)
3. Modify `e2e/starter.test.js` to test Login screen (10 min)
4. Build and run (15 min)

**Total**: ~45 minutes for proof of concept.

## Current Test Files Status

| File | Lines | testIDs Needed | Status |
|------|-------|----------------|--------|
| authentication.test.js | 135 | ~15 | ⚠️ All skipped |
| navigation.test.js | 230 | ~25 | ⚠️ All skipped |
| core-components.test.js | 290 | ~30 | ⚠️ All skipped |
| critical-flows.test.js | 340 | ~40 | ⚠️ All skipped |
| starter.test.js | 24 | 3 | ❌ Will fail |

## Why Tests Were Created This Way

The tests were written **test-first** (TDD approach):
- Define expected behavior upfront
- Provides blueprint for testID placement
- Validates flows before implementation
- Easier to incrementally enable than write from scratch

## Next Steps

**Option A**: Add testIDs incrementally as you develop features
**Option B**: Dedicated sprint to add testIDs to existing screens
**Option C**: Add testIDs only to critical flows (auth, guest creation)

**Recommendation**: Option C - Focus on highest-value tests first.

## Alternative: Manual Testing

If E2E setup is too much overhead right now:
- Use manual testing checklist (see main README.md)
- Add testIDs opportunistically when touching components
- Enable E2E tests later when more stable

## Resources

- [Detox Getting Started](https://wix.github.io/Detox/docs/introduction/getting-started)
- [Adding testID to React Native components](https://reactnative.dev/docs/testing-overview#end-to-end-tests)
- [Detox Actions and Matchers](https://wix.github.io/Detox/docs/api/actions)
