# Regroup Monetization & Pricing — Justification, Gaps, and Revised Model

**Date:** 2026-06-22
**Method:** Hybrid — internal product/pricing facts (codebase + launch-readiness docs) grounded against a scoped 2026 web pass on competitor pricing, market sizing, and the property-management payments analog.
**Status:** Decision-support. Prices below reference the live `SUBSCRIPTION_TIERS` in `functions/src/config.ts`.

---

## 1. Current Regroup Monetization (as built)

Two revenue lines, both implemented:

**A. Subscription — 6 flat monthly tiers** (`config.ts`, gated by `TIER_BILLING_ENABLED` / `isTierBillingEnabled()`):

| Segment     | Tier         | Price   | Caps                          |
| ----------- | ------------ | ------- | ----------------------------- |
| Traditional | Starter      | $69/mo  | ≤10 residents, 1 property     |
| Traditional | Professional | $129/mo | ≤20 residents, 3 properties   |
| Traditional | Enterprise   | $249/mo | unlimited                     |
| Oxford      | Standard     | $49/mo  | ≤15 residents, 1 property     |
| Oxford      | Plus         | $89/mo  | ≤25 residents, 1 property     |
| Oxford      | Network      | $299/mo | unlimited (regional chapters) |

**B. Rent collection — 2% platform fee** via Stripe Connect (`payments.ts:151` `Math.round(amount * 0.02)` as `application_fee_amount`; `scheduledRentCollection.ts` mirrors it). Bundle coupons exist (`api/stripe.ts`: 3+ houses → `bundle3`, 5+ → `bundle5`).

**Legacy:** per-house + per-guest model (`STRIPE_GUEST_PRICE_ID`) retained only for the ~5 existing houses.

---

## 2. Competitive Landscape (2026, verified this pass)

| Vendor                                 | Pricing model                              | Entry / published price                                                                                                          | Rent-payment fee                                                                                                             | Pricing transparency                             |
| -------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **Sobriety Hub**                       | **Per-user/seat**                          | $75/mo full user + $25/mo client manager; **$250 onboarding**. Markets a "$65/mo starting, no per-bed/house/resident fees" line. | Built-in "batch rent collection" + reminders; processor fees ~3.9% CC / 1.2% ACH (per launch-doc, not re-verified this pass) | **High** — only major vendor with public pricing |
| **One Step Software**                  | Custom/quote (drug-court focus)            | Quote-only; comparison blogs estimate **~$129–199/mo per facility** _(unverified)_                                               | Not published                                                                                                                | Low (quote-only)                                 |
| **Behave Health / "Sober Living App"** | Custom/quote; **NARR-affiliate discounts** | Quote-only; ~$199–399/mo per facility range surfaced _(unverified)_                                                              | Not published                                                                                                                | Low (quote-only)                                 |
| **Anchor Living**                      | Not found this pass                        | —                                                                                                                                | —                                                                                                                            | —                                                |

**Dominant model in the niche:** either **per-user/seat** (Sobriety Hub) or **quote-only per-facility** (One Step, Behave Health). **No competitor publishes a per-house _capacity-tiered_ flat fee** — Regroup's structure is differentiated.

**Anchor positions:**

- **Low anchor:** Sobriety Hub effective ~$65–100/mo for a single small house (1 full user + 1 manager = $100/mo; or the $65 base line).
- **High anchor:** quote-only enterprise (One Step / Behave Health) into the multi-hundred-$/mo range with onboarding fees.

> Sources: [Sobriety Hub pricing](https://www.sobrietyhub.com/pricing), [Sobriety Hub on Capterra](https://www.capterra.com/p/10002753/Sobriety-Hub/), [One Step on Capterra](https://www.capterra.com/p/195924/One-Step-Software/), [Behave Health pricing](https://behavehealth.com/pricing), [Sober Living Software Comparison 2026](https://soberlivingapp.com/blog/sober-living-software-comparison).

---

## 3. Market & Cost-Sensitivity

- **Oxford Houses:** ~**3,300–3,500** self-run houses, **24,000+** residents at any time → ~7–8 residents/house. Peer-run, **democratically self-governed, self-funded** — extremely cost-sensitive; no central IT budget, every dollar comes from resident EES contributions. ([oxfordhouse.org](https://www.oxfordhouse.org/), [Wikipedia: Oxford House](https://en.wikipedia.org/wiki/Oxford_House))
- **NARR-certified residences:** **2,500+** certified, **25,000+** persons, across **30** state affiliates / 36 states using the standard. Total US sober-living universe is far larger than the certified subset (commonly cited 17k–19k homes; _not re-verified this pass_). ([NARR](https://narronline.org/), [MHACBO-NARR manual](<https://mhacbo.org/media/MHACBO.NARR.Accreditation%20(1).pdf>))
- **Implication:** the Oxford segment is large and defensible but the _least_ able to pay a per-user SaaS fee — which is exactly where Regroup's governance features (EES, voting, officer terms) are the differentiator.

---

## 4. The Property-Management Payments Benchmark (key to the 2% question)

The right analog for rent collection is property-management software, where this is a mature, competitive market:

- **ACH rent is typically FREE or a flat ~$1–2 fee** to the tenant (Buildium, RentRedi let managers set/absorb a small flat ACH fee).
- **Card payments are ~3.25%** (DoorLoop: credit/debit/Apple/Google Pay = **3.25%**; ACH varies by tier), and the **prevailing model passes the card cost to the tenant as a disclosed convenience fee** — the platform does not skim a percentage of the rent itself.
- 2026 IRS 1099-K threshold drops to $600, raising visibility of payment flows.

> Sources: [DoorLoop tenant payment fees](https://support.doorloop.com/en/articles/14756253-tenant-payment-fees-ach-and-credit-card-rates), [RentRedi: ACH vs CC 2026](https://rentredi.com/blog/ach-vs-credit-card-vs-cash-which-rent-payment-methods-should-landlords-accept-in-2026/), [Buildium pricing](https://www.buildium.com/pricing/).

**Verdict on Regroup's 2% flat fee on all rent:**

- On **card** rent it's reasonable-to-thin (Stripe's own card cost is ~2.9%+30¢, so 2% on top is a real markup but defensible as "we handle reconciliation").
- On **ACH/bank** rent it is **HIGH and out of line with the norm** (the market charges ~$0–2 flat, not 2%). At $600/mo rent × 8 residents = $4,800/house/mo, 2% = **$96/mo/house in fees on bank transfers** the analog market would charge ~$0–16 for. This is the single biggest justification gap and a churn/optics risk with cost-sensitive operators.

---

## 5. Where the Pricing Is Justified vs. Not

### Justified ✅

- **Subscription tier _prices_ vs competitors:** Oxford Standard $49 undercuts Sobriety Hub's ~$75–100 single-house cost; Traditional Professional $129 is competitive with quote-only rivals. The _numbers_ are market-defensible.
- **Capacity-tiered model is a genuine differentiator** — operators know their cost up front (vs. per-seat creep or "call us" quotes), and it scales with house size, the thing operators actually grow.
- **Oxford governance feature set** (EES auto-calculation, democratic voting, officer-term tracking, chapter/Network tier) is **whitespace no competitor occupies** — it justifies a _premium_ in that segment, not a discount.

### NOT yet justified ❌ (the gaps)

1. **2% flat rent fee can't be justified on ACH** against the property-mgmt norm (~free/flat). This is the biggest exposure.
2. **No published value metric ties price to outcomes.** Tiers gate on _resident/property caps_ (a cost proxy), not on the features that deliver ROI (rent automation, compliance export, drug-test tracking). Operators can't see _why_ Professional > Starter beyond "more beds."
3. **Onboarding-fee gap, but framed as a strength:** competitors charge $250 onboarding; Regroup charges $0. That's a positioning win — but it also means **no funded onboarding**, which is the #1 driver of activation/retention for non-technical operators.
4. **No annual option.** SMB SaaS norm is ~2 months free for annual (≈17% off) to cut churn and pull cash forward; Regroup is monthly-only.
5. **Oxford Network ($299 unlimited) is unanchored** — no regional chapter has validated it; pricing a network tier before a network exists is speculative (launch-readiness already flags: don't launch Network until a chapter signs).
6. **Bundle coupons (`bundle3`/`bundle5`) exist in code but criteria/value aren't documented or marketed** — latent discount logic doing nothing.
7. **No free trial in the tier flow** (Phase plan calls for a 30-day Oxford trial; not wired). Cost-sensitive, skeptical buyers need to try before paying.

---

## 6. Recommended Revised Model

**Principle:** keep the differentiated capacity-tier structure, fix the rent fee to match the market, and attach a _value metric_ + onboarding + annual option so each tier is self-justifying.

### 6a. Rent collection — switch from flat 2% to method-aware

- **ACH/bank: flat $2/transaction** (or **0.5%, capped at $3**) — matches property-mgmt norm, removes the biggest objection. Pass-through, disclosed to resident.
- **Card: pass Stripe's cost to the payer as a convenience fee + a thin 0.5–1% platform fee** (not 2% absorbed). Operators stop subsidizing card fees out of rent.
- Net effect: rent processing becomes a **defensible, market-aligned** line instead of a hidden 2% skim. Re-frame the platform's rent revenue as _volume × small flat/percentage_, which still reaches the launch-doc's "$150/house/mo at scale" only on card-heavy houses — set expectations accordingly.

### 6b. Subscription — keep prices, add a value ladder + annual

- Keep the 6 tier prices. **Re-gate tiers on capabilities, not just bed caps**, so upgrades buy outcomes:
  - **Starter/Standard:** core (beds, activities, chores, meetings, drug tests, chat).
  - **Professional/Plus:** + automated rent collection & reminders, multi-property, **compliance/drug-court export**, phase analytics.
  - **Enterprise/Network:** + chapter/multi-house rollups, API, priority support, white-label.
- **Add annual billing** at ~2 months free (≈17%). Wire the existing trial (30-day) into the tier checkout.
- **Activate the bundle discount:** document `bundle3`/`bundle5` as published multi-house pricing (e.g., 3+ houses 10% off, 5+ 15%) — turns dormant code into a sales lever for the multi-property operators who are the best LTV.

### 6c. Feature set that _earns_ the premium tiers

The fastest way to justify $129/$249 and the Oxford Network tier is to ship the two features that map to operator ROI and are already half-supported by captured data:

1. **Compliance/drug-court report export** (RG-SPEC-09) — turns existing activity + drug-test data into a court-acceptable artifact. This is the One Step differentiator; owning it justifies Professional+ and opens the court-referral channel.
2. **Rent-collection ROI dashboard** — "you collected $X, on-time rate Y%, saved Z hours." Makes the subscription _visibly_ pay for itself, the strongest retention lever for cost-sensitive operators.
3. **Oxford EES/governance automation as the Network tier's anchor** — chapter-level EES rollups + officer/term dashboards across houses. Don't launch Network until one chapter signs (validate the price).

---

## 7. Bottom Line

Regroup's **subscription prices are defensible and its capacity-tier + Oxford-governance positioning is genuinely differentiated** — the tier _numbers_ don't need to change. The justification gaps are: (1) the **2% flat rent fee is out of step with the property-management norm on ACH** and is the top fix; (2) tiers gate on bed caps rather than **value/outcomes**, so upgrades aren't self-justifying; (3) missing **annual billing, wired trial, published bundle discounts, and funded onboarding**. Closing those — plus shipping **compliance export** and a **rent ROI dashboard** — converts the current "reasonable prices, thin justification" position into a defensible model where each tier and the payments line clearly earn their price.

### Caveats / confidence

- Sobriety Hub seat pricing + onboarding: **verified** (vendor site + Capterra). The "$65 base" line and the ~3.9%/1.2% processing rates are vendor/launch-doc claims, **not independently re-verified**.
- One Step / Behave Health per-facility ranges ($129–199 / $199–399): **unverified** (quote-only; from comparison blogs) — treat as directional.
- Total US sober-living home count beyond NARR's 2,500 certified: **not re-verified this pass.**
- Anchor Living pricing: **not found.**
- Property-mgmt ACH/card benchmarks and Oxford/NARR counts: **verified** against the cited 2026 sources.
