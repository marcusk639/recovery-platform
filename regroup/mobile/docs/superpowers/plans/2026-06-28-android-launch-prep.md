# Android Launch Prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get the Regroup Android app to a state where it can be submitted to the Google Play Store internal track, with passing E2E smoke tests on a real Android device/emulator.

**Architecture:** Fix identity and compatibility gaps first (app name, minSdk), then unblock the E2E test infrastructure (emulator seeding + Maestro password field), then verify a signed release AAB builds, then capture Play Store screenshots and submit.

**Tech Stack:** React Native 0.72, Maestro 2.6.0 (E2E), Firebase Emulator Suite, Gradle (Android), Fastlane (store submission).

## Global Constraints

- App ID for Android: `com.regroup.app`
- App ID for iOS: `com.rats.dev`
- Firebase project: `phoenix-cleanhouse`
- E2E seed projectId must match emulator `--project` flag
- Signing keystore: `android/app/my-upload-key.keystore`, alias `my-key-alias`
- Do NOT rename `rats` in JS module names, iOS target, or Firebase config — only fix the user-visible Android `app_name` string
- Gradle.properties must NOT be committed with a hardcoded password after this task
- All Maestro flows use `IS_E2E_TEST: "1"` launch arg to connect to emulator
- Firebase emulator ports: Auth 9099, Firestore 8080, Storage 9199
- Run all Maestro commands from `regroup/mobile/`

---

## Current State Audit (read this before starting)

Known blockers confirmed before writing this plan:

| #   | Issue                                                                                                                                                                        | Impact                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 1   | `strings.xml` has `app_name = "rats"`                                                                                                                                        | Play Store & Android drawer shows "rats"      |
| 2   | `minSdkVersion = 34` (Android 14 only)                                                                                                                                       | Only ~15% of Android devices can install      |
| 3   | Firestore emulator seeding fails — `test-prep.sh` starts with `--project demo-rats` but auth emulator serves a different project than the seed script's `phoenix-cleanhouse` | E2E login always fails with `EMAIL_NOT_FOUND` |
| 4   | Maestro `tapOn: text: "Password"` hits the label above the field, not the TextInput                                                                                          | Password never entered; E2E login fails       |
| 5   | No `maestro:suite:android` npm script                                                                                                                                        | Can't run Maestro suite against Android       |
| 6   | No Android Play Store screenshots                                                                                                                                            | Cannot submit to Play Store                   |
| 7   | Signed release AAB never verified post-refactor                                                                                                                              | Unknown if production build even works        |
| 8   | `gradle.properties` has hardcoded keystore password (`1qaz!QAZ`)                                                                                                             | Security risk if file is ever committed       |

---

## File Map

| File                                          | Action                    | Why                                                                      |
| --------------------------------------------- | ------------------------- | ------------------------------------------------------------------------ |
| `android/app/src/main/res/values/strings.xml` | Modify                    | Change `app_name` from "rats" → "Regroup"                                |
| `android/build.gradle`                        | Modify                    | Lower `minSdkVersion` from 34 → 24                                       |
| `android/gradle.properties`                   | Modify                    | Remove hardcoded keystore password; read from env                        |
| `android/app/build.gradle`                    | Verify                    | Confirm `signingConfigs.release` reads from env/properties correctly     |
| `scripts/test-prep.sh` (repo root)            | Modify                    | Fix `--project` flag to match seed's `projectId` (or vice versa)         |
| `maestro/subflows/login.yaml`                 | Modify                    | Fix password field tap to use `accessibilityLabel` or `testID`           |
| `src/components/LoginFormView.tsx`            | Modify                    | Add explicit `accessibilityLabel="password-input"` to password TextInput |
| `package.json`                                | Modify                    | Add `maestro:suite:android` npm script                                   |
| `android/app/build.gradle`                    | Modify (versionCode/Name) | Bump to versionCode 40, versionName "1.0.0"                              |
| `fastlane/screenshots/android/`               | Create                    | Capture 4 representative screenshots                                     |
| `fastlane/metadata/android/en-US/`            | Verify                    | Confirm all required fields are populated                                |
| `.env.example`                                | Modify                    | Add `MYAPP_UPLOAD_STORE_PASSWORD`, `MYAPP_UPLOAD_KEY_PASSWORD`           |

---

## Task 1: Fix App Name on Android

The Android device and Play Store both show "rats" as the app name. Must be "Regroup".

**Files:**

- Modify: `regroup/mobile/android/app/src/main/res/values/strings.xml`
- Modify: `regroup/mobile/app.json` (displayName)

**Interfaces:**

- Produces: `app_name = "Regroup"` in Android resources; `displayName = "Regroup"` in app.json

- [ ] **Step 1: Confirm what's currently set**

```bash
cat regroup/mobile/android/app/src/main/res/values/strings.xml
cat regroup/mobile/app.json
```

Expected: `<string name="app_name">rats</string>` and `"displayName": "rats"`

- [ ] **Step 2: Fix strings.xml**

Edit `regroup/mobile/android/app/src/main/res/values/strings.xml`:

```xml
<resources>
    <string name="app_name">Regroup</string>
    <string name="com.crashlytics.android.build_id">1</string>
</resources>
```

- [ ] **Step 3: Fix app.json displayName**

Edit `regroup/mobile/app.json`:

```json
{
  "name": "rats",
  "displayName": "Regroup",
  "androidStatusBar": {
    "backgroundColor": "#000000"
  }
}
```

Note: Keep `"name": "rats"` — this is the JS module name tied to the iOS target, Firebase config, and Play Store listing. Only `displayName` is shown to end users on Android.

- [ ] **Step 4: Verify on Android emulator**

```bash
cd regroup/mobile
npm run android
```

Check the app drawer. The icon label should now read "Regroup" not "rats".

- [ ] **Step 5: Commit**

```bash
git add regroup/mobile/android/app/src/main/res/values/strings.xml regroup/mobile/app.json
git commit -m "fix(android): rename app display name from rats to Regroup"
```

---

## Task 2: Lower minSdkVersion to Android 7 (API 24)

`minSdkVersion = 34` means only Android 14+ devices can install the app. React Native 0.72 supports API 23+. API 24 gives ~95%+ Android market coverage vs ~15% at API 34.

**Files:**

- Modify: `regroup/mobile/android/build.gradle`

**Interfaces:**

- Produces: `minSdkVersion = 24` in root build.gradle ext block

- [ ] **Step 1: Check current setting**

```bash
grep -n "minSdkVersion\|targetSdkVersion\|compileSdkVersion" regroup/mobile/android/build.gradle
```

Expected:

```
minSdkVersion = 34
compileSdkVersion = 34
targetSdkVersion = 34
```

- [ ] **Step 2: Lower minSdkVersion only**

Edit `regroup/mobile/android/build.gradle`. Change the `ext` block:

```groovy
ext {
    buildToolsVersion = "34.0.0"
    minSdkVersion = 24        // was 34 — Android 7+, ~95% market coverage
    compileSdkVersion = 34
    targetSdkVersion = 34
    androidXCore = "1.6.0"
    googlePlayServicesVersion = "21.0.1"
    kotlinVersion = "1.8.10"
    ndkVersion = "23.1.7779620"
}
```

- [ ] **Step 3: Verify debug build still compiles**

```bash
cd regroup/mobile
./android/gradlew assembleDebug -p android
```

Expected: `BUILD SUCCESSFUL`. If any library minimum SDK error appears, note the offending library and either upgrade it or raise `minSdkVersion` to its minimum.

- [ ] **Step 4: Test app launches on API 24 emulator**

In Android Studio or via CLI, create a Pixel 4 API 24 AVD and run:

```bash
npm run android
```

Verify the app opens to the landing screen.

- [ ] **Step 5: Commit**

```bash
git add regroup/mobile/android/build.gradle
git commit -m "fix(android): lower minSdkVersion from 34 to 24 for market coverage"
```

---

## Task 3: Fix Firebase Emulator ProjectId Mismatch

`test-prep.sh` starts the emulator with `--project demo-rats` but the seed script (`seedTestData.js`) uses `projectId: 'phoenix-cleanhouse'`. The Firebase Auth emulator uses the `--project` flag, so Auth users created under `phoenix-cleanhouse` are not found when the app authenticates against `demo-rats`.

The correct fix is to make both sides agree. The app's `google-services.json` uses `phoenix-cleanhouse`, so use that as the project everywhere in E2E.

**Files:**

- Modify: `scripts/test-prep.sh` (repo root level)

**Interfaces:**

- Produces: emulator started with `--project phoenix-cleanhouse`; seed and app all agree on the same project

- [ ] **Step 1: Confirm the mismatch**

```bash
grep -n "project\|PROJECT" scripts/test-prep.sh | head -10
grep "projectId" regroup/mobile/e2e/setup/seedTestData.js | head -5
```

Expected: `PROJECT="demo-rats"` in test-prep.sh, `projectId: 'phoenix-cleanhouse'` in seed.

- [ ] **Step 2: Change the PROJECT variable in test-prep.sh**

Edit `scripts/test-prep.sh`. Find and change:

```bash
PROJECT="demo-rats"
```

to:

```bash
PROJECT="phoenix-cleanhouse"
```

- [ ] **Step 3: Verify the emulators start cleanly**

```bash
./scripts/test-prep.sh &
sleep 30
curl -s http://127.0.0.1:4000 | grep -i "emulator" && echo "Emulators up"
# Check auth emulator has users after seed
curl -s "http://127.0.0.1:9099/emulator/v1/projects/phoenix-cleanhouse/accounts" | python3 -m json.tool | grep -c '"localId"'
```

Expected: a count > 0 (the seeded users exist in Auth).

- [ ] **Step 4: Verify test login works via REST**

```bash
curl -s -X POST \
  "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-key" \
  -H "Content-Type: application/json" \
  -d '{"email":"test-manager@rats-e2e.com","password":"TestPassword123!","returnSecureToken":true}' \
  | python3 -m json.tool | grep -E "idToken|error"
```

Expected: `"idToken": "..."` — login succeeds against the emulator.

- [ ] **Step 5: Commit**

```bash
git add scripts/test-prep.sh
git commit -m "fix(e2e): align emulator --project with seed projectId (phoenix-cleanhouse)"
```

---

## Task 4: Fix Maestro Password Field Interaction

`tapOn: text: "Password"` in `maestro/subflows/login.yaml` taps the RatsLabel above the TextInput, not the TextInput itself. The fix is to add `accessibilityLabel="password-input"` to the password TextInput in `LoginFormView.tsx` (same pattern as email-input which works) and update the Maestro flow to use that selector.

**Files:**

- Modify: `regroup/mobile/src/components/LoginFormView.tsx` (or wherever the password TextInput is rendered)
- Modify: `regroup/mobile/maestro/subflows/login.yaml`

**Interfaces:**

- Produces: `accessibilityLabel="password-input"` on the password TextInput; login.yaml uses `id: "password-input"` to tap it

- [ ] **Step 1: Find the password TextInput in source**

```bash
grep -n "password\|Password\|secureTextEntry" regroup/mobile/src/components/LoginFormView.tsx | head -20
```

Note the line number where `secureTextEntry` or the password TextInput is defined.

- [ ] **Step 2: Confirm email-input pattern works (it should)**

In `LoginFormView.tsx`, find the email input. It should already have:

```tsx
testID = 'email-input';
accessibilityLabel = 'email-input';
```

or it's wrapped in a `RatsTextInput` with `testID`. Note the exact prop names used for email — replicate the same pattern for password.

- [ ] **Step 3: Add accessibility props to password field**

In `LoginFormView.tsx`, find the password input (the one with `secureTextEntry`). Add `testID` and `accessibilityLabel`:

```tsx
<RatsTextInput
  testID="password-input"
  accessibilityLabel="password-input"
  secureTextEntry={!showPassword}
  placeholder="Password"
  // ... other existing props unchanged
/>
```

If the component is `RatsTextInput`, confirm in `src/components/atoms/RatsTextInput.tsx` that `testID` and `accessibilityLabel` are forwarded to the underlying `TextInput`. If not, add forwarding:

```tsx
// In RatsTextInput.tsx, inside the TextInput or TouchableOpacity wrapping:
<TextInput
  {...props}
  testID={props.testID}
  accessibilityLabel={props.accessibilityLabel}
/>
```

- [ ] **Step 4: Update login.yaml to use the new selector**

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

- [ ] **Step 5: Test the login flow on iOS simulator (faster feedback)**

```bash
cd regroup/mobile
# With emulator running from test-prep.sh and app installed on E2E-iPhone:
maestro test -e APP_ID=com.rats.dev maestro/subflows/login.yaml \
  -e EMAIL=test-manager@rats-e2e.com \
  -e PASSWORD=TestPassword123!
```

Expected: flow reaches `house-tab` visible assertion without errors.

- [ ] **Step 6: Test the login flow on Android emulator**

```bash
# With the Android emulator running and app installed:
maestro test -e APP_ID=com.regroup.app maestro/subflows/login.yaml \
  -e EMAIL=test-manager@rats-e2e.com \
  -e PASSWORD=TestPassword123!
```

Expected: same result — `house-tab` visible.

- [ ] **Step 7: Commit**

```bash
git add regroup/mobile/src/components/LoginFormView.tsx \
        regroup/mobile/maestro/subflows/login.yaml
git commit -m "fix(e2e): add testID/accessibilityLabel to password field; fix Maestro login tap"
```

---

## Task 5: Add Android Maestro Suite Script

Currently `package.json` has `maestro:suite:full` which hard-codes the iOS APP_ID (`com.rats.dev`). Android needs its own suite entry so Android E2E can be triggered without editing code.

**Files:**

- Modify: `regroup/mobile/package.json`

**Interfaces:**

- Produces: `npm run maestro:suite:android` runs the full Maestro suite against `com.regroup.app`

- [ ] **Step 1: Confirm current scripts**

```bash
cat regroup/mobile/package.json | python3 -c "
import sys, json
d = json.load(sys.stdin)
for k, v in d['scripts'].items():
    if 'maestro' in k:
        print(f'{k}: {v}')
"
```

- [ ] **Step 2: Add android suite script**

In `regroup/mobile/package.json`, find the `scripts` block and add:

```json
"maestro:suite:android": "maestro test -e APP_ID=com.regroup.app maestro/flows/run-all.yaml",
"maestro:smoke:android": "maestro test -e APP_ID=com.regroup.app maestro/flows/smoke.yaml"
```

The full scripts block after this change should include:

```json
"maestro:ios": "maestro test -e APP_ID=com.rats.dev maestro/flows/",
"maestro:android": "maestro test -e APP_ID=com.regroup.app maestro/flows/",
"maestro:smoke:ios": "maestro test -e APP_ID=com.rats.dev maestro/flows/smoke.yaml",
"maestro:smoke:android": "maestro test -e APP_ID=com.regroup.app maestro/flows/smoke.yaml",
"maestro:suite:ios": "maestro test -e APP_ID=com.rats.dev maestro/flows/run-all.yaml",
"maestro:suite:android": "maestro test -e APP_ID=com.regroup.app maestro/flows/run-all.yaml",
"maestro:suite:full": "maestro test -e APP_ID=com.rats.dev maestro/flows/run-all.yaml"
```

- [ ] **Step 3: Run the smoke test on Android to verify the script works**

```bash
cd regroup/mobile
npm run maestro:smoke:android
```

Expected: smoke test passes (initial-landing-screen visible).

- [ ] **Step 4: Commit**

```bash
git add regroup/mobile/package.json
git commit -m "feat(e2e): add maestro:suite:android and maestro:smoke:android npm scripts"
```

---

## Task 6: Secure Keystore Credentials

`gradle.properties` has `MYAPP_UPLOAD_STORE_PASSWORD=1qaz!QAZ` and `MYAPP_UPLOAD_KEY_PASSWORD=1qaz!QAZ` hardcoded. If this file is ever committed (it currently appears to be, given it shows up in `ls`), the keystore password is exposed. Move the sensitive values to local env or a gitignored file.

**Files:**

- Modify: `regroup/mobile/android/gradle.properties`
- Modify: `regroup/mobile/.env.example`
- Create: `regroup/mobile/android/local.properties` (if not exists — already gitignored by Android)

**Interfaces:**

- Produces: `gradle.properties` reads passwords from environment or local file, not hardcoded

- [ ] **Step 1: Check if gradle.properties is tracked**

```bash
git -C regroup/mobile ls-files android/gradle.properties
```

If output is non-empty, the file IS tracked — the password is in git history. Note this for Step 5.

- [ ] **Step 2: Check if android/local.properties exists and is gitignored**

```bash
cat regroup/mobile/android/.gitignore | grep -E "local.properties|keystore" | head -5
```

`local.properties` is gitignored by default in Android projects. This is where we can safely store machine-local secrets.

- [ ] **Step 3: Move passwords to android/local.properties**

Create (or append to) `regroup/mobile/android/local.properties`:

```
MYAPP_UPLOAD_STORE_PASSWORD=1qaz!QAZ
MYAPP_UPLOAD_KEY_PASSWORD=1qaz!QAZ
```

- [ ] **Step 4: Update android/gradle.properties to remove hardcoded values**

Edit `regroup/mobile/android/gradle.properties`. Remove these two lines:

```
MYAPP_UPLOAD_STORE_PASSWORD=1qaz!QAZ
MYAPP_UPLOAD_KEY_PASSWORD=1qaz!QAZ
```

Keep the non-secret values:

```
MYAPP_UPLOAD_STORE_FILE=my-upload-key.keystore
MYAPP_UPLOAD_KEY_ALIAS=my-key-alias
```

- [ ] **Step 5: Update app/build.gradle to also read from local.properties**

In `regroup/mobile/android/app/build.gradle`, the `signingConfigs.release` block already uses `project.hasProperty()`. Gradle automatically reads both `gradle.properties` AND `local.properties` during the build, so no code change needed — just verify.

```bash
cd regroup/mobile/android
./gradlew properties | grep MYAPP_UPLOAD
```

Expected: both `MYAPP_UPLOAD_STORE_PASSWORD` and `MYAPP_UPLOAD_KEY_PASSWORD` are present (from local.properties).

- [ ] **Step 6: Update .env.example to document the keystore variables**

In `regroup/mobile/.env.example`, add:

```bash
# Android release signing (set in android/local.properties, not .env)
# MYAPP_UPLOAD_STORE_FILE=my-upload-key.keystore
# MYAPP_UPLOAD_KEY_ALIAS=my-key-alias
# MYAPP_UPLOAD_STORE_PASSWORD=<from 1Password>
# MYAPP_UPLOAD_KEY_PASSWORD=<from 1Password>
```

- [ ] **Step 7: Commit**

```bash
git add regroup/mobile/android/gradle.properties regroup/mobile/.env.example
# Do NOT add local.properties — it's gitignored
git commit -m "security: remove hardcoded keystore passwords from gradle.properties"
```

> **Note:** The password still exists in git history if gradle.properties was previously committed with it. After launch, rotate the keystore or accept the risk (the keystore file itself is what's sensitive — the password alone is less useful without the file).

---

## Task 7: Bump Version to 1.0.0

The app shows `versionName "0.55"` / `versionCode 39`. For a v1 Play Store launch, set `versionName "1.0.0"` / `versionCode 40`.

**Files:**

- Modify: `regroup/mobile/android/app/build.gradle`

**Interfaces:**

- Produces: `versionCode 40`, `versionName "1.0.0"` in app/build.gradle

- [ ] **Step 1: Find current version values**

```bash
grep -n "versionCode\|versionName" regroup/mobile/android/app/build.gradle
```

- [ ] **Step 2: Update version**

Edit `regroup/mobile/android/app/build.gradle`, in the `defaultConfig` block:

```groovy
defaultConfig {
    applicationId 'com.regroup.app'
    minSdkVersion rootProject.ext.minSdkVersion
    targetSdkVersion rootProject.ext.targetSdkVersion
    versionCode 40
    versionName "1.0.0"
    // ... rest unchanged
}
```

- [ ] **Step 3: Commit**

```bash
git add regroup/mobile/android/app/build.gradle
git commit -m "chore(android): bump version to 1.0.0 / versionCode 40 for Play Store launch"
```

---

## Task 8: Verify Signed Release AAB Builds

Before submitting to the Play Store, confirm the release App Bundle (AAB) actually builds with the production signing config. This catches missing Proguard rules, broken native deps, or signing config issues before they hit the store.

**Files:**

- Read: `regroup/mobile/android/app/build.gradle` (signingConfigs block)
- Verify: `regroup/mobile/android/app/my-upload-key.keystore` exists

**Interfaces:**

- Produces: `regroup/mobile/android/app/build/outputs/bundle/release/app-release.aab` on disk

- [ ] **Step 1: Confirm local.properties has the keystore password (from Task 6)**

```bash
grep MYAPP_UPLOAD_STORE_PASSWORD regroup/mobile/android/local.properties
```

Expected: the password is present.

- [ ] **Step 2: Confirm the keystore file is present**

```bash
ls -lh regroup/mobile/android/app/my-upload-key.keystore
```

Expected: file exists, non-zero size.

- [ ] **Step 3: Build the release AAB**

```bash
cd regroup/mobile/android
./gradlew bundleRelease
```

Expected: `BUILD SUCCESSFUL`. The output AAB will be at:
`app/build/outputs/bundle/release/app-release.aab`

- [ ] **Step 4: Verify the AAB is signed**

```bash
# Use the bundletool JAR or apksigner to verify
ls -lh regroup/mobile/android/app/build/outputs/bundle/release/app-release.aab
```

The file should be > 10 MB. If you have `bundletool` installed:

```bash
bundletool validate --bundle=regroup/mobile/android/app/build/outputs/bundle/release/app-release.aab
```

Expected: `The Android App Bundle is valid.`

- [ ] **Step 5: Test the release build installs on a real or emulated device**

Build a release APK from the AAB for local testing (Play Store uses AAB but you need APK to install locally):

```bash
cd regroup/mobile/android
./gradlew assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
```

Launch the app on the device. Verify:

- Splash screen renders
- App connects to **production** Firebase (not emulator)
- Login screen appears (do not log in with test creds in production)

- [ ] **Step 6: Document result**

If the build fails, note the error and fix before proceeding to Task 9. Common failures:

- **"Duplicate class" errors**: add Proguard exclusions in `app/proguard-rules.pro`
- **"Keystore not found"**: verify `local.properties` path is relative to the `android/app/` directory
- **"Resource not found"**: run `./gradlew clean` first

---

## Task 9: Capture Android Play Store Screenshots

The Google Play Store requires at least 2 screenshots per device type. The `fastlane/screenshots/android/` directory exists but is empty. Capture screenshots of the 4 key screens: landing, operator dashboard, guest home, Oxford House view.

**Files:**

- Create: `regroup/mobile/fastlane/screenshots/android/phoneScreenshots/*.png` (or `.jpg`)

**Interfaces:**

- Produces: at least 4 screenshots in `fastlane/screenshots/android/`

> **Approach:** Manual screenshot capture from the Android emulator is the fastest reliable path. Automated Detox screenshot flows exist but are not currently passing. Take manual screenshots via `adb` or Android Studio's screenshot tool.

- [ ] **Step 1: Boot the Android emulator and install the debug build**

```bash
# Start a Pixel 6 API 34 emulator (or any available emulator)
emulator -avd <your_avd_name> &
sleep 30

cd regroup/mobile
npm run android
```

Wait for Metro to bundle and the app to appear on the emulator.

- [ ] **Step 2: Navigate to each key screen and capture**

Use ADB to capture screenshots (or Android Studio Device Mirror):

```bash
# Helper: capture and pull a screenshot
capture_screen() {
  local name="$1"
  adb shell screencap -p /sdcard/${name}.png
  adb pull /sdcard/${name}.png regroup/mobile/fastlane/screenshots/android/${name}.png
  echo "Saved ${name}.png"
}

mkdir -p regroup/mobile/fastlane/screenshots/android

# 1. Landing/splash screen (before login)
capture_screen "01_landing"

# 2. Login screen (tap Sign In on the landing page first)
capture_screen "02_login"

# 3. Operator dashboard (log in as test-manager@rats-e2e.com if using E2E emulator)
# Navigate to house overview tab
capture_screen "03_operator_dashboard"

# 4. Guest/resident home screen
# Log in as a guest account and navigate to home
capture_screen "04_guest_home"
```

At minimum, capture screenshots 01 and 03 (landing + operator dashboard). More is better.

- [ ] **Step 3: Verify screenshot dimensions**

Play Store requires phone screenshots to be at least 320px wide and 16:9 or 9:16 aspect ratio. Verify:

```bash
file regroup/mobile/fastlane/screenshots/android/*.png
# Should show image dimensions like 1080x2400
```

If the emulator resolution is too small, resize the emulator window in Android Studio settings or use a higher-density skin.

- [ ] **Step 4: Commit screenshots**

```bash
git add regroup/mobile/fastlane/screenshots/android/
git commit -m "feat(android): add Play Store screenshots for submission"
```

---

## Task 10: Verify Play Store Metadata

The `fastlane/metadata/android/en-US/` directory has `title.txt`, `short_description.txt`, and `full_description.txt`. Verify all required fields are complete and within Play Store character limits.

**Files:**

- Verify/Modify: `regroup/mobile/fastlane/metadata/android/en-US/title.txt`
- Verify/Modify: `regroup/mobile/fastlane/metadata/android/en-US/short_description.txt`
- Verify/Modify: `regroup/mobile/fastlane/metadata/android/en-US/full_description.txt`

**Play Store character limits:**

- Title: 30 chars max
- Short description: 80 chars max
- Full description: 4000 chars max

- [ ] **Step 1: Check current content and lengths**

```bash
for f in regroup/mobile/fastlane/metadata/android/en-US/*.txt; do
  echo "=== $f ==="
  cat "$f"
  echo ""
  echo "Length: $(wc -c < "$f") chars"
  echo ""
done
```

- [ ] **Step 2: Verify title is ≤30 chars**

Current: "Regroup" — check:

```bash
wc -c < regroup/mobile/fastlane/metadata/android/en-US/title.txt
```

Expected: ≤30 (including newline).

- [ ] **Step 3: Verify short description is ≤80 chars**

Current: "Sober living house management for operators and residents."

```bash
wc -c < regroup/mobile/fastlane/metadata/android/en-US/short_description.txt
```

Expected: ≤80.

- [ ] **Step 4: Verify full description is ≤4000 chars and complete**

```bash
wc -c < regroup/mobile/fastlane/metadata/android/en-US/full_description.txt
```

Ensure the description includes:

- What the app does (for operators: manage guests, rent, Oxford governance)
- What guests can do (submit rent, view history, track sobriety)
- Privacy policy URL: `https://regroup-app.com/privacy-policy`

- [ ] **Step 5: Create release notes if missing**

```bash
mkdir -p regroup/mobile/fastlane/metadata/android/en-US/changelogs
cat > regroup/mobile/fastlane/metadata/android/en-US/changelogs/40.txt << 'EOF'
Initial release of Regroup — sober living house management for operators and residents. Manage guests, track rent, monitor accountability, and support Oxford House governance from your phone.
EOF
```

- [ ] **Step 6: Commit**

```bash
git add regroup/mobile/fastlane/metadata/
git commit -m "chore(android): verify and update Play Store metadata for launch"
```

---

## Task 11: Run Full Android E2E Smoke Verification

With Tasks 1–5 done (app name, minSdk, emulator seeding, password field, Android script), run the Android smoke test to confirm the end-to-end path works on Android before submission.

**Prerequisites:** Firebase emulators running (`./scripts/test-prep.sh` in a separate terminal), Android emulator booted, debug APK installed.

**Interfaces:**

- Consumes: all fixes from Tasks 3, 4, 5
- Produces: passing `maestro:smoke:android` run

- [ ] **Step 1: Start Firebase emulators in terminal A**

```bash
# From repo root, in a separate terminal:
./scripts/test-prep.sh
```

Wait for "Emulators started" and seeding complete.

- [ ] **Step 2: Start Metro in terminal B**

```bash
cd regroup/mobile
npx react-native start --reset-cache
```

- [ ] **Step 3: Install debug APK on Android emulator**

```bash
cd regroup/mobile
npm run android
```

Wait for the app to appear.

- [ ] **Step 4: Run the Android smoke test**

```bash
cd regroup/mobile
npm run maestro:smoke:android
```

Expected: `Flow completed` with no failures. The `initial-landing-screen` is visible.

- [ ] **Step 5: Run the Android login subflow**

```bash
cd regroup/mobile
maestro test -e APP_ID=com.regroup.app -e EMAIL=test-manager@rats-e2e.com \
  -e PASSWORD=TestPassword123! maestro/subflows/login.yaml
```

Expected: flow completes, `house-tab` visible.

- [ ] **Step 6: If login fails, get hierarchy for debugging**

```bash
maestro hierarchy
```

This dumps the current view hierarchy. Look for the actual identifier of the password field — use whatever label/id it shows to update `login.yaml`.

- [ ] **Step 7: Commit passing state**

```bash
git add regroup/mobile/maestro/
git commit -m "test(e2e): android smoke + login flow passing"
```

---

## Task 12: Submit to Play Store Internal Track

With a signed AAB (Task 8) and metadata (Task 10), submit to the Internal Testing track for final verification before promoting to production.

**Prerequisites:**

- Google Play Console account with Regroup app created
- Internal testers set up (at least your own account)
- Privacy policy live at `https://regroup-app.com/privacy-policy`
- Content rating questionnaire completed in Play Console

- [ ] **Step 1: Verify Play Console prerequisites**

In the Google Play Console (`play.google.com/console`):

1. App must exist with `applicationId = com.regroup.app`
2. App signing: use Google-managed signing (upload the AAB; Play signs the final APK)
3. Content rating: complete the IARC questionnaire (App > Policy > App content > Content rating)
4. Privacy policy: paste `https://regroup-app.com/privacy-policy` under Data safety
5. Target audience: 18+ (addiction recovery platform)

- [ ] **Step 2: Upload the AAB via Play Console web UI (simplest first approach)**

1. Go to Play Console > Regroup app > Release > Testing > Internal testing
2. Click "Create new release"
3. Upload `regroup/mobile/android/app/build/outputs/bundle/release/app-release.aab`
4. Add release notes: copy content from `fastlane/metadata/android/en-US/changelogs/40.txt`
5. Click "Save" then "Review release" then "Start rollout to Internal testing"

- [ ] **Step 3: Alternatively, use Fastlane supply (if Play Console service account is configured)**

```bash
cd regroup/mobile
bundle exec fastlane android metadata
```

Then upload manually or configure `supply` in the Fastlane lane with service account JSON.

- [ ] **Step 4: Verify internal testers can download and install**

Share the internal testing link with at least one tester (yourself). Verify:

- App installs on a real Android device
- Launches to landing screen
- Login flow works against production Firebase
- Operator dashboard loads correctly

- [ ] **Step 5: Promote to production when internal testing passes**

In Play Console: Internal testing > Release details > Promote to Production (or Closed/Open testing as intermediate step).

---

## Self-Review

### Spec Coverage Check

| Requirement                        | Task(s)    |
| ---------------------------------- | ---------- |
| App shows "Regroup" on Android     | Task 1     |
| Installs on Android 7+ devices     | Task 2     |
| E2E emulator seeding works         | Task 3     |
| E2E login works on Android         | Tasks 4, 5 |
| Signed release build verified      | Task 8     |
| Keystore credentials not hardcoded | Task 6     |
| Version 1.0.0 for launch           | Task 7     |
| Android screenshots for Play Store | Task 9     |
| Store listing complete             | Task 10    |
| Android smoke E2E passes           | Task 11    |
| Submitted to internal track        | Task 12    |

### Missing Items / Decisions Needed

1. **Digital Asset Links**: `android:autoVerify="true"` is in the manifest for `regroup-app.com`. If `/.well-known/assetlinks.json` is not published at that domain, deep links will fail silently on Android 6+. Verify this file exists at `https://regroup-app.com/.well-known/assetlinks.json`. If not, either remove `autoVerify="true"` or publish the file. Not blocking for Play Store submission itself, but breaks deferred deep linking.

2. **ProGuard/R8**: Currently disabled (`enableProguardInReleaseBuilds = false`). Acceptable for v1 launch — the AAB will be larger but it avoids shrinking/obfuscation bugs. Can enable post-launch with proper rules.

3. **Firebase Crashlytics classpath**: `build.gradle` still has `classpath 'com.google.firebase:firebase-crashlytics-gradle:2.5.2'` but Crashlytics was removed from call sites. This won't break the build but is dead dependency. Clean up post-launch.

4. **CI E2E workflow** (`regroup/mobile/.github/workflows/e2e-tests.yml`): Still references Detox, not Maestro. Should be updated post-launch to use `maestro:suite:android` (requires either Maestro Cloud or a macOS runner with the Android emulator). Out of scope for launch but creates a gap in CI coverage.

5. **Play Store account**: The plan assumes a Google Play Console account exists for `com.regroup.app`. If the app has never been submitted, you'll need to create it, accept the $25 developer fee, and fill out the store listing form manually before the Fastlane `supply` lane can upload.
