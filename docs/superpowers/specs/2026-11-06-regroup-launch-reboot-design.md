# Regroup launch reboot: design

- **Date:** 2026-11-06
- **Owner:** Marcus Klein
- **Status:** approved by the owner 2026-11-06, after three plan reviews (the last two by independent reviewers)
- **Scope:** `regroup/mobile`, `regroup/functions`, and `regroup/web` where it touches billing or mobile
- **Related:** PR #160 (React Native 0.88.1 upgrade), its decision record `regroup/mobile/docs/build/react-native-0.88-upgrade.md`, `regroup/docs/go-to-market/roadmap.md` (RG-RM-8 to RG-RM-10)

## 1. Intent

Regroup relaunches as a reboot of the whole app. The relaunch has to run on React Native 0.88.1 (PR #160), and **every existing feature has to work** on iOS and Android. The owner wants it **as soon as possible**. There is no hard date.

Two pieces of work are tied together. Testing every feature end to end is also how we prove the RN upgrade is complete. PR #160 merges early, once the app is at parity with today (§4.4), so all later work happens on one RN version. Nothing reaches users until the release, and **the release is gated on the full end-to-end suite passing on both platforms**. That run is the evidence that the upgrade is complete.

The houses that use Regroup today come along: **their accounts and data carry over**. The owner tells them about the changes. Nobody is actively using the current store build (§3.4), so we don't keep today's behaviour or today's build working for compatibility's sake, but no existing data may be lost or stranded.

## 2. Goals, non-goals, anti-goals

### Goals

1. **Every existing feature works**, for every role (signed out, operator, manager, resident, Oxford House), on iOS and Android.
   - "Existing" includes features that are built but half-wired. They get finished, not removed. See §4.2.
2. **The billing round trip works end to end**, from web checkout through Stripe and webhooks to the mobile paywall and back.
   - The web app is in scope wherever billing touches mobile.
   - Invitation emails and app links are in scope too, because they are how users get into the app.
3. **An automated end-to-end suite proves goals 1 and 2:**
   - A Maestro flow for every feature and role.
   - Playwright tests for the web billing journeys.
   - Billing round trips run against staging with the Stripe sandbox.
   - After launch, the suite stays as the regression guard.
4. **Existing data carries over.**
   - Fixes that change stored data ship with a tested backfill.
   - Existing operators who come back move onto the tiers through the normal checkout. Nobody pays today (§3.4), so there's no live billing migration to run.
5. **Live Stripe Price IDs are created** as needed (RG-RM-8; the owner asked for this) and loaded into the production deploy config (§4.1 item 3).
6. **PR #160 merges early, at parity** (§4.4): Task 17 is done (gate revert, whole-branch verify-diff, label, final review), and so is the owner's device pass.

### Non-goals

- Deleting dead code that nothing reaches (§4.2 lists it). Deleting it is fine if a fix needs to touch it, but it is not part of this work.
- Web pages that touch neither billing nor mobile.
- Owner-only business launch tasks: store listings, Stripe Connect platform activation in live mode (§3.4), the hosted privacy policy and terms of service, the HIPAA decision, the in-app-purchase decision, key rotations, and deleting the E2E accounts from production Auth. The owner does these in parallel. They are listed here so nobody mistakes them for done.
- New features, and redesigns of existing ones. "Completing" a half-built feature means wiring and finishing what is already designed and coded, not reinventing it.

### Anti-goals (these would count as failure even if everything else were met)

- **Losing or stranding live data.** That includes a resident who can't see their payment history, an operator whose house falls behind the paywall by mistake, and documents that stop opening.
- **A green suite that proves nothing.** That means flows whose key steps are optional, or seed data that hides bugs. The current seeder already hides the billing bug (§3.2). Optional steps are only acceptable for genuinely environment-dependent UI such as OS permission prompts.
- **Charging the wrong amount, or locking out a paying customer.** On the money path, a wrong answer is worse than a loud failure.
- **Bloating the upgrade PR.** PR #160 stays about the upgrade. It merges at parity, and every feature and bug fix lands afterwards on `main`, in its own PR.
- **An irreversible production step without a recovery path.** Every backfill, cancellation, deploy and gate change in this work has the recovery step §6.1 gives it, done before the step itself.

## 3. Current state (evidence as of 2026-11-06)

All paths are in the upgrade worktree (branch `chore/regroup-rn-upgrade`, `6d6da55a`, up to date with `main`). Claims marked **verified** were checked against the code by the author of this doc. Claims marked **reported** come from explorer passes and must be verified before anyone fixes them.

### 3.1 RN 0.88.1 upgrade (PR #160, draft)

- **Done:** Tasks 1–16, and the simulator/emulator part of the Mac checkpoint.
- **CI:** green except the test-tamper gate. That gate stays red by design until Task 17, because of 3 owner-approved icon snapshots.
- **Remaining:** the owner's device pass (decision record §7.3) and Task 17.

### 3.2 Billing round trip: broken

1. **Verified: webhook house updates match no houses created through the normal path.**
   - `createHouses` writes `adminIds: [ctx.adminId]`, a random `createAdminId()` admin-record id (`functions/src/houses/houseInput.ts:111`, `createHousesTx.ts:130-139`). The uid goes only into `ownerId`/`superAdminId`.
   - `updateHouseSubscriptionStatus` queries `adminIds array-contains operatorUid` / `adminId == operatorUid` (`functions/src/webhooks/stripeWebhook.ts:247-253`).
   - So `subscriptionStatus` and `guestGraceEndsAt` never update after a house is created.
   - The Maestro seeder hides this by writing `adminId = uid`, and the webhook test mocks `adminIds: [uid]`.
   - **A redeploy won't repair what was missed.** When the lookup finds nothing, it logs "no houses found" (`stripeWebhook.ts:261`) and the event is still marked done (`claimEvent`, `:1341`). Stripe doesn't redeliver it, so the backfill has to cover every house the webhook missed.
   - A lookup that matches already exists: `updateHouseStatuses` (`functions/src/api/firestore.ts:142`) queries `superAdminIds`.
2. **Verified: no webhook updates `users.subscriptionMetadata.status`.**
   - `updateUserSubscriptionStatus` (`functions/src/api/firestore.ts:151`) has no callers.
   - So `createHouses`' entitlement check and the house-create trigger stamp from a stale status. An operator who cancels in the portal can still create houses that count as paid. Reactivation also misbehaves, and the web my-account page shows a stale status.
3. **Verified: the `paywall/config` kill switch can't work.** `mobile/firebase/firestore.rules` has no `paywall` match, so the mobile read is denied and the hook fails closed. Nothing writes the doc either.
4. **Reported:**
   - Operators get no billing push notifications: `subscriptions/*.houseId` is `""`, so `sendFcmToHouseAdmins("")` throws and the error is swallowed.
   - Mobile and server disagree on the resident grace period. The server grants grace only while `past_due`. Mobile grants it for any lapsed status, `subscription.deleted` doesn't clear it, and every retry resets it.
   - WebView signup never logs the user in automatically: web posts `{event,email}`, but mobile needs a password too.
   - Checkout on the tier path stores no `currentPeriodEnd`.
   - `setOxfordEnabled` doesn't update `subscriptionMetadata.houseType`.
   - If `TIER_BILLING_ENABLED` is not `"true"`, checkout silently falls back to the legacy subscription shape.
   - Residents and non-owner admins may fail `useOxfordGate`, because it reads the signed-in user's own `oxfordEnabled`, and only the operator's doc is written.
   - Failed-checkout cleanup leaves an orphan `users` doc, because the client delete is denied by the rules.
   - `SignUpWebView.tsx:25` and `SubscriptionHandler.tsx:23` hardcode `https://regroup-app.com` instead of reading `RATS_WEB_URL`.
   - Stripe portal and Elements behaviour inside the WebView is unclear.
   - Unhandled webhook events: `customer.subscription.created`, `trial_will_end`, `invoice.payment_action_required`.
   - Trial length: the code uses 7 days (`functions/src/api/stripe.ts:15`); the pricing plan said 30 (P-5). **Settled by the owner: 7 days.** The code stays, and the docs that said 30 were corrected on 2026-11-06.
5. **Verified: two screens state the wrong trial length.** The server gives 7 days on both checkout paths (`stripe.ts:132`, `:162`), and the web order summary says 7 (`order-summary.component.ts:4`). But the mobile Oxford dashboard says "Start 14-Day Free Trial" (`mobile/src/screens/Oxford/OxfordDashboard.tsx:218`), and the web marketing page says "30-day free trial" (`web/src/app/components/work/work.component.html:22`). Telling customers the wrong free period is a money-path defect. Both get fixed in A1 by reading the single source in §4.1 item 1.
6. **Live prices: half there (verified against live Stripe, read-only, 2026-11-06).** This corrects the roadmap's RG-RM-8, which said none existed.
   - **The six monthly tier prices exist in live mode** at the right amounts: Traditional $69/$129/$249 and Oxford $49/$89/$299, on the products "Regroup — Traditional Sober Living" and "Regroup — Oxford Houses", with no trial on the Price. Their IDs are in the tracked `regroup/scripts/stripe-prices.env` ("live mode, created 2026-06-20") and in `scripts/stripe-product-values.md`.
   - **Two more active sets of the same six monthly prices also exist** (`price_1Ti67…` and `price_1TkbH…`), so each tier has three live prices.
   - **No annual live prices exist.** The file's annual IDs are test-mode, as its own header says.
   - **The file's legacy `STRIPE_HOUSE_PRICE_ID` / `STRIPE_OXFORD_PRICE_ID` are not live IDs.** The live legacy prices are `plan_HFkfwM5lQ…` ($10 Home) and `plan_HFkh7QvRn…` ($1 Resident).
   - **There is no live Customer Portal configuration.**
   - The emulator env is generated without price IDs, so `createOperatorSubscription` throws there.
7. **Verified: the price IDs and `TIER_BILLING_ENABLED` are deploy config, not secrets.**
   - They live in `functions/.env.<projectId>`, which is bundled into the deploy and read through `process.env` (`callable/subscriptions.ts:205`). Secret Manager holds only the Stripe keys.
   - That file is gitignored (`functions/.gitignore:15-18`), so a deploy from a fresh worktree, which §6 requires, ships without it.
   - The billing preflight only warns about missing config until billing is live (`scripts/preflight-billing.js`), so checkout would silently fall back to the legacy shape (item 4).

### 3.3 Broken or half-built mobile features

**Verified:**

- **Operators can never add a house.** "Add Home" is disabled unless `state.admin.userAsAdmin.superAdmin` (`mobile/src/screens/Personal/Personal.tsx:347`), and `setUserAsAdmin` is never dispatched. **12 non-test files** read the same always-null `userAsAdmin`, so their admin behaviour needs checking too: Personal, ActivityScreen, Disputes, HouseChat, BaseChat, DirectChat, EditUserInfoForm, the title-bar button, the house setup wizard, and the `useHouseSetupWizard` and `useBaseActivityScreen` hooks.
- **Tapping an Oxford business meeting fails.** `BusinessMeetings.tsx:109` navigates to `'BusinessMeetingDetail'`, which is not registered. `BusinessMeetingDetail.tsx` exists.
- **Screens registered but never opened:**
  - `Apply` and `ApplicationStatus`. The in-app application is never submitted, so the operator's Applications list can only show applications created by some other means, and nothing currently creates them.
  - `GuestImport` (CSV import).
  - `BalanceDashboard`.
- **Deep-link config is never used.** `navigation/linking.ts` is not passed to `<NavigationContainer>` (`mobile/index.js:57`), and its prefix `regroup://` doesn't match the registered schemes (`regroup-app`, `com.rats.dev`). Only invitation links work, via `services/native-deep-links.ts`.

**Reported:**

- **Invitation email links dead-end (now verified, 2026-11-06).**
  - `invitations.ts:81` builds `regroup-app://?type=invitation&token=…`. `inviteEmails.ts:43-51` rewrites it to `com.rats.dev://` and wraps it in `https://regroup-app.com/redirect?url=…`.
  - The web has a `RedirectComponent` (`web/src/app/components/redirect/redirect.component.ts`), but no route registers it, so the link never reaches the app.
- **URL schemes as registered (verified):**
  - **Both platforms:** `regroup-app://`; `com.rats.dev://`, which on iOS is the Release bundle ID and which the Android manifest labels "Debug scheme for testing"; and `https://regroup-app.com` app links (iOS `applinks:regroup-app.com`, Android `autoVerify`).
  - **iOS also has leftovers:**
    - a stray `example` scheme in `Info.plist`;
    - `applinks:cleanhouse.page.link`, a Firebase Dynamic Links domain. Google shut Dynamic Links down in August 2025.
  - **`linking.ts` uses `regroup://`,** which no platform registers.
  - **Nothing outside the invitation path depends on `com.rats.dev://`.** Google Sign-In uses its own reversed-client-ID scheme.
- There's no `apple-app-site-association` or `assetlinks.json`, so universal links can't verify.
- Residents see the DrugTesting, ResidentIntake and Applications links on HouseSummary, and those screens don't check the role. Only the rules stop a resident.
- `PaymentWebView` and `ManagerIntro` are registered but never opened.

### 3.4 Live billing today (read from Stripe live mode, 2026-11-06)

Account `acct_1GfryQKsstp3aqoP` (regroup-app.com) has 34 subscriptions, all on the legacy $10/home + $1/resident prices:

- **1 active and paying:** $11/month, on a house named "Test House" (`c0HS61N5zfgaeDVT5TAm`). The owner confirmed it is his own test account.
- **6 active at $0:** operators who signed up and never created a house (`orgSetupCompleted: false`, empty `subscriptionMetadata.houses`, quantity 0). Created between 2024-03 and 2025-12.
- **27 canceled.** The last one was canceled on 2026-09-08 (2 homes + 9 residents). These older subscriptions carry no `metadata.userId`, so they link to users only by `customerId`.

**There are no paying customers.** The roadmap's "5 live houses" (RG-RM-10) is out of date.

Firestore shows 20 non-demo houses as `subscriptionStatus: active` across 12 owners. Only the test owner has a live subscription, so the other 19 are stale. That is a live instance of bug 1 in §3.2.

Stripe Connect has **0 connected accounts** in live mode. In the last 90 days there were 3 successful charges, $33 in total, all the owner's $11 test subscription and none with a destination. No rent moves through Regroup today.

**Connect is not activated in live mode** (verified 2026-11-06, read-only):

- The platform account itself is fully active: charges, payouts and `transfers` are active, and details are submitted.
- A live Connect webhook endpoint (`handleStripeConnectWebhook`, subscribed to `account.updated`) exists.
- But the v2 accounts API refuses with `non_connect_platform_accounts_v2_access_blocked` and points to Connect platform setup (`dashboard.stripe.com/<account>/settings/connect/platform-setup`).
- The code creates house accounts as controller-configured Express accounts with the platform liable for losses (`util/connectAccountLifecycle.ts:34-48`), or through v2 (`:89`). Both need Connect activated.
- **So no operator can connect a payout account in production today.**
- The e2e sandbox does have Connect (2 connected accounts, v2 open), so the staging rent flows can run.

**Nobody is using the current build** (Firebase Auth, `phoenix-cleanhouse`, read 2026-11-06 as counts only):

- 137 accounts have an email or phone number. Measured by last token refresh, which also counts people who stay signed in, **0 were active in the last 30 days**, 2 in the last 60, and 8 in the last 180.
- The other 5,725 accounts are anonymous: no email, phone or password. 264 of them were active in the last 30 days.
  - 246 were created in one 37-minute window, 2026-10-26 19:44–20:21 UTC. That is the same hour the staging Stripe sandbox was being set up.
  - **The source is the mobile app** (verified). It signs in anonymously on every launch without a signed-in user (`mobile/src/screens/Splash/Splash.tsx:173`), and again after every logout (`state/slices/userSlice.ts:128`). The web's `anonymouslyLogin` has no callers.
  - So every fresh install, `clearState` launch and logout creates an anonymous account in whichever project the build points at. That explains the 5,725 built up over the years.
  - **Production-pointed builds have been driven by test tooling (verified 2026-11-06).** This breaks §6 ("nothing in the suite touches production"), so the guard in §4.3 comes first (§5 step 1).
    - **Locally:** `~/.maestro/tests/2026-10-26_152429` and `_152717` (20:24 and 20:27 UTC, minutes after the 246-account window) ran a `deeplink-probe` flow with `appId=com.rats.dev`. That is the iOS bundle that signs into production. Logs inside the window weren't kept, so the burst itself is attributed, not proven.
    - **The suite's own docs invite this.** `maestro/flows/smoke.yaml`'s header says to run it with `APP_ID=com.rats.dev` (iOS) or `com.regroup.app` (Android), both production builds.
    - **In CI, on every PR:** the "Maestro Cloud — smoke tests (regroup Android)" job (`.github/workflows/ci.yml` ~286-327) builds `assembleDebug`. That APK's `google-services.json` is `phoenix-cleanhouse`.
      - It runs `e2e-maestro/regroup/login-and-view-dashboard.yaml`, which uses `clearState: true` and logs in as `operator@example.com` with the e2e password.
      - The flow declares `appId: com.rats.dev`, while the debug APK is `com.regroup.app`, so it may not even launch.
      - The step is `continue-on-error`, so CI shows it green either way. Whether it has been writing to production can't be told from the repo.

Firestore point-in-time recovery was off on both projects. **The owner had it turned on for `phoenix-cleanhouse` on 2026-11-06** (7-day retention, so the full window exists from 2026-11-13). Staging stays off, and delete protection is off on both. The settings and restore steps are in `regroup/docs/operations/data-recovery.md`.

### 3.5 Test coverage

- **Maestro:** 16 suite flows. 6 pass on iOS (`smoke`, `signup`, `guest-home`, `guest-activity-dispute`, `guest-rent-history`, `operator-manual-payment`).
  - Most of the failures are in the flows themselves: no scroll to off-screen elements, logging out from a pushed screen, and iOS merging row labels.
  - `operator-setup-wizard` fails because of the Add Home bug.
  - `operator-applications` and `oxford-onboarding` fail on missing or contrary seed data.
  - Several passing flows are weak. `guest-activity-dispute` makes the long-press and submit optional, and `signup` never checks where signup lands.
- **Feature areas with no flow:** invitations; beds; issues and complaints; drug testing; documents; staff notes; house chat and direct messages; notifications inbox and preferences; Stripe Connect; the subscription gate (all states); discharge; intake; meeting search and check-in; logging meds/work/supporter; chore photo evidence; profile edit and avatar; delete account; 2FA; compliance PDF; payment CSV and receipts; Oxford officers, EES, business meetings, voting and treasury; manager promote/demote; admin report.
- **Web:** Karma specs exist for the pricing, signup, billing-info and tier-picker components, but **CI runs none of them** (it only type-checks the web app). There are no browser E2E tests; the only one is the Protractor scaffold.
- **Functions:** Jest tests with everything mocked. The Stripe CLI scripts (`stripe:listen`, `stripe:trigger:*`, `stripe:scenario:*`) target the production project path.
- **Staging (`regroup-e2e`), verified 2026-11-06: half-built, and no round trip has ever run.**
  - **Exists:**
    - 58 deployed functions.
    - Webhook endpoints on the e2e Stripe sandbox `acct_1UUsyi44OQke4tKl`, plus tooling in `regroup/e2e/`.
    - Build variants: iOS `E2EStaging` / scheme `rats-e2e-staging`; Android `e2eStaging`, with app IDs `com.rats.dev.e2e.stg` and `com.regroup.app.e2e.stg`.
    - Their gitignored Firebase configs in `~/.config/regroup-e2e/`. The project and bundle IDs are correct.
  - **Missing:**
    - No staging app has ever been built on the owner's Mac: there is no `E2EStaging` product in DerivedData and no `e2eStaging` APK.
    - Staging has **no account anyone can sign in with**: 83 users, none with a password, and 0 houses. The seeder refuses every project that isn't `demo-`, by design.
    - **No web app is deployed** to staging. The hosting site `regroup-e2e.web.app` exists, but `/`, `/pricing` and `/signup` all return 404, so web checkout has nowhere to run.
    - The variants were written on RN 0.72 (#143) and have not been built on 0.88.
    - **The web can't be deployed to staging safely yet** (verified).
      - The browser build has an `e2e-staging` configuration, but the server-render (SSR) target in `web/angular.json` has only `production`.
      - `build:ssr` hardcodes `ng run sapp:server:production`, and hosting sends `**` to the `ssr` function (`web/firebase.json`).
      - A staging deploy would serve pages rendered from the production environment.

The feature inventory this coverage is measured against is Appendix A.

## 4. What gets built

There are four workstreams, A to D. §5 gives the order they're worked in.

### 4.1 Workstream A: the billing round trip

Make billing correct end to end, then prove it.

1. **Fix every verified billing defect in §3.2.** Verify each reported one first; fix it if it's real.
   - **The house lookup:** the webhook must find an operator's houses by the field `createHouses` actually writes the uid to. A field that holds a uid is preferable to the admin-record id.
   - **The user status:** webhooks update `users.subscriptionMetadata.status`, plus the period end, tier and houseType where they change.
   - **The grace period (owner decision):** 7 days from the first failed payment, for everyone. During it, the operator and residents keep access and see the grace banner. When it ends, the operator and residents are blocked. Retries that fail later don't restart it. A payment that succeeds ends it. When Stripe stops retrying and cancels, access ends. Stripe's live retry and dunning settings are aligned with this. Server (`entitlement.ts`) and mobile (`useSubscriptionGate.ts`) share this single definition, tested on both sides.
   - **The paywall kill switch:** it either works (a rules match, plus a documented way to set it) or it is removed from mobile. Builder's choice, but mobile and server must agree.
   - **One source for prices and the trial length (owner decision).** These are business decisions, the same in every environment, so they are **not** env vars. Changing one is a PR, with its docs updated and a deploy. Env vars stay for what really differs per environment: the Stripe Price IDs and keys.
     - **The charged amount** lives on the Stripe Price.
       - `SUBSCRIPTION_TIERS[...].amountCents` in `functions/src/config.ts` stays, for display.
       - A test checks it against the Stripe Prices: the sandbox prices in the suite, and the live ones as a launch step (§5 step 8) before they're loaded.
     - **The trial length** is the server constant `TRIAL_PERIOD_DAYS` (`functions/src/api/stripe.ts:15`), and nothing else defines it.
     - **Web and mobile read both from the server** through the existing public callable `getTierCatalog` (`functions/src/callable/getTierCatalog.ts:128`). They hardcode none of it.
       - It already returns each tier's availability, and amounts read from the Stripe Price (`unit_amount`, cached for an hour).
       - It gains one field, the trial days from `TRIAL_PERIOD_DAYS`. No new endpoint is built.
       - The web already uses it (`web/src/app/services/subscriptions/tier-catalog.service.ts`). Mobile doesn't call it yet and starts to.
       - That replaces the web's `TRIAL_DAYS` (`order-summary.component.ts:4`), the "14-Day" and "30-day" copy (§3.2 item 5), and any price literals in pricing pages or the paywall.
       - Marketing copy that can't call the endpoint, such as static pages, either says "free trial" without a number or is checked by a test against `TRIAL_PERIOD_DAYS`.
     - If the catalog can't be reached, or it returns no price for an interval (it already does that for a missing env var or a failed Stripe lookup), clients show no price or trial number rather than a stale one.
2. **Backfill.** Any stored shape that changes (house admin fields, `subscriptions.houseId`, user subscription status) gets a one-time script.
   - It runs as a dry run by default, is idempotent, and logs counts and changed document IDs with no PII.
   - **The existing script can't be reused as-is** (verified). `functions/src/scripts/migrateHouseSubscriptionStatus.ts` writes unless `--dry-run` is passed (`:53`), and it derives status from `users.subscriptionMetadata`, which is stale (§3.2 item 2). New scripts flip that default, and take status from Stripe live state, not from Firestore.
   - It covers every house the webhook missed (§3.2 item 1), since no redelivery will.
   - It is tested against the legacy fixture (§4.3) before it runs against production, and §6.1's export is taken before every production run.
   - **One rule for every existing house (owner decision, replacing "hold lapsed houses active"):** at launch, every house without a live tier subscription is **plan required**.
     - Its data is untouched. The operator signs in, sees the plan-required screen, and buys a tier through the normal checkout (item 6).
     - **Residents keep read-only access to their own data (owner decision).** While their house is plan required, or past grace, a resident can still open their own payment history (receipts and CSV export included) and their own documents. Everything else shows the blocked screen.
       - Today `SubscriptionGate` replaces the whole app (`mobile/src/components/subscription/SubscriptionGate.tsx:82-87`), so the gate gains this limited view.
       - The same applies to any lapsed house, which keeps the §2 anti-goal as written. Each state gets coverage-matrix rows.
     - That covers the 19 stale-active houses, houses with no `subscriptionStatus`, and the test house.
     - Before the launch backfill runs, the builder re-reads Stripe live state (read-only) and shows the owner the list. The owner may name houses to keep active; the backfill leaves those alone. No comp feature is built: an exception is a name on that list and nothing more.
     - Before launch nothing changes for these houses. The house-lookup fix and the user-status fix must not flip them, since they have no live tier subscription to act on.
     - The comment at `entitlement.ts:46-54`, "the relaunch starts every account from scratch", is wrong under this design and gets corrected.
   - **No compatibility with the current store build (owner decision, replacing the earlier default).** Nobody has used it in 30 days (§3.4), so production changes don't have to keep it working, and backfills rewrite stored shapes in place.
     - The reboot ships with a **minimum-version gate**: the app reads a required version from the server and tells older builds to update. It fails open and is server-controlled (§6.1).
     - Today's build predates the gate, so it can't be told to update. It may simply break against the new backend. That is accepted, and the owner's notice to the houses tells them to update.
3. **Live Stripe prices (RG-RM-8): finish what exists** (§3.2 item 6). The owner has authorized live-mode price work.
   - **Monthly prices: keep the six that exist,** the set in `stripe-prices.env`.
   - **Archive the two duplicate active sets** after the owner confirms the list, so the Portal and any price lookup see one price per tier. Archiving can be undone by reactivating the price.
   - **Annual prices: create six,** at monthly × 10, on the same two products. That is the revision plan's "2 months free", matching its examples ($490/yr, $1,290/yr).
     - `config.ts` has no annual amounts today. The ×10 multiplier, or the annual amounts, are written into `SUBSCRIPTION_TIERS`, so the amount test can check them.
   - **No trial on any Price.** The trial comes only from `TRIAL_PERIOD_DAYS` at subscription creation (item 1), and the existing live prices have none.
   - Oxford Network stays `availableForSale: false`. Its annual price is created anyway so the env var resolves.
   - **Sandbox first, live last.** The matching sandbox prices on the e2e sandbox come early, because the staging round trips need them. `~/.config/regroup-e2e/stripe-e2e-prices.json` may already hold them, so check it against this list.
   - **The live annual prices are created at launch** (§5 step 8), not before. Before any live change, the builder shows the owner the full list (keep / archive / create, with product, amount and interval) and gets a yes.
   - **`regroup/scripts/stripe-prices.env` becomes the one reviewed list of live price IDs** (doc author's call). Price IDs aren't secrets, the file is already tracked, and changes to it get reviewed in PRs.
     - The PR that does this corrects its wrong legacy IDs and its test-mode annual lines, along with `scripts/stripe-product-values.md` and the go-live runbook lines that point at it.
     - The production deploy config is built from this list.
   - **The IDs reach the functions through the production deploy config,** not Secret Manager (§3.2 item 7): `functions/.env.phoenix-cleanhouse`, under the env var names in `config.ts`, together with `TIER_BILLING_ENABLED=true`.
     - That file is gitignored because it may also hold other deploy settings. Its canonical copy lives outside the repo, mode 600, like the staging config in `~/.config/regroup-e2e/`. It is copied into the worktree before every production functions deploy, and its price lines must match `stripe-prices.env`.
     - **`preflight-billing.js --strict` is a by-hand readiness check, not a deploy hook.** The script's own header (`:36-44`) explains why: under `--strict` a secret it can't read is also fatal, and reading it needs an IAM permission deployers don't otherwise have. It runs before every production functions deploy in §5 step 8. Its config check must pass; a secret-access warning is resolved by someone with that permission confirming the secret exists.
4. **Retire legacy billing (replaces RG-RM-10).** With no paying customers (§3.4), there is nothing to migrate, so the D-9 protected-pricing terms apply to nobody. The steps:
   - **The 7 active legacy subscriptions** (6 at $0, plus the owner's test) are canceled at launch, after the owner confirms the list the builder shows him. Nobody's charges change, because none of them pays. Cancellation can't be undone, so §6.1's record is written first.
     - **Cancel before the backfill, not after** (verified). Stripe's deletion webhook runs `handleSubscriptionDeleted` (`stripeWebhook.ts:1019`). Once the house-lookup fix is live, it writes `canceled` to the operator's houses (`:1058`), which would overwrite the backfill's plan-required value. So the cancellations run first and the backfill second (§5 step 10).
     - The same handler pushes "Your Regroup subscription has been canceled… Contact support to reactivate" to the operator (`:1052`). For these launch cancellations the builder suppresses that push, by marking the cancellation (for example in its metadata) and skipping the message. The owner's notice explains the change instead.
   - **Returning operators** sign in with their data intact and buy a tier through the normal (link-out) checkout. The paywall shows them the plan-required screen until they do (item 2's rule).
   - **No houses keep the legacy rent fee.** `LEGACY_RENT_FEE_HOUSE_IDS` stays empty, and every house uses the method-aware `RENT_FEE`.
   - **The legacy subscription code path stays** in this work. Nothing needs it after the cancellations, but removing it is cleanup (a non-goal) and becomes a post-launch follow-up.
   - **The founder discount** (D-9's lifetime 20–30% coupon) is not created, since there are no founding customers to reward. The owner can reinstate it as a launch promotion.
   - The owner tells the existing operators beforehand.
5. **Wire the web unit tests into CI** for `regroup/web`, so the existing billing specs actually guard something.
6. **Operator checkout and plan management open in the system browser (owner decision).** Apple rejects payment collected inside an in-app WebView but allows linking out (`docs/research/_work/verdicts.md` ~L1055–1065). So:
   - `SignUpWebView` and `SubscriptionHandler`, plus the other subscription screens, stop collecting payment in-app. They open the web pricing/checkout and my-account pages in the system browser (honouring `RATS_WEB_URL`).
   - The web pages return the user to the app by app link when they finish. The app then signs in or refreshes the subscription state.
   - The WebView auto-login fix in §3.2 is no longer needed. It's replaced by this hand-back.
   - The Maestro flows test the app's side: the browser opens with the right URL, and returning lands in the right state. Playwright and the staging round trips cover the web side.
   - Simulator and emulator builds are unsigned (`CODE_SIGNING_ALLOWED=NO`), so universal links can't verify there. In Maestro the hand-back is driven through the app's custom URL scheme. The real app-link hand-back is a device-checklist item.
7. **Live Stripe configuration (new, from the second review).** Besides prices, launch needs these live-mode settings. Each one is recorded before it's changed (§6.1):
   - **The live webhook endpoint's event list** includes every event the handlers process, including any of §3.2 item 4's unhandled events that this work starts handling.
   - **Retry and dunning settings** match the grace rule in item 1.
   - **The Customer Portal configuration** is created; none exists in live mode (§3.2 item 6). It lists the tier products and prices, so upgrade, downgrade and cancel in the portal offer the tiers, not the legacy prices.
   - Each has a matching setting on the e2e sandbox, set up in §5 step 4. The staging round trips run against that, so the live settings are a copy of something already tested.
8. **Web checkout stays closed until the app is released (owner decision).** From §5 step 8 the production backend could sell tiers, but the only app in the stores is the old one until step 10.4, and store review could make that gap weeks long. So:
   - A server-side **sales-open switch** decides whether new tier subscriptions can start.
     - While it's closed, `createOperatorSubscription` refuses new subscriptions, which it already does per tier when one isn't for sale (`callable/subscriptions.ts`, "not currently available for new subscriptions").
     - `getTierCatalog` reports the switch, and the web pricing and signup pages show "coming soon" instead of checkout.
   - Where the switch lives is the builder's call. The same public source as the minimum-version gate (§4.2) is a natural fit. It must be server-enforced, not just hidden in the web.
   - It is **closed** when the production backend deploys (§5 step 8) and **opened** at launch (§5 step 10.5), after the release. A flow covers both states. It is open on staging and the emulators, where the round trips subscribe.

### 4.2 Workstream B: broken and half-built features

Fix or finish everything in §3.3, verifying each reported item first:

- **Add Home / admin state:** load the admin record, so that Add Home and all 12 readers of `userAsAdmin` (§3.3) behave correctly.
- **Oxford business meeting detail:** register the route.
- **In-app application:** wire `IntroHouseSummary` APPLY (or an equivalent entry point) to `Apply` → `ApplicationStatus`, so a prospective resident can submit an application and the operator sees it under Applications → approve → intake.
  - Today APPLY routes to self-signup instead. Which entry point gets which behaviour is the builder's call within the existing designs. If the designs conflict, ask the owner.
- **Guest CSV import and the balance dashboard:** give each an entry point in the operator UI, and finish whatever is incomplete in them.
- **Deep links and app links (owner decisions, 2026-11-06):**
  - **`regroup-app.com` is the canonical domain.** Links sent to people (invitation and account emails) are `https://regroup-app.com/...` app links, not custom schemes, because email clients strip or block those. With the app installed, the link opens it. Without it, the web page at the same URL shows store links and keeps the intent (for example the invitation token) so it survives the install.
  - **`regroup-app://` is the canonical custom scheme** on both platforms. It's the fallback, and what Maestro drives. The corrected `linking` config uses it and the https domain. The unregistered `regroup://` goes.
  - **`com.rats.dev://` is still accepted for one release, but no longer generated.** `inviteEmails.ts:43-51` stops rewriting to it. After that release, remove it from the manifests, along with the iOS `example` scheme and the dead `applinks:cleanhouse.page.link`.
  - **Every email link moves off the unrouted `/redirect` page.** Invitations do, and so do the account-email links that `functions/src/util/user.ts:44-45` wraps the same way (verified), which dead-end today too. Each email type gets its own coverage-matrix rows.
  - **The owner's condition: deep links must keep working.** Before any link code changes, the coverage matrix gets a row for every link the app handles today:
    - each route in `native-deep-links.ts` and the corrected `linking` config, invitation redeem included;
    - the checkout hand-back;
    - for each one, the cases: app installed and signed in; installed but signed out (the link survives sign-in); not installed (the web fallback).
    - Each row runs through `regroup-app://` in Maestro on both platforms, and through `https://regroup-app.com` on real devices (device checklist, both passes).
    - `com.rats.dev://` keeps a row until it is removed.
    - Every row has to pass before and after the change, so nothing that works today breaks.
  - Publish `apple-app-site-association` and `assetlinks.json` from `regroup/web`, so universal and app links verify.
    - Hosting can't serve them today (verified): `web/firebase.json` ignores `**/.*`, which drops a `.well-known/` folder from upload, and `**` falls through to the SSR function.
    - They are served explicitly instead (a rewrite or a function, with the right content type), and a test fetches both URLs from the deployed site.
- **App identity (owner decision):** the relaunch ships as an **update to the existing store listings**, keeping the current bundle and application IDs. Before any deep-link or app-link work starts, the owner confirms the exact live IDs (today iOS Release is `com.rats.dev` and Android is `com.regroup.app`; RG-RM-11) and supplies the Play app-signing SHA-256 for `assetlinks.json` (§8.1). He provides both **before §5 step 5**, where the deep-link work starts. The URL schemes are already decided (Deep links, above). What depends on the IDs: the app-link files, the Firebase app registrations and the "upgrade in place" device check.
- **US storefronts only at launch (owner decision).** Both store listings are limited to the US, where link-out checkout is allowed. Regroup operates only in the US anyway: house Connect accounts are fixed to `country: "US"` (`util/connectAccountLifecycle.ts`). Widening availability later needs a per-storefront payment-rules check first.
- **Minimum-version gate:** see §4.1 item 2. It's built here.
  - A required-version value is read from the server at launch, and older builds get a blocking "please update" screen with store links.
  - It **fails open**: if the value is missing or can't be read, the app lets the user in.
  - The value can be changed without a deploy, and how to change it is documented.
  - **It is not a Firestore document behind the rules.** The gate runs before sign-in, and the rules have no catch-all (`mobile/firebase/firestore.rules`, commented out at ~line 94). A Firestore read would be denied, and a fail-open gate that is always denied silently does nothing, exactly like the `paywall/config` kill switch (§3.2 item 3).
    - It reads from a source that is public by design, such as Remote Config or a public callable in the style of `getTierCatalog`. Builder's choice.
    - A Maestro flow proves both directions: a required version above the build's blocks it, and an unreachable or missing value lets it in.
- **Role leaks:** hide operator-only entry points from residents, and have each screen check the role, not just the rules.
- **Anything else the suite turns up:** a bug the new flows uncover joins this workstream. It is fixed, not worked around inside the flow.

**Not completed (dead code, non-goal):** `CreateGuest`, `GuestUpdate`, `HouseConfig`, `HouseChoreOverview`, `HouseInfo`, `HouseActivity`, `ProfileUpdate`, `ChoreRotationSetupScreen`, `PaymentWebView`, `ManagerIntro`, and the duplicate route aliases. If one of these turns out to hold the only implementation of a reachable feature, treat it as half-built instead.

### 4.3 Workstream C: the end-to-end suite

**The coverage matrix (first deliverable):** Appendix A is expanded into a checked-in matrix, one row per user action × role × platform × fixture where the fixture matters.

- Each row names the flow (or Playwright test, or staging scenario, or device-checklist item) that covers it, plus its last result.
- Location and format are the builder's call, next to the Maestro docs.
- "Every feature works" means every row passes. Rows are added when the suite turns up something Appendix A missed, and never removed to make the count work.
- **Deferring a row (owner decision).** So that one stubborn row can't hold the launch indefinitely, the owner may defer a specific row. He moves it to the manual device checklist, or, if it touches neither money nor data, to a post-launch fix list. The reason and date are written in the matrix.
  - **Never deferrable:** money-path rows (checkout, charges, grace and lapse, the sales-open switch, the paywall states) and data-access rows (payment history, documents, the backfill outcomes). Those pass, or there is no release.

**Mobile (Maestro), against the local emulators:**

- **Coverage:** every row in the coverage matrix gets a flow, or a step in a flow, that asserts the outcome. "Asserts the outcome" means checking the resulting screen state, and where it matters the Firestore document (`maestro/scripts/assert-firestore.js`). Tapping through is not enough.
- **Cross-role flows run as both sides**, for example operator invites → resident redeems → operator sees the resident.
- **Fix the 10 failing flows and strengthen the weak ones.** No optional steps except OS-level prompts.
- **Two seed fixtures:**
  - **clean:** today's seeder, corrected so it no longer masks bugs (houses written the way `createHouses` writes them).
  - **legacy:** records shaped like current production. That means legacy pricing metadata, the random admin ids, old field layouts, and any other shapes the backfills touch.
  - The legacy shapes come from production through a script that outputs only field names and types, so no values pass through the builder at all. PII never goes into fixtures, logs or commits.
  - Key flows (sign-in for each role, the paywall states, payment history, documents) run against both fixtures, before and after the backfills.
- **The suite refuses non-e2e builds.** Before any flow runs, the runner checks that the installed app is an e2e variant: its bundle or application ID ends in `.e2e.emu` or `.e2e.stg`, and its bundle carries the E2E marker. It refuses to run otherwise. Every launch creates an anonymous account (§3.4), so a run against a store or Debug build writes to production.
- **Both platforms:** the same flows on iOS (E2EEmulator) and Android (`e2eEmulator`). Platform-specific selectors are allowed where the platforms really do differ, such as the iOS label merging.
- **One command per platform** runs the whole suite and reports per-flow results **and durations**. `maestro:ios` and `maestro:android` currently sweep in `run-all.yaml` and the debug flows; fix that.
- **CI (owner decision):** the suite runs on demand until it is fully working. Whether it then joins CI, and which part, depends on how long it takes, since CI runs must not get long. The recorded durations are what that decision is made from. Moving it to CI is not part of this work.

**Web (Playwright), billing journeys only:**

- pricing → tier pick → checkout (Elements, Stripe test cards including 3DS and decline) → account created
- my-account → Stripe portal: upgrade, downgrade, cancel, change payment method
- invitation email link → web redirect → app

These run locally against the `e2e-emulator` web build, and against staging for the round trip.

**Round trip (staging `regroup-e2e` + Stripe sandbox):** real webhook delivery is needed here, which the emulators can't provide. A scripted scenario does the web or Stripe action, then runs the mobile flow that checks the effect.

**Staging comes first, as a walking skeleton** (§5 step 3), because it's the riskiest dependency and §3.5 shows it has never worked end to end. Before any other scenario is written, the first one runs once, by hand if need be, on both platforms. It needs:

- the web app deployed to the `regroup-e2e` hosting site, codebase-qualified like production. **It first needs an `e2e-staging` server (SSR) configuration** in `web/angular.json`, and an SSR build script that uses `e2e-staging` for **both** halves, behind the existing `e2e-staging` guard. Today `build:ssr` hardcodes production for both the browser bundle (`ng build --prod`) and the server (`sapp:server:production`). Without that, staging would serve pages rendered from the production environment (§3.5);
- the `E2EStaging` and `e2eStaging` apps built on RN 0.88 and passing `verify-ios-variants.sh` / `verify-android-variants.sh`;
- a way to get a staging account:
  - Preferably through the real web signup, which is the thing under test.
  - Plus a separate, guarded staging setup script for fixtures that signup can't create, such as residents.
  - That script refuses every project except `regroup-e2e`, the same way the seeder refuses everything except `demo-`. The seeder's own guard stays as it is.

The scenarios:

- subscribe on web → the operator signs in on mobile and completes setup (the walking skeleton)
- payment failure → resident grace period → lapse → operator blocked, resident blocked
- recovery → unblocked
- cancel in the portal → blocked, and no new houses
- Oxford enable/disable → Oxford features follow, for the operator and for residents

The Stripe test clock (or `stripe trigger`) drives time-based states.

**Manual device checklist:** decision record §7.3, extended with whatever this work adds that an emulator can't fake. It runs in two passes, because some items need the production backend that only exists from §5 step 8:

- **On staging builds** (§5 step 7): camera, file picker, share sheet, SMS 2FA, real push for the billing notifications, and the app-link hand-back on a signed device build.
- **On the production Release builds through TestFlight and Play internal testing** (§5 step 9, after the production backend is deployed):
  - live-key checkout with a real card. Web checkout is closed then (§4.1 item 8), so this runs on an owner-only test path: the switch opened for a named test account, or briefly opened and closed again, as the builder designs it;
  - universal links against the production domain;
  - upgrading in place from the store build with carried-over data;
  - connecting a real payout account (needs Connect activated, §8.1).

### 4.4 Workstream D: finishing PR #160, early

#160 merges **at parity**, not after the full suite. This avoids weeks of fixing and testing every change on two RN versions and merging `main` into the branch over and over.

Parity means:

- the 6 flows that pass today (§3.5) pass on iOS **and** Android against the upgrade branch;
  - No Android baseline exists yet, since §3.5 is iOS only. The builder runs the same 6 flows on Android from a `main` (RN 0.72) build too.
  - A failure the upgrade caused is fixed inside #160. A failure that `main` shows as well is recorded as the Android baseline and fixed after the merge, so it doesn't bloat the PR.
- the owner's device pass (decision record §7.3) is recorded;
- the store-build guards (`release-guard`, `verify-*-variants.sh`) pass on 0.88.

Merging early doesn't weaken the proof. Nothing ships until the release, and the release is gated on the full suite (§9).

Then:

1. Revert the temporary verify-diff opt-in (Task 1).
2. Run verify-diff over the whole branch and record it in the PR.
3. Apply `test-change-approved`.
4. Get the final review, including the 4 pr-review findings open since 2026-10-30.
5. Merge.

## 5. Order of work

Ordered for the earliest safe launch: the riskiest dependencies come first, and the irreversible steps come last. Within each step, independent items can run in parallel.

**Starting early, in parallel with step 2** (added after the roadmap review, 2026-11-06): work that doesn't depend on the RN version may start once step 1's guard and CI fix are on `main`:

- step 3's web and server half: the staging SSR configuration, the staging web deploy, sandbox prices, and the staging account path;
- step 4's server-side billing fixes: functions code and its unit tests.

The mobile parts of steps 3 and 4 still wait for step 2. The deploy freeze below starts when the first billing fix lands on `main`. The roadmap (`docs/superpowers/plans/2026-11-06-regroup-launch-roadmap.md`) also tracks the owner's parallel tasks and their deadlines.

1. **Start-up:**
   - **The coverage matrix** (§4.3), the acceptance checklist for everything after it.
   - **Confirm the source of the October anonymous accounts** (§3.4; most likely a Maestro run against a production-pointed build), and add the suite's e2e-build guard (§4.3) before any more flows run.
   - ~~Turn on Firestore point-in-time recovery for `phoenix-cleanhouse`.~~ Done 2026-11-06 (§3.4). What's left: create the exports bucket before the first backfill, and record its name in `regroup/docs/operations/data-recovery.md`.
2. **D: merge #160 at parity** (§4.4). From here on, all work happens on `main`, on RN 0.88.
3. **C: the staging walking skeleton** (§4.3):
   - the staging SSR configuration, then deploy staging web;
   - build both staging apps;
   - get a staging account;
   - run the subscribe → mobile setup round trip once.

   Two things land here because the skeleton needs them:
   - **the Add Home / admin-state fix from B** (§4.2): the setup wizard reads the same null `userAsAdmin` (`useHouseSetupWizard.ts:44`, `withHouseSetupWizard.tsx:20`), so setup can't complete without it;
   - **the sandbox prices** (A3, sandbox half).

4. **A1–A2 and C (foundation), in parallel:**
   - billing fixes and backfill scripts, each with a failing test first. This includes the A4 code: the launch-cancellation marker, push suppression and the cancellation script. It also includes A8, the sales-open switch;
   - the corrected clean seeder plus the legacy fixture, so the fixes are tested against realistic data from the start;
   - A5: web unit tests in CI;
   - the sandbox copies of the A7 settings (webhook events, retries and dunning, Portal), which the step-6 round trips need.
5. **B:** feature fixes and completions, each with its flow written first, failing, then the fix. A6 (link-out checkout) goes here with the app-link work. The owner's store IDs and Play SHA-256 (§8.1) are needed before this step starts.
6. **C (coverage):** the remaining flows, the 10 failing flows fixed, the web Playwright journeys, the rest of the staging round-trip scenarios. Every matrix row passes.
7. **Release candidate on staging:** the full suite passes on both platforms, and the owner runs the staging pass of the device checklist (§4.3).

Steps 8–10 are the launch runbook. Each sub-step is done in order, after its §6.1 row, and recorded. **Owner** means only Marcus can do it; **builder** means the implementing session, with Marcus approving anything marked "confirms". Nothing in steps 8 and 9 is irreversible for users: no subscription is canceled and no stored data is rewritten.

**Prerequisites before step 8:**

- **The owner's parallel tasks:** Stripe Connect activated in live mode (§8.1). Store-listing prerequisites done: the hosted privacy policy and terms URLs, App Privacy and Data safety answers, listing updates, and both listings limited to the US (§4.2).
- **A production deploy freeze for every regroup deploy target, from the first billing fix on `main` until step 8:** functions, web hosting and SSR, Firestore rules, and indexes.
  - Billing and feature work lands on `main` from step 4, and some of it starts early (see the parallel note above). That includes the web (link-out checkout, the sales-open switch, app-link files) and the rules (the resident read-only view).
  - There is no CI deploy, so any production deploy from `main` in that window would ship the work early, against the old app.
  - A real hotfix in that window deploys from a branch cut at the live commit, with the owner's yes.

8. **Production backend.** It breaks today's store build, which is accepted (§4.1 item 2). It is run in this order:
   1. **Owner confirms the live price changes** (keep / archive / create, §4.1 item 3). **Builder** archives the duplicate sets and creates the annual prices, then updates `stripe-prices.env` (PR).
   2. **Builder:** builds `functions/.env.phoenix-cleanhouse` from its canonical copy and the updated price list, with `TIER_BILLING_ENABLED=true` and the sales-open switch **closed** (§4.1 item 8).
   3. **Builder:** runs `preflight-billing.js --strict` (config must pass; §4.1 item 3 for the secret check) and `firebase-deploy-preflight`.
   4. **Builder:** deploys rules, then indexes (by hand), then functions, then web (hosting plus the codebase-qualified SSR, including the app-link files). Functions go before any backfill, so the old webhook code is never writing the old shapes during one.
   5. **Builder:** checks the deployed `getTierCatalog` against `config.ts` and `stripe-prices.env`: twelve tiers-by-interval, one price each, right amounts. Then fetches the two app-link files from `regroup-app.com`.
   6. **Builder, owner confirms each:** sets the live webhook event list and the retry and dunning settings, and creates the Customer Portal configuration (§4.1 item 7).
9. **Store submission:**
   1. **Builder:** builds the Release apps on `main` (`release-guard` and `verify-*-variants.sh` pass).
   2. **Builder, owner confirms:** creates the **App Review demo accounts** in production: one operator, one resident, on a house that is on the owner's exceptions list, so the step-10 backfill leaves it entitled. Their credentials go into the review notes and stay out of git.
   3. **Owner:** uploads to TestFlight and Play internal testing, and runs the production pass of the device checklist (§4.3).
   4. **Owner:** submits both for review **with manual release** (App Store "manually release this version", Play managed publishing) and **with phased release / staged rollout turned on**, so §6.1's pause or halt is available. Link-out checkout is the likeliest reason for a rejection. A rejection is fixed and resubmitted here, before anything irreversible has happened.
10. **Launch day, only after both stores approve:**
    1. **Owner:** the notice to the existing operators has gone out.
    2. **Owner confirms the legacy subscription list. Builder** writes the §6.1 record, then cancels, with the cancellation push suppressed (§4.1 item 4). Then the builder **waits until Stripe shows every resulting `customer.subscription.deleted` event delivered** to the webhook. This comes before the backfill, so neither the deletion webhook nor a late retry can overwrite it.
    3. **Builder:** the export (§6.1), then the backfill dry run, which the **owner reviews**, including the exceptions list (with the demo house on it). Then the live backfill: the plan-required rule plus any shape migrations.
    4. **Builder:** **post-backfill smoke check** in production:
       - the changed counts match the dry run;
       - a plan-required house shows the plan-required screen to its operator, and the limited read-only view to a resident;
       - the demo house is entitled.

       A mismatch stops the launch here, and the §6.1 restore applies.

    5. **Builder:** `coverage-matrix-check.js --release` (no filter) exits 0, so every row, the production device pass included, has passed or been validly deferred. **Owner:** releases the approved builds in both stores (phased). **Builder:** opens the sales-open switch.
    6. **Builder, once the new version is downloadable in both stores:** sets the minimum version. Setting it earlier would block people from an app they can't yet get.

## 6. Constraints (from the repo, binding)

- **Where the work happens:** in a git worktree off `origin/main`, using `git -C <path>`. Until #160 merges, only parity work goes into the upgrade branch. After it merges, fixes land on `main` in small PRs (`fix(regroup-mobile):`, `fix(regroup-functions):`, `test(regroup):` …; the commit-msg hook requires a product scope).
- **Hooks:** pre-commit enforces a 300-line cap on new files, the secret scan, and the test-tamper gate (no deleted or skipped tests, no test-count drops, no `.snap` churn). Never `--no-verify`. Coverage floors are ratchets.
- **Privacy:** no PII in logs, fixtures, test data or commits. Log full errors server-side and return sanitized messages to clients.
- **Data isolation:** never query another product's Firestore. Cross-product traffic goes through recovery-api.
- **Deploys:**
  - Firestore indexes deploy only by hand (`firebase deploy --only firestore:indexes`). Any new query needs its index added and deployed.
  - Web SSR deploys must be codebase-qualified (`--only hosting,functions:web:ssr`).
  - Run `firebase-deploy-preflight` before any production deploy.
- **Money paths:** get an independent review that reasons from the domain model. Mutation-kill counts are not evidence of correctness.
- **Docs stay current (owner rule).** Every change updates the docs that describe it, in the same PR: behaviour, config, ops settings, decisions. A PR that changes what a doc says is true, and leaves the doc saying the old thing, isn't done.
  - Historical records (dated plans, reports, archives, `_legacy/`) stay as they were, since they record what was true then.
  - Current docs that this design already contradicts are corrected in the PR that implements the change:
    - the pricing plan's P-3 legacy grandfathering, and P-4's annual formula (× 0.83 vs × 10);
    - `regroup/scripts/stripe-prices.env` (wrong legacy IDs, test-mode annual lines), `regroup/scripts/stripe-product-values.md`, and the go-live runbook's lines 31 and 34 that point at them (§4.1 item 3);
    - the roadmap's "5 live houses" (RG-RM-10) and RG-RM-8;
    - `regroup/docs/launch-readiness/billing-go-live-runbook.md`, for link-out checkout and legacy retirement;
    - the subscription and billing sections of `regroup/docs/technical/architecture.md`, which still describe the legacy house + guest items.
  - `regroup/docs/README.md` links to files that are no longer at those paths. It gets fixed the first time a PR adds a doc to it.
- **Seeder safety:** keep the guard (`demo-` project ids, loopback hosts only). Staging scenarios and the staging setup script target `regroup-e2e` only, behind their own guard. Nothing in the suite touches production.

### 6.1 Recovery and rollback

Each production step has its way back prepared before the step runs. Each recovery step's output is recorded in the PR or run log (counts and IDs only, no PII).

| Step                                                                             | Before it runs                                                                                                                                                                                                   | If it goes wrong                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Any production backfill                                                          | PITR on (done 2026-11-06), plus a managed Firestore export (steps in `regroup/docs/operations/data-recovery.md`) of the collections it touches, to a bucket in `phoenix-cleanhouse`. Then the dry run, reviewed. | Restore the affected documents from the export or a PITR read. The script logs the IDs it changed, so a restore can be targeted.                                                                                                                                      |
| Functions deploy (webhook and entitlement fixes)                                 | `preflight-billing.js --strict` and `firebase-deploy-preflight`. Note the commit that is live now.                                                                                                               | Redeploy that commit. Stripe redelivers only events whose delivery failed. An event a buggy handler accepted (for example "no houses found") is marked done and never comes back (§3.2 item 1), so damage from a logic bug is repaired by a backfill, not a redeploy. |
| Production deploy config (`functions/.env.phoenix-cleanhouse`)                   | Keep its canonical copy outside the repo, mode 600. Save the previous version before each change.                                                                                                                | Restore the previous file and redeploy functions.                                                                                                                                                                                                                     |
| Rules deploy                                                                     | Preflight diff of committed vs live rules.                                                                                                                                                                       | Redeploy the previous rules.                                                                                                                                                                                                                                          |
| Indexes deploy                                                                   | Note the live index list. New indexes are additive; nothing is deleted at launch.                                                                                                                                | Redeploy the previous `firestore.indexes.json`. A missing index shows up as a query error, so fix forward.                                                                                                                                                            |
| Web deploy (hosting and SSR)                                                     | Note the live Hosting release and the live SSR commit.                                                                                                                                                           | Roll Hosting back to the previous release in the console, and redeploy the previous SSR commit (`--only hosting,functions:web:ssr`).                                                                                                                                  |
| Live Stripe configuration (webhook events, retries and dunning, Customer Portal) | Record the current settings (screenshot or API read) in the run log.                                                                                                                                             | Restore the recorded settings.                                                                                                                                                                                                                                        |
| Store release                                                                    | Both builds approved with manual release, and the production device pass recorded (§5 step 9).                                                                                                                   | Pause the phased rollout (App Store) or halt it (Play), then fix forward with a new build. A released build can't be pulled back from devices that already have it.                                                                                                   |
| Archiving duplicate live prices                                                  | Owner confirms the keep / archive / create list. Record the archived price IDs.                                                                                                                                  | Reactivate the archived price (`active: true`).                                                                                                                                                                                                                       |
| Sales-open switch                                                                | It ships closed, and a flow has covered both states.                                                                                                                                                             | Close it again: new subscriptions stop at once, and existing ones are untouched.                                                                                                                                                                                      |
| App Review demo accounts                                                         | Their house is on the exceptions list. Credentials stay out of git.                                                                                                                                              | Disable or delete the accounts after review if they're no longer wanted.                                                                                                                                                                                              |
| Canceling legacy subscriptions                                                   | Write each subscription's ID, customer ID, items, status and metadata to a file outside the repo (`~/.config`-style, mode 600), and get the owner's confirmation of the list.                                    | A canceled Stripe subscription can't be reactivated. The fix is a new subscription for that customer, which is why the record exists.                                                                                                                                 |
| Live price creation                                                              | The owner confirms the list.                                                                                                                                                                                     | Archive the wrong price and create the right one, update `stripe-prices.env` and the deploy config, then redeploy functions.                                                                                                                                          |
| Minimum-version gate                                                             | The gate fails open, reads a public source (§4.2), and its value changes without a deploy. A flow has proven both directions.                                                                                    | Lower the value, and blocked users get straight back in.                                                                                                                                                                                                              |

## 7. Decisions

**The owner's:**

- Every existing feature must work. Half-built features are completed, not cut.
- Web is in scope as far as billing touches mobile.
- No hard date: as soon as possible.
- This is a reboot of the app. The owner tells the current houses.
- Existing data carries over.
- Create live Stripe Price IDs as needed.
- The testing approach: automated Maestro coverage on both platforms is the proof of the upgrade and the lasting regression guard, with a short manual device checklist for what emulators can't do.

**The owner's, from the builder check (the suggested defaults, all accepted):**

- Live paying houses would have moved to the tiers on D-9 terms. Stripe then showed there are none (the only paying subscription is the owner's test), so §4.1 item 4 retires legacy billing instead.
- ~~Live houses that turn out to be lapsed are held `active` until the owner decides each one.~~ Replaced after plan review; see below.
- ~~Production changes stay compatible with today's store build until the reboot ships.~~ Replaced after plan review; see below. The minimum-version gate stays.
- The relaunch ships as an update to the existing store listings. The owner confirms the IDs and supplies the Play signing fingerprint.
- Operator checkout and plan management link out to the system browser instead of using an in-app WebView.
- Grace period: 7 days from the first failed payment, for everyone, then blocked. Aligned with Stripe's retries.
- The list of paying houses comes from Stripe's live active subscriptions, cross-checked against Firestore. Done 2026-11-06; see §3.4.

**The owner's, after plan review (2026-11-06; he accepted the review's recommendations):**

- **One rule for every existing house:** at launch, a house without a live tier subscription is plan required, with its data intact. The owner can name exceptions on the backfill's list (§4.1 item 2).
- **No compatibility with today's store build.** 0 real users were active in 30 days (§3.4). The minimum-version gate stays and fails open.
- **#160 merges early, at parity** (§4.4). The full suite gates the release, not the merge.
- **A recovery step for every irreversible production step** (§6.1).
- **Live price changes are made last, at launch** (the third review found the monthly ones already exist, so only the annual ones are created). Sandbox prices come early.
- **Staging is proven first** with one walking-skeleton round trip (§4.3, §5 step 3).
- **The coverage matrix is the first deliverable** and the acceptance checklist.
- **Trial length: 7 days**, as the code has it.
- **Point-in-time recovery on for production**, done 2026-11-06.
- **Docs stay current:** every change updates its docs in the same PR (§6).
- **Links:** `regroup-app.com` is the canonical domain, `regroup-app://` the canonical custom scheme, and `com.rats.dev://` stays accepted for one release, on condition that every deep link keeps working (§4.2).
- **Stripe Connect activation in live mode** is the owner's task, done before §5 step 8 (§3.4, §8.1).
- **No env vars for prices or the trial length.** One source each: the amount on the Stripe Price, the trial in `TRIAL_PERIOD_DAYS`. Clients read both from the existing `getTierCatalog` callable, extended with the trial days (§4.1 item 1).
- **The Maestro suite runs on demand until it fully works.** CI is decided afterwards from its recorded run time.

**The owner's, applying the second (independent) review (2026-11-06; he asked for its findings to go into the design):**

- **Launch is a three-stage runbook** (§5 steps 8–10): production backend, then store submission with manual release, then the irreversible steps. Those run only after both stores approve.
- **Legacy subscriptions are canceled before the backfill,** with the cancellation push suppressed (§4.1 item 4).
- **Price IDs and `TIER_BILLING_ENABLED` live in the production deploy config,** with a canonical copy outside git and `--strict` preflight on every deploy (§4.1 item 3).
- **Live Stripe configuration is part of the work:** the webhook event list, retries and dunning, and the Customer Portal (§4.1 item 7).
- **The version gate reads a public source,** and a flow proves it blocks and fails open (§4.2).
- **Staging web needs its own SSR configuration** before it's deployed (§4.3).
- **The suite refuses non-e2e builds** (§4.3).
- **The device checklist runs in two passes,** staging and production TestFlight/internal testing (§4.3).

**The doc author's calls from the second review (the owner can override):** the Android parity baseline rule (§4.4); the custom scheme for the hand-back in Maestro, with real app links on the device checklist; a field-names-only extraction script for the legacy fixture.

**The owner's, from the third (independent) review (2026-11-06):**

- **Residents keep read-only access to their own payment history and documents** while their house is plan required or lapsed (§4.1 item 2).
- **Web checkout stays closed until the app is released,** through a server-enforced sales-open switch (§4.1 item 8).
- **The owner may defer a coverage-matrix row** to the device checklist or a post-launch list, with a written reason. Money-path and data-access rows can never be deferred (§4.3).
- **US storefronts only at launch** (§4.2).

**Corrections from the third review:**

- The monthly live prices already exist; A3 keeps them, archives two duplicate sets, and creates only the annual ones (§3.2 item 6).
- The Add Home fix moves into step 3.
- The step-8 runbook is reordered: prices, config, preflight, deploy, check.
- Launch gains App Review demo accounts, phased release, a wait for deletion events, a post-backfill smoke check, a deploy freeze, and the store-listing prerequisites (§5).

**The doc author's call from the third review (the owner can override):** `stripe-prices.env` becomes the one reviewed list of live price IDs (§4.1 item 3).

**The doc author's calls that follow from §3.4 (the owner can override):** cancel the 7 active legacy subscriptions at launch, after he confirms the list; no legacy rent-fee grandfathering; no founder coupon.

**The doc author's calls (the owner can override):**

- Mobile flows run on the emulators. Billing round trips run on `regroup-e2e` staging with the Stripe sandbox.
- Playwright for the web journeys.
- The two-fixture seeder (clean and legacy).
- The order in §5.
- Staging accounts come from the real web signup where possible. A separate, `regroup-e2e`-only setup script covers the rest.
- Annual price = monthly × 10. Oxford Network's price is created even though it's not for sale.
- Dead code stays out of scope.
- Every reported bug is verified before it's fixed. Bugs the suite discovers are fixed, not worked around.

## 8. Left to the builder

- The exact fix for each defect, within the constraints above. Example: which uid-bearing field the webhook queries.
- How flows are grouped and named, how subflows are shared, and how to handle the iOS/Android differences.
- How the legacy fixture is built and stored, as long as there's no PII.
- Whether the paywall kill switch is made to work or removed (one consistent answer).
- The Playwright project layout, and how the staging scenarios are orchestrated (script, CI job, or both).
- How the staging round trips are orchestrated. They run on demand (§4.3, CI), and must be runnable with one command and documented.
- The coverage matrix's location and format.
- What the plan-required state is called in stored data (a status value or a separate field), as long as server and mobile agree.
- The minimum-version gate's source (Remote Config or a public callable), and how the launch cancellations are marked so the push is skipped.

### 8.1 Open for the owner

- ~~Is Stripe Connect activated for live mode?~~ **Answered 2026-11-06: no** (§3.4).
  - Activation is an **owner task**, done in parallel. In the Dashboard, under Connect platform setup, he completes the platform profile. That includes accepting loss liability, since house accounts set `losses.payments: "application"`. He may also need to enable Accounts v2.
  - It must be done before §5 step 8, and the production device pass includes connecting a real payout account.
  - Until then, rent works only on staging.
- ~~The canonical URL scheme on each platform.~~ **Decided 2026-11-06** (§4.2): `https://regroup-app.com` for links that are sent; `regroup-app://` as the custom scheme; `com.rats.dev://` accepted for one release; deep links must keep working.
- **Still needed from the owner:**
  - the store IDs: App Store Connect → App Information → Bundle ID (expected `com.rats.dev`), and the Play Console package name (expected `com.regroup.app`);
  - the Play **app-signing** key's SHA-256 (Play Console → Setup → App signing, not the upload key), for `assetlinks.json`.

## 9. Done means

- #160 merged at parity (§4.4), with the owner's device pass and Task 17 recorded in it.
- Every row of the coverage matrix names what covers it and passes. That includes every feature and action in Appendix A.
- The full Maestro suite passes on iOS and Android on `main`, on both fixtures where §4.3 says so, and its per-platform run time is recorded.
- The Playwright billing journeys pass, and every staging round-trip scenario passes.
- The web unit tests run in CI and pass.
- Every verified defect is fixed, and every reported defect is either fixed or recorded as not real, with the evidence.
- Both passes of the owner's device checklist, staging and production, are recorded.
- Every deep-link row in the coverage matrix passes in every case: signed in, signed out, not installed (§4.2). The rows recorded before the link changes passed again afterwards.
- Stripe Connect is activated in live mode, and the production device pass connected a real payout account.
- Live Stripe has exactly one active price per tier and interval, matching `stripe-prices.env` and `config.ts`. No live Price carries a trial.
- The sales-open switch has passing flows for closed and open. It was closed from step 8 until the release, and opened at step 10.5.
- Residents of a plan-required or lapsed house can open their own payment history and documents and nothing else; a flow proves it.
- The post-backfill smoke check (§5 step 10.4) passed before the release, and both store releases were phased.
- Every deferred coverage-matrix row has its reason and date recorded, and none is a money-path or data-access row.
- The minimum-version gate has a passing flow for both blocking and failing open. The checkout hand-back has a passing flow, plus a device-checklist entry for real app links.
- `apple-app-site-association` and `assetlinks.json` are fetched successfully from the production domain.
- The live Customer Portal offers the tiers, the live webhook event list and retry settings match §4.1 item 7, and each is recorded.
- Every production functions deploy passed `preflight-billing.js --strict`.
- Both store builds were approved before any step in §5 step 10 ran.
- Live prices exist and are loaded, and the backfills and the legacy-subscription retirement have run. Their dry-run and live outputs, and each §6.1 recovery step, are recorded.
- The source of the October anonymous accounts is known, and nothing in the suite or its tooling reaches production.
- No current doc contradicts the shipped behaviour or the decisions in §7 (§6, docs stay current).

## Appendix A: feature inventory (mobile, upgrade branch)

The full explorer reports are summarized here. Routing:

- Every signed-in user gets the same 6 tabs (House, Guest, Activities, Contacts, HouseChat, Personal).
- Role differences come from per-house claims (`<Can>`, `isAdmin`).
- Start routes come from `improved-navigation-service.ts`.
- `SubscriptionGate` wraps Main.

| Role                       | Feature areas and actions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signed out                 | Landing (pick a role, demo); login and forgot password; house search (geolocation) → house summary → apply; sign up (guest/admin form; operator through the web pricing WebView); invitation redeem (`peekInvitation`/`redeemInvitation`); profile completion (NewAccount)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Operator setup             | OrgSetup / OperatorSetupWizard: add houses (photo from camera or library), chores, phases, managers, guest invites, finish setup (`createHouses`, `finishOperatorSetup`, `createInvitation`); plan-required panel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Operator / manager         | House hub (health score); switch house or guest; beds (rooms, beds, assign/swap/remove); activities (verify) and disputes (approve/reject/undo); issues (resolve/dismiss/remove) and complaints (reply/remove); drug testing (log, history); intake (multi-step create resident); applications (reviewing/approve → intake/reject); resident profile (documents, compliance PDF, staff notes, discharge, phase change, delete); documents (upload, open, delete); staff notes; house settings (details, chores, phases, guests, promote/demote managers, invite/delete admin); Stripe Connect (connect, status, disconnect); payment dashboard (list, manual payment, mark resolved, share); admin report; guest invites; subscription (manage plan through web); Add Home; 2FA (SMS); and after Workstream B: guest CSV import, balance dashboard |
| Resident                   | Home (week summary, compliance, stat drill-down, local rent reminder); log work, chore (photo evidence), medication, supporter; meeting search, check-in (geolocation, `userIsAtMeeting`), add meeting; dispute a peer's activity; pay rent (PaymentSheet; locked unless the house's Stripe account is active); payment history (CSV export, receipts); and after Workstream B: application status                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Everyone                   | House chat; contacts → direct chat; file a complaint, log an issue; bug report; feedback; notifications (inbox, preferences); edit profile (avatar); delete account; logout; push notifications; invitation and app links                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Oxford House               | Oxford dashboard and onboarding wizard; officers; EES (generate, mark paid); business meetings (create, detail); voting (open, cast); charter compliance; treasury (records, approve/reject by role, weekly report share); upgrade prompt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Billing states (all roles) | Allowed; grace banner (resident); subscription required (operator); grace expired (resident); Oxford gate by tier                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

Cross-role flows that need both sides tested:

- invitations
- application → intake
- activity → verify / dispute → decide
- complaints and issues
- rent: connect → pay → dashboard
- manager promote/demote
- discharge → report
- Oxford treasury approvals and voting
- billing lapse (operator blocked, resident grace period then blocked)
