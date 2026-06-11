# Design Spec — Recovery Ecosystem Business-Validation Program

**Date:** 2026-06-10
**Status:** approved design, ready for planning
**Author:** brainstorming session (to be executed in a fresh session)

---

## How to resume this in a NEW session (read this first)

A fresh session needs only three things — all already on disk / persistent:

1. **This spec** — the full design below.
2. **The PR #14 docs** — `docs/go-to-market/**` (17 files: monetization/roadmap/project-management for `regroup`, `homegroups`, `detox-recovery`, plus `ecosystem/`; `_shared/pricing.md` with 26 SKUs + a 3-scenario projections table; `_shared/decisions-log.md`). These are the validation TARGET.
3. **claude-mem** — prior observations on Regroup product-market fit, detox monetization blockers, and ecosystem viability persist across sessions (`/claude-mem:mem-search` or the `mem-search` skill).

**Resume prompt to paste into the new session:**

> Read `docs/superpowers/specs/2026-06-10-recovery-ecosystem-validation-design.md` and execute it. Start with Stage 0 (grounding + claim ledger), then Stage 1 (triage), and STOP at the gate for my approval of the deep-dive list before running Stage 2.

The next planning step (per the brainstorming → writing-plans flow) is to turn this spec into a phased implementation plan (`/superpowers:writing-plans` or `/claude-mem:make-plan`). That plan breaks Stages 0–3 into detailed, executable chunks.

---

## Goal

Validate — **realistically, grounded, and critically, without optimism bias** — whether the recovery-platform ecosystem documented in PR #14 is a feasible, achievable, sustainable business. Optimize the analysis to inform **prioritization & sequencing**: which product to bet on first, and the most defensible build/monetize order.

## Decisions locked (from brainstorming)

| Decision             | Choice                                                                                                                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary purpose      | **Prioritization / sequencing** (not pure go/no-go)                                                                                                                                                               |
| Research stance      | **Balanced both-sides** (steelman + steelman-against → verdict + confidence)                                                                                                                                      |
| Depth / cost posture | **Phased**: cheap triage first, expensive research only on approved high-risk/high-leverage claims, **human gate** before the expensive pass                                                                      |
| Deliverable          | **One document** containing: (1) scored validation report, (2) decision matrix (feasibility × risk-adjusted return) with critically-reasoned rationale, (3) a doc-revision _prompt_ a later spec/plan can consume |

## Non-negotiable posture (the most important requirement)

**Realistic, grounded, critical thinking — not over-optimism.** Encoded as an anti-optimism protocol applied to every research agent:

- **Default to disconfirmation.** Agents must actively search for the failure case: the dead comparable, the regulatory blocker, the projection that breaks against real data.
- **Sourcing gate.** Unsourced or self-cited (cites only the GTM docs / the founder's own assumptions) claims are capped at **`weak`** regardless of plausibility. Every _quantitative_ verdict needs ≥1 **external** source. Cite every source.
- **Solo-founder reality is a hard constraint.** The docs state a solo, part-time-Year-1 → full-time-Year-2, bootstrapped founder. "Achievable by a funded team" ≠ achievable here. Apply this to every roadmap/capacity/timeline claim.
- **`insufficient-evidence` is a valid, encouraged verdict.** Do not manufacture confidence.
- **Confidence is always explicit** (high / medium / low) with the reason.

## Chosen approach

**Claim-ledger spine + comparables as primary evidence + dimensions as the report's structure.**

- _Claim ledger_ keeps every verdict traceable to a specific assertion and its stated source.
- _Comparables_ (real companies/products that tried similar things — and what happened to them) are the primary evidence type, because projection/pricing realism lives or dies on them.
- _Dimensions_ organize the final report for a reader.

Rejected: dimension-first sweep (verdicts drift to narrative, untraceable to specific numbers); comparables-only (too narrow on regulatory + solo-founder roadmap feasibility).

## The six validation dimensions (per product + ecosystem)

1. **Market demand & TAM defensibility** — is the stated TAM/SAM real and reachable; is there evidenced demand?
2. **Pricing vs. willingness-to-pay** — do the `_shared/pricing.md` SKUs survive comparison to what this segment actually pays?
3. **Revenue-projection credibility** — unit economics, CAC/LTV, conversion & churn assumptions vs. comparables; do the P10/P50/P90 figures and the combined ARR ($1.74M / $7.84M three-year scenarios) hold up?
4. **Roadmap achievability under solo-founder capacity** — technical feasibility + realistic timeline for one part-time builder.
5. **Regulatory feasibility** — HIPAA/BAA surface; **anti-kickback / patient-brokering** exposure for the recovery-api referral bus (D-10); VA Community Care / Medicaid PSS billing realism; app-store IAP vs web billing (D-11).
6. **Cross-app network-effect / ASAM-continuum thesis** — does "no competitor connects detox → sober living → 12-step" actually create defensible network effects, or is it three independent products wearing a trench coat?

## Execution stages

### Stage 0 — Grounding (cheap, no web)

Deep-read all 17 GTM docs + `pricing.md` + `decisions-log.md` + the cited code anchors, and pull relevant `claude-mem` prior findings. Confirm understanding of goals. **Output: the claim ledger** — a machine-readable table:

`claim_id | product | dimension | assertion | stated_source | type | risk(1-5) | leverage(1-5) | checkability(1-5)`

where `type ∈ {market, pricing, projection, roadmap, regulatory, thesis}`.

### Stage 1 — Triage & gate (cheap)

Rank claims by `risk × leverage × checkability`. Produce the proposed **deep-dive list** (~15–30 top claims). **GATE: present the list to the user; do not spend the expensive research budget until they approve/trim it.**

### Stage 2 — Deep research (expensive; dynamic `Workflow`, balanced both-sides)

Per approved claim, a pipeline:
`research (web: firecrawl_search primary, exa, WebSearch/WebFetch — find comparables, market data, regulatory text)` → `steelman + steelman-against` → `adversarial verification (independent skeptic)` → `verdict {validated | weak | broken | insufficient-evidence} + confidence + cited sources`.

Fan-out by claim with capped concurrency. The anti-optimism protocol is injected into every agent prompt. Verdicts must cite external sources.

### Stage 3 — Synthesis (the single deliverable document)

Write `docs/research/2026-XX-XX-recovery-ecosystem-validation.md` (date stamped at run time) containing:

1. **Scored validation report** — per-claim verdicts grouped by dimension, each with confidence + cited sources; a consolidated **risk register**; a per-product and ecosystem-level **feasibility verdict**.
2. **Decision matrix** — each product/initiative scored on **feasibility × risk-adjusted return**, with critically-reasoned rationale → a recommended **build/monetize sequence**.
3. **Doc-revision prompt** — a structured, self-contained prompt (consumable by a future `/superpowers:writing-plans` or `/claude-mem:make-plan` run) enumerating exactly which GTM claims to correct / soften / flag, so the fixes become their own controlled task rather than ad-hoc edits.

## Tools

- **Web research:** `firecrawl_search` (primary per MCP guidance), `exa` web search/fetch, `WebSearch`/`WebFetch` as fallback.
- **Orchestration:** the `Workflow` tool (dynamic multi-agent fan-out) for Stage 2; `Agent` for one-off sub-tasks.
- **Memory:** `claude-mem` (`mem-search`) for prior viability findings; record new findings back to memory at the end.
- **Codebase:** Serena symbolic tools / Read to confirm code-anchored claims (e.g., is a "built" feature actually built).

## Cost guardrails

- Stages 0–1 are cheap (no web fan-out). The expensive Stage 2 runs **only after the user approves the deep-dive list**.
- Prefer comparables-dense, few-but-deep research agents over broad shallow fan-out.
- A prior session already spent ~$117; treat Stage 2 budget explicitly and report spend.

## Out of scope

- Building/altering product features.
- Editing the GTM docs in this effort (those edits are deferred to the **doc-revision prompt** deliverable, run as a separate controlled task).
- Re-validating pre-existing broken links / doc rot unrelated to business feasibility.

## Definition of done

- Claim ledger exists and covers all six dimensions × four scopes.
- Every deep-dive claim has a verdict + confidence + ≥1 external citation (or an explicit `insufficient-evidence`).
- The single deliverable document contains all three sections, with a defensible, non-optimistic sequencing recommendation.
- New viability findings recorded to claude-mem.
