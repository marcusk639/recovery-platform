# App Store Launch — Manual Tasks Checklist

> **Date:** 2026-05-21
> **Author:** Claude Code (review before following)
> **Estimated time:** 20–30 hours total
> **Risk level:** High (steps P0-A involve irreversible git history rewrite; steps P0-B delete production data)

## Context

All engineering work is complete. The codebase is App Store–ready. What remains is 8 human-only tasks that cannot be scripted. Three are security-critical (leaked keys, test data in prod). Four are App Store submission requirements (legal docs, store metadata). One is an architecture decision (IAP vs. direct billing) that must be made before Stripe products are created.

**Nothing ships until all 8 are done. Complete them in the order listed — several have dependencies.**

---

## Prerequisites

Before starting, confirm:

- [ ] You have Owner access to the GCP project (for P0-A key rotation)
- [ ] You have admin access to Firebase Console (for P0-B cleanup)
- [ ] You have admin access to the Stripe Dashboard (for P0-E)
- [ ] You have an active Apple Developer account with App Store Connect access (for P0-G)
- [ ] You have a Google Play Console account (for P0-H)
- [ ] BFG Repo Cleaner is installed (`brew install bfg` or download from https://rtyley.github.io/bfg-repo-cleaner/)
- [ ] The git repo has no uncommitted changes before starting P0-A

---

## Steps

### P0-A: Rotate 3 Leaked Service Account Keys + Purge from Git History

> **Warning:** Step A.3 rewrites git history. All team members must re-clone the repo after this step. Coordinate before running.

**Where:** Google Cloud Console → IAM & Admin → Service Accounts, then terminal

**Why:** Three Firebase service account key files were committed to git history. Any attacker with repo read access can use these keys. Rotation + history purge eliminates the exposure.

---

**Step A.1: Identify the leaked key files**

Run from the repo root to find all committed `.json` credential files:

```bash
git log --all --full-history -- "**/*service-account*.json" "**/*firebase-adminsdk*.json" "**/*credentials*.json"
```

Note every filename that appears. You need this list for BFG.

**Expected result:** At least 3 filenames listed (the 3 leaked keys).

---

**Step A.2: Rotate each key in GCP Console**

For each leaked service account:

1. Go to [GCP Console → IAM & Admin → Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts)
2. Click the service account email that matches the leaked key file
3. Click the **Keys** tab
4. Find the key ID that matches the `private_key_id` field in the leaked JSON file
5. Click the three-dot menu → **Delete key**
6. Click **Add Key → Create new key → JSON** to generate a replacement
7. Download the new key file to a **secure location outside the repo** (e.g., `~/.secrets/`)

> **Warning:** Do not commit the new key files. Store them in a secrets manager or inject via environment variables only.

**Expected result:** Old key deleted, new key downloaded, app still functions with updated config.

---

**Step A.3: Purge leaked key files from git history with BFG**

> **Warning:** This rewrites every commit that touched the leaked files. Run on a fresh clone, not your working copy.

```bash
# 1. Make a fresh clone (mirror)
git clone --mirror git@github.com:<your-org>/rats-v2.git rats-v2-mirror

# 2. Run BFG to delete the files from all history
# Replace filenames with your actual leaked file names from Step A.1
bfg --delete-files "firebase-adminsdk-*.json" rats-v2-mirror
bfg --delete-files "service-account-*.json" rats-v2-mirror

# 3. Clean up and force-push
cd rats-v2-mirror
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push --force

# 4. All team members must re-clone:
# git clone git@github.com:<your-org>/rats-v2.git
```

**Expected result:** `git log --all --full-history -- "**/*service-account*.json"` returns nothing.

---

**Step A.4: Verify CI/CD still works**

Trigger a CI run after the force-push to confirm no pipeline references the deleted files.

**Expected result:** CI passes. Cloud Functions deploy successfully with updated service account.

---

### P0-B: Delete 4 E2E Test Accounts from Production Firebase

**Where:** Firebase Console → Authentication + Firestore

**Why:** Four test user accounts created during E2E test development live in the production Firebase project. They hold fake house data alongside real operator data. Apple and Google reviewers may inspect Firebase directly for test data contamination.

---

**Step B.1: Identify the 4 test accounts**

Check `e2e/` or `.detoxrc.js` for hardcoded test email addresses. They typically follow a pattern like:

```
test-operator@regroup-app.com
test-guest@regroup-app.com
e2e-admin@example.com
detox-test@regroup-app.com
```

Run a search:

```bash
grep -r "e2e\|detox\|test.*@" e2e/ .detoxrc.js 2>/dev/null | grep -i "email\|user"
```

**Expected result:** 4 email addresses identified.

---

**Step B.2: Delete from Firebase Auth**

1. Go to [Firebase Console → Authentication → Users](https://console.firebase.google.com)
2. Search for each test email address
3. Click the three-dot menu → **Delete account**

**Expected result:** All 4 accounts removed from the Users list.

---

**Step B.3: Delete corresponding Firestore test data**

For each deleted user, find and remove their associated documents:

1. Go to **Firestore → Data**
2. Open `guests` collection → find documents where `userId` matches the deleted UID
3. Delete each guest document and any subcollections
4. Open `houses` collection → find any test houses (look for names like "Test House", "Detox House", "E2E House")
5. Delete the test house documents

**Expected result:** No documents in `guests` or `houses` collections reference the deleted UIDs.

---

### P0-C: Host Privacy Policy and Terms of Service at Stable HTTPS URL

**Where:** Any static hosting (rats-web deployment, GitHub Pages, or Netlify/Vercel)

**Why:** App Store Connect and Play Console both require a publicly accessible URL for your privacy policy before submission. Apple also requires a ToS URL. The documents are written (`docs/PRIVACY_POLICY.md` and `docs/TERMS_OF_SERVICE.md`) — they just need a URL.

> **Note:** Do this step AFTER P0-D (HIPAA decision), because the HIPAA outcome may require adding a section to the Privacy Policy before publishing.

---

**Option A (recommended): Deploy to rats-web**

If rats-web is already deployed at `https://regroup-app.com`:

1. Copy `docs/PRIVACY_POLICY.md` → `rats-web/src/app/privacy/page.tsx` (or equivalent route)
2. Copy `docs/TERMS_OF_SERVICE.md` → `rats-web/src/app/terms/page.tsx`
3. Deploy: `npm run deploy` or push to trigger CI
4. Confirm URLs resolve:
   - `https://regroup-app.com/privacy`
   - `https://regroup-app.com/terms`

**Option B: GitHub Pages (faster)**

1. Enable GitHub Pages on the repo (Settings → Pages → Source: main branch, `/docs` folder)
2. Rename `docs/PRIVACY_POLICY.md` → `docs/privacy.md` and add frontmatter if needed
3. Confirm URL: `https://<your-org>.github.io/rats-v2/privacy`

**Expected result:** Both URLs return 200 with readable content. Test in an incognito window.

---

### P0-D: HIPAA Surface Decision

**Where:** Legal consultation (external)

**Why:** Sober living management involves health-adjacent data (sobriety dates, medication tracking, substance use history). Whether this triggers HIPAA Business Associate Agreement (BAA) requirements is a legal question, not an engineering one. Getting this wrong post-launch is a regulatory liability.

---

**Step D.1: Prepare the data inventory for your attorney**

Share this list with a healthcare attorney:

- Sobriety date (collected in intake form)
- Medication field in resident profile (if present)
- Meeting attendance records
- EES (Emergency Encumbrance System) records
- Drug test results (if the drug testing module is active)
- Payment history

**Question to ask:** "Does operating a sober living house management platform that stores this data require a BAA with our cloud providers (Google, Stripe)?"

---

**Step D.2: Act on the outcome**

| Outcome          | Action                                                                                |
| ---------------- | ------------------------------------------------------------------------------------- |
| BAA required     | Sign BAAs with Google Cloud and Stripe; add BAA section to Privacy Policy before P0-C |
| BAA not required | No action needed; proceed to P0-C                                                     |
| Uncertain        | Do not launch until clarified                                                         |

**Expected result:** Written legal opinion in hand. BAA signed if required.

---

### P0-E: Create Stripe Subscription Products

**Where:** [Stripe Dashboard → Product catalog](https://dashboard.stripe.com/products)

**Why:** The paywall is wired up in code and expects specific Stripe price IDs. Without the products created, no operator can subscribe.

> **Note:** Complete P0-F (IAP decision) before this step. If Apple requires IAP, the Stripe products are still needed for web-only billing, but the app may not be able to surface the upgrade CTA directly.

---

**Step E.1: Create the House subscription product**

1. Go to **Stripe Dashboard → Product catalog → + Add product**
2. Fill in:
   - **Name:** `Regroup House`
   - **Description:** `Monthly subscription for one sober living house`
3. Under **Pricing**, click **+ Add price**:
   - **Billing period:** Monthly
   - **Price:** `$49.00`
   - **Currency:** USD
4. Click **Save product**
5. Copy the **Price ID** (format: `price_xxxxxxxxxxxxxxxxxxxxxxxx`)

**Expected result:** Product appears in the catalog. Price ID copied.

---

**Step E.2: Create the Oxford House subscription product**

Repeat Step E.1 with:

- **Name:** `Regroup Oxford`
- **Description:** `Monthly subscription for Oxford House governance features`
- **Price:** `$79.00/month`

Copy the Price ID.

**Expected result:** Two products visible in the catalog with correct prices.

---

**Step E.3: Wire Price IDs into the app config**

Update the app's environment config (`.env` or Firebase Remote Config) with:

```
STRIPE_HOUSE_PRICE_ID=price_xxxxxxxxxxxxxxxxxxxxxxxx
STRIPE_OXFORD_PRICE_ID=price_xxxxxxxxxxxxxxxxxxxxxxxx
```

Also set these in the Cloud Functions environment:

```bash
firebase functions:config:set stripe.house_price_id="price_xxx" stripe.oxford_price_id="price_xxx"
```

**Expected result:** Subscription flow creates the correct Stripe subscription when an operator upgrades.

---

**Step E.4: Test with Stripe test mode first**

Before switching to live mode, run through the full subscription flow using a [Stripe test card](https://stripe.com/docs/testing#cards) (`4242 4242 4242 4242`). Confirm:

- Subscription creates in Stripe
- Webhook fires → house `subscriptionStatus` updates to `active`
- GracePeriodBanner disappears

**Expected result:** End-to-end subscription flow works in test mode.

---

### P0-F: IAP vs. Direct Billing Architecture Decision

**Where:** Architecture discussion (you + legal/Apple guidelines review)

**Why:** Apple's App Store guidelines require that digital goods and services sold _within_ an iOS app use Apple's In-App Purchase (IAP) system, with Apple taking a 15–30% cut. If operators subscribe through the app's native upgrade screen, that is IAP territory. If they subscribe only through the web (rats-web), direct Stripe billing is fine.

This is a business and legal decision, not an engineering one.

---

**Step F.1: Review Apple's current guidelines**

Read: [App Store Review Guidelines §3.1.1 — In-App Purchase](https://developer.apple.com/app-store/review/guidelines/#in-app-purchase)

Key question: Does the Regroup subscription give access to additional app functionality (yes), and is it sold within the app (depends on your UX)?

---

**Step F.2: Choose a path**

| Option                  | Description                                                                                                         | Apple cut | Engineering impact                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------- |
| **A: Web-only billing** | Upgrade CTA in app opens `SubscriptionHandler` WebView → regroup-app.com/subscribe. No native payment UI.           | 0%        | Already built. No changes needed. |
| **B: IAP**              | Native Apple payment sheet. Requires StoreKit 2 integration in the app and a separate product in App Store Connect. | 15–30%    | 2-3 weeks additional engineering. |
| **C: Hybrid**           | Free tier in app, paid upgrade only via web link (same as A).                                                       | 0%        | Same as A.                        |

**Recommendation:** Option A / C. The `SubscriptionHandler` WebView is already built and wired. Apple has historically allowed "reader apps" and B2B SaaS to link to external subscription pages. Sober living management is a B2B tool — operators subscribe, not end users making micropurchases.

**Step F.3: Document the decision**

Write 2-3 sentences in this document (or a separate ADR) recording what you chose and why. This protects you if Apple ever challenges the billing model during review.

**Expected result:** Decision recorded. If Option A: proceed directly to P0-E. If Option B: pause and plan StoreKit integration.

---

### P0-G: App Store Connect — Metadata and Submission Assets

**Where:** [App Store Connect](https://appstoreconnect.apple.com)

**Why:** Apple requires all metadata before review. Missing any field causes automatic rejection.

> **Note:** Complete P0-C before this step — you need the privacy policy URL.

---

**Step G.1: App Information**

Navigate to **My Apps → Regroup → App Information**:

- **Primary language:** English (U.S.)
- **Category:** Business (primary), Health & Fitness (secondary)
- **Content rights:** Confirm you own all content
- **Age rating:** Set via the age rating questionnaire (next step)

---

**Step G.2: Age Rating Questionnaire**

In **App Information → Age Rating**, click **Edit**. Answer:

- Unrestricted web access: No
- Gambling: No
- Mature/suggestive themes: None
- Medical/treatment information: Infrequent/Mild (sobriety tracking)
- Alcohol/tobacco references: None
- Drug references: None (sobriety management ≠ drug promotion)

**Expected result:** Rating assigned (likely 4+ or 12+).

---

**Step G.3: App Privacy — Privacy Policy URL**

In **App Information → App Privacy**:

- **Privacy Policy URL:** `https://regroup-app.com/privacy` (from P0-C)

---

**Step G.4: App Privacy — Data Types Questionnaire**

Click **Get Started** under Data Types. For each category, declare what Regroup collects:

| Data type        | Collected?       | Notes                       |
| ---------------- | ---------------- | --------------------------- |
| Name             | Yes              | Operator and resident names |
| Email address    | Yes              | Account login               |
| Phone number     | Yes              | Resident profile            |
| User ID          | Yes              | Firebase UID                |
| Payment info     | Yes (via Stripe) | Subscription billing        |
| Health & Fitness | Yes              | Sobriety date               |
| Location         | No               |                             |
| Contacts         | No               |                             |
| Browsing history | No               |                             |
| Usage data       | Yes              | Firebase Analytics          |
| Crash data       | Yes              | Sentry                      |

Mark all collected data as **"Not used for tracking"** (no cross-app tracking).

---

**Step G.5: App Description and Keywords**

In **Prepare for Submission → App Store → Description**:

Write a 4000-character (max) description. Suggested structure:

1. One-sentence value prop ("Regroup is the all-in-one management platform for sober living house operators.")
2. Key features for operators (3-5 bullets)
3. Key features for residents (2-3 bullets)
4. Closing trust statement

**Keywords** (100 characters max, comma-separated):

```
sober living,recovery house,halfway house,sobriety,addiction recovery,house management,oxford house
```

**What's New** (for v1.0): `First release.`

---

**Step G.6: Screenshots**

Required sizes for iPhone:

- **6.9" (iPhone 16 Pro Max):** 1320 × 2868 px — 3 screenshots minimum
- **6.7" (iPhone 14 Plus):** 1284 × 2778 px — 3 screenshots minimum

Required for iPad (if supporting iPad):

- **13" iPad Pro:** 2064 × 2752 px

Suggested screens to capture:

1. Dashboard / House overview
2. Guest profile / check-in
3. Oxford governance (if featuring this)
4. Payment dashboard

Use the iOS Simulator with `npm run ios` and take screenshots with `Cmd+S`.

---

**Step G.7: App Review Notes**

In **Prepare for Submission → App Review Information**:

- **Demo account:** Create a dedicated reviewer account (email + password). Do NOT use a real operator's account.
- **Notes:** Explain the two user roles:
  > "This is a B2B sober living house management app. Two roles exist: Operator (house manager) and Resident. To review operator features, log in with the provided credentials. Resident features require creating a separate account and being added to the house by an operator."
- **Attachment:** Optional — include a short screen-recording walkthrough.

---

**Step G.8: IDFA Disclosure**

In **Prepare for Submission → Advertising Identifier**:

- If Regroup does NOT use IDFA/ATT: Select **No, does not use IDFA**
- If Firebase Analytics uses IDFA: Select **Yes** and check the appropriate boxes

Check: `grep -r "IDFA\|ATTrackingManager\|requestTrackingAuthorization" ios/` to determine.

**Expected result:** All metadata fields complete. App ready for submission review.

---

### P0-H: Google Play Console — Metadata and Submission Assets

**Where:** [Google Play Console](https://play.google.com/console)

**Why:** Play Store has its own metadata and compliance requirements separate from Apple.

---

**Step H.1: Store Listing**

Navigate to **Your app → Store presence → Main store listing**:

- **App name:** Regroup
- **Short description:** (80 chars max) `Sober living house management for operators and residents`
- **Full description:** (4000 chars max) Same as App Store description, adapted
- **App icon:** 512 × 512 px PNG (no alpha)
- **Feature graphic:** 1024 × 500 px JPG or PNG (required — displayed at top of Play listing)

---

**Step H.2: Screenshots**

Required for Phone: minimum 2 screenshots at 16:9 or 9:16 ratio, 320–3840 px on any side.

Use same screens as App Store (H.6 above).

---

**Step H.3: Content Rating Questionnaire**

Navigate to **Policy → App content → Content rating → Start questionnaire**:

- Category: **Utility**
- Answer questions similarly to App Store (no violence, no gambling, medical/health content: yes)

**Expected result:** Rating assigned (likely Everyone or Everyone 10+).

---

**Step H.4: Data Safety Form**

Navigate to **Policy → App content → Data safety**:

This is Google's version of Apple's privacy questionnaire. Declare:

| Data type        | Collected           | Shared      | Purpose            |
| ---------------- | ------------------- | ----------- | ------------------ |
| Name             | Yes                 | No          | App functionality  |
| Email address    | Yes                 | No          | Account management |
| User IDs         | Yes                 | No          | App functionality  |
| Financial info   | Yes (via Stripe)    | Stripe only | Payments           |
| Health info      | Yes (sobriety date) | No          | App functionality  |
| Crash logs       | Yes                 | Sentry      | Analytics          |
| App interactions | Yes                 | No          | Analytics          |

Mark: **Data is encrypted in transit** (Firebase/HTTPS). **Users can request deletion** (add this to your Privacy Policy if not already present).

---

**Step H.5: Target API Level (API 34)**

Confirm the Android build targets API 34:

```bash
grep "targetSdkVersion\|compileSdkVersion" android/app/build.gradle
```

If below 34, update `android/app/build.gradle`:

```gradle
android {
    compileSdkVersion 34
    defaultConfig {
        targetSdkVersion 34
    }
}
```

Then rebuild: `npm run android` and fix any deprecation warnings.

**Expected result:** `targetSdkVersion 34` in build.gradle. App builds and runs on Android 14.

---

**Step H.6: Permissions Declaration**

Review `android/app/src/main/AndroidManifest.xml` for all `<uses-permission>` declarations. For each permission, Play requires a justification. Check for:

- `CAMERA` — if present, justify (photo evidence for chores?)
- `READ_EXTERNAL_STORAGE` / `WRITE_EXTERNAL_STORAGE` — justify (CSV import/export)
- `RECEIVE_BOOT_COMPLETED` — justify if present
- `POST_NOTIFICATIONS` — required for push notifications (Android 13+)

Remove any permissions not actually used.

**Expected result:** All permissions in manifest are justified and actually used.

---

## Verification

After completing all steps:

- [ ] `git log --all --full-history -- "**/*service-account*.json"` returns nothing
- [ ] Firebase Console shows 0 E2E test accounts
- [ ] `https://regroup-app.com/privacy` returns your Privacy Policy (200 OK, in incognito)
- [ ] `https://regroup-app.com/terms` returns your Terms of Service (200 OK, in incognito)
- [ ] Stripe Dashboard shows 2 products: Regroup House ($49/mo) and Regroup Oxford ($79/mo)
- [ ] End-to-end subscription flow works in Stripe test mode
- [ ] App Store Connect shows no red warnings in the submission checklist
- [ ] Play Console Data Safety form shows **Submitted** status
- [ ] Android `targetSdkVersion` is 34
- [ ] A demo App Review account exists and can log into the app

---

## Rollback

| Step                           | Reversible? | Notes                                                                                              |
| ------------------------------ | ----------- | -------------------------------------------------------------------------------------------------- |
| P0-A: BFG git history rewrite  | **NO**      | Coordinate with all team members first. The force-push cannot be undone once pushed.               |
| P0-A: Key rotation             | Partially   | Old key is gone; new key can be re-rotated if needed                                               |
| P0-B: Delete Firebase accounts | **NO**      | Deleted Firebase Auth accounts cannot be recovered. Verify UIDs are test accounts before deleting. |
| P0-C: Host legal docs          | Yes         | Update or unpublish at any time                                                                    |
| P0-E: Stripe products          | Yes         | Products can be archived, not deleted                                                              |
| P0-G/H: Store metadata         | Yes         | All metadata can be updated before and after submission                                            |

---

## Notes & Gotchas

- **BFG requires a mirror clone** — running it on your working copy can corrupt the repo. Always use `git clone --mirror`.
- **Force-push coordination** — after P0-A, every team member must `git fetch --all` and reset their local branch, or re-clone. Warn them in advance.
- **Stripe test mode vs. live mode** — create products in test mode first, verify the full flow, then recreate in live mode. Test and live price IDs are different.
- **App Review demo account** — do not use a real operator's account. Create a dedicated reviewer account with a house pre-populated with sample data.
- **Play Feature Graphic is not optional** — many developers miss this. Without it, the app cannot be published.
- **Privacy Policy must be accessible without login** — Apple and Google will check that the URL works without authentication. Test in incognito.
- **IAP grace period** — if you choose Option A (web-only billing), some reviewers may flag the missing in-app upgrade path. Prepare a response explaining the B2B SaaS exemption.
- **HIPAA outcome affects Privacy Policy** — complete P0-D before finalizing and hosting P0-C, or you may need to update a live URL.
