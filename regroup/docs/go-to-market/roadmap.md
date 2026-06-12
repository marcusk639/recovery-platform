---
title: Regroup — Roadmap
scope: regroup
category: roadmap
status: in_progress
last_verified: 2026-06-10
sources:
  - regroup/mobile/FEATURE_PRIORITIZATION.md
  - regroup/docs/product/decisions.md
  - regroup/docs/superpowers/plans/2026-06-06-regroup-tier-billing-migration.md
  - docs/launch-readiness/regroup-launch-readiness.md
  - docs/STRIPE_CONNECT_GUIDE.md
supersedes:
  - regroup/mobile/PRODUCT_ROADMAP.md
  - regroup/mobile/FEATURE_PRIORITIZATION.md
  - regroup/docs/product/decisions.md
---

# Regroup — Roadmap

One tier-scored roadmap to **live + monetized**, collapsing
`FEATURE_PRIORITIZATION.md`, `PRODUCT_ROADMAP.md`, and the `decisions.md` roadmap.
Status and `code_anchor` reflect **code reality as of 2026-06-10** (verified
against the source tree), not doc claims. Where an older doc and the code
disagree, the code wins and the row says so.

Status vocabulary: `done | in_progress | blocked | planned | not_started`.
Revenue impact: `direct` (generates/unlocks revenue), `enabler`
(acquisition/retention), `risk` (risk reduction, no direct revenue).

> **Reading note — stale-doc reconciliation.** The 2026-05-24 `decisions.md`
> listed three "critical blockers": open security rules, hardcoded `$9.99/$19.99`
> pricing, and missing payment Cloud Functions. **All three are resolved in code**
> (rules restricted, prices env-var-driven, payment callables present — anchors
> below). The live blocker set has moved to **pricing activation + E2E validation**
> (source: docs/launch-readiness/regroup-launch-readiness.md#1-executive-summary).

---

## To-launch + monetize (P0)

| id       | item                                                                              | priority | status      | code_anchor                                                                                                                                                                                                      | depends_on       | revenue_impact                                                                                                                                                                       | source                                                                                            |
| -------- | --------------------------------------------------------------------------------- | -------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| RG-RM-1  | Restrict Realtime DB + Firestore rules                                            | P0       | done        | regroup/mobile/database.rules.json (`.read/.write:false`); firestore.rules (322 lines)                                                                                                                           | —                | risk                                                                                                                                                                                 | docs/launch-readiness/regroup-launch-readiness.md#2-5-security                                    |
| RG-RM-2  | Remove hardcoded `$9.99/$19.99` pricing                                           | P0       | done        | regroup/functions/src/config.ts#L37-L78 (env-var tiers; no `9.99` in source)                                                                                                                                     | —                | direct                                                                                                                                                                               | docs/launch-readiness/regroup-launch-readiness.md#3-1-pricing-tier-activation-p0-revenue-blocking |
| RG-RM-3  | Rent payment callables (`createPaymentIntent`/`listPayments`/`listHousePayments`) | P0       | done        | regroup/functions/src/callable/payments.ts#L92,L180,L233                                                                                                                                                         | —                | direct                                                                                                                                                                               | docs/launch-readiness/regroup-launch-readiness.md#6-1-what-s-working                              |
| RG-RM-4  | 2% Stripe Connect rent fee                                                        | P0       | done        | regroup/functions/src/callable/payments.ts#L152; scheduled/scheduledRentCollection.ts#L80                                                                                                                        | RG-RM-3          | direct                                                                                                                                                                               | docs/STRIPE_CONNECT_GUIDE.md#3-2-taking-rent-destination-charge                                   |
| RG-RM-5  | `oxfordEnabled` write path                                                        | P0       | done        | regroup/functions/src/callable/oxford.ts#L39 (`setOxfordEnabled`)                                                                                                                                                | —                | enabler                                                                                                                                                                              | (code-verified 2026-06-10)                                                                        |
| RG-RM-6  | Six-tier `SUBSCRIPTION_TIERS` config                                              | P0       | done        | regroup/functions/src/config.ts#L37-L78 (priceEnvVar only; no `amountCents`)                                                                                                                                     | —                | direct                                                                                                                                                                               | docs/launch-readiness/regroup-launch-readiness.md#2-2-subscription-tier-architecture              |
| RG-RM-7  | Tier-billing flag + `amountCents` + resolver                                      | P0       | not_started | (no `TIER_BILLING_ENABLED`; no `amountCents` in config) — plan only                                                                                                                                              | RG-RM-6          | direct — gates the **new six-tier flat-fee billing path** (co-gate with RG-RM-8), not all subscription revenue; `amountCents` is near-redundant given RG-RM-6's `priceEnvVar` config | regroup/docs/superpowers/plans/2026-06-06-regroup-tier-billing-migration.md#phase-1               |
| RG-RM-8  | Create 6 Stripe Price IDs + load secrets                                          | P0       | blocked     | env vars `STRIPE_PRICE_TRAD_STARTER`…`STRIPE_PRICE_OXFORD_NETWORK` (not created) — **necessary but not sufficient: RG-RM-7 is the co-gate; this is operator Stripe-Dashboard config (minutes), not engineering** | RG-RM-6          | direct                                                                                                                                                                               | docs/launch-readiness/regroup-launch-readiness.md#3-1-pricing-tier-activation-p0-revenue-blocking |
| RG-RM-9  | E2E subscription + rent test (real card)                                          | P0       | not_started | (manual walkthrough; no run recorded)                                                                                                                                                                            | RG-RM-7, RG-RM-8 | direct                                                                                                                                                                               | docs/launch-readiness/regroup-launch-readiness.md#3-2-end-to-end-payment-flow-p0                  |
| RG-RM-10 | Legacy→tier migration for 5 live houses (D-9)                                     | P0       | planned     | regroup/functions/src/scripts/ (dry-run script per plan)                                                                                                                                                         | RG-RM-8          | direct                                                                                                                                                                               | regroup/docs/superpowers/plans/2026-06-06-regroup-tier-billing-migration.md#phase-7               |
| RG-RM-11 | iOS bundle ID + version for App Store                                             | P0       | not_started | ios bundle `com.rats.dev`; package version `0.0.1`                                                                                                                                                               | —                | enabler                                                                                                                                                                              | docs/launch-readiness/regroup-launch-readiness.md#3-4-mobile-app-readiness                        |

---

## Post-launch growth (P1)

| id       | item                                              | priority | status      | code_anchor                                                                           | depends_on | revenue_impact | source                                                                                  |
| -------- | ------------------------------------------------- | -------- | ----------- | ------------------------------------------------------------------------------------- | ---------- | -------------- | --------------------------------------------------------------------------------------- |
| RG-RM-12 | Subscription-webhook seeding (`.created` handler) | P1       | not_started | regroup/functions/src/webhooks/stripeWebhook.ts (reads `subscriptions`, no writer)    | RG-RM-9    | risk           | docs/STRIPE_CONNECT_GUIDE.md#3-3-connect-webhook-handlers                               |
| RG-RM-13 | Oxford onboarding wizard                          | P1       | planned     | regroup/mobile/src/screens/Oxford\* (client; CF gate via `setOxfordEnabled`)          | RG-RM-5    | enabler        | §"Feature rationale" P3 below (orig: regroup/docs/product/decisions.md, stubbed)        |
| RG-RM-14 | EES auto-calculation Firestore trigger            | P1       | done        | regroup/functions/src/triggers/firestore/index.ts#L189 (`onGuestWrite`, EES L223-264) | —          | enabler        | (code-verified 2026-06-10)                                                              |
| RG-RM-15 | Officer term reminders (scheduled)                | P1       | done        | regroup/functions/src/scheduled/officerTermReminder.ts#L131                           | —          | enabler        | docs/launch-readiness/regroup-launch-readiness.md#2-1-feature-set                       |
| RG-RM-16 | Oxford network directory (`HouseDirectory`)       | P1       | planned     | regroup/mobile/src/screens/ (Firestore public house index)                            | RG-RM-13   | enabler        | §"Feature rationale" P3 below (orig: regroup/docs/product/decisions.md, stubbed)        |
| RG-RM-17 | Enhanced reporting + PDF/CSV export               | P1       | planned     | (partial per parity table; export not wired)                                          | —          | direct         | §"Feature rationale" F2 below (orig: regroup/mobile/FEATURE_PRIORITIZATION.md, stubbed) |
| RG-RM-18 | Charter compliance PDF export                     | P1       | planned     | regroup/mobile/src/screens/CharterCompliance\* (CF export not wired)                  | RG-RM-17   | enabler        | §"Feature rationale" P3 below (orig: regroup/docs/product/decisions.md, stubbed)        |
| RG-RM-19 | Angular 9 → modern web (billing portal path)      | P1       | planned     | regroup/web (Angular 9, EOL)                                                          | —          | risk           | docs/launch-readiness/regroup-launch-readiness.md#3-3-web-frontend-p1-angular-9-is-eol  |
| RG-RM-20 | 2FA / security hardening                          | P1       | planned     | regroup/mobile/src/screens/ (2FA screen exists; CF status unknown)                    | —          | enabler        | §"Feature rationale" F4 below (orig: regroup/mobile/FEATURE_PRIORITIZATION.md, stubbed) |

---

## Retention + differentiation (P2)

| id       | item                                                 | priority | status      | code_anchor                                                | depends_on | revenue_impact | source                                                                                  |
| -------- | ---------------------------------------------------- | -------- | ----------- | ---------------------------------------------------------- | ---------- | -------------- | --------------------------------------------------------------------------------------- |
| RG-RM-21 | Resident daily dashboard (`TodayView`)               | P2       | planned     | regroup/mobile/src/screens/PersonalScreen\*                | —          | enabler        | §"Feature rationale" P4 below (orig: regroup/docs/product/decisions.md, stubbed)        |
| RG-RM-22 | Push-notification accountability loop                | P2       | planned     | regroup/functions/src/scheduled/ + triggers                | —          | enabler        | §"Feature rationale" P4 below (orig: regroup/docs/product/decisions.md, stubbed)        |
| RG-RM-23 | Auto-pay / recurring rent enrollment                 | P2       | planned     | regroup/mobile/src/screens/RentPayment\*                   | RG-RM-9    | direct         | §"Feature rationale" P5 below (orig: regroup/docs/product/decisions.md, stubbed)        |
| RG-RM-24 | Automated rent reminders (scheduled)                 | P2       | done        | regroup/functions/src/scheduled/overdueRentNotification.ts | RG-RM-3    | enabler        | docs/launch-readiness/regroup-launch-readiness.md#2-1-feature-set                       |
| RG-RM-25 | Photo verification for activities                    | P2       | planned     | regroup/mobile/src/screens/ (camera + Storage)             | —          | enabler        | §"Feature rationale" F5 below (orig: regroup/mobile/FEATURE_PRIORITIZATION.md, stubbed) |
| RG-RM-26 | Advanced analytics dashboard                         | P2       | planned     | regroup/mobile/src/screens/                                | —          | direct         | §"Feature rationale" F8 below (orig: regroup/mobile/FEATURE_PRIORITIZATION.md, stubbed) |
| RG-RM-27 | Error-tracking consolidation (Sentry vs Crashlytics) | P2       | not_started | both SDKs installed (Sentry v7.12.0 + Crashlytics v17.3.1) | —          | risk           | docs/launch-readiness/regroup-launch-readiness.md#4-5-dual-error-tracking               |

---

## Phantom features (doc-claimed; reconciled to code)

These were asserted in older docs. The roadmap records the **true** build status
with a code anchor so no automation acts on a feature that does not exist as
claimed.

| id       | item                             | priority | status      | code_anchor                                                                                                                                                                                                                                     | depends_on | revenue_impact | source                                                                     |
| -------- | -------------------------------- | -------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------- | -------------------------------------------------------------------------- |
| RG-RM-28 | Document e-signature             | P3       | not_started | (ABSENT — no esign/signature code in mobile or functions, 2026-06-10)                                                                                                                                                                           | —          | enabler        | §"Feature parity" below (orig: regroup/docs/product/decisions.md, stubbed) |
| RG-RM-29 | "Oxford CRUD as Cloud Functions" | —        | done        | DE-SCOPED — implemented client-side + Firestore rules, not CFs: officers/meetings/voting at regroup/mobile/firebase/firestore.rules#L165-L184; only `setOxfordEnabled` (oxford.ts#L39) + EES trigger (triggers/firestore/index.ts#L189) are CFs | RG-RM-5    | enabler        | (code-verified 2026-06-10)                                                 |

**Resolutions:**

- **RG-RM-28 — e-signature: DE-SCOPED / not built.** No document-signing capability
  exists anywhere in regroup source. Document management is upload/list only (the
  feature-parity audit marks document management "Partial (upload/list; no
  e-signature)"). Marketing must not claim e-sign. If pursued, it is a net-new P3
  build, not a fix. (orig: regroup/docs/product/decisions.md "Feature Parity vs.
  Competitors", stubbed.)
- **RG-RM-29 — "Oxford CRUD as Cloud Functions": CORRECT-THE-CLAIM / already
  delivered differently.** Oxford governance CRUD (officers, business meetings,
  voting) is **client-side writes guarded by Firestore security rules**
  (regroup/mobile/firebase/firestore.rules#L165-L184), not Cloud Functions. The only
  Oxford server-side logic is the `setOxfordEnabled` callable
  (regroup/functions/src/callable/oxford.ts#L39) and the EES auto-calc trigger
  `onGuestWrite` (regroup/functions/src/triggers/firestore/index.ts#L189). The
  feature works; the "as Cloud Functions" framing is wrong. No build needed —
  de-scope the CF rewrite.

---

## Feature rationale (inlined provenance)

Prioritization rationale for the P1/P2 rows, inlined so the roadmap stands alone
if the source docs are emptied. The original priority scores and revenue models
came from the stubbed `decisions.md` (strategic-assessment priorities) and
`FEATURE_PRIORITIZATION.md` (scored feature framework). No prices are restated;
see [`../_shared/pricing.md`](../../../docs/go-to-market/_shared/pricing.md).

**From the strategic-assessment priorities (orig: regroup/docs/product/decisions.md, stubbed):**

- **P3 — Oxford House market acquisition (Days 30–60).** ~2,500 Oxford Houses
  nationally, ~100% underserved, a tightly networked segment where the platform
  already has 80%+ feature parity. Once `oxfordEnabled` is writeable these unlock
  immediately: onboarding wizard (house config → officer election → first EES →
  first meeting), `HouseDirectory` from a public Firestore house index,
  GPS-verified meeting attendance, shareable charter-compliance PDF, and EES
  auto-calc on guest write. This is the largest growth lever (RG-RM-13/16/18).
- **P4 — Resident retention (Days 60–120).** Core value is behavioral
  accountability; the operator side is largely built but the resident-facing daily
  experience is thin. Build the `TodayView` daily dashboard (aggregates today's
  chores + required meetings + curfew into PersonalScreen) and a push-notification
  accountability loop (~6 triggers: chore reminder, meeting reminder, missed
  check-in, phase advancement, missed curfew, late rent). (RG-RM-21/22).
- **P5 — Payment expansion (Days 90–120).** Once rent processing is live, expand
  the financial surface: automated rent reminders (scheduled CF → FCM push),
  auto-pay / recurring enrollment (Stripe saved payment method in the RentPayment
  screen), and activation of the 2% Connect application fee. (RG-RM-23).

**From the scored feature framework (orig: regroup/mobile/FEATURE_PRIORITIZATION.md, stubbed):**

- **F2 — Enhanced reporting + export (score 82/100).** Justifies the Professional
  tier upsell and is required for licensing-inspection compliance and sales demos.
  Build PDF/CSV export of occupancy/compliance/financial reports, scheduled email
  delivery, custom date ranges, and (Enterprise) multi-house rollups. Modeled as a
  Starter→Professional upsell driver. (RG-RM-17).
- **F4 — Two-factor authentication (score 78/100).** Enterprise-sales requirement
  and security-incident prevention; a compliance step toward HIPAA. Build SMS +
  authenticator-app 2FA, backup codes, "remember device", admin enforcement
  toggle, lost-phone recovery, and audit logging. Modeled as enabling the
  Enterprise tier plus churn reduction. (RG-RM-20).
- **F5 — Photo verification for activities (score 74/100).** Differentiator that
  reduces fraud (proves meeting attendance / chore completion) and drives the
  Professional-tier upgrade. Build camera capture → Firebase Storage upload,
  per-house optional/required config, admin gallery, 30-day auto-delete privacy
  control, and storage-quota management. (RG-RM-25).
- **F8 — Advanced analytics dashboard (score 65/100).** Enterprise-tier
  differentiator (compliance trend analysis, relapse risk scoring, occupancy
  forecasting, cross-house benchmarking, Oxford financial-health scoring). Highest
  effort of the set (3–4 weeks). (RG-RM-26).

**Feature parity (orig: regroup/docs/product/decisions.md "Feature Parity vs. Competitors", stubbed).**
The audit rated Regroup at or above competitive standard on resident profiles,
phase/level management, chore + drug-test tracking, staff notes, bed/room
visualization, and offline-first mobile; **unique** on GPS meeting-attendance
verification, Oxford governance (voting/officers/EES), and charter-compliance
monitoring; and **behind** on auto-pay/recurring rent (not built), automated rent
reminders (not built), document management (partial, no e-signature), and a web
admin portal (does not exist — the web app is marketing-only). This is the basis
for the phantom-feature rows above.

---

## Sequencing summary

1. **Activate tiers** (RG-RM-7 → RG-RM-8 → RG-RM-9): implement flag + amounts,
   create Stripe prices, run one real E2E cycle. This is the only thing between
   "built" and "monetized."
2. **Migrate legacy houses** (RG-RM-10) under D-9 grandfather window.
3. **Ship the apps** (RG-RM-11) — bundle ID + version, then App Store / Play.
4. **Harden billing ops** (RG-RM-12) before scaling.
5. **Oxford acquisition** (RG-RM-13, RG-RM-16, RG-RM-18) — the largest growth lever.

See [`project-management.md`](project-management.md) for owners, decision gates,
and acceptance checks; prices in [`../_shared/pricing.md`](../../../docs/go-to-market/_shared/pricing.md).
