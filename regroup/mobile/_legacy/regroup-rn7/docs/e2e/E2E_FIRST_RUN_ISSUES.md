> ⚠️ **Legacy document.** Carried over from the standalone `regroup-rn7` repository, archived on 2026-06-06. Historical reference only — may be outdated and is NOT part of current `mobile` documentation.

# E2E Testing - First Run Issues & Progress

**Date:** February 15, 2026
**Status:** In Progress - Deep debugging of E2E infrastructure issues
**Session Duration:** ~2 hours
**Test Status:** 0/7 passing (all login tests failing)

---

## ✅ Issues Fixed

### 1. ✅ Test User Creation Failed (IPv6/IPv4)
- **Error:** `ECONNREFUSED ::1:9099`
- **Fix:** Changed `localhost` to `127.0.0.1` in:
  - `e2e/setup/seedTestData.js`
  - `e2e/setup/globalSetup.js`
- **Result:** Test users create successfully ✅

### 2. ✅ App Firebase Emulator Connection (IPv6/IPv4)
- **Fix:** Changed `EMULATOR_HOST` to `127.0.0.1` in `src/config/firebase-emulator.ts`
- **Result:** App configured to use correct emulator address ✅

### 3. ✅ Detox Pod Missing (Build Failure)
- **Error:** `'Detox/Detox-Swift.h' file not found`
- **Root Cause:** Detox 20+ doesn't use CocoaPods
- **Fix:**
  - Commented out Detox pod in `ios/Podfile`
  - Removed Detox imports from `ios/rats/AppDelegate.mm`
  - Removed `[Detox isRunningWithDetox]` check
- **Result:** App builds successfully ✅

### 4. ✅ App State Clearing Between Tests
- **Fix:** Updated `beforeEach` in auth-login.test.js to use `device.installApp()` + `device.launchApp()`
- **Result:** App fully reinstalls between tests ✅

---

## ❌ Current Blocker: Login Screen Never Appears

### Problem
**ALL 7 tests fail:** Timeout waiting for `id == "login-screen"` (10s)

### Root Cause Analysis

**App gets stuck on Splash screen because:**
1. App tries to authenticate existing user (fails - no user)
2. Calls `dispatch(loginFailedAction())` → sets `loginFailed: true`
3. `appIsReadyCheck()` returns false → stays on Splash
4. App never navigates to login screen

**Original `appIsReadyCheck` logic:**
```typescript
if (user || invitation) {
  return true; // App is ready
} else {
  return false; // Stay on splash
}
```

**Problem:** When login fails (no user, no invitation), app is NOT ready → infinite splash

### Attempted Fix #1: Make app ready when loginFailed
**Change:**
```typescript
if (user || invitation || (isE2ETest && loginFailed)) {
  return true;
}
```

**Result:** Still failing (tests show same timeout)

### Attempted Fix #2: Remove anonymous login in E2E mode
**Change:** Removed `anonymouslyLogin()` call in E2E mode (line 256)
**Reason:** Anonymous login creates a user → prevents testing login screen
**Result:** Still failing

---

## 🔍 Additional Investigation Needed

### Hypothesis 1: `global.__DETOX__` Not Set
- The `isE2ETest` check might fail if Detox doesn't set `global.__DETOX__`
- **Next:** Add logging to confirm `global.__DETOX__` is truthy

### Hypothesis 2: Different Code Path
- App might be taking a different navigation path
- **Next:** Add extensive logging to Splash screen to trace execution

### Hypothesis 3: Timing Issue
- `loginFailed` might not be set before `appIsReadyCheck` runs
- **Next:** Check Redux state flow and timing

### Hypothesis 4: App Actually IS Ready But Wrong Screen Shown
- Maybe app becomes ready but shows wrong screen
- **Next:** Use `--loglevel trace` to see element tree

---

## ⏱️ Performance Issues Found

**`device.installApp()` timeout:**
- One test hit 120s timeout in `beforeEach` hook
- Installing app takes too long
- **Mitigation:** May need to use `--reuse` flag after first test

---

## 📊 Current Status Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Firebase Emulators | ✅ Running | Auth:9099, Firestore:8080 |
| Test Data Seeding | ✅ Working | Users, houses, activities created |
| App Build | ✅ Passing | Detox configuration fixed |
| Emulator Connection | ✅ Fixed | IPv4 addresses used |
| Login Screen Visibility | ❌ BLOCKED | Timeout after 10s |
| Test Execution | ❌ Failing | 0/7 tests passing |

---

## 🎯 Next Actions

1. Add debug logging to determine WHY login screen isn't showing
2. Verify `global.__DETOX__` is actually set
3. Run test with `--loglevel trace` to see element hierarchy
4. Consider using Metro bundler logs to see app behavior
5. May need to modify app's routing logic for E2E mode

---

## 💡 Lessons Learned

1. **IPv6/IPv4 matters everywhere** - localhost can resolve to either
2. **Detox 20+ is different** - No CocoaPods, different integration
3. **Splash screen logic is complex** - Multiple async operations
4. **E2E debugging is hard** - Limited visibility into app state
5. **`device.installApp()` is slow** - Consider optimization strategies

---

**Last Updated:** February 15, 2026 19:37 PST
**Time Invested:** ~2 hours of deep debugging
**Confidence Level:** Need to verify E2E test mode detection working
