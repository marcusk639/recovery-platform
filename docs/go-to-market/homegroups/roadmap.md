---
title: Homegroups — Roadmap
scope: homegroups
category: roadmap
status: in_progress
last_verified: 2026-06-10
sources:
  - homegroups/docs/product/roadmap.md
  - docs/launch-readiness/homegroups-launch-readiness.md
  - homegroups/docs/monetization/revenue-opportunities.md
  - homegroups/docs/operations/launch-blockers.md
supersedes:
  - homegroups/docs/product/roadmap.md
---

# Homegroups — Roadmap

Homegroups is **feature-complete for its V1–V4.3 scope** (90 callable Cloud
Functions, 17 Firestore triggers, 14 scheduled jobs, mature Stripe subscription
system). The roadmap is therefore **activation- and B2B-build-out-driven**, not
feature-driven. The sequence to "live + monetized" is:

**launch → 30-group pilot → treatment-center facility dashboard (B2B unlock) → B2B sales.**

V4.1–V4.4 enterprise mobile UI is built but **intentionally flag-hidden** (all
feature flags `false`) — see the flag rows below
(source: docs/launch-readiness/homegroups-launch-readiness.md#3-5-v4-4-feature-flag-management).

> Quantitative revenue claims are not restated here — they live in
> [`../_shared/pricing.md`](../_shared/pricing.md) (referenced by `HG-MON-*`
> ID). Launch blockers and owners live in
> [`project-management.md`](project-management.md).

---

## Roadmap

| id       | item                                              | priority | status      | code_anchor                                                                                         | depends_on             | revenue_impact                                                                                                                               | source                                                                                                                  |
| -------- | ------------------------------------------------- | -------- | ----------- | --------------------------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| HG-RM-1  | Go-live: activate revenue infra + ship apps       | P0       | in_progress | `web/src/lib/deepLinks.js`, `functions/src/index.ts`                                                | —                      | Unlocks all revenue (group tier [`HG-MON-1`](../_shared/pricing.md))                                                                         | docs/launch-readiness/homegroups-launch-readiness.md#8-recommended-launch-sequence                                      |
| HG-RM-2  | 30-group pilot (claim-and-pay validation)         | P0       | not_started | `scripts/pickSampleGroups.js`                                                                       | HG-RM-1                | Validates group tier [`HG-MON-1`](../_shared/pricing.md)                                                                                     | orig: homegroups/docs/product/roadmap.md (90-day success criteria), archived                                            |
| HG-RM-3  | Treatment-center facility dashboard (B2B unlock)  | P1       | not_started | `web/src/pages/FacilityDashboardPage.js` (new), `facilities/{facilityId}/alumniEngagement` (new CF) | HG-RM-2, HG-RM-6       | **Unlocks B2B**: [`HG-MON-2`](../_shared/pricing.md)/[`HG-MON-3`](../_shared/pricing.md) treatment-center tiers; per-facility dashboard line | orig: homegroups/docs/product/roadmap.md (P1 next sprint), archived                                                     |
| HG-RM-4  | Set intergroup/TC Stripe default prices (R-1/R-2) | P1       | blocked     | `functions/src/utils/stripe.ts` (`getDefaultPriceForProduct`)                                       | HG-RM-1                | Activates [`HG-MON-2`](../_shared/pricing.md)/[`HG-MON-3`](../_shared/pricing.md) (else revenue-zero)                                        | docs/launch-readiness/homegroups-launch-readiness.md#3-3-revenue-activation-p1                                          |
| HG-RM-5  | B2B sales: intergroup + treatment-center outreach | P1       | not_started | `functions/src/callable/createIntergroup.ts`                                                        | HG-RM-3, HG-RM-4       | Realizes [`HG-MON-2`](../_shared/pricing.md)/[`HG-MON-3`](../_shared/pricing.md) — highest ARPU path                                         | orig: homegroups/docs/product/roadmap.md (12-month ecosystem roadmap), archived                                         |
| HG-RM-6  | Verify `getMeetingAttendance` Regroup-callable    | P1       | in_progress | `functions/src/http/getMeetingAttendance.ts`                                                        | HG-RM-1 (RATS_API_KEY) | Bridge that makes the TC integration story credible                                                                                          | orig: homegroups/docs/product/roadmap.md (P1 next sprint), archived                                                     |
| HG-RM-7  | Promote donation Connect (5% fee) + QR check-in   | P2       | planned     | `homegroups/functions/src/utils/stripe.ts#L55` (`PLATFORM_FEE_PERCENT`)                             | HG-RM-2                | Marginal donation revenue [`HG-MON-5`](../_shared/pricing.md)                                                                                | code: homegroups/functions/src/utils/stripe.ts#L55 (`PLATFORM_FEE_PERCENT`); orig: …/revenue-opportunities.md, archived |
| HG-RM-8  | Flip `noindex` → `index` on group pages (SEO)     | P2       | not_started | `web/src/components/GroupPageHead.js`                                                               | ~100 claimed grps      | Adoption (62K pre-seeded pages); indirect                                                                                                    | orig: homegroups/docs/operations/launch-blockers.md (#11 flip noindex), archived                                        |
| HG-RM-9  | Custom domain `homegroups-app.com` (9-file flip)  | P2       | not_started | `web/src/lib/deepLinks.js` (+8 files)                                                               | HG-RM-1                | Adoption / brand; indirect                                                                                                                   | orig: homegroups/docs/operations/launch-blockers.md (#5 custom domain), archived                                        |
| HG-RM-10 | App Check + rate limiting (abuse hardening)       | P2       | not_started | callable `onCall` options, `firestore.rules` `notSpamming()`                                        | HG-RM-1                | Protects revenue surface at scale; no direct revenue                                                                                         | orig: homegroups/docs/operations/launch-blockers.md (#13 App Check / D-35), archived                                    |

### Flag-hidden (intentionally deferred) — V4.1–V4.4

These are **built** but gated behind hardcoded feature flags set to `false`.
They are deferred by design — there is no customer to use them yet, and flags
flip via code deploy (no runtime flag service)
(source: docs/launch-readiness/homegroups-launch-readiness.md#3-5-v4-4-feature-flag-management).

| id       | item                                     | priority | status  | code_anchor                                  | depends_on | revenue_impact                                                                          | source                                                                                |
| -------- | ---------------------------------------- | -------- | ------- | -------------------------------------------- | ---------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| HG-RM-F1 | V4.1–V4.3 enterprise mobile UI           | P3       | planned | `featureFlags.ts`                            | HG-RM-5    | None until B2B demand exists                                                            | orig: homegroups/docs/product/roadmap.md (feature status), archived                   |
| HG-RM-F2 | V4.4 intergroup module (mobile UI)       | P3       | planned | `featureFlags.ts:25`, `AppNavigator.tsx:153` | HG-RM-4    | Surfaces [`HG-MON-2`](../_shared/pricing.md)/[`HG-MON-3`](../_shared/pricing.md) in-app | orig: homegroups/docs/product/roadmap.md (feature status), archived                   |
| HG-RM-F3 | V4.4 treatment-center module (mobile UI) | P3       | planned | `featureFlags.ts`                            | HG-RM-3    | Surfaces TC tiers in-app                                                                | docs/launch-readiness/homegroups-launch-readiness.md#3-5-v4-4-feature-flag-management |
| HG-RM-F4 | V4.4 white-label                         | P3       | planned | `featureFlags.ts`                            | HG-RM-5    | Enterprise / white-label line                                                           | docs/launch-readiness/homegroups-launch-readiness.md#3-5-v4-4-feature-flag-management |

> Flipping any V4.4 flag currently requires a code deploy. A Firebase Remote
> Config flag service (HG-SPEC-09 in launch-readiness) is the prerequisite for
> gradual rollout but is itself P2/optional for initial launch
> (source: docs/launch-readiness/homegroups-launch-readiness.md#3-5-v4-4-feature-flag-management).

---

## The facility dashboard is the explicit B2B revenue unlock

`HG-RM-3` is the pivot from consumer flywheel to B2B revenue. Treatment-center
checkout and pricing are already wired to Stripe; what is missing is the
**facility view that closes the sale** — a dashboard showing anonymized alumni
engagement (meetings attended, sobriety milestones, sponsorship links formed)
for groups affiliated with a treatment center. **Without this dashboard the
sales pitch is theoretical; with it, a case manager can see whether alumni are
showing up and living stably** — the metric every treatment-center board cares
about. Concretely, the build adds `web/src/pages/FacilityDashboardPage.js`, a
Cloud Function aggregating per-facility engagement signals into
`facilities/{facilityId}/alumniEngagement`, wiring of `affiliateGroupToIntergroup`
to populate the view, and a `facilityId` JWT-claim auth gate; acceptance is a
facility admin seeing anonymized counts of meetings attended (week/month),
milestone events (30/60/90/180-day), and sponsorship links formed, with no
individual member data exposed (effort M–L, 3–7 days)
(orig: homegroups/docs/product/roadmap.md, archived). It is gated on
the pilot (HG-RM-2) and on the `getMeetingAttendance` bridge (HG-RM-6), and it
is the precondition for B2B sales (HG-RM-5) and the per-facility dashboard
pricing line noted in [`monetization.md`](monetization.md).

---

## What NOT to build during launch

Per strategic consensus across the source docs, do not build during launch:
intergroup governance/analytics features (no customer yet — V4 flag-hidden by
design), elections/bylaws/health dashboards (post-launch), analytics features
(no historical data yet), and paid acquisition (only after organic
trial-to-paid conversion is validated > 30%)
(orig: homegroups/docs/product/roadmap.md, archived).

## See also

- Launch blockers + owners: [`project-management.md`](project-management.md)
- Pricing rows: [`../_shared/pricing.md`](../_shared/pricing.md)
- Ecosystem sequencing (not duplicated here): [`homegroups/docs/plans/2026-04-13-recovery-ecosystem-12-month-plan.md`](../../../homegroups/docs/plans/2026-04-13-recovery-ecosystem-12-month-plan.md)
