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
supersedes: []
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

| id       | blocker                                                       | severity | owner            | track     | status      | acceptance_check                                                                                  | source                                                                                                                                          |
| -------- | ------------------------------------------------------------- | -------- | ---------------- | --------- | ----------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| RG-P0-1  | Tier-billing code not implemented (flag + amounts + resolver) | P0       | Eng (functions)  | revenue   | not_started | `isTierBillingEnabled()`, `amountCents`, and `resolveTierPriceId` exist with passing unit tests   | regroup/docs/superpowers/plans/2026-06-06-regroup-tier-billing-migration.md#phase-1                                                             |
| RG-P0-2  | 6 Stripe Price IDs not created / secrets not set              | P0       | Owner (Stripe)   | revenue   | blocked     | `stripe prices list` shows 6 prices; 6 `STRIPE_PRICE_*` secrets set in `phoenix-cleanhouse`       | docs/launch-readiness/regroup-launch-readiness.md#3-1-pricing-tier-activation-p0-revenue-blocking                                               |
| RG-P0-3  | No end-to-end subscription + rent test (real card)            | P0       | Eng + Owner      | revenue   | not_started | One operator subscribes per tier; one resident rent payment succeeds; webhook updates Firestore   | docs/launch-readiness/regroup-launch-readiness.md#3-2-end-to-end-payment-flow-p0                                                                |
| RG-P0-4  | Legacy 5-house migration path (D-9 grandfather)               | P0       | Owner            | revenue   | planned     | Each of 5 operators contacted; grandfather window communicated; dry-run migration script reviewed | regroup/docs/superpowers/plans/2026-06-06-regroup-tier-billing-migration.md#phase-7                                                             |
| RG-P0-5  | IAP vs. web-billing decision (D-11)                           | P0       | Owner (+legal)   | legal     | not_started | Decision recorded in decisions-log; if web-only, upgrade CTA routes to web checkout               | regroup/docs/operations/manual-tasks/2026-05-21-app-store-launch-checklist.md#p0-f-iap-vs-direct-billing-architecture-decision                  |
| RG-P0-6  | HIPAA / BAA surface decision (D-12)                           | P0       | Owner (+counsel) | legal     | not_started | Written legal opinion in hand; BAAs signed with Google Cloud + Stripe if required                 | regroup/docs/operations/manual-tasks/2026-05-21-app-store-launch-checklist.md#p0-d-hipaa-surface-decision                                       |
| RG-P0-7  | iOS bundle ID `com.rats.dev` + version `0.0.1`                | P0       | Eng (mobile)     | app-store | not_started | Production bundle ID set; `package.json` version `1.0.0`; provisioning profile updated            | docs/launch-readiness/regroup-launch-readiness.md#3-4-mobile-app-readiness                                                                      |
| RG-P0-8  | Rotate 3 leaked service-account keys + purge git history      | P0       | Owner (GCP)      | security  | not_started | `git log --all -- "**/*service-account*.json"` returns nothing; keys rotated; CI green            | regroup/docs/operations/manual-tasks/2026-05-21-app-store-launch-checklist.md#p0-a-rotate-3-leaked-service-account-keys-purge-from-git-history  |
| RG-P0-9  | Delete 4 E2E test accounts from prod Firebase                 | P0       | Owner            | security  | not_started | 0 E2E accounts in Auth; no `guests`/`houses` docs reference deleted UIDs                          | regroup/docs/operations/manual-tasks/2026-05-21-app-store-launch-checklist.md#p0-b-delete-4-e2e-test-accounts-from-production-firebase          |
| RG-P0-10 | Host Privacy Policy + ToS at stable HTTPS URL                 | P0       | Owner            | app-store | not_started | `/privacy` and `/terms` return 200 in incognito (after D-12 outcome folded in)                    | regroup/docs/operations/manual-tasks/2026-05-21-app-store-launch-checklist.md#p0-c-host-privacy-policy-and-terms-of-service-at-stable-https-url |
| RG-P0-11 | App Store Connect + Play metadata & assets                    | P0       | Owner            | app-store | not_started | No red warnings in App Store Connect; Play Data Safety = Submitted; demo review account works     | regroup/docs/operations/manual-tasks/2026-05-21-app-store-launch-checklist.md#p0-g-app-store-connect-metadata-and-submission-assets             |
| RG-P1-1  | Subscription-webhook seeding (`.created` handler)             | P1       | Eng (functions)  | revenue   | not_started | `subscriptions` collection written on create; past-due + renewal webhook paths fire               | docs/STRIPE_CONNECT_GUIDE.md#3-3-connect-webhook-handlers                                                                                       |
| RG-P1-2  | Android targetSdkVersion 34                                   | P1       | Eng (mobile)     | app-store | not_started | `targetSdkVersion 34` in build.gradle; app builds on Android 14                                   | regroup/docs/operations/manual-tasks/2026-05-21-app-store-launch-checklist.md#step-h-5-target-api-level-api-34                                  |
| RG-P1-3  | CocoaPods/BoringSSL install instability                       | P1       | Eng (mobile)     | app-store | not_started | Clean `pod install` from scratch; iOS build succeeds in CI                                        | docs/launch-readiness/regroup-launch-readiness.md#3-4-mobile-app-readiness                                                                      |
| RG-P1-4  | Angular 9 web (EOL) — accept-or-replace decision              | P1       | Eng + Owner      | web       | not_started | Decision recorded: accept for launch OR scope minimal React/Next billing portal                   | docs/launch-readiness/regroup-launch-readiness.md#3-3-web-frontend-p1-angular-9-is-eol                                                          |
| RG-P2-1  | Error-tracking consolidation (Sentry vs Crashlytics)          | P2       | Eng              | ops       | not_started | One service retained; other SDK removed                                                           | docs/launch-readiness/regroup-launch-readiness.md#4-5-dual-error-tracking                                                                       |

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

Ordering note: do **RG-P0-6 (HIPAA)** before **RG-P0-10 (privacy policy)** — the
HIPAA outcome may add a BAA section to the policy before it is published
(source: regroup/docs/operations/manual-tasks/2026-05-21-app-store-launch-checklist.md#p0-c-host-privacy-policy-and-terms-of-service-at-stable-https-url).
Do **RG-P0-5 (IAP)** before **RG-P0-2 (Stripe products)** — the billing model
determines how products are surfaced
(source: regroup/docs/operations/manual-tasks/2026-05-21-app-store-launch-checklist.md#p0-e-create-stripe-subscription-products).

---

## 4. Decision gates

| gate | decision                                        | status      | owner            | recorded in                                                  |
| ---- | ----------------------------------------------- | ----------- | ---------------- | ------------------------------------------------------------ |
| D-9  | Legacy→tier grandfather window (6-mo, 5 houses) | done        | Owner            | [`../_shared/decisions-log.md`](../_shared/decisions-log.md) |
| D-11 | IAP vs. web-only billing (recommend web/hybrid) | not_started | Owner (+legal)   | [`../_shared/decisions-log.md`](../_shared/decisions-log.md) |
| D-12 | HIPAA / BAA surface (legal opinion required)    | not_started | Owner (+counsel) | [`../_shared/decisions-log.md`](../_shared/decisions-log.md) |

D-9 is resolved (grandfather 6 months, then migrate via reviewed Stripe CLI
batches). D-11 and D-12 are **open and launch-blocking** — they gate RG-P0-2 and
RG-P0-10 respectively.

---

## 5. Owners (accountability)

- **Eng (functions):** tier-billing code, webhook seeding, payment callables.
- **Eng (mobile):** bundle ID/version, SDK targets, CocoaPods, tier picker UI.
- **Owner:** Stripe product creation, legacy-house outreach, App Store/Play
  metadata, security cleanup, legal decisions (D-11, D-12).
- **Counsel (external):** HIPAA/BAA opinion.

---

## Cross-references

- Pricing model + projections → [`monetization.md`](monetization.md)
- Feature build status + phantom features → [`roadmap.md`](roadmap.md)
- Prices / Stripe env vars → [`../_shared/pricing.md`](../_shared/pricing.md)
- Decisions D-9, D-11, D-12 → [`../_shared/decisions-log.md`](../_shared/decisions-log.md)
- Ecosystem launch sequence → [`../ecosystem/project-management.md`](../ecosystem/project-management.md)
