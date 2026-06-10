---
title: Detox-Recovery — Monetization
scope: detox-recovery
category: monetization
status: in_progress
last_verified: 2026-06-10
sources:
  - detox-recovery/docs/monetization/projections.md
  - detox-recovery/docs/monetization/model.md
  - detox-recovery/docs/product/roadmap.md
  - detox-recovery/docs/superpowers/plans/2026-06-07-detox-completion.md
  - detox-recovery/docs/operations/manual-tasks/2026-05-23-lemon-squeezy-migration.md
  - detox-recovery/CLAUDE.md
supersedes: []
---

# Detox-Recovery — Monetization

Marketed as **NextStep Recovery** (`nextsteprecovery.io`). A non-clinical peer
**navigation practice** plus digital products, B2B consulting, and a veteran
pathway. Solo founder, part-time Year 1 → full-time transition Year 2.

> **One fact, one home.** Every price, fee, and projection figure lives in
> [`../_shared/pricing.md`](../_shared/pricing.md). This doc holds the
> narrative and logic only; it references price rows by their stable `DX-MON-n`
> SKU. No raw price number appears here.

> **What is live today:** only **Tier 2 (30-min support call)** and
> **donations** are monetized and end-to-end deliverable. Everything else is
> `planned` or `blocked` on the launch work tracked in
> [`project-management.md`](project-management.md). Do not read this doc as a
> claim that the full ladder is earning revenue.

---

## 1. Processor split (read this first)

NextStep Recovery uses **two payment processors**, deliberately split by product
type. This split is the single most load-bearing fact for any agent generating
checkout code or env config.

| Processor         | Handles                                                        | Why                                                                                                                                                                     |
| ----------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stripe**        | Support call (Tier 2), Tier 3/4 calls, donations, B2B invoices | Stripe Payment Links for service bookings; Stripe Invoices for B2B. Stripe is fine for services — no file to deliver.                                                   |
| **Lemon Squeezy** | The 5 paid digital PDFs                                        | Lemon Squeezy is **merchant of record** — it handles checkout, EU VAT / US sales tax, **and file delivery + confirmation email** in one step. Stripe delivers no files. |

**Hard rule (from [`detox-recovery/CLAUDE.md`](../../../detox-recovery/CLAUDE.md)
and the Lemon Squeezy runbook):** _do not create new Stripe payment links for PDF
products._ The 5 paid PDFs migrate to Lemon Squeezy; the support-call and
donation links stay on Stripe and are untouched
(source: detox-recovery/docs/operations/manual-tasks/2026-05-23-lemon-squeezy-migration.md#context).

The Lemon Squeezy per-transaction fee is higher than Stripe's; the zero-code
delivery and tax compliance are the deliberate trade-off (exact fee figures:
detox-recovery/docs/operations/manual-tasks/2026-05-23-lemon-squeezy-migration.md#notes--gotchas).

Pricing rows in [`../_shared/pricing.md`](../_shared/pricing.md) carry the
processor in their `status`/`source` cells: Stripe SKUs name a
`NEXT_PUBLIC_STRIPE_*` env var; Lemon Squeezy SKUs name a
`NEXT_PUBLIC_LEMONSQUEEZY_*` env var and are flagged `planned` (delivery is
blocked on PDF authorship).

---

## 2. The service ladder

A free top-of-funnel offer steps up into three paid call tiers. Calls are
capacity-constrained; the uncapped levers (B2B, digital, group, grants) sit
alongside.

| Rung                                | Pricing row                         | Processor | Status today                              |
| ----------------------------------- | ----------------------------------- | --------- | ----------------------------------------- |
| Free Fit Check (lead gen)           | n/a (free)                          | —         | `done` — live, free lead-gen              |
| **Tier 2 — 30-min support call**    | [`DX-MON-1`](../_shared/pricing.md) | Stripe    | `done` — the only live paid call tier     |
| **Tier 3 — 60-min family/nav call** | [`DX-MON-2`](../_shared/pricing.md) | Stripe    | `planned` — target Q3 2026 (Month 7)      |
| **Tier 4 — 2-week nav package**     | [`DX-MON-3`](../_shared/pricing.md) | Stripe    | `planned` — target Q2 2027 (Year 2)       |
| Tier 5 — sliding-scale slots        | subsidized via donations            | Stripe    | `planned` — Year 2, donation/grant-funded |

**Support-call price is single-sourced.** The canonical value lives in
`lib/services-data.ts` (`SERVICE_TIERS`, `id: "support-call"`) and is rendered
by the hero via that data — the prior hardcoded `$50 beta` string was removed so
there is no drift (source: detox-recovery/docs/superpowers/plans/2026-06-07-detox-completion.md#task-1-single-source-of-truth-pricing--support-call-price-raise).
Market-comp research repriced it upward from the `$50` beta into the recommended
band; the `betaLabel` is kept so the raise reads as introductory repricing
(source: detox-recovery/docs/superpowers/plans/2026-06-07-detox-completion.md#pricing-research-summary).
The canonical number is [`DX-MON-1`](../_shared/pricing.md) — never restate it in
copy; derive it from `SERVICE_TIERS`.

### Capacity constraint (why the ladder matters)

Calls hit a hard ceiling: **5–8 paid calls/week = 22–32 calls/month** across all
call tiers combined. Beyond that requires a second practitioner (a Year 3
decision gate)
(source: detox-recovery/docs/monetization/projections.md#1-business-model-summary).
The ladder raises ARPU per scarce call slot — Tier 3 becomes the primary call
revenue driver in Year 2 as Tier 2 volume is intentionally throttled to preserve
capacity for higher-value calls
(source: detox-recovery/docs/monetization/projections.md#4-year-2--quarterly-projections-base-case).

---

## 3. Digital products (Lemon Squeezy)

Five paid PDFs form the passive, uncapped revenue layer:

| Product                        | Pricing row                         |
| ------------------------------ | ----------------------------------- |
| Family Survival Guide          | [`DX-MON-4`](../_shared/pricing.md) |
| Appointment Prep Worksheet     | [`DX-MON-5`](../_shared/pricing.md) |
| Withdrawal Safety Checklist    | [`DX-MON-6`](../_shared/pricing.md) |
| Treatment Comparison Worksheet | [`DX-MON-7`](../_shared/pricing.md) |
| Relapse Prevention Plan        | [`DX-MON-8`](../_shared/pricing.md) |

All five are sold through **Lemon Squeezy** (not Stripe). They are
**`blocked` / not deliverable today**: the buy-link env vars are placeholders and
the PDFs themselves are not yet generated, so the products are gated
`availability: "coming-soon"` in `lib/products-data.ts`. This delivery gap is a
monetization blocker tracked in [`project-management.md`](project-management.md)
(source: detox-recovery/docs/superpowers/plans/2026-06-07-detox-completion.md#current-state-verified-2026-06-07).

The market verdict on the PDF price band is "sound, keep" — these are
value-positioned against comparable digital recovery workbooks on Gumroad/Etsy
(band + comp figures: [`DX-MON-4`..`DX-MON-8`](../_shared/pricing.md);
source: detox-recovery/docs/superpowers/plans/2026-06-07-detox-completion.md#pricing-research-summary).

---

## 4. B2B consulting and retainer

B2B is the **highest-leverage Year 1 revenue** despite low transaction count — in
the base model it is 51% of Year 1 revenue from just 2 engagements
(source: detox-recovery/docs/monetization/projections.md#year-1-revenue-breakdown).
It is uncapped (not subject to the call-hour ceiling).

- **Per-engagement consulting** — priced as a band, billed via **Stripe
  Invoices** (not payment links). Pricing row [`DX-MON-9`](../_shared/pricing.md).
  Stays **contact-for-quote** publicly — no published price needed
  (source: detox-recovery/docs/superpowers/plans/2026-06-07-detox-completion.md#pricing-research-summary).
- **Ongoing retainer** — [`DX-MON-10`](../_shared/pricing.md), a Year 3 target.

The engagement value was elevated from the prior model on three differentiators:
medication-navigation expertise (buprenorphine/clonidine/gabapentin), a veteran
background opening VAMC/military-family consulting, and poly-substance lived
experience covering a full patient population
(source: detox-recovery/docs/monetization/projections.md#key-differentiators-reflected-in-pricing).
B2B billing is **entirely manual** — no code changes; outreach → fit call →
scoped proposal → Stripe invoice
(source: detox-recovery/docs/monetization/model.md#16-b2b-consulting--stripe-invoice-flow).

---

## 5. Group subscription, VA Community Care, grants

These are the Year 2–3 expansion streams modeled in the v2.0 financial model.

- **Group subscription** ("Field Notes Plus" community) — [`DX-MON-11`](../_shared/pricing.md),
  Year 2 launch (Circle.so), recurring monthly
  (source: detox-recovery/docs/monetization/projections.md#13-key-financial-milestones--decision-gates).
- **VA Community Care / Medicaid peer support** — [`DX-MON-12`](../_shared/pricing.md),
  ~per-session reimbursement, gated behind VA Peer Support Specialist (PSS)
  certification and Community Care provider enrollment (a 3–6 month approval).
  This removes the out-of-pocket barrier for veterans — as much mission as
  revenue
  (source: detox-recovery/docs/monetization/projections.md#stream-v1-va-community-care-billing).
- **Grants (non-dilutive)** — SAMHSA State Opioid Response + veteran foundations
  (Bob Woodruff, Gary Sinise). 100% margin, zero cost of delivery; the
  single highest-margin source. Modeled as Year 2 → Year 3 step-up upside
  (amounts: [`../_shared/pricing.md`](../_shared/pricing.md) projection rows),
  requires a 501(c)(3) or fiscal sponsor
  (source: detox-recovery/docs/monetization/projections.md#stream-v3-grant-funding-non-dilutive-capital).
  Grant amounts are variable and recorded in the financial model, not as fixed
  SKUs in the pricing table.

The **veteran pathway** (VA billing + VSO workshops + grants) is the most
defensible upside lever relative to time invested — it adds a material
cumulative 3-year delta vs the non-veteran baseline (figure:
detox-recovery/docs/monetization/projections.md#veteran-pathway-three-year-impact).

---

## 6. Financial projections (v2.0, 3-scenario)

Full month-by-month and quarterly tables live in the SSOT
(`detox-recovery/docs/monetization/projections.md`); the canonical headline
figures are mirrored once in [`../_shared/pricing.md`](../_shared/pricing.md)
under the projection rows. Summary of the three-scenario framework:

| Horizon        | Conservative (P10) | Base (P50)   | Optimistic (P90) |
| -------------- | ------------------ | ------------ | ---------------- |
| Year 1 revenue | see `DX-PROJ-Y1`   | `DX-PROJ-Y1` | `DX-PROJ-Y1`     |
| Year 2 revenue | see `DX-PROJ-Y2`   | `DX-PROJ-Y2` | `DX-PROJ-Y2`     |
| Year 3 revenue | see `DX-PROJ-Y3`   | `DX-PROJ-Y3` | `DX-PROJ-Y3`     |

(Exact values: [`../_shared/pricing.md`](../_shared/pricing.md) projection rows;
derived from
detox-recovery/docs/monetization/projections.md#three-year-summary-table.)

**Structural insights from the model:**

1. **B2B dominates Year 1** (~51% of revenue from 2 transactions) — pipeline
   development is the highest-leverage early activity
   (source: detox-recovery/docs/monetization/projections.md#year-1-revenue-breakdown).
2. **Calls are capped** at a fixed monthly ceiling regardless of price; B2B,
   digital, group subscription, and grants are the uncapped growth levers
   (source: detox-recovery/docs/monetization/projections.md#capacity-and-revenue-ceiling).
3. **Profitable from Month 3–4**, no external capital required in any scenario;
   never cash-negative even in the conservative case
   (source: detox-recovery/docs/monetization/projections.md#9-cash-flow-summary).
4. **Tier 3 becomes the primary call-revenue driver in Year 2**; digital and
   group subscription carry Year 3 upside
   (source: detox-recovery/docs/monetization/projections.md#5-year-3--quarterly-projections-base-case).

---

## 7. Revenue architecture (flywheel)

```
Free Fit Check (lead gen)
        ↓
Tier 2 — 30-min support call   ← primary revenue today (Stripe)
        ↓
Tier 3 — 60-min family call    ← Q3 2026 (Stripe)
        ↓
Tier 4 — 2-week nav package     ← Q2 2027 (Stripe)
        ↑
Digital PDFs                    ← passive, compounding (Lemon Squeezy)
        ↑
B2B consulting / retainer       ← high-value, low-volume (Stripe Invoices)
        ↑
Group subscription · VA Community Care · Grants · Donations
```

(Adapted from detox-recovery/docs/monetization/model.md#21-revenue-architecture.)

The lead-magnet email funnel is what feeds this ladder — it is currently
**broken** (capture works, delivery automations are not wired), which is why
lead-magnet content + MailerLite automation is the top funnel-activation blocker
in [`project-management.md`](project-management.md).
