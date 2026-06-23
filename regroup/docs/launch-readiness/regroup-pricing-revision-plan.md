# Regroup Pricing & Monetization Revision — Implementation Plan

**Date:** 2026-06-22
**Source of truth for rationale:** [regroup-pricing-justification.md](./regroup-pricing-justification.md)
**Execution model:** Phases are dependency-ordered and self-contained — each is runnable in its own chat context. Read the phase's "Documentation references" first, re-verify anchors with `find_symbol`/`get_symbols_overview` (line numbers drift), do the work, then run the "Verification checklist" before moving on.
**Scope:** Monetization/pricing **code + config** changes. Two premium-justifying _features_ (compliance export, rent ROI dashboard) are scoped as Phase 5 stubs and cross-referenced to their own specs (RG-SPEC-09) — full feature builds are out of scope here.

> **Anti-pattern guard (whole plan):** Do NOT re-implement things that already exist. The 2% application fee, the `getBundleCoupon` logic, and the 6-tier `SUBSCRIPTION_TIERS` are already in code — this plan _modifies_ them. Re-verify each anchor before editing.

---

## Phase 0 — Decision Gates & Doc Discovery (BLOCKS everything)

**Goal:** Lock the business numbers the code will encode, and confirm the current code anchors. Cheap (decisions + verification reads); unblocks Phases 1–5.

### 0.1 Decision gates — LOCKED 2026-06-22 (owner: Marcus)

| Gate    | Decision              | **LOCKED value**                                                                                                                                                                                               |
| ------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P-1** | Rent fee model        | **Method-aware.** ACH/bank = flat **$2/txn** (or 0.5% capped $3 — implement flat $2 unless trivially configurable as both); Card = **0.75%** platform fee on top of Stripe's cost. Legacy 5 houses stay at 2%. |
| **P-2** | Card cost bearer      | **Resident-borne convenience fee** (~3% disclosed at payment). Operator nets full rent; Regroup adds only the 0.75% platform fee. ACH stays cheap to nudge bank payments.                                      |
| **P-3** | Legacy 5 houses       | **Grandfather at 2% for 6 months**, then migrate (aligns with cross-product roadmap D-9). Flag via `house.legacyRentFee` or a 5-ID allow-list.                                                                 |
| **P-4** | Annual discount       | **~17% (2 months free).** e.g. Oxford Standard $49/mo → **$490/yr**; Traditional Pro $129/mo → **$1,290/yr**.                                                                                                  |
| **P-5** | Trial length          | **30 days**, wired into tier checkout (`trial_period_days`).                                                                                                                                                   |
| **P-6** | Bundle discounts      | **3–4 houses = 10% off, 5+ = 15% off** subscription. Set `bundle3`/`bundle5` coupon amounts accordingly in Stripe.                                                                                             |
| **P-7** | Tier gating           | **Re-gate on capabilities** (value ladder) — only flags that map to existing features or Phase-5 stubs.                                                                                                        |
| **P-8** | Oxford Network ($299) | **Hold** — keep tier defined, `availableForSale: false`, until a regional chapter validates it.                                                                                                                |

> Phases 1–6 below execute against these locked values. The original recommended-default table is retained below for rationale.

### 0.1a Original decision-gate rationale (superseded by the LOCKED table above)

Each has a recommended default from the justification doc. **These are owner decisions — do not invent values.**

| Gate    | Decision                                                              | Recommended default                                                                                      | Affects |
| ------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------- |
| **P-1** | Rent fee model: keep flat 2% vs method-aware                          | **Method-aware**: ACH = flat $2 or 0.5% capped at $3; Card = pass Stripe cost + 0.5–1% platform fee      | Phase 1 |
| **P-2** | Who bears the card fee — operator or resident (convenience fee)?      | **Resident-borne convenience fee** (property-mgmt norm), disclosed at payment                            | Phase 1 |
| **P-3** | Existing 5 houses on legacy 2%: migrate or grandfather?               | **Grandfather** legacy fee 6 months (aligns with D-9 in cross-product roadmap)                           | Phase 1 |
| **P-4** | Annual billing discount %                                             | **~17% (2 months free)**                                                                                 | Phase 2 |
| **P-5** | Trial length wired into tier checkout                                 | **30 days** (matches Phase-plan Oxford trial)                                                            | Phase 2 |
| **P-6** | Bundle discount public values                                         | **3+ houses = 10%, 5+ = 15%** (or confirm existing `bundle3`/`bundle5` coupon amounts in Stripe)         | Phase 3 |
| **P-7** | Tier feature-gating: re-gate on capabilities now vs keep bed-cap-only | **Re-gate on capabilities** (value ladder) — but only flags that map to _existing_ features in this plan | Phase 4 |
| **P-8** | Oxford Network ($299) — launch now or hold for a signed chapter?      | **Hold** until a chapter validates (per justification §6c) — keep tier defined but mark "not for sale"   | Phase 4 |

### 0.2 Re-verify code anchors (read-only; record actual current line numbers)

Confirm these exist and capture exact locations (they were accurate as of the 2026-06-21 review):

- **Tiers:** `regroup/functions/src/config.ts` → `SUBSCRIPTION_TIERS` (6 tiers, each with `priceEnvVar`, `maxResidents`, `maxProperties`). Also the `defineSecret(...)` block + `TIER_BILLING_ENABLED` / `isTierBillingEnabled()`.
- **Rent fee:** `regroup/functions/src/callable/payments.ts` → `Math.round(amount * 0.02)` assigned to `application_fee_amount` (was ~`:151,164`); mirrored in `regroup/functions/src/scheduled/scheduledRentCollection.ts`.
- **Bundle:** `regroup/functions/src/api/stripe.ts` → `getBundleCoupon` (3+ → `bundle3`/`regroup-bundle-3`, 5+ → `bundle5`/`regroup-bundle-5`) and `applyBundleDiscountToSubscription`.
- **Checkout:** `regroup/functions/src/callable/subscriptions.ts` → `createOperatorSubscription` and the `process.env[tierConfig.priceEnvVar]` price lookup.
- **Stripe client/version:** `regroup/functions/src/util/stripe.ts` (`createStripeClient`, pinned `2026-01-28.clover`) vs `api/stripe.ts` (Proxy, unset `STRIPE_API_VERSION`).
- **Tests to mirror:** existing `regroup/functions/src/__tests__/**` payment/subscription suites.

### Verification checklist (Phase 0)

- [ ] All 8 decision gates have a recorded value in this file.
- [ ] Every anchor in 0.2 re-confirmed with `find_symbol` and current line numbers noted.
- [ ] No code changed in this phase.

---

## Phase 1 — Method-Aware Rent Fee (P0 — fixes the #1 justification gap)

**Goal:** Replace the flat 2% on all rent with a method-aware fee that matches the property-management norm (ACH ≈ free/flat; card ≈ pass-through + thin platform fee), per P-1/P-2. Grandfather the 5 legacy houses per P-3.

**What to implement (copy/extend the existing fee site — do NOT rebuild the payment intent flow):**

1. In `payments.ts`, replace the single `Math.round(amount * 0.02)` with a small helper, e.g. `computeApplicationFee({ amountCents, paymentMethodType, isLegacyHouse })`, returning the integer cents fee:
   - `ach`/`us_bank_account` → `min(round(amount * ACH_FEE_RATE), ACH_FEE_CAP_CENTS)` or flat `ACH_FLAT_FEE_CENTS` per P-1.
   - `card` → `round(amount * CARD_PLATFORM_FEE_RATE)` per P-1 (the Stripe processing cost itself is handled by Stripe/convenience fee per P-2, not double-charged).
   - `isLegacyHouse === true` → keep `round(amount * 0.02)` (grandfather, P-3).
2. Add the rate constants to `config.ts` as documented `process.env`-backed values (or constants) with the chosen P-1 numbers; add to the `functions/.env.example` (created in Phase 6).
3. Apply the same helper in `scheduledRentCollection.ts` so scheduled and ad-hoc rent use identical logic (eliminates the duplicated `amount * 0.02`).
4. Determine `paymentMethodType` from the PaymentIntent/charge (Stripe `payment_method_types` / `charges.data[].payment_method_details.type`).
5. Identify legacy houses via an explicit flag (e.g. `house.legacyRentFee === true` set during the Phase-4 migration of the cross-product roadmap, or a config allow-list of the 5 house IDs).

**Documentation references:** `payments.ts` fee site (0.2); `scheduledRentCollection.ts`; Stripe Connect `application_fee_amount` docs (via context7: `stripe-node`).

**Verification checklist:**

- [ ] Unit tests: ACH rent → flat/capped fee; card rent → platform-fee-rate; legacy house → 2%. Integer cents asserted (no floats).
- [ ] `grep -rn "amount \* 0.02" functions/src` returns only the legacy branch.
- [ ] Both `payments.ts` and `scheduledRentCollection.ts` call the shared helper.
- [ ] `tsc --noEmit` clean; existing payment suites still green.

**Anti-pattern guards:** Don't reprice the 5 live houses silently — they stay at 2% via the legacy branch until the roadmap's migration + comms. Don't introduce float math into Stripe amounts.

---

## Phase 2 — Annual Billing + Wired Trial (P1)

**Goal:** Add an annual billing option (~17% off, P-4) and wire the 30-day trial (P-5) into tier checkout.

**What to implement (extend `SUBSCRIPTION_TIERS` + `createOperatorSubscription` — copy the existing monthly pattern):**

1. In `config.ts`, give each tier an optional `annualPriceEnvVar` alongside `priceEnvVar` (same shape — copy the monthly field). Define the 6 annual Stripe prices (monthly × 12 × 0.83 per P-4) in Stripe Dashboard + Secret Manager; wire via `defineSecret()` (consistent with the existing secret block — this is the D-4 pattern from the cross-product roadmap).
2. In `createOperatorSubscription`, accept a `billingInterval: "month" | "year"` input (Zod-validated) and resolve `priceEnvVar` vs `annualPriceEnvVar` accordingly.
3. Add `trial_period_days` (P-5 value) to the subscription create params for new tier subscriptions.

**Documentation references:** `config.ts` tier shape + `defineSecret` block; `subscriptions.ts` `createOperatorSubscription` + price lookup; Stripe `subscriptions.create` `trial_period_days` (context7 `stripe-node`).

**Verification checklist:**

- [ ] Each tier resolves a non-empty price for both `month` and `year`.
- [ ] Emulator: create a `year` subscription for one Traditional + one Oxford tier → correct annual price + trial applied.
- [ ] Zod rejects an invalid `billingInterval`.
- [ ] `firebase functions:secrets:access` shows the 6 new annual price secrets.

**Anti-pattern guards:** Never hardcode price IDs — resolve at runtime by env (existing convention). Don't duplicate the tier list; add a field to the existing structure.

---

## Phase 3 — Activate & Document Bundle Discounts (P1)

**Goal:** Turn the dormant `getBundleCoupon` logic into published, working multi-house pricing (P-6).

> **STATUS 2026-06-22 — DONE (legacy-only).** Owner locked bundles as **legacy per-house only**; tier subscriptions intentionally do NOT bundle (multi-property is priced via the tier — `applyBundleDiscount` early-returns on any sub with a `tier`). Task #2 below (wire into tier checkout) is therefore **intentionally not done** — superseded by this decision. Coupons created+valid in Stripe **test** mode (`regroup-bundle-3` 10%, `regroup-bundle-5` 15%, `duration: forever`); **live coupons still pending a Dashboard create** — the `rk_live_` restricted key lacks coupon-write permission. Criteria documented in `functions/CLAUDE.md` and `go-to-market/monetization.md §1a`. Legacy wiring confirmed by the 52-test `subscriptions.test.ts` suite (green).

**What to implement (the logic exists — verify + surface it):**

1. Confirm `bundle3`/`bundle5` (a.k.a. `regroup-bundle-3`/`-5`) coupons exist in the Stripe Dashboard with the P-6 amounts; create them if missing (no code change to create — Dashboard action).
2. Verify `applyBundleDiscountToSubscription` is actually invoked on the tier checkout path in `subscriptions.ts` (the review noted the criteria are defined but confirm the call is wired for tier subscriptions, not only legacy).
3. Document the criteria in `functions/CLAUDE.md` and the monetization GTM doc.

**Documentation references:** `api/stripe.ts` `getBundleCoupon` + `applyBundleDiscountToSubscription`; `subscriptions.ts` checkout path.

**Verification checklist:**

- [ ] Coupons exist in Stripe with correct percent-off (P-6).
- [ ] Emulator: a 3-house and a 5-house operator subscription applies `bundle3`/`bundle5` respectively.
- [ ] Criteria documented in `functions/CLAUDE.md`.

**Anti-pattern guards:** Don't re-implement coupon logic — it exists; wire/verify only.

---

## Phase 4 — Capability-Based Tier Gating / Value Ladder (P1, per P-7/P-8)

**Goal:** Re-gate tiers on capabilities (not just bed caps) so upgrades buy outcomes, using only flags that map to features that exist today. Mark Oxford Network "not for sale" (P-8).

> **STATUS 2026-06-22 — DONE.** `features` map added to all 6 tiers per the §6b ladder; `availableForSale: false` on Oxford Network. Helpers `tierAllows()` + `isTierAvailableForSale()` added in `util/tierPricing.ts`. Enforced: `multiProperty` in `updateSubscriptionHouses` (capability error before the numeric cap) and `availableForSale` in `createOperatorSubscription` checkout. **Deviation:** the automated-rent path is NOT tier-gated — `scheduledRentCollection.runRentCollection` is a guest-keyed money-movement loop with no houseId→operator index and no server-side autopay-enable boundary (autopay is toggled client-side); gating it would risk halting rent collection and require infra that doesn't exist. `automatedRentCollection`/`complianceExport`/`analytics`/`whiteLabel` remain defined value-ladder flags, not enforced (no real feature/Phase-5 stub yet — per the anti-pattern guard, don't gate vaporware). Tests: tierPricing + subscriptions suites green (611 total). Documented in `functions/CLAUDE.md`.

**What to implement:**

1. Add a `features` capability map to each tier in `SUBSCRIPTION_TIERS` (copy the existing field-addition pattern), e.g. `{ automatedRentCollection, multiProperty, complianceExport, analytics, whiteLabel }` booleans. Set per the justification §6b ladder:
   - Starter/Standard: core only.
   - Professional/Plus: + `automatedRentCollection`, `multiProperty`, `complianceExport` (stub gate; feature lands Phase 5), `analytics`.
   - Enterprise/Network: + `whiteLabel`, chapter rollups.
2. Add a server-side `tierAllows(houseOrSub, featureKey)` guard helper and apply it ONLY where a gated feature is actually invoked today (e.g. multi-property creation, automated rent collection enable). Do NOT gate features that don't exist yet beyond a defined flag.
3. Mark Oxford Network as `availableForSale: false` (P-8) so checkout hides/blocks it until a chapter signs.

**Documentation references:** `config.ts` `SUBSCRIPTION_TIERS`; the resident/property cap enforcement already in checkout (`maxResidents`/`maxProperties`) — copy that enforcement pattern for feature gates.

**Verification checklist:**

- [ ] Each tier has a `features` map; values match the justification ladder.
- [ ] `tierAllows()` enforced on at least the multi-property + automated-rent paths; unit tested allow/deny.
- [ ] Oxford Network not selectable in checkout.
- [ ] No feature gated that lacks an implementation (grep the gate keys → each maps to real code or a Phase-5 stub).

**Anti-pattern guards:** Don't gate vaporware as if shippable. Keep cap enforcement (`maxResidents`/`maxProperties`) — add to it, don't replace it.

---

## Phase 5 — Premium-Justifying Features (stubs + handoff) (P2)

**Goal:** Stand up the two features that justify Professional+ pricing, OR explicitly defer them to their specs. Full builds are out of scope for the pricing plan.

**What to implement (stub + spec handoff):**

1. **Compliance/drug-court export (RG-SPEC-09):** confirm the captured activity + drug-test data model supports an export; create a `complianceExport` callable stub gated by `tierAllows(..., "complianceExport")` that returns "available on Professional+" until built. Link RG-SPEC-09.
2. **Rent-collection ROI dashboard:** define the metrics (collected $, on-time %, hours saved) and the data sources (existing payment + rent records); create a tracking issue. No UI build here.

**Verification checklist:**

- [ ] `complianceExport` stub exists and is tier-gated; returns a clear "upgrade/coming soon" response.
- [ ] RG-SPEC-09 + ROI-dashboard tracking issues created and linked.

**Anti-pattern guards:** Don't half-build the features inside the pricing plan — stub + hand off.

---

## Phase 6 — Docs, Config Manifest & Final Verification

**Goal:** Make the new model self-documenting and prove nothing regressed.

**What to implement:**

1. Create `regroup/functions/.env.example` enumerating ALL pricing/config env vars: the 6 monthly + 6 annual `STRIPE_PRICE_*`, the new rent-fee rate constants, `TIER_BILLING_ENABLED`, `RECOVERY_API_BASE_URL`, `STRIPE_API_VERSION`, and `STRIPE_CONNECT_WEBHOOK_SECRET` (this closes the gap flagged in the codebase review).
2. Update `regroup/docs/go-to-market/monetization.md` to the revised model (method-aware fee, annual, bundles, value ladder) and fix the broken `_shared/pricing.md` SSOT reference.
3. Update `regroup/CLAUDE.md` Cross-Product Rules subscription bullet if any numbers changed (already corrected to the tier model this session).

**Final verification checklist:**

- [ ] `grep -rn "amount \* 0.02" functions/src` → only the legacy branch.
- [ ] All tiers resolve monthly + annual prices; trial + bundle coupons apply in emulator.
- [ ] `tierAllows()` enforced + tested; Oxford Network not sellable.
- [ ] `functions/.env.example` lists every required var; `tsc --noEmit` clean; full functions test suite green.
- [ ] All 8 decision-gate values recorded in Phase 0.

---

## Phase → outcome index

| Phase | Outcome                               | Priority | Depends on |
| ----- | ------------------------------------- | -------- | ---------- |
| 0     | Decisions locked + anchors verified   | P0       | —          |
| 1     | Method-aware rent fee (fixes 2% gap)  | P0       | 0          |
| 2     | Annual billing + trial                | P1       | 0          |
| 3     | Bundle discounts live + documented    | P1       | 0          |
| 4     | Capability tier gating / value ladder | P1       | 0          |
| 5     | Premium-feature stubs + handoff       | P2       | 4          |
| 6     | Docs + env manifest + verification    | P1       | 1–5        |
