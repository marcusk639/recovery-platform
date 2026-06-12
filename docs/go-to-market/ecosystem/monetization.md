---
title: Ecosystem — Monetization
scope: ecosystem
category: monetization
status: in_progress
last_verified: 2026-06-10
sources:
  - docs/go-to-market/_shared/pricing.md
  - docs/STRIPE_CONNECT_GUIDE.md
  - docs/strategy/market-opportunity.md
  - recovery-api/src/config/apps.ts
  - recovery-api/CLAUDE.md
  - regroup/docs/go-to-market/monetization.md
  - homegroups/docs/go-to-market/monetization.md
  - detox-recovery/docs/go-to-market/monetization.md
supersedes:
  - docs/strategy/monetization.md
  - docs/strategy/market-opportunity.md
---

# Ecosystem — Monetization

> The cross-platform revenue model. This file **supersedes the stale
> `docs/strategy/monetization.md`** (its intergroup / treatment-center pricing
> diverged from the launch-readiness decision gates; do not echo it). **No price
> value is typed here** — every figure is read from
> [`../_shared/pricing.md`](../_shared/pricing.md) by `sku`/`id` per AI-optimization
> convention #2 (one fact, one home). Where two streams are summed, the summed
> rows are cited so the total cannot drift from the per-product SSOTs.

---

## 1. Three revenue engines + two platform fees + one open bus

The platform earns through three independent product P&Ls today, two
Stripe-Connect platform fees that skim transaction volume, and one
**undefined** ecosystem layer (the referral bus, D-10 below).

| Engine                      | Product        | Primary SKUs (→ pricing.md)                                                                        | Platform fee                                           | Live today?                                         |
| --------------------------- | -------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------- |
| Sober-living operations     | regroup        | [`RG-MON-1`..`RG-MON-6`](../_shared/pricing.md) (tiers)                                            | **2% rent** ([`RG-MON-7`](../_shared/pricing.md))      | fee `done` in code; tiers `blocked` on Stripe IDs   |
| 12-step group operations    | homegroups     | [`HG-MON-1`](../_shared/pricing.md) (group); [`HG-MON-2`..`HG-MON-4`](../_shared/pricing.md) (B2B) | **5% donations** ([`HG-MON-5`](../_shared/pricing.md)) | group `in_progress`; B2B `blocked` (R-1/R-2)        |
| Withdrawal navigation / B2B | detox-recovery | [`DX-MON-1`](../_shared/pricing.md) (call); [`DX-MON-9`](../_shared/pricing.md) (B2B)              | n/a (Stripe direct + Lemon Squeezy MoR)                | Tier 2 + donations `done`; rest `planned`/`blocked` |
| **Cross-app referral bus**  | recovery-api   | **none defined** — see D-10                                                                        | **TBD (D-10)**                                         | endpoints exist; **monetization undefined**         |

Per-stream narrative, blockers, and projections live in the per-product
monetization docs — this doc only assembles them:

- [`../regroup/monetization.md`](../../../regroup/docs/go-to-market/monetization.md)
- [`../homegroups/monetization.md`](../../../homegroups/docs/go-to-market/monetization.md)
- [`../detox-recovery/monetization.md`](../../../detox-recovery/docs/go-to-market/monetization.md)

---

## 2. Stripe Connect platform fees (the volume skim)

Both Connect products use **Express** accounts and **destination charges** — the
PaymentIntent is created on the platform account with `transfer_data.destination`
pointing at the connected account, so funds route to the house/group while the
platform keeps the record and the webhook fires reliably
(source: docs/STRIPE_CONNECT_GUIDE.md#1-connect-at-a-glance-both-products).

| Product    | What is charged               | Platform fee                                                       | Code anchor (verified)                                                          |
| ---------- | ----------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| regroup    | Resident rent payments        | **2%** ([`RG-MON-7`](../_shared/pricing.md), status `done`)        | `regroup/functions/src/callable/payments.ts#L152` (`Math.round(amount * 0.02)`) |
| homegroups | Group 7th-Tradition donations | **5%** ([`HG-MON-5`](../_shared/pricing.md), status `in_progress`) | `homegroups/functions/src/utils/stripe.ts#L55` (`PLATFORM_FEE_PERCENT = 0.05`)  |

These fees are the **most scalable** ecosystem revenue: they grow with the
customer's own transaction volume and require no new SKU. The 2% rent fee is
already shipped to the 5 live Regroup houses; the 5% donation fee is coded and
low-frequency today (source: docs/STRIPE_CONNECT_GUIDE.md#1-connect-at-a-glance-both-products).
Fee **rates** are owned by the per-product docs (D-5 kept Regroup at 2%); this doc
does not restate or re-decide them.

---

## 3. recovery-api referral-monetization model — **OPEN DECISION D-10**

### 3.1 What exists vs. what is undefined

The referral **mechanism** is built and the identity layer is canonical:

- Endpoints: `POST/GET /api/referrals`, `GET /api/referrals/:id`
  (source: docs/ecosystem/integration.md#recovery-api-endpoints).
- Canonical app-id registry is the SSOT for who can originate/receive a referral:
  originators `homegroups`, `phoenix-cleanhouse`, `nextstep-recovery`; target-only
  `treatment-center` (source: recovery-api/src/config/apps.ts; recovery-api/CLAUDE.md#auth-model).

What is **undefined** is whether a referral **costs anything and who pays**. There
is no pricing row, no fee, no SKU for referrals anywhere in
[`../_shared/pricing.md`](../_shared/pricing.md). That is the gap D-10 closes.

> **Honesty guard.** The referral bus is **not a live revenue stream**. The
> detox-recovery launch definition explicitly keeps the recovery-api referral
> relay **disabled** pending a partner agreement
> (source: detox-recovery/docs/go-to-market/project-management.md#launch-done-definition).
> D-10 defines the model to apply **when** the relay is turned on; it does not
> assert revenue today.

### 3.2 Options

| Option                                      | Mechanic                                                                                                                                | Pros                                                                                                                                        | Cons                                                                                                                                       | Best when                                                           |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| **O-1 Flat per-referral fee**               | Charge the **receiving** app (or the treatment center) a fixed amount per accepted referral, billed via Stripe Invoices on recovery-api | Simple to meter (one referral doc = one unit); predictable; no conversion tracking needed                                                   | Weak link to value; risks looking like a patient-brokering kickback (legal/ethical review needed)                                          | Volume is low and you want a clean, auditable first model           |
| **O-2 Rev-share on converted referral**     | Take a % of the **first paid transaction** the referred user makes in the destination app (e.g. first rent payment, first paid call)    | Aligns price with realized value; only earns when the platform actually helped                                                              | Requires cross-app conversion attribution (a build); slower to first dollar                                                                | You want incentive-aligned pricing and can build attribution        |
| **O-3 B2B SaaS seat for treatment centers** | The center pays a **subscription seat** for the continuing-care view; referrals are a feature of that seat, not metered individually    | Largest contract value; recurring; matches how centers already buy software; **reduces (does not eliminate)** per-referral brokering optics | Requires the facility dashboard + aftercare pipeline (ECO-6/ECO-7, **not built**) before it can sell — so O-3 cannot earn until that ships | The facility dashboard exists and the buyer is the treatment center |

### 3.3 Recommendation

**Adopt O-3 (B2B treatment-center seat) as the strategic model, with O-1 (flat
per-referral fee) as a tactical bridge until the facility dashboard ships.**

Rationale:

- The treatment center is the highest-value, clearest-pain buyer
  ([`vision.md`](vision.md#3-post-discharge-outcome-visibility-the-treatment-center-buyer)),
  and a recurring seat matches how centers already procure software — it is the
  durable model. But O-3 **cannot sell until ECO-6 (facility dashboard) exists**,
  which is `not_started` ([`roadmap.md`](roadmap.md)).
- O-1 is the only option that earns **before** any new build: the referral doc is
  already created and meterable, so a flat per-referral fee billed via Stripe
  Invoices can switch on as soon as a partner agreement exists and the relay is
  enabled.
- O-2 is rejected as the _primary_ model because cross-app conversion attribution
  is itself an unbuilt pipeline (overlaps ECO-7 aftercare) and adds the most build
  cost for the least near-term certainty. It can be revisited as an O-3 add-on
  once attribution exists.

**Avoid the brokering trap:** any per-referral money movement (O-1, O-2) must
clear review by **specialized healthcare counsel** — covering **EKRA** and **each
operating state's patient-brokering statute** — before it is enabled. Treat O-1/O-2
as **likely unsalvageable** under current law. Folding referrals into a flat
software seat (O-3) is a **cleaner** posture (it _reduces, but does not eliminate_,
brokering exposure) and a reason to favor it — though that clean-posture narrative
is partly aspirational until the unbuilt facility dashboard that makes O-3 sellable
(ECO-6/ECO-7) actually ships.

D-10 is recorded as **open** in [`../_shared/decisions-log.md`](../_shared/decisions-log.md)
with this recommendation; the roadmap item that depends on it is
[`roadmap.md`](roadmap.md) `ECO-8` (referral-bus monetization).

---

## 4. Combined-ecosystem revenue picture

> This is the **sum of the built per-product revenue ladders only**. Earlier
> versions carried a higher "scenario" headline ($1.74M / $7.84M 3-yr) that folded
> in marketplace / data / cross-sell **synergy the platform has not built**; that
> uplift is removed here. External SUD-SaaS benchmarks put solo / early-stage ARR
> well below the moderate figures — treat the moderate column as an optimistic
> ceiling, not a forecast.

Base case — **built products only** (Homegroups 12-Step + Regroup Sober Living),
this doc being the SSOT for the combined figure (originating market brief
archived):

| Scenario     | Year 3 ARR (built products) |
| ------------ | --------------------------- |
| Conservative | $329,400                    |
| Moderate     | $1,636,800                  |

(12-Step Y3 $141,600 / $960,000 + Sober Living Y3 $187,800 / $676,800; orig:
docs/strategy/market-opportunity.md, archived.)

**Upside, not base case — NextStep / aftercare.** Excluded from the sum above
because it is unbuilt at the projected scale. Reconciled to the detox SSOT, its
real Year-3 figure is **DX-PROJ-Y3 = $139,250**
([`../_shared/pricing.md`](../_shared/pricing.md)) — far below the legacy
"$666K / $2.748M Aftercare" line, which described the **unbuilt ECO-7 aftercare
data pipeline**, not the shipping NextStep app. Carry it as labeled upside only.

**Valuation.** Revenue-multiple valuation is premature for a solo, bootstrapped,
pre-scale operation; the 8–15× health-tech band does not apply to a pre-revenue
solo op. If a band must be cited, use a defensible **3–5×** on _realized_ ARR — at
the corrected moderate built-product Y3 (~$1.64M) that implies roughly
**$5M–$8M**, not $46M–$87M (orig: docs/strategy/market-opportunity.md, archived).

**Per-product near-term projections are owned by the per-product docs** and read
from [`../_shared/pricing.md`](../_shared/pricing.md):

- detox-recovery 3-year p10/p50/p90 → rows
  [`DX-PROJ-Y1`..`DX-PROJ-Y3`](../_shared/pricing.md#revenue-projections), narrated
  in [`../detox-recovery/monetization.md`](../../../detox-recovery/docs/go-to-market/monetization.md#6-financial-projections-v20-3-scenario).
- regroup post-activation targets → [`../regroup/monetization.md`](../../../regroup/docs/go-to-market/monetization.md#5-projections-narrative).
- homegroups 3-year projections → [`../homegroups/monetization.md`](../../../homegroups/docs/go-to-market/monetization.md#3-year-projections-narrative).

> **No-contradiction rule.** This doc never states a per-product number that
> differs from its owning monetization doc or its `pricing.md` row. The only
> figures written here are the combined-ecosystem scenario rows above, whose sole
> owner is `market-opportunity.md` (cited inline).

---

## 5. What gates each engine (monetization blockers, cross-linked)

| Engine              | Top monetization blocker                                              | Tracked in                                                                                                                     |
| ------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| regroup tiers       | 6 Stripe Price IDs not created; tier-billing code not activated       | [`../regroup/project-management.md`](../../../regroup/docs/go-to-market/project-management.md) (RG-P0-1/RG-P0-2)               |
| homegroups B2B      | R-1/R-2 — no default Stripe price set on intergroup Tier A/B products | [`../homegroups/project-management.md`](../../../homegroups/docs/go-to-market/project-management.md) (HG-P0-1/HG-P0-2)         |
| detox digital + B2B | Lead-magnet delivery + paid-PDF fulfillment broken/unauthored         | [`../detox-recovery/project-management.md`](../../../detox-recovery/docs/go-to-market/project-management.md) (DX-PM-1/DX-PM-2) |
| referral bus        | Model undefined (D-10) + relay disabled pending partner agreement     | this doc §3; [`roadmap.md`](roadmap.md) `ECO-8`                                                                                |

---

## See also

- Why the continuum is the wedge: [`vision.md`](vision.md)
- Phased, code-verified roadmap: [`roadmap.md`](roadmap.md)
- Cross-product launch hub + decision gates: [`project-management.md`](project-management.md)
- Canonical prices + projections: [`../_shared/pricing.md`](../_shared/pricing.md)
- Decisions log (D-10): [`../_shared/decisions-log.md`](../_shared/decisions-log.md)
