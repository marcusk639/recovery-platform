# App Store & Play Store Submission Automation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate App Store Connect and Play Store metadata upload, screenshot capture, and Android SDK version verification using Fastlane. Includes exact instructions for the steps Fastlane cannot automate (age rating, IDFA, Data Safety form).

**Architecture:** Fastlane at the repo root with a single `Fastfile` containing lanes for iOS (`deliver`) and Android (`supply`). Screenshots are captured via a dedicated Detox test that calls `device.takeScreenshot()` at key screens, then uploaded by Fastlane. Android already targets SDK 34 — no build.gradle change needed.

**Tech Stack:** Fastlane 2.x, Fastlane Deliver (App Store Connect API), Fastlane Supply (Google Play API), Detox (screenshot capture), React Native 0.72

> **⚠️ PREREQUISITE:** Complete `P0-C` (legal docs hosting) first. You need the live `https://regroup-app.com/privacy-policy` URL before running the `deliver` lane — App Store Connect requires it.

---

## File Structure

| Action | Path                                                    | Responsibility                                                   |
| ------ | ------------------------------------------------------- | ---------------------------------------------------------------- |
| Create | `fastlane/Fastfile`                                     | Lanes for iOS metadata/screenshots, Android metadata/screenshots |
| Create | `fastlane/Appfile`                                      | App identifiers (bundle ID, package name, Apple ID)              |
| Create | `fastlane/metadata/en-US/name.txt`                      | App Store app name                                               |
| Create | `fastlane/metadata/en-US/subtitle.txt`                  | App Store subtitle (30 chars max)                                |
| Create | `fastlane/metadata/en-US/description.txt`               | App Store full description                                       |
| Create | `fastlane/metadata/en-US/keywords.txt`                  | App Store keywords (100 chars)                                   |
| Create | `fastlane/metadata/en-US/release_notes.txt`             | What's New text                                                  |
| Create | `fastlane/metadata/en-US/privacy_url.txt`               | Privacy policy URL                                               |
| Create | `fastlane/metadata/android/en-US/title.txt`             | Play Store app name                                              |
| Create | `fastlane/metadata/android/en-US/short_description.txt` | Play Store short description                                     |
| Create | `fastlane/metadata/android/en-US/full_description.txt`  | Play Store full description                                      |
| Create | `e2e/screenshots.e2e.ts`                                | Detox test that captures screenshots at key screens              |
| Create | `fastlane/screenshots/`                                 | Directory where Detox saves screenshots                          |

---

## Task 1: Install Fastlane and Write Core Config Files

- [ ] **Step 1: Install Fastlane**

```bash
# macOS with Homebrew (recommended)
brew install fastlane

# Verify
fastlane --version
```

Expected: `fastlane 2.x.x`

- [ ] **Step 2: Create `fastlane/Appfile`**

Create `fastlane/Appfile`:

```ruby
# iOS
app_identifier("com.regroup.rats")  # Your iOS bundle ID — check ios/Regroup.xcodeproj or package.json
apple_id("marcusk639@gmail.com")
team_id("XXXXXXXXXX")  # Your Apple Developer Team ID — found at developer.apple.com/account

# Android
json_key_file("fastlane/google-play-key.json")  # Service account key for Play Console API
package_name("com.regroup.rats")  # Your Android package name — check android/app/build.gradle
```

> **Note:** Find your bundle ID:
>
> ```bash
> grep "PRODUCT_BUNDLE_IDENTIFIER" ios/Regroup.xcodeproj/project.pbxproj | head -1
> grep "applicationId" android/app/build.gradle
> ```

- [ ] **Step 3: Verify bundle IDs**

```bash
grep "PRODUCT_BUNDLE_IDENTIFIER" ios/Regroup.xcodeproj/project.pbxproj | head -1
grep "applicationId" android/app/build.gradle
```

Update `fastlane/Appfile` with the exact values.

- [ ] **Step 4: Create `fastlane/Fastfile`**

Create `fastlane/Fastfile`:

```ruby
default_platform(:ios)

platform :ios do
  desc "Upload metadata and screenshots to App Store Connect"
  lane :metadata do
    deliver(
      skip_binary_upload: true,
      skip_screenshots: false,
      screenshots_path: "./fastlane/screenshots/ios",
      metadata_path: "./fastlane/metadata",
      submit_for_review: false,
      force: true,
      privacy_url: "https://regroup-app.com/privacy-policy",
      overwrite_screenshots: true
    )
  end

  desc "Capture screenshots using Detox"
  lane :screenshots do
    # Build E2E app for simulator
    sh("cd .. && npm run test:e2e:build:ios 2>&1")

    # Run the screenshot Detox test
    sh("cd .. && npx detox test e2e/screenshots.e2e.ts --configuration ios.sim.debug --artifacts-location ./fastlane/screenshots/ios 2>&1")
  end
end

platform :android do
  desc "Upload metadata and screenshots to Play Store (internal track)"
  lane :metadata do
    supply(
      track: "internal",
      skip_upload_apk: true,
      skip_upload_aab: true,
      skip_upload_screenshots: false,
      screenshots_path: "./fastlane/screenshots/android",
      metadata_path: "./fastlane/metadata/android",
    )
  end

  desc "Capture screenshots using Detox on Android"
  lane :screenshots do
    sh("cd .. && npx detox test e2e/screenshots.e2e.ts --configuration android.emu.debug --artifacts-location ./fastlane/screenshots/android 2>&1")
  end
end
```

- [ ] **Step 5: Commit Fastlane scaffolding**

```bash
git add fastlane/Fastfile fastlane/Appfile
git commit -m "chore(fastlane): add Fastfile and Appfile for App Store + Play Store automation"
```

---

## Task 2: Write App Store Metadata Files

- [ ] **Step 1: Create the metadata directory structure**

```bash
mkdir -p fastlane/metadata/en-US
mkdir -p fastlane/metadata/android/en-US
mkdir -p fastlane/screenshots/ios
mkdir -p fastlane/screenshots/android
```

- [ ] **Step 2: Write iOS metadata files**

```bash
cat > fastlane/metadata/en-US/name.txt << 'EOF'
Regroup
EOF

cat > fastlane/metadata/en-US/subtitle.txt << 'EOF'
Sober Living House Management
EOF

cat > fastlane/metadata/en-US/keywords.txt << 'EOF'
sober living,recovery house,halfway house,sobriety,oxford house,house management
EOF

cat > fastlane/metadata/en-US/privacy_url.txt << 'EOF'
https://regroup-app.com/privacy-policy
EOF

cat > fastlane/metadata/en-US/release_notes.txt << 'EOF'
First release.
EOF
```

- [ ] **Step 3: Write the App Store description**

Create `fastlane/metadata/en-US/description.txt`:

```
Regroup is the all-in-one management platform for sober living house operators and residents.

FOR HOUSE OPERATORS:
• Manage residents and track sobriety milestones
• Record and monitor rent payments
• Track meeting attendance and house accountability
• Oxford House governance — officers, business meetings, voting, and EES tracking
• Discharge residents and import guest lists from CSV
• Export payment history and compliance reports

FOR RESIDENTS:
• Submit rent payments from your phone
• View your payment history and receipts
• Track your sobriety date and accountability milestones
• Apply to join a sober living house

Regroup was built by people in recovery, for people in recovery. We understand that running a sober living house is about more than paperwork — it's about helping people build a new life.

Privacy Policy: https://regroup-app.com/privacy-policy
Terms of Service: https://regroup-app.com/terms
```

- [ ] **Step 4: Write Android metadata files**

```bash
cat > fastlane/metadata/android/en-US/title.txt << 'EOF'
Regroup
EOF

cat > fastlane/metadata/android/en-US/short_description.txt << 'EOF'
Sober living house management for operators and residents.
EOF
```

Create `fastlane/metadata/android/en-US/full_description.txt` — copy the same content as the iOS description above.

- [ ] **Step 5: Commit metadata files**

```bash
git add fastlane/metadata/ fastlane/screenshots/
git commit -m "chore(fastlane): add App Store and Play Store metadata"
```

---

## Task 3: Capture Screenshots with Detox

- [ ] **Step 1: Write the screenshot Detox test**

Create `e2e/screenshots.e2e.ts`:

```typescript
import { device, element, by, expect as detoxExpect } from 'detox';

describe('App Store Screenshots', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  it('01 — Login screen', async () => {
    // App starts at login
    await device.takeScreenshot('01-login');
  });

  it('02 — House dashboard (operator)', async () => {
    // Log in as the E2E test operator
    await element(by.id('login-email-input')).typeText(
      'test-manager@rats-e2e.com',
    );
    await element(by.id('login-password-input')).typeText('TestPassword123!');
    await element(by.id('login-submit-button')).tap();
    await waitFor(element(by.id('house-overview-screen')))
      .toBeVisible()
      .withTimeout(8000);
    await device.takeScreenshot('02-house-dashboard');
  });

  it('03 — Guest profile', async () => {
    // Tap first guest in the list
    await element(by.id('guest-list-item')).atIndex(0).tap();
    await waitFor(element(by.id('guest-home-screen')))
      .toBeVisible()
      .withTimeout(5000);
    await device.takeScreenshot('03-guest-profile');
  });

  it('04 — Payment dashboard', async () => {
    await device.pressBack?.(); // Android only — iOS uses swipe back
    await element(by.id('nav-tab-house')).tap();
    await element(by.text('Payments')).tap();
    await waitFor(element(by.id('payment-dashboard-screen')))
      .toBeVisible()
      .withTimeout(5000);
    await device.takeScreenshot('04-payment-dashboard');
  });

  it('05 — Resident application form', async () => {
    await device.launchApp({ newInstance: true });
    // Navigate to HouseSearch → Apply
    await element(by.id('nav-house-search')).tap();
    await waitFor(element(by.id('house-search-screen')))
      .toBeVisible()
      .withTimeout(5000);
    await device.takeScreenshot('05-house-search');
  });
});
```

> **Note:** The `testID` values must match what exists in the running app. If a screen doesn't have a `testID`, open the component file and add one before running this test. Common fixes:
>
> - `src/screens/Login/LoginForm.tsx` — add `testID="login-email-input"` to email TextInput
> - `src/screens/HouseOverview/HouseOverview.tsx` — add `testID="house-overview-screen"` to root View

- [ ] **Step 2: Run the screenshot test on iOS simulator**

```bash
# Build E2E app first (only needed once per code change)
npm run test:e2e:build:ios

# Run screenshot test — screenshots saved to fastlane/screenshots/ios/
npx detox test e2e/screenshots.e2e.ts \
  --configuration ios.sim.debug \
  --artifacts-location ./fastlane/screenshots/ios \
  --take-screenshots all
```

Expected: Test runs, 5 `.png` files appear in `fastlane/screenshots/ios/`.

```bash
ls fastlane/screenshots/ios/
# Should show: 01-login.png, 02-house-dashboard.png, etc.
```

- [ ] **Step 3: Review screenshots**

Open each screenshot to confirm they look good for the App Store:

```bash
open fastlane/screenshots/ios/*.png
```

If a screenshot is blank or shows the wrong screen, fix the test and re-run. App Store Connect requires screenshots at specific sizes — the simulator outputs correct sizes if you use iPhone 15 Pro Max simulator (`6.9"`).

- [ ] **Step 4: Resize screenshots to required App Store dimensions**

App Store Connect requires at minimum:

- 6.9" display (iPhone 15 Pro Max): simulator at default size produces this
- 6.7" display (iPhone 14 Plus): if using iPhone 14 Plus simulator

Confirm your simulator name in `.detoxrc.js`:

```bash
grep "device\|simulator" .detoxrc.js | head -5
```

If the simulator is not `iPhone 15 Pro Max`, either change it in `.detoxrc.js` or resize using ImageMagick:

```bash
# Install ImageMagick if needed
brew install imagemagick

# Resize to 6.9" (1320 × 2868)
for f in fastlane/screenshots/ios/*.png; do
  convert "$f" -resize 1320x2868\! "$f"
done
```

- [ ] **Step 5: Commit the screenshot test**

```bash
git add e2e/screenshots.e2e.ts
git commit -m "test(e2e): add App Store screenshot capture test"
```

---

## Task 4: Set Up Play Console API and Upload Metadata

- [ ] **Step 1: Create a Google Play service account**

This is a one-time manual step in the Play Console:

1. Open [Play Console → Setup → API access](https://play.google.com/console/developers/api-access)
2. Click **Link to a Google Cloud project** (use the same GCP project as Firebase)
3. Click **View in Google Cloud Console**
4. In GCP Console → IAM → Service Accounts → **+ Create Service Account**
   - Name: `fastlane-supply`
   - Role: **Service Account User**
5. Create a JSON key for this service account and download it
6. Save to `fastlane/google-play-key.json` (this is gitignored — add it now if not already)

```bash
echo "fastlane/google-play-key.json" >> .gitignore
git add .gitignore
git commit -m "chore: gitignore Play Console service account key"
```

7. Back in Play Console → Setup → API access → find the service account → **Grant access**
   - Role: **Release manager** (minimum needed for `supply`)

- [ ] **Step 2: Verify `supply` can connect**

```bash
fastlane supply init --track internal
```

Expected: Fastlane connects to Play Console and prints existing store listing details. If this fails with an auth error, the service account permissions haven't propagated yet — wait 5 minutes and retry.

- [ ] **Step 3: Upload Android metadata**

```bash
fastlane android metadata
```

Expected: Fastlane uploads title, short description, and full description to the internal track.

- [ ] **Step 4: Verify in Play Console**

Open [Play Console → Main store listing](https://play.google.com/console). Confirm the title, short description, and full description show the Regroup content.

---

## Task 5: Upload iOS Metadata to App Store Connect

- [ ] **Step 1: Generate an App Store Connect API key**

This is a one-time manual step:

1. Open [App Store Connect → Users and Access → Keys](https://appstoreconnect.apple.com/access/integrations/api)
2. Click **+** to generate a new key
3. Name: `fastlane-deliver`, Role: **App Manager**
4. Download the `.p8` file (you can only download it once)
5. Note the **Key ID** and **Issuer ID** shown on the page

- [ ] **Step 2: Add API key to Fastlane**

Add to `fastlane/Appfile`:

```ruby
# App Store Connect API key (for CI/CD — no 2FA required)
api_key_path("fastlane/app-store-connect-key.p8")
```

Or set environment variables (preferred for CI):

```bash
export APP_STORE_CONNECT_API_KEY_ID="XXXXXXXXXX"
export APP_STORE_CONNECT_API_ISSUER_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
export APP_STORE_CONNECT_API_KEY_FILEPATH="fastlane/app-store-connect-key.p8"
```

Move the `.p8` file to `fastlane/`:

```bash
mv ~/Downloads/AuthKey_XXXXXXXXXX.p8 fastlane/app-store-connect-key.p8
echo "fastlane/app-store-connect-key.p8" >> .gitignore
git add .gitignore
git commit -m "chore: gitignore App Store Connect API key"
```

- [ ] **Step 3: Run the iOS metadata lane**

```bash
fastlane ios metadata
```

Expected: Fastlane uploads description, keywords, privacy URL, release notes, and screenshots to App Store Connect. If the app doesn't exist in App Store Connect yet, create it first (App Store Connect → + New App).

- [ ] **Step 4: Verify in App Store Connect**

Open [App Store Connect → Your App → App Store → iOS App → 1.0 Prepare for Submission](https://appstoreconnect.apple.com).

Confirm:

- Description matches `fastlane/metadata/en-US/description.txt`
- Keywords are set
- Screenshots are uploaded (5 images in the 6.9" slot)
- Privacy Policy URL field shows `https://regroup-app.com/privacy-policy`

---

## Manual Steps: What Fastlane Cannot Automate

These 4 steps require clicking through UI with no API available. Complete them in App Store Connect and Play Console directly after Task 5.

### M1: App Store Connect — Age Rating Questionnaire

**Where:** App Store Connect → Your App → App Store → Age Rating → Edit

Answer every question. For Regroup:

| Question                      | Answer          |
| ----------------------------- | --------------- |
| Unrestricted web access       | No              |
| Gambling                      | No              |
| Mature/suggestive themes      | None            |
| Medical/treatment information | Infrequent/Mild |
| Alcohol/tobacco references    | None            |
| Drug references               | None            |

Click **Done**. Rating will be assigned automatically (expected: 4+ or 12+).

### M2: App Store Connect — IDFA / ATT Disclosure

**Where:** App Store Connect → Your App → App Store → Advertising Identifier

First check:

```bash
grep -r "IDFA\|ATTrackingManager\|requestTrackingAuthorization\|AppTrackingTransparency" ios/ --include="*.m" --include="*.swift" --include="*.h"
```

- If nothing found: select **No, does not use IDFA**
- If Firebase Analytics uses IDFA: select **Yes** → check **"Attribute this app installation to a previously served advertisement"**

### M3: Play Console — Data Safety Form

**Where:** Play Console → Policy → App content → Data safety → Start questionnaire

No Fastlane API exists for this. Fill in manually:

| Data type                   | Collected | Shared with                | Purpose            |
| --------------------------- | --------- | -------------------------- | ------------------ |
| Name                        | Yes       | No third parties           | App functionality  |
| Email address               | Yes       | No third parties           | Account management |
| User IDs                    | Yes       | No third parties           | App functionality  |
| Financial info              | Yes       | Stripe (payment processor) | Payments           |
| Health info (sobriety date) | Yes       | No third parties           | App functionality  |
| Crash logs                  | Yes       | Sentry (crash reporting)   | Analytics          |
| App interactions            | Yes       | No third parties           | Analytics          |

Check both: **"Data is encrypted in transit"** and **"Users can request that data be deleted"**.

Click **Save → Submit**.

### M4: App Store Connect — App Review Notes and Demo Account

**Where:** App Store Connect → Your App → App Store → iOS App → App Review Information

1. **Sign-in required:** Yes
2. **Username:** `appreviewer@regroup-app.com` (create this account in Firebase Console first, set it up as an operator with a pre-populated house)
3. **Password:** (set a secure password, record it in your password manager)
4. **Notes:**

   ```
   Regroup is a B2B sober living house management tool. Two roles exist:
   Operator (house manager) and Resident.

   Log in with the provided credentials to access operator features:
   house dashboard, guest management, Oxford governance, and payment tracking.

   Resident features require creating a separate account and being added
   to the house by the operator. The subscription upgrade flow opens a
   WebView to regroup-app.com/my-account per App Store guideline §3.1.3(b).
   ```

---

## Self-Review

### Spec Coverage

| Requirement                             | Covered by                                       |
| --------------------------------------- | ------------------------------------------------ |
| App name, description, keywords         | Task 2 — metadata files                          |
| Privacy Policy URL in App Store Connect | Task 5 — `deliver` lane uploads it               |
| Screenshots (6.9", 6.7")                | Task 3 — Detox screenshot test                   |
| Age rating questionnaire                | Manual step M1                                   |
| IDFA disclosure                         | Manual step M2                                   |
| Play Store title, description           | Task 2 — Android metadata files                  |
| Play Store Data Safety form             | Manual step M3                                   |
| App Review notes + demo account         | Manual step M4                                   |
| Android targetSdkVersion 34             | Already set — `android/build.gradle` confirms 34 |

### Acceptance Criteria

- [ ] `fastlane ios metadata` completes without errors
- [ ] `fastlane android metadata` completes without errors
- [ ] App Store Connect shows no red warnings on the submission checklist
- [ ] 5 screenshots visible in the 6.9" slot in App Store Connect
- [ ] Play Console Data Safety form shows **Submitted** status
- [ ] Age rating assigned in App Store Connect
- [ ] App Review demo account created and tested (can log in and see a house)
