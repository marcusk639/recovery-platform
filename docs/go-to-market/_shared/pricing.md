---
title: Shared — Canonical Pricing Table
scope: ecosystem
category: monetization
status: not_started
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

| product | sku | price | billing_period | stripe_product_id | stripe_price_env_var | connect_fee | status | source |
| ------- | --- | ----- | -------------- | ----------------- | -------------------- | ----------- | ------ | ------ |
