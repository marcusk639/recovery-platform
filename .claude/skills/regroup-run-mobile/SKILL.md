---
name: regroup-run-mobile
description: Run, start, build, screenshot, or interact with the Regroup React Native iOS app. Use when asked to launch the Regroup app on a simulator, take a screenshot, test a screen change, or verify a React Native feature locally.
---

> **Unit:** `regroup/mobile/` — all relative paths below resolve from there. From the repo root:
> `cd "${CLAUDE_PROJECT_DIR:-$(pwd)}/regroup/mobile"` first.
React Native 0.72 iOS app — the Regroup sober living management mobile app (internal codename `rats`; iOS bundle ID: `com.rats.dev`). Driven via `xcrun simctl` for screenshots. Requires Metro bundler running before launch. `package.json`'s `ios` script and `regroup/mobile/.claude/rules/testing.md` both target the "iPhone 15-Detox" simulator by name (`package.json` also has an unused `--simulator="iPhone 14 Pro"` reference — see Gotchas) with UDID `353D62F5-F0D4-4F25-B952-3294D07586D3` last recorded here; **treat that UDID as UNVERIFIED** — this environment has no simulators registered at all (`xcrun simctl list devices` returned empty), so it could not be re-confirmed. Resolve a booted simulator dynamically instead of trusting any hardcoded UDID:

```bash
BOOTED_UDID=$(xcrun simctl list devices booted -j | python3 -c "import json,sys; d=json.load(sys.stdin)['devices']; print(next((v['udid'] for k in d for v in d[k] if v.get('state')=='Booted'), ''))")
SIM="${BOOTED_UDID:-353D62F5-F0D4-4F25-B952-3294D07586D3}"
```

All paths below are relative to `regroup/mobile/` (this skill's unit). If your shell is elsewhere, `cd` there first, e.g. `cd "${CLAUDE_PROJECT_DIR}/regroup/mobile"`.

## Prerequisites

- Xcode command line tools: `xcode-select --install`
- Node 18 (Metro works with Node 18): `source ~/.nvm/nvm.sh && nvm use 18`
- CocoaPods: `gem install cocoapods` (or Homebrew)
- iPhone 15-Detox simulator available: `xcrun simctl list devices | grep "iPhone 15-Detox"`

## Build (first time or after native changes)

```bash
source ~/.nvm/nvm.sh && nvm use 18
npm install
cd ios && pod install && cd ..
npx react-native run-ios --udid "$SIM"
```

`run-ios` builds the Xcode project, installs the app on the simulator, and starts Metro automatically. First build takes 5–10 minutes.

## Run (agent path)

After the app is built at least once:

**Step 1 — Start Metro in background:**

```bash
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
# $SIM set at the top of this file (booted simulator, or the last-known UDID as fallback)
xcrun simctl boot "$SIM" 2>/dev/null || true
xcrun simctl install "$SIM" "$(ls -td ~/Library/Developer/Xcode/DerivedData/rats-*/Build/Products/Debug-iphonesimulator/rats.app | head -1)"
xcrun simctl launch "$SIM" com.rats.dev
```

**Step 3 — Wait for bundle then screenshot:**

```bash
# Wait for Metro to finish bundling (status is "running" but app may still be bundling)
sleep 15
xcrun simctl io "$SIM" screenshot /tmp/regroup-mobile.png
```

**Step 4 — Reload after code changes:**

```bash
# Send shake gesture to open dev menu, or use keyboard shortcut in Simulator.app
xcrun simctl io "$SIM" screenshot /tmp/regroup-mobile-after.png
```

## Run (human path)

```bash
npm run ios
# Equivalent to: npx react-native run-ios --simulator="iPhone 14 Pro"
# NOTE: "iPhone 14 Pro" is not installed in this environment — override the simulator:
npx react-native run-ios --udid "$SIM"
```

Opens the Simulator.app GUI. Metro starts in a new terminal window.

## Tests

```bash
npm test                          # Jest unit tests
npm run test:coverage             # Coverage report
npm run test:e2e:build:ios        # Build Detox E2E test runner
npm run test:e2e:ios              # Run Detox E2E suite on the resolved simulator
```

**`npm run test:rules` is BROKEN — do not run it.** It's defined as `jest --config jest.config.rules.js --no-coverage --forceExit`, but `regroup/mobile/jest.config.rules.js` does not exist on disk. `regroup/mobile/CLAUDE.md` explicitly documents this (alongside `test:integration`, which is also broken — `jest.config.integration.js` is likewise missing). Firestore security rules tests instead live at `regroup/mobile/firebase/__tests__/firestore.rules.test.ts` per `.claude/rules/firebase.md` — check there for the currently-working way to exercise rules, or run them directly with `firebase emulators:exec --only firestore 'npx jest firebase/__tests__/firestore.rules.test.ts'` (UNVERIFIED — not run in this pass, since running emulators was out of scope).

## Gotchas

- **"iPhone 14 Pro" is missing** — `package.json`'s `ios` script specifies `--simulator="iPhone 14 Pro"` but this runtime is not installed; the team's convention (per `.claude/rules/testing.md`) is "iPhone 15-Detox" instead. Don't hardcode either name/UDID — resolve `$SIM` dynamically (see top of this file) and pass `--udid`.
- **Metro MUST start before launching the app** — without Metro running, the app shows "No bundle URL present / RCTFatal" crash. Launch Metro first, wait for ready, then launch the app.
- **Stale DerivedData builds fail with Stripe error** — pre-built `.app` files from DerivedData older than a few weeks fail with `undefined is not an object (evaluating '..StripeProvider')`. The Stripe React Native native module path changes between builds. Use `npm run ios` (fresh build) or ensure DerivedData is from the current checkout.
- **`postinstall` runs pod install** — `npm install` triggers CocoaPods via `postinstall`. If pods fail, the install fails. Run `cd ios && pod install && cd ..` manually if needed.
- **DerivedData glob for .app path** — `~/Library/Developer/Xcode/DerivedData/rats-*/Build/Products/Debug-iphonesimulator/rats.app` may match multiple builds. Use the most recently modified one: `ls -td ~/Library/Developer/Xcode/DerivedData/rats-*/Build/Products/Debug-iphonesimulator/rats.app | head -1`

## Troubleshooting

| Error                                                        | Fix                                                                   |
| ------------------------------------------------------------ | --------------------------------------------------------------------- |
| `No bundle URL present` / `RCTFatal`                         | Start Metro first: `npx react-native start`                           |
| `undefined is not an object (evaluating '..StripeProvider')` | Fresh build needed: `npx react-native run-ios --udid "$SIM"`          |
| `Invalid device: iPhone 14 Pro`                              | Resolve a real simulator and use `--udid "$SIM"` instead              |
| `pod install` fails                                          | `cd ios && pod install --repo-update && cd ..`                        |
| Metro port 8081 already in use                               | `lsof -iTCP:8081 -sTCP:LISTEN` to find and kill the old Metro process |
