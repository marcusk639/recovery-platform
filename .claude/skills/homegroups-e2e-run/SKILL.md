---
name: homegroups-e2e-run
description: Build Detox if needed and run E2E tests for a specific screen or all screens (iOS/Android)
disable-model-invocation: true
---

> **Unit:** `homegroups/` — all relative paths below resolve from there. From the repo root:
> `cd "${CLAUDE_PROJECT_DIR:-$(pwd)}/homegroups"` first.
# Run E2E Tests

Build and run Detox E2E tests, targeting a specific screen or the full suite.

## Arguments

- `<screen>` (optional): Name of a screen test file to run (e.g., `phone-list`, `treasury`). If omitted, runs all tests.
- `--android` (optional): Run on Android emulator instead of iOS simulator.

## Steps

1. **Determine platform** from arguments:
   - Default: iOS (`ios.sim.debug`)
   - If `--android`: Android (`android.emu.debug`)

2. **Check if build exists**:

   ```bash
   # iOS
   ls mobile/ios/build/Build/Products/Debug-iphonesimulator/RecoveryConnect.app 2>/dev/null && echo "BUILD_EXISTS" || echo "NEEDS_BUILD"

   # Android
   ls mobile/android/app/build/outputs/apk/debug/app-debug.apk 2>/dev/null && echo "BUILD_EXISTS" || echo "NEEDS_BUILD"
   ```

3. **Build if needed** (confirm with user first — builds take several minutes):

   ```bash
   # iOS
   cd mobile && npm run test:e2e:build

   # Android
   cd mobile && npm run test:e2e:build:android
   ```

4. **Run tests**:

   ```bash
   # All tests (iOS)
   cd mobile && npm run test:e2e:test

   # Specific screen (iOS)
   cd mobile && npx detox test -c ios.sim.debug e2e/screens/<screen>.test.js

   # All tests (Android)
   cd mobile && npm run test:e2e:test:android

   # Specific screen (Android)
   cd mobile && npx detox test -c android.emu.debug e2e/screens/<screen>.test.js
   ```

5. **Report results**: Show pass/fail counts, any failures with screenshots if available.

## Available Test Screens

List available screens:

```bash
ls mobile/e2e/screens/
```

## Notes

- iOS simulator must be booted before running tests
- Android emulator must be running before running tests
- Detox configuration is in `mobile/e2e/config.json`
- Test helpers are in `mobile/e2e/helpers.js`
- Init/setup is in `mobile/e2e/init.js`
- Always confirm before building — it takes several minutes
