# Plan — Recovery Platform Docs Consolidation & Go-To-Market Doc Set

**Date:** 2026-06-10
**Author:** orchestrator (make-plan)
**Goal:** Read and understand the full documentation corpus, then produce an _optimized, organized, non-duplicative_ doc set covering three categories — **project-management**, **monetization**, **roadmap** — for each of **regroup**, **homegroups**, **detox-recovery** (each toward "ready to go live + fully monetized"), plus **one ecosystem roadmap** combining all apps into a cohesive, market-feasible, monetizable recovery platform.

**Decision D-1 — RESOLVED (2026-06-10):** the deliverable set is **consolidated into one tree, `docs/go-to-market/`** — NOT scattered across per-product `docs/`. Per-product business docs (`{product}/docs/{monetization,product/roadmap,operations/launch-blockers,…}`) become **sources** that are consolidated here once, then reduced to a one-line pointer stub or archived (Phase 6) so there is exactly **one SSOT** and **zero redundancy**.

**Target tree (consolidated, AI-optimized):**

```
docs/go-to-market/
  README.md                  # index, reading order, SSOT map, doc conventions
  _shared/
    pricing.md               # ONE canonical price table for ALL products (machine-readable)
    integration.md           # recovery-api referral/SKU map for cross-app code-gen (links ecosystem/integration.md, no dup)
    decisions-log.md         # D-1/D-9/D-10 + every reconciliation decision
  regroup/
    monetization.md          # references _shared/pricing.md — no number duplication
    roadmap.md
    project-management.md     # go-live→monetized launch plan (blockers, milestones, owners, gates, status)
  homegroups/   { monetization.md, roadmap.md, project-management.md }
  detox-recovery/ { monetization.md, roadmap.md, project-management.md }
  ecosystem/
    vision.md                # platform thesis (fills the empty docs/ecosystem/vision.md stub)
    monetization.md          # cross-platform model; pulls per-product numbers from _shared/pricing.md
    roadmap.md               # combined, market-feasible ecosystem roadmap
    project-management.md     # cross-product launch hub (supersedes docs/launch-readiness/* as the live SSOT)
```

**Deliverable matrix (12 scope×category docs + 3 `_shared` + README):**

| Scope          | project-management                                       | monetization                                       | roadmap                                       |
| -------------- | -------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------- |
| regroup        | `docs/go-to-market/regroup/project-management.md`        | `docs/go-to-market/regroup/monetization.md`        | `docs/go-to-market/regroup/roadmap.md`        |
| homegroups     | `docs/go-to-market/homegroups/project-management.md`     | `docs/go-to-market/homegroups/monetization.md`     | `docs/go-to-market/homegroups/roadmap.md`     |
| detox-recovery | `docs/go-to-market/detox-recovery/project-management.md` | `docs/go-to-market/detox-recovery/monetization.md` | `docs/go-to-market/detox-recovery/roadmap.md` |
| ecosystem      | `docs/go-to-market/ecosystem/project-management.md`      | `docs/go-to-market/ecosystem/monetization.md`      | `docs/go-to-market/ecosystem/roadmap.md`      |

### AI-optimization conventions (apply to EVERY deliverable — this is the core quality bar)

The docs exist so an AI agent can drive automation and code-gen from them reliably. Therefore:

1. **YAML front-matter** on every file: `title`, `scope`, `category`, `status`, `last_verified` (date), `sources` (list of SSOT paths consumed), `supersedes` (paths now pointer-stubbed/archived).
2. **One fact, one home.** Numbers (prices, fees, projections) live only in `_shared/pricing.md`; every other doc _links_ to the exact table row. No price string is written twice anywhere in the tree.
3. **Machine-readable tables over prose** for anything an agent acts on. Canonical column sets:
   - Pricing: `product | sku | price | billing_period | stripe_product_id | stripe_price_env_var | connect_fee | status | source`
   - Roadmap: `id | item | priority | status | code_anchor | depends_on | revenue_impact | source`
   - Launch/PM: `id | blocker | severity | owner | track | status | acceptance_check | source`
4. **Stable IDs** (`HG-P0-1`, `RG-MON-2`, `D-10`) so other docs and code/automation can reference a row unambiguously.
5. **Relative links only**, validated in Phase 7. Every quantitative claim ends with `(source: path#anchor)`.
6. **Status vocabulary** fixed to: `done | in_progress | blocked | planned | not_started`. No free-form status text.
7. **No PII**, no secret values; reference env-var _names_ only (platform privacy/secrets rules).
8. **`README.md` is the entry point**: reading order, an SSOT map (topic → owning file), and these conventions, so any agent can self-orient before generating code.

Each phase below is **self-contained** and executable in a fresh context. Phases **synthesize from cited authoritative sources**, never invent figures or restate stale claims, and **emit the consolidated `docs/go-to-market/**` files\*\* above (not the per-product paths).

---

## Phase 0 — Documentation Discovery (COMPLETE)

This phase has already been executed (4 parallel read-only discovery agents + structural inventory). Outputs below are the **grounding facts** every later phase must build on. Re-reading the cited SSOTs is still required per phase; do **not** treat the numbers here as authoritative — they are pointers.

### 0.1 Corpus shape

- **790 markdown files** total (most under `*/ios/Pods/**`, `*/_legacy/**`, `*/archive/**`, `.full-review/**`, `.audit/**`, `.remember/**` — these are **noise / historical**, not deliverable sources).
- A **mature per-product business-doc layer already exists**: `{product}/docs/{monetization,product,operations,technical,plans}`.
- A **platform layer already exists**: `docs/{ecosystem,strategy,launch-readiness}` + `docs/INDEX.md`, `docs/PRODUCT-ENCYCLOPEDIA.md`, `docs/STRIPE_CONNECT_GUIDE.md`.
- This is a **consolidation + reconciliation + gap-fill** effort, not a greenfield writing effort.

### 0.2 Authoritative sources (SSOT) — COPY FROM THESE

**regroup**

- Current state / strategic roadmap (SSOT): `regroup/docs/product/decisions.md` (2026-05-24)
- Pricing/monetization: `regroup/docs/monetization/model.md` + `regroup/mobile/PRICING_STRATEGY.md` (Nov 2025)
- Feature roadmap: `regroup/mobile/FEATURE_PRIORITIZATION.md` (Nov 2025)
- Tier-billing implementation (active): `regroup/docs/superpowers/plans/2026-06-06-regroup-tier-billing-migration.md`
- App-store launch checklist: `regroup/docs/operations/manual-tasks/2026-05-21-app-store-launch-checklist.md`

**homegroups**

- Pricing/model (SSOT): `homegroups/docs/monetization/model.md`; projections: `homegroups/docs/monetization/projections.md`; opportunity tracker: `homegroups/docs/monetization/revenue-opportunities.md`; market: `homegroups/docs/monetization/market-intelligence.md`
- Launch blockers (SSOT): `homegroups/docs/operations/launch-blockers.md` (2026-05-27); checklist: `homegroups/docs/operations/pre-launch-checklist.md` (2026-05-28)
- Roadmap (SSOT): `homegroups/docs/product/roadmap.md`; 12-month ecosystem exec plan: `homegroups/docs/plans/2026-04-13-recovery-ecosystem-12-month-plan.md`

**detox-recovery**

- Financial model (SSOT): `detox-recovery/docs/monetization/projections.md` (v2.0); strategy context: `detox-recovery/docs/monetization/model.md`
- Roadmap (SSOT): `detox-recovery/docs/product/roadmap.md`
- Final pre-launch sprint (SSOT): `detox-recovery/docs/superpowers/plans/2026-06-07-detox-completion.md` (supersedes 2026-05-27 launch-blockers)
- Manual runbooks: `detox-recovery/docs/operations/manual-tasks/{2026-05-21-external-service-setup,2026-05-23-mailerlite-automation-setup,2026-05-23-lemon-squeezy-migration}.md`

**ecosystem / platform**

- Ecosystem priorities roadmap: `docs/strategy/roadmap.md` (strategy sound; **impl-status claims stale — code overrides**)
- Cross-product launch roadmap (SSOT, code-verified 2026-06-06): `docs/launch-readiness/cross-product-launch-roadmap.md` + `docs/launch-readiness/03-launch-roadmap.md`
- Per-product readiness scores: `docs/launch-readiness/{homegroups,regroup}-launch-readiness.md`
- Integration model: `docs/ecosystem/integration.md`, `docs/ecosystem/product-map.md`; canonical app-ids: `recovery-api/src/config/apps.ts`
- Stripe Connect mechanics: `docs/STRIPE_CONNECT_GUIDE.md`

### 0.3 Anti-sources — DO NOT copy claims from these (cite only as history)

- `docs/ecosystem/vision.md` — **STUB / empty** (must be authored, not copied).
- `docs/strategy/monetization.md` — intergroup/treatment-center pricing **stale** vs. launch-readiness decision gates D-1/D-2; reconcile, don't echo.
- `docs/strategy/roadmap.md` — implementation-status claims **stale** (e.g., "regroup payment CFs missing" — code review shows otherwise for some; verify each).
- Anything under `*/_legacy/**`, `*/docs/archive/**`, `*/docs/_archive/**`, `*/.full-review/**`, `*/.audit/**`, `regroup/mobile/docs/type-fixes/**`, `*/ios/Pods/**`.
- `regroup/docs/technical/gap-analysis-production-readiness.md` — self-marked **stale** (Dec 2025); use only to show progress delta.
- Duplicates: `regroup/mobile/PRODUCT_ROADMAP.md` mirrors `FEATURE_PRIORITIZATION.md`; collapse, don't duplicate.

### 0.4 Cross-cutting reconciliation facts (must be resolved consistently across all docs)

1. **Pricing conflicts exist and must be resolved to one SSOT each:**
   - homegroups groups: `$12/yr` (model.md) vs `$24/yr` (launch-readiness D-1). Intergroup A/B: `$99/$249` recommended but **no default Stripe price set** (runtime blocker R-1/R-2).
   - regroup: legacy `$9.99/$19.99` **hardcoded** in Cloud Functions vs approved tiered `$49–$299` (+2% rent fee via Connect). 5 live houses on legacy `$10+$1/mo` need a migration/grandfather decision (D-9: 6-month window).
   - detox: support call `$50` → recommended `$75`; PDFs `$9.99–$19.99` pending Lemon Squeezy.
2. **Monetization is "built but not activated"** for homegroups + regroup — the gating blocker is **Stripe price creation + end-to-end payment verification**, not features.
3. **Cross-app integration is partial:** recovery-api referral endpoints + canonical app-id registry exist; the `getMeetingAttendance` cross-project bridge (RATS→RecoveryConnect) is **unverified**; the treatment-center facility dashboard is **MISSING**; **referral monetization is undefined**.
4. **Phantom features (regroup):** docs claim e-sign + "Oxford CRUD as Cloud Functions"; code shows neither fully. Roadmap/PM docs must reflect reality (build vs de-scope vs correct-marketing), not the claim.
5. **detox delivery gaps:** lead-magnet automation + paid-PDF fulfillment are **broken/missing**; analytics not installed. These are monetization-blocking and belong in the PM launch-plan.

---

## Phase 1 — Target structure, conventions & INDEX scaffold

**What to produce:**

1. Scaffold the consolidated tree `docs/go-to-market/` exactly as in the "Target tree" above: create `README.md`, `_shared/{pricing,integration,decisions-log}.md`, and `{regroup,homegroups,detox-recovery,ecosystem}/{monetization,roadmap,project-management}.md` — each as a stub with the YAML front-matter from the AI-optimization conventions.
2. Author `docs/go-to-market/README.md` first: reading order, SSOT map (topic → owning file), the **AI-optimization conventions** (front-matter, one-fact-one-home, table column sets, stable-ID scheme, status vocabulary), and a "project-management category" definition (a single actionable launch-to-monetized plan per scope — blockers, milestones, sequencing, owners, decision gates, status).
3. Author `docs/go-to-market/_shared/pricing.md` as the empty-but-structured canonical pricing table (column set per conventions) — Phases 2–4 fill its rows; no other doc restates prices.
4. Add a `docs/go-to-market/` entry to `docs/INDEX.md` pointing at the README as the GTM entry point.

**Doc references:** `.claude/skills/doc-organizer-recovery/{CATEGORIES,PHASE-GUIDE,INDEX-TEMPLATE}.md`; `docs/INDEX.md`; "Target tree" + "AI-optimization conventions" at top of this plan.

**Verification checklist:**

- [ ] Full `docs/go-to-market/` skeleton exists (README + `_shared/*` + 12 scope×category stubs), each with valid front-matter.
- [ ] README documents reading order, SSOT map, and all 8 AI-optimization conventions.
- [ ] `_shared/pricing.md` has the canonical column header and is the only file permitted to hold price values.
- [ ] `docs/INDEX.md` links to the GTM README.

**Anti-pattern guards:** Do not move/delete existing files in this phase (archival happens in Phase 6). Do not put any price value outside `_shared/pricing.md`.

---

## Phase 2 — regroup: monetization + roadmap + project-management

**What to produce (synthesize from SSOTs in §0.2; reconcile per §0.4):**

1. `docs/go-to-market/regroup/monetization.md` — reconcile to ONE canonical pricing model: tiered `$49–$299` (Traditional + Oxford ladders) + 2% rent fee via Stripe Connect. **Write the price rows into `_shared/pricing.md`** and link them here; this doc holds the narrative/logic + projections, not raw numbers. Document the legacy→tier **migration & grandfather** decision (D-9) and the hardcoded-price defect as a launch blocker.
2. `docs/go-to-market/regroup/roadmap.md` — collapse `FEATURE_PRIORITIZATION.md` + `PRODUCT_ROADMAP.md` + `decisions.md` roadmap into one tier-scored roadmap (roadmap table column set) to "live + monetized"; mark phantom features (e-sign, Oxford CRUD) with truthful build/de-scope status + code anchors.
3. `docs/go-to-market/regroup/project-management.md` — actionable plan (launch/PM table column set) from `decisions.md` 90-day sprint + `2026-06-06-regroup-tier-billing-migration.md` + app-store checklist: blockers (open security rules; hardcoded pricing; missing `createPaymentIntent`/`listPayments`/`listHousePayments` CFs; HIPAA decision; IAP vs web billing), milestones, sequencing, owners, decision gates, status.

**Doc references:** all regroup SSOTs in §0.2; `docs/launch-readiness/regroup-launch-readiness.md` (readiness score 48/100, phantom-feature findings).

**Verification checklist:**

- [ ] One canonical price table; no `$9.99/$19.99` presented as current target.
- [ ] Migration/grandfather decision for the 5 live houses documented.
- [ ] Phantom features reflect code reality, not doc claims (cross-check `docs/launch-readiness/regroup-launch-readiness.md`).
- [ ] Launch-plan blockers map 1:1 to `decisions.md` + tier-billing plan; each has status + owner.
- [ ] `grep -rn "9.99\|19.99" regroup/docs` returns only historical/migration context.

**Anti-pattern guards:** Do not copy stale gap-analysis percentages as current. Do not assert features exist without a code anchor. Do not invent revenue numbers — cite `monetization/model.md`/`PRICING_STRATEGY.md`.

---

## Phase 3 — homegroups: monetization + roadmap + project-management

**What to produce (synthesize from §0.2; reconcile per §0.4):**

1. `docs/go-to-market/homegroups/monetization.md` — reconcile group price (resolve `$12` vs `$24/yr` per D-1), intergroup A/B, treatment-center tiers, donations 5% Connect fee. **Price rows go into `_shared/pricing.md`**; link them here. Flag **R-1/R-2 (no default Stripe price set)** as the top monetization blocker; fold the `revenue-opportunities.md` status tracker + 3-yr projections narrative.
2. `docs/go-to-market/homegroups/roadmap.md` — refresh to: launch → 30-group pilot → treatment-center facility dashboard (B2B unlock) → B2B sales; mark V4.1–V4.4 as intentionally flag-hidden.
3. `docs/go-to-market/homegroups/project-management.md` — from `operations/launch-blockers.md` + `pre-launch-checklist.md` + `2026-05-26-go-live-revenue-growth.md`: P0 (Stripe prices, App Store submit, `RATS_API_KEY` secret, claim-and-pay E2E, Auth domains, email sender), P1 (custom domain, live Stripe key, pilot outreach), P2 (App Check, rate limiting). Milestones, owners, status.

**Doc references:** all homegroups SSOTs in §0.2; `docs/launch-readiness/homegroups-launch-readiness.md` (72/100); `docs/STRIPE_CONNECT_GUIDE.md`.

**Verification checklist:**

- [ ] Group-price conflict resolved to one value with rationale (ties to D-1).
- [ ] R-1/R-2 Stripe-price blocker is the headline monetization gap.
- [ ] Launch-plan tracks code (30/30 done) vs infra/app-store/validation (pending) as separate tracks with the minimum-viable launch sequence.
- [ ] Facility dashboard appears as the explicit B2B revenue unlock.

**Anti-pattern guards:** Do not present intergroup/TC revenue as live (prices unset). Do not duplicate the 12-month ecosystem plan here — link it; ecosystem sequencing belongs in Phase 5.

---

## Phase 4 — detox-recovery: monetization + roadmap + project-management

**What to produce (synthesize from §0.2; reconcile per §0.4):**

1. `docs/go-to-market/detox-recovery/monetization.md` — canonical service ladder (Tier 2 call, Tier 3, Tier 4), digital PDFs via **Lemon Squeezy** (Stripe for calls/donations), B2B consulting/retainer, group subscription, VA Community Care, grants. **Price rows go into `_shared/pricing.md`** with the processor column distinguishing Stripe vs Lemon Squeezy; this doc holds the narrative + v2.0 3-scenario projections.
2. `docs/go-to-market/detox-recovery/roadmap.md` — refresh P0–P3 to current: P0 launch blockers (`RUNTIMEi` typo, PDF delivery, custom domain, analytics), P1 lead-magnet content + automations + `/thank-you`, P2 Tier 3 + B2B guide + SEO, P3 Tier 4 + workshops.
3. `docs/go-to-market/detox-recovery/project-management.md` — from `2026-06-07-detox-completion.md` (Part A agent-executable / Part B manual) + manual-task runbooks: blockers (broken lead-magnet delivery, undeliverable paid PDFs, price not single-sourced, missing analytics), milestones (first paid call ✅ → first B2B → Tier 3 → $1k/mo → VA cert), owners, status.

**Doc references:** all detox SSOTs in §0.2.

**Verification checklist:**

- [ ] Payment processor split (Stripe for calls/donations; Lemon Squeezy for PDFs) is explicit.
- [ ] Lead-magnet + PDF-fulfillment gaps are surfaced as monetization-blocking in the launch-plan.
- [ ] Support-call price single-sourced (`SERVICE_TIERS`), not hardcoded `$50` in copy.
- [ ] Part A vs Part B (agent vs manual/external) split preserved.

**Anti-pattern guards:** Do not treat the site as "launched/monetized" beyond Tier 2 + donations. Do not copy `2026-05-27-launch-blockers.md` (superseded by 2026-06-07).

---

## Phase 5 — Ecosystem: combined roadmap + monetization + vision

**What to produce:**

1. `docs/go-to-market/ecosystem/vision.md` — ASAM-continuum thesis (detox → sober living → community), the "no competitor connects all three" wedge, post-discharge outcome visibility for treatment centers. Source: `docs/ecosystem/product-map.md`, `docs/strategy/market-opportunity.md`. (The old `docs/ecosystem/vision.md` stub becomes a pointer in Phase 6.)
2. `docs/go-to-market/ecosystem/monetization.md` — cross-platform model: per-product revenue **read from `_shared/pricing.md`** (single source, no drift), Stripe Connect platform fees (2% rent / 5% donations), and a **defined recovery-api referral-monetization model** (currently undefined — propose options + recommendation, mark as decision gate D-10).
3. `docs/go-to-market/ecosystem/roadmap.md` — **market-feasible, monetizable** ecosystem roadmap: per-product go-live sequencing → cross-project bridge verification → facility dashboard → aftercare data pipeline → referral-bus monetization. Re-baseline all stale impl-status claims against `docs/launch-readiness/*` (code-verified) and the per-product roadmaps.
4. `docs/go-to-market/ecosystem/project-management.md` — the **ecosystem PM hub** (cross-product launch sequence + decision gates), synthesizing `docs/launch-readiness/cross-product-launch-roadmap.md`. Cross-link it with the three per-product `project-management.md` files; `docs/launch-readiness/*` becomes a pointer/archive in Phase 6.

**Doc references:** §0.2 ecosystem sources; finalized Phase 2–4 deliverables; `recovery-api/src/config/apps.ts`; `recovery-api/CLAUDE.md`.

**Verification checklist:**

- [ ] `docs/ecosystem/vision.md` is no longer a stub.
- [ ] Cross-platform monetization numbers match the per-product SSOTs exactly (no divergence).
- [ ] Referral-monetization model proposed with a clear recommendation + open decision (D-10).
- [ ] Roadmap impl-status reconciled against launch-readiness (no "missing" claim contradicted by code).
- [ ] Bridge/facility-dashboard/aftercare appear as explicit ecosystem phases with dependencies.

**Anti-pattern guards:** Do not present the aftercare system or referral bus as built. Do not let cross-platform totals contradict per-product docs. Do not restate `docs/strategy/monetization.md` stale pricing — supersede it.

---

## Phase 6 — Reconciliation, INDEX, and archive

**What to produce:**

1. Record every §0.4 reconciliation in `docs/go-to-market/_shared/decisions-log.md` (D-1, D-9, D-10, each resolved price).
2. Replace the now-consolidated **source** docs with one-line pointer stubs to their `docs/go-to-market/**` home (or archive them), so there is exactly one SSOT and zero redundancy. Targets: per-product `docs/monetization/*`, `docs/product/roadmap.md`, `docs/operations/{launch-blockers,pre-launch-checklist}.md`; platform `docs/strategy/{monetization,roadmap}.md`, `docs/ecosystem/vision.md`, `docs/launch-readiness/*`. Update `docs/INDEX.md` and each `{product}/docs/README.md` to point at the GTM tree.
3. Archive true duplicates per the doc-organizer move convention (`PHASE-GUIDE.md` §"Merge Step") — e.g. `regroup/mobile/PRODUCT_ROADMAP.md` — to `_archive/` with a dated reason. **Propose a move/pointer table first; do not bulk-delete.**

**Verification checklist:**

- [ ] No two deliverables state different prices for the same SKU.
- [ ] INDEX links resolve (no 404 paths).
- [ ] Move/archive table reviewed before any file is moved.

**Anti-pattern guards:** Do not `rm` files — move to `_archive/` with a README reason. Do not archive anything still referenced by a canonical deliverable.

---

## Phase 7 — Verification

1. **Link integrity:** `grep`/script all relative links in the 12 deliverables + INDEX resolve to real files.
2. **Price consistency:** grep each SKU's price string across all deliverables — exactly one canonical value (+ explicit historical/migration mentions only).
3. **Stale-claim guard:** grep for known stale phrases (e.g., "payment CFs missing", "$9.99", money-back guarantee, `RUNTIMEi`) — only in historical/blocker context.
4. **Completeness:** all 12 cells of the deliverable matrix exist and are non-stub; `docs/ecosystem/vision.md` non-empty.
5. **Coherence read-through:** one agent reads all 12 + INDEX and reports contradictions, orphaned references, or scope gaps; fix what it finds.
6. **Decision gates closed:** D-1, D-9, D-10 each have a recorded resolution in the INDEX reconciliation log.

**Anti-pattern guards:** Verification is read-only + fix; do not introduce new scope. If a contradiction traces to code reality, the launch-readiness/code anchor wins.

---

## Execution notes

- Phases 2/3/4 are **independent** and may run in parallel (separate products). Phase 5 depends on 2–4 (uses their finalized numbers). Phase 6 depends on 2–5. Phase 7 is last.
- Every phase: re-read the cited SSOTs in-context (don't trust this plan's summaries as authoritative). Cite `file:section` for every quantitative claim.
- Keep PII out of all docs (platform privacy rule). Sanitize any operator/customer specifics.
