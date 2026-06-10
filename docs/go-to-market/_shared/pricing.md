---
title: Shared — Canonical Pricing Table
scope: ecosystem
category: monetization
status: in_progress
last_verified: 2026-06-10
sources:
  - regroup/docs/monetization/model.md
  - regroup/mobile/PRICING_STRATEGY.md
  - homegroups/docs/monetization/model.md
  - detox-recovery/docs/monetization/projections.md
  - docs/STRIPE_CONNECT_GUIDE.md
supersedes: []
---

# Shared — Canonical Pricing Table

> **This is the ONLY file in `docs/go-to-market/` permitted to hold price
> values.** Per AI-optimization convention #2 (_one fact, one home_), every
> other deliverable links to a row here rather than restating a number. No price
> string is written twice anywhere in the tree.

Rows are filled by **Phases 2–4** (regroup, homegroups, detox-recovery) and
read by **Phase 5** (ecosystem) — never re-typed elsewhere. Reference a row by
its `sku`. The `stripe_price_env_var` column names the environment variable
only — **never the secret value** (privacy/secrets rule, convention #7).

`status` uses the fixed vocabulary: `done | in_progress | blocked | planned | not_started`.

| product        | sku       | price                                            | billing_period         | stripe_product_id | stripe_price_env_var                                            | connect_fee | status      | source                                                                                                                                                                           |
| -------------- | --------- | ------------------------------------------------ | ---------------------- | ----------------- | --------------------------------------------------------------- | ----------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| regroup        | RG-MON-1  | $69                                              | monthly                | TBD               | STRIPE_PRICE_TRAD_STARTER                                       | n/a         | blocked     | regroup/mobile/PRICING_STRATEGY.md#recommended-strategy; regroup/functions/src/config.ts#L37-L78                                                                                 |
| regroup        | RG-MON-2  | $129                                             | monthly                | TBD               | STRIPE_PRICE_TRAD_PROFESSIONAL                                  | n/a         | blocked     | regroup/mobile/PRICING_STRATEGY.md#recommended-strategy; regroup/functions/src/config.ts#L37-L78                                                                                 |
| regroup        | RG-MON-3  | $249                                             | monthly                | TBD               | STRIPE_PRICE_TRAD_ENTERPRISE                                    | n/a         | blocked     | regroup/mobile/PRICING_STRATEGY.md#recommended-strategy; regroup/functions/src/config.ts#L37-L78                                                                                 |
| regroup        | RG-MON-4  | $49                                              | monthly                | TBD               | STRIPE_PRICE_OXFORD_STANDARD                                    | n/a         | blocked     | regroup/mobile/PRICING_STRATEGY.md#recommended-strategy; regroup/functions/src/config.ts#L37-L78                                                                                 |
| regroup        | RG-MON-5  | $89                                              | monthly                | TBD               | STRIPE_PRICE_OXFORD_PLUS                                        | n/a         | blocked     | regroup/mobile/PRICING_STRATEGY.md#recommended-strategy; regroup/functions/src/config.ts#L37-L78                                                                                 |
| regroup        | RG-MON-6  | $299                                             | monthly                | TBD               | STRIPE_PRICE_OXFORD_NETWORK                                     | n/a         | planned     | regroup/mobile/PRICING_STRATEGY.md#recommended-strategy; docs/launch-readiness/regroup-launch-readiness.md#5-5-pricing-recommendations-spec-ready                                |
| regroup        | RG-MON-7  | 2%                                               | per-rent-txn           | n/a               | n/a (computed Math.round\*0.02)                                 | 2%          | done        | regroup/functions/src/callable/payments.ts#L152; regroup/functions/src/scheduled/scheduledRentCollection.ts#L80                                                                  |
| homegroups     | HG-MON-1  | $24/yr                                           | yearly                 | TBD               | STRIPE_PRODUCT_ID_GROUP                                         | n/a         | in_progress | docs/launch-readiness/homegroups-launch-readiness.md#5-4-pricing-recommendations-spec-ready                                                                                      |
| homegroups     | HG-MON-2  | $99/yr (rec.)                                    | yearly                 | TBD               | STRIPE_PRODUCT_ID_INTERGROUP_A                                  | n/a         | blocked     | docs/launch-readiness/homegroups-launch-readiness.md#3-3-revenue-activation-p1                                                                                                   |
| homegroups     | HG-MON-3  | $249/yr (rec.)                                   | yearly                 | TBD               | STRIPE_PRODUCT_ID_INTERGROUP_B                                  | n/a         | blocked     | docs/launch-readiness/homegroups-launch-readiness.md#3-3-revenue-activation-p1                                                                                                   |
| homegroups     | HG-MON-4  | $199/$499/yr (rec., TC tiers reuse A/B products) | yearly                 | TBD               | STRIPE_PRODUCT_ID_INTERGROUP_A / STRIPE_PRODUCT_ID_INTERGROUP_B | n/a         | blocked     | homegroups/docs/monetization/model.md#pricing-to-product-mapping                                                                                                                 |
| homegroups     | HG-MON-5  | donation amount (variable)                       | one-time               | n/a               | n/a                                                             | 5%          | in_progress | docs/STRIPE_CONNECT_GUIDE.md#1-connect-at-a-glance-both-products                                                                                                                 |
| homegroups     | HG-MON-6  | $99/mo (rec., future)                            | monthly                | TBD               | TBD                                                             | n/a         | planned     | docs/launch-readiness/homegroups-launch-readiness.md#5-4-pricing-recommendations-spec-ready                                                                                      |
| detox-recovery | DX-MON-1  | $75                                              | per-call (30-min)      | TBD               | NEXT_PUBLIC_STRIPE_SUPPORT_CALL_URL                             | n/a         | done        | Stripe; single-sourced in lib/services-data.ts SERVICE_TIERS (id support-call); detox-recovery/docs/superpowers/plans/2026-06-07-detox-completion.md#pricing-research-summary    |
| detox-recovery | DX-MON-2  | $150 avg ($125–$175)                             | per-call (60-min)      | TBD               | NEXT_PUBLIC_STRIPE_FAMILY_CALL_URL                              | n/a         | planned     | Stripe; Tier 3 target Q3 2026, link not yet created; detox-recovery/docs/monetization/projections.md#1-business-model-summary                                                    |
| detox-recovery | DX-MON-3  | $450 avg ($300–$600)                             | per-package (2-week)   | TBD               | NEXT_PUBLIC_STRIPE_NAV_PACKAGE_URL                              | n/a         | planned     | Stripe; Tier 4 target Q2 2027; detox-recovery/docs/monetization/model.md#14-tier-4--two-week-navigation-package-450-mid-point                                                    |
| detox-recovery | DX-MON-4  | $19.99                                           | one-time (digital PDF) | n/a               | NEXT_PUBLIC_LEMONSQUEEZY_FAMILY_GUIDE_URL                       | n/a         | planned     | Lemon Squeezy (merchant of record); blocked on PDF authorship; detox-recovery/docs/operations/manual-tasks/2026-05-23-lemon-squeezy-migration.md#5-create-the-5-digital-products |
| detox-recovery | DX-MON-5  | $9.99                                            | one-time (digital PDF) | n/a               | NEXT_PUBLIC_LEMONSQUEEZY_APPOINTMENT_PREP_URL                   | n/a         | planned     | Lemon Squeezy; blocked on PDF authorship; detox-recovery/docs/operations/manual-tasks/2026-05-23-lemon-squeezy-migration.md#5-create-the-5-digital-products                      |
| detox-recovery | DX-MON-6  | $9.99                                            | one-time (digital PDF) | n/a               | NEXT_PUBLIC_LEMONSQUEEZY_SAFETY_CHECKLIST_URL                   | n/a         | planned     | Lemon Squeezy; blocked on PDF authorship; detox-recovery/docs/operations/manual-tasks/2026-05-23-lemon-squeezy-migration.md#5-create-the-5-digital-products                      |
| detox-recovery | DX-MON-7  | $9.99                                            | one-time (digital PDF) | n/a               | NEXT_PUBLIC_LEMONSQUEEZY_TREATMENT_COMPARISON_URL               | n/a         | planned     | Lemon Squeezy; blocked on PDF authorship; detox-recovery/docs/operations/manual-tasks/2026-05-23-lemon-squeezy-migration.md#5-create-the-5-digital-products                      |
| detox-recovery | DX-MON-8  | $9.99                                            | one-time (digital PDF) | n/a               | NEXT_PUBLIC_LEMONSQUEEZY_RELAPSE_PREVENTION_URL                 | n/a         | planned     | Lemon Squeezy; blocked on PDF authorship; detox-recovery/docs/operations/manual-tasks/2026-05-23-lemon-squeezy-migration.md#5-create-the-5-digital-products                      |
| detox-recovery | DX-MON-9  | $4,000/engagement ($1,500–$7,500 band)           | per-engagement         | TBD               | n/a (Stripe Invoices, contact-for-quote)                        | n/a         | in_progress | Stripe Invoices, manual; active warm leads; detox-recovery/docs/monetization/projections.md#1-business-model-summary                                                             |
| detox-recovery | DX-MON-10 | $1,500/month                                     | monthly (retainer)     | TBD               | n/a (Stripe Invoices)                                           | n/a         | planned     | Stripe Invoices; Year 3 target; detox-recovery/docs/monetization/projections.md#1-business-model-summary                                                                         |
| detox-recovery | DX-MON-11 | $20/month                                        | monthly (subscription) | TBD               | TBD (Circle.so / Stripe)                                        | n/a         | planned     | Group "Field Notes Plus"; Year 2 launch; detox-recovery/docs/monetization/projections.md#1-business-model-summary                                                                |
| detox-recovery | DX-MON-12 | ~$30/session                                     | per-session            | n/a               | n/a (VA/Medicaid billing)                                       | n/a         | planned     | VA Community Care / Medicaid PSS; Year 2 post-cert; detox-recovery/docs/monetization/projections.md#stream-v1-va-community-care-billing                                          |
| detox-recovery | DX-MON-13 | customer-chosen (variable)                       | one-time               | TBD               | NEXT_PUBLIC_STRIPE_DONATION_URL                                 | n/a         | done        | Stripe; live donation link; detox-recovery/docs/monetization/model.md#appendix--stripe-environment-variables-reference                                                           |

## Revenue projections

Multi-year revenue projections (not SKUs). Kept here per convention #2 (one
fact, one home); referenced by the per-product monetization docs by `id`.

| product        | id         | p10     | p50      | p90      | period          | source                                                                   |
| -------------- | ---------- | ------- | -------- | -------- | --------------- | ------------------------------------------------------------------------ |
| detox-recovery | DX-PROJ-Y1 | $7,500  | $18,063  | $32,000  | annual (Year 1) | detox-recovery/docs/monetization/projections.md#three-year-summary-table |
| detox-recovery | DX-PROJ-Y2 | $28,500 | $55,925  | $90,000  | annual (Year 2) | detox-recovery/docs/monetization/projections.md#three-year-summary-table |
| detox-recovery | DX-PROJ-Y3 | $58,000 | $139,250 | $225,000 | annual (Year 3) | detox-recovery/docs/monetization/projections.md#three-year-summary-table |
