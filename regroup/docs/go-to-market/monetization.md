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
supersedes:
  - regroup/docs/monetization/model.md
  - regroup/mobile/PRICING_STRATEGY.md
---

# Regroup — Monetization

Regroup (sober living house management; Firebase project `phoenix-cleanhouse`)
makes money two ways:

1. **Operator subscriptions** — a flat-fee, six-tier model split across two house
   types (Traditional and Oxford); amounts in
   [`../_shared/pricing.md`](../../../docs/go-to-market/_shared/pricing.md) rows `RG-MON-1`…`RG-MON-6`.
2. **Rent-payment platform fee** — a **2% application fee** on resident rent
   collected through Stripe Connect (destination charges), routed to the house
   operator's connected account.

All price values live in the canonical table
[`../_shared/pricing.md`](../../../docs/go-to-market/_shared/pricing.md). This doc holds the **narrative,
logic, and projections** and references each price by its stable `sku` ID
(`RG-MON-*`). No price string is restated here.

---

## 1. Canonical pricing model (one model, reconciled)

Multiple historical pricing documents exist; they have been reconciled to **one
canonical model**. The earlier `$10/house + $1/resident` legacy plan (≈$20/mo
average) and the `$9.99/$19.99` hardcoded Cloud Functions tiers are **superseded**
(see §3 and §4). A conservative `$39–$99` ladder was floated in the 2026-05-24
strategic assessment (Oxford Standard $39 / Oxford Plus $69; traditional Starter
$49 / Professional $99) but was **not adopted**; the approved figures are the
**balanced** ladder below — the same six-tier shape now hardcoded as labels and
resident limits in `SUBSCRIPTION_TIERS`
(source: regroup/functions/src/config.ts#L37-L78). Historical provenance for the
rejected conservative ladder: `regroup/docs/product/decisions.md` (stubbed).

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
[`../_shared/pricing.md`](../../../docs/go-to-market/_shared/pricing.md) rows `RG-MON-1`…`RG-MON-7`. The
approved ladder is the "balanced" recommendation (Model #3 of five evaluated
pricing models — chosen over conservative, aggressive-value, flat-rate, and
per-resident alternatives because it maximizes revenue while staying inside the
affordability ceiling for both house types) and matches the in-code
`SUBSCRIPTION_TIERS` config
(source: regroup/functions/src/config.ts#L37-L78). Provenance for the model
selection: `regroup/mobile/PRICING_STRATEGY.md` §3/§4 (stubbed).

### Why these numbers

- **Value-based, not cost-based.** Infrastructure runs near the Firebase free
  tier. Estimated monthly value delivered to an average traditional house is
  ~$1,400 (≈15 hrs admin time saved at $50/hr = $750, GPS meeting-fraud
  prevention ~$200, fewer disputes ~$150, compliance-violation avoidance ~$300).
  The legacy `~$20/mo` plan captured ~1.4% of that value (a ~69× customer ROI);
  the industry standard is 10–20% capture, and even the balanced ladder leaves
  customers a ~10× ROI. (orig: regroup/mobile/PRICING_STRATEGY.md "Problem 3",
  stubbed.)
- **Two ladders because two markets.** Oxford Houses are democratically run and
  cost-sensitive. A 10-resident Oxford House collects ~$5,000/mo in EES
  ($400–600/resident) against ~$2,775/mo expenses, leaving a $1,225–3,225
  cushion; affordability lands at ~1–2% of collections ($35–75/mo). Pricing the
  Oxford tiers at ~1–1.5% of collections keeps a house democratic vote passing
  easily. (orig: regroup/docs/monetization/model.md "Oxford House Economics",
  stubbed.)
- **Network tier is gated.** Do not launch Oxford Network (`RG-MON-6`) until a
  regional chapter is signed; price it on real multi-house demand
  (source: docs/launch-readiness/regroup-launch-readiness.md#5-5-pricing-recommendations-spec-ready).

---

## 1a. Multi-house bundle discounts (legacy per-house model only)

Operators running multiple houses on the **legacy per-house subscription** receive
a stacking subscription discount, applied automatically as a Stripe coupon:

| Houses | Coupon ID          | Discount |
| ------ | ------------------ | -------- |
| 3–4    | `regroup-bundle-3` | 10% off  |
| 5+     | `regroup-bundle-5` | 15% off  |

The discount is recomputed from the operator's house count whenever houses are
added/removed (`updateSubscriptionHouses`) and on demand via the
`applyBundleDiscount` callable; it is removed when the count drops below 3
(source: regroup/functions/src/api/stripe.ts `getBundleCoupon` /
`applyBundleDiscountToSubscription`; coupons are `duration: forever`).

**Bundles do NOT apply to the six-tier model.** Tier subscriptions express
multi-property capacity through the tier itself (Professional / Enterprise /
Network), not per-house quantity, so stacking a per-house bundle coupon on a tier
would double-discount. The `applyBundleDiscount` callable explicitly skips any
subscription that carries a `tier` (decision locked 2026-06-22, gate P-6,
legacy-only). New tier operators who scale houses move up a tier rather than
accruing bundle coupons.

> **Stripe state (2026-06-22):** both coupons exist and are valid in **test mode**.
> They are **not yet created in live mode** — the available `rk_live_` restricted
> key lacks coupon-write permission, so they must be created in the Stripe
> Dashboard (or via a full-access key) before the legacy bundle path can discount
> a production subscription.

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

At scale the rent fee can **equal or exceed** subscription revenue. Worked
example: $800 avg rent × 15 residents × 2% = ~$240/house/mo in platform fee —
which on its own meets or beats the subscription line for the same house.
(orig: regroup/docs/product/decisions.md "Pricing (Recommended)", stubbed.)
Projection figures are referenced in §5, not restated.

---

## 3. Legacy → tier migration & grandfather decision (D-9)

**Decision D-9 (grandfather window).** 5 live houses are on the legacy
per-house + per-resident plan (legacy amounts and current revenue in the source)
(source: docs/launch-readiness/regroup-launch-readiness.md#3-5-production-current-state).
The approved policy is:

- **Grandfather existing subscribers** at legacy pricing for a **6-month window**,
  then migrate to the nearest tier with personal outreach (5 houses is small
  enough to call each operator). The communicated sequence is: months 1–6
  pricing protected (no action required); around month 3 a permanent "founder
  pricing" discount (~20–30% off the standard tier, locked for the lifetime of
  the account) is offered to early customers; months 5–6 migration reminders;
  migration executed at month 7. (orig: regroup/mobile/PRICING_STRATEGY.md
  "Migration Strategy" §8, stubbed.)
- New subscriptions created while the tier flag is on use the tier model; legacy
  two-item subscriptions are left untouched — **no data migration is required for
  grandfathering**
  (source: regroup/docs/superpowers/plans/2026-06-06-regroup-tier-billing-migration.md#phase-7-existing-subscriber-strategy).
- Per-subscription migration (when chosen) is done with reviewable Stripe CLI
  `subscriptions update` calls in small batches with a recorded rollback list —
  never an unattended bulk script over live revenue
  (source: regroup/docs/superpowers/plans/2026-06-06-regroup-tier-billing-migration.md#phase-7-existing-subscriber-strategy).

D-9 is recorded in [`../_shared/decisions-log.md`](../../../docs/go-to-market/_shared/decisions-log.md).

---

## 4. Launch blockers that gate monetization

These are **monetization-blocking** and are tracked operationally in
[`project-management.md`](project-management.md). Summarized here for the money
view:

### 4.1 Hardcoded-price defect (resolved in code; was the headline blocker)

The 2026-05-24 assessment flagged `FREE / $9.99 Basic / $19.99 Premium` hardcoded
in `createOrUpdateSubscription` / `createCheckoutSession` as a launch blocker —
every paying operator was charged $9.99–$19.99 instead of the $39–$99 target,
holding MRR at ~$100–150 instead of $400–1,000+ on the same customer base.
(orig: regroup/docs/product/decisions.md "Issue 2 — Wrong Subscription Pricing",
stubbed.)
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
or must route operators to web checkout. The three options are: **(A) web-only**
— upgrade CTA opens the `SubscriptionHandler` WebView to the web subscribe page
(0% Apple cut, already built, no engineering); **(B) native IAP** — Apple payment
sheet via StoreKit 2 (15–30% Apple cut, 2–3 weeks engineering); **(C) hybrid** —
free tier in-app, paid upgrade only via web link (same as A). The recommendation
is **A/C (web-only / hybrid)**: 0% cut, the WebView is already wired, and Regroup
is a B2B operator tool (operators subscribe, not end users making micropurchases),
which Apple has historically permitted to link out. **RESOLVED 2026-06-13 —
web-only/hybrid (A/C) adopted**; no native IAP. This unblocks finalizing live
Stripe products (RG-P0-2).
(orig: regroup/docs/operations/manual-tasks/2026-05-21-app-store-launch-checklist.md
"P0-F", stubbed.) Tracked as decision gate D-11.

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

### 5.2 Post-activation 12-month target (strategic-assessment model)

| Source            | Houses | Avg/mo | MRR                          |
| ----------------- | ------ | ------ | ---------------------------- |
| Subscriptions     | 50     | ~$70   | ~$3,500                      |
| Rent payment fees | 30     | ~$200  | ~$6,000                      |
| **Combined**      |        |        | **~$9,500 MRR (~$114K ARR)** |

Path to ~$200K ARR is roughly 100+ houses; Oxford-House word-of-mouth typically
brings 2–3 neighboring houses within 6 months of each acquisition.
(orig: regroup/docs/product/decisions.md "Pricing (Recommended)" 12-month
projection, stubbed.)

### 5.3 3-year scenario (balanced-model projection)

The balanced model projects total revenue scaling from ~$255K (Year 1, 250
houses) to ~$1.49M (Year 2, 500 houses) to ~$3.27M (Year 3, 1,000 houses), split
across subscriptions, payment-processing volume, and (Year 3) add-ons — with net
margin widening from ~16% to ~75% as fixed costs amortize:

| Metric        | Year 1 (250) | Year 2 (500) | Year 3 (1,000) |
| ------------- | ------------ | ------------ | -------------- |
| Subscriptions | ~$180K       | ~$697K       | ~$1.31M        |
| Payment fees  | ~$75K        | ~$789K       | ~$1.83M        |
| Add-ons       | $0           | $0           | ~$130K         |
| **Total**     | **~$255K**   | **~$1.49M**  | **~$3.27M**    |
| Net margin    | ~16%         | ~68%         | ~75%           |

(orig: regroup/mobile/PRICING_STRATEGY.md "Revenue Projections (3-Year)" §9,
stubbed.) These are **aspirational** and depend on Oxford-House acquisition and
rent-collection adoption rates that are not yet validated. The launch-readiness
doc rates overall readiness **5/10** — pricing activation, web modernization, and
E2E payment validation are all required before any of these numbers are real
(source: docs/launch-readiness/regroup-launch-readiness.md#1-executive-summary).

---

## Cross-references

- Prices, Stripe env vars, Connect fee → [`../_shared/pricing.md`](../../../docs/go-to-market/_shared/pricing.md)
- Launch blockers, owners, sequencing → [`project-management.md`](project-management.md)
- Feature build status (incl. phantom features) → [`roadmap.md`](roadmap.md)
- Decisions D-9, D-11 → [`../_shared/decisions-log.md`](../../../docs/go-to-market/_shared/decisions-log.md)
