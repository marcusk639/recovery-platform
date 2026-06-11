# Plan — Recovery Ecosystem Business-Validation Program

**Date:** 2026-06-10
**Source spec:** `docs/superpowers/specs/2026-06-10-recovery-ecosystem-validation-design.md`
**Status:** ready to execute
**Execution model:** phases are session-resumable. Each phase below is self-contained — it names its inputs, the exact files/APIs to use, copy-ready references, a verification checklist, and anti-pattern guards. Run phases in order. **Phase 3 (expensive web research) must not start until the Phase 2 human gate is approved.**

> **One-line goal:** Validate — realistically, grounded, anti-optimism — whether the PR #14 recovery-platform ecosystem is a feasible/achievable/sustainable business, optimized to recommend a **build/monetize sequence**. Deliverable is ONE document with (1) scored validation report, (2) feasibility × risk-adjusted-return decision matrix, (3) a doc-revision prompt for a later controlled edit task.

---

## Phase 0 — Documentation Discovery (COMPLETE — verified facts + Allowed APIs)

This phase is **already done**. Its outputs are recorded here so every later phase is grounded in verified reality, not assumption. Do not re-derive these; treat them as ground truth and re-verify only if a file changed.

### 0.1 Validation-target inventory (verified against disk 2026-06-10)

All under `docs/go-to-market/` — **exactly 17 files**, structure matches the spec:

| Scope             | Files                                                                 |
| ----------------- | --------------------------------------------------------------------- |
| `_shared/`        | `pricing.md`, `decisions-log.md`, `integration.md`                    |
| `regroup/`        | `monetization.md`, `roadmap.md`, `project-management.md`              |
| `homegroups/`     | `monetization.md`, `roadmap.md`, `project-management.md`              |
| `detox-recovery/` | `monetization.md`, `roadmap.md`, `project-management.md`              |
| `ecosystem/`      | `monetization.md`, `roadmap.md`, `project-management.md`, `vision.md` |
| root              | `README.md`                                                           |

**Verified load-bearing numbers (cite these anchors in the claim ledger — do NOT invent or round differently):**

- **26 SKUs** in `_shared/pricing.md` pricing table: Regroup `RG-MON-1..7` (7), Homegroups `HG-MON-1..6` (6), Detox `DX-MON-1..13` (13).
- **Detox-only** P10/P50/P90 projections live in `_shared/pricing.md:64-68` (`DX-PROJ-Y1/Y2/Y3`): P50 Y1 $18,063 → Y2 $55,925 → Y3 $139,250.
- **Ecosystem combined 3-year ARR** lives in `ecosystem/monetization.md:150-154` — **Conservative ~$1.74M** (Y1 $105,840 → Y2 $417,900 → Y3 $1,216,020); **Moderate ~$7.84M** (Y1 $325,380 → Y2 $1,731,888 → Y3 $5,781,000). Implied valuation $46M–$87M at 8–15× (`ecosystem/monetization.md:150-164`). **The $1.74M/$7.84M figures in the spec are the ecosystem scenarios, NOT a sum of the per-product tables — anchor verdicts to the right table.**
- **Open decisions** (`_shared/decisions-log.md`): **D-10** referral-monetization model undefined → recommends O-3 (B2B treatment-center SaaS seat) + O-1 (flat fee) bridge; _any per-referral money movement must clear anti-kickback / patient-brokering legal review_ (`ecosystem/monetization.md:100-127`). **D-11** regroup IAP vs web billing OPEN, recommends web/hybrid, launch-blocking (`regroup/monetization.md:43`). **D-12** regroup HIPAA/BAA surface OPEN.
- **Solo-founder constraint** stated at `detox-recovery/monetization.md:22` ("Solo founder, part-time Year 1 → full-time transition Year 2"). This is the hard capacity constraint for every roadmap/timeline verdict.
- **Network-effect thesis** ("no competitor connects detox→sober living→12-step"): `ecosystem/monetization.md:39-44`, `homegroups/monetization.md:219-224`.
- **Capacity ceilings to stress-test:** detox call ceiling "5–8 paid calls/week, ~$5,100/mo theoretical max" (`detox-recovery/monetization.md:93-102`); detox B2B "51% of Y1 revenue from 2 engagements" (`:137-142`); regroup Oxford affordability "~1–2% of collections, $35–75/mo" (`regroup/monetization.md:82-87`); homegroups group tier "ARR ~$2,892, a rounding error" (`homegroups/monetization.md:102-112`).

### 0.2 Allowed APIs (verified tool signatures — use ONLY these; do not invent params)

**Web research (Stage 2 / Phase 3):**

- `mcp__firecrawl__firecrawl_search` — **primary** (per MCP guidance). Args: `query` (required), `limit`, `sources:[{type:"web"|"news"|"images"}]`, `includeDomains`/`excludeDomains`, `location`, `scrapeOptions.formats:["markdown"|"summary"|...]`. Supports operators: `"exact"`, `-exclude`, `site:`, `intitle:`. After use, optionally call `mcp__firecrawl__firecrawl_search_feedback` with the search ID (refunds 1 credit).
- `mcp__exa__web_search_exa` — args: `query` (describe the ideal page, not keywords; supports `category:company`/`category:people`), `numResults`. Follow with `mcp__exa__web_fetch_exa` (`urls:[]`, `maxCharacters`) for full text.
- `WebSearch` (args: `query`, `allowed_domains`/`blocked_domains`; US-only) and `WebFetch` (`url`, `prompt`) — **fallback only.**
- `mcp__firecrawl__firecrawl_scrape` / `firecrawl_extract` — for a known URL needing structured pull.

**Orchestration:** the `Workflow` tool (dynamic multi-agent fan-out) for Phase 3; `Agent` for one-off sub-tasks. `Workflow` script hooks confirmed available: `agent(prompt,{schema,phase,label,model})`, `pipeline(items,...stages)`, `parallel(thunks)`, `phase()`, `log()`, `budget.{total,spent(),remaining()}`. `budget.total` is null unless the user set a `+Nk` target — guard loops on it.

**Memory:** claude-mem search is `mcp__plugin_claude-mem_mcp-search__search` (memory index) → `get_observations([ids])` for full text. NOTE: `smart_search` is a codebase/AST tool, NOT memory. To write findings back: `observation_add` / `memory_add`. (Also `/claude-mem:mem-search` skill.)

**Codebase confirmation:** Serena symbolic tools (`get_symbols_overview`, `find_symbol`, `find_referencing_symbols`) + Read — to confirm "is a claimed-built feature actually built."

### 0.3 Prior memory seed evidence (already retrieved — reuse, don't re-search from scratch)

| Topic                    | Observation          | Usable finding                                                                                                                                                         |
| ------------------------ | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Regroup PMF              | **#895, #950**       | Pricing defect: charges $9.99–19.99 vs market-required $39–99 flat; readiness 48/100; phantom e-sign feature.                                                          |
| Regroup competitors      | **#448**             | Sobriety Hub $75/mo per staff user; Behave Health & OneStep custom quotes; operators budget ~$140–150/mo; no dominant incumbent.                                       |
| Detox monetization       | **#752**             | VA billing (~$30/session) + grants are **Year-2+ deferred**; Lemon Squeezy PDFs undeployed; Tier-2 call $50 (research says $75).                                       |
| Referral / anti-kickback | **#830 (D-10)**      | Relay built but disabled; O-3 chosen _because_ it sidesteps per-referral legal landmines; legal review required before any money movement.                             |
| Homegroups WTP           | **#894, #887**       | $24/yr via D-1; explicitly a distribution flywheel not revenue; real money is B2B intergroup/treatment ($99–499/yr).                                                   |
| Ecosystem thesis         | **#887, #665**       | ASAM continuum moat asserted; **thesis is unrealized in code — bus has zero live producers/consumers**; market $143.62B SUD, 17.9K residences, 85% first-year relapse. |
| Methodology template     | **#513, #503, #496** | BH-RCM Copilot used hard validation gates (42 CFR Part 2 + WTP interviews before build); SMB CAC $200–500, LTV:CAC ≥3:1.                                               |

**Named research GAPS with no prior memory (Stage 2 must source these externally):** (a) Medicaid PSS / peer-support-specialist billing mechanics; (b) detox IAP-vs-web-billing resolution; (c) direct 12-step-treasurer willingness-to-pay (AA 7th-tradition self-support sensitivity).

### 0.4 Anti-pattern guards (apply in EVERY later phase)

- **Anti-optimism is the prime directive.** Every research agent defaults to disconfirmation: actively hunt the dead comparable, the regulatory blocker, the projection that breaks on real data.
- **Sourcing gate.** Unsourced or self-cited (cites only the GTM docs / founder assumptions) claims cap at `weak`. Every _quantitative_ verdict needs **≥1 external source**. Cite every source with URL.
- **Solo-founder reality is a hard constraint.** "Achievable by a funded team" ≠ achievable. Apply to every roadmap/capacity/timeline claim.
- **`insufficient-evidence` is a valid, encouraged verdict.** Never manufacture confidence.
- **Confidence is always explicit** (high/medium/low) with a stated reason.
- **Do NOT** edit the GTM docs in this effort (deferred to the Phase 4 doc-revision-prompt deliverable). **Do NOT** build/alter product features. **Do NOT** re-validate unrelated doc rot.
- **Do NOT** invent claim numbers — every ledger row's `assertion` must be quotable from a real doc line anchor (see 0.1).

---

## Phase 1 — Stage 0: Grounding & Claim Ledger (cheap, no web)

**Goal:** Produce the machine-readable claim ledger that is the spine of the whole program.

**What to do (copy this structure, don't transform):**

1. Deep-read the load-bearing GTM docs. Phase 0.1 already anchors the headline numbers — extend that read to capture _every_ assertion that carries a verdict. Priority files: all three `monetization.md` + `ecosystem/monetization.md` + `_shared/pricing.md` + `_shared/decisions-log.md` + each `roadmap.md`. Pull cited code anchors via Serena/Read where a doc claims a feature is "built/shipped."
2. Fold in the Phase 0.3 prior-memory findings as starting evidence (cite the observation IDs).
3. **Output the claim ledger** at `docs/research/_work/claim-ledger.md` (create `docs/research/_work/` if absent). One row per claim, exact columns:

   `claim_id | product | dimension | assertion | stated_source | type | risk(1-5) | leverage(1-5) | checkability(1-5)`

   - `product ∈ {regroup, homegroups, detox-recovery, ecosystem}`
   - `dimension ∈ {market, pricing, projection, roadmap, regulatory, thesis}` (the six dimensions)
   - `type` mirrors dimension; `stated_source` is a real file line-anchor (e.g. `ecosystem/monetization.md:150-154`) or observation ID.
   - `assertion` must be quotable from the source — no paraphrase that changes a number.

**Coverage requirement:** the ledger must cover **6 dimensions × 4 scopes** = every cell has ≥1 claim. Aim ~40–80 rows total.

**Verification checklist:**

- [ ] `docs/research/_work/claim-ledger.md` exists with the exact 9 columns.
- [ ] Every one of the 6×4 dimension/scope cells has ≥1 row (grep each `dimension` value appears for each `product`).
- [ ] Every `stated_source` resolves to a real file+line or observation ID (spot-check 10 anchors against disk).
- [ ] The headline numbers from Phase 0.1 ($1.74M/$7.84M ecosystem, detox P50 $18,063, 26 SKUs, D-10/D-11, solo-founder, call ceiling) each appear as ledger rows.

**Anti-pattern guards:** no invented assertions; no rounding that drifts from source; `risk/leverage/checkability` are 1–5 integers with a one-clause rationale note allowed in a trailing column.

---

## Phase 2 — Stage 1: Triage & Human Gate (cheap)

**Goal:** Rank claims and get human approval before spending the web-research budget.

**What to do:**

1. Score each ledger row `priority = risk × leverage × checkability`.
2. Sort descending; select the top **15–30** claims as the proposed **deep-dive list**. Bias toward claims that are (a) quantitative projections, (b) regulatory (D-10 anti-kickback, D-11 IAP, HIPAA, Medicaid PSS), (c) the network-effect thesis, and (d) the three named GAPS in 0.3.
3. Write the proposed list to `docs/research/_work/deep-dive-list.md` (claim_id, assertion, priority score, why-it-matters, what-external-evidence-would-settle-it).
4. **GATE — STOP HERE.** Present the deep-dive list to the user via `AskUserQuestion` (or plain prompt) and ask them to approve / trim / add. **Do not proceed to Phase 3 until they respond.** Record the approved set back into `deep-dive-list.md` under an `## APPROVED` heading.

**Verification checklist:**

- [ ] `deep-dive-list.md` exists; 15–30 claims; each has a priority score and a "what evidence settles it" line.
- [ ] All three named GAPS (Medicaid PSS, detox IAP, 12-step treasurer WTP) and D-10/D-11 are present or explicitly deprioritized with reason.
- [ ] Execution paused for human approval; `## APPROVED` section written only after the user responds.

**Anti-pattern guards:** do not auto-approve; do not start any web search in this phase; the gate is mandatory (cost guardrail).

---

## Phase 3 — Stage 2: Deep Research (expensive — `Workflow`, balanced both-sides)

**PRECONDITION: Phase 2 `## APPROVED` list exists. If not, return to Phase 2.**

**Goal:** Each approved claim gets a sourced verdict via an anti-optimism research pipeline.

**What to do — author a `Workflow` script** that fans out by approved claim with capped concurrency, using a `pipeline` per claim:

`research` → `steelman + steelman-against` → `adversarial verification (independent skeptic)` → `verdict + confidence + cited sources`.

**Copy-ready Workflow shape (adapt counts to the approved list size):**

```js
export const meta = {
  name: "ecosystem-validation-research",
  description:
    "Anti-optimism deep research per approved claim → sourced verdicts",
  phases: [{ title: "Research" }, { title: "Verify" }],
};
// args = approved claims array: [{claim_id, product, dimension, assertion, stated_source}]
const VERDICT_SCHEMA = {
  /* claim_id, verdict ∈ validated|weak|broken|insufficient-evidence,
                            confidence ∈ high|medium|low, rationale, comparables[], sources[] (URLs) */
};
const results = await pipeline(
  args,
  (c) =>
    agent(
      `ANTI-OPTIMISM PROTOCOL. Default to disconfirmation — find the failure case.\n` +
        `Claim ${c.claim_id} (${c.product}/${c.dimension}): "${c.assertion}" (source: ${c.stated_source}).\n` +
        `Use firecrawl_search (primary), exa, WebSearch/WebFetch. Find REAL comparables (companies/products that tried this and what happened), market data, and regulatory text. ` +
        `Solo part-time-Y1→full-time-Y2 bootstrapped founder is a HARD constraint. ` +
        `Produce steelman AND steelman-against. Every quantitative verdict needs ≥1 EXTERNAL source (GTM docs / founder assumptions do not count and cap the claim at 'weak'). insufficient-evidence is valid.`,
      {
        label: `research:${c.claim_id}`,
        phase: "Research",
        schema: VERDICT_SCHEMA,
      },
    ),
  (review) =>
    agent(
      `Independent skeptic. Try to REFUTE this verdict for ${review.claim_id}. ` +
        `Check: are sources external and real? Is confidence justified? Does the solo-founder constraint break it? ` +
        `Return adjusted {verdict, confidence, rationale, sources}.`,
      {
        label: `verify:${review.claim_id}`,
        phase: "Verify",
        schema: VERDICT_SCHEMA,
      },
    ),
).then((r) => r); // pipeline handles per-item independence
const confirmed = results.filter(Boolean);
return { confirmed };
```

- Prefer **comparables-dense, few-but-deep** agents over broad shallow fan-out (cost guardrail).
- Inject the full anti-optimism protocol (0.4) into every agent prompt.
- Write per-claim verdict records to `docs/research/_work/verdicts.md` (or have the workflow return them and the orchestrator appends).

**Cost guardrails:** A prior session spent ~$117. Treat Stage 2 budget explicitly; `log()` spend checkpoints. If the user gave a `+Nk` budget, guard the fan-out on `budget.remaining()`. Report total spend at phase end.

**Verification checklist:**

- [ ] Every approved claim has a verdict ∈ {validated, weak, broken, insufficient-evidence} + explicit confidence + rationale.
- [ ] Every _quantitative_ verdict cites ≥1 external URL (grep verdicts for `http`); self-cited-only verdicts are capped at `weak`.
- [ ] At least one real-world comparable named per market/pricing/projection claim.
- [ ] Spend reported.

**Anti-pattern guards:** no verdict without a source line; no optimism-by-default; do not skip the adversarial verify step; do not invent comparables — name real companies/programs with URLs.

---

## Phase 4 — Stage 3: Synthesis (the single deliverable)

**Goal:** Write the one document the whole program exists to produce.

**What to do — write `docs/research/2026-06-10-recovery-ecosystem-validation.md`** (use the actual run date) with exactly three sections:

1. **Scored validation report** — per-claim verdicts grouped by the six dimensions, each with confidence + cited sources; a consolidated **risk register**; a per-product and ecosystem-level **feasibility verdict**.
2. **Decision matrix** — each product/initiative (regroup, homegroups, detox-recovery, recovery-api/ecosystem) scored on **feasibility × risk-adjusted return**, with critically-reasoned (non-optimistic) rationale → a recommended **build/monetize sequence** (which to bet on first, and why).
3. **Doc-revision prompt** — a structured, self-contained prompt (consumable by a future `/superpowers:writing-plans` or `/claude-mem:make-plan` run) enumerating exactly which GTM claims to correct / soften / flag, keyed by `claim_id` and file line-anchor, so the fixes become their own controlled task — **not** edited here.

**Verification checklist:**

- [ ] Deliverable file exists at `docs/research/<rundate>-recovery-ecosystem-validation.md` with all three sections present.
- [ ] Section 1 covers all six dimensions and yields a feasibility verdict per product + ecosystem.
- [ ] Section 2's sequence recommendation is defensible and explicitly non-optimistic (names the risks that could break the #1 bet).
- [ ] Section 3 lists concrete claims to fix with file+line anchors and is self-contained (a fresh session could act on it without this report).

**Anti-pattern guards:** do not edit any `docs/go-to-market/**` file; the revision is a _prompt_, not edits. Do not soften verdicts for narrative flow — carry the confidence/sources through from Phase 3.

---

## Phase 5 — Verification & Memory (close-out)

**Goal:** Prove Definition of Done; persist findings.

**What to do:**

1. Walk the spec's Definition of Done against the deliverable:
   - Claim ledger covers 6 dimensions × 4 scopes ✔
   - Every deep-dive claim has verdict + confidence + ≥1 external citation (or explicit `insufficient-evidence`) ✔
   - Single deliverable has all three sections + a defensible non-optimistic sequence ✔
2. Grep guards: search the deliverable + verdicts for any quantitative verdict lacking an `http` source; search for any accidental edit to `docs/go-to-market/**` (`git status` should show no GTM-doc changes).
3. Record new viability findings to claude-mem (`observation_add` / `/claude-mem:mem-search` write path): top verdicts, the recommended sequence, and any GAP that stayed `insufficient-evidence`.

**Verification checklist:**

- [ ] `git status` shows new files only under `docs/research/**` (+ this plan) — zero changes to `docs/go-to-market/**`.
- [ ] No quantitative verdict in the deliverable lacks an external citation.
- [ ] New findings written to claude-mem (note observation IDs).
- [ ] Spend across Phase 3 reported in the close-out.

---

## Execution order summary

1. **Phase 1** (cheap) — build claim ledger → `docs/research/_work/claim-ledger.md`
2. **Phase 2** (cheap) — triage + **HUMAN GATE** → `docs/research/_work/deep-dive-list.md`
3. **Phase 3** (expensive, gated) — `Workflow` deep research → `docs/research/_work/verdicts.md`
4. **Phase 4** — synthesis → `docs/research/<rundate>-recovery-ecosystem-validation.md`
5. **Phase 5** — verify DoD + write to claude-mem

Resume prompt for a fresh session: _"Read `docs/superpowers/plans/2026-06-10-recovery-ecosystem-validation.md` and execute it. Start at Phase 1, stop at the Phase 2 gate for my approval before Phase 3."_
