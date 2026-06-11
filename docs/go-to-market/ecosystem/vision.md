---
title: Ecosystem — Vision
scope: ecosystem
category: vision
status: in_progress
last_verified: 2026-06-10
sources:
  - docs/ecosystem/product-map.md
  - docs/strategy/market-opportunity.md
  - docs/ecosystem/integration.md
  - recovery-api/src/config/apps.ts
supersedes:
  - docs/ecosystem/vision.md
---

# Ecosystem — Vision

> The platform thesis: three independently-viable products that, connected, become
> the first digital system spanning the full **ASAM Continuum of Care**. This file
> is authored fresh (the legacy `docs/ecosystem/vision.md` was an empty stub and
> becomes a pointer to this file in Phase 6). It holds no price values — every
> number lives in [`../_shared/pricing.md`](../_shared/pricing.md) and is referenced
> by `sku`/`id`.

---

## 1. The thesis in one sentence

A person in recovery moves through a clinical continuum — **detox → residential →
PHP/IOP → outpatient → sober living → community / 12-step** — and today **no
software follows them across the level-of-care transitions** that most determine
whether they stay sober. The recovery platform is being built to be that
connective tissue.

The continuum and where each product sits
(orig: docs/strategy/market-opportunity.md, archived):

```
Detox → Residential → PHP → IOP → Outpatient → [ Regroup ] → [ Homegroups ]
   ↑                                              sober          12-step
[ NextStep ]                                      living         community
withdrawal                          [ recovery-api referral bus + future
navigation                            aftercare pipeline bridge the gaps ]
```

| Continuum stage                  | Product           | Marketed name | What it owns                                                             |
| -------------------------------- | ----------------- | ------------- | ------------------------------------------------------------------------ |
| Pre-treatment / acute withdrawal | `detox-recovery/` | NextStep      | Withdrawal navigation, family education, "what do I do next" calls       |
| Sober living (post-residential)  | `regroup/`        | Regroup       | House operations: residents, rent, compliance, Oxford governance         |
| Community / lifelong maintenance | `homegroups/`     | Homegroups    | 12-step group operations: meetings, treasury, sponsorship, anonymity     |
| Cross-stage identity + outcomes  | `recovery-api/`   | (service)     | Referral bus + canonical app-id registry; future aftercare data pipeline |

(source: docs/ecosystem/product-map.md; recovery-api/src/config/apps.ts)

---

## 2. The wedge — "no competitor connects all three levels of care"

Incumbent treatment-center software (Kipu Health, Sunwave, LightningStep, Opus
EHR) **treats the patient journey as ending at discharge**. Sober-living software
and 12-step apps are entirely separate industries with no integration between
them (orig: docs/strategy/market-opportunity.md, archived). The gap
between "discharged" and "in the community working a program" is exactly where
relapse happens:

- Relapse rates reach **85% in the first year post-discharge**, yet **80% of
  clinicians never measure post-discharge outcomes**
  (orig: docs/strategy/market-opportunity.md, archived).
- Continuity of care — _did the client land in a safe house, and do they actually
  attend outside meetings?_ — is the single biggest driver of long-term outcomes,
  and treatment centers have near-zero visibility into either
  (source: docs/ecosystem/product-map.md#1-why-a-treatment-center-should-care).

Two best-of-breed products already own the two halves of the post-discharge world:
**Regroup** is the system of record for the sober living house (where the client
sleeps, pays rent, tests clean, logs activity); **Homegroups** is the system of
record for the 12-step group (where the client works a program, has a sponsor,
builds a sober network) (source: docs/ecosystem/product-map.md#2-the-integrated-offering).
Connected through recovery-api, they close the loop that matters most to a
treatment center.

**The wedge is the connection, not any single app.** Each product is defensible
alone (each accumulates a high-switching-cost ledger — payment/activity history
for Regroup, treasury/governance history for Homegroups). Together they are the
only path from a treatment center's discharge event to a verifiable, longitudinal
view of an alumnus's recovery.

---

## 3. Post-discharge outcome visibility (the treatment-center buyer)

The treatment center is the highest-value buyer because it has the clearest pain
and the deepest pockets, and because regulation is moving its way: value-based
care contracts increasingly require outcome documentation, CMS mandates FHIR R4
interoperability by mid-2026, and ASAM CONTINUUM software is endorsed/required by
30+ states (orig: docs/strategy/market-opportunity.md, archived).

What the center buys is **a single "continuing care" view** stitched from the two
systems of record (source: docs/ecosystem/product-map.md#21-the-three-surfaces-the-center-buys):

| Surface                         | Sourced from                                                             | Status (code-verified)                                                                             |
| ------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Sober-living network visibility | Regroup super-admin / cross-house reporting                              | `planned` — enterprise/multi-house tier on roadmap                                                 |
| Alumni homegroup engagement     | Homegroups facility tier (V4.4) — privacy-preserving, never chat content | `planned` — V4.4 mobile UI flag-hidden ([`roadmap.md`](roadmap.md) `ECO-7`)                        |
| Single per-alumnus timeline     | Thin bridge over both, fed by `getMeetingAttendance` + Regroup activity  | `not_started` — facility dashboard + cross-project bridge ([`roadmap.md`](roadmap.md) ECO-5/ECO-6) |

> **Honesty guard.** The facility dashboard and the aftercare data pipeline are
> **not built**. The `getMeetingAttendance` endpoint exists inside Homegroups
> (`homegroups/functions/src/http/getMeetingAttendance.ts`), but its
> **cross-project callability from Regroup is unverified**, and the per-alumnus
> timeline that the center actually buys does not yet exist. This vision describes
> the destination; [`roadmap.md`](roadmap.md) and
> [`project-management.md`](project-management.md) hold the verified build state.

---

## 4. Why this is monetizable, not just visionary

The platform does not depend on the aftercare integration to earn — each product
has its own live or near-live revenue model, and the ecosystem layer is upside on
top:

- **Regroup** — six-tier operator subscriptions + a **2% rent platform fee** that
  is already live in code ([`../_shared/pricing.md`](../_shared/pricing.md) row
  `RG-MON-7`).
- **Homegroups** — group-admin subscription (consumer wedge) + intergroup /
  treatment-center B2B tiers + a **5% donation platform fee**
  ([`../_shared/pricing.md`](../_shared/pricing.md) rows `HG-MON-1`, `HG-MON-5`).
- **NextStep** — withdrawal-navigation calls + digital products + B2B consulting
  ([`../_shared/pricing.md`](../_shared/pricing.md) rows `DX-MON-1`, `DX-MON-9`).
- **recovery-api** — the referral bus is the future ecosystem monetization layer.
  Its pricing model is **currently undefined** and is opened as decision gate
  **D-10** in [`monetization.md`](monetization.md).

The market context that makes this worth building: U.S. substance-abuse treatment
is a **$143.62B (2024)** market, ~17,353 licensed SUD facilities and ~17,900
recovery residences serve ~275,000 people at any time, and ~4,324 Oxford Houses
hold 35,796 beds (orig: docs/strategy/market-opportunity.md, archived). The
combined-ecosystem 3-year revenue scenarios live in
[`monetization.md`](monetization.md) (read from the projections rows in
[`../_shared/pricing.md`](../_shared/pricing.md)) — never restated here.

---

## 5. Sequencing logic (vision → execution)

The continuum is the _destination_; the platform is sequenced to **earn at each
step before building the next bridge**:

1. **Per-product go-live + monetization** — each app reaches live + paid on its
   own ([`roadmap.md`](roadmap.md) ECO-1..ECO-4). This is the revenue base.
2. **Cross-project bridge verification** — prove Regroup can call Homegroups'
   `getMeetingAttendance` across Firebase projects (ECO-5). The first real
   ecosystem connection.
3. **Treatment-center facility dashboard** — the B2B unlock that turns the
   continuum thesis into a sellable SKU (ECO-6).
4. **Aftercare data pipeline** — the longitudinal outcome record treatment
   centers pay most for (ECO-7); a new product, not yet built.
5. **Referral-bus monetization** — turn the recovery-api referral flow into
   revenue once D-10 resolves (ECO-8).

See [`roadmap.md`](roadmap.md) for the full phased, dependency-ordered plan and
[`project-management.md`](project-management.md) for the cross-product launch hub.

---

## See also

- Cross-platform monetization model + referral D-10: [`monetization.md`](monetization.md)
- Ecosystem roadmap (phased, code-verified): [`roadmap.md`](roadmap.md)
- Cross-product launch hub: [`project-management.md`](project-management.md)
- Canonical prices: [`../_shared/pricing.md`](../_shared/pricing.md)
- Integration model / app-id registry: [`../../ecosystem/integration.md`](../../ecosystem/integration.md), `recovery-api/src/config/apps.ts`
