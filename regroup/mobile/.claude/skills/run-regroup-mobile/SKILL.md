---
name: run-regroup-mobile
description: Run, start, build, screenshot, or interact with the Regroup React Native iOS app. Use when asked to launch the Regroup app on a simulator, take a screenshot, test a screen change, or verify a React Native feature locally.
---

React Native 0.72 iOS app — the Regroup sober living management mobile app (bundle ID: `com.rats.dev`). Driven via `xcrun simctl` for screenshots. Requires Metro bundler running before launch. Use iPhone 15-Detox simulator (UDID: `353D62F5-F0D4-4F25-B952-3294D07586D3`) — "iPhone 14 Pro" from package.json is not installed.

## Prerequisites

- Xcode command line tools: `xcode-select --install`
- Node 18 (Metro works with Node 18): `source ~/.nvm/nvm.sh && nvm use 18`
- CocoaPods: `gem install cocoapods` (or Homebrew)
- iPhone 15-Detox simulator available: `xcrun simctl list devices | grep "iPhone 15-Detox"`

## Build (first time or after native changes)

```bash
cd /Users/marcusklein/dev/rats-v2
source ~/.nvm/nvm.sh && nvm use 18
npm install
cd ios && pod install && cd ..
npx react-native run-ios --simulator="iPhone 15-Detox"
```

`run-ios` builds the Xcode project, installs the app on the simulator, and starts Metro automatically. First build takes 5–10 minutes.

## Run (agent path)

After the app is built at least once:

**Step 1 — Start Metro in background:**

```bash
cd /Users/marcusklein/dev/rats-v2
source ~/.nvm/nvm.sh && nvm use 18
npx react-native start &
```

Wait until Metro is ready:

```bash
until curl -s http://localhost:8081/status | grep -q "packager-status:running"; do sleep 2; done
echo "Metro ready"
```

**Step 2 — Boot simulator and launch app:**

```bash
SIM="353D62F5-F0D4-4F25-B952-3294D07586D3"  # iPhone 15-Detox
xcrun simctl boot "$SIM" 2>/dev/null || true
xcrun simctl install "$SIM" ~/Library/Developer/Xcode/DerivedData/rats-*/Build/Products/Debug-iphonesimulator/rats.app
xcrun simctl launch "$SIM" com.rats.dev
```

**Step 3 — Wait for bundle then screenshot:**

```bash
# Wait for Metro to finish bundling (status is "running" but app may still be bundling)
sleep 15
xcrun simctl io "$SIM" screenshot /tmp/rats-v2.png
```

**Step 4 — Reload after code changes:**

```bash
# Send shake gesture to open dev menu, or use keyboard shortcut in Simulator.app
xcrun simctl io "$SIM" screenshot /tmp/rats-v2-after.png
```

## Run (human path)

```bash
cd /Users/marcusklein/dev/rats-v2
npm run ios
# Equivalent to: npx react-native run-ios --simulator="iPhone 14 Pro"
# NOTE: "iPhone 14 Pro" is not available — override the simulator:
npx react-native run-ios --simulator="iPhone 15-Detox"
```

Opens the Simulator.app GUI. Metro starts in a new terminal window.

## Tests

```bash
cd /Users/marcusklein/dev/rats-v2
npm test                          # Jest unit tests
npm run test:coverage             # Coverage report
npm run test:rules                # Firestore security rules tests (needs rules emulator)
npm run test:e2e:build:ios        # Build Detox E2E test runner
npm run test:e2e:ios              # Run Detox E2E suite on iPhone 15-Detox
```

## Gotchas

- **"iPhone 14 Pro" is missing** — `package.json` specifies `--simulator="iPhone 14 Pro"` but this runtime is not installed. Use `--simulator="iPhone 15-Detox"` (UDID: `353D62F5-F0D4-4F25-B952-3294D07586D3`) instead.
- **Metro MUST start before launching the app** — without Metro running, the app shows "No bundle URL present / RCTFatal" crash. Launch Metro first, wait for ready, then launch the app.
- **Stale DerivedData builds fail with Stripe error** — pre-built `.app` files from DerivedData older than a few weeks fail with `undefined is not an object (evaluating '..StripeProvider')`. The Stripe React Native native module path changes between builds. Use `npm run ios` (fresh build) or ensure DerivedData is from the current checkout.
- **`postinstall` runs pod install** — `npm install` triggers CocoaPods via `postinstall`. If pods fail, the install fails. Run `cd ios && pod install && cd ..` manually if needed.
- **DerivedData glob for .app path** — `~/Library/Developer/Xcode/DerivedData/rats-*/Build/Products/Debug-iphonesimulator/rats.app` may match multiple builds. Use the most recently modified one: `ls -td ~/Library/Developer/Xcode/DerivedData/rats-*/Build/Products/Debug-iphonesimulator/rats.app | head -1`

## Troubleshooting

| Error                                                        | Fix                                                                          |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `No bundle URL present` / `RCTFatal`                         | Start Metro first: `npx react-native start`                                  |
| `undefined is not an object (evaluating '..StripeProvider')` | Fresh build needed: `npx react-native run-ios --simulator="iPhone 15-Detox"` |
| `Invalid device: iPhone 14 Pro`                              | Use `--simulator="iPhone 15-Detox"`                                          |
| `pod install` fails                                          | `cd ios && pod install --repo-update && cd ..`                               |
| Metro port 8081 already in use                               | `lsof -iTCP:8081 -sTCP:LISTEN` to find and kill the old Metro process        |
