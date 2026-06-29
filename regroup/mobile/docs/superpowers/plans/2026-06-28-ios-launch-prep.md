# iOS Launch Prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Submit Regroup to App Store Connect for TestFlight → App Store review, with a passing iOS E2E smoke test, correct version, proper signing, and complete store listing assets.

**Architecture:** Fix the two shared E2E blockers first (they apply to both platforms), then address iOS-specific gaps: code signing for distribution, privacy manifest, version bump, screenshots, metadata, and finally archive + upload.

**Tech Stack:** React Native 0.72, Xcode 15+, Fastlane `deliver` + `pilot`, Maestro 2.6.0 (E2E), Firebase Emulator Suite.

---

## Session Status — updated 2026-06-29 (E2E login deep-dive)

This session focused on the shared E2E blockers (Tasks 1 & 2) and then drove the
Maestro login flow end-to-end on the `E2E-iPhone` simulator (iOS 26.5),
root-causing a **cascade** of blockers. Environment is verified: emulators up
(`phoenix-cleanhouse`, ports 8080/9099/9199/4000) + seeded (4 houses, logins
work), Metro up, app installed. **Smoke test passes.**

### DONE (committed unless noted)

| Item                               | Detail                                                                                                                                                                                                                                                                                                                                     | Commit                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| Task 1 — emulator projectId        | `test-prep.sh` already `phoenix-cleanhouse`; matches seed                                                                                                                                                                                                                                                                                  | `ce7b7dd` / pre-existing |
| Task 2 — password testID           | `login.yaml` taps `id: password-input`; RatsTextInput forwards testID                                                                                                                                                                                                                                                                      | `d359b5f`                |
| Task 3 — fastlane gem              | already in `Gemfile`                                                                                                                                                                                                                                                                                                                       | —                        |
| Task 4 — iOS perms                 | removed unused Always-location + motion keys; tightened descriptions                                                                                                                                                                                                                                                                       | `4cec04d`                |
| Task 5 — version bump              | `MARKETING_VERSION 1.53` / `CURRENT_PROJECT_VERSION 40`                                                                                                                                                                                                                                                                                    | `4cec04d`                |
| Task 6 (partial) — ExportOptions   | `ios/ExportOptions.plist` created (app-store)                                                                                                                                                                                                                                                                                              | `4cec04d`                |
| Task 9 — release notes             | replaced "First release."                                                                                                                                                                                                                                                                                                                  | `86ba36f`                |
| connectToEmulators at entry        | called in `index.js` before Firebase imports                                                                                                                                                                                                                                                                                               | `4ea6e14`                |
| **E2E blocker: secureTextEntry**   | Maestro/XCUITest cannot type into iOS `secureTextEntry` (iOS 26.5). Option B: `AppDelegate.mm` detects `IS_E2E_TEST` launch arg → NSUserDefaults → JS `Settings` (`src/util/e2e.ts`) → `secureTextEntry={!IS_E2E_TEST}` in `LoginFormView`, gated on `__DEV__` (prod can never unmask)                                                     | `207b360`                |
| **E2E blocker: keyboard race**     | `hideKeyboard` after email so password tap focuses reliably                                                                                                                                                                                                                                                                                | `d643de3`                |
| **APP BUG: login double-dispatch** | `LoginForm.handleSubmit` did `dispatch(loginAction(...))` but `loginAction` (props.login) already dispatches → dispatched a Promise → "Actions must be plain objects" → every login caught as failure once submit reached. Fixed: `await loginAction(...).unwrap()`. Keep regardless of E2E.                                               | `d643de3`                |
| **E2E seed: role flags**           | seeded `users/{uid}` docs lacked `isAdmin`/`houseId` (real signup writes them) → nav classified `NO_USER` → routed to `PriorAuth`. Seed now writes `isGuest/isAdmin/isSuperAdmin/houseId/houseCode/houseAccountVerified`. **NOTE: `seedTestData.js` is gitignored (`regroup/.gitignore: **/*.js`) — change is LOCAL ONLY, not committed.** | local                    |

**Verified outcome:** login now authenticates (`signInWithEmail` → `getUser` →
token), `handleSubmit` fires with correct creds, and the admin **routes into the
operator flow** — confirmed via device logs + screenshots.

### REMAINING for a green login E2E → `house-tab`

- [ ] **A. Seed an active operator subscription.** Login now lands on the
      subscription paywall ("Your subscription has ended") because the seeded
      operator has no active `OperatorSubscription`. Add one to the seed so the
      admin bypasses the gate and reaches `house-tab`. Model: `OperatorSubscription`
      (Stripe `customerId`/`subscriptionId`; tiers in `functions/src/config.ts`).
      Determine the collection/shape the mobile app's subscription gate reads
      (`SubscriptionRequiredScreen` / `subscriptionStatus()` in userSlice /
      `useOxfordGate`). Seed change goes in `e2e/setup/seedTestData.js` (gitignored).
- [ ] **B. Reset auth between runs.** Firebase's Keychain auth session **survives
      Maestro `clearState`**, so on relaunch the app auto-logs-in and the
      `initial-landing-screen` precondition in `login.yaml` no longer holds. Add a
      sign-out / keychain clear at flow start (or `clearKeychain: true` on
      `launchApp`) so login is exercised from a clean unauthenticated state.

### Diagnostics

All temporary `console.log` diagnostics added during debugging were removed
(`[E2E-DIAG]`, `[LOGIN-DIAG]`, `[LOGIN-THUNK]`, `[LOGIN-NAV]`, `[LOGIN-CATCH]`).
`userSlice.ts login` thunk reverted to original. Clean: `grep -rE "LOGIN-DIAG|LOGIN-NAV|LOGIN-CATCH|LOGIN-THUNK|E2E-DIAG" src/` → none.

### Still pending (credentialed / GUI / device — unchanged from prior handoff)

Tasks 6 (signing+archive), 7 (full E2E run — blocked on A+B), 8 (screenshots),
10 (deliver metadata), 11 (TestFlight), 12 (submit). See per-task sections below.

---

## Global Constraints

- Bundle ID (App Store): `com.rats.dev` — do NOT rename without coordinating App Store Connect record
- Display name: "Regroup" — already correct in Info.plist
- Apple Developer Team: `D8K3FS4HAX`
- Apple ID: `marcusk639@gmail.com`
- Fastlane Appfile: `regroup/mobile/fastlane/Appfile`
- Metadata path: `regroup/mobile/fastlane/metadata/en-US/`
- Screenshots path: `regroup/mobile/fastlane/screenshots/ios/`
- Maestro flows run from `regroup/mobile/`; APP_ID for iOS = `com.rats.dev`
- Firebase emulator ports: Auth 9099, Firestore 8080, Storage 9199
- Privacy policy live at: `https://regroup-app.com/privacy-policy`
- `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` live in `ios/rats.xcodeproj/project.pbxproj`

---

## Current State Audit

| #   | Item                                     | Status                                                                                                                                                                                                      |
| --- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | CFBundleDisplayName                      | ✅ "Regroup"                                                                                                                                                                                                |
| 2   | iOS deployment target                    | ✅ 13.0 (Podfile) / 12.0 (fallback)                                                                                                                                                                         |
| 3   | Fastlane metadata files                  | ✅ name, subtitle, description, keywords, privacy_url present                                                                                                                                               |
| 4   | Privacy usage strings                    | ✅ Fixed — `NSLocationAlways*` + `NSMotionUsage` removed (unused); remaining 3 keys have specific descriptions (`4cec04d`)                                                                                  |
| 5   | MARKETING_VERSION                        | ✅ `1.53` (`4cec04d`)                                                                                                                                                                                       |
| 6   | CURRENT_PROJECT_VERSION (build)          | ✅ `40` (`4cec04d`)                                                                                                                                                                                         |
| 7   | Code signing for distribution            | 🚨 `ExportOptions.plist` created (`4cec04d`). But `security find-identity` → **0 valid identities**. No Apple Distribution cert or provisioning profile in Keychain. Must be fixed manually before archive. |
| 8   | iOS screenshots                          | ⚠️ 2 placeholder screenshots captured (`01_landing.png`, `02_login.png`) — wrong device size (1206×2622, need 1290×2796 for 6.7"). Also missing 3 logged-in screens.                                        |
| 9   | Fastlane gem missing                     | ✅ `gem 'fastlane', '~> 2.220'` added to Gemfile (`4cec04d`)                                                                                                                                                |
| 10  | ExportOptions.plist                      | ✅ Created at `ios/ExportOptions.plist` (`4cec04d`)                                                                                                                                                         |
| 11  | Firestore emulator seeding               | ✅ `PROJECT="phoenix-cleanhouse"` in `test-prep.sh` (`ce7b7dd`). Seed produces 5 users + 4 houses.                                                                                                          |
| 12  | Password field Maestro tap               | ✅ `testID="password-input"` on RatsTextInput; `login.yaml` uses `tapOn: id: "password-input"` (`d359b5f`)                                                                                                  |
| 13  | Privacy manifest (PrivacyInfo.xcprivacy) | ⚠️ May be required for Firebase/React Native SDKs on iOS 17+ — App Store Connect will flag post-upload if missing                                                                                           |
| 14  | Location "Always" permission             | ✅ Removed — no background location usage found in codebase                                                                                                                                                 |
| 15  | Release notes                            | ✅ Descriptive copy in `fastlane/metadata/en-US/release_notes.txt` (`86ba36f`)                                                                                                                              |
| 16  | connectToEmulators() not called          | ✅ Fixed — wired into `index.js` before Firebase imports (`4ea6e14`). **App needs rebuild before testing.** Smoke ✓ but login `house-tab` not yet verified with fix.                                        |
| 17  | Fastfile beta lane                       | ✅ `lane :beta` added for TestFlight upload via `pilot` (`48c56ff`)                                                                                                                                         |

---

## File Map

| File                                        | Action   | Why                                                                        |
| ------------------------------------------- | -------- | -------------------------------------------------------------------------- |
| `Gemfile`                                   | Modify   | Add fastlane gem                                                           |
| `ios/rats.xcodeproj/project.pbxproj`        | Modify   | Bump MARKETING_VERSION + CURRENT_PROJECT_VERSION; set Distribution signing |
| `ios/ExportOptions.plist`                   | Create   | Required for `xcodebuild -exportArchive` to produce App Store IPA          |
| `ios/rats/Info.plist`                       | Modify   | Fix vague NSMotionUsageDescription; remove NSLocationAlways if not needed  |
| `scripts/test-prep.sh` (repo root)          | Modify   | Fix `--project demo-rats` → `phoenix-cleanhouse` to unblock E2E auth       |
| `src/components/LoginFormView.tsx`          | Modify   | Add `testID`+`accessibilityLabel` to password TextInput                    |
| `maestro/subflows/login.yaml`               | Modify   | Change `tapOn: text: "Password"` → `tapOn: id: "password-input"`           |
| `fastlane/Gemfile` / `Gemfile`              | Modify   | Add `gem 'fastlane'`                                                       |
| `fastlane/metadata/en-US/release_notes.txt` | Modify   | Replace "First release." with descriptive notes                            |
| `fastlane/screenshots/ios/`                 | Populate | Capture ≥3 screenshots per required device size                            |

---

## Task 1: Fix Firebase Emulator ProjectId Mismatch (Shared with Android)

`test-prep.sh` starts the emulator with `--project demo-rats` but the seed script uses `projectId: 'phoenix-cleanhouse'`. The Firebase Auth emulator associates users with the `--project` ID, so seeded accounts don't exist from the app's perspective. Result: every E2E login fails with `EMAIL_NOT_FOUND`.

**Files:**

- Modify: `scripts/test-prep.sh` (repo root)

**Interfaces:**

- Produces: emulator started with `--project phoenix-cleanhouse`; seed, app, and emulator all agree on the same project ID

- [x] **Step 1: Confirm the mismatch** — confirmed `demo-rats` vs `phoenix-cleanhouse`

- [x] **Step 2: Fix the PROJECT variable** — `PROJECT="phoenix-cleanhouse"` in `scripts/test-prep.sh`

- [x] **Step 3: Restart emulators and verify seeding works** — 5 users seeded, 4 houses seeded ✓

- [x] **Step 4: Verify REST login succeeds** — `OK` ✓

- [x] **Step 5: Commit** — `ce7b7dd fix(e2e): align emulator --project with seed projectId (phoenix-cleanhouse)`

---

## Task 2: Fix Maestro Password Field Tap (Shared with Android)

`tapOn: text: "Password"` hits the RatsLabel component rendered above the TextInput, not the TextInput itself. The email field works because it has `testID="email-input"` which maps to `accessibilityIdentifier` on iOS (reliable in Maestro). Add the same pattern to the password field.

**Files:**

- Modify: `regroup/mobile/src/components/LoginFormView.tsx` (find the password TextInput / RatsTextInput)
- Modify: `regroup/mobile/maestro/subflows/login.yaml`

**Interfaces:**

- Produces: `testID="password-input"` + `accessibilityLabel="password-input"` on the password input; `login.yaml` uses `id: "password-input"`

- [x] **Step 1: Locate the password input in source** — at `src/screens/Login/LoginFormView.tsx` (not `src/components/`)

- [x] **Step 2: Check how email-input testID is forwarded** — RatsTextInput forwards props via `{...props}`; `returnKeyType` prop also added

- [x] **Step 3a: Add testID and accessibilityLabel to the password RatsTextInput** — `testID="password-input"` added at line 41 of `LoginFormView.tsx`

- [x] **Step 3b: n/a** — RatsTextInput already forwarded props

- [x] **Step 4: Update login.yaml** — `tapOn: id: "password-input"` in `maestro/subflows/login.yaml`

- [x] **Step 5: Test confirmed field tap works** — Maestro completes email + password input steps without error

- [x] **Step 7: Commit** — `d359b5f fix(e2e): tap password field by testID; smoke extendedWaitUntil; add suite:full script`

---

## Task 3: Add Fastlane to Gemfile

`Gemfile` only contains `cocoapods`. Running `bundle exec fastlane ios metadata` will fail with "Could not find gem 'fastlane'". Add `fastlane` so the `deliver` and `pilot` actions work.

**Files:**

- Modify: `regroup/mobile/Gemfile`

**Interfaces:**

- Produces: `bundle exec fastlane -v` prints a Fastlane version

- [x] **Step 1: Check current Gemfile** — only had `cocoapods`

- [x] **Step 2: Add fastlane gem** — `gem 'fastlane', '~> 2.220'` added

- [x] **Step 3: Install and verify** — `bundle install` succeeded

- [x] **Step 4: Commit** — included in `4cec04d chore(ios): App Store config prep`

---

## Task 4: Fix iOS Privacy Permission Descriptions

The App Store review team checks that `NSMotionUsageDescription` explains **why** the app needs motion data. "Regroup wants to access your motion usage" is likely to trigger rejection. Also audit whether `NSLocationAlwaysAndWhenInUseUsageDescription` is actually needed (it's the most-scrutinized permission).

**Files:**

- Modify: `regroup/mobile/ios/rats/Info.plist`

**Interfaces:**

- Produces: specific, user-readable descriptions for each permission key

- [x] **Step 1: List all current permission strings** — vague one-liners for all 5 keys

- [x] **Step 2: Determine if "Always" location is needed** — no `requestAlwaysAuthorization` / `CLLocationManager` calls found; removed both `NSLocationAlways*` keys and `NSMotionUsageDescription` (no motion usage either)

- [x] **Step 3: Update Info.plist with specific descriptions** — result:

Edit `regroup/mobile/ios/rats/Info.plist`. Update (or remove where noted):

```xml
<key>NSCameraUsageDescription</key>
<string>Regroup uses your camera to attach photos to resident activity reports and house documentation.</string>

<!-- Keep only if background location is confirmed needed; otherwise REMOVE both Always keys -->
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>Regroup uses your location to verify meeting attendance and record check-ins at house locations.</string>

<key>NSLocationAlwaysUsageDescription</key>
<string>Regroup uses your location to verify meeting attendance and record check-ins at house locations.</string>

<!-- Always keep this one -->
<key>NSLocationWhenInUseUsageDescription</key>
<string>Regroup uses your location to verify meeting attendance and record check-ins at house locations.</string>

<!-- Remove this key if the app does not use step counting or accelerometer -->
<!-- <key>NSMotionUsageDescription</key> -->
<!-- If kept: -->
<key>NSMotionUsageDescription</key>
<string>Regroup uses motion data to automatically detect and log house activities during resident check-ins.</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>Regroup uses your photo library to attach images to activity reports and resident profiles.</string>
```

- [ ] **Step 4: Verify the plist is valid XML**

```bash
plutil -lint regroup/mobile/ios/rats/Info.plist
```

Expected: `regroup/mobile/ios/rats/Info.plist: OK`

- [ ] **Step 5: Build and run to confirm no plist parse errors**

```bash
cd regroup/mobile
npm run ios -- --simulator="iPhone 15 Pro"
```

Expected: app launches without crash.

- [ ] **Step 6: Commit**

```bash
git add regroup/mobile/ios/rats/Info.plist
git commit -m "fix(ios): improve App Store privacy permission descriptions in Info.plist"
```

---

## Task 5: Bump iOS Version to 1.53 / Build 40

Version 1.52 is already live in the App Store. Apple does not allow uploading a build with a lower version string than one previously approved, so we must use `1.53`. `CURRENT_PROJECT_VERSION` (build number) must also be higher than any previously uploaded build — use `40` (Android matches this, and it's safely above `CURRENT_PROJECT_VERSION = 1` currently in the project).

**Files:**

- Modify: `regroup/mobile/ios/rats.xcodeproj/project.pbxproj`

**Interfaces:**

- Produces: `MARKETING_VERSION = 1.53`, `CURRENT_PROJECT_VERSION = 40` in project.pbxproj

- [ ] **Step 1: Confirm the highest build number already in App Store Connect**

Log in to `https://appstoreconnect.apple.com` → Regroup (com.rats.dev) → TestFlight. Note the highest Build Number listed. Use `max(that number, 39) + 1` as the new build number. If the highest is already ≥ 40, use that + 1 instead.

- [ ] **Step 2: Update version via agvtool**

`agvtool` updates all configurations atomically — safer than hand-editing project.pbxproj:

```bash
cd regroup/mobile/ios

# Set marketing version (CFBundleShortVersionString) — must be > 1.52
xcrun agvtool new-marketing-version 1.53

# Set build number (CFBundleVersion) — must be higher than any previously uploaded build
xcrun agvtool new-version -all 40
```

- [ ] **Step 3: Verify**

```bash
grep "MARKETING_VERSION\|CURRENT_PROJECT_VERSION" regroup/mobile/ios/rats.xcodeproj/project.pbxproj | sort -u
```

Expected:

```
CURRENT_PROJECT_VERSION = 40;
MARKETING_VERSION = 1.53;
```

- [ ] **Step 4: Commit**

```bash
git add regroup/mobile/ios/rats.xcodeproj/project.pbxproj
git commit -m "chore(ios): bump version to 1.53 build 40 for next App Store release"
```

---

## Task 6: Configure iOS Code Signing for Distribution

The current Xcode project uses `CODE_SIGN_IDENTITY = "Apple Development"` which only works for development devices. App Store submission requires `Apple Distribution` cert and an App Store provisioning profile for `com.rats.dev`.

**Files:**

- Modify: `regroup/mobile/ios/rats.xcodeproj/project.pbxproj` (Release config only)
- Create: `regroup/mobile/ios/ExportOptions.plist`

**Interfaces:**

- Produces: `xcodebuild archive -scheme rats` + `xcodebuild -exportArchive` creates a signed IPA uploadable to App Store Connect

> **Prerequisite:** An `Apple Distribution` certificate and an App Store provisioning profile for `com.rats.dev` must exist in Xcode's signing keychain. If not, create them in the Apple Developer portal and download into Keychain.

- [ ] **Step 1: Verify certificates in Keychain**

```bash
security find-identity -v -p codesigning | grep -E "Apple Distribution|iPhone Distribution"
```

Expected: at least one valid `Apple Distribution: Marcus ... (D8K3FS4HAX)` certificate.

If none: open Xcode → Preferences → Accounts → Download Manual Profiles, or create a distribution cert at developer.apple.com.

- [ ] **Step 2: Verify provisioning profile exists**

```bash
ls ~/Library/MobileDevice/Provisioning\ Profiles/*.mobileprovision | xargs -I{} bash -c \
  'security cms -D -i "{}" 2>/dev/null | grep -E "AppIDName|TeamIdentifier|Name" | head -5'
```

Look for an App Store profile for `com.rats.dev`. If missing, create one in developer.apple.com → Certificates, Identifiers & Profiles → Profiles → App Store.

- [ ] **Step 3: Update Xcode Release signing to Manual Distribution**

The cleanest approach is to let Xcode handle it automatically with your team. In the project:

Open `regroup/mobile/ios/rats.xcodeproj` in Xcode → rats target → Signing & Capabilities → Release tab:

- Uncheck "Automatically manage signing"
- Team: D8K3FS4HAX
- Provisioning Profile: select the App Store profile for `com.rats.dev`

This updates project.pbxproj automatically. Close Xcode and verify:

```bash
grep "PROVISIONING_PROFILE_SPECIFIER\|CODE_SIGN_IDENTITY" regroup/mobile/ios/rats.xcodeproj/project.pbxproj | grep -v Debug | grep -v "//" | sort -u
```

Expected to include `CODE_SIGN_IDENTITY = "Apple Distribution"` for release.

- [ ] **Step 4: Create ExportOptions.plist**

Create `regroup/mobile/ios/ExportOptions.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store</string>
    <key>teamID</key>
    <string>D8K3FS4HAX</string>
    <key>uploadBitcode</key>
    <false/>
    <key>uploadSymbols</key>
    <true/>
    <key>compileBitcode</key>
    <false/>
    <key>destination</key>
    <string>export</string>
</dict>
</plist>
```

- [ ] **Step 5: Test archive build**

```bash
cd regroup/mobile

# Install pods first if needed
cd ios && pod install && cd ..

# Archive (uses Release signing)
xcodebuild archive \
  -workspace ios/rats.xcworkspace \
  -scheme rats \
  -configuration Release \
  -archivePath /tmp/regroup.xcarchive \
  -allowProvisioningUpdates \
  | tail -20
```

Expected last line: `** ARCHIVE SUCCEEDED **`

- [ ] **Step 6: Export to IPA**

```bash
xcodebuild -exportArchive \
  -archivePath /tmp/regroup.xcarchive \
  -exportPath /tmp/regroup-export \
  -exportOptionsPlist regroup/mobile/ios/ExportOptions.plist \
  | tail -10
```

Expected: `** EXPORT SUCCEEDED **` and `/tmp/regroup-export/rats.ipa` exists.

- [ ] **Step 7: Commit**

```bash
git add regroup/mobile/ios/ExportOptions.plist regroup/mobile/ios/rats.xcodeproj/project.pbxproj
git commit -m "chore(ios): add ExportOptions.plist and configure distribution signing"
```

---

## Task 7: Run iOS E2E Smoke + Login Verification

With Tasks 1 and 2 complete (emulator seeding and password field fixed), run the Maestro smoke flow and login subflow to confirm the end-to-end path works on iOS before taking screenshots.

**Prerequisites:** Firebase emulators running (`./scripts/test-prep.sh`), Metro running, app installed on `E2E-iPhone` simulator.

- [ ] **Step 1: Start emulators (terminal A)**

```bash
./scripts/test-prep.sh
```

Wait for "Seeding complete" output.

- [ ] **Step 2: Start Metro (terminal B)**

```bash
cd regroup/mobile
npx react-native start --reset-cache
```

- [ ] **Step 3: Install app on E2E-iPhone (terminal C)**

```bash
cd regroup/mobile
npx react-native run-ios --simulator="E2E-iPhone"
```

Wait for app to appear on simulator.

- [ ] **Step 4: Run smoke test**

```bash
cd regroup/mobile
npm run maestro:smoke:ios
```

Expected: `Flow completed` — `initial-landing-screen` visible within 30s.

- [ ] **Step 5: Run full login flow**

```bash
maestro test -e APP_ID=com.rats.dev \
  -e EMAIL=test-manager@rats-e2e.com \
  -e PASSWORD=TestPassword123! \
  maestro/subflows/login.yaml
```

Expected: flow completes, `house-tab` visible within 60s.

- [ ] **Step 6: If login times out on house-tab, check Firestore data**

The login may succeed (Auth OK) but the app can't load house data from Firestore. Verify:

```bash
curl -s "http://127.0.0.1:8080/v1/projects/phoenix-cleanhouse/databases/(default)/documents/houses" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('documents',[])), 'houses in Firestore')"
```

Expected: at least 1 house. If 0, the seed script didn't write to Firestore. Re-run the seed:

```bash
cd regroup/mobile
node e2e/setup/seedTestData.js
```

- [ ] **Step 7: Commit passing state note**

No code changes here — this is a verification step. If all passes, note it and continue.

---

## Task 8: Capture iOS App Store Screenshots

The App Store requires at least 3 screenshots for the 6.7" display (iPhone 15 Pro Max or iPhone 14 Plus). The 5.5" size (iPhone 8 Plus) is also commonly uploaded. Capture manually via the simulator since the Detox screenshot flow is not currently passing.

**Required device sizes for App Store:**

- **6.7" iPhone** (iPhone 15 Pro Max, 1290×2796px) — mandatory
- **6.5" iPhone** (iPhone 14 Plus / 13 Pro Max, 1242×2688px) — counts as 6.7" in some cases
- **5.5" iPhone** (iPhone 8 Plus, 1242×2208px) — optional but widely used

**Files:**

- Create: `regroup/mobile/fastlane/screenshots/ios/en-US/` directory with PNG files

- [ ] **Step 1: Create screenshot directory structure**

```bash
mkdir -p regroup/mobile/fastlane/screenshots/ios/en-US
```

- [ ] **Step 2: Boot a 6.7" simulator**

```bash
xcrun simctl list devices | grep "Pro Max\|Plus" | grep Booted
# If none booted:
xcrun simctl boot "iPhone 15 Pro Max"
open -a Simulator
```

- [ ] **Step 3: Install the debug app on 6.7" simulator**

```bash
cd regroup/mobile
npx react-native run-ios --simulator="iPhone 15 Pro Max"
```

- [ ] **Step 4: Capture 4 key screens**

Navigate to each screen and capture:

```bash
# Helper function
capture() {
  local name="$1"
  xcrun simctl io booted screenshot \
    "regroup/mobile/fastlane/screenshots/ios/en-US/${name}.png"
  echo "Saved ${name}.png"
}

# 1. Landing screen (before login — shows Regroup brand)
# Navigate app to landing screen (force kill + relaunch if needed)
capture "01_landing"

# 2. Login screen (tap "Sign In" button)
capture "02_login"

# 3. Operator house dashboard (log in as test-manager via E2E emulator, navigate to house tab)
capture "03_operator_dashboard"

# 4. Guest/resident home (log in as a guest account)
capture "04_guest_home"

# 5. Oxford House governance screen (bonus — if accessible)
capture "05_oxford_dashboard"
```

- [ ] **Step 5: Verify screenshot dimensions**

```bash
for f in regroup/mobile/fastlane/screenshots/ios/en-US/*.png; do
  dims=$(sips -g pixelWidth -g pixelHeight "$f" | awk '/pixel/{printf $2 "x"}')
  echo "$f: $dims"
done
```

Expected for 6.7": `1290x2796` or `1284x2778`.

- [ ] **Step 6: Repeat for 5.5" simulator (optional but recommended)**

```bash
xcrun simctl boot "iPhone 8 Plus"
# Run the app on iPhone 8 Plus
cd regroup/mobile && npx react-native run-ios --simulator="iPhone 8 Plus"
# Capture same 4 screens — Fastlane deliver will use device size to categorize
```

- [ ] **Step 7: Commit screenshots**

```bash
git add regroup/mobile/fastlane/screenshots/ios/
git commit -m "feat(ios): add App Store screenshots for submission"
```

---

## Task 9: Update Store Listing Text

The release notes say "First release." and some metadata fields could be more polished. Update before uploading.

**Files:**

- Modify: `regroup/mobile/fastlane/metadata/en-US/release_notes.txt`
- Verify: `regroup/mobile/fastlane/metadata/en-US/keywords.txt` (100 char limit)
- Verify: `regroup/mobile/fastlane/metadata/en-US/description.txt` (4000 char limit)

- [ ] **Step 1: Check current character counts**

```bash
for f in regroup/mobile/fastlane/metadata/en-US/*.txt; do
  echo "$(wc -c < "$f") chars — $f"
done
```

- [ ] **Step 2: Update release_notes.txt**

Edit `regroup/mobile/fastlane/metadata/en-US/release_notes.txt`:

```
Welcome to Regroup — sober living house management built for operators and residents.

• Manage residents, track rent, and monitor sobriety milestones
• Oxford House governance — officers, votes, EES tracking, and business meetings
• Guest portal — submit rent, view payment history, log chores, and dispute activities
• Secure, emulator-tested login with Firebase Auth
• Offline-capable with automatic sync when reconnected

Built by people in recovery, for people in recovery.
```

- [ ] **Step 3: Verify keywords are ≤100 chars total**

```bash
wc -c < regroup/mobile/fastlane/metadata/en-US/keywords.txt
```

Current: "sober living,recovery house,halfway house,sobriety,oxford house,house management" — count chars. If over 100, trim lowest-priority keywords.

- [ ] **Step 4: Verify description is ≤4000 chars**

```bash
wc -c < regroup/mobile/fastlane/metadata/en-US/description.txt
```

- [ ] **Step 5: Commit**

```bash
git add regroup/mobile/fastlane/metadata/en-US/
git commit -m "chore(ios): update App Store release notes and verify metadata limits"
```

---

## Task 10: Upload Metadata + Screenshots to App Store Connect

Use Fastlane `deliver` to push the metadata and screenshots to App Store Connect without uploading a binary yet. This lets you review the listing in App Store Connect before the IPA upload.

**Prerequisites:** Tasks 3, 8, 9 complete; Xcode / App Store Connect logged in via `bundle exec fastlane spaceauth`.

- [ ] **Step 1: Authenticate with App Store Connect**

```bash
cd regroup/mobile
bundle exec fastlane spaceauth -u marcusk639@gmail.com
```

Follow the 2FA prompt. This saves a session token to `~/.fastlane/spaceship/`.

- [ ] **Step 2: Dry-run the deliver action**

```bash
bundle exec fastlane ios metadata
```

This will show what `deliver` would upload. Review for errors before committing.

Common errors:

- "App not found" → Create the app in App Store Connect manually first (App ID: `com.rats.dev`)
- "Screenshot dimensions don't match" → Check Step 5 of Task 8
- "Text too long" → Fix the relevant `.txt` file

- [ ] **Step 3: If App Store Connect app doesn't exist, create it**

In App Store Connect (`appstoreconnect.apple.com`):

1. My Apps → "+" → New App
2. Platform: iOS
3. Name: Regroup
4. Primary Language: English (U.S.)
5. Bundle ID: `com.rats.dev` (must match exactly)
6. SKU: `regroup-sober-living` (your choice, permanent)
7. User Access: Full Access
8. Click Create

- [ ] **Step 4: Upload metadata for real**

```bash
cd regroup/mobile
bundle exec fastlane ios metadata
```

Expected: "Successfully uploaded metadata and screenshots to App Store Connect."

- [ ] **Step 5: Review in App Store Connect**

Log in to `appstoreconnect.apple.com` → Regroup → App Store tab. Verify:

- Screenshots appear in the correct device slots
- Title, subtitle, description, keywords all show correctly
- Privacy policy URL is populated

---

## Task 11: Upload IPA to TestFlight

With the archive built in Task 6 and the metadata live (Task 10), upload the IPA for internal TestFlight testing. Do not submit for external review yet.

**Prerequisites:** `/tmp/regroup-export/rats.ipa` exists from Task 6, or rebuild it now.

- [ ] **Step 1: Rebuild the archive and IPA if needed**

```bash
cd regroup/mobile

xcodebuild archive \
  -workspace ios/rats.xcworkspace \
  -scheme rats \
  -configuration Release \
  -archivePath /tmp/regroup.xcarchive \
  -allowProvisioningUpdates \
  | grep -E "SUCCEEDED|FAILED|error:"

xcodebuild -exportArchive \
  -archivePath /tmp/regroup.xcarchive \
  -exportPath /tmp/regroup-export \
  -exportOptionsPlist ios/ExportOptions.plist \
  | grep -E "SUCCEEDED|FAILED|error:"
```

- [ ] **Step 2: Upload to TestFlight via Fastlane pilot**

Add a TestFlight upload lane to `fastlane/Fastfile` (inside `platform :ios do`):

```ruby
desc "Upload IPA to TestFlight"
lane :beta do
  pilot(
    ipa: "/tmp/regroup-export/rats.ipa",
    skip_waiting_for_build_processing: true,
    apple_id: "marcusk639@gmail.com",
    team_id: "D8K3FS4HAX",
  )
end
```

Then run:

```bash
cd regroup/mobile
bundle exec fastlane ios beta
```

Expected: "Successfully uploaded the IPA file to TestFlight."

- [ ] **Step 3: Install on a physical iOS device via TestFlight**

1. Open App Store Connect → TestFlight → Regroup
2. Wait for build processing (5–15 min)
3. Add yourself as an Internal Tester
4. Open TestFlight app on your iPhone → install Regroup
5. Verify: app opens, login works, operator dashboard loads

- [ ] **Step 4: Commit Fastfile with beta lane**

```bash
git add regroup/mobile/fastlane/Fastfile
git commit -m "chore(ios): add TestFlight beta upload lane to Fastfile"
```

---

## Task 12: Submit for App Store Review

Once internal TestFlight is verified, submit the build for App Store review.

**Prerequisites:** Task 11 complete and the TestFlight build passes manual verification on a real device.

- [ ] **Step 1: Complete App Store Connect required sections**

In App Store Connect → Regroup → App Store tab, ensure all of these are filled:

- [ ] **App Information**: Category (Productivity or Health & Fitness), Content Rights, Age Rating
- [ ] **Pricing and Availability**: price (Free if app is free; or subscription tier), territories
- [ ] **App Privacy** (Data Safety): fill out the questionnaire. For Regroup: Health & Fitness (sobriety), Financial Info (payments), Contact Info, Identifiers (user ID)
- [ ] **Age Rating questionnaire**: complete IARC. Answer No to most items; set the age rating to 17+ due to substance-related content.
- [ ] **App Review Information**: provide a test account (`test-manager@rats-e2e.com` / `TestPassword123!`) and notes explaining the app requires a pre-seeded house to function

- [ ] **Step 2: Select the TestFlight build for submission**

In App Store Connect → App Store tab → "+" next to Version → select build 40.

- [ ] **Step 3: Add review notes**

In "App Review Information":

```
Demo account for review:
Email: test-manager@rats-e2e.com
Password: TestPassword123!

This account has pre-configured test data (house, guests, activities).
The app connects to production Firebase on first launch.
No real payment is required — test the Stripe flow in test mode only.
```

- [ ] **Step 4: Submit for review**

Click "Submit to App Review". The status will change to "Waiting for Review" (usually 24–48 hours for first submission).

---

## Self-Review

### Spec Coverage Check

| Requirement                                           | Task(s) | Status                                   |
| ----------------------------------------------------- | ------- | ---------------------------------------- |
| E2E emulator seeding works (iOS login not blocked)    | Task 1  | ✅ Done (`ce7b7dd`)                      |
| Maestro login tap works on iOS                        | Task 2  | ✅ Done (`d359b5f`)                      |
| Fastlane `deliver` / `pilot` can run                  | Task 3  | ✅ Done (`4cec04d`)                      |
| Privacy descriptions pass App Store review            | Task 4  | ✅ Done (`4cec04d`)                      |
| Version set to 1.53 / build 40 for next release       | Task 5  | ✅ Done (`4cec04d`)                      |
| Archive + export produces valid IPA                   | Task 6  | 🚨 Blocked — no certs                    |
| iOS smoke + login E2E passes                          | Task 7  | ⚠️ Smoke ✓; login pending rebuild        |
| App Store screenshots captured (≥3, correct sizes)    | Task 8  | ⚠️ 2 placeholders, wrong size            |
| Store listing metadata complete within char limits    | Task 9  | ✅ Done (`86ba36f`)                      |
| Metadata + screenshots visible in App Store Connect   | Task 10 | ⏳ Pending Tasks 6+8                     |
| Build uploaded to TestFlight, passes internal testing | Task 11 | ⏳ Pending Task 6 (lane ready `48c56ff`) |
| Submitted for App Store review                        | Task 12 | ⏳ Pending Task 11                       |

---

## Handoff — Next Session Entry Point

**Last commit:** `4ea6e14 fix(e2e): call connectToEmulators() at app entry before Firebase imports`

**Branch:** `test/e2e-launch-prep`

### Key Discovery This Session

`connectToEmulators()` existed in `src/config/firebase-emulator.ts` but was never imported or called. The app was always connecting to **production** Firebase, so `test-manager@rats-e2e.com` had no house data there and `house-tab` never appeared after login. Fix committed to `index.js` (`4ea6e14`) — **app must be rebuilt before re-testing the login flow**.

### Immediate Next Steps (in order)

**Step A — Rebuild app with emulator fix (5 min)**

```bash
# Ensure emulators are running first
./scripts/test-prep.sh &
sleep 40  # wait for seed

# Rebuild and install on E2E-iPhone
cd regroup/mobile
npx react-native run-ios --simulator="E2E-iPhone"
```

**Step B — Verify login E2E now reaches house-tab (2 min)**

```bash
cd regroup/mobile
maestro test \
  -e APP_ID=com.rats.dev \
  -e EMAIL=test-manager@rats-e2e.com \
  -e PASSWORD=TestPassword123! \
  maestro/subflows/login.yaml
```

Expected: all steps `COMPLETED`, including `Assert that id: house-tab is visible`.

**Step C — Capture correct-size App Store screenshots (10 min)**

```bash
# Boot the correct 6.7" simulator (required for App Store)
xcrun simctl boot "iPhone 15 Pro Max"
cd regroup/mobile
npx react-native run-ios --simulator="iPhone 15 Pro Max"

# Then capture these screens (app must be logged in for 03-05):
# 1. Landing / login screen (brand + Sign In form)
xcrun simctl io booted screenshot fastlane/screenshots/ios/en-US/01_landing.png

# 2. Sign In screen (same screen, good for store listing)
xcrun simctl io booted screenshot fastlane/screenshots/ios/en-US/02_login.png

# Login via Maestro, then capture logged-in screens:
maestro test -e APP_ID=com.rats.dev -e EMAIL=test-manager@rats-e2e.com \
  -e PASSWORD=TestPassword123! maestro/subflows/login.yaml

# 3. Operator dashboard (house tab)
xcrun simctl io booted screenshot fastlane/screenshots/ios/en-US/03_operator_dashboard.png

# Navigate to residents list, then:
# 4. Residents / guests screen
xcrun simctl io booted screenshot fastlane/screenshots/ios/en-US/04_residents.png

# 5. Guest home (login as guest-a)
maestro test -e APP_ID=com.rats.dev -e EMAIL=test-guest-a@rats-e2e.com \
  -e PASSWORD=TestPassword123! maestro/subflows/login.yaml
xcrun simctl io booted screenshot fastlane/screenshots/ios/en-US/05_guest_home.png

# Verify dimensions are 1290x2796
for f in fastlane/screenshots/ios/en-US/*.png; do
  sips -g pixelWidth -g pixelHeight "$f" | awk '/pixel/{printf $2"x"}'; echo " $f"
done
```

**Step D — Fix code signing (manual Xcode step — required before archive)**

`security find-identity -v -p codesigning` returns **0 valid identities**. No certificates in Keychain.

1. Open Xcode → Settings → Accounts → add `marcusk639@gmail.com` Apple ID
2. Click "Download Manual Profiles" (or "Manage Certificates" → create Apple Distribution cert)
3. In Xcode: open `ios/rats.xcodeproj` → rats target → Signing & Capabilities → **Release** tab
   - Uncheck "Automatically manage signing"
   - Team: `D8K3FS4HAX`
   - Provisioning Profile: select the App Store profile for `com.rats.dev`
4. Verify: `security find-identity -v -p codesigning | grep "Apple Distribution"` → should show cert

**Step E — Archive + export + TestFlight upload**

```bash
cd regroup/mobile

xcodebuild archive \
  -workspace ios/rats.xcworkspace \
  -scheme rats \
  -configuration Release \
  -archivePath /tmp/regroup.xcarchive \
  -allowProvisioningUpdates \
  | grep -E "SUCCEEDED|FAILED|error:"

xcodebuild -exportArchive \
  -archivePath /tmp/regroup.xcarchive \
  -exportPath /tmp/regroup-export \
  -exportOptionsPlist ios/ExportOptions.plist \
  | grep -E "SUCCEEDED|FAILED|error:"

# Upload to TestFlight
bundle exec fastlane spaceauth -u marcusk639@gmail.com
bundle exec fastlane ios beta
```

**Step F — Upload metadata + screenshots, submit**

```bash
cd regroup/mobile
bundle exec fastlane ios metadata
# Review in App Store Connect, then submit for review (Task 12 — manual in App Store Connect UI)
```

### Open Decisions / Notes

1. **Version number**: ✅ RESOLVED — 1.52 is live in App Store; using `1.53` / build `40`.

2. **`com.rats.dev` bundle ID**: ✅ RESOLVED — already registered in App Store Connect; keeping as-is.

3. **Stripe on iOS**: ✅ RESOLVED — Regroup does not charge via Stripe on iOS; no StoreKit requirement. Mention in App Review notes if reviewer questions payment flows.

4. **PrivacyInfo.xcprivacy**: Apple requires a privacy manifest for apps using certain SDKs (Firebase, etc.) on iOS 17+. App Store Connect will flag it post-upload if missing. If rejected for this reason, create `regroup/mobile/ios/PrivacyInfo.xcprivacy` with the required `NSPrivacyAccessedAPITypes` entries.

5. **Certificates expiry**: Distribution certs expire annually. Confirm the Apple Distribution cert in Keychain is not expired before archiving (Task 6 Step 1).

6. **index.js in .gitignore**: `regroup/.gitignore` has `**/*.js` which ignores `regroup/mobile/index.js`. It was force-added (`git add -f`) to commit the `connectToEmulators` fix. This is intentional — the rule was meant for build output, not source. Consider adding `!regroup/mobile/index.js` to the gitignore as a follow-up.
