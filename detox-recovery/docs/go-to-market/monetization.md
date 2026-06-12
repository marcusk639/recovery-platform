---
title: Detox-Recovery — Monetization
scope: detox-recovery
category: monetization
status: in_progress
last_verified: 2026-06-10
sources:
  - detox-recovery/docs/superpowers/plans/2026-06-07-detox-completion.md
  - detox-recovery/docs/operations/manual-tasks/2026-05-23-lemon-squeezy-migration.md
  - detox-recovery/lib/services-data.ts
  - detox-recovery/lib/products-data.ts
  - detox-recovery/CLAUDE.md
supersedes:
  - detox-recovery/docs/monetization/projections.md
  - detox-recovery/docs/monetization/model.md
---

# Detox-Recovery — Monetization

Marketed as **NextStep Recovery** (`nextsteprecovery.io`). A non-clinical peer
**navigation practice** plus digital products, B2B consulting, and a veteran
pathway. Solo founder, part-time Year 1 → full-time transition Year 2.

> **One fact, one home.** Every price, fee, and projection figure lives in
> [`../_shared/pricing.md`](../../../docs/go-to-market/_shared/pricing.md). This doc holds the
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

**Hard rule (from [`detox-recovery/CLAUDE.md`](../../CLAUDE.md)
and the Lemon Squeezy runbook):** _do not create new Stripe payment links for PDF
products._ The 5 paid PDFs migrate to Lemon Squeezy; the support-call and
donation links stay on Stripe and are untouched
(source: detox-recovery/docs/operations/manual-tasks/2026-05-23-lemon-squeezy-migration.md#context).

The Lemon Squeezy per-transaction fee is higher than Stripe's; the zero-code
delivery and tax compliance are the deliberate trade-off (exact fee figures:
detox-recovery/docs/operations/manual-tasks/2026-05-23-lemon-squeezy-migration.md#notes--gotchas).

Pricing rows in [`../_shared/pricing.md`](../../../docs/go-to-market/_shared/pricing.md) carry the
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
| **Tier 2 — 30-min support call**    | [`DX-MON-1`](../../../docs/go-to-market/_shared/pricing.md) | Stripe    | `done` — the only live paid call tier     |
| **Tier 3 — 60-min family/nav call** | [`DX-MON-2`](../../../docs/go-to-market/_shared/pricing.md) | Stripe    | `planned` — target Q3 2026 (Month 7)      |
| **Tier 4 — 2-week nav package**     | [`DX-MON-3`](../../../docs/go-to-market/_shared/pricing.md) | Stripe    | `planned` — target Q2 2027 (Year 2)       |
| Tier 5 — sliding-scale slots        | subsidized via donations            | Stripe    | `planned` — Year 2, donation/grant-funded |

**Support-call price is single-sourced.** The canonical value lives in
`detox-recovery/lib/services-data.ts` (`SERVICE_TIERS`, `id: "support-call"`,
line 29) and is rendered by the hero via that data — the prior hardcoded
`$50 beta` string was removed so there is no drift
(source: detox-recovery/docs/superpowers/plans/2026-06-07-detox-completion.md#task-1-single-source-of-truth-pricing--support-call-price-raise).
Market-comp research repriced it upward from the `$50` beta into the recommended
band; the `betaLabel` (`detox-recovery/lib/services-data.ts`, line 34) is kept so
the raise reads as introductory repricing
(source: detox-recovery/docs/superpowers/plans/2026-06-07-detox-completion.md#pricing-research-summary).
The canonical number is [`DX-MON-1`](../../../docs/go-to-market/_shared/pricing.md) — never restate it in
copy; derive it from `SERVICE_TIERS`.

### Capacity constraint (why the ladder matters)

Calls hit a hard ceiling: **5–8 paid calls/week = 22–32 calls/month** across all
call tiers combined. Beyond that requires a second practitioner (a Year 3
decision gate). The ladder raises ARPU per scarce call slot — Tier 3 becomes the
primary call revenue driver in Year 2 as Tier 2 volume is intentionally throttled
to preserve capacity for higher-value calls. The theoretical call-revenue ceiling
is ~$5,100/month even at an optimal Year 3 tier mix, regardless of price — which
is the core argument for the uncapped levers below
(orig: detox-recovery/docs/monetization/projections.md, archived — §1 Business
Model Summary, §8 Capacity and Revenue Ceiling).

---

## 3. Digital products (Lemon Squeezy)

Five paid PDFs form the passive, uncapped revenue layer:

| Product                        | Pricing row                         |
| ------------------------------ | ----------------------------------- |
| Family Survival Guide          | [`DX-MON-4`](../../../docs/go-to-market/_shared/pricing.md) |
| Appointment Prep Worksheet     | [`DX-MON-5`](../../../docs/go-to-market/_shared/pricing.md) |
| Withdrawal Safety Checklist    | [`DX-MON-6`](../../../docs/go-to-market/_shared/pricing.md) |
| Treatment Comparison Worksheet | [`DX-MON-7`](../../../docs/go-to-market/_shared/pricing.md) |
| Relapse Prevention Plan        | [`DX-MON-8`](../../../docs/go-to-market/_shared/pricing.md) |

All five are sold through **Lemon Squeezy** (not Stripe) — each `ctaHref` reads a
`NEXT_PUBLIC_LEMONSQUEEZY_*` env var in `detox-recovery/lib/products-data.ts`
(lines 27–68). They are **`blocked` / not deliverable today**: the buy-link env
vars are placeholders and the PDFs themselves are not yet generated, so the
products are gated `availability: "coming-soon"` (the field is defined at
`detox-recovery/lib/products-data.ts`, line 15). This delivery gap is a
monetization blocker tracked in [`project-management.md`](project-management.md)
(source: detox-recovery/docs/superpowers/plans/2026-06-07-detox-completion.md#current-state-verified-2026-06-07).

The market verdict on the PDF price band is "sound, keep" — these are
value-positioned against comparable digital recovery workbooks on Gumroad/Etsy
(band + comp figures: [`DX-MON-4`..`DX-MON-8`](../../../docs/go-to-market/_shared/pricing.md);
source: detox-recovery/docs/superpowers/plans/2026-06-07-detox-completion.md#pricing-research-summary).

---

## 4. B2B consulting and retainer

B2B is the **highest-leverage Year 1 revenue** despite low transaction count — in
the base model it is **51% of Year 1 revenue from just 2 engagements** (~$8,500 of
~$18,063). This is normal for early-stage service businesses and is why B2B
pipeline development is the highest-leverage early activity. It is uncapped (not
subject to the call-hour ceiling)
(orig: detox-recovery/docs/monetization/projections.md, archived — Year 1 Revenue
Breakdown).

- **Per-engagement consulting** — priced as a band, billed via **Stripe
  Invoices** (not payment links). Pricing row [`DX-MON-9`](../../../docs/go-to-market/_shared/pricing.md).
  Stays **contact-for-quote** publicly — no published price needed
  (source: detox-recovery/docs/superpowers/plans/2026-06-07-detox-completion.md#pricing-research-summary).
- **Ongoing retainer** — [`DX-MON-10`](../../../docs/go-to-market/_shared/pricing.md), a Year 3 target.

**Target B2B buyers and entry points** (the buyer ladder feeding `DX-MON-9`):

| Buyer type            | Entry point                      | Ask band      |
| --------------------- | -------------------------------- | ------------- |
| Detox center / IOP    | Patient-experience training      | lower band    |
| Hospital SUD unit     | Journey mapping + staff training | mid band      |
| Recovery startup      | Product advisory (ongoing)       | retainer band |
| Behavioral health org | Communication workshops          | mid band      |

(Exact band: [`DX-MON-9`](../../../docs/go-to-market/_shared/pricing.md); orig:
detox-recovery/docs/monetization/model.md, archived — §2.4 B2B Monetization
Detail.)

The engagement value was elevated from the prior model (a $2,500→$4,000 base-case
lift) on three differentiators: medication-navigation expertise
(buprenorphine/clonidine/gabapentin) which is rare in peer support, a veteran
background opening VAMC/military-family consulting unavailable to non-veteran
operators, and poly-substance lived experience covering the full patient
population a treatment center sees
(orig: detox-recovery/docs/monetization/projections.md, archived — Key
Differentiators Reflected in Pricing).

B2B billing is **entirely manual** — no code changes. The flow is: direct
outreach → fit call → scoped proposal → **Stripe Invoice** (Invoices, not payment
links; net-7 or due-on-receipt). No marketing spend is required until Year 2
(orig: detox-recovery/docs/monetization/model.md, archived — §1.6 B2B Consulting
— Stripe Invoice Flow, §2.4).

---

## 5. Group subscription, VA Community Care, grants

These are the Year 2–3 expansion streams modeled in the v2.0 financial model.

- **Group subscription** ("Field Notes Plus" community) — [`DX-MON-11`](../../../docs/go-to-market/_shared/pricing.md),
  Year 2 launch (Circle.so), recurring monthly. Modeled at ~40 members by end of
  Year 2, ~110 by end of Year 3.
- **VA Community Care / Medicaid peer support** — [`DX-MON-12`](../../../docs/go-to-market/_shared/pricing.md),
  ~per-session reimbursement, gated behind VA Peer Support Specialist (PSS)
  certification and Community Care provider enrollment. Prerequisite chain: enroll
  in VA healthcare → complete PSS certification (~40–80 hours + exam) → apply for
  Community Care network provider status (a **3–6 month approval**). Medicaid peer
  support is reimbursable in 43 states. Target volume ~10 sessions/month in Year 2
  rising to ~25/month in Year 3. This removes the out-of-pocket barrier for
  veterans who cannot pay out of pocket — as much mission as revenue.
- **Grants (non-dilutive)** — SAMHSA State Opioid Response (SOR) + veteran
  foundations (Bob Woodruff, Gary Sinise) + VA Center for Innovation + state
  veteran-affairs departments. **100% margin, zero cost of delivery** — the single
  highest-margin source. Strategic path: Year 1 establish LLC + track record →
  Year 1 Q4 explore fiscal sponsorship with an existing 501(c)(3) → Year 2 apply
  to 3–5 opportunities (realistic ~$25K yield) → Year 3 larger SAMHSA/foundation
  applications (realistic ~$50K yield). Requires a 501(c)(3) or fiscal sponsor.
  Grant amounts are variable and recorded in the financial model
  ([`../_shared/pricing.md`](../../../docs/go-to-market/_shared/pricing.md) projection rows), not as fixed
  SKUs in the pricing table.

The **veteran pathway** (VA billing + VSO-sponsored workshops + grants) is the
most defensible upside lever relative to time invested. Against a non-veteran
baseline it adds roughly +$750 in Year 1, +$9,600 in Year 2, and +$31,500 in
Year 3 — a cumulative 3-year delta of about **+$41,850** (base case
~$171,388 → ~$213,238).

(Stream detail, prerequisites, funder list, and the veteran-pathway delta orig:
detox-recovery/docs/monetization/projections.md, archived — §7 Veteran Pathway
Financial Model: Stream V1 VA Community Care, Stream V3 Grant Funding, Veteran
Pathway Three-Year Impact; §13 Key Financial Milestones & Decision Gates.)

---

## 6. Financial projections (v2.0, 3-scenario)

The v2.0 model runs three scenarios (P10/P50/P90) over a 36-month
monthly/quarterly horizon. The canonical headline revenue figures are
single-sourced in [`../_shared/pricing.md`](../../../docs/go-to-market/_shared/pricing.md) under the
`DX-PROJ-*` projection rows — reference them by id, never restate the numbers
here. The three-scenario shape:

| Horizon        | Conservative (P10) | Base (P50)   | Optimistic (P90) |
| -------------- | ------------------ | ------------ | ---------------- |
| Year 1 revenue | `DX-PROJ-Y1` (P10) | `DX-PROJ-Y1` | `DX-PROJ-Y1`     |
| Year 2 revenue | `DX-PROJ-Y2` (P10) | `DX-PROJ-Y2` | `DX-PROJ-Y2`     |
| Year 3 revenue | `DX-PROJ-Y3` (P10) | `DX-PROJ-Y3` | `DX-PROJ-Y3`     |

(All values: [`../_shared/pricing.md`](../../../docs/go-to-market/_shared/pricing.md) `DX-PROJ-Y1`..`Y3`
rows. The cumulative 3-year base case is ~$213,238; the optimistic ceiling is
~$347,000 with all pathways open.)

The scenario levers that separate the three cases: speed of critical-fix
completion (Month 4–5 vs Month 2 vs Month 1), B2B first-engagement timing and
value, Tier 3/Tier 4 launch timing, VA PSS certification timing, grant funding
($0 / ~$25K / ~$75K in Year 2), and group-subscription scale.

**Structural insights from the model:**

1. **B2B dominates Year 1** (~51% of revenue from 2 transactions) — pipeline
   development is the highest-leverage early activity.
2. **Calls are capped** at a fixed monthly ceiling (~$5,100/month even at optimal
   Year 3 mix) regardless of price; B2B, digital, group subscription, and grants
   are the uncapped growth levers.
3. **Profitable from Month 3–4**, no external capital required in any scenario;
   never cash-negative even in the conservative case (a ~$2,000 personal setup
   buffer covers Months 1–3).
4. **Tier 3 becomes the primary call-revenue driver in Year 2** as Tier 2 volume
   is throttled to preserve capacity; digital products and group subscription
   carry the Year 3 upside.

(Three-scenario framework, summary table, scenario levers, and structural
insights orig: detox-recovery/docs/monetization/projections.md, archived — §6
Three-Scenario Framework, §3–5 base-case projections, §8 Unit Economics /
Capacity and Revenue Ceiling, §9 Cash Flow Summary.)

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

(Revenue architecture orig: detox-recovery/docs/monetization/model.md, archived —
§2.1 Revenue Architecture.)

The lead-magnet email funnel is what feeds this ladder — it is currently
**broken** (capture works, delivery automations are not wired), which is why
lead-magnet content + MailerLite automation is the top funnel-activation blocker
in [`project-management.md`](project-management.md).
