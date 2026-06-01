# Full Ecosystem Roadmap — All 5 Repos

**Generated:** 2026-05-24  
**Scope:** regroup-rn7, regroup-functions, regroup-web, RecoveryConnect, detox-recovery  
**Method:** docs-to-roadmap skill v2 (includes regroup-rn7)

---

## Section 0: Source of Truth Verdict

| Doc                                                                | Verdict             | Rationale                                                                                         |
| ------------------------------------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------- |
| `regroup-rn7/docs/ECOSYSTEM_ROADMAP_2026.md`                       | **SOURCE_OF_TRUTH** | Dated 2026-05-24 (today), cross-repo vision, explicitly corrects stale claims in all prior docs   |
| `RecoveryConnect/docs/ROADMAP.md`                                  | **SOURCE_OF_TRUTH** | Updated May 2026, contains definitive V4 completion status and launch-phase roadmap               |
| `RecoveryConnect/docs/REVENUE_OPPORTUNITIES.md`                    | **SOURCE_OF_TRUTH** | May 2026, strikethrough+✅ markers are authoritative completion evidence                          |
| `RecoveryConnect/docs/LAUNCH_BLOCKERS.md`                          | **SOURCE_OF_TRUTH** | 2026-04-14, manual action checklist — no code, so not superseded by git                           |
| `detox-recovery/docs/delivery-gaps.md`                             | **SOURCE_OF_TRUTH** | Authoritative for detox-recovery; Stripe links are live, delivery is confirmed broken             |
| `regroup-rn7/docs/superpowers/specs/2026-05-23-current-roadmap.md` | **SUPPORTING**      | rn7-specific detail; P1 migrations listed as MISSING — **git disproves this** (M1/M2/M3 all done) |
| `regroup-rn7/docs/STRATEGIC_PLATFORM_ASSESSMENT_2026.md`           | **SUPPORTING**      | Strategic context; implementation status claims stale — ECOSYSTEM_ROADMAP corrects them           |
| `regroup-functions/.full-review/05-final-report.md`                | **SUPPORTING**      | Current-state security/quality snapshot (78 findings)                                             |
| `RecoveryConnect/docs/push-notifications-treasury-features.md`     | **ARCHIVE**         | Dec 2025 features — all done per ROADMAP.md                                                       |
| `regroup-rn7/docs/prompt-answers/docs-to-roadmap-05-24-2026.md`    | **ARCHIVE**         | First pass (before rn7 included); references docs that didn't exist                               |

---

## Section 1: Doc Audit Summary

### regroup-rn7 docs

| Doc                                                    | Last Updated | Status                                   |
| ------------------------------------------------------ | ------------ | ---------------------------------------- |
| `docs/ECOSYSTEM_ROADMAP_2026.md`                       | 2026-05-24   | SOURCE_OF_TRUTH                          |
| `docs/superpowers/specs/2026-05-23-current-roadmap.md` | 2026-05-23   | SUPPORTING (M1/M2/M3 stale)              |
| `docs/STRATEGIC_PLATFORM_ASSESSMENT_2026.md`           | ~2026-05     | SUPPORTING (implementation status stale) |
| `CLAUDE.md`                                            | Current      | Architecture reference (always relevant) |

### RecoveryConnect docs (16 docs in docs/)

| Doc                                            | Status                    |
| ---------------------------------------------- | ------------------------- |
| `docs/ROADMAP.md`                              | SOURCE_OF_TRUTH           |
| `docs/REVENUE_OPPORTUNITIES.md`                | SOURCE_OF_TRUTH           |
| `docs/LAUNCH_BLOCKERS.md`                      | SOURCE_OF_TRUTH           |
| `docs/BILLING_AND_PAYMENTS.md`                 | SUPPORTING                |
| `docs/03-integration-treatment-centers.md`     | SUPPORTING (B2B strategy) |
| `docs/BUSINESS_MODEL.md`                       | SUPPORTING                |
| `docs/MARKET_INTELLIGENCE.md`                  | SUPPORTING                |
| `docs/push-notifications-treasury-features.md` | ARCHIVE                   |

### detox-recovery docs

| Doc                     | Status          |
| ----------------------- | --------------- |
| `docs/delivery-gaps.md` | SOURCE_OF_TRUTH |
| `docs/features.md`      | SUPPORTING      |

### regroup-functions / regroup-web

| Doc                                                 | Status                         |
| --------------------------------------------------- | ------------------------------ |
| `regroup-functions/CLAUDE.md`                       | Architecture reference         |
| `regroup-functions/.full-review/05-final-report.md` | SUPPORTING (security snapshot) |
| `regroup-web/CLAUDE.md`                             | Architecture reference         |

---

## Section 2: Implementation Status Matrix

Only MISSING / PARTIAL / BLOCKED items shown. All confirmed-DONE items excluded.

### detox-recovery

| Requirement                                                    | Status      | Source           |
| -------------------------------------------------------------- | ----------- | ---------------- |
| PDF delivery for 5 paid products (Stripe live, zero delivery)  | **PARTIAL** | delivery-gaps.md |
| Lead magnet delivery (3 guides — email captured, nothing sent) | **PARTIAL** | delivery-gaps.md |
| Lemon Squeezy integration                                      | **MISSING** | delivery-gaps.md |
| Thank-you page post-purchase                                   | **MISSING** | delivery-gaps.md |
| Custom domain                                                  | **MISSING** | delivery-gaps.md |
| Analytics + error monitoring                                   | **MISSING** | delivery-gaps.md |
| MailerLite nurture sequences                                   | **MISSING** | delivery-gaps.md |

### RecoveryConnect

| Requirement                                                | Status      | Source                    |
| ---------------------------------------------------------- | ----------- | ------------------------- |
| Run claim-and-pay flow end-to-end (manual)                 | **MISSING** | LAUNCH_BLOCKERS #1        |
| App Store / Google Play submission                         | **MISSING** | LAUNCH_BLOCKERS #2        |
| Firebase Auth authorized domains configured                | **MISSING** | LAUNCH_BLOCKERS #3        |
| Email sender spam fix (verification email)                 | **MISSING** | LAUNCH_BLOCKERS #4        |
| Stripe production key verified on deployed web             | **MISSING** | LAUNCH_BLOCKERS #6        |
| Stripe prices set for intergroup Tier A + Tier B           | **MISSING** | REVENUE_OPPORTUNITIES #10 |
| Verify Stripe price interval is annual                     | **MISSING** | REVENUE_OPPORTUNITIES #4  |
| `getMeetingAttendance` deployment verified + RATS-callable | **PARTIAL** | ROADMAP.md P1             |
| Trial rate limiting (multi-trial abuse)                    | **MISSING** | REVENUE_OPPORTUNITIES #8  |
| Forgot-password flow on web                                | **MISSING** | LAUNCH_BLOCKERS #9        |
| Custom domain (homegroups-app.com)                         | **MISSING** | LAUNCH_BLOCKERS #5        |
| SEO: flip `noindex` → `index` on unclaimed groups          | **MISSING** | ROADMAP.md P2             |
| Rate limit `getPublicGroupProfile`                         | **MISSING** | LAUNCH_BLOCKERS #10       |

### regroup-rn7 (RATS)

**Confirmed DONE (excluded):** M1 timestamps, M2 ActivityType enum, M3 meetingsSlice→RQ, Oxford module, chore rotation (auto-advance + photo evidence), documents, admin reporting, multi-house bundle, stale payment indicator, application workflow, guest discharge.

| Requirement                                                                    | Status          | Source                     |
| ------------------------------------------------------------------------------ | --------------- | -------------------------- |
| Rotate 3 Firebase service account keys + BFG purge                             | **MISSING**     | security audit             |
| Rotate SendGrid API key from `scripts/send-launch-emails.js`                   | **MISSING**     | security audit             |
| Rotate Sentry token from `ios/sentry.properties`                               | **MISSING**     | security audit             |
| Fix `guest-archive` Firestore rule (SUD PII exposed to any signed-in user)     | **MISSING**     | ECOSYSTEM_ROADMAP / 42 CFR |
| Remove E2E test accounts from production Firestore                             | **MISSING**     | ECOSYSTEM_ROADMAP          |
| App Store submission (HIPAA consult, Privacy Policy at stable URL, ToS)        | **MISSING**     | ECOSYSTEM_ROADMAP          |
| Stripe subscription products verified in production ($49/$79 not $9.99/$19.99) | **PARTIAL**     | ECOSYSTEM_ROADMAP          |
| `oxfordEnabled` dual-source unification via `setOxfordEnabled` CF              | **PARTIAL**     | ECOSYSTEM_ROADMAP          |
| Oxford onboarding wizard in RATS UI                                            | **MISSING**     | ECOSYSTEM_ROADMAP          |
| Resident TodayView (day schedule, chore today, dues today, tonight's meeting)  | **MISSING**     | ECOSYSTEM_ROADMAP          |
| Push notification accountability loop (sent → read → action)                   | **MISSING**     | 2026-05-23 roadmap         |
| Auto-pay / recurring rent                                                      | **MISSING**     | ECOSYSTEM_ROADMAP          |
| Bulk guest CSV import                                                          | **MISSING**     | ECOSYSTEM_ROADMAP          |
| `getOverallPercentage` hardcoded `return 0` bug                                | **MISSING fix** | ECOSYSTEM_ROADMAP          |
| Automated rent reminders (in functions)                                        | **MISSING**     | ECOSYSTEM_ROADMAP          |

### regroup-functions

**Confirmed DONE (excluded):** `createPaymentIntent`, `listPayments`, `listHousePayments`, 2% application fee, caller auth on `createPaymentIntent`, `getResidentMeetingAttendance`, `setOxfordEnabled`, RTDB deny-all rules, env-var-driven pricing.

| Requirement                                                                                                                                                                                 | Status      | Source          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------------- |
| Rotate Google Maps API key (live in `api/api.ts:6`)                                                                                                                                         | **MISSING** | .full-review/05 |
| Rotate SendGrid API key (in git history `scripts/.env`, commit `0c927a9`)                                                                                                                   | **MISSING** | .full-review/05 |
| Fix privilege escalation: `addNewHouseAdmin`, `addAdminAuthorization`, `promoteGuestsToAdmin`, `removePrivilegesForGuests`, `givePotentialSuperAdminPrivilege` missing `assertHouseAdmin()` | **MISSING** | .full-review/05 |
| Remove SSN from plaintext `entities/User.ts:30`                                                                                                                                             | **MISSING** | .full-review/05 |
| Add server-side Firestore security rules                                                                                                                                                    | **MISSING** | .full-review/05 |
| CI/CD pipeline (GitHub Actions)                                                                                                                                                             | **MISSING** | .full-review/05 |
| Dev / staging Firebase project (currently single project = prod)                                                                                                                            | **MISSING** | .full-review/05 |
| Fix `updatePaymentInfo` error return path (returns undefined on error)                                                                                                                      | **MISSING** | .full-review/05 |
| Fix `calculateWeeklyHealth` NaN division (zero-denominator crash)                                                                                                                           | **MISSING** | .full-review/05 |
| Fix `mapCRMeeting` AM/PM parsing bug                                                                                                                                                        | **MISSING** | .full-review/05 |
| Upgrade `axios@0.19.2` (5 known CVEs)                                                                                                                                                       | **MISSING** | .full-review/05 |
| Unify Stripe client instantiation (3 strategies across codebase)                                                                                                                            | **MISSING** | .full-review/05 |
| Test coverage: privilege escalation paths, webhook idempotency, `calculateWeeklyHealth`                                                                                                     | **MISSING** | .full-review/05 |

### regroup-web

| Requirement                                                                   | Status      | Source            |
| ----------------------------------------------------------------------------- | ----------- | ----------------- |
| App Store + Google Play download buttons (current `id0000000000` placeholder) | **MISSING** | ECOSYSTEM_ROADMAP |
| Stripe checkout flow (currently email-only for operators)                     | **MISSING** | ECOSYSTEM_ROADMAP |
| Operator testimonial section                                                  | **MISSING** | ECOSYSTEM_ROADMAP |
| Angular 9 → 17+ framework upgrade                                             | **MISSING** | CLAUDE.md         |

---

## Section 3: Growth-Optimized Roadmap

Growth axes: **Usability** (removes friction from critical flow), **Acquisition** (creates distribution), **Revenue** (directly drives MRR).

---

### P0 — Do This Week (Blockers + Revenue Leaks)

| #     | Item                                                                                       | Repo              | Usability | Acquisition | Revenue | Effort |
| ----- | ------------------------------------------------------------------------------------------ | ----------------- | --------- | ----------- | ------- | ------ |
| P0.1  | PDF delivery via Lemon Squeezy (5 paying customers receiving nothing)                      | detox-recovery    | H         | L           | H       | M      |
| P0.2  | Lead magnet delivery + thank-you page (3 guides ready to write/deploy)                     | detox-recovery    | H         | H           | M       | M      |
| P0.3  | Run claim-and-pay flow end-to-end (manual; no real funnel tested)                          | RecoveryConnect   | H         | H           | H       | S      |
| P0.4  | Firebase Auth authorized domains + email sender spam fix                                   | RecoveryConnect   | H         | H           | H       | S      |
| P0.5  | Stripe production key verification on deployed RC web                                      | RecoveryConnect   | L         | L           | H       | S      |
| P0.6  | RC App Store + Google Play submission                                                      | RecoveryConnect   | H         | H           | H       | M      |
| P0.7  | Rotate live Google Maps + SendGrid API keys (regroup-functions)                            | regroup-functions | L         | L           | H       | S      |
| P0.8  | Fix privilege escalation: add `assertHouseAdmin()` to 5 callable handlers                  | regroup-functions | L         | L           | H       | S      |
| P0.9  | Rotate 3 Firebase service account keys + BFG history purge (regroup-rn7)                   | regroup-rn7       | L         | L           | H       | M      |
| P0.10 | Fix `guest-archive` Firestore rule (SUD PII exposed to all signed-in users; 42 CFR Part 2) | regroup-rn7       | L         | L           | H       | S      |
| P0.11 | Rotate SendGrid + Sentry tokens from rn7 source / iOS properties                           | regroup-rn7       | L         | L           | H       | S      |
| P0.12 | Remove SSN from plaintext `entities/User.ts:30`                                            | regroup-functions | L         | L           | H       | S      |

---

### P1 — Next Sprint (Revenue Activation, 7–30 days)

| #     | Item                                                                                 | Repo              | Usability | Acquisition | Revenue | Effort |
| ----- | ------------------------------------------------------------------------------------ | ----------------- | --------- | ----------- | ------- | ------ |
| P1.1  | Set Stripe prices for intergroup Tier A + Tier B in Stripe dashboard                 | RecoveryConnect   | L         | L           | H       | S      |
| P1.2  | Verify Stripe annual price interval (currently no `interval: 'year'` assertion)      | RecoveryConnect   | L         | L           | H       | S      |
| P1.3  | Verify `getMeetingAttendance` deployed + RATS-callable                               | RecoveryConnect   | M         | M           | H       | S      |
| P1.4  | Verify RATS Stripe products in production ($49/mo House, $79/mo Oxford)              | regroup-rn7       | L         | L           | H       | S      |
| P1.5  | `oxfordEnabled` dual-source unification (atomic `setOxfordEnabled` CF call)          | regroup-rn7       | H         | L           | H       | M      |
| P1.6  | App Store + Play Store download buttons on regroup-web                               | regroup-web       | H         | H           | H       | S      |
| P1.7  | Oxford onboarding wizard in RATS UI                                                  | regroup-rn7       | H         | M           | H       | L      |
| P1.8  | Add Firestore server-side security rules (currently no rule enforcement beyond RTDB) | regroup-functions | L         | L           | H       | M      |
| P1.9  | GitHub Actions CI/CD pipeline for regroup-functions                                  | regroup-functions | M         | L           | M       | M      |
| P1.10 | Bug fixes: `updatePaymentInfo`, `calculateWeeklyHealth`, `mapCRMeeting` AM/PM        | regroup-functions | M         | L           | M       | S      |
| P1.11 | Dev / staging Firebase project (stop testing on prod)                                | regroup-functions | M         | L           | M       | L      |
| P1.12 | rn7 App Store submission (HIPAA legal consult, Privacy Policy + ToS at stable URL)   | regroup-rn7       | H         | H           | H       | L      |

---

### P2 — Next 60 Days

| #     | Item                                                                          | Repo              | Usability | Acquisition | Revenue | Effort |
| ----- | ----------------------------------------------------------------------------- | ----------------- | --------- | ----------- | ------- | ------ |
| P2.1  | Resident TodayView (day schedule, chore today, dues today, tonight's meeting) | regroup-rn7       | H         | M           | M       | L      |
| P2.2  | Push notification accountability loop (sent → read → action)                  | regroup-rn7       | H         | M           | M       | M      |
| P2.3  | Automated rent reminders (functions scheduled trigger)                        | regroup-functions | H         | L           | H       | M      |
| P2.4  | Trial rate limiting (multi-trial abuse prevention)                            | RecoveryConnect   | L         | L           | M       | S      |
| P2.5  | Forgot-password on RC web claim page                                          | RecoveryConnect   | H         | M           | M       | S      |
| P2.6  | Custom domain `homegroups-app.com` (multi-file coordinated switch)            | RecoveryConnect   | M         | H           | M       | M      |
| P2.7  | Flip `noindex` → `index` on unclaimed RC groups (~100 claimed)                | RecoveryConnect   | L         | H           | M       | S      |
| P2.8  | Auto-pay / recurring rent                                                     | regroup-rn7       | H         | L           | H       | L      |
| P2.9  | MailerLite nurture sequences for 3 lead magnet groups                         | detox-recovery    | M         | H           | M       | M      |
| P2.10 | Custom domain + analytics + error monitoring for detox-recovery               | detox-recovery    | M         | M           | M       | S      |
| P2.11 | Upgrade `axios@0.19.2` (5 CVEs) in regroup-functions                          | regroup-functions | L         | L           | L       | S      |
| P2.12 | Stripe checkout flow for regroup-web (replace email-only operator signup)     | regroup-web       | H         | H           | H       | L      |

---

### P3 — Backlog

- **regroup-rn7:** Bulk guest CSV import, Oxford network directory, `getOverallPercentage` return 0 fix
- **regroup-functions:** Stripe client unification (3 strategies → 1), test coverage expansion, `axios` sentinel test
- **RecoveryConnect:** SEO-friendly group URL slugs (replace SHA hash), rate limit `getPublicGroupProfile`, iOS App Store Review optimization
- **regroup-web:** Angular 9 → 17+ upgrade, operator testimonial section
- **RecoveryConnect:** Treatment center landing page + `createFacility` onboarding flow (Facility Dashboard is done; sales page is not)

---

**Excluded from roadmap (DONE — verified by git or ✅ doc markers):**

_regroup-rn7:_ M1/M2/M3 migrations, Oxford module, chore rotation (auto-advance + photo evidence), documents, admin reporting, multi-house bundle, stale payment indicator, application workflow, guest discharge, balance aging, CSV export.

_regroup-functions:_ `createPaymentIntent`, `listPayments`, `listHousePayments`, 2% application fee, RTDB deny-all rules, env-var pricing, `getResidentMeetingAttendance`, `setOxfordEnabled`, caller auth on `createPaymentIntent`.

_RecoveryConnect:_ V1–V4 features, subscription gates, trial/renewal notifications, treatment center checkout, intergroup upgrade flow, facility dashboard (`getFacilityEngagementMetrics` + `FacilityDashboardPage`), treasury report gate, QR check-in, year-end summary trigger, 7th Tradition donation callout, admin email passed to Stripe, `getMeetingAttendance` endpoint (code exists, deployment unverified).

---

## Section 4: Implementation Plan

---

### P0.1 — PDF Delivery via Lemon Squeezy

**Status:** PARTIAL (customers paying, no delivery)  
**Source:** `detox-recovery/docs/delivery-gaps.md`  
**Tier:** P0  
**Growth Score:** Usability: H | Acquisition: L | Revenue: H  
**Effort:** M (2–3 days)

#### What's needed

- [ ] Create Lemon Squeezy account and set up as Merchant of Record
- [ ] Upload 5 PDFs to Lemon Squeezy product library
- [ ] Create products matching existing Stripe prices: $19.99 Family Guide, $9.99 × 4
- [ ] Replace Stripe payment links on detox-recovery pages with Lemon Squeezy links
- [ ] Verify Lemon Squeezy delivers file on purchase (automated email delivery)
- [ ] Write and deploy a simple thank-you redirect page post-purchase

#### Acceptance criteria

- [ ] Test purchase completes and buyer receives PDF within 60 seconds
- [ ] Existing Stripe links either redirected or replaced (no broken payment links)
- [ ] Thank-you page confirms purchase and sets expectation for delivery email

---

### P0.2 — Lead Magnet Delivery

**Status:** PARTIAL (email captured via MailerLite, content not written/delivered)  
**Source:** `detox-recovery/docs/delivery-gaps.md`  
**Tier:** P0  
**Growth Score:** Usability: H | Acquisition: H | Revenue: M  
**Effort:** M (2–3 days to write content + wire delivery)

#### What's needed

- [ ] Write Guide 1: "First 72 Hours" (urgent crisis guide — highest-intent subscribers)
- [ ] Write Guide 2: "Family Handbook" (supporting families through early recovery)
- [ ] Write Guide 3: "What to Expect" (process/timeline guide)
- [ ] Upload each as PDF and wire MailerLite automation: subscribe → instant deliver
- [ ] Test all 3 signup flows end-to-end (form submit → email receive → PDF download)

#### Acceptance criteria

- [ ] All 3 MailerLite groups have at least 1 automation active
- [ ] Subscriber receives guide within 5 minutes of signup
- [ ] No broken download links

---

### P0.3 — RecoveryConnect Manual Launch Blockers

**Status:** MISSING (all manual; none require code)  
**Source:** `docs/LAUNCH_BLOCKERS.md`  
**Tier:** P0  
**Growth Score:** Usability: H | Acquisition: H | Revenue: H  
**Effort:** S (< 1 day if done in sequence)

#### What's needed

- [ ] Firebase Console → Auth → Authorized Domains: confirm `recovery-connect-cad4b.web.app`, `.firebaseapp.com`, `localhost`
- [ ] Firebase Console → Auth → Templates → Email verification: customize sender name to "Homegroups"; send test to Gmail; verify inbox not spam
- [ ] DevTools → Network → filter `stripe.com`: confirm `pk_live_` not `pk_test_` on deployed web
- [ ] Run full claim-and-pay flow in incognito: pick group, Google + email/password sign-in, Stripe checkout with real card, verify `isClaimed: true` in Firestore, confirm admin access in mobile app
- [ ] Document every friction point encountered — bring the list back

#### Acceptance criteria

- [ ] Google OAuth works on deployed web (no "popup closed" errors)
- [ ] Email verification lands in Gmail inbox (not spam)
- [ ] Stripe key is confirmed `pk_live_`
- [ ] At least one full claim flow completed by a real human on real mobile hardware

---

### P0.4 — RecoveryConnect App Store Submission

**Status:** MISSING  
**Source:** `docs/LAUNCH_BLOCKERS.md`, `docs/ROADMAP.md`  
**Tier:** P0  
**Growth Score:** Usability: H | Acquisition: H | Revenue: H  
**Effort:** M (1–3 days; Apple review 1–7 days)

#### What's needed

- [ ] App Store Connect: create app record, fill metadata, screenshots
- [ ] Legal review of WebView Stripe checkout (Apple may require IAP for subscriptions — verify policy)
- [ ] Privacy Policy at a stable URL (required by both stores)
- [ ] Submit for Apple review; submit to Google Play
- [ ] After approval: replace placeholder `id0000000000` in `web/src/lib/deepLinks.js:9`

#### Acceptance criteria

- [ ] Both stores: submitted (not necessarily approved — review takes time)
- [ ] Real App Store ID documented and CTA link updated

---

### P0.5–P0.12 — Security / Secret Rotation (Both Repos)

**Status:** MISSING  
**Source:** `.full-review/05-final-report.md`, security audit  
**Tier:** P0  
**Growth Score:** Usability: L | Acquisition: L | Revenue: H (prevents catastrophic compliance/legal event)  
**Effort:** M (2–3 days including BFG purge)

#### regroup-functions secrets

- [ ] Rotate Google Maps API key: generate new key in GCP console, restrict to Cloud Functions IP range, update Firebase function config, verify geohash queries still work
- [ ] Rotate SendGrid API key: generate new key, update Firebase function config, confirm `0c927a9` is purged from git history via BFG
- [ ] Remove SSN field from `entities/User.ts:30` — replace with a flag or encrypt at rest
- [ ] Add `assertHouseAdmin(context, data.houseId)` to 5 privilege escalation vectors: `addNewHouseAdmin`, `addAdminAuthorization`, `promoteGuestsToAdmin`, `removePrivilegesForGuests`, `givePotentialSuperAdminPrivilege`

#### regroup-rn7 secrets

- [ ] Rotate 3 Firebase service account keys (confirm which 3 are in git history, generate new in Firebase console, update deploy config)
- [ ] BFG history purge for all rotated keys in regroup-rn7 repo
- [ ] Rotate SendGrid key from `scripts/send-launch-emails.js`
- [ ] Rotate Sentry token from `ios/sentry.properties`
- [ ] Remove E2E test accounts from production Firestore (scripts/cleanup or manual Firestore console)

#### guest-archive Firestore rule fix

```
// WRONG (current — any signed-in user can read all guest archives, exposing SUD PII)
allow read: if signedIn();

// CORRECT — restrict to guests/admins of that specific house
allow read: if isGuestOrAdmin([resource.data.houseId]);
```

File: `firestore.rules` in the regroup-rn7 / regroup-functions deploy config.

#### Acceptance criteria

- [ ] All rotated keys confirmed active; old keys revoked in respective consoles
- [ ] BFG purge run; force-push + team notified to re-clone
- [ ] `guest-archive` rule deploys and `firebase emulators:exec` tests pass
- [ ] No SSN field in any Firestore document going forward

---

### P1.5 — `oxfordEnabled` Dual-Source Unification

**Status:** PARTIAL  
**Source:** `ECOSYSTEM_ROADMAP_2026.md`  
**Tier:** P1  
**Growth Score:** Usability: H | Acquisition: L | Revenue: H  
**Effort:** M (1–3 days)

#### What's needed

- [ ] Confirm `setOxfordEnabled` CF exists and signature (`houseId`, `enabled: boolean`)
- [ ] CF should atomically: (a) set `houses/{houseId}.oxfordEnabled`, (b) set `user.subscriptionMetadata.oxfordEnabled` for all admins of that house, (c) update Stripe subscription item if tier change
- [ ] Remove RATS UI gate that reads from `user.subscriptionMetadata.oxfordEnabled` directly — all Oxford gates should read from `houses/{houseId}.oxfordEnabled` only
- [ ] Integration test: toggle oxford on → check both write paths → toggle off → verify rollback

#### Acceptance criteria

- [ ] A single call to `setOxfordEnabled` is the only way to change Oxford status
- [ ] Both Firestore fields and billing status are always consistent after the call
- [ ] No UI reads `user.subscriptionMetadata.oxfordEnabled` directly

---

### P1.7 — Oxford Onboarding Wizard

**Status:** MISSING  
**Source:** `ECOSYSTEM_ROADMAP_2026.md`  
**Tier:** P1  
**Growth Score:** Usability: H | Acquisition: M | Revenue: H  
**Effort:** L (3–7 days)

#### What's needed

- [ ] Screen 1: Oxford intro — what it enables (network directory, charter compliance, EES)
- [ ] Screen 2: Stripe upsell — upgrade from $49/mo to $79/mo Oxford tier (trigger `setOxfordEnabled(true)`)
- [ ] Screen 3: Oxford Charter setup (import charter compliance from existing Oxford module)
- [ ] Screen 4: EES configuration
- [ ] Screen 5: Confirmation + "Your house is now Oxford-enabled"
- [ ] Wire upgrade success → re-fetch subscription status → gate Oxford screens

#### Acceptance criteria

- [ ] Operator can go from `oxfordEnabled: false` to fully configured Oxford house in < 5 minutes
- [ ] Stripe billing correctly switches to $79/mo tier after wizard completion
- [ ] Wizard is idempotent (safe to re-enter if interrupted)

---

### P1.8 — Firestore Server-Side Security Rules

**Status:** MISSING  
**Source:** `.full-review/05-final-report.md`  
**Tier:** P1  
**Growth Score:** Usability: L | Acquisition: L | Revenue: H  
**Effort:** M (2–3 days)

#### What's needed

- [ ] Write rules for all collections (see `regroup-functions/CLAUDE.md` collection list): `users`, `houses`, `guests`, `guest-weeks`, `admins`, `notifications`, `na-meetings`, `meetings`, `payments`, `stripeEvents`, `contact`, `guest-archive`
- [ ] Key invariants: only house admins can write `houses/{id}`; only guests/admins of a house can read `guests`; `guest-archive` restricted per note in P0 above; `stripeEvents` write-only from server; `na-meetings` read-only
- [ ] Deploy and run `firebase emulators:exec` to validate rule coverage
- [ ] Add rule coverage test suite

#### Acceptance criteria

- [ ] `firebase deploy --only firestore:rules` succeeds
- [ ] Emulator tests cover: unauthenticated access (denied), cross-house access (denied), own-house access (allowed)

---

### P1.9 — CI/CD Pipeline for regroup-functions

**Status:** MISSING  
**Source:** `.full-review/05-final-report.md`  
**Tier:** P1  
**Growth Score:** Usability: M | Acquisition: L | Revenue: M  
**Effort:** M (1–3 days)

#### What's needed

- [ ] `.github/workflows/ci.yml`: on PR → build TypeScript → run `npm test` → lint
- [ ] `.github/workflows/deploy.yml`: on push to `main` → deploy to production Firebase
- [ ] Set GitHub secrets: `FIREBASE_SERVICE_ACCOUNT`, `STRIPE_SECRET_KEY`, `SENDGRID_API_KEY`, `GOOGLE_MAPS_API_KEY` (all rotated in P0 first)
- [ ] Stripe price interval assertion: CI test that fetches `$PRODUCT_ID` default price, asserts `interval === 'month'` (or `year` for annual products)

#### Acceptance criteria

- [ ] PRs blocked from merge if TypeScript build fails
- [ ] `main` deploys automatically to Firebase on successful CI
- [ ] No secrets in any CI config files

---

## Section 5: Cross-Product Sequencing

The RecoveryConnect ROADMAP.md defines the ecosystem sequencing. Updated with current verification:

```
detox-recovery (NOW — parallel, independent)
  └─ P0: PDF delivery via Lemon Squeezy (5 paying customers receiving nothing)
  └─ P0: Lead magnet delivery (write 3 guides, wire MailerLite)
  └─ P1: Custom domain + analytics + MailerLite nurture sequences

RecoveryConnect (NOW — launch execution)
  ├─ P0: Manual launch blockers (Auth domains, email sender, Stripe key, claim-and-pay)
  ├─ P0: App Store submission
  ├─ P1: Set intergroup Stripe prices (Tier A/B) — BLOCKS intergroup revenue
  ├─ P1: Verify getMeetingAttendance callable ──────────────────────────────────┐
  └─ P2: Evaluate trial-to-paid conversion rate                                │
         If > 30%: scale outreach                                               │
         If < 30%: fix trial experience before adding features                  │
                                                                               │
regroup-functions (NOW — security first, then enablers)                        │
  ├─ P0: Secret rotation + privilege escalation fix                            │
  ├─ P1: Firestore security rules + CI/CD                                      │
  └─ P1: Bug fixes (updatePaymentInfo, calculateWeeklyHealth, mapCRMeeting)   │
                                                                               │
regroup-rn7 (Months 1–3 — RATS Sprint 1-3)                                    │
  ├─ P0: Security (secrets, guest-archive rule, E2E test accounts)             │
  ├─ P0: App Store submission                                                  │
  ├─ P1: Stripe production products verified                                   │
  ├─ P1: oxfordEnabled unification                                             │
  ├─ P1: Oxford onboarding wizard ─────────────────────────────────────────────┤
  ├─ P1: Resident TodayView                                                    │
  └─ P2: Auto-pay, push accountability, rent reminders                         │
                                                                               ↓
Integration Bridges (when both sides ready)
  getMeetingAttendance HTTP endpoint (RC) ←→ RATS cross-project call
  Enables: treatment center Facility Dashboard data, Oxford compliance proof,
           "Homegroup attendance verified by RC" feature in RATS
                                                                               ↓
Oxford Pilot (Month 6)
  └─ Oxford Houses using RATS for house management + RC for homegroup tracking
     │ Free tier drives adoption; chapter premium ($200–500/month)
     └─ Requires: Oxford wizard (P1), getMeetingAttendance verified (P1)
                                                                               ↓
Aftercare Management System (Month 8) — NEW PRODUCT
  ├─ Next.js, GCP Cloud Run, PostgreSQL (HIPAA BAA required)
  ├─ Treatment center onboarding → sober living referral → meeting assignment
  └─ Reads from: RecoveryConnect meetingInstances, RATS directory API
     ← Requires: getMeetingAttendance stable, RATS operator base > 20
                                                                               ↓
Enterprise Sales (Month 10)
  └─ 3–5 paying treatment centers at $800–$3K/month
     ← Requires: Aftercare + Facility Dashboard + RATS Sprint 1–2
```

### Integration Bridges Status

| Bridge                                          | RC Side                  | RATS Side                    | Unblocks                                |
| ----------------------------------------------- | ------------------------ | ---------------------------- | --------------------------------------- |
| `getMeetingAttendance` HTTP endpoint            | EXISTS (verify deployed) | MISSING (cross-project call) | Treatment center B2B, Oxford compliance |
| `createIntergroup(type: "treatment_center")`    | ✅ DONE                  | N/A                          | B2B checkout                            |
| `checkInToMeeting` → QR code                    | ✅ DONE                  | N/A                          | RC member adoption                      |
| RATS Facility Dashboard                         | N/A                      | MISSING                      | Enterprise sales                        |
| Shared user identity (RATS operator ↔ RC admin) | N/A                      | MISSING                      | SSO for combined accounts               |

### Revenue Timeline (updated)

| Month | Source          | Event                                            | Est. MRR               |
| ----- | --------------- | ------------------------------------------------ | ---------------------- |
| Now   | detox-recovery  | Fix PDF delivery (customers already paying)      | +$100–200              |
| 1–2   | RecoveryConnect | First groups claim + pay ($12/year)              | +$10–50                |
| 1–2   | RATS            | Existing operators at new pricing ($49/mo)       | +$100–300              |
| 3     | RATS            | 10 operators at $49/mo; Oxford tier at $79/mo    | +$500–1,000            |
| 4–6   | Both            | 20+ RATS operators; RC conversion rate validated | +$1,500–3,000          |
| 6+    | RC + RATS       | Oxford chapters ($200–500/month)                 | +$500–1,500            |
| 10    | Aftercare       | First treatment centers ($800–3K/month)          | +$2,000–5,000          |
| 12    | Combined        | Target                                           | **~$5,000–10,000 MRR** |

---

## Section 6: Confidence Notes

| Item                                         | Confidence | Note                                                                                            |
| -------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------- |
| M1/M2/M3 migrations DONE                     | **High**   | Git commits `09a1a1e`, `0047720` are definitive                                                 |
| Oxford module DONE                           | **High**   | Git commit `58cd4d5`, chore photo evidence `ee217ca`                                            |
| RC facility dashboard DONE                   | **High**   | Git commits `702043d`, `a62e71b`, `2f24313` confirm                                             |
| RATS Stripe products ($49/$79 in prod)       | **Low**    | Env-var driven but deployed price IDs unverified — run `firebase functions:config:get` to check |
| RC Stripe key is `pk_live_`                  | **Low**    | Explicitly in LAUNCH_BLOCKERS — must verify via DevTools                                        |
| RC intergroup checkout works end-to-end      | **Low**    | Code exists; Stripe prices for `productIdIntergroupA/B` not confirmed set                       |
| `getMeetingAttendance` deployed + accessible | **Medium** | Exists in functions, composite index fixed (commit `0b0e88a`); not confirmed called from RATS   |
| detox-recovery Stripe links live             | **High**   | Confirmed in delivery-gaps.md with explicit URLs                                                |
| regroup-functions API key in `api/api.ts:6`  | **High**   | Directly visible in code, never encrypted                                                       |
| Guest-archive rule exposes SUD PII           | **High**   | Confirmed CVSS 8.6 in security audit                                                            |
| regroup-functions has no Firestore rules     | **High**   | No `firestore.rules` file found in functions repo; only RTDB rules set                          |
| RATS app never submitted to App Store        | **Medium** | No App Store ID exists; placeholder `id0000000000` in RC codebase too                           |
| RC `forgot-password` on web claim page       | **High**   | LAUNCH_BLOCKERS confirms it's absent                                                            |

### Verify Before Acting On

Before any Oxford or treatment center pitch:

1. **Confirm RATS Stripe price IDs** in production: `firebase functions:config:get` on the deployed RATS project
2. **Confirm `getMeetingAttendance`** is deployed: check Firebase Functions console for the function, then call it with a `RATS_API_KEY` bearer token
3. **Confirm RC intergroup Stripe prices** are set: open Stripe dashboard → Products → check `productIdIntergroupA` and `productIdIntergroupB` have default prices
4. **Confirm RC Stripe key** is `pk_live_`: open deployed RC web in DevTools → Network → filter `js.stripe.com`
