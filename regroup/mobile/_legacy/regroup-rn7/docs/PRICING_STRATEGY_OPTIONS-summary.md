> ⚠️ **Legacy document.** Carried over from the standalone `regroup-rn7` repository, archived on 2026-06-06. Historical reference only — may be outdated and is NOT part of current `mobile` documentation.

# RATS Pricing Strategy Options — Summary

> **Full doc:** [PRICING_STRATEGY_OPTIONS.md](./PRICING_STRATEGY_OPTIONS.md) > **Last reviewed:** 2026-05-24
> **Audience:** operator, mixed
> **Note:** Written Nov 2025 against the $10/house + $1/resident baseline. Cross-reference [STRATEGIC_PLATFORM_ASSESSMENT_2026.md](./STRATEGIC_PLATFORM_ASSESSMENT_2026.md) for current recommended pricing.

## Purpose

Analyzes 6 pricing strategies for RATS from conservative to aggressive, with revenue projections at 250 houses. Core thesis: price on value delivered (~$1,000/month in saved admin time), not on infrastructure cost.

## Key Concepts

- **Current pricing is broken**: $10 + $1/resident captures only 1–2% of delivered value; signals a "hobby project."
- **Value anchor**: RATS saves $500–1,000/month in admin time + fraud prevention + compliance tracking. Pricing should reflect this.
- **Recommended range**: $49–129/month for traditional houses; $39–89 for Oxford Houses (lower volume, tighter budgets).
- **At 250 houses**: current model = $60K/year (unsustainable); recommended = $204K/year (scalable); aggressive = $312K/year.
- **Support economics** flip at ~$79/month: below that, support costs exceed revenue at scale.
- **Oxford Houses** should be priced lower (peer-run, community organizations) but still at 3–5x current.

## Critical Decisions / Rules

- **Raise prices for new customers immediately** — existing customers get 6-month grandfather period.
- **Do NOT use per-resident pricing** as the primary axis — operators budget on the house, not headcount.
- Tiered value-based pricing (Starter / Professional / Multi-House) outperforms flat pricing for upsell.
- B2B / treatment center tier requires annual contracts ($500–2,000/month) — separate sales motion.

## Quick Reference

| Strategy           | Price Point       | Annual Rev (250 houses) |
| ------------------ | ----------------- | ----------------------- |
| Current            | $10 + $1/resident | $60K                    |
| Conservative       | $49–89/month      | $132K                   |
| **Recommended**    | **$79–129/month** | **$204K**               |
| Aggressive         | $99–199/month     | $312K                   |
| Premium/Enterprise | $200–500/month    | $456K                   |

Oxford House pricing: roughly 60–70% of traditional equivalent tier.

## What's NOT Here

- Stripe implementation details (see `regroup-functions/src/callable/subscriptions.ts`)
- Current Stripe product/price IDs (see `docs/superpowers/plans/2026-05-21-stripe-product-setup.md`)
- App Store pricing considerations
- Competitive analysis (see `docs/recovery-ecosystem-market-brief.md`)

---

_Last reviewed: 2026-05-24 | Audience: operator | Type: reference_
