# Go-Live, Revenue Optimization & Growth Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Homegroups to real users, optimize every layer of the revenue funnel, and execute the first growth push targeting 30 claimed+paid groups within 60 days.

**Architecture:** This plan combines code tasks (infrastructure hardening, Stripe key validation, analytics events), manual actions (App Store submission, Firebase Console config, Stripe Dashboard config), and field work (intergroup meetings, pilot outreach). Phases 1 and 2 can run in parallel — long lead-time manual actions (App Store) should start immediately alongside the code work.

**Tech Stack:** React Native (iOS/Android), React web, Firebase (Auth, Hosting, Functions, FCM), Stripe, App Store Connect, Google Play Console

---

## Prerequisites — Complete These Plans First

Before running any task in this plan, the following plans must be complete:

- [ ] `2026-05-26-fix-fictional-bios.md` — D-11: About page fictional bios (FTC risk)
- [ ] `2026-05-26-fix-legal-pages.md` — D-12: Privacy/Terms placeholder content (legal exposure)
- [ ] `2026-05-26-document-v44-feature-flags.md` — D-1: Feature flag docs (stakeholder clarity)

---

## Phase 0: Deploy Code Fixes to Production

Once the above plans are complete, deploy the accumulated changes.

- [ ] **Step 0.1: Verify no placeholder content remains**

```bash
# Check for any remaining fictional names or placeholder addresses
grep -rn "James Wilson\|Sarah Chen\|Michael Davis\|123 Recovery Way\|January 1, 2023" \
  web/src/pages/AboutPage.js \
  web/src/pages/PrivacyPage.js \
  web/src/pages/TermsPage.js
```

Expected: no output (all placeholders removed).

- [ ] **Step 0.2: Run the full web test suite**

```bash
cd web
CI=true npm test --watchAll=false
```

Expected: all suites PASS.

- [ ] **Step 0.3: Build and deploy**

```bash
cd web && npm run build
cd ..
firebase deploy --only hosting
```

Expected: `Deploy complete!`

- [ ] **Step 0.4: Verify live pages**

Open in incognito:

- [ ] `/about` — no fictional bios visible
- [ ] `/privacy` — real date and address in contact section
- [ ] `/terms` — real date and address in contact section

---

## Phase 1: Infrastructure Verification (Manual — Start Immediately)

These are non-code actions with the longest lead times. Start them today, in parallel with any code work.

### Task 1.1: Stripe production key

**Why this matters:** If `REACT_APP_STRIPE_PUBLISHABLE_KEY` is unset or set to the test placeholder `pk_test_your_publishable_key`, every visitor to `/subscribe` sees a broken checkout. Revenue is zero until this is fixed.

- [ ] Open the deployed web app in a browser DevTools → Network tab → filter for `stripe.com`
- [ ] Identify which publishable key is being sent in requests to Stripe
  - If `pk_test_your_publishable_key` → the env var was never set. Go to your Firebase Hosting build environment and set `REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_live_...`, then redeploy
  - If `pk_test_...` (real test key) → switch to the live key and redeploy
  - If `pk_live_...` → confirmed, move on

**Harden the code (one-time code change):**

In `web/src/pages/SubscribePage.js`, find the Stripe key initialization (around line 17). Replace the silent fallback pattern with a hard fail at build time:

```javascript
// Before (silent failure):
const stripePromise = loadStripe(
  process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY ||
    "pk_test_your_publishable_key",
);

// After (loud failure — catches misconfig at build, not at user checkout):
const stripeKey = process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY;
if (!stripeKey || stripeKey === "pk_test_your_publishable_key") {
  throw new Error(
    "REACT_APP_STRIPE_PUBLISHABLE_KEY is not configured. Set it in the build environment.",
  );
}
const stripePromise = loadStripe(stripeKey);
```

Commit this change:

```bash
git add web/src/pages/SubscribePage.js
git commit -m "fix(web): throw at build time if Stripe publishable key is missing or placeholder"
```

### Task 1.2: Firebase Auth — Authorized Domains

**Why this matters:** Google OAuth fails silently ("popup closed") for any domain not on the authorized list. Users trying to sign in via Google on the deployed domain get no error and no session.

- [ ] Open: https://console.firebase.google.com/project/recovery-connect-cad4b/authentication/settings
- [ ] Scroll to "Authorized domains"
- [ ] Confirm these are listed:
  - `recovery-connect-cad4b.web.app`
  - `recovery-connect-cad4b.firebaseapp.com`
  - `localhost`
- [ ] If using a custom domain (e.g. `homegroups-app.com`), add it now

### Task 1.3: Email sender configuration

**Why this matters:** Firebase sends verification emails from `noreply@recovery-connect-cad4b.firebaseapp.com` — a domain Gmail frequently routes to Spam. Lost verification = lost conversion.

- [ ] Open: Firebase Console → Authentication → Templates → Email address verification
- [ ] Customize "From" name to `Homegroups`
- [ ] Send a test verification email to a Gmail account — verify it lands in **Inbox**, not Spam
- [ ] If it lands in Spam: configure a custom email sender domain via Firebase (requires SPF/DKIM DNS records on your sending domain — see Firebase docs for "Custom email action handler")

### Task 1.4: RATS_API_KEY

**Why this matters:** The `getMeetingAttendance` HTTP endpoint returns `401` without this secret, blocking the rats-v2 sober-living integration.

- [ ] Generate a cryptographically random key:
  ```bash
  openssl rand -hex 32
  ```
- [ ] If using this for rats-v2: update rats-v2 to use the new key
- [ ] Upload to Firebase Secret Manager:
  ```bash
  firebase use recovery-connect-cad4b
  printf '%s' "YOUR_KEY_HERE" | firebase functions:secrets:set RATS_API_KEY --data-file=-
  firebase functions:secrets:access RATS_API_KEY
  ```
- [ ] In `functions/src/index.ts`, uncomment `RATS_API_KEY` in the `setGlobalOptions({ secrets: [...] })` block (search for `RATS_API_KEY` — it's currently commented out)
- [ ] Deploy functions:
  ```bash
  cd functions && npm run build && cd ..
  firebase deploy --only functions
  ```

### Task 1.5: Intergroup Stripe prices (unblocks B2B revenue)

**Why this matters:** The `createIntergroup` callable (treatment center + intergroup checkout) requires both `productIdIntergroupA` (`STRIPE_PRODUCT_ID_INTERGROUP_A`) and `productIdIntergroupB` (`STRIPE_PRODUCT_ID_INTERGROUP_B`) to have default prices set in the Stripe Dashboard. Without them, intergroup/treatment-center checkout fails for every customer.

- [ ] In Stripe Dashboard → Products: confirm `productIdIntergroupA` exists with a default price (tier A = up to 10 groups)
- [ ] Confirm `productIdIntergroupB` exists with a default price (tier B = unlimited, `maxGroups: 9999`)
- [ ] If either product is missing a default price: open the product → Pricing → set a default price
- [ ] Test by manually calling `createIntergroup` via the Firebase emulator with a test Stripe key

---

## Phase 2: App Store Submission (Manual — Start Immediately)

Apple review takes 1–7 days; rejection resets the clock. This is the longest lead-time action and must start now.

### Task 2.1: iOS App Store submission

- [ ] Open App Store Connect: https://appstoreconnect.apple.com
- [ ] Check the current submission status
- [ ] If NOT submitted yet:
  1. Build a release archive from Xcode (`Product → Archive`)
  2. Upload via Xcode Organizer or `xcrun altool`
  3. Fill in metadata: name "Homegroups", subtitle (≤30 chars), keywords (see ASO section below), description
  4. Add at least 3 screenshots per device size (6.7", 6.1", iPad — required)
  5. Set age rating to 12+ (references to alcohol/substance recovery)
  6. Submit for review
- [ ] When approved: copy the numeric App Store ID from the URL (`apps.apple.com/app/id[NUMBER]`)
- [ ] Update `web/src/lib/deepLinks.js:9` — replace `id0000000000` with the real App Store ID:
  ```javascript
  // Before:
  export const APP_STORE_URL = "https://apps.apple.com/app/id0000000000";
  // After (example):
  export const APP_STORE_URL = "https://apps.apple.com/app/id1234567890";
  ```
  ```bash
  git add web/src/lib/deepLinks.js
  git commit -m "fix(web): update App Store URL with real app ID"
  firebase deploy --only hosting
  ```

### Task 2.2: Google Play submission

- [ ] Open Google Play Console: https://play.google.com/console
- [ ] Check current submission status
- [ ] If NOT submitted: build a release APK/AAB (`cd mobile && npx react-native build-android --mode release`), upload to Play Console internal track, fill metadata, submit for review
- [ ] When approved: confirm the Play Store URL is correct in `deepLinks.js`

### Task 2.3: App Store Optimization (ASO)

The app name, subtitle, and keyword field in App Store Connect are indexed for search. These are the highest-ROI growth levers that require zero ongoing effort once set.

**Recommended keywords** (100 char limit in the keyword field, comma-separated):

```
AA meeting,NA meeting,12 step,homegroup,sobriety,recovery,treasurer,secretary,anonymity,sober
```

**App title:** `Homegroups — 12-Step App` (or just `Homegroups`)

**Subtitle** (≤30 chars): `Tools for recovery homegroups`

**Description opening hook** (first 255 chars shown before "more"):

```
Manage your 12-step homegroup: treasury tracking, meeting management, secretary tools, announcements, and sponsor connections — built with anonymity and recovery traditions at the core.
```

**Screenshots priority order:**

1. Treasury handoff screen (most differentiated feature — treasurers will recognize the pain immediately)
2. Meeting attendance + QR check-in
3. Group announcements
4. Member directory (privacy-first)
5. Trial/subscription prompt (shows it's free to start)

---

## Phase 3: End-to-End Flow Test

No automated test covers the full user journey from incognito browser to paying admin. Every friction point you find would have cost a real user.

- [ ] **Step 3.1: Web claim flow (Google auth)**
  1. Open https://recovery-connect-cad4b.web.app in **incognito**
  2. Find an unclaimed group (use `node scripts/pickSampleGroups.js` or pick from the browse page)
  3. Click "Claim this group"
  4. Sign in with **Google** (first pass)
  5. Complete Stripe checkout with a real card ($12 to yourself via the Stripe Dashboard refund)
  6. Verify `isClaimed: true` on the group document in Firestore Console
  7. Write down every friction point — confusing copy, slow load, missing state, unclear errors

- [ ] **Step 3.2: Web claim flow (email/password auth)**
      Repeat Step 3.1 but sign in via email/password instead of Google. This path is less tested.

- [ ] **Step 3.3: Mobile confirmation flow**
  1. Open the mobile app (iOS or Android)
  2. Log in with the same account used in Step 3.1
  3. Confirm the group appears in your admin list
  4. Tap into the group — confirm admin controls are visible
  5. Test treasury → create a transaction, categorize it, export a report

- [ ] **Step 3.4: Document all friction points**

Create `docs/LAUNCH_FRICTION.md` with every issue found. Each entry:

```
## Issue: [one-line description]
**Step:** [which step above]
**What happened:** [exact behavior]
**Expected:** [what should happen]
**Priority:** P0 / P1 / P2
```

- [ ] **Step 3.5: Fix all P0 friction issues before proceeding**

A P0 issue is anything that blocks a real user from completing the funnel (broken checkout, missing confirmation email, incorrect admin state, app crash).

---

## Phase 4: Revenue Optimization

These changes maximize conversion and retention from every user who reaches the app.

### Task 4.1: Add Firebase Analytics conversion events

Currently there are no analytics events tracking the subscription funnel. Without them, you cannot measure conversion rate or identify where users drop off.

**Files to modify:** `mobile/src/screens/subscription/SubscriptionScreen.tsx` (or wherever the subscription prompt is shown) and `web/src/pages/SubscribePage.js`

- [ ] **Step 4.1.1: Add analytics to the mobile subscription flow**

In `mobile/src/screens/subscription/SubscriptionScreen.tsx` (or the relevant subscription prompt screen):

```typescript
import analytics from "@react-native-firebase/analytics";

// On screen mount (trial start moment):
useEffect(() => {
  analytics().logEvent("subscription_view", {
    source: "trial_prompt", // or wherever this screen is reached from
  });
}, []);

// On "Subscribe" button tap:
const handleSubscribeTap = async () => {
  await analytics().logEvent("subscription_attempt", {
    price_usd: 12,
    billing_period: "annual",
  });
  // ... existing checkout logic
};

// On confirmed subscription (after Stripe webhook sets isClaimed):
// This fires in the success callback or when Redux detects subscription active
await analytics().logEvent("subscription_complete", {
  price_usd: 12,
  billing_period: "annual",
  method: "stripe",
});
```

- [ ] **Step 4.1.2: Add analytics to the web claim/subscribe flow**

In `web/src/pages/SubscribePage.js` or `ClaimGroupPage.js`, add equivalent `gtag` or Firebase Analytics calls:

```javascript
import { getAnalytics, logEvent } from "firebase/analytics";
// (import analytics instance from wherever your app initializes it)

// On reaching the subscription page:
logEvent(analytics, "subscription_view", { source: "claim_flow" });

// On clicking "Start Free Trial":
logEvent(analytics, "subscription_attempt", {
  price_usd: 12,
  billing_period: "annual",
});

// On successful Stripe redirect return:
logEvent(analytics, "subscription_complete", {
  price_usd: 12,
  billing_period: "annual",
});
```

- [ ] **Step 4.1.3: View events in Firebase Console after 24h**

Open: https://console.firebase.google.com/project/recovery-connect-cad4b/analytics/events

Confirm `subscription_view`, `subscription_attempt`, `subscription_complete` appear.

### Task 4.2: Optimize the subscription upsell moment

The current gating model shows a subscription prompt when an admin hits a gated feature. The highest-conversion moment is **immediately after the admin completes their first treasury handoff** — they've just experienced the core value proposition.

- [ ] Find the treasury handoff success screen or completion callback in `mobile/src/screens/homegroup/TreasuryHandoffScreen.tsx` (or equivalent)
- [ ] After a successful handoff, show a non-blocking inline prompt:
  ```
  "You just completed your first treasurer handoff with Homegroups.
   Keep it going — subscribe for $12/year to unlock annual reports,
   trend analysis, and unlimited handoff history."
  [Start Free Trial]  [Maybe Later]
  ```
- [ ] The "Maybe Later" dismisses and sets a flag in AsyncStorage so it doesn't show again for 7 days

### Task 4.3: Verify FCM trial-conversion messages fire correctly

FCM trial conversion messages were built in May 2026. Verify they work end-to-end before relying on them for revenue.

- [ ] Start a trial on a test account (complete the Stripe checkout — gives you a 7-day trial)
- [ ] Confirm the FCM message arrives on day 5 of the trial (the "your trial ends in 2 days" reminder)
- [ ] If not: check `functions/src/triggers/pubsub/` for the trial-expiry scheduler and verify it's deployed and the Pub/Sub topic is configured

### Task 4.4: Verify renewal reminder messages fire

The year-end summary trigger (built May 2026) fires in November. Can't test timing, but can test the callable:

```bash
# From Firebase Console → Functions → Shell, or via emulator:
firebase functions:shell
# Then invoke the scheduled function directly to verify it produces valid FCM payloads
```

### Task 4.5: Set up intergroup pricing in Stripe Dashboard

This unblocks the B2B revenue path (treatment centers + intergroups). See Task 1.5 above. Once prices exist:

- [ ] Manually test the treatment center checkout flow: call `createIntergroup` with `type: "treatment_center"` via the Firebase Functions emulator
- [ ] Verify the Stripe Checkout session is created and the redirect URL matches the allow-list in `functions/src/callable/createIntergroup.ts` (`ALLOWED_REDIRECT_ORIGINS`)

---

## Phase 5: Growth Execution

### Track 5A: Intergroup Meeting Presence (highest-leverage, start this week)

Each intergroup meeting room contains 5–20 GSRs, each representing a homegroup. One demo per room = 5–20 potential paid admins. No other channel has this density.

- [ ] **Step 5A.1: Find intergroup meetings in your metro area**
  - AA: Search `[city] AA intergroup` — most publish public meeting schedules
  - NA: Search `[city] NA area service committee`
  - Look for "GSR meeting" or "group representatives meeting" — these are the right rooms

- [ ] **Step 5A.2: Attend 3 meetings in 2 weeks**

  At each meeting:
  1. Introduce yourself as a member of the community who built a tool for homegroups
  2. Ask the chair for 3 minutes to show something useful for treasurers/secretaries
  3. Demo: open the group's public page (`https://recovery-connect-cad4b.web.app/groups/[hash]`), show the treasury handoff screen, walk through the QR check-in
  4. Leave a card or share the web URL — do not pressure
  5. Follow up within 48h with a personal email to any admin who showed interest

- [ ] **Step 5A.3: Record every conversation**

  After each meeting, add a row to a tracking spreadsheet:

  ```
  Date | Meeting | Contact name | Group name | Interest level | Follow-up sent | Status
  ```

### Track 5B: Direct Email Outreach (run in parallel with 5A)

The scraped group database contains contact info for group admins/secretaries. Personal emails (not blasts) convert. 3% response to a cold email is good; 15%+ to a personalized email mentioning their specific group is achievable.

- [ ] **Step 5B.1: Pull a target list**

  ```bash
  node scripts/pickSampleGroups.js
  ```

  Select 50 groups that have: (a) a listed email/website, (b) are not already claimed, (c) are in your metro or a metro you can follow up personally.

- [ ] **Step 5B.2: Write a personal email template**

  Subject: `Free tool for [Group Name] treasurers`

  ```
  Hi [name or "friend"],

  I'm Marcus, a member of the recovery community who built Homegroups —
  a free app for 12-step homegroup secretaries and treasurers.

  I found your group ([Group Name], [City]) in the meeting directory and
  thought you might like to see what your group's page looks like:
  [direct link to their public group page]

  The app handles treasury tracking, meeting minutes, and treasurer
  handoffs — no more shoebox of receipts. It's free to try for 7 days,
  $12/year after that.

  If you're not the right person for this, feel free to ignore. If you
  are — I'd love to hear what your group actually needs.

  In service,
  Marcus
  ```

- [ ] **Step 5B.3: Send 10 emails per day, 5 days per week**

  Manually personalize each one (insert the group name, city, and direct link). Track in the same spreadsheet as Track 5A.

- [ ] **Step 5B.4: Call every admin who activates within 48 hours**

  When you get a new signup, call them within 48 hours. Ask: "What made you sign up? What's your group's biggest headache?" These conversations shape the product and produce testimonials.

### Track 5C: App Store Optimization (ongoing — 15 minutes/month)

- [ ] After submission, monitor rankings for target keywords in App Store Connect → Analytics → Search Terms
- [ ] After accumulating 10 installs: personally ask each early user for a review (direct message, not in-app prompt yet)
- [ ] At 25 reviews: submit an in-app review prompt via `react-native-rate` or the native `StoreReview` API

### Track 5D: SEO Timing (set a reminder)

- [ ] Create a calendar reminder: "Flip noindex on unclaimed group pages when claimed count hits 100"
- [ ] The code change is one line in `web/src/components/GroupPageHead.js` — remove the `noindex` meta tag from unclaimed group pages
- [ ] At 100 claimed groups, the 62K scraped pages begin accruing search value for queries like `"[city] [fellowship] homegroup"` — these are intent-rich long-tail searches by members looking for their local group

### Track 5E: Treatment Center B2B Outreach (start after 30 groups are claimed)

Treatment centers are the highest-ACV customer. A single treatment center pays for a tier that covers unlimited affiliated groups and generates structured alumni-engagement data. The Facility Dashboard and compliance export are already built.

- [ ] After the app is live and 30 consumer groups are claimed, prepare a one-page pitch deck:
  - Problem: tracking alumni outcomes requires manual calls and paper logs
  - Solution: Homegroups + Facility Dashboard gives automated engagement metrics (attendance %, sobriety milestone rates, anonymous opt-in data)
  - Proof: show the FacilityDashboardPage with sample data
  - Price: contact for pricing (anchor on value, not cost)

- [ ] Target list: SAMHSA treatment locator (`findtreatment.gov`) filtered to residential facilities in your metro. Each facility has a program director — that's the buyer.

- [ ] First outreach goal: 3 discovery calls. Discovery call goal: understand their current alumni tracking process. Do not pitch in the first call.

---

## Phase 6: 60-Day Milestone Targets

| Week | Target                                                                 |
| ---- | ---------------------------------------------------------------------- |
| 1    | D-11/D-12/D-1 deployed; Stripe key confirmed live; App Store submitted |
| 2    | App live in App Store; end-to-end flow tested; 10 outreach emails sent |
| 3–4  | 3 intergroup meetings attended; 30 outreach emails sent                |
| 5–6  | First 10 active groups; first 5 paying admins                          |
| 7–8  | 30 claimed groups; FCM conversion data in Firebase Analytics           |
| 10   | Flip noindex if 100 groups claimed                                     |
| 12   | First B2B discovery call (treatment center)                            |

---

## Revenue Model Reference

| Tier                                | Price                         | Current status    |
| ----------------------------------- | ----------------------------- | ----------------- |
| Group admin                         | $12/year                      | ✅ Live           |
| Intergroup tier A (up to 10 groups) | TBD — set in Stripe Dashboard | 🚩 Prices not set |
| Intergroup tier B (unlimited)       | TBD — set in Stripe Dashboard | 🚩 Prices not set |
| Treatment center                    | TBD — set in Stripe Dashboard | 🚩 Prices not set |

**Break-even:** ~500 groups at $12/year = $6K ARR
**Sustainable:** 2,000 groups = $24K ARR
**Ceiling (consumer only):** 5,000 groups = $60K ARR
**B2B upside:** 10 treatment centers at $500/year = $5K ARR; scales independently

**Revenue ceiling insight:** The consumer model has a natural ceiling (~5K groups in English-speaking AA/NA worldwide who would pay $12/year). The B2B path (treatment centers, sober living homes, intergroup offices) has no comparable ceiling and a much higher ACV. The goal of the 60-day consumer push is to build the social proof (testimonials, group count, retention data) needed to close B2B deals.
