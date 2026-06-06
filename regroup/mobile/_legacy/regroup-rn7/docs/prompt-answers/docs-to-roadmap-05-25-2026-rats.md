> ⚠️ **Legacy document.** Carried over from the standalone `regroup-rn7` repository, archived on 2026-06-06. Historical reference only — may be outdated and is NOT part of current `mobile` documentation.

# RATS 3-Repo Roadmap — regroup-rn7 + regroup-functions + rats-web

**Generated:** 2026-05-25  
**Scope:** regroup-rn7 (React Native), regroup-functions (Cloud Functions), regroup-web/rats-web (Angular billing/marketing)  
**Method:** docs-to-roadmap skill — phase 0–6 with codebase cross-reference

---

## Section 0: Source of Truth Verdict

| Doc                                                              | Verdict             | Rationale                                                                                                  |
| ---------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `docs/plans/ACTIVE_PLAN.md`                                      | **SOURCE_OF_TRUTH** | May 22, 2026 — most detailed operational plan; production readiness scores, sprint breakdown, gap analysis |
| `docs/ECOSYSTEM_ROADMAP_2026.md`                                 | **SOURCE_OF_TRUTH** | May 24, 2026 — cross-repo sequencing, explicitly corrects stale claims from prior docs                     |
| `docs/PRODUCT_STRATEGY_ASSESSMENT.md`                            | **SOURCE_OF_TRUTH** | Strategic kill/keep decisions (kill rats-web, pricing direction)                                           |
| `regroup-functions/.full-review/05-final-report.md`              | **SUPPORTING**      | Security/quality snapshot — many findings already fixed per git log                                        |
| `docs/superpowers/specs/2026-05-23-current-roadmap.md`           | **SUPPORTING**      | rn7-only view, superseded by ECOSYSTEM_ROADMAP; some migrations listed as MISSING that are DONE            |
| `docs/superpowers/plans/2026-05-19-*.md through 2026-05-23-*.md` | **SUPPORTING**      | Feature plans — verify completion against git before using as roadmap source                               |
| `docs/archive/`                                                  | **ARCHIVE**         | Historical; do not pull requirements                                                                       |
| `docs/type-fixes/`                                               | **ARCHIVE**         | TypeScript fixes — all complete                                                                            |
| `docs/e2e/`                                                      | **ARCHIVE**         | E2E analysis pre-dates current test state                                                                  |

**Key cross-reference corrections (git overrides doc claims):**

| Doc claim                                          | Actual status (git log)                                                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `setOxfordEnabled` CF missing                      | **DONE** — `fbd5d48` (Stripe swap + rollback)                                                                            |
| `getMeetingAttendance` bridge missing in functions | **DONE** — `393cd00` (`getResidentMeetingAttendance` callable)                                                           |
| `createPaymentIntent` has no auth check            | **DONE** — `8a0116d`                                                                                                     |
| No input validation on callables                   | **DONE** — `5f0d0b9` (Zod on all callable boundaries)                                                                    |
| Oxford billing trust boundary weak                 | **DONE** — `bca9e7e`, `8ec04d2`                                                                                          |
| Stripe price IDs hardcoded $9.99                   | **DONE** — `b5b19e8` (live price IDs wired)                                                                              |
| M1/M2/M3 migrations NOT done                       | **DONE** — `09a1a1e`, `0047720`                                                                                          |
| Oxford screens unimplemented                       | **DONE** — `58cd4d5`, screens exist at `src/screens/Oxford/`                                                             |
| `savePaymentMethod` callable lacks auth            | **N/A** — function does not exist as a separate callable; `updatePaymentInfo`/`getPaymentMethod` are the current pattern |
| Firestore rules missing for Oxford/payments        | **DONE** — `firestore.rules` covers `officers`, `business-meetings`, `votes`, `ees-records`, `payments`, `guest-archive` |

---

## Section 1: Doc Audit Summary

| Doc                                                                   | Last Git Touch | Type                       | Verdict                           |
| --------------------------------------------------------------------- | -------------- | -------------------------- | --------------------------------- |
| `docs/plans/ACTIVE_PLAN.md`                                           | May 22, 2026   | Sprint plan + gap analysis | SOURCE_OF_TRUTH                   |
| `docs/ECOSYSTEM_ROADMAP_2026.md`                                      | May 24, 2026   | Cross-repo vision          | SOURCE_OF_TRUTH                   |
| `docs/PRODUCT_STRATEGY_ASSESSMENT.md`                                 | ~May 2026      | Strategic                  | SOURCE_OF_TRUTH                   |
| `docs/superpowers/plans/2026-05-22-admin-reporting-dashboard.md`      | May 22         | Feature plan               | SUPPORTING (verify completion)    |
| `docs/superpowers/plans/2026-05-21-payment-failure-recovery.md`       | May 21         | Feature plan               | SUPPORTING (verify completion)    |
| `docs/superpowers/plans/2026-05-21-stripe-product-setup.md`           | May 21         | Ops plan                   | SUPPORTING                        |
| `docs/manual-tasks/2026-05-21-app-store-launch-checklist.md`          | May 21         | Manual                     | SUPPORTING                        |
| `docs/superpowers/plans/2026-04-13-redux-to-react-query-migration.md` | Apr 13         | Sprint plan                | STALE (all migrations DONE)       |
| `docs/plans/2026-02-23-sprint-*.md`                                   | Feb 23         | Early sprint plans         | STALE (superseded by ACTIVE_PLAN) |
| `docs/archive/`                                                       | Various        | Historical                 | ARCHIVE                           |
| `docs/type-fixes/`                                                    | Various        | TypeScript fixes           | ARCHIVE                           |

---

## Section 2: Implementation Status Matrix

Only MISSING / PARTIAL items shown. Confirmed-DONE items excluded.

### regroup-functions

| Requirement                             | Status          | Notes                                                                             |
| --------------------------------------- | --------------- | --------------------------------------------------------------------------------- |
| CI/CD pipeline (GitHub Actions)         | **MISSING**     | No `.github/workflows/` in regroup-functions; manual deploy via `firebase deploy` |
| `scheduledRentCollection` auto-pay CF   | **MISSING**     | Charges saved cards on due date; not in pubsub/ triggers                          |
| Automated rent reminder scheduled CF    | **MISSING**     | No scheduled reminder CF in pubsub/                                               |
| Payment confirmation email via SendGrid | **MISSING**     | `stripeWebhook.ts` exists but no email triggered on `payment_intent.succeeded`    |
| `updatePaymentInfo` error return path   | **PARTIAL**     | Returns `undefined` on error path per .full-review/05 — may cause silent failures |
| `calculateWeeklyHealth` NaN division    | **MISSING fix** | Zero-denominator crash when no check-in data                                      |
| Rate limiting on HTTP endpoints         | **MISSING**     | No per-IP throttle on unauthenticated callable endpoints                          |
| Dev/staging Firebase project            | **MISSING**     | All dev happens against production Firebase                                       |

### regroup-rn7

| Requirement                                        | Status      | Notes                                                                           |
| -------------------------------------------------- | ----------- | ------------------------------------------------------------------------------- |
| Auto-pay enrollment (save card + toggle)           | **MISSING** | `savePaymentMethod` CF exists; UI toggle and auto-pay enrollment screen missing |
| `scheduledRentCollection` UI trigger               | **BLOCKED** | Depends on functions CF above                                                   |
| Payment confirmation email                         | **MISSING** | Resident pays, receives no receipt                                              |
| Payment success animation                          | **MISSING** | No confetti/checkmark after payment                                             |
| Balance badge on tab bar ("$X due")                | **MISSING** | No passive due-date reminder                                                    |
| Split payment option ("pay half now")              | **MISSING** |                                                                                 |
| PaymentDashboard: "Overdue Residents" card         | **PARTIAL** | Dashboard has basic list; no sorted overdue view                                |
| PaymentDashboard: manual payment recording         | **MISSING** | Cash/Check/Venmo/Zelle recording with FAB                                       |
| PaymentDashboard: date filter pills                | **MISSING** | No This Week / This Month / All Time filter                                     |
| PaymentDashboard: revenue bar chart                | **MISSING** | No weekly trend visualization                                                   |
| PaymentDashboard: CSV export                       | **MISSING** | `reportExport.ts` pattern exists but not wired to payments                      |
| Manager push notification: rent 3+ days overdue    | **MISSING** | No overdue-rent manager notification                                            |
| Phase advancement progress bar (UI wire)           | **PARTIAL** | `phaseAdvancementQueries.ts` exists; UI component not wired                     |
| Activity dispute "Dispute This" in feed            | **PARTIAL** | Dispute screen exists; entry point not surfaced in ActivityFeed                 |
| Resident TodayView (daily accountability)          | **MISSING** | Day schedule, chore today, dues today, tonight's meeting                        |
| Push notification accountability loop (6 triggers) | **PARTIAL** | Some FCM triggers exist; full 6-trigger loop unconfirmed                        |
| Oxford officer rotation reminder (30-day warning)  | **MISSING** | `termEndDate` exists; notification not wired                                    |
| EES auto-recalculation on guest add/remove         | **MISSING** | Firestore trigger on occupancy change                                           |
| Oxford onboarding wizard (upgrade flow)            | **MISSING** | `setOxfordEnabled` CF exists; no guided wizard screen in RATS                   |
| Oxford charter compliance scorecard                | **PARTIAL** | `CharterCompliance.tsx` exists; compliance rule set not fully evaluated         |
| Shareable charter compliance PDF                   | **MISSING** |                                                                                 |
| 2FA using Firebase MFA enrollment                  | **PARTIAL** | Screen exists; uses `signInWithPhoneNumber` instead of Firebase MFA             |
| Sentry in production builds (verified)             | **PARTIAL** | Sentry initialized; production build verification needed                        |
| `migrate-full.ts` data migration                   | **MISSING** | Dry-run → execute on production data                                            |
| Oxford network directory (public listing)          | **MISSING** |                                                                                 |
| App Store submission (all metadata, screenshots)   | **MISSING** | Fastlane set up; actual submission not done                                     |

### regroup-web (= rats-web)

| Requirement                                        | Status      | Notes                                                                                        |
| -------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------- |
| App Store + Play Store download buttons            | **MISSING** | Primary CTA is email form; no download links                                                 |
| Replace billing portal with Stripe Customer Portal | **MISSING** | `my-account` component still manages billing directly; Stripe Customer Portal link not wired |
| Host Privacy Policy + ToS at stable URL            | **MISSING** | ToS/Privacy exist in-app and in docs/ but not hosted at `regroup.app/terms` + `/privacy`     |
| Kill/archive Angular 9 billing portal              | **MISSING** | Old billing code still present; creates wrong-priced customers if used                       |
| Update pricing display (old $10/$1 may still show) | **PARTIAL** | `SubscriptionService` had `housePrice: 10` — verify current state                            |
| Operator testimonial section                       | **MISSING** |                                                                                              |

---

## Section 3: Growth-Optimized Roadmap

Growth axes: **U** = Usability · **A** = Acquisition · **R** = Revenue

**Excluded from roadmap (DONE — confirmed by git):**
setOxfordEnabled CF, getResidentMeetingAttendance bridge, createPaymentIntent auth, Zod validation, Oxford screens, Firestore rules (Oxford + payments + guest-archive), M1/M2/M3 migrations, chore rotation, staff notes, admin reporting, document management, stale payment indicator, multi-house bundle, Stripe live price IDs, Oxford billing security.

---

### P0 — Ship-Ready Blockers (This Week)

| #    | Item                                                                                                 | Repo              | U     | A     | R     | Effort |
| ---- | ---------------------------------------------------------------------------------------------------- | ----------------- | ----- | ----- | ----- | ------ |
| P0.1 | Verify Stripe deployed price IDs in Firebase env (`firebase functions:config:get`)                   | regroup-functions | —     | —     | **H** | 30min  |
| P0.2 | Verify Stripe webhook end-to-end: `payment_intent.succeeded` → `payments/{id}` Firestore doc written | regroup-functions | M     | —     | **H** | 2h     |
| P0.3 | End-to-end payment test with real Stripe test card on physical iOS device                            | regroup-rn7       | **H** | —     | **H** | 1d     |
| P0.4 | Replace rats-web billing portal with Stripe Customer Portal link (kill `my-account` billing code)    | regroup-web       | M     | —     | **H** | 4h     |
| P0.5 | Host Privacy Policy + Terms of Service at stable URL (deploy to rats-web or Vercel static)           | regroup-web       | —     | —     | M     | 2h     |
| P0.6 | Add App Store + Play Store download buttons as primary CTA on rats-web home page                     | regroup-web       | M     | **H** | M     | 1h     |
| P0.7 | App Store submission (screenshots in place via Fastlane, submit to App Store Connect)                | regroup-rn7       | **H** | **H** | **H** | 1d     |

---

### P1 — Revenue Activation (Days 7–30)

| #    | Item                                                                                                | Repo              | U     | A     | R     | Effort |
| ---- | --------------------------------------------------------------------------------------------------- | ----------------- | ----- | ----- | ----- | ------ |
| P1.1 | PaymentDashboard: "Overdue Residents" card (sorted by amount, tap-to-message)                       | regroup-rn7       | **H** | —     | **H** | 1d     |
| P1.2 | PaymentDashboard: manual payment recording (Cash/Check/Venmo/Zelle + FAB)                           | regroup-rn7       | **H** | —     | **H** | 1.5d   |
| P1.3 | PaymentDashboard: date filter pills + revenue summary stats (Total / Outstanding / Collection Rate) | regroup-rn7       | M     | —     | M     | 1d     |
| P1.4 | Auto-pay enrollment: "Save card" checkbox + auto-pay toggle on RentPaymentScreen                    | regroup-rn7       | **H** | —     | **H** | 2d     |
| P1.5 | `scheduledRentCollection` Cloud Function (charge saved methods on due date)                         | regroup-functions | M     | —     | **H** | 2d     |
| P1.6 | Payment confirmation email via SendGrid on `payment_intent.succeeded` webhook                       | regroup-functions | **H** | —     | M     | 1d     |
| P1.7 | Manager overdue-rent push notification (3+ days past due)                                           | regroup-functions | M     | —     | **H** | 1d     |
| P1.8 | CI/CD for regroup-functions: GitHub Actions build + test + deploy on merge to main                  | regroup-functions | M     | —     | M     | 1d     |
| P1.9 | Oxford onboarding wizard (guided setup after `setOxfordEnabled` upgrade)                            | regroup-rn7       | **H** | **H** | **H** | 3d     |

---

### P2 — Quality + Retention (Days 30–60)

| #     | Item                                                                                                                                       | Repo                            | U     | A   | R     | Effort |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- | ----- | --- | ----- | ------ |
| P2.1  | Resident TodayView: daily schedule, chore today, dues today, tonight's meeting                                                             | regroup-rn7                     | **H** | —   | M     | 3d     |
| P2.2  | Push notification accountability loop (complete all 6 triggers)                                                                            | regroup-rn7                     | **H** | —   | M     | 2d     |
| P2.3  | Oxford officer rotation reminder (30-day expiry notification)                                                                              | regroup-rn7 + regroup-functions | M     | M   | M     | 2d     |
| P2.4  | EES auto-recalculation Firestore trigger on guest add/remove                                                                               | regroup-functions               | M     | —   | M     | 2d     |
| P2.5  | PaymentDashboard: weekly revenue bar chart                                                                                                 | regroup-rn7                     | M     | —   | M     | 1d     |
| P2.6  | PaymentDashboard: CSV export                                                                                                               | regroup-rn7                     | M     | —   | M     | 1d     |
| P2.7  | Phase advancement progress bar wired to `phaseAdvancementQueries.ts`                                                                       | regroup-rn7                     | M     | —   | M     | 1d     |
| P2.8  | "Dispute This" entry point surfaced in ActivityFeed                                                                                        | regroup-rn7                     | M     | —   | —     | 0.5d   |
| P2.9  | Payment success celebration animation (confetti/checkmark)                                                                                 | regroup-rn7                     | M     | —   | M     | 0.5d   |
| P2.10 | Balance badge on tab bar ("$X due")                                                                                                        | regroup-rn7                     | M     | —   | M     | 0.5d   |
| P2.11 | Automated rent reminder scheduled CF                                                                                                       | regroup-functions               | M     | —   | **H** | 1d     |
| P2.12 | `updatePaymentInfo` error return path fix                                                                                                  | regroup-functions               | M     | —   | —     | 2h     |
| P2.13 | Fix 2FA to use Firebase MFA enrollment (not `signInWithPhoneNumber`)                                                                       | regroup-rn7                     | M     | —   | —     | 1.5d   |
| P2.14 | Operator testimonials section on rats-web                                                                                                  | regroup-web                     | —     | M   | M     | 2h     |
| P2.15 | Oxford charter compliance scorecard (extend `CharterCompliance.tsx` with full rule evaluation)                                             | regroup-rn7                     | M     | M   | M     | 2d     |
| P2.16 | Oxford module inline style migration to `StyleSheet.create()` (see `docs/ux-improvements/2026-05-25-oxford-ux-consistency.md`)             | regroup-rn7                     | —     | —   | —     | 1d     |
| P2.17 | Fix pre-existing Oxford TS errors: `navigate('BusinessMeetingDetail', ...)` → `Routes.BusinessMeetingDetail`, `tx.type` possibly undefined | regroup-rn7                     | —     | —   | —     | 2h     |

---

### P3 — Backlog

- **regroup-rn7:** Split payment option ("pay half now, half Friday"), payment receipt deep link, shareable charter compliance PDF, Oxford network directory, anonymous voting toggle, meeting quorum indicator, vote threshold display, `calculateWeeklyHealth` NaN fix
- **regroup-functions:** Rate limiting on HTTP endpoints, dev/staging Firebase project, `migrate-full.ts` data migration execution
- **regroup-web:** Angular 9 → 17+ upgrade (strategic decision: kill vs. upgrade; PRODUCT_STRATEGY_ASSESSMENT recommends kill; minimal investment is the right call)

---

## Section 4: Implementation Plans (P0 + P1)

---

### P0.1 — Verify Deployed Stripe Price IDs

**Status:** UNVERIFIED | **Repo:** regroup-functions | **Effort:** S (30min)  
**Growth Score:** U: — | A: — | R: H

#### What's needed

- [ ] `firebase functions:config:get stripe` (or check Secret Manager in Firebase console)
- [ ] Confirm `STRIPE_HOUSE_PRICE_ID` maps to $49/mo product in Stripe dashboard (not $9.99)
- [ ] Confirm `STRIPE_OXFORD_PRICE_ID` maps to $79/mo product
- [ ] If wrong: create correct products in Stripe test mode first, verify one checkout, then update prod env and redeploy
- [ ] Keep old Price IDs active (not archived) — existing subscriptions reference them

#### Acceptance criteria

- [ ] Stripe dashboard confirms both price IDs resolve to correct amounts
- [ ] One test checkout shows correct price to user before any customer notification

---

### P0.2 — Verify Webhook Writes Payment to Firestore

**Status:** UNVERIFIED | **Repo:** regroup-functions | **Effort:** S (2h)  
**Growth Score:** U: M | A: — | R: H

`listPayments` and `listHousePayments` are only meaningful if `payment_intent.succeeded` events are persisted to the `payments` collection.

#### What's needed

- [ ] Read `functions/src/http/stripeEvents.ts` — confirm it handles `payment_intent.succeeded`
- [ ] Confirm handler writes `{ guestId, houseId, amount, status: 'succeeded', stripeIntentId, createdAt }` to `payments/{intentId}`
- [ ] If not: add the handler — this is the only way `listHousePayments` returns real data
- [ ] Test: use Stripe CLI `stripe trigger payment_intent.succeeded` against local emulator; verify Firestore write

#### Acceptance criteria

- [ ] `stripe trigger payment_intent.succeeded` → Firestore `payments` collection gains a document
- [ ] `listHousePayments` returns that document

---

### P0.3 — Physical Device E2E Payment Test

**Status:** MISSING | **Repo:** regroup-rn7 | **Effort:** M (1d)  
**Growth Score:** U: H | A: — | R: H

#### What's needed

- [ ] Build production-scheme iOS build on physical device
- [ ] Create test house with `stripeConnectId` set (use Stripe test connected account)
- [ ] As a guest: open RentPaymentScreen, tap "Pay Full Due", Stripe PaymentSheet opens, pay with Stripe test card 4242...
- [ ] Verify: payment appears in `listPayments` for guest, appears in `listHousePayments` for admin
- [ ] Verify: `payments/{id}` document exists in Firestore with correct fields
- [ ] Document any friction or error paths encountered

#### Acceptance criteria

- [ ] Resident pays rent on physical device with no errors
- [ ] Admin sees payment in PaymentDashboard within 10 seconds
- [ ] Firestore document confirms correct `amount`, `houseId`, `guestId`, `status: "succeeded"`

---

### P0.4 — Replace Billing Portal with Stripe Customer Portal

**Status:** MISSING | **Repo:** regroup-web | **Effort:** S (4h)  
**Growth Score:** U: M | A: — | R: H  
**Strategic context:** PRODUCT_STRATEGY_ASSESSMENT recommends killing `rats-web` as an active development surface. This is the first step: neutralize the `my-account` billing component so it can't create wrong-priced customers.

#### What's needed

- [ ] In Stripe dashboard: enable Customer Portal (Settings → Billing → Customer Portal)
- [ ] Configure portal: allow plan changes, cancel subscription, view invoices, update card
- [ ] In `my-account.component.ts`: replace Stripe card management UI with a single "Manage Billing" button that calls `stripe.billingPortal.sessions.create()` (via a new minimal Cloud Function or direct API call) and redirects to the Stripe-hosted portal
- [ ] Remove or hide the old `BillingInfoComponent` that shows hardcoded $10/$1 pricing
- [ ] Deploy: `npm run build && firebase deploy --only hosting`

#### Acceptance criteria

- [ ] "Manage Billing" button opens Stripe Customer Portal in a new tab
- [ ] No old $10/$1 pricing visible to any user
- [ ] No Angular billing code actively used for new subscriptions

---

### P0.5 — Host ToS and Privacy Policy at Stable URL

**Status:** MISSING | **Repo:** regroup-web | **Effort:** S (2h)  
**Growth Score:** U: — | A: — | R: M (App Store requires this)

#### What's needed

- [ ] Copy content from `docs/PRIVACY_POLICY.md` and `docs/TERMS_OF_SERVICE.md`
- [ ] Create static Angular routes: `/privacy` and `/terms`
- [ ] These can be simple `[innerHTML]`-rendered components with the existing content
- [ ] Verify URLs are publicly accessible without login
- [ ] Update App Store Connect metadata to reference `regroup.app/privacy` and `regroup.app/terms`

#### Acceptance criteria

- [ ] `https://regroup.app/privacy` returns readable Privacy Policy (no login required)
- [ ] `https://regroup.app/terms` returns readable Terms of Service

---

### P0.6 — App Store + Play Store Download Buttons

**Status:** MISSING | **Repo:** regroup-web | **Effort:** S (1h)  
**Growth Score:** U: M | A: H | R: M

#### What's needed

- [ ] Obtain App Store ID (placeholder `id0000000000` still in place) — this requires App Store submission first, but can use TestFlight link as interim
- [ ] Replace or supplement email-form CTA with "Download on the App Store" + "Get it on Google Play" badge buttons
- [ ] Add to hero section of landing page (`src/app/components/home/` or main marketing component)
- [ ] Link to TestFlight URL until public App Store listing is live, then swap to real link

#### Acceptance criteria

- [ ] Visitor landing on regroup.app can tap "Download" and reach the app (TestFlight or App Store)
- [ ] Both iOS and Android buttons present

---

### P1.1 — PaymentDashboard: "Overdue Residents" Card

**Status:** PARTIAL (basic list exists) | **Repo:** regroup-rn7 | **Effort:** M (1d)  
**Growth Score:** U: H | A: — | R: H  
**Depends on:** P0.3 (payment data flowing end-to-end)

#### What's needed

- [ ] Add "Needs Attention" section at top of `PaymentDashboard` (or `AdminPaymentView`)
- [ ] Query: guests where `rentOwed > 0` and `lastPaymentDate < (today - 3 days)` — use `listHousePayments` + guest data
- [ ] Display sorted by largest overdue amount first; each row shows guest name + amount + days overdue
- [ ] Tap row → navigate to guest profile or messaging screen
- [ ] Empty state: "All residents are current" with green checkmark

#### Acceptance criteria

- [ ] Manager opens dashboard and immediately sees who is behind without scrolling
- [ ] List updates within 30 seconds of a payment being made

---

### P1.2 — Manual Payment Recording

**Status:** MISSING | **Repo:** regroup-rn7 | **Effort:** M (1.5d)  
**Growth Score:** U: H | A: — | R: H

Cash and check payments are invisible to the dashboard today.

#### What's needed

- [ ] FAB ("+" button) on PaymentDashboard opens "Record Payment" modal
- [ ] Fields: Guest (picker), Amount, Method (Cash / Check / Venmo / Zelle / Other), Date, Notes
- [ ] On submit: write to `payments/{id}` with `method: "manual"`, `recordedBy: adminUid`, standard fields
- [ ] Add `allow create: if isAdmin([houseId]);` to Firestore rules for manual payment records (already covered by `allow create: if isHouseAdmin(houseId)` in payments rules — verify this covers the `method: "manual"` write path)
- [ ] Display manual payments in `listHousePayments` with a "Manual" badge

#### Acceptance criteria

- [ ] Admin can record a cash payment in < 30 seconds
- [ ] Manual payment appears in dashboard alongside Stripe payments
- [ ] Manual payments cannot be written by guests (rules enforce admin-only)

---

### P1.4–P1.5 — Auto-Pay Enrollment + `scheduledRentCollection` CF

**Status:** MISSING | **Repos:** regroup-rn7 + regroup-functions | **Effort:** M + M (2d + 2d)  
**Growth Score:** U: H | A: — | R: H  
**Depends on:** P0.3 (payment flow verified end-to-end)

#### regroup-rn7 what's needed

- [ ] "Save card for future payments" checkbox in PaymentSheet flow → call `savePaymentMethod` after success
- [ ] Auto-pay toggle in RentPaymentScreen or HouseSettings (guest-facing)
- [ ] Store `autoPayEnabled: boolean` + `savedPaymentMethodId: string` on guest document
- [ ] Show "Auto-pay: On" indicator with "Edit" link to saved card management

#### regroup-functions what's needed

- [ ] `scheduledRentCollection` CF (pubsub, runs 6am on rent due dates)
- [ ] Query guests where `autoPayEnabled == true` AND `rentOwed > 0` AND due date is today
- [ ] For each: call `stripe.paymentIntents.create` with `payment_method` + `confirm: true` against the house's connected account
- [ ] On success: write to `payments/{id}` (same structure as manual), send confirmation email
- [ ] On failure: notify guest via FCM + notify admin

#### Acceptance criteria

- [ ] Guest enrolls in auto-pay in < 2 minutes
- [ ] On due date, charge runs automatically; guest receives confirmation email
- [ ] Failed charge triggers notifications to both guest and admin within 5 minutes

---

### P1.8 — CI/CD for regroup-functions

**Status:** MISSING | **Repo:** regroup-functions | **Effort:** M (1d)  
**Growth Score:** U: M | A: — | R: M

#### What's needed

- [ ] `.github/workflows/ci.yml`: on PR → `cd functions && npm install && npm run build && npm test`
- [ ] `.github/workflows/deploy.yml`: on push to `main` → deploy to Firebase production
- [ ] Set GitHub secrets: `FIREBASE_SERVICE_ACCOUNT` (base64 of service account JSON), `STRIPE_SECRET_KEY`, `GOOGLE_MAPS_API_KEY`, `SENDGRID_API_KEY`
- [ ] Ensure `firebase deploy --only functions` runs as part of deploy step
- [ ] Smoke test: break a test intentionally, confirm CI fails and blocks merge

#### Acceptance criteria

- [ ] PR cannot merge if TypeScript build fails
- [ ] PR cannot merge if any test fails
- [ ] `main` branch auto-deploys to Firebase on successful CI

---

### P1.9 — Oxford Onboarding Wizard

**Status:** MISSING | **Repo:** regroup-rn7 | **Effort:** L (3d)  
**Growth Score:** U: H | A: H | R: H  
**Depends on:** `setOxfordEnabled` CF (DONE — `fbd5d48`)

The `setOxfordEnabled` CF handles billing. The wizard handles the operator experience of turning on Oxford for their house.

#### What's needed

- [ ] Wizard entry: from OxfordDashboard upgrade CTA (currently opens a static upgrade screen)
- [ ] Screen 1: "What is Oxford House?" — value prop + 3 feature cards + $79/mo pricing + 14-day trial CTA
- [ ] Screen 2 (post-upgrade): "Set up your Officers" → link to OfficerManagement, pre-filled with Oxford roles
- [ ] Screen 3: "Schedule your first Business Meeting" → link to BusinessMeetings with suggested dates
- [ ] Screen 4: "Set up EES" → EES explanation + EES amount entry → link to EESTracker
- [ ] Screen 5: "You're all set" — charter compliance checklist showing which steps are complete
- [ ] Store `oxfordSetupComplete: boolean` on house doc; wizard appears until all 4 setup steps done

#### Acceptance criteria

- [ ] Operator goes from `oxfordEnabled: false` → fully configured Oxford house in < 10 minutes
- [ ] `setOxfordEnabled(true)` is called and Stripe plan migrates to $79/mo before wizard exit
- [ ] Wizard is idempotent (re-enterable if interrupted mid-setup)

---

## Section 5: Cross-Product Sequencing (3-Repo Scope)

```
regroup-functions (backend) → enables regroup-rn7 (mobile) → enables regroup-web (distribution)

P0 verification order:
  ① Verify Stripe Price IDs (30min, no code) ─────────────────────────┐
  ② Verify webhook → Firestore write (2h) ─────────────────────────────┤
  ③ Physical device E2E payment test (1d) ──────────────────────────────┤
                                                                        │
  Only AFTER ①②③ confirmed:
  ④ Replace rats-web billing portal (4h)                               │
  ⑤ Host ToS/Privacy (2h)                                              │
  ⑥ App Store download buttons (1h) ──────────────────────────┐        │
  ⑦ App Store submission (1d) ─────────────────────────────────┘        │
                                                                        │
P1 revenue activation (depends on P0 verification):                    │
  ⑧ PaymentDashboard UX (overdue, manual recording, filters) ──────────┤
  ⑨ Auto-pay: save card UI + scheduledRentCollection CF ───────────────┤
  ⑩ Payment confirmation email ─────────────────────────────────────────┤
  ⑪ Oxford onboarding wizard ───────────────────────────────────────────┤
  ⑫ CI/CD for regroup-functions                                         │
                                                                        ▼
                                                     3-Month Target:
                                                     Payments live in 3+ houses
                                                     Auto-pay enrolled by 20%+
                                                     Oxford pilot with 3+ houses
                                                     $500+/month processing revenue
```

### Integration bridges within these 3 repos

| Bridge                                                       | Status          | Enables                            |
| ------------------------------------------------------------ | --------------- | ---------------------------------- |
| `scheduledRentCollection` CF + auto-pay UI                   | MISSING (P1)    | 20-40% collection rate improvement |
| `payment_intent.succeeded` → Firestore → `listHousePayments` | UNVERIFIED (P0) | Dashboard accuracy                 |
| `setOxfordEnabled` CF (DONE) + Oxford wizard (P1)            | Wizard MISSING  | Oxford upsell funnel               |
| regroup-functions CI + physical device test                  | CI MISSING      | Confidence to deploy               |

---

## Section 6: Confidence Notes

| Item                                                       | Confidence | Note                                                                                    |
| ---------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------- |
| `setOxfordEnabled` CF done                                 | **HIGH**   | git `fbd5d48` — Stripe swap + Firestore rollback                                        |
| `getResidentMeetingAttendance` bridge done                 | **HIGH**   | git `393cd00`                                                                           |
| Oxford screens (OfficerManagement, EESTracker, etc.) done  | **HIGH**   | All files exist with real component code                                                |
| Firestore rules cover Oxford + payments                    | **HIGH**   | `firebase/firestore.rules:136-260` verified                                             |
| Stripe deployed price IDs are correct ($49/$79)            | **LOW**    | Env-var pattern confirmed; actual deployed values unverified — P0.1                     |
| `payment_intent.succeeded` writes to `payments` collection | **LOW**    | `stripeWebhook.ts` exists; handler coverage unverified — P0.2                           |
| Auto-pay CF exists                                         | **NONE**   | Not found in functions; confirmed MISSING                                               |
| CI/CD for regroup-functions                                | **NONE**   | No `.github/workflows/` — confirmed MISSING                                             |
| PaymentDashboard "Overdue Residents" section               | **MEDIUM** | ACTIVE_PLAN says partial; UI gap likely                                                 |
| Push notification 6-trigger loop complete                  | **MEDIUM** | Some triggers exist; full scope unconfirmed                                             |
| rats-web pricing display                                   | **MEDIUM** | Old `housePrice: 10` may still be live — verify before any customer sees subscribe page |
| Phase advancement progress bar wired                       | **LOW**    | Queries confirmed; UI wire explicitly called out as MISSING in ECOSYSTEM_ROADMAP        |

### Verify before shipping anything

1. **Before activating payments marketing:** Run `firebase functions:config:get stripe` and confirm price IDs map to $49/$79 in Stripe
2. **Before marking payment system "live":** Run `stripe trigger payment_intent.succeeded` against the emulator and confirm `payments/{id}` doc is created
3. **Before rats-web subscribe page goes live to customers:** Check `src/app/services/subscriptions/subscription.service.ts` — if `housePrice: number = 10` is still there, kill the page entirely (route to Stripe Customer Portal instead)
4. **Before Oxford pilot outreach:** Confirm `setOxfordEnabled` CF is deployed in production Firebase (`firebase functions:list | grep oxford`)
