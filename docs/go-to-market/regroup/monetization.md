---
title: Regroup — Monetization
scope: regroup
category: monetization
status: in_progress
last_verified: 2026-06-10
sources:
  - regroup/docs/monetization/model.md
  - regroup/mobile/PRICING_STRATEGY.md
  - regroup/docs/product/decisions.md
  - regroup/docs/superpowers/plans/2026-06-06-regroup-tier-billing-migration.md
  - docs/launch-readiness/regroup-launch-readiness.md
  - docs/STRIPE_CONNECT_GUIDE.md
supersedes: []
---

# Regroup — Monetization

Regroup (sober living house management; Firebase project `phoenix-cleanhouse`)
makes money two ways:

1. **Operator subscriptions** — a flat-fee, six-tier model split across two house
   types (Traditional and Oxford); amounts in
   [`../_shared/pricing.md`](../_shared/pricing.md) rows `RG-MON-1`…`RG-MON-6`.
2. **Rent-payment platform fee** — a **2% application fee** on resident rent
   collected through Stripe Connect (destination charges), routed to the house
   operator's connected account.

All price values live in the canonical table
[`../_shared/pricing.md`](../_shared/pricing.md). This doc holds the **narrative,
logic, and projections** and references each price by its stable `sku` ID
(`RG-MON-*`). No price string is restated here.

---

## 1. Canonical pricing model (one model, reconciled)

Multiple historical pricing documents exist; they have been reconciled to **one
canonical model**. The earlier `$10/house + $1/resident` legacy plan and the
`$9.99/$19.99` hardcoded Cloud Functions tiers are **superseded** (see §3 and §4).
The conservative `$39–$99` ladder floated in the 2026-05-24 assessment
(source: regroup/docs/product/decisions.md#pricing-recommended) was **not
adopted**; the approved figures are the **balanced** ladder below.

| sku (pricing.md) | Tier                     | House type  | Notes                                 |
| ---------------- | ------------------------ | ----------- | ------------------------------------- |
| `RG-MON-1`       | Traditional Starter      | Traditional | ≤10 residents, 1 property             |
| `RG-MON-2`       | Traditional Professional | Traditional | ≤20 residents, ≤3 properties          |
| `RG-MON-3`       | Traditional Enterprise   | Traditional | unlimited residents/properties        |
| `RG-MON-4`       | Oxford Standard          | Oxford      | ≤15 residents, 1 property             |
| `RG-MON-5`       | Oxford Plus              | Oxford      | ≤25 residents, 1 property             |
| `RG-MON-6`       | Oxford Network           | Oxford      | regional chapter, unlimited           |
| `RG-MON-7`       | Rent platform fee        | both        | 2% application fee via Stripe Connect |

Tier amounts, billing period, Stripe env-var names, and Connect fee are in
[`../_shared/pricing.md`](../_shared/pricing.md) rows `RG-MON-1`…`RG-MON-7`. The
approved ladder is the "balanced" recommendation
(source: regroup/mobile/PRICING_STRATEGY.md#recommended-strategy) and matches the
in-code `SUBSCRIPTION_TIERS` config
(source: regroup/functions/src/config.ts#L37-L78).

### Why these numbers

- **Value-based, not cost-based.** Infrastructure runs near the Firebase free
  tier; Regroup saves an operator an estimated 15+ hrs/mo of admin time. The
  legacy `~$20/mo` plan captured ~1–2% of value delivered
  (source: regroup/mobile/PRICING_STRATEGY.md#problem-3-captures-only-1-2-of-value-delivered).
- **Two ladders because two markets.** Oxford Houses are democratically run and
  cost-sensitive; pricing sits below 1% of EES collections so a house vote passes
  (source: regroup/docs/monetization/model.md#oxford-house-economics).
- **Network tier is gated.** Do not launch Oxford Network (`RG-MON-6`) until a
  regional chapter is signed; price it on real multi-house demand
  (source: docs/launch-readiness/regroup-launch-readiness.md#5-5-pricing-recommendations-spec-ready).

---

## 2. Rent platform fee (2% via Stripe Connect)

Resident rent flows through **destination charges** on a platform-owned
PaymentIntent with `transfer_data.destination` = the house's connected account and
`application_fee_amount` = 2% of the charge
(source: docs/STRIPE_CONNECT_GUIDE.md#3-2-taking-rent-destination-charge). This is
**implemented and code-verified**: the 2% fee is set in
`createPaymentIntent` (source: regroup/functions/src/callable/payments.ts#L152)
and in scheduled collection
(source: regroup/functions/src/scheduled/scheduledRentCollection.ts#L80).

> Note: the 2026-05-24 strategy doc and the launch-readiness doc reference a "2.5%"
> recommended fee. The **shipped code charges 2%**; 2% is the canonical value
> (`RG-MON-7`). Treat "2.5%" mentions as a superseded recommendation
> (source: docs/launch-readiness/regroup-launch-readiness.md#5-4-platform-fee-opportunity).

At scale the rent fee can **equal or exceed** subscription revenue (driven by avg
rent × residents × 2%); the worked example and figures are in the source
(source: regroup/docs/product/decisions.md#pricing-recommended). Projection
figures are referenced in §5, not restated.

---

## 3. Legacy → tier migration & grandfather decision (D-9)

**Decision D-9 (grandfather window).** 5 live houses are on the legacy
per-house + per-resident plan (legacy amounts and current revenue in the source)
(source: docs/launch-readiness/regroup-launch-readiness.md#3-5-production-current-state).
The approved policy is:

- **Grandfather existing subscribers** at legacy pricing for a **6-month window**,
  then migrate to the nearest tier with personal outreach (5 houses is small
  enough to call each operator)
  (source: regroup/mobile/PRICING_STRATEGY.md#phase-2-grandfather-period-months-1-6).
- New subscriptions created while the tier flag is on use the tier model; legacy
  two-item subscriptions are left untouched — **no data migration is required for
  grandfathering**
  (source: regroup/docs/superpowers/plans/2026-06-06-regroup-tier-billing-migration.md#phase-7-existing-subscriber-strategy).
- Per-subscription migration (when chosen) is done with reviewable Stripe CLI
  `subscriptions update` calls in small batches with a recorded rollback list —
  never an unattended bulk script over live revenue
  (source: regroup/docs/superpowers/plans/2026-06-06-regroup-tier-billing-migration.md#phase-7-existing-subscriber-strategy).

D-9 is recorded in [`../_shared/decisions-log.md`](../_shared/decisions-log.md).

---

## 4. Launch blockers that gate monetization

These are **monetization-blocking** and are tracked operationally in
[`project-management.md`](project-management.md). Summarized here for the money
view:

### 4.1 Hardcoded-price defect (resolved in code; was the headline blocker)

The 2026-05-24 assessment flagged `FREE / $9.99 Basic / $19.99 Premium` hardcoded
in Cloud Functions as a launch blocker — charging a fraction of the target price
(source: regroup/docs/product/decisions.md#issue-2-wrong-subscription-pricing-in-cloud-functions).
**Code reality (2026-06-10):** `9.99`/`19.99` no longer appear in regroup source —
only in historical docs. Subscription pricing is now fully env-var driven through
`SUBSCRIPTION_TIERS` (source: regroup/functions/src/config.ts#L37-L78). The defect
is **closed in code**; the remaining gap is activation (below).

### 4.2 Tier billing not yet activated (P0 — current top blocker)

The six-tier config exists, but the **Stripe Price IDs have not been created** and
the tier objects carry only `priceEnvVar` — no `amountCents` — and there is **no
`TIER_BILLING_ENABLED` flag yet** (the migration plan is written but not
implemented)
(source: docs/launch-readiness/regroup-launch-readiness.md#3-1-pricing-tier-activation-p0-revenue-blocking).
Until the 6 `STRIPE_PRICE_*` secrets are set and one E2E subscription + rent cycle
is verified with a real card, no operator can subscribe on a tier. See
`RG-P0-2`/`RG-P0-3` in [`project-management.md`](project-management.md).

### 4.3 IAP vs. web billing decision (D-11)

Apple's IAP rules affect whether the iOS app can surface the upgrade CTA natively
or must route operators to web checkout. The recommendation is **web-only / hybrid
billing** (0% Apple cut; the `SubscriptionHandler` WebView is already built),
justified by the B2B-SaaS exemption — but this must be **recorded as a decision**
before live Stripe products are finalized
(source: regroup/docs/operations/manual-tasks/2026-05-21-app-store-launch-checklist.md#p0-f-iap-vs-direct-billing-architecture-decision).
Tracked as decision gate D-11.

### 4.4 Subscription-webhook seeding gap (revenue-operations risk)

The `subscriptions` Firestore collection is **read** by five webhook paths but
**written by nothing** — there is no `customer.subscription.created` handler, so
webhook-driven status changes (past-due alerts, renewal updates) never fire; only
the synchronous purchase-time path works
(source: docs/STRIPE_CONNECT_GUIDE.md#3-3-connect-webhook-handlers). This does not
block first revenue but must be closed before billing is trusted at scale.

---

## 5. Projections (narrative)

Projections are **scenario estimates from the source docs**, not commitments. They
assume the balanced ladder (`RG-MON-1`…`RG-MON-6`) plus the 2% rent fee
(`RG-MON-7`).

### 5.1 Today

- 5 active houses, ~50–100 residents, on legacy pricing (current revenue figure in
  the source)
  (source: docs/launch-readiness/regroup-launch-readiness.md#3-5-production-current-state).

### 5.2 Post-activation 12-month target (decisions.md model)

| Source            | Houses | Driver | MRR (see pricing.md projections) |
| ----------------- | ------ | ------ | -------------------------------- |
| Subscriptions     | 50     | tier   | per decisions.md projection      |
| Rent payment fees | 30     | 2% fee | per decisions.md projection      |

The combined MRR/ARR figures for this milestone live in the source and in the
pricing.md projections section; they are not restated here
(source: regroup/docs/product/decisions.md#pricing-recommended).

### 5.3 3-year scenario (PRICING_STRATEGY.md)

The balanced model projects subscription growth plus rent-processing volume scaling
materially across Years 1–3 (exact ARR figures in the source)
(source: regroup/mobile/PRICING_STRATEGY.md#9-revenue-projections-3-year). These
are **aspirational** and depend on Oxford-House acquisition and rent-collection
adoption rates that are not yet validated. The launch-readiness doc rates overall
readiness **5/10** — pricing activation, web modernization, and E2E payment
validation are all required before any of these numbers are real
(source: docs/launch-readiness/regroup-launch-readiness.md#1-executive-summary).

---

## Cross-references

- Prices, Stripe env vars, Connect fee → [`../_shared/pricing.md`](../_shared/pricing.md)
- Launch blockers, owners, sequencing → [`project-management.md`](project-management.md)
- Feature build status (incl. phantom features) → [`roadmap.md`](roadmap.md)
- Decisions D-9, D-11 → [`../_shared/decisions-log.md`](../_shared/decisions-log.md)
