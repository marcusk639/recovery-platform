# iOS Launch Prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Submit Regroup to App Store Connect for TestFlight → App Store review, with a passing iOS E2E smoke test, correct version, proper signing, and complete store listing assets.

**Architecture:** Fix the two shared E2E blockers first (they apply to both platforms), then address iOS-specific gaps: code signing for distribution, privacy manifest, version bump, screenshots, metadata, and finally archive + upload.

**Tech Stack:** React Native 0.72, Xcode 15+, Fastlane `deliver` + `pilot`, Maestro 2.6.0 (E2E), Firebase Emulator Suite.

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

| #   | Item                                     | Status                                                                                                                                             |
| --- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | CFBundleDisplayName                      | ✅ "Regroup"                                                                                                                                       |
| 2   | iOS deployment target                    | ✅ 13.0 (Podfile) / 12.0 (fallback)                                                                                                                |
| 3   | Fastlane metadata files                  | ✅ name, subtitle, description, keywords, privacy_url present                                                                                      |
| 4   | Privacy usage strings                    | ✅ mention "Regroup", but motion description is vague                                                                                              |
| 5   | MARKETING_VERSION                        | ⚠️ `1.52` — should be `1.0.0` for v1 launch                                                                                                        |
| 6   | CURRENT_PROJECT_VERSION (build)          | ⚠️ `1` — must be incremented for each TestFlight upload                                                                                            |
| 7   | Code signing for distribution            | 🚨 Set to "Apple Development" + empty provisioning profile — blocks archive                                                                        |
| 8   | iOS screenshots                          | 🚨 Directory empty — App Store requires ≥3 screenshots                                                                                             |
| 9   | Fastlane gem missing                     | 🚨 `Gemfile` only has `cocoapods`; `deliver`/`pilot` won't run                                                                                     |
| 10  | ExportOptions.plist                      | 🚨 Missing — required for `xcodebuild -exportArchive`                                                                                              |
| 11  | Firestore emulator seeding               | 🚨 `--project demo-rats` vs seed's `phoenix-cleanhouse` → login fails                                                                              |
| 12  | Password field Maestro tap               | 🚨 `tapOn: text: "Password"` hits label, not TextInput → E2E login stuck                                                                           |
| 13  | Privacy manifest (PrivacyInfo.xcprivacy) | ⚠️ May be required for Firebase/React Native SDKs on iOS 17+                                                                                       |
| 14  | Location "Always" permission             | ⚠️ `NSLocationAlwaysAndWhenInUseUsageDescription` risks App Store rejection if not needed                                                          |
| 15  | Release notes                            | ⚠️ "First release." — needs more content                                                                                                           |
| 16  | Debug bundle ID                          | ⚠️ Xcode Debug uses generic template ID (`org.reactjs.native.example…`); Release uses `com.rats.dev` — verify the right config is used for archive |

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

- [ ] **Step 1: Confirm the mismatch**

```bash
grep -n "PROJECT=" scripts/test-prep.sh
grep "projectId" regroup/mobile/e2e/setup/seedTestData.js | head -3
```

Expected: `PROJECT="demo-rats"` vs `projectId: 'phoenix-cleanhouse'`

- [ ] **Step 2: Fix the PROJECT variable**

Edit `scripts/test-prep.sh`. Find:

```bash
PROJECT="demo-rats"
```

Change to:

```bash
PROJECT="phoenix-cleanhouse"
```

- [ ] **Step 3: Restart emulators and verify seeding works**

```bash
# Kill any running emulators
pkill -f "firebase emulators" || true
sleep 3

# Start fresh
./scripts/test-prep.sh &
sleep 40

# Verify auth users exist in emulator
curl -s "http://127.0.0.1:9099/emulator/v1/projects/phoenix-cleanhouse/accounts" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('users',[])), 'users seeded')"
```

Expected: `5 users seeded` (or similar non-zero count).

- [ ] **Step 4: Verify REST login succeeds**

```bash
curl -s -X POST \
  "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-key" \
  -H "Content-Type: application/json" \
  -d '{"email":"test-manager@rats-e2e.com","password":"TestPassword123!","returnSecureToken":true}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK' if 'idToken' in d else d.get('error'))"
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add scripts/test-prep.sh
git commit -m "fix(e2e): align emulator --project with seed projectId (phoenix-cleanhouse)"
```

---

## Task 2: Fix Maestro Password Field Tap (Shared with Android)

`tapOn: text: "Password"` hits the RatsLabel component rendered above the TextInput, not the TextInput itself. The email field works because it has `testID="email-input"` which maps to `accessibilityIdentifier` on iOS (reliable in Maestro). Add the same pattern to the password field.

**Files:**

- Modify: `regroup/mobile/src/components/LoginFormView.tsx` (find the password TextInput / RatsTextInput)
- Modify: `regroup/mobile/maestro/subflows/login.yaml`

**Interfaces:**

- Produces: `testID="password-input"` + `accessibilityLabel="password-input"` on the password input; `login.yaml` uses `id: "password-input"`

- [ ] **Step 1: Locate the password input in source**

```bash
grep -n "secureTextEntry\|password\|Password" regroup/mobile/src/components/LoginFormView.tsx | head -20
```

Note the line where the password `<RatsTextInput>` (or `<TextInput>`) is rendered.

- [ ] **Step 2: Check how email-input testID is forwarded**

Find the email input and confirm how `testID` reaches the native TextInput. RatsTextInput may need to forward it explicitly:

```bash
grep -n "testID\|accessibilityLabel" regroup/mobile/src/components/atoms/RatsTextInput.tsx | head -10
```

If `RatsTextInput` does NOT forward `testID` to its inner `<TextInput>`, add the forwarding (see Step 3b).

- [ ] **Step 3a: Add testID and accessibilityLabel to the password RatsTextInput in LoginFormView.tsx**

Find the password input in `LoginFormView.tsx` and add:

```tsx
<RatsTextInput
  testID="password-input"
  accessibilityLabel="password-input"
  secureTextEntry={!showPassword}
  placeholder="Password"
  // ... other existing props
/>
```

- [ ] **Step 3b: If RatsTextInput doesn't forward testID, add forwarding**

In `regroup/mobile/src/components/atoms/RatsTextInput.tsx`, ensure the inner `<TextInput>` receives these props:

```tsx
<TextInput
  {...props} // spreads testID and accessibilityLabel
  testID={props.testID} // explicit forward (redundant but safe)
  accessibilityLabel={props.accessibilityLabel}
/>
```

Only do this if Step 2 shows the props are not already forwarded.

- [ ] **Step 4: Update login.yaml**

Edit `regroup/mobile/maestro/subflows/login.yaml`. Replace:

```yaml
- tapOn:
    text: 'Password'
- inputText: ${PASSWORD}
```

with:

```yaml
- tapOn:
    id: 'password-input'
- inputText: ${PASSWORD}
```

- [ ] **Step 5: Test on iOS simulator with E2E-iPhone**

With emulators running (from Task 1) and app installed on `E2E-iPhone`:

```bash
cd regroup/mobile
maestro test -e APP_ID=com.rats.dev \
  -e EMAIL=test-manager@rats-e2e.com \
  -e PASSWORD=TestPassword123! \
  maestro/subflows/login.yaml
```

Expected: flow completes, `house-tab` is visible (no timeout, no "element not found").

- [ ] **Step 6: If still failing, use hierarchy to find the real ID**

```bash
maestro hierarchy
```

Scroll to the password area in the output. Copy the exact `id`, `accessibilityIdentifier`, or `text` shown and update `login.yaml` to use it.

- [ ] **Step 7: Commit**

```bash
git add regroup/mobile/src/components/LoginFormView.tsx \
        regroup/mobile/src/components/atoms/RatsTextInput.tsx \
        regroup/mobile/maestro/subflows/login.yaml
git commit -m "fix(e2e): add testID/accessibilityLabel to password field; fix Maestro login tap"
```

---

## Task 3: Add Fastlane to Gemfile

`Gemfile` only contains `cocoapods`. Running `bundle exec fastlane ios metadata` will fail with "Could not find gem 'fastlane'". Add `fastlane` so the `deliver` and `pilot` actions work.

**Files:**

- Modify: `regroup/mobile/Gemfile`

**Interfaces:**

- Produces: `bundle exec fastlane -v` prints a Fastlane version

- [ ] **Step 1: Check current Gemfile**

```bash
cat regroup/mobile/Gemfile
```

- [ ] **Step 2: Add fastlane gem**

Edit `regroup/mobile/Gemfile` to add:

```ruby
source 'https://rubygems.org'

ruby File.read(File.join(__dir__, '.ruby-version')).strip

gem 'cocoapods', '~> 1.12', '>= 1.12.0'
gem 'fastlane', '~> 2.220'
```

- [ ] **Step 3: Install and verify**

```bash
cd regroup/mobile
bundle install
bundle exec fastlane -v
```

Expected: `fastlane 2.220.x` (or similar) printed.

- [ ] **Step 4: Commit**

```bash
git add regroup/mobile/Gemfile regroup/mobile/Gemfile.lock
git commit -m "chore(ios): add fastlane gem to Gemfile"
```

---

## Task 4: Fix iOS Privacy Permission Descriptions

The App Store review team checks that `NSMotionUsageDescription` explains **why** the app needs motion data. "Regroup wants to access your motion usage" is likely to trigger rejection. Also audit whether `NSLocationAlwaysAndWhenInUseUsageDescription` is actually needed (it's the most-scrutinized permission).

**Files:**

- Modify: `regroup/mobile/ios/rats/Info.plist`

**Interfaces:**

- Produces: specific, user-readable descriptions for each permission key

- [ ] **Step 1: List all current permission strings**

```bash
grep -A1 "UsageDescription" regroup/mobile/ios/rats/Info.plist
```

- [ ] **Step 2: Determine if "Always" location is needed**

Search the codebase for background location usage:

```bash
grep -r "requestAlwaysAuthorization\|allowsBackgroundLocationUpdates\|CLLocationManager" \
  regroup/mobile/src/ 2>/dev/null | grep -v ".test." | head -10
```

If no results: the app only needs "When In Use" location. Remove `NSLocationAlwaysAndWhenInUseUsageDescription` and `NSLocationAlwaysUsageDescription` to avoid App Store scrutiny.

If results exist: keep the keys but improve the description.

- [ ] **Step 3: Update Info.plist with specific descriptions**

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

| Requirement                                           | Task(s) |
| ----------------------------------------------------- | ------- |
| E2E emulator seeding works (iOS login not blocked)    | Task 1  |
| Maestro login tap works on iOS                        | Task 2  |
| Fastlane `deliver` / `pilot` can run                  | Task 3  |
| Privacy descriptions pass App Store review            | Task 4  |
| Version set to 1.53 / build 40 for next release       | Task 5  |
| Archive + export produces valid IPA                   | Task 6  |
| iOS smoke + login E2E passes                          | Task 7  |
| App Store screenshots captured (≥3, correct sizes)    | Task 8  |
| Store listing metadata complete within char limits    | Task 9  |
| Metadata + screenshots visible in App Store Connect   | Task 10 |
| Build uploaded to TestFlight, passes internal testing | Task 11 |
| Submitted for App Store review                        | Task 12 |

### Open Decisions / Notes

1. **Version number**: ✅ RESOLVED — 1.52 is live in App Store; using `1.53` / build `40`.

2. **`com.rats.dev` bundle ID**: ✅ RESOLVED — already registered in App Store Connect; keeping as-is.

3. **Stripe on iOS**: ✅ RESOLVED — Regroup does not charge via Stripe on iOS; no StoreKit requirement. Mention in App Review notes if reviewer questions payment flows.

4. **PrivacyInfo.xcprivacy**: Apple requires a privacy manifest for apps using certain SDKs (Firebase, etc.) on iOS 17+. App Store Connect will flag it post-upload if missing. If rejected for this reason, create `regroup/mobile/ios/PrivacyInfo.xcprivacy` with the required `NSPrivacyAccessedAPITypes` entries.

5. **Certificates expiry**: Distribution certs expire annually. Confirm the Apple Distribution cert in Keychain is not expired before archiving (Task 6 Step 1).
