---
name: run-recovery-connect-mobile
description: Run, start, build, screenshot, or interact with the RecoveryConnect mobile React Native iOS app. Use when asked to launch RecoveryConnect on a simulator, take a screenshot, or test a mobile screen change locally.
---

React Native iOS app — the RecoveryConnect sober living management app. Driven via `xcrun simctl` for screenshots. Targets iPhone 16 Pro simulator (UDID: `DBCDC994-2415-4FCE-9807-888F6B8D96EB`). Requires Metro bundler running before launch.

## Prerequisites

- Xcode command line tools
- Node 18: `source ~/.nvm/nvm.sh && nvm use 18`
- CocoaPods
- iPhone 16 Pro simulator: `xcrun simctl list devices | grep DBCDC994`

## Build (first time or after native changes)

```bash
cd /Users/marcusklein/dev/RecoveryConnect/mobile
source ~/.nvm/nvm.sh && nvm use 18
npm install
npx react-native run-ios --udid DBCDC994-2415-4FCE-9807-888F6B8D96EB
```

First build takes 5–10 minutes. `postinstall` runs `pod install` and `patch-package` automatically.

## Run (agent path)

**Step 1 — Start Metro:**

```bash
cd /Users/marcusklein/dev/RecoveryConnect/mobile
source ~/.nvm/nvm.sh && nvm use 18
npx react-native start &
until curl -s http://localhost:8081/status | grep -q "packager-status:running"; do sleep 2; done
echo "Metro ready"
```

**Step 2 — Boot simulator and launch:**

```bash
SIM="DBCDC994-2415-4FCE-9807-888F6B8D96EB"  # iPhone 16 Pro
xcrun simctl boot "$SIM" 2>/dev/null || true
BUNDLE_ID=$(defaults read "$(ls -td ~/Library/Developer/Xcode/DerivedData/RecoveryConnect-*/Build/Products/Debug-iphonesimulator/*.app | head -1)/Info.plist" CFBundleIdentifier 2>/dev/null)
xcrun simctl install "$SIM" "$(ls -td ~/Library/Developer/Xcode/DerivedData/RecoveryConnect-*/Build/Products/Debug-iphonesimulator/*.app | head -1)"
xcrun simctl launch "$SIM" "$BUNDLE_ID"
```

**Step 3 — Screenshot:**

```bash
sleep 15
xcrun simctl io "$SIM" screenshot /tmp/rc-mobile.png
```

## Run (human path)

```bash
cd /Users/marcusklein/dev/RecoveryConnect/mobile
npm run ios
# Equivalent to: npx react-native run-ios --udid DBCDC994-2415-4FCE-9807-888F6B8D96EB
```

## Tests

```bash
cd /Users/marcusklein/dev/RecoveryConnect/mobile
npm test                           # Jest unit tests
npm run test:e2e:build             # Build Detox E2E
npm run test:e2e:test              # Run Detox E2E suite
```

## Gotchas

- **UDID is hardcoded** — package.json targets `DBCDC994-2415-4FCE-9807-888F6B8D96EB` (iPhone 16 Pro). No simulator name override in the scripts — pass `--udid` directly to `react-native run-ios` if using a different device.
- **Metro MUST start before launching** — same pattern as rats-v2: launch Metro first, wait for ready, then launch app. App shows `No bundle URL present` crash otherwise.
- **`postinstall` runs pod install AND patch-package AND react-native-asset** — `npm install` triggers all three. If any fails, the install stops. Run each manually in sequence if needed.
- **Port 8081 conflict with rats-v2** — if rats-v2's Metro is running, it also uses port 8081. Stop it before starting RecoveryConnect's Metro: `lsof -iTCP:8081 -sTCP:LISTEN` → kill PID.

## Troubleshooting

| Error                   | Fix                                                                               |
| ----------------------- | --------------------------------------------------------------------------------- |
| `No bundle URL present` | Start Metro first                                                                 |
| `pod install` fails     | `cd ios && pod install --repo-update && cd ..`                                    |
| Metro port 8081 in use  | Kill the other Metro: `lsof -iTCP:8081 -sTCP:LISTEN` → kill                       |
| `patch-package` errors  | Check `patches/` directory for stale patches against current node_modules version |
