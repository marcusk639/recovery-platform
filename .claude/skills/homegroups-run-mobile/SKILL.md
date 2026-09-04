---
name: homegroups-run-mobile
description: Run, start, build, screenshot, or interact with the Homegroups mobile React Native iOS app. Use when asked to launch Homegroups on a simulator, take a screenshot, or test a mobile screen change locally.
---

> **Unit:** `homegroups/mobile/` — all relative paths below resolve from there. From the repo root:
> `cd "${CLAUDE_PROJECT_DIR:-$(pwd)}/homegroups/mobile"` first.
React Native iOS app — the Homegroups 12-step recovery group management app. Driven via `xcrun simctl` for screenshots. Requires Metro bundler running before launch.

All paths below are relative to `homegroups/mobile/` (this skill's unit). If your shell is elsewhere, `cd` there first, e.g. `cd "${CLAUDE_PROJECT_DIR}/homegroups/mobile"`.

**Simulator UDID:** `package.json`'s `ios` script pins `--udid 0C347C22-1EE3-4158-BB54-5E8726333BDA` — verified in `mobile/package.json` as of 2026-09-03. Do not trust this (or any hardcoded UDID) blindly: simulators get recreated across Xcode/machine upgrades and a stale UDID fails hard. Prefer resolving a currently-booted simulator dynamically and only fall back to the pinned UDID if none is booted:

```bash
BOOTED_UDID=$(xcrun simctl list devices booted -j | python3 -c "import json,sys; d=json.load(sys.stdin)['devices']; print(next((v['udid'] for k in d for v in d[k] if v.get('state')=='Booted'), ''))")
SIM="${BOOTED_UDID:-0C347C22-1EE3-4158-BB54-5E8726333BDA}"
```

## Prerequisites

- Xcode command line tools
- Node 18: `source ~/.nvm/nvm.sh && nvm use 18`
- CocoaPods
- A booted iOS simulator, or the pinned UDID's simulator installed: `xcrun simctl list devices | grep 0C347C22`

## Build (first time or after native changes)

```bash
source ~/.nvm/nvm.sh && nvm use 18
npm install
npx react-native run-ios --udid "$SIM"
```

First build takes 5–10 minutes. `postinstall` runs `pod install` and `patch-package` automatically.

## Run (agent path)

**Step 1 — Start Metro:**

```bash
source ~/.nvm/nvm.sh && nvm use 18
npx react-native start &
until curl -s http://localhost:8081/status | grep -q "packager-status:running"; do sleep 2; done
echo "Metro ready"
```

**Step 2 — Boot simulator and launch:**

```bash
xcrun simctl boot "$SIM" 2>/dev/null || true
BUNDLE_ID=$(defaults read "$(ls -td ~/Library/Developer/Xcode/DerivedData/RecoveryConnect-*/Build/Products/Debug-iphonesimulator/*.app | head -1)/Info.plist" CFBundleIdentifier 2>/dev/null)
xcrun simctl install "$SIM" "$(ls -td ~/Library/Developer/Xcode/DerivedData/RecoveryConnect-*/Build/Products/Debug-iphonesimulator/*.app | head -1)"
xcrun simctl launch "$SIM" "$BUNDLE_ID"
```

(`RecoveryConnect` in the DerivedData glob and `org.recoveryconnect` bundle id are the legacy Xcode target name/bundle identifier the Homegroups app still ships under — see `homegroups/CLAUDE.md`. This is unrelated to the retired `RecoveryConnect` repo path and does not need to change.)

**Step 3 — Screenshot:**

```bash
sleep 15
xcrun simctl io "$SIM" screenshot /tmp/rc-mobile.png
```

## Run (human path)

```bash
npm run ios
# Equivalent to: npx react-native run-ios --udid 0C347C22-1EE3-4158-BB54-5E8726333BDA
```

## Tests

```bash
npm test                           # Jest unit tests
npm run test:e2e:build             # Build Detox E2E (iOS)
npm run test:e2e:test              # Run Detox E2E suite (iOS)
npm run test:e2e:build:android     # Build Detox E2E (Android)
npm run test:e2e:test:android      # Run Detox E2E suite (Android)
```

## Gotchas

- **UDID is hardcoded in `package.json`** — the `ios` script pins `0C347C22-1EE3-4158-BB54-5E8726333BDA`. There is no simulator _name_ override in the scripts, but the UDID itself can and should be overridden — resolve a booted simulator dynamically (see top of this file) and pass `--udid` directly to `react-native run-ios` rather than trusting the pinned value, especially after an Xcode upgrade recreates simulator UDIDs.
- **Metro MUST start before launching** — launch Metro first, wait for ready, then launch the app. App shows `No bundle URL present` crash otherwise.
- **`postinstall` runs pod install AND patch-package AND react-native-asset** — `npm install` triggers all three. If any fails, the install stops. Run each manually in sequence if needed.
- **Port 8081 conflict with regroup/mobile** — if regroup's Metro is running (another React Native app in this monorepo), it also uses port 8081. Stop it before starting Homegroups' Metro: `lsof -iTCP:8081 -sTCP:LISTEN` → kill PID.

## Troubleshooting

| Error                   | Fix                                                                               |
| ----------------------- | --------------------------------------------------------------------------------- |
| `No bundle URL present` | Start Metro first                                                                 |
| `pod install` fails     | `cd ios && pod install --repo-update && cd ..`                                    |
| Metro port 8081 in use  | Kill the other Metro: `lsof -iTCP:8081 -sTCP:LISTEN` → kill                       |
| `patch-package` errors  | Check `patches/` directory for stale patches against current node_modules version |
