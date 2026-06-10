---
title: Homegroups — Monetization
scope: homegroups
category: monetization
status: in_progress
last_verified: 2026-06-10
sources:
  - homegroups/docs/monetization/model.md
  - homegroups/docs/monetization/projections.md
  - homegroups/docs/monetization/revenue-opportunities.md
  - homegroups/docs/monetization/market-intelligence.md
  - docs/launch-readiness/homegroups-launch-readiness.md
  - docs/STRIPE_CONNECT_GUIDE.md
supersedes: []
---

# Homegroups — Monetization

Homegroups is a privacy-first platform for running 12-step recovery groups (AA,
NA, and similar fellowships). Its monetization is **built but not yet
activated**: the Stripe subscription system, Connect donations, and B2B
intergroup / treatment-center checkout are all coded and (for the consumer
tier) tested, but the revenue-bearing B2B products **cannot transact** until a
default Stripe price is set on each. That gap — not features — is what stands
between today and "fully monetized."

All price values live in the canonical table
[`../_shared/pricing.md`](../_shared/pricing.md); this doc references each row by
its stable `HG-MON-*` ID and never restates a number.

---

## TOP BLOCKER — R-1 / R-2: no default Stripe price set on the B2B products

**This is the headline monetization gap.** Two of the three revenue products
(intergroup Tier A and Tier B — which also back every treatment-center sale)
have **no default price configured in the Stripe Dashboard**. Because checkout
resolves the price at runtime via `getDefaultPriceForProduct()`, an unset
default price is a **silent revenue-zero failure mode**: the callable throws
`'Product X has no default price set'` and **every** intergroup and
treatment-center checkout fails
(source: docs/launch-readiness/homegroups-launch-readiness.md#3-3-revenue-activation-p1).

| ID  | Product                                              | pricing.md row                      | Blocker                         |
| --- | ---------------------------------------------------- | ----------------------------------- | ------------------------------- |
| R-1 | Intergroup Tier A (`STRIPE_PRODUCT_ID_INTERGROUP_A`) | [`HG-MON-2`](../_shared/pricing.md) | `blocked` — default price unset |
| R-2 | Intergroup Tier B (`STRIPE_PRODUCT_ID_INTERGROUP_B`) | [`HG-MON-3`](../_shared/pricing.md) | `blocked` — default price unset |

Until R-1/R-2 clear, intergroup and treatment-center revenue is `blocked` and
**must not be presented as live**. The consumer group tier ([`HG-MON-1`](../_shared/pricing.md))
has its product configured and is the only tier able to transact today
(source: docs/launch-readiness/homegroups-launch-readiness.md#6-3-stripe-environment-configuration).
Each fix is a ~10-minute Stripe Dashboard action; the launch sequence and owner
are tracked in [`project-management.md`](project-management.md) (rows `HG-P0-1`,
`HG-P0-2`).

---

## The four revenue streams

| ID       | Stream                           | pricing.md row                                                            | Status        | Notes                                                |
| -------- | -------------------------------- | ------------------------------------------------------------------------- | ------------- | ---------------------------------------------------- |
| HG-MON-1 | Group Admin subscription         | [`HG-MON-1`](../_shared/pricing.md)                                       | `in_progress` | Consumer wedge; product configured, activation-gated |
| HG-MON-2 | Intergroup Tier A (≤10 groups)   | [`HG-MON-2`](../_shared/pricing.md)                                       | `blocked`     | R-1 — no default price set                           |
| HG-MON-3 | Intergroup Tier B (unlimited)    | [`HG-MON-3`](../_shared/pricing.md)                                       | `blocked`     | R-2 — no default price set                           |
| HG-MON-4 | Treatment-center plans           | [`HG-MON-2`](../_shared/pricing.md) / [`HG-MON-3`](../_shared/pricing.md) | `blocked`     | Reuses the two intergroup products; inherits R-1/R-2 |
| HG-MON-5 | Group donations (Stripe Connect) | [`HG-MON-5`](../_shared/pricing.md)                                       | `in_progress` | 5% platform fee; coded, low-frequency revenue        |

### Group price — conflict RESOLVED to **$24/year** (per D-1)

Two sources disagree on the consumer group price:

- `homegroups/docs/monetization/model.md` and `roadmap.md` document the
  **shipped** price as **$12/year**
  (source: homegroups/docs/monetization/model.md#subscription-model).
- The launch-readiness assessment recommends **$24–36/year** and flags $12/year
  as "extremely low" — below sustainability, signalling a hobby project to
  institutional buyers, and unable to fund even a single support interaction
  (source: docs/launch-readiness/homegroups-launch-readiness.md#5-3-pricing-analysis).

**Resolution (D-1): launch at $24/year.** Rationale, tied to the launch-readiness
recommendation (its row D-1): "Test $24 first" — 2x the shipped price, still
trivially affordable for any group collecting 7th Tradition (groups handle
$200–2,000+/year), while doubling ARPU and avoiding anchoring the product as a
hobby tier before B2B sales begin
(source: docs/launch-readiness/homegroups-launch-readiness.md#5-4-pricing-recommendations-spec-ready).
The $12/year value is retained only as **historical / migration context** (the
price the code currently resolves from Stripe's default). Activating $24
requires updating the group product's default price in Stripe and is part of the
R-track activation work — see [`HG-MON-1`](../_shared/pricing.md) (`status: in_progress`).

> The group tier is a **distribution flywheel, not a primary revenue engine** in
> Year 1–2: at the resolved group price ([`HG-MON-1`](../_shared/pricing.md))
> even 1,000 groups is a low-thousands-ARR line. Its strategic value is seeding
> the meeting/group network and generating treatment-center referral leads.
> Optimize it for adoption speed, not near-term revenue
> (source: homegroups/docs/monetization/projections.md#section-2-revenue-projections-year-1-monthly-detail).

### Intergroup A/B — recommended A/B pricing

Tier A (≤10 groups) and Tier B (unlimited groups) are the network-effect tiers.
The launch-readiness recommendation positions Tier A well below any B2B software
(per-group-year pricing) and Tier B as network-effect pricing that makes sense
only at scale (source: docs/launch-readiness/homegroups-launch-readiness.md#5-4-pricing-recommendations-spec-ready).
The recommended A/B values are the defaults to set when clearing R-1/R-2 — they
live in rows [`HG-MON-2`](../_shared/pricing.md) and
[`HG-MON-3`](../_shared/pricing.md), both `blocked` in
[`../_shared/pricing.md`](../_shared/pricing.md) until the Stripe default prices
exist.

### Treatment-center tiers — reuse the two intergroup products

Treatment centers are **not a separate Stripe product**. All three B2B UI entry
points (intergroup, district/area, treatment center) fan in to **two** Stripe
products (Tier A, Tier B); the Firestore `type` field is the only discriminator
(source: homegroups/docs/monetization/model.md#pricing-to-product-mapping). The
public marketing page surfaces treatment-center tiers as Basic (`tier_a`),
Referral Partner (`tier_b`), and White-Label (lead-capture, not self-serve
checkout) (source: homegroups/docs/monetization/model.md#treatment-center-checkout).
The launch-readiness recommendation positions dedicated treatment-center annual
tiers at a premium over intergroup, still negligible vs. EHR costs
(source: docs/launch-readiness/homegroups-launch-readiness.md#5-4-pricing-recommendations-spec-ready);
those values live in rows [`HG-MON-2`](../_shared/pricing.md) /
[`HG-MON-3`](../_shared/pricing.md). Because they ride the same two products,
treatment-center checkout inherits the R-1/R-2 blocker — it is `blocked` until
those default prices are set.

> **3-to-2 fan-in cost:** because three customer types map to two Stripe
> products, revenue cannot be segmented by customer type in the Stripe Dashboard
> without adding metadata
> (source: docs/launch-readiness/homegroups-launch-readiness.md#4-4-pricing-to-product-mapping-complexity).
> A future **per-facility facility dashboard** (monthly SaaS pricing — see row
> [`HG-MON-6`](../_shared/pricing.md)) is the recommended dedicated
> treatment-center line once the dashboard ships — see
> [`roadmap.md`](roadmap.md) (`HG-RM-3`).

### Donations — Stripe Connect, 5% platform fee

Groups can optionally connect a Stripe account to accept one-time 7th Tradition
donations via **Express connected accounts + destination charges**; the platform
takes a **5% fee** (`PLATFORM_FEE_PERCENT = 0.05`)
(source: docs/STRIPE_CONNECT_GUIDE.md#1-connect-at-a-glance-both-products).
This is low-frequency, low-margin revenue — coded and promotable, but not a
revenue pillar (source: docs/launch-readiness/homegroups-launch-readiness.md#7-3-business-model-risks).
See row [`HG-MON-5`](../_shared/pricing.md).

---

## Revenue-opportunities status tracker (folded from `revenue-opportunities.md`)

The conversion-and-revenue backlog, with current status using the fixed
vocabulary. Items marked `done` shipped in the May 2026 revenue sprint
(source: homegroups/docs/monetization/revenue-opportunities.md#priority-summary).

| ID       | Opportunity                                   | Tier | Revenue impact | Status        |
| -------- | --------------------------------------------- | ---- | -------------- | ------------- |
| HG-RO-1  | Gate premium screens behind subscription      | P0   | High           | `done`        |
| HG-RO-2  | Remove/resolve 30-day money-back guarantee    | P0   | High           | `done`        |
| HG-RO-3  | Pass admin email to Stripe customer creation  | P0   | High           | `done`        |
| HG-RO-4  | Verify Stripe price interval is annual        | P0   | High           | `planned`     |
| HG-RO-5  | Day 5 trial push notification                 | P1   | High           | `done`        |
| HG-RO-6  | 30-day pre-renewal reminder                   | P1   | High           | `done`        |
| HG-RO-7  | "Ask admin to upgrade" member flow            | P1   | Medium         | `done`        |
| HG-RO-8  | Trial rate limiting                           | P1   | Medium         | `planned`     |
| HG-RO-9  | Treatment-center partnership tier + dashboard | P2   | Very High      | `in_progress` |
| HG-RO-10 | Define + price intergroup tier (R-1/R-2)      | P2   | Medium         | `blocked`     |
| HG-RO-11 | Meeting-attendance verification API (Regroup) | P2   | High           | `in_progress` |
| HG-RO-12 | Treasury report preview gate                  | P3   | High           | `done`        |
| HG-RO-13 | Year-end summary November conversion trigger  | P3   | High           | `done`        |
| HG-RO-14 | Promote donation platform fee                 | P3   | Medium         | `planned`     |
| HG-RO-15 | Promote QR check-in as adoption driver        | P3   | Medium         | `planned`     |

The single highest-impact open lever is **HG-RO-4** (verify the resolved Stripe
price is billed annually, not monthly) paired with clearing **R-1/R-2**
(`HG-RO-10`) so the B2B tiers can transact at all.

---

## 3-year projections (narrative)

From the ecosystem financial model (base case), Homegroups is intentionally the
**lowest-revenue, highest-distribution** product in the portfolio — the consumer
group tier seeds the network that makes Regroup and the future Aftercare product
sellable to treatment centers
(source: homegroups/docs/monetization/projections.md#executive-summary).

| Horizon               | Homegroups contribution (base case)                           | Note                                                                                                                                          |
| --------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Year 1 end (Mar 2027) | ~241 groups; group-tier ARR is a rounding error vs. portfolio | Distribution flywheel, not revenue engine (source: homegroups/docs/monetization/projections.md#year-1-homegroups-arr-2-892-241-groups-12)     |
| Year 2 end (Mar 2028) | ~1,000 groups + ~20 intergroups; intergroup tier un-gates     | Intergroup tier launches once R-1/R-2 clear (source: homegroups/docs/monetization/projections.md#year-2-quarterly-april-2027-march-2028)      |
| Year 3 end (Mar 2029) | ~3,500 groups + ~60 intergroups; donation fees compound       | B2B + facility-dashboard ARPU is the growth path (source: homegroups/docs/monetization/projections.md#year-3-quarterly-april-2028-march-2029) |

The portfolio-level dollar figures, scenarios, and unit economics are owned by
the ecosystem monetization doc and the projections SSOT — this doc does **not**
restate them. The Homegroups-specific takeaway: **B2B (intergroup +
treatment-center + facility dashboard) is the revenue path; the group tier is
the adoption flywheel** (source: docs/launch-readiness/homegroups-launch-readiness.md#7-3-business-model-risks).

The full cross-product model, scenarios, and the 12-month ecosystem sequencing
are **not duplicated here** — see the ecosystem monetization doc and
[`homegroups/docs/plans/2026-04-13-recovery-ecosystem-12-month-plan.md`](../../../homegroups/docs/plans/2026-04-13-recovery-ecosystem-12-month-plan.md).

---

## Decision references

- **D-1** — group price resolved to $24/year (rationale above); recorded in
  [`../_shared/decisions-log.md`](../_shared/decisions-log.md).

## See also

- Pricing rows: [`../_shared/pricing.md`](../_shared/pricing.md) (`HG-MON-*`)
- Launch sequence + owners for R-1/R-2: [`project-management.md`](project-management.md)
- Facility dashboard B2B unlock: [`roadmap.md`](roadmap.md) (`HG-RM-3`)
