---
title: Ecosystem — Roadmap
scope: ecosystem
category: roadmap
status: in_progress
last_verified: 2026-06-10
sources:
  - docs/launch-readiness/cross-product-launch-roadmap.md
  - docs/launch-readiness/03-launch-roadmap.md
  - docs/launch-readiness/homegroups-launch-readiness.md
  - docs/launch-readiness/regroup-launch-readiness.md
  - docs/ecosystem/product-map.md
  - docs/strategy/roadmap.md
  - regroup/docs/go-to-market/roadmap.md
  - homegroups/docs/go-to-market/roadmap.md
  - detox-recovery/docs/go-to-market/roadmap.md
  - recovery-api/src/config/apps.ts
supersedes:
  - docs/strategy/roadmap.md
---

# Ecosystem — Roadmap

> The market-feasible, monetizable ecosystem roadmap, using the canonical Roadmap
> column set with `ECO-` IDs. It **supersedes the implementation-status claims in
> `docs/strategy/roadmap.md`** (strategy sound, impl-status stale — code overrides).
> Every stale "X missing" claim is **re-baselined against the code-verified
> launch-readiness docs** in §2 before it appears in the plan; no code-contradicted
> "missing" claim survives below. No price values appear here — revenue impact
> references a [`../_shared/pricing.md`](../_shared/pricing.md) row by `sku`.

Status vocabulary: `done | in_progress | blocked | planned | not_started`.
`priority`: `P0` (go-live/monetization-critical) · `P1` (ecosystem unlock) ·
`P2` (scale/expansion).

---

## 1. Roadmap (phased, dependency-ordered)

`code_anchor` points at the verified file (or marks an item as not-yet-existing).
`depends_on` uses `ECO-` IDs (and per-product roadmap IDs where the work is owned
there).

| id     | item                                                                            | priority | status      | code_anchor                                                                                                                                                                                                                                                                                                                                                 | depends_on                             | revenue_impact                                                                                                                                                                                            | source                                                                                                                                                                                                 |
| ------ | ------------------------------------------------------------------------------- | -------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ECO-1  | Regroup go-live + monetized (tiers + 2% rent fee)                               | P0       | in_progress | `regroup/functions/src/callable/payments.ts#L152` (2% fee `done`); tiers blocked on Stripe IDs                                                                                                                                                                                                                                                              | —                                      | Activates [`RG-MON-1`..`RG-MON-7`](../_shared/pricing.md)                                                                                                                                                 | ../regroup/project-management.md; `regroup/functions/src/callable/payments.ts#L152` (orig: docs/launch-readiness/cross-product-launch-roadmap.md, archived)                                            |
| ECO-2  | Homegroups go-live + group tier transacting                                     | P0       | in_progress | `homegroups/functions/src/index.ts`; 30/30 code items `done`                                                                                                                                                                                                                                                                                                | —                                      | Activates group tier [`HG-MON-1`](../_shared/pricing.md)                                                                                                                                                  | ../homegroups/project-management.md; `homegroups/functions/src/index.ts` (orig: docs/launch-readiness/homegroups-launch-readiness.md, archived)                                                        |
| ECO-3  | Homegroups B2B revenue activation (intergroup/TC default prices, R-1/R-2)       | P0       | blocked     | `homegroups/functions/src/utils/stripe.ts#L157` (`getDefaultPriceForProduct` throws w/o default price)                                                                                                                                                                                                                                                      | ECO-2                                  | Unblocks [`HG-MON-2`..`HG-MON-4`](../_shared/pricing.md)                                                                                                                                                  | `homegroups/functions/src/utils/stripe.ts#L157` (orig: docs/launch-readiness/homegroups-launch-readiness.md, archived)                                                                                 |
| ECO-4  | NextStep monetized digital + B2B layer (lead-magnet + paid-PDF delivery)        | P0       | blocked     | `detox-recovery/lib/products-data.ts`; Lemon Squeezy store + MailerLite automations                                                                                                                                                                                                                                                                         | —                                      | Unblocks [`DX-MON-4`..`DX-MON-8`](../_shared/pricing.md); [`DX-MON-9`](../_shared/pricing.md) B2B                                                                                                         | ../detox-recovery/project-management.md (DX-PM-1/DX-PM-2)                                                                                                                                              |
| ECO-5  | Cross-project bridge verification (Regroup → Homegroups `getMeetingAttendance`) | P1       | in_progress | CF exists `homegroups/functions/src/http/getMeetingAttendance.ts`; Regroup caller **built + tested** (`regroup/functions/src/callable/homegroups.ts#L69`) but **cross-project call unverified** — task is verify/deploy, not build: fix hardcoded URL (`recovery-connect-prod` → `recovery-connect-cad4b`), set matching `RATS_API_KEY`, run one smoke curl | ECO-1, ECO-2, `HG-P0-5` (RATS_API_KEY) | Enabler — no direct SKU; precondition for ECO-6/ECO-7 enterprise revenue                                                                                                                                  | `homegroups/functions/src/http/getMeetingAttendance.ts` (CF half exists; bridge unverified) (orig: docs/strategy/roadmap.md + docs/launch-readiness/cross-product-launch-roadmap.md HG-P0-5, archived) |
| ECO-6  | Treatment-center facility dashboard (B2B continuing-care view)                  | P1       | not_started | `homegroups/web/src/pages/FacilityDashboardPage.js` (**new**); `facilities/{id}/alumniEngagement` (**new CF**)                                                                                                                                                                                                                                              | ECO-5                                  | **highest-_potential_-ACV (unvalidated) B2B unlock** — treatment-center tiers [`HG-MON-2`/`HG-MON-3`](../_shared/pricing.md); D-10 seat (O-3); solo-infeasible near-term, deferred until revenue funds it | ../homegroups/roadmap.md#hg-rm-3; docs/ecosystem/product-map.md#33-facility-dashboard-bridge                                                                                                           |
| ECO-7  | Aftercare data pipeline (per-alumnus longitudinal outcome record)               | P2       | not_started | **new product — not built**; Next.js + Cloud Run + PostgreSQL (HIPAA BAA **+ 42 CFR Part 2**) per strategy                                                                                                                                                                                                                                                  | ECO-6                                  | Highest-value B2B outcome data; feeds D-10 O-3 seat value; solo-infeasible near-term, deferred until revenue funds it                                                                                     | orig: docs/strategy/roadmap.md + docs/strategy/market-opportunity.md, archived                                                                                                                         |
| ECO-8  | Referral-bus monetization (apply D-10 model; enable relay)                      | P2       | not_started | endpoints exist `recovery-api/src/callable/` (createReferral/getReferrals); **no fee/SKU defined**                                                                                                                                                                                                                                                          | D-10, ECO-6 (for O-3)                  | New ecosystem stream — model TBD ([`monetization.md`](monetization.md#3-recovery-api-referral-monetization-model--open-decision-d-10))                                                                    | recovery-api/src/config/apps.ts; ../detox-recovery/project-management.md#launch-done-definition                                                                                                        |
| ECO-9  | Regroup Oxford acquisition (onboarding wizard, network directory)               | P2       | planned     | `regroup/mobile/src/screens/Oxford*` (client; CF gate `setOxfordEnabled` at `oxford.ts#L39` `done`)                                                                                                                                                                                                                                                         | ECO-1                                  | Grows Regroup tier base ([`RG-MON-4`..`RG-MON-6`](../_shared/pricing.md))                                                                                                                                 | ../regroup/roadmap.md#rg-rm-13; `regroup/functions/src/callable/oxford.ts#L39` (orig: docs/strategy/roadmap.md, archived)                                                                              |
| ECO-10 | Both apps live in App Store + Play                                              | P0       | not_started | RG iOS bundle `com.rats.dev`→prod; HG `deepLinks.js:9` real App Store ID                                                                                                                                                                                                                                                                                    | ECO-1, ECO-2                           | Distribution prerequisite for all consumer SKUs                                                                                                                                                           | `regroup/mobile/ios` bundle config + `homegroups/.../deepLinks.js:9` (orig: docs/launch-readiness/cross-product-launch-roadmap.md, archived)                                                           |

---

## 2. Re-baseline ledger (stale impl-status → code-verified reality)

Every claim below was asserted as "missing/broken" in an upstream strategy/source
doc and is **corrected here against code** before being used above. This is the
guard required by the plan: no code-contradicted "missing" claim appears in the
roadmap.

| stale claim (source)                                                             | code-verified reality                                                                                                                                                                   | anchor                                                                                                                        |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Regroup `createPaymentIntent` / `listPayments` / `listHousePayments` **MISSING** | **DONE** — all three exist                                                                                                                                                              | `regroup/functions/src/callable/payments.ts#L92,L180,L233` (orig: docs/strategy/roadmap.md, archived)                         |
| Regroup 2% application fee **needs wiring**                                      | **DONE** — fee computed in code, shipped to 5 live houses                                                                                                                               | `regroup/functions/src/callable/payments.ts#L152` ([`RG-MON-7`](../_shared/pricing.md) `done`)                                |
| Regroup pricing **hardcoded `$9.99/$19.99`**                                     | **DONE / not hardcoded** — env-var-driven tiers; no `9.99` in source                                                                                                                    | `regroup/functions/src/config.ts#L37-L78` (../regroup/roadmap.md#rg-rm-2)                                                     |
| Regroup RTDB rules **open to public**                                            | **DONE** — deny-all                                                                                                                                                                     | `regroup/mobile/database.rules.json` (`.read/.write:false`) (../regroup/roadmap.md#rg-rm-1)                                   |
| `getMeetingAttendance` **MISSING**                                               | **PARTIAL — split claim.** The CF **exists** in Homegroups; what is genuinely missing is the **Regroup-side cross-project caller**, and the cross-project callability is **UNVERIFIED** | CF: `homegroups/functions/src/http/getMeetingAttendance.ts` (HG-RM-6 `in_progress`); bridge: ECO-5 `not_started`              |
| Homegroups mobile has **only `App.test.tsx`**                                    | **11 mobile test files exist** (Treasury/Overview screens, groups/transactions slices)                                                                                                  | `homegroups/mobile/src/**/*.test.{ts,tsx}` (11 files) (orig: docs/launch-readiness/cross-product-launch-roadmap.md, archived) |
| Regroup Android bundle **needs verification**                                    | Android `applicationId` already production `com.regroup.app`; only **iOS** `com.rats.dev` needs change                                                                                  | `regroup/mobile/android/app/build.gradle:100` (ECO-10 covers iOS only)                                                        |
| Treatment-center facility dashboard                                              | **genuinely MISSING** (`not_started`) — claim stands; carried as ECO-6                                                                                                                  | ../homegroups/roadmap.md#hg-rm-3                                                                                              |
| Aftercare management system                                                      | **genuinely TO-BE-BUILT** — claim stands; carried as ECO-7                                                                                                                              | orig: docs/strategy/market-opportunity.md, archived                                                                           |
| recovery-api referral **monetization**                                           | **genuinely UNDEFINED** — claim stands; opened as D-10, carried as ECO-8                                                                                                                | [`monetization.md`](monetization.md#3-recovery-api-referral-monetization-model--open-decision-d-10)                           |

---

## 3. The three explicit ecosystem phases (with dependencies)

These are the cross-product bridges the plan requires be shown as explicit phases:

1. **Bridge verification (ECO-5)** — _depends on:_ ECO-1, ECO-2, and the
   `RATS_API_KEY` secret (HG-P0-5). The Homegroups `getMeetingAttendance` CF
   exists; this phase proves a **Regroup** Cloud Function can call it **across
   Firebase projects** with the shared key. Until this passes, ECO-6 cannot ship
   (`homegroups/functions/src/http/getMeetingAttendance.ts`; orig: docs/strategy/roadmap.md, archived).
2. **Facility dashboard (ECO-6)** — _depends on:_ ECO-5. The per-alumnus
   continuing-care view + `alumniEngagement` CF. This is the **B2B revenue unlock**
   that makes treatment-center tiers and the D-10 O-3 seat sellable
   (source: docs/ecosystem/product-map.md#33-facility-dashboard-bridge).
3. **Aftercare pipeline (ECO-7)** — _depends on:_ ECO-6. A **new, unbuilt**
   product (Next.js + Cloud Run + PostgreSQL under a HIPAA BAA) that records the
   longitudinal outcome data centers pay most for. **Not present in any repo
   today** (orig: docs/strategy/market-opportunity.md, archived).

> **Honesty guard.** ECO-6 and ECO-7 are `not_started`; ECO-7 is a product that
> does not exist. Neither is presented as built — both are **solo-infeasible
> near-term and deferred until revenue funds them**, and their ACV is
> highest-_potential_ but unvalidated. ECO-5's CF half exists and the Regroup
> caller is built, but the cross-project call is unverified.

---

## 4. Sequencing summary

```
P0  earn at each step first
    ECO-1 (Regroup live+paid) ─┐
    ECO-2 (Homegroups live)   ─┼─► ECO-10 (App Store / Play)
    ECO-3 (HG B2B prices)  ◄───┘   ECO-4 (NextStep digital/B2B)
                  │
P1  first ecosystem connection
    ECO-1, ECO-2, HG-P0-5 ──► ECO-5 (bridge verify) ──► ECO-6 (facility dashboard, B2B unlock)
                  │
P2  expansion / new revenue
    ECO-6 ──► ECO-7 (aftercare pipeline, NEW product)
    D-10 + ECO-6 ──► ECO-8 (referral-bus monetization)
    ECO-1 ──► ECO-9 (Oxford acquisition)
```

The market logic: **monetize each product on its own first (P0)**, then spend the
revenue base to build the **one connection no competitor has** (ECO-5 → ECO-6),
then layer the highest-value outcome data and the referral stream on top (ECO-7,
ECO-8). See [`vision.md`](vision.md#5-sequencing-logic-vision--execution).

---

## See also

- Continuum thesis + wedge: [`vision.md`](vision.md)
- Cross-platform model + D-10: [`monetization.md`](monetization.md)
- Cross-product launch hub: [`project-management.md`](project-management.md)
- Per-product roadmaps: [`../regroup/roadmap.md`](../../../regroup/docs/go-to-market/roadmap.md) · [`../homegroups/roadmap.md`](../../../homegroups/docs/go-to-market/roadmap.md) · [`../detox-recovery/roadmap.md`](../../../detox-recovery/docs/go-to-market/roadmap.md)
