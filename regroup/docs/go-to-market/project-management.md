---
title: Regroup — Project Management
scope: regroup
category: project-management
status: in_progress
last_verified: 2026-06-10
sources:
  - regroup/docs/product/decisions.md
  - regroup/docs/superpowers/plans/2026-06-06-regroup-tier-billing-migration.md
  - regroup/docs/operations/manual-tasks/2026-05-21-app-store-launch-checklist.md
  - docs/launch-readiness/regroup-launch-readiness.md
  - docs/STRIPE_CONNECT_GUIDE.md
supersedes:
  - regroup/docs/operations/manual-tasks/2026-05-21-app-store-launch-checklist.md
---

# Regroup — Project Management

The single actionable **launch-to-monetized** plan for Regroup. It is the one
place to see what stands between today (5 live houses on legacy pricing, ~5/10
readiness) and **live + fully monetized** (six-tier subscriptions + 2% rent fee,
shipped to App Store / Play).

Status vocabulary: `done | in_progress | blocked | planned | not_started`.
Severity: `P0` (revenue/launch-blocking), `P1` (pre-scale), `P2` (post-launch).
Tracks: `revenue` · `app-store` · `security` · `legal` · `web` · `ops`.

> **Grounding correction.** Three "critical blockers" from the 2026-05-24
> `decisions.md` (open security rules, hardcoded pricing, missing payment CFs) are
> **resolved in code** as of 2026-06-10 (see [`roadmap.md`](roadmap.md) RG-RM-1/2/3).
> The live blocker set below is the **code-verified** one from the 2026-06-06
> launch-readiness assessment
> (source: docs/launch-readiness/regroup-launch-readiness.md#1-executive-summary).

---

## 1. Blockers (launch-to-monetized)

| id       | blocker                                                       | severity | owner            | track     | status      | acceptance_check                                                                                                                                                                                                                                  | source                                                                                                            |
| -------- | ------------------------------------------------------------- | -------- | ---------------- | --------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| RG-P0-1  | Tier-billing code not implemented (flag + amounts + resolver) | P0       | Eng (functions)  | revenue   | done        | **DONE 2026-06-13** — `isTierBillingEnabled()`, `amountCents`, `resolveTierPriceId` shipped w/ 7 passing unit tests (config.ts, util/tierPricing.ts). Pure core only; single-item creation/cap/webhook = plan Phases 2–8, still gated on RG-P0-2. | regroup/docs/superpowers/plans/2026-06-06-regroup-tier-billing-migration.md#phase-1                               |
| RG-P0-2  | 6 Stripe Price IDs not created / secrets not set              | P0       | Owner (Stripe)   | revenue   | blocked     | `stripe prices list` shows 6 prices; 6 `STRIPE_PRICE_*` secrets set in `phoenix-cleanhouse`                                                                                                                                                       | docs/launch-readiness/regroup-launch-readiness.md#3-1-pricing-tier-activation-p0-revenue-blocking                 |
| RG-P0-3  | No end-to-end subscription + rent test (real card)            | P0       | Eng + Owner      | revenue   | not_started | One operator subscribes per tier; one resident rent payment succeeds; webhook updates Firestore                                                                                                                                                   | docs/launch-readiness/regroup-launch-readiness.md#3-2-end-to-end-payment-flow-p0                                  |
| RG-P0-4  | Legacy 5-house migration path (D-9 grandfather)               | P0       | Owner            | revenue   | planned     | Each of 5 operators contacted; grandfather window communicated; dry-run migration script reviewed                                                                                                                                                 | regroup/docs/superpowers/plans/2026-06-06-regroup-tier-billing-migration.md#phase-7                               |
| RG-P0-5  | IAP vs. web-billing decision (D-11)                           | P0       | Owner (+legal)   | legal     | done        | **RESOLVED 2026-06-13 — web-only/hybrid** (paid upgrade CTA opens WebView to web checkout; no native IAP). Unblocks RG-P0-2. | §6 task F below (orig: regroup/docs/operations/manual-tasks/2026-05-21-app-store-launch-checklist.md, stubbed) |
| RG-P0-6  | HIPAA / BAA surface decision (D-12)                           | P0       | Owner (+counsel) | legal     | done        | **RESOLVED 2026-06-13 — accept free GCP BAA**; keep PHI out of Stripe; 42 CFR Part 2 noted; add BAA section to Privacy Policy. Monitor-grade. | §6 task D below (orig: regroup/docs/operations/manual-tasks/2026-05-21-app-store-launch-checklist.md, stubbed) |
| RG-P0-7  | iOS bundle ID `com.rats.dev` + version `0.0.1`                | P0       | Eng (mobile)     | app-store | not_started | Production bundle ID set; `package.json` version `1.0.0`; provisioning profile updated                                                                                                                                                            | docs/launch-readiness/regroup-launch-readiness.md#3-4-mobile-app-readiness                                        |
| RG-P0-8  | Rotate 3 leaked service-account keys + purge git history      | P0       | Owner (GCP)      | security  | not_started | keys **rotated in GCP** (verify rotation, not just git cleanliness); `git log --all -- "**/*service-account*.json"` returns nothing; CI green                                                                                                     | §6 task A below (orig: regroup/docs/operations/manual-tasks/2026-05-21-app-store-launch-checklist.md, stubbed)    |
| RG-P0-9  | Delete 4 E2E test accounts from prod Firebase                 | P0       | Owner            | security  | not_started | 0 E2E accounts in Auth; no `guests`/`houses` docs reference deleted UIDs                                                                                                                                                                          | §6 task B below (orig: regroup/docs/operations/manual-tasks/2026-05-21-app-store-launch-checklist.md, stubbed)    |
| RG-P0-10 | Host Privacy Policy + ToS at stable HTTPS URL                 | P0       | Owner            | app-store | not_started | `/privacy` and `/terms` return 200 in incognito (after D-12 outcome folded in)                                                                                                                                                                    | §6 task C below (orig: regroup/docs/operations/manual-tasks/2026-05-21-app-store-launch-checklist.md, stubbed)    |
| RG-P0-11 | App Store Connect + Play metadata & assets                    | P0       | Owner            | app-store | not_started | No red warnings in App Store Connect; Play Data Safety = Submitted; demo review account works                                                                                                                                                     | §6 tasks G/H below (orig: regroup/docs/operations/manual-tasks/2026-05-21-app-store-launch-checklist.md, stubbed) |
| RG-P1-1  | Subscription-webhook seeding (`.created` handler)             | P1       | Eng (functions)  | revenue   | not_started | `subscriptions` collection written on create; past-due + renewal webhook paths fire                                                                                                                                                               | docs/STRIPE_CONNECT_GUIDE.md#3-3-connect-webhook-handlers                                                         |
| RG-P1-2  | Android targetSdkVersion 34                                   | P1       | Eng (mobile)     | app-store | not_started | `targetSdkVersion 34` in build.gradle; app builds on Android 14                                                                                                                                                                                   | §6 task H below (orig: regroup/docs/operations/manual-tasks/2026-05-21-app-store-launch-checklist.md, stubbed)    |
| RG-P1-3  | CocoaPods/BoringSSL install instability                       | P1       | Eng (mobile)     | app-store | not_started | Clean `pod install` from scratch; iOS build succeeds in CI                                                                                                                                                                                        | docs/launch-readiness/regroup-launch-readiness.md#3-4-mobile-app-readiness                                        |
| RG-P1-4  | Angular 9 web (EOL) — accept-or-replace decision              | P1       | Eng + Owner      | web       | not_started | Decision recorded: accept for launch OR scope minimal React/Next billing portal                                                                                                                                                                   | docs/launch-readiness/regroup-launch-readiness.md#3-3-web-frontend-p1-angular-9-is-eol                            |
| RG-P2-1  | Error-tracking consolidation (Sentry vs Crashlytics)          | P2       | Eng              | ops       | not_started | One service retained; other SDK removed                                                                                                                                                                                                           | docs/launch-readiness/regroup-launch-readiness.md#4-5-dual-error-tracking                                         |

---

## 2. Milestones (sequenced)

| id      | milestone                                 | gate (must be done first)     | status      | source                                                                                         |
| ------- | ----------------------------------------- | ----------------------------- | ----------- | ---------------------------------------------------------------------------------------------- |
| RG-MS-1 | Revenue infrastructure ready              | RG-P0-1, RG-P0-2, RG-P0-5     | not_started | docs/launch-readiness/regroup-launch-readiness.md#phase-0-revenue-infrastructure-week-1-2      |
| RG-MS-2 | First end-to-end paid cycle (test mode)   | RG-MS-1, RG-P0-3              | not_started | docs/launch-readiness/regroup-launch-readiness.md#phase-1-end-to-end-validation-week-2-3       |
| RG-MS-3 | Legacy 5 houses migrated/grandfathered    | RG-MS-2, RG-P0-4              | not_started | docs/launch-readiness/regroup-launch-readiness.md#phase-2-existing-customer-migration-week-3-4 |
| RG-MS-4 | Apps submitted (iOS + Android)            | RG-P0-7..11, RG-P1-2, RG-P1-3 | not_started | docs/launch-readiness/regroup-launch-readiness.md#phase-3-app-store-submission-week-4          |
| RG-MS-5 | First live tier subscription (prod)       | RG-MS-2, RG-MS-4              | not_started | regroup/docs/superpowers/plans/2026-06-06-regroup-tier-billing-migration.md#phase-8            |
| RG-MS-6 | First live rent payment + 2% fee captured | RG-MS-5                       | not_started | docs/STRIPE_CONNECT_GUIDE.md#3-2-taking-rent-destination-charge                                |
| RG-MS-7 | Oxford House pilot (10–15 houses)         | RG-MS-5                       | not_started | docs/launch-readiness/regroup-launch-readiness.md#phase-4-oxford-house-pilot-month-2-3         |

---

## 3. Sequencing & tracks

Two tracks run in parallel; they converge at App Store submission (RG-MS-4).

- **Revenue track** (gates monetization): RG-P0-1 → RG-P0-2 → RG-P0-3 →
  RG-P0-4. The tier code, then the Stripe prices, then one real cycle, then the
  legacy migration. This is the critical path to "monetized."
- **Launch track** (gates shipping): RG-P0-7 → (RG-P0-8, RG-P0-9 security) →
  RG-P0-10 → RG-P0-11, plus RG-P1-2/RG-P1-3 mobile hardening. This is the
  critical path to "live."
- **Decision gates** must close before their dependent track proceeds: D-9
  (grandfather) gates RG-P0-4; D-11 (IAP) gates RG-P0-2 product setup; D-12
  (HIPAA) gates RG-P0-10 privacy-policy publishing.

Ordering note: do **RG-P0-6 (HIPAA)** before **RG-P0-10 (privacy policy)** — if a
BAA is required, a BAA section must be added to the Privacy Policy before it is
published (see §6 tasks D and C). Do **RG-P0-5 (IAP)** before **RG-P0-2 (Stripe
products)** — the billing model (web-only vs. IAP) determines how the products are
surfaced and whether the in-app upgrade CTA can point at Stripe at all (see §6
tasks F and E). (orig:
regroup/docs/operations/manual-tasks/2026-05-21-app-store-launch-checklist.md,
stubbed.)

---

## 4. Decision gates

| gate | decision                                        | status | owner            | recorded in                                                                          |
| ---- | ----------------------------------------------- | ------ | ---------------- | ------------------------------------------------------------------------------------ |
| D-9  | Legacy→tier grandfather window (6-mo, 5 houses) | done   | Owner            | [`../_shared/decisions-log.md`](../../../docs/go-to-market/_shared/decisions-log.md) |
| D-11 | IAP vs. web-only billing (web/hybrid)           | done   | Owner (+legal)   | [`../_shared/decisions-log.md`](../../../docs/go-to-market/_shared/decisions-log.md) |
| D-12 | HIPAA / BAA surface (accept free GCP BAA)       | done   | Owner (+counsel) | [`../_shared/decisions-log.md`](../../../docs/go-to-market/_shared/decisions-log.md) |

All three gates are resolved. D-9: grandfather 6 months, then migrate via reviewed
Stripe CLI batches. **D-11 (2026-06-13): web-only/hybrid** — paid upgrade routes to
web checkout, no native IAP; RG-P0-2 (Stripe product setup) is now unblocked.
**D-12 (2026-06-13): accept the free GCP BAA** and keep PHI out of Stripe; the
outcome (a BAA section) folds into RG-P0-10 (privacy policy) before publishing.

---

## 5. Owners (accountability)

- **Eng (functions):** tier-billing code, webhook seeding, payment callables.
- **Eng (mobile):** bundle ID/version, SDK targets, CocoaPods, tier picker UI.
- **Owner:** Stripe product creation, legacy-house outreach, App Store/Play
  metadata, security cleanup, legal decisions (D-11, D-12).
- **Counsel (external):** HIPAA/BAA opinion.

---

## 6. App-store launch checklist (inlined provenance)

The substantive launch-task detail, inlined so this doc stands alone if the source
checklist is reduced to a stub. (orig:
regroup/docs/operations/manual-tasks/2026-05-21-app-store-launch-checklist.md,
stubbed.) Each task maps to a blocker row in §1.

- **Task A — Rotate 3 leaked service-account keys + purge git history (→ RG-P0-8,
  security).** Three Firebase service-account key files (`*service-account*.json`,
  `*firebase-adminsdk*.json`, `*credentials*.json`) appear in git history. This is
  **latent exposure, not a live breach** — repos are private and no key material
  was found in scanned history; rotation is prudent hygiene. Identify them via
  `git log --all --full-history -- "**/*service-account*.json" ...`, rotate the
  keys in GCP Console → IAM → Service Accounts, then purge from history with BFG
  and force-push. **History rewrite — all team members must re-clone.**
- **Task B — Delete 4 E2E test accounts from production Firebase (→ RG-P0-9,
  security).** Four E2E test users (pattern `test-*@…`, `e2e-*@…`, `detox-*@…`,
  found in `e2e/` / `.detoxrc.js`) hold fake house data alongside real operator
  data in prod Auth + Firestore; reviewers may inspect Firebase directly. Remove
  the Auth users and their `guests`/`houses` docs.
- **Task C — Host Privacy Policy + ToS at a stable HTTPS URL (→ RG-P0-10,
  app-store).** Both Apple and Google require a public privacy-policy URL (Apple
  also a ToS URL) before submission. The docs exist (`docs/PRIVACY_POLICY.md`,
  `docs/TERMS_OF_SERVICE.md`) and need publishing (rats-web routes `/privacy`,
  `/terms`, or GitHub Pages). Both must return 200 in incognito. **Do after Task D**
  — a required BAA may add a section first.
- **Task D — HIPAA / BAA surface decision (→ RG-P0-6, legal).** Sober-living data
  is health-adjacent (sobriety date, medication field, meeting attendance, EES
  records, drug-test results, payment history). Whether storing it requires BAAs
  with cloud providers is a legal question. Prepare the data inventory, ask a
  healthcare attorney, and act on the outcome: BAA required → accept the **free
  self-serve Google Cloud BAA** (**Stripe does not sign BAAs** — keep PHI out of
  Stripe metadata) and review **42 CFR Part 2** applicability, then add a BAA
  section to the Privacy Policy before Task C; not required → proceed; uncertain →
  proceed with the free GCP BAA in place as cheap insurance. **Monitor, not a hard
  launch gate. Upmarket trigger:** if a house bills insurance, runs MAT, employs
  clinical staff, or partners with a treatment center, it may become a **covered
  entity** — which would pull regroup in as a **Business Associate** and make a BAA
  mandatory; re-test this gate at that point.
- **Task E — Create Stripe subscription products (→ RG-P0-2, revenue).** The
  paywall expects specific Stripe price IDs; without the products no operator can
  subscribe. Create the products in the Stripe Dashboard, copy each price ID into
  the app + Cloud Functions config (`STRIPE_PRICE_*` secrets in
  `phoenix-cleanhouse`), and verify the full flow in Stripe **test mode** (card
  `4242 4242 4242 4242`) before going live — subscription creates, webhook updates
  `subscriptionStatus` to `active`, grace banner clears. Amounts live in
  [`../_shared/pricing.md`](../../../docs/go-to-market/_shared/pricing.md); no prices restated here. **Do
  after Task F** (billing-model decision).
- **Task F — IAP vs. direct-billing architecture decision (→ RG-P0-5, legal).**
  Apple requires in-app digital-goods sales to use IAP (15–30% cut). Options: **A
  web-only** (upgrade CTA opens the `SubscriptionHandler` WebView to the web
  subscribe page — 0% cut, already built), **B native IAP** (StoreKit 2, 15–30%
  cut, 2–3 weeks eng), **C hybrid** (free tier in-app, paid upgrade via web link —
  same as A). Recommendation: **A/C**, justified by the B2B-SaaS pattern Apple has
  historically permitted to link out. Record the decision (decisions-log / ADR) to
  protect against an Apple review challenge.
- **Task G — App Store Connect metadata & submission assets (→ RG-P0-11,
  app-store).** Apple rejects on any missing field. Set App Information (primary
  language English-US; category Business primary, Health & Fitness secondary;
  content rights), complete the age-rating questionnaire (medical/treatment info =
  infrequent/mild for sobriety tracking; no drug-promotion references), set the
  Privacy Policy URL (from Task C), and fill the data-types questionnaire. **Do
  after Task C.**
- **Task H — Google Play Console metadata + Target API 34 (→ RG-P0-11 / RG-P1-2,
  app-store).** Complete the Play store listing, screenshots, content-rating and
  Data Safety forms, and confirm the Android build targets **API 34**
  (`targetSdkVersion 34` / `compileSdkVersion` in `android/app/build.gradle`; app
  builds and runs on Android 14) plus the permissions declaration.

---

## Cross-references

- Pricing model + projections → [`monetization.md`](monetization.md)
- Feature build status + phantom features → [`roadmap.md`](roadmap.md)
- Prices / Stripe env vars → [`../_shared/pricing.md`](../../../docs/go-to-market/_shared/pricing.md)
- Decisions D-9, D-11, D-12 → [`../_shared/decisions-log.md`](../../../docs/go-to-market/_shared/decisions-log.md)
- Ecosystem launch sequence → [`../ecosystem/project-management.md`](../../../docs/go-to-market/ecosystem/project-management.md)
